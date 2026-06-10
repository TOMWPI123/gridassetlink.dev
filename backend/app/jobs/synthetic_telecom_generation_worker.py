from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.database import engine
from app.services.gis_vector_tiles import is_postgis_engine


@dataclass(frozen=True)
class WorkerRunResult:
    job_key: str | None
    status: str
    message: str
    inserted_poles: int = 0
    inserted_spans: int = 0


def run_next_generation_job(job_key: str | None = None, max_batches: int | None = None) -> WorkerRunResult:
    if not is_postgis_engine(engine):
        return WorkerRunResult(job_key, "skipped", "PostGIS is required for GIS-scale synthetic generation.")

    with engine.connect() as connection:
        with connection.begin():
            job = _claim_job(connection, job_key)
            if not job:
                return WorkerRunResult(job_key, "idle", "No queued generation job was available.")

            territory_id = int(job["service_territory_id"])
            _ensure_partitions(connection, territory_id)
            _log_step(connection, job["job_key"], "clipping_public_roads")
            road_count = _prepare_generation_roads(connection, job)
            if road_count == 0:
                _finish_job(connection, job["job_key"], "failed", "no_eligible_roads")
                return WorkerRunResult(job["job_key"], "failed", "No eligible public road centerlines intersected the service territory.")

            _log_step(connection, job["job_key"], "creating_fiber_route_records")
            _insert_fiber_routes(connection, job)
            _log_step(connection, job["job_key"], "creating_synthetic_service_routes")
            _insert_circuit_routes(connection, job)

        territory_id = int(job["service_territory_id"])
        batch_size = int(job["batch_size"] or 50_000)
        target_poles = int(job["target_pole_count"])
        record_batch_id = int(job.get("next_record_batch_id") or 0)
        batch_number = int(job.get("completed_batch_count") or 0)
        batches_this_run = 0
        total_inserted_poles = int(job.get("inserted_pole_count") or 0)
        total_inserted_spans = int(job.get("inserted_span_count") or 0)

        while total_inserted_poles < target_poles:
            if max_batches is not None and batches_this_run >= max_batches:
                with connection.begin():
                    _pause_job(connection, job["job_key"], "paused_after_max_batches")
                return WorkerRunResult(job["job_key"], "paused", "Generation job paused after max_batches.", total_inserted_poles, total_inserted_spans)

            with connection.begin():
                control_status = _job_control_status(connection, job["job_key"])
                if control_status == "cancelled":
                    return WorkerRunResult(job["job_key"], "cancelled", "Generation job was cancelled.", total_inserted_poles, total_inserted_spans)
                if control_status == "paused":
                    _log_step(connection, job["job_key"], "paused_by_operator")
                    return WorkerRunResult(job["job_key"], "paused", "Generation job was paused.", total_inserted_poles, total_inserted_spans)

                _log_step(connection, job["job_key"], f"generating_batch_{batch_number + 1}")
                inserted_poles = _insert_pole_batch(connection, job, record_batch_id)
                if inserted_poles == 0:
                    break
                inserted_spans = _insert_span_batch(connection, job, record_batch_id)
                _insert_strands_and_attachments(connection, job, record_batch_id)
                _insert_splice_slack_and_mux_points(connection, job, record_batch_id)
                if _should_build_full_network_graph(job):
                    _insert_network_graph(connection, job, record_batch_id)
                _update_progress(
                    connection,
                    job,
                    total_inserted_poles + inserted_poles,
                    total_inserted_spans + inserted_spans,
                    record_batch_id + 1,
                    batch_number + 1,
                )

            total_inserted_poles += inserted_poles
            total_inserted_spans += inserted_spans
            record_batch_id += 1
            batch_number += 1
            batches_this_run += 1

        with connection.begin():
            _log_step(connection, job["job_key"], "precomputing_vector_tile_lod_tables")
            _precompute_lod_tables(connection, territory_id)
            _mark_territory_tiles_dirty(connection, territory_id, "synthetic generation completed")
            _mark_trace_cache_dirty(connection, f"synthetic generation completed for territory {territory_id}")
            _refresh_territory_summary(connection, territory_id, job["job_key"])
            _finish_job(connection, job["job_key"], "completed", "generation_complete")
        return WorkerRunResult(job["job_key"], "completed", "Synthetic telecom generation completed.", total_inserted_poles, total_inserted_spans)


def _claim_job(connection: Connection, job_key: str | None) -> dict[str, Any] | None:
    selector = "job_key = :job_key AND job_status = 'queued'" if job_key else "job_status = 'queued'"
    params = {"job_key": job_key} if job_key else {}
    row = connection.execute(
        text(
            f"""
            SELECT *
            FROM synthetic_generation_jobs
            WHERE {selector}
            ORDER BY requested_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """
        ),
        params,
    ).mappings().first()
    if not row:
        return None
    job = dict(row)
    connection.execute(
        text(
            """
            UPDATE synthetic_generation_jobs
            SET job_status = 'running',
                started_at = COALESCE(started_at, now()),
                current_step = 'claimed_by_background_worker',
                log_json = log_json || jsonb_build_array('claimed_by_background_worker')
            WHERE job_key = :job_key
            """
        ),
        {"job_key": job["job_key"]},
    )
    return job


def _ensure_partitions(connection: Connection, territory_id: int) -> None:
    if territory_id < 1:
        raise ValueError("service territory id must be positive")
    connection.execute(text(f"CREATE TABLE IF NOT EXISTS telecom_poles_t{territory_id} PARTITION OF telecom_poles FOR VALUES IN ({territory_id})"))
    connection.execute(text(f"CREATE TABLE IF NOT EXISTS telecom_spans_t{territory_id} PARTITION OF telecom_spans FOR VALUES IN ({territory_id})"))


