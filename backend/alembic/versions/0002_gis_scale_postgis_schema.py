"""GIS scale PostGIS schema

Revision ID: 0002_gis_scale_postgis_schema
Revises: 0001_initial_schema
Create Date: 2026-06-10
"""

from alembic import op

revision = "0002_gis_scale_postgis_schema"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS service_territories (
            id BIGSERIAL PRIMARY KEY,
            territory_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'manual_geojson',
            source_reference TEXT,
            boundary_status TEXT NOT NULL DEFAULT 'draft',
            srid INTEGER NOT NULL DEFAULT 4326,
            geom geometry(MultiPolygon, 4326) NOT NULL,
            geom_3857 geometry(MultiPolygon, 3857),
            area_sq_miles DOUBLE PRECISION,
            summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            validation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS service_territories_geom_gix ON service_territories USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS service_territories_geom3857_gix ON service_territories USING GIST (geom_3857)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_road_centerlines (
            id BIGSERIAL PRIMARY KEY,
            road_id TEXT UNIQUE NOT NULL,
            service_territory_id BIGINT REFERENCES service_territories(id),
            source_name TEXT NOT NULL DEFAULT 'public_road_centerlines',
            source_reference TEXT,
            road_name TEXT,
            road_class TEXT,
            placement_class TEXT NOT NULL DEFAULT 'suburban',
            excluded BOOLEAN NOT NULL DEFAULT FALSE,
            exclusion_reason TEXT,
            geom geometry(MultiLineString, 4326) NOT NULL,
            geom_3857 geometry(MultiLineString, 3857),
            length_miles DOUBLE PRECISION,
            properties JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS public_road_centerlines_geom_gix ON public_road_centerlines USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS public_road_centerlines_territory_idx ON public_road_centerlines (service_territory_id, placement_class, excluded)")
    op.execute("CREATE INDEX IF NOT EXISTS public_road_centerlines_id_trgm_idx ON public_road_centerlines USING GIN (road_id gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS public_road_centerlines_name_trgm_idx ON public_road_centerlines USING GIN (road_name gin_trgm_ops)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS telecom_poles (
            id BIGSERIAL,
            pole_id TEXT NOT NULL,
            service_territory_id BIGINT NOT NULL REFERENCES service_territories(id) ON DELETE CASCADE,
            generation_job_id BIGINT,
            county TEXT,
            town TEXT,
            geohash TEXT,
            road_source_id TEXT,
            road_name TEXT,
            road_milepost DOUBLE PRECISION,
            road_side TEXT,
            sequence_index INTEGER,
            placement_class TEXT NOT NULL,
            pole_role TEXT NOT NULL DEFAULT 'distribution_backbone',
            asset_status TEXT NOT NULL DEFAULT 'synthetic',
            synthetic BOOLEAN NOT NULL DEFAULT TRUE,
            support_type TEXT NOT NULL DEFAULT 'distribution_pole',
            height_ft INTEGER,
            row_offset_ft DOUBLE PRECISION,
            span_prev_ft DOUBLE PRECISION,
            display_class TEXT NOT NULL DEFAULT 'pole',
            geom geometry(Point, 4326) NOT NULL,
            geom_3857 geometry(Point, 3857),
            properties JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        ) PARTITION BY LIST (service_territory_id)
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_geom_gix ON telecom_poles USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_geom3857_gix ON telecom_poles USING GIST (geom_3857)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_territory_town_idx ON telecom_poles (service_territory_id, county, town)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_geohash_idx ON telecom_poles (geohash)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_id_trgm_idx ON telecom_poles USING GIN (pole_id gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_road_name_trgm_idx ON telecom_poles USING GIN (road_name gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_town_trgm_idx ON telecom_poles USING GIN (town gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_poles_county_trgm_idx ON telecom_poles USING GIN (county gin_trgm_ops)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS telecom_spans (
            id BIGSERIAL,
            span_id TEXT NOT NULL,
            service_territory_id BIGINT NOT NULL REFERENCES service_territories(id) ON DELETE CASCADE,
            generation_job_id BIGINT,
            a_pole_id TEXT NOT NULL,
            z_pole_id TEXT NOT NULL,
            span_type TEXT NOT NULL DEFAULT 'telecom_strand',
            asset_status TEXT NOT NULL DEFAULT 'synthetic',
            synthetic BOOLEAN NOT NULL DEFAULT TRUE,
            length_ft DOUBLE PRECISION,
            fiber_route_id TEXT,
            display_class TEXT NOT NULL DEFAULT 'span',
            geom geometry(LineString, 4326) NOT NULL,
            geom_3857 geometry(LineString, 3857),
            properties JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        ) PARTITION BY LIST (service_territory_id)
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS telecom_spans_geom_gix ON telecom_spans USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_spans_route_idx ON telecom_spans (service_territory_id, fiber_route_id)")
    op.execute("CREATE INDEX IF NOT EXISTS telecom_spans_id_trgm_idx ON telecom_spans USING GIN (span_id gin_trgm_ops)")

    for table_name, id_column, default_class, geom_type in [
        ("telecom_strands", "strand_id", "telecom_strand", "LineString"),
        ("fiber_cable_attachments", "attachment_id", "fiber_attachment", "Point"),
    ]:
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                {id_column} TEXT UNIQUE NOT NULL,
                service_territory_id BIGINT NOT NULL REFERENCES service_territories(id) ON DELETE CASCADE,
                generation_job_id BIGINT,
                pole_id TEXT,
                span_id TEXT,
                fiber_route_id TEXT,
                fiber_cable_id TEXT,
                attachment_type TEXT,
                asset_status TEXT NOT NULL DEFAULT 'synthetic',
                synthetic BOOLEAN NOT NULL DEFAULT TRUE,
                display_class TEXT NOT NULL DEFAULT '{default_class}',
                geom geometry({geom_type}, 4326) NOT NULL,
                geom_3857 geometry({geom_type}, 3857),
                properties JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_geom_gix ON {table_name} USING GIST (geom)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_territory_idx ON {table_name} (service_territory_id, fiber_route_id)")

    op.execute(
        """
        ALTER TABLE fiber_cables
        ADD COLUMN IF NOT EXISTS service_territory_id BIGINT REFERENCES service_territories(id),
        ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326),
        ADD COLUMN IF NOT EXISTS geom_3857 geometry(LineString, 3857),
        ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS display_class TEXT
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS fiber_cables_geom_gix ON fiber_cables USING GIST (geom)")

    for table_name, id_column, route_type in [
        ("fiber_routes", "fiber_route_id", "fiber_route"),
        ("circuit_routes", "circuit_route_id", "circuit_route"),
    ]:
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                {id_column} TEXT UNIQUE NOT NULL,
                service_territory_id BIGINT NOT NULL REFERENCES service_territories(id) ON DELETE CASCADE,
                route_name TEXT NOT NULL,
                route_type TEXT NOT NULL DEFAULT '{route_type}',
                asset_status TEXT NOT NULL DEFAULT 'synthetic',
                synthetic BOOLEAN NOT NULL DEFAULT TRUE,
                display_class TEXT NOT NULL DEFAULT '{route_type}',
                fiber_count INTEGER,
                criticality TEXT,
                geom geometry(Geometry, 4326) NOT NULL,
                geom_3857 geometry(Geometry, 3857),
                properties JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_geom_gix ON {table_name} USING GIST (geom)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_territory_idx ON {table_name} (service_territory_id)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_id_trgm_idx ON {table_name} USING GIN ({id_column} gin_trgm_ops)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_route_name_trgm_idx ON {table_name} USING GIN (route_name gin_trgm_ops)")

    for table_name, id_column, role_column in [
        ("splice_cases", "splice_case_id", "splice_case"),
        ("handholes", "handhole_id", "handhole"),
        ("slack_loops", "slack_loop_id", "slack_loop"),
        ("mux_sites", "mux_site_id", "mux_site"),
    ]:
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                {id_column} TEXT UNIQUE NOT NULL,
                service_territory_id BIGINT NOT NULL REFERENCES service_territories(id) ON DELETE CASCADE,
                asset_status TEXT NOT NULL DEFAULT 'synthetic',
                synthetic BOOLEAN NOT NULL DEFAULT TRUE,
                display_class TEXT NOT NULL DEFAULT '{role_column}',
                route_id TEXT,
                pole_id TEXT,
                geom geometry(Point, 4326) NOT NULL,
                geom_3857 geometry(Point, 3857),
                properties JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_geom_gix ON {table_name} USING GIST (geom)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_territory_idx ON {table_name} (service_territory_id)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_id_trgm_idx ON {table_name} USING GIN ({id_column} gin_trgm_ops)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_route_id_trgm_idx ON {table_name} USING GIN (route_id gin_trgm_ops)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_pole_id_trgm_idx ON {table_name} USING GIN (pole_id gin_trgm_ops)")

    for table_name in ["proposed_poles", "proposed_spans", "proposed_fiber_routes"]:
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                proposal_id TEXT NOT NULL,
                service_territory_id BIGINT REFERENCES service_territories(id),
                base_asset_id TEXT,
                edit_status TEXT NOT NULL DEFAULT 'draft',
                geom geometry(Geometry, 4326),
                geom_3857 geometry(Geometry, 3857),
                properties JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_geom_gix ON {table_name} USING GIST (geom)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_proposal_idx ON {table_name} (proposal_id, edit_status)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS network_nodes (
            id BIGSERIAL PRIMARY KEY,
            node_id TEXT UNIQUE NOT NULL,
            service_territory_id BIGINT REFERENCES service_territories(id),
            node_type TEXT NOT NULL,
            asset_id TEXT,
            geom geometry(Point, 4326),
            properties JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS network_nodes_geom_gix ON network_nodes USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS network_nodes_id_trgm_idx ON network_nodes USING GIN (node_id gin_trgm_ops)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS network_edges (
            id BIGSERIAL PRIMARY KEY,
            edge_id TEXT UNIQUE NOT NULL,
            service_territory_id BIGINT REFERENCES service_territories(id),
            a_node_id TEXT NOT NULL,
            z_node_id TEXT NOT NULL,
            edge_type TEXT NOT NULL,
            asset_id TEXT,
            weight DOUBLE PRECISION NOT NULL DEFAULT 1,
            geom geometry(LineString, 4326),
            properties JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS network_edges_geom_gix ON network_edges USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS network_edges_node_idx ON network_edges (a_node_id, z_node_id)")
    op.execute("CREATE INDEX IF NOT EXISTS network_edges_a_node_idx ON network_edges (a_node_id)")
    op.execute("CREATE INDEX IF NOT EXISTS network_edges_z_node_idx ON network_edges (z_node_id)")
    op.execute("CREATE INDEX IF NOT EXISTS network_edges_asset_idx ON network_edges (asset_id)")

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
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                service_territory_id BIGINT REFERENCES service_territories(id),
                tile_z INTEGER,
                tile_x INTEGER,
                tile_y INTEGER,
                feature_count BIGINT NOT NULL DEFAULT 0,
                display_class TEXT,
                geom geometry(Geometry, 4326) NOT NULL,
                properties JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_geom_gix ON {table_name} USING GIST (geom)")
        op.execute(f"CREATE INDEX IF NOT EXISTS {table_name}_tile_idx ON {table_name} (tile_z, tile_x, tile_y)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tile_cache_metadata (
            id BIGSERIAL PRIMARY KEY,
            layer TEXT NOT NULL,
            z INTEGER NOT NULL,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            etag TEXT,
            mvt BYTEA,
            feature_count BIGINT NOT NULL DEFAULT 0,
            truncated BOOLEAN NOT NULL DEFAULT FALSE,
            max_features INTEGER,
            content_type TEXT NOT NULL DEFAULT 'application/vnd.mapbox-vector-tile',
            dirty BOOLEAN NOT NULL DEFAULT TRUE,
            dirty_reason TEXT,
            source_updated_at TIMESTAMPTZ,
            rendered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(layer, z, x, y)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS tile_cache_dirty_idx ON tile_cache_metadata (dirty, layer, z)")
    op.execute("CREATE INDEX IF NOT EXISTS tile_cache_truncated_idx ON tile_cache_metadata (truncated, layer, z)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS trace_cache (
            id BIGSERIAL PRIMARY KEY,
            trace_type TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            dirty BOOLEAN NOT NULL DEFAULT FALSE,
            dirty_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(trace_type, request_hash)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS trace_cache_dirty_idx ON trace_cache (dirty, trace_type)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS synthetic_generation_jobs (
            id BIGSERIAL PRIMARY KEY,
            job_key TEXT UNIQUE NOT NULL,
            service_territory_id BIGINT REFERENCES service_territories(id),
            seed TEXT NOT NULL,
            target_pole_count BIGINT NOT NULL,
            density_profile TEXT NOT NULL DEFAULT 'auto',
            attachment_profile TEXT NOT NULL DEFAULT 'telecom_standard',
            road_source TEXT NOT NULL DEFAULT 'public_road_centerlines',
            batch_size INTEGER NOT NULL DEFAULT 50000,
            job_status TEXT NOT NULL DEFAULT 'queued',
            progress_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
            current_step TEXT,
            inserted_pole_count BIGINT NOT NULL DEFAULT 0,
            inserted_span_count BIGINT NOT NULL DEFAULT 0,
            next_road_offset BIGINT NOT NULL DEFAULT 0,
            next_record_batch_id BIGINT NOT NULL DEFAULT 0,
            completed_batch_count BIGINT NOT NULL DEFAULT 0,
            log_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ
        )
        """
    )
    op.execute("ALTER TABLE synthetic_generation_jobs ADD COLUMN IF NOT EXISTS next_record_batch_id BIGINT NOT NULL DEFAULT 0")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table_name in [
        "synthetic_generation_jobs",
        "trace_cache",
        "tile_cache_metadata",
        "route_summary_z8",
        "span_simplified_z12",
        "span_simplified_z10",
        "pole_clusters_z14",
        "pole_clusters_z15",
        "pole_clusters_z12",
        "pole_density_z10",
        "pole_density_z8",
        "network_edges",
        "network_nodes",
        "proposed_fiber_routes",
        "proposed_spans",
        "proposed_poles",
        "fiber_cable_attachments",
        "telecom_strands",
        "mux_sites",
        "slack_loops",
        "handholes",
        "splice_cases",
        "telecom_spans",
        "telecom_poles",
        "public_road_centerlines",
        "service_territories",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table_name} CASCADE")