def _prepare_generation_roads(connection: Connection, job: dict[str, Any]) -> int:
    connection.execute(text("DROP TABLE IF EXISTS generation_job_roads"))
    connection.execute(
        text(
            """
            CREATE TEMP TABLE generation_job_roads ON COMMIT PRESERVE ROWS AS
            WITH territory AS (
              SELECT id, geom FROM service_territories WHERE id = :territory_id
            ),
            candidate_roads AS (
              SELECT
                r.road_id,
                r.road_name,
                r.placement_class,
                r.road_class,
                CASE
                  WHEN r.service_territory_id = territory.id THEN r.geom
                  ELSE ST_CollectionExtract(ST_Intersection(r.geom, territory.geom), 2)
                END AS geom
              FROM public_road_centerlines r, territory
              WHERE r.excluded = FALSE
                AND (
                  r.service_territory_id = territory.id
                  OR (
                    r.geom && territory.geom
                    AND ST_Intersects(r.geom, territory.geom)
                  )
                )
            ),
            clipped AS (
              SELECT
                road_id,
                road_name,
                placement_class,
                road_class,
                (ST_Dump(ST_CollectionExtract(geom, 2))).geom AS geom
              FROM candidate_roads
            ),
            measured AS (
              SELECT
                road_id,
                road_name,
                placement_class,
                road_class,
                geom,
                ST_Transform(geom, 3857) AS geom_3857,
                ST_Length(ST_Transform(geom, 3857)) / 0.3048 AS length_ft,
                CASE
                  WHEN CAST(:target_pole_count AS bigint) >= 10000000
                    THEN CASE placement_class WHEN 'urban' THEN 100 WHEN 'rural' THEN 200 ELSE 145 END
                  ELSE CASE placement_class WHEN 'urban' THEN 110 WHEN 'rural' THEN 220 ELSE 155 END
                END AS spacing_ft,
                CASE placement_class WHEN 'urban' THEN 14 WHEN 'rural' THEN 35 ELSE 24 END AS row_offset_ft
              FROM clipped
              WHERE NOT ST_IsEmpty(geom)
                AND ST_Length(ST_Transform(geom, 3857)) / 0.3048 >= 120
            ),
            estimated AS (
              SELECT
                *,
                GREATEST(2, floor(length_ft / NULLIF(spacing_ft, 0))::bigint + 1) AS estimated_pole_count,
                GREATEST(1, floor(length_ft / NULLIF(spacing_ft, 0))::bigint) AS estimated_span_count
              FROM measured
            ),
            ordered AS (
              SELECT
                row_number() OVER (ORDER BY road_id, ST_Length(geom)) AS road_batch_id,
                COALESCE(
                  sum(estimated_pole_count) OVER (
                    ORDER BY road_id, ST_Length(geom)
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                  ),
                  0
                ) AS estimated_poles_before,
                *
              FROM estimated
            )
            SELECT
              road_batch_id,
              (estimated_poles_before / GREATEST(CAST(:batch_size AS bigint), 1))::bigint AS record_batch_id,
              road_id,
              road_name,
              placement_class,
              road_class,
              geom,
              geom_3857,
              length_ft,
              spacing_ft,
              row_offset_ft,
              estimated_pole_count,
              estimated_span_count
            FROM ordered
            """
        ),
        {
            "territory_id": job["service_territory_id"],
            "batch_size": job.get("batch_size") or 50_000,
            "target_pole_count": job.get("target_pole_count") or 0,
        },
    )
    return int(connection.execute(text("SELECT count(*) FROM generation_job_roads")).scalar() or 0)


def _should_build_full_network_graph(job: dict[str, Any]) -> bool:
    attachment_profile = str(job.get("attachment_profile") or "")
    if "full_graph" in attachment_profile:
        return True
    return int(job.get("target_pole_count") or 0) < 10_000_000


def _insert_fiber_routes(connection: Connection, job: dict[str, Any]) -> None:
    connection.execute(
        text(
            """
            INSERT INTO fiber_routes (
              fiber_route_id, service_territory_id, route_name, route_type,
              asset_status, synthetic, display_class, fiber_count, criticality,
              geom, geom_3857, properties
            )
            SELECT DISTINCT ON (road_id)
              'FIBER-' || :territory_id || '-' || road_id,
              :territory_id,
              COALESCE(road_name, road_id) || ' synthetic fiber route',
              'ADSS_distribution',
              'synthetic',
              TRUE,
              'fiber_route',
              48,
              'normal',
              ST_LineMerge(ST_Collect(geom)),
              ST_Transform(ST_LineMerge(ST_Collect(geom)), 3857),
              jsonb_build_object('source', 'synthetic-generation-worker', 'road_id', road_id, 'synthetic', true)
            FROM generation_job_roads
            GROUP BY road_id, road_name
            ON CONFLICT (fiber_route_id) DO NOTHING
            """
        ),
        {"territory_id": job["service_territory_id"]},
    )


def _insert_circuit_routes(connection: Connection, job: dict[str, Any]) -> None:
    connection.execute(
        text(
            """
            INSERT INTO circuit_routes (
              circuit_route_id, service_territory_id, route_name, route_type,
              asset_status, synthetic, display_class, fiber_count, criticality,
              geom, geom_3857, properties
            )
            WITH selected_routes AS (
              SELECT
                fiber_route_id,
                route_name,
                service_territory_id,
                geom,
                geom_3857,
                row_number() OVER (ORDER BY fiber_route_id) AS service_index
              FROM fiber_routes
              WHERE service_territory_id = :territory_id
                AND geom IS NOT NULL
                AND mod(abs(hashtextextended(CAST(:seed AS text) || fiber_route_id, 0)), 25) = 0
              ORDER BY fiber_route_id
              LIMIT 25000
            ),
            service_types AS (
              SELECT
                *,
                (ARRAY[
                  'SCADA',
                  'Distribution_Automation',
                  'SEL_ICON_Backhaul',
                  'Protection_DTT',
                  'Protection_C37_94',
                  'Ethernet',
                  'RTU_Backhaul',
                  'Recloser_Aggregation',
                  'AMI_Backhaul',
                  'Engineering_Access',
                  'Fiber_Monitoring',
                  'MPLS_TP'
                ])[1 + mod(service_index - 1, 12)] AS service_type
              FROM selected_routes
            ),
            shaped AS (
              SELECT
                *,
                CASE
                  WHEN service_type IN ('Protection_DTT', 'Protection_C37_94') THEN 'critical'
                  WHEN service_type IN ('SCADA', 'Distribution_Automation', 'RTU_Backhaul') THEN 'high'
                  ELSE 'normal'
                END AS service_criticality,
                CASE
                  WHEN service_type IN ('Ethernet', 'MPLS_TP') THEN 4
                  WHEN service_type IN ('Fiber_Monitoring', 'Engineering_Access') THEN 1
                  ELSE 2
                END AS assigned_fiber_count
              FROM service_types
            )
            SELECT
              'SYN-SERVICE-' || :territory_id || '-' || lpad(service_index::text, 6, '0'),
              service_territory_id,
              service_type || ' synthetic service on ' || route_name,
              'synthetic_service_route',
              'synthetic',
              TRUE,
              'circuit_route',
              assigned_fiber_count,
              service_criticality,
              geom,
              geom_3857,
              jsonb_build_object(
                'source', 'synthetic-generation-worker',
                'synthetic', true,
                'service_type', service_type,
                'service_status', CASE WHEN mod(service_index, 5) = 0 THEN 'planned' ELSE 'in_service_synthetic' END,
                'fiber_assignment_status', CASE WHEN mod(service_index, 7) = 0 THEN 'reserved' ELSE 'assigned' END,
                'carried_by_fiber_route_id', fiber_route_id,
                'fiber_route_name', route_name,
                'strand_pair_count', assigned_fiber_count,
                'criticality', service_criticality,
                'service_id', 'SVC-' || :territory_id || '-' || lpad(service_index::text, 6, '0'),
                'planning_boundary', 'synthetic demo service; not operational telecom data',
                'module_visibility', jsonb_build_array('Dashboard', 'Distribution Fiber', 'Fiber Trace', 'Outage Impact', 'Circuits')
              )
            FROM shaped
            ON CONFLICT (circuit_route_id)
            DO UPDATE SET
              route_name = EXCLUDED.route_name,
              route_type = EXCLUDED.route_type,
              asset_status = EXCLUDED.asset_status,
              fiber_count = EXCLUDED.fiber_count,
              criticality = EXCLUDED.criticality,
              geom = EXCLUDED.geom,
              geom_3857 = EXCLUDED.geom_3857,
              properties = circuit_routes.properties || EXCLUDED.properties,
              updated_at = now()
            """
        ),
        {"territory_id": job["service_territory_id"], "seed": job["seed"]},
    )


def _insert_pole_batch(connection: Connection, job: dict[str, Any], record_batch_id: int) -> int:
    result = connection.execute(
        text(
            """
            WITH roads AS (
              SELECT *
              FROM generation_job_roads
              WHERE record_batch_id = :record_batch_id
            ),
            sampled AS (
              SELECT
                road_id,
                road_name,
                placement_class,
                road_batch_id,
                row_offset_ft,
                spacing_ft,
                generate_series(0, GREATEST(1, floor(length_ft / spacing_ft)::int)) AS sequence_index,
                geom_3857
              FROM roads
            ),
            sampled_with_fraction AS (
              SELECT
                *,
                LEAST(1, (sequence_index * spacing_ft * 0.3048) / NULLIF(ST_Length(geom_3857), 0)) AS fraction,
                CASE WHEN mod(abs(('x' || substr(md5(:seed || road_id), 1, 8))::bit(32)::int), 2) = 0 THEN 1 ELSE -1 END AS side_sign
              FROM sampled
            ),
            placed AS (
              SELECT
                'POLE-' || :territory_id || '-' || road_id || '-' || lpad(sequence_index::text, 6, '0') AS pole_id,
                :territory_id AS service_territory_id,
                :job_id AS generation_job_id,
                road_id AS road_source_id,
                road_name,
                sequence_index,
                placement_class,
                CASE WHEN side_sign = 1 THEN 'right' ELSE 'left' END AS road_side,
                side_sign * row_offset_ft AS signed_offset_ft,
                row_offset_ft,
                spacing_ft,
                side_sign,
                ST_LineInterpolatePoint(geom_3857, fraction) AS base_point,
                ST_Azimuth(
                  ST_LineInterpolatePoint(geom_3857, GREATEST(0, fraction - 0.0005)),
                  ST_LineInterpolatePoint(geom_3857, LEAST(1, fraction + 0.0005))
                ) AS local_azimuth
              FROM sampled_with_fraction
            ),
            points AS (
              SELECT
                pole_id,
                service_territory_id,
                generation_job_id,
                road_source_id,
                road_name,
                sequence_index,
                placement_class,
                road_side,
                signed_offset_ft,
                row_offset_ft,
                spacing_ft,
                ST_Transform(
                  ST_Translate(
                    base_point,
                    sin(COALESCE(local_azimuth, 0) + side_sign * pi() / 2) * row_offset_ft * 0.3048,
                    cos(COALESCE(local_azimuth, 0) + side_sign * pi() / 2) * row_offset_ft * 0.3048
                  ),
                  4326
                ) AS geom
              FROM placed
            ),
            clipped_points AS (
              SELECT points.*
              FROM points
              JOIN service_territories territory ON territory.id = points.service_territory_id
              WHERE ST_Covers(territory.geom, points.geom)
            )
            INSERT INTO telecom_poles (
              pole_id, service_territory_id, generation_job_id, road_source_id, road_name,
              road_milepost, road_side, sequence_index, placement_class, pole_role, asset_status,
              synthetic, support_type, height_ft, row_offset_ft, display_class, geom, geom_3857, properties
            )
            SELECT
              pole_id, service_territory_id, generation_job_id, road_source_id, road_name,
              (sequence_index * spacing_ft) / 5280.0, road_side, sequence_index, placement_class,
              'distribution_backbone', 'synthetic', TRUE, 'distribution_pole',
              CASE placement_class WHEN 'urban' THEN 40 WHEN 'rural' THEN 45 ELSE 40 END,
              abs(signed_offset_ft), 'pole', geom, ST_Transform(geom, 3857),
              jsonb_build_object('source', 'synthetic-generation-worker', 'street_based', true, 'synthetic', true)
            FROM clipped_points
            WHERE NOT EXISTS (SELECT 1 FROM telecom_poles existing WHERE existing.pole_id = clipped_points.pole_id)
            """
        ),
        {
            "territory_id": job["service_territory_id"],
            "job_id": job["id"],
            "seed": job["seed"],
            "record_batch_id": record_batch_id,
        },
    )
    return max(0, result.rowcount or 0)


def _insert_span_batch(connection: Connection, job: dict[str, Any], record_batch_id: int) -> int:
    result = connection.execute(
        text(
            """
            WITH roads AS (
              SELECT road_id
              FROM generation_job_roads
              WHERE record_batch_id = :record_batch_id
            ),
            ordered AS (
              SELECT
                pole_id,
                lead(pole_id) OVER (PARTITION BY road_source_id ORDER BY sequence_index) AS next_pole_id,
                geom,
                lead(geom) OVER (PARTITION BY road_source_id ORDER BY sequence_index) AS next_geom,
                road_source_id
              FROM telecom_poles
              WHERE service_territory_id = :territory_id
                AND generation_job_id = :job_id
                AND road_source_id IN (SELECT road_id FROM roads)
            ),
            spans AS (
              SELECT
                'SPAN-' || :territory_id || '-' || road_source_id || '-' || pole_id AS span_id,
                road_source_id,
                pole_id AS a_pole_id,
                next_pole_id AS z_pole_id,
                ST_MakeLine(geom, next_geom)::geometry(LineString, 4326) AS geom
              FROM ordered
              WHERE next_pole_id IS NOT NULL
            ),
            clipped_spans AS (
              SELECT spans.*
              FROM spans
              JOIN service_territories territory ON territory.id = :territory_id
              WHERE ST_Covers(territory.geom, spans.geom)
            )
            INSERT INTO telecom_spans (
              span_id, service_territory_id, generation_job_id, a_pole_id, z_pole_id,
              span_type, asset_status, synthetic, length_ft, fiber_route_id,
              display_class, geom, geom_3857, properties
            )
            SELECT
              span_id, :territory_id, :job_id, a_pole_id, z_pole_id,
              'telecom_strand', 'synthetic', TRUE,
              ST_Length(ST_Transform(geom, 3857)) / 0.3048,
              'FIBER-' || :territory_id || '-' || road_source_id,
              'span', geom, ST_Transform(geom, 3857),
              jsonb_build_object('source', 'synthetic-generation-worker', 'synthetic', true)
            FROM clipped_spans
            WHERE NOT EXISTS (SELECT 1 FROM telecom_spans existing WHERE existing.span_id = clipped_spans.span_id)
            """
        ),
        {"territory_id": job["service_territory_id"], "job_id": job["id"], "record_batch_id": record_batch_id},
    )
    return max(0, result.rowcount or 0)


def _insert_strands_and_attachments(connection: Connection, job: dict[str, Any], record_batch_id: int) -> None:
    params = {"territory_id": job["service_territory_id"], "job_id": job["id"], "record_batch_id": record_batch_id}
    connection.execute(
        text(
            """
            WITH roads AS (
              SELECT road_id
              FROM generation_job_roads
              WHERE record_batch_id = :record_batch_id
            )
            INSERT INTO telecom_strands (
              strand_id, service_territory_id, generation_job_id, span_id, fiber_route_id,
              attachment_type, asset_status, synthetic, display_class, geom, geom_3857, properties
            )
            SELECT
              'STRAND-' || span_id,
              service_territory_id,
              generation_job_id,
              span_id,
              fiber_route_id,
              'messenger_strand',
              'synthetic',
              TRUE,
              'telecom_strand',
              geom,
              geom_3857,
              jsonb_build_object('source', 'synthetic-generation-worker', 'strand_role', 'ADSS support')
            FROM telecom_spans
            WHERE service_territory_id = :territory_id
              AND generation_job_id = :job_id
              AND fiber_route_id IN (
                SELECT 'FIBER-' || :territory_id || '-' || road_id
                FROM roads
              )
            ON CONFLICT (strand_id) DO NOTHING
            """
        ),
        params,
    )
    connection.execute(
        text(
            """
            WITH roads AS (
              SELECT road_id
              FROM generation_job_roads
              WHERE record_batch_id = :record_batch_id
            )
            INSERT INTO fiber_cable_attachments (
              attachment_id, service_territory_id, generation_job_id, pole_id, fiber_route_id,
              attachment_type, asset_status, synthetic, display_class, geom, geom_3857, properties
            )
            SELECT
              'ATTACH-' || pole_id,
              service_territory_id,
              generation_job_id,
              pole_id,
              'FIBER-' || service_territory_id || '-' || road_source_id,
              'ADSS_attachment',
              'synthetic',
              TRUE,
              'fiber_attachment',
              geom,
              geom_3857,
              jsonb_build_object('source', 'synthetic-generation-worker', 'synthetic', true)
            FROM telecom_poles
            WHERE service_territory_id = :territory_id
              AND generation_job_id = :job_id
              AND road_source_id IN (SELECT road_id FROM roads)
            ON CONFLICT (attachment_id) DO NOTHING
            """
        ),
        params,
    )


def _insert_splice_slack_and_mux_points(connection: Connection, job: dict[str, Any], record_batch_id: int) -> None:
    params = {"territory_id": job["service_territory_id"], "job_id": job["id"], "record_batch_id": record_batch_id}
    for table_name, id_column, prefix, modulus, display_class in [
        ("splice_cases", "splice_case_id", "SPLICE", 24, "splice_case"),
        ("slack_loops", "slack_loop_id", "SLACK", 18, "slack_loop"),
        ("handholes", "handhole_id", "HH", 40, "handhole"),
        ("mux_sites", "mux_site_id", "MUX", 75, "mux_site"),
    ]:
        connection.execute(
            text(
                f"""
                WITH roads AS (
                  SELECT road_id
                  FROM generation_job_roads
                  WHERE record_batch_id = :record_batch_id
                )
                INSERT INTO {table_name} (
                  {id_column}, service_territory_id, asset_status, synthetic, display_class,
                  route_id, pole_id, geom, geom_3857, properties
                )
                SELECT
                  '{prefix}-' || pole_id,
                  service_territory_id,
                  'synthetic',
                  TRUE,
                  '{display_class}',
                  'FIBER-' || service_territory_id || '-' || road_source_id,
                  pole_id,
                  geom,
                  geom_3857,
                  jsonb_build_object('source', 'synthetic-generation-worker', 'street_based', true, 'synthetic', true)
                FROM telecom_poles
                WHERE service_territory_id = :territory_id
                  AND generation_job_id = :job_id
                  AND road_source_id IN (SELECT road_id FROM roads)
                  AND mod(sequence_index, {modulus}) = 0
                ON CONFLICT ({id_column}) DO NOTHING
                """
            ),
            params,
        )


def _insert_network_graph(connection: Connection, job: dict[str, Any], record_batch_id: int) -> None:
    params = {
        "territory_id": job["service_territory_id"],
        "job_id": job["id"],
        "record_batch_id": record_batch_id,
    }
    connection.execute(
        text(
            """
            WITH roads AS (
              SELECT road_id
              FROM generation_job_roads
              WHERE record_batch_id = :record_batch_id
            )
            INSERT INTO network_nodes (
              node_id, service_territory_id, node_type, asset_id, geom, properties
            )
            SELECT
              pole_id,
              service_territory_id,
              'telecom_pole',
              pole_id,
              geom,
              jsonb_build_object(
                'source', 'synthetic-generation-worker',
                'asset_type', 'telecom_pole',
                'fiber_route_id', 'FIBER-' || service_territory_id || '-' || road_source_id,
                'road_name', road_name,
                'synthetic', true
              )
            FROM telecom_poles
            WHERE service_territory_id = :territory_id
              AND generation_job_id = :job_id
              AND road_source_id IN (SELECT road_id FROM roads)
            ON CONFLICT (node_id)
            DO UPDATE SET
              service_territory_id = EXCLUDED.service_territory_id,
              node_type = EXCLUDED.node_type,
              asset_id = EXCLUDED.asset_id,
              geom = EXCLUDED.geom,
              properties = network_nodes.properties || EXCLUDED.properties
            """
        ),
        params,
    )
    connection.execute(
        text(
            """
            WITH roads AS (
              SELECT road_id
              FROM generation_job_roads
              WHERE record_batch_id = :record_batch_id
            )
            INSERT INTO network_edges (
              edge_id, service_territory_id, a_node_id, z_node_id, edge_type,
              asset_id, weight, geom, properties
            )
            SELECT
              'EDGE-' || span_id,
              service_territory_id,
              a_pole_id,
              z_pole_id,
              'telecom_span',
              fiber_route_id,
              GREATEST(COALESCE(length_ft, 1), 0.01),
              geom,
              jsonb_build_object(
                'source', 'synthetic-generation-worker',
                'asset_type', 'telecom_span',
                'span_id', span_id,
                'fiber_route_id', fiber_route_id,
                'synthetic', true
              )
            FROM telecom_spans
            WHERE service_territory_id = :territory_id
              AND generation_job_id = :job_id
              AND fiber_route_id IN (
                SELECT 'FIBER-' || :territory_id || '-' || road_id
                FROM roads
              )
            ON CONFLICT (edge_id)
            DO UPDATE SET
              service_territory_id = EXCLUDED.service_territory_id,
              a_node_id = EXCLUDED.a_node_id,
              z_node_id = EXCLUDED.z_node_id,
              edge_type = EXCLUDED.edge_type,
              asset_id = EXCLUDED.asset_id,
              weight = EXCLUDED.weight,
              geom = EXCLUDED.geom,
              properties = network_edges.properties || EXCLUDED.properties
            """
        ),
        params,
    )

    for table_name, id_column, node_type in [
        ("splice_cases", "splice_case_id", "splice_case"),
        ("slack_loops", "slack_loop_id", "slack_loop"),
        ("handholes", "handhole_id", "handhole"),
        ("mux_sites", "mux_site_id", "mux_site"),
    ]:
        connection.execute(
            text(
                f"""
                WITH roads AS (
                  SELECT road_id
                  FROM generation_job_roads
                  WHERE record_batch_id = :record_batch_id
                ),
                selected_assets AS (
                  SELECT *
                  FROM {table_name}
                  WHERE service_territory_id = :territory_id
                    AND route_id IN (
                      SELECT 'FIBER-' || :territory_id || '-' || road_id
                      FROM roads
                    )
                )
                INSERT INTO network_nodes (
                  node_id, service_territory_id, node_type, asset_id, geom, properties
                )
                SELECT
                  {id_column},
                  service_territory_id,
                  :node_type,
                  {id_column},
                  geom,
                  properties || jsonb_build_object(
                    'source', 'synthetic-generation-worker',
                    'asset_type', CAST(:node_type AS text),
                    'route_id', route_id,
                    'pole_id', pole_id,
                    'synthetic', true
                  )
                FROM selected_assets
                ON CONFLICT (node_id)
                DO UPDATE SET
                  service_territory_id = EXCLUDED.service_territory_id,
                  node_type = EXCLUDED.node_type,
                  asset_id = EXCLUDED.asset_id,
                  geom = EXCLUDED.geom,
                  properties = network_nodes.properties || EXCLUDED.properties
                """
            ),
            {**params, "node_type": node_type},
        )
        connection.execute(
            text(
                f"""
                WITH roads AS (
                  SELECT road_id
                  FROM generation_job_roads
                  WHERE record_batch_id = :record_batch_id
                ),
                selected_assets AS (
                  SELECT *
                  FROM {table_name}
                  WHERE service_territory_id = :territory_id
                    AND pole_id IS NOT NULL
                    AND route_id IN (
                      SELECT 'FIBER-' || :territory_id || '-' || road_id
                      FROM roads
                    )
                )
                INSERT INTO network_edges (
                  edge_id, service_territory_id, a_node_id, z_node_id, edge_type,
                  asset_id, weight, geom, properties
                )
                SELECT
                  'EDGE-' || selected_assets.{id_column} || '-TO-' || selected_assets.pole_id,
                  selected_assets.service_territory_id,
                  selected_assets.pole_id,
                  selected_assets.{id_column},
                  :node_type || '_attachment',
                  selected_assets.route_id,
                  0.01,
                  ST_MakeLine(poles.geom, selected_assets.geom)::geometry(LineString, 4326),
                  selected_assets.properties || jsonb_build_object(
                    'source', 'synthetic-generation-worker',
                    'asset_type', CAST(:node_type AS text) || '_attachment',
                    'route_id', selected_assets.route_id,
                    'pole_id', selected_assets.pole_id,
                    'synthetic', true
                  )
                FROM selected_assets
                JOIN telecom_poles poles ON poles.pole_id = selected_assets.pole_id
                ON CONFLICT (edge_id)
                DO UPDATE SET
                  service_territory_id = EXCLUDED.service_territory_id,
                  a_node_id = EXCLUDED.a_node_id,
                  z_node_id = EXCLUDED.z_node_id,
                  edge_type = EXCLUDED.edge_type,
                  asset_id = EXCLUDED.asset_id,
                  weight = EXCLUDED.weight,
                  geom = EXCLUDED.geom,
                  properties = network_edges.properties || EXCLUDED.properties
                """
            ),
            {**params, "node_type": node_type},
        )


def _update_progress(connection: Connection, job: dict[str, Any], inserted_poles: int, inserted_spans: int, next_record_batch_id: int, completed_batch_count: int) -> None:
    target = max(1, int(job["target_pole_count"]))
    progress = min(99.0, round((inserted_poles / target) * 100, 2))
    connection.execute(
        text(
            """
            UPDATE synthetic_generation_jobs
            SET progress_percent = :progress,
                inserted_pole_count = :inserted_poles,
                inserted_span_count = :inserted_spans,
                next_road_offset = :next_record_batch_id,
                next_record_batch_id = :next_record_batch_id,
                completed_batch_count = :completed_batch_count,
                current_step = 'running_batches'
            WHERE job_key = :job_key
            """
        ),
        {
            "job_key": job["job_key"],
            "progress": progress,
            "inserted_poles": inserted_poles,
            "inserted_spans": inserted_spans,
            "next_record_batch_id": next_record_batch_id,
            "completed_batch_count": completed_batch_count,
        },
    )


def _precompute_lod_tables(connection: Connection, territory_id: int) -> None:
    for table_name in [
        "pole_density_z8",
        "pole_density_z10",
        "pole_clusters_z12",
        "pole_clusters_z14",
        "pole_clusters_z15",
        "span_simplified_z10",
        "span_simplified_z12",
        "route_summary_z8",
    ]:
        connection.execute(text(f"DELETE FROM {table_name} WHERE service_territory_id = :territory_id"), {"territory_id": territory_id})

    _insert_pole_lod(connection, "pole_density_z8", territory_id, 8, "pole_density")
    _insert_pole_lod(connection, "pole_density_z10", territory_id, 10, "pole_density")
    _insert_pole_lod(connection, "pole_clusters_z12", territory_id, 12, "pole_cluster")
    _insert_pole_lod(connection, "pole_clusters_z14", territory_id, 14, "pole_cluster")
    _insert_pole_lod(connection, "pole_clusters_z15", territory_id, 15, "pole_cluster")
    _insert_span_lod(connection, "span_simplified_z10", territory_id, 10, 0.002)
    _insert_span_lod(connection, "span_simplified_z12", territory_id, 12, 0.0006)
    _insert_route_summary(connection, territory_id)


def _insert_pole_lod(connection: Connection, table_name: str, territory_id: int, zoom: int, display_class: str) -> None:
    connection.execute(
        text(
            f"""
            INSERT INTO {table_name} (
              service_territory_id, tile_z, tile_x, tile_y, feature_count,
              display_class, geom, properties
            )
            WITH pole_tiles AS (
              SELECT
                GREATEST(0, LEAST((power(2, :zoom) - 1)::integer, floor((ST_X(geom_3857) + 20037508.342789244) / (40075016.68557849 / power(2, :zoom)))::integer)) AS tile_x,
                GREATEST(0, LEAST((power(2, :zoom) - 1)::integer, floor((20037508.342789244 - ST_Y(geom_3857)) / (40075016.68557849 / power(2, :zoom)))::integer)) AS tile_y,
                placement_class,
                geom
              FROM telecom_poles
              WHERE service_territory_id = :territory_id
                AND geom_3857 IS NOT NULL
            ),
            grouped AS (
              SELECT
                tile_x,
                tile_y,
                placement_class,
                count(*) AS feature_count,
                ST_Centroid(ST_Collect(geom)) AS geom
              FROM pole_tiles
              GROUP BY tile_x, tile_y, placement_class
            )
            SELECT
              :territory_id,
              :zoom,
              tile_x,
              tile_y,
              feature_count,
              :display_class,
              geom,
              jsonb_build_object(
                'asset_type', CAST(:display_class AS text),
                'status', 'synthetic',
                'placement_class', placement_class,
                'synthetic', true
              )
            FROM grouped
            """
        ),
        {"territory_id": territory_id, "zoom": zoom, "display_class": display_class},
    )


def _insert_span_lod(connection: Connection, table_name: str, territory_id: int, zoom: int, tolerance: float) -> None:
    connection.execute(
        text(
            f"""
            INSERT INTO {table_name} (
              service_territory_id, tile_z, tile_x, tile_y, feature_count,
              display_class, geom, properties
            )
            WITH span_tiles AS (
              SELECT
                service_territory_id,
                fiber_route_id,
                GREATEST(0, LEAST((power(2, :zoom) - 1)::integer, floor((ST_X(ST_Transform(ST_Centroid(geom), 3857)) + 20037508.342789244) / (40075016.68557849 / power(2, :zoom)))::integer)) AS tile_x,
                GREATEST(0, LEAST((power(2, :zoom) - 1)::integer, floor((20037508.342789244 - ST_Y(ST_Transform(ST_Centroid(geom), 3857))) / (40075016.68557849 / power(2, :zoom)))::integer)) AS tile_y,
                geom
              FROM telecom_spans
              WHERE service_territory_id = :territory_id
            ),
            grouped AS (
              SELECT
                service_territory_id,
                fiber_route_id,
                tile_x,
                tile_y,
                count(*) AS feature_count,
                ST_SimplifyPreserveTopology(ST_Collect(geom), :tolerance) AS geom
              FROM span_tiles
              GROUP BY service_territory_id, fiber_route_id, tile_x, tile_y
            )
            SELECT
              service_territory_id,
              :zoom,
              tile_x,
              tile_y,
              feature_count,
              'span_summary',
              geom,
              jsonb_build_object(
                'asset_type', 'span_summary',
                'status', 'synthetic',
                'fiber_route_id', fiber_route_id,
                'synthetic', true
              )
            FROM grouped
            WHERE geom IS NOT NULL
            """
        ),
        {"territory_id": territory_id, "zoom": zoom, "tolerance": tolerance},
    )


def _insert_route_summary(connection: Connection, territory_id: int) -> None:
    connection.execute(
        text(
            """
            INSERT INTO route_summary_z8 (
              service_territory_id, tile_z, tile_x, tile_y, feature_count,
              display_class, geom, properties
            )
            WITH routes AS (
              SELECT
                service_territory_id,
                fiber_route_id,
                asset_status,
                properties,
                ST_SimplifyPreserveTopology(geom, 0.003) AS geom
              FROM fiber_routes
              WHERE service_territory_id = :territory_id
                AND geom IS NOT NULL
            ),
            route_extents AS (
              SELECT
                *,
                GREATEST(0, LEAST(255, floor((ST_XMin(ST_Transform(geom, 3857)) + 20037508.342789244) / (40075016.68557849 / power(2, 8)))::integer)) AS min_tile_x,
                GREATEST(0, LEAST(255, floor((ST_XMax(ST_Transform(geom, 3857)) + 20037508.342789244) / (40075016.68557849 / power(2, 8)))::integer)) AS max_tile_x,
                GREATEST(0, LEAST(255, floor((20037508.342789244 - ST_YMax(ST_Transform(geom, 3857))) / (40075016.68557849 / power(2, 8)))::integer)) AS min_tile_y,
                GREATEST(0, LEAST(255, floor((20037508.342789244 - ST_YMin(ST_Transform(geom, 3857))) / (40075016.68557849 / power(2, 8)))::integer)) AS max_tile_y
              FROM routes
            ),
            route_tiles AS (
              SELECT
                route_extents.*,
                tile_x,
                tile_y,
                ST_Transform(ST_TileEnvelope(8, tile_x, tile_y), 4326) AS tile_geom
              FROM route_extents
              CROSS JOIN LATERAL generate_series(min_tile_x, max_tile_x) AS tx(tile_x)
              CROSS JOIN LATERAL generate_series(min_tile_y, max_tile_y) AS ty(tile_y)
            )
            SELECT
              service_territory_id,
              8,
              tile_x,
              tile_y,
              1,
              'route_summary',
              ST_Intersection(geom, tile_geom),
              properties || jsonb_build_object(
                'asset_type', 'fiber_route',
                'status', asset_status,
                'fiber_route_id', fiber_route_id,
                'synthetic', true
              )
            FROM route_tiles
            WHERE ST_Intersects(geom, tile_geom)
              AND NOT ST_IsEmpty(ST_Intersection(geom, tile_geom))
            """
        ),
        {"territory_id": territory_id},
    )


def _mark_territory_tiles_dirty(connection: Connection, territory_id: int, reason: str) -> None:
    connection.execute(
        text(
            """
            UPDATE tile_cache_metadata cache
            SET dirty = TRUE,
                dirty_reason = :reason,
                source_updated_at = now()
            FROM service_territories territory
            WHERE territory.id = :territory_id
              AND ST_Intersects(territory.geom, ST_Transform(ST_TileEnvelope(cache.z, cache.x, cache.y), 4326))
            """
        ),
        {"territory_id": territory_id, "reason": f"{reason}; territory {territory_id}"},
    )


def _mark_trace_cache_dirty(connection: Connection, reason: str) -> None:
    connection.execute(
        text(
            """
            UPDATE trace_cache
            SET dirty = TRUE,
                dirty_reason = :reason,
                updated_at = now()
            WHERE dirty = FALSE
            """
        ),
        {"reason": reason},
    )


def _refresh_territory_summary(connection: Connection, territory_id: int, job_key: str) -> None:
    connection.execute(
        text(
            """
            UPDATE service_territories
            SET summary_json = summary_json || jsonb_build_object(
                  'gis_scale', jsonb_build_object(
                    'last_generation_job_key', CAST(:job_key AS text),
                    'synthetic_pole_estimate', COALESCE((SELECT sum(feature_count) FROM pole_density_z8 WHERE service_territory_id = :territory_id), 0),
                    'synthetic_span_summary_count', COALESCE((SELECT sum(feature_count) FROM span_simplified_z10 WHERE service_territory_id = :territory_id), 0),
                    'fiber_route_summary_count', COALESCE((SELECT count(*) FROM route_summary_z8 WHERE service_territory_id = :territory_id), 0),
                    'synthetic_circuit_route_count', COALESCE((SELECT count(*) FROM circuit_routes WHERE service_territory_id = :territory_id), 0),
                    'dirty_cached_tile_count', COALESCE((
                      SELECT count(*)
                      FROM tile_cache_metadata cache
                      WHERE cache.dirty = TRUE
                        AND EXISTS (
                          SELECT 1
                          FROM service_territories territory
                          WHERE territory.id = :territory_id
                            AND ST_Intersects(territory.geom, ST_Transform(ST_TileEnvelope(cache.z, cache.x, cache.y), 4326))
                        )
                    ), 0),
                    'summary_source', 'precomputed_lod_tables',
                    'updated_at', now()
                  )
                ),
                updated_at = now()
            WHERE id = :territory_id
            """
        ),
        {"territory_id": territory_id, "job_key": job_key},
    )


def _job_control_status(connection: Connection, job_key: str) -> str | None:
    status = connection.execute(text("SELECT job_status FROM synthetic_generation_jobs WHERE job_key = :job_key"), {"job_key": job_key}).scalar()
    return str(status) if status is not None else None


def _pause_job(connection: Connection, job_key: str, step: str) -> None:
    connection.execute(
        text(
            """
            UPDATE synthetic_generation_jobs
            SET job_status = 'paused',
                current_step = :step,
                log_json = log_json || jsonb_build_array(CAST(:step AS text))
            WHERE job_key = :job_key
            """
        ),
        {"job_key": job_key, "step": step},
    )


def _log_step(connection: Connection, job_key: str, step: str) -> None:
    connection.execute(
        text(
            """
            UPDATE synthetic_generation_jobs
            SET current_step = :step,
                log_json = log_json || jsonb_build_array(CAST(:step AS text))
            WHERE job_key = :job_key
            """
        ),
        {"job_key": job_key, "step": step},
    )


def _finish_job(connection: Connection, job_key: str, status: str, step: str) -> None:
    connection.execute(
        text(
            """
            UPDATE synthetic_generation_jobs
            SET job_status = :status,
                current_step = :step,
                progress_percent = CASE WHEN :status = 'completed' THEN 100 ELSE progress_percent END,
                finished_at = CASE WHEN :status IN ('completed', 'failed') THEN now() ELSE finished_at END,
                log_json = log_json || jsonb_build_array(CAST(:step AS text))
            WHERE job_key = :job_key
            """
        ),
        {"job_key": job_key, "status": status, "step": step},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run GridAssetLink synthetic telecom GIS generation jobs.")
    parser.add_argument("--job-key", default=None, help="Optional generation job key to run.")
    parser.add_argument("--max-batches", type=int, default=None, help="Optional safety limit for one worker invocation.")
    args = parser.parse_args()
    result = run_next_generation_job(job_key=args.job_key, max_batches=args.max_batches)
    print(result)


if __name__ == "__main__":
    main()
