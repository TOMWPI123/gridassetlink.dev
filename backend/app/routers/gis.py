from __future__ import annotations

import hashlib
import json
from uuid import uuid4
from typing import Any, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.services.gis_vector_tiles import (
    VECTOR_TILE_MIME,
    cache_headers,
    choose_plan,
    empty_tile,
    get_vector_tile_result,
    is_postgis_engine,
    postgis_unavailable_payload,
    safe_limit,
    supported_layers,
)

router = APIRouter(prefix="/api", tags=["gis-scale"])
MAX_GEOJSON_UPLOAD_BYTES = 50 * 1024 * 1024


class ServiceTerritoryImport(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    source_type: Literal["uploaded_geojson", "stored_postgis_polygon", "public_boundary", "manual_drawn_polygon"] = "uploaded_geojson"
    source_reference: str | None = None
    geojson: dict[str, Any]


class SyntheticGenerationRequest(BaseModel):
    seed: str = "gridassetlink-gis-scale-v1"
    target_pole_count: int = Field(default=10_000_000, ge=1, le=50_000_000)
    density_profile: Literal["auto", "urban", "suburban", "rural", "mixed"] = "auto"
    attachment_profile: str = "telecom_standard"
    road_source: str = "public_road_centerlines"
    batch_size: int = Field(default=50_000, ge=10_000, le=100_000)


class SyntheticGenerationPreflightRequest(BaseModel):
    target_pole_count: int = Field(default=10_000_000, ge=1, le=50_000_000)
    batch_size: int = Field(default=50_000, ge=10_000, le=100_000)
    density_profile: Literal["auto", "urban", "suburban", "rural", "mixed"] = "auto"


class RoadCenterlineImport(BaseModel):
    source_name: str = "public_road_centerlines"
    source_reference: str | None = None
    service_territory_id: int | None = None
    geojson: dict[str, Any]
    max_features: int = Field(default=50_000, ge=1, le=250_000)


class DirtyTileRequest(BaseModel):
    layer: str
    z: int = Field(ge=0, le=24)
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    reason: str = "asset edit"


class DirtyGeometryRequest(BaseModel):
    geojson: dict[str, Any]
    layers: list[str] = Field(default_factory=lambda: ["poles", "spans", "fiber_routes", "splice_cases", "handholes", "slack_loops", "mux_sites", "circuit_routes"])
    min_z: int = Field(default=8, ge=0, le=24)
    max_z: int = Field(default=18, ge=0, le=24)
    reason: str = "asset geometry edit"
    max_dirty_tiles: int = Field(default=25_000, ge=1, le=250_000)


class TileWarmRequest(BaseModel):
    layers: list[str] = Field(default_factory=lambda: ["territory", "poles", "pole_clusters"])
    min_z: int = Field(default=8, ge=0, le=15)
    max_z: int = Field(default=15, ge=0, le=15)
    max_tiles: int = Field(default=1_000, ge=1, le=25_000)
    only_dirty_or_missing: bool = True


class ProposedAssetEditRequest(BaseModel):
    service_territory_id: int | None = None
    base_asset_id: str | None = None
    proposal_id: str | None = None
    edit_status: Literal["draft", "proposed", "approved", "rejected", "superseded"] = "proposed"
    geojson: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
    reason: str = "proposed GIS-scale asset edit"
    min_dirty_z: int = Field(default=8, ge=0, le=24)
    max_dirty_z: int = Field(default=18, ge=0, le=24)
    max_dirty_tiles: int = Field(default=25_000, ge=1, le=250_000)


class TraceRequest(BaseModel):
    asset_id: str | None = None
    a_node_id: str | None = None
    z_node_id: str | None = None
    max_edges: int = Field(default=5000, ge=1, le=50_000)
    max_depth: int = Field(default=256, ge=1, le=5000)


@router.get("/gis/capabilities")
def gis_capabilities() -> dict[str, Any]:
    return {
        "postgis_configured": is_postgis_engine(engine),
        "vector_tile_endpoint": "/api/tiles/{layer}/{z}/{x}/{y}.mvt",
        "layers": supported_layers(),
        "local_bridge": {
            "supported": True,
            "default_local_api_url": "http://127.0.0.1:8000",
            "browser_usage": "The hosted frontend can read synthetic GIS tiles/search/details from a locally running API when CORS allows https://gridassetlink.dev.",
            "upload_boundary": "The 10M PostGIS database is not uploaded through the browser; use a local API bridge or a managed production PostGIS DATABASE_URL.",
        },
        "website_import": {
            "supported": True,
            "service_territory_upload_endpoint": "/api/service-territories/import-geojson-file",
            "road_centerline_upload_endpoint": "/api/road-centerlines/import-geojson-file",
            "max_geojson_upload_mb": MAX_GEOJSON_UPLOAD_BYTES // (1024 * 1024),
            "usage": "Choose GeoJSON files from your computer while on gridassetlink.dev. Files are uploaded to the configured website API and imported into managed PostGIS when available.",
            "scale_boundary": "Upload service territory and public road reference files here, then queue the background synthetic generation job. Do not upload raw 10M pole inventories to the browser.",
            "import_targets": ["website_postgis_backend", "local_computer_api_bridge", "custom_gis_api"],
            "browser_steps": [
                "Open https://gridassetlink.dev/dashboard?drawer=scale.",
                "Choose whether files import to the website backend or a local API bridge.",
                "Select a service territory GeoJSON from this computer.",
                "Select public road centerline GeoJSON from this computer.",
                "Run generation preflight and queue the synthetic worker job.",
                "Browse generated assets through vector tiles instead of raw browser downloads.",
            ],
        },
        "level_of_detail": {
            "zoom_0_7": "territory boundary, summaries, major corridors; no individual poles",
            "zoom_8_10": "precomputed density tiles and regional route summaries",
            "zoom_11_13": "precomputed vector-tile clusters and simplified spans",
            "zoom_14_15": "road-level clusters, span groups, lazy corridor tiles",
            "zoom_16_plus": "individual poles, spans, splice cases, handholes, mux sites",
        },
        "client_rules": [
            "Do not download raw pole datasets.",
            "Do not fetch raw pole inventories into browser state.",
            "Do not use client-side clustering for full pole inventory.",
            "Fetch full details only after map click or paginated server search.",
            "Search uses explicit indexed columns only; it does not scan raw JSON payloads.",
        ],
        "cache_strategy": [
            "Vector tile bodies are cached by layer/z/x/y when PostGIS is enabled.",
            "Territory tile warming can pre-render capped low/mid zoom aggregate tiles without touching raw pole detail tiles.",
            "Dirty-tile records allow one edited tile to be invalidated without regenerating a territory.",
            "Geometry-aware dirty-tile invalidation marks only tiles intersecting an edited asset footprint.",
            "Proposed edit endpoints stage pole/span/fiber-route changes separately and dirty only intersecting layer tiles.",
            "CDN-compatible cache headers and ETags are emitted for every tile response.",
            "Vector tile feature budgets cap dense tile payloads and expose truncation headers.",
        ],
        "generation_engine": [
            "Import public road centerlines, then queue a background synthetic generation job.",
            "Worker clips roads to the service territory, excludes unsuitable road classes, and writes PostGIS batches.",
            "Generated poles, spans, strands, fiber attachments, splices, slack loops, handholes, mux sites, and routes are synthetic until verified.",
        ],
        "synthetic_boundary": "All generated telecom assets remain synthetic unless imported and explicitly marked verified.",
    }


@router.get("/gis/scale-health")
def gis_scale_health() -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return {
            **postgis_unavailable_payload(),
            "layers": supported_layers(),
            "status": "postgis_not_configured",
            "architecture_checks": {
                "vector_tiles": True,
                "raw_browser_pole_load": False,
                "server_side_search": True,
                "background_generation_required": True,
            },
            "warnings": ["PostGIS is required before million-scale synthetic poles can be generated or served."],
        }

    table_estimates = _fetch_all(
        """
        WITH target_tables(table_name) AS (
          VALUES
            ('service_territories'),
            ('public_road_centerlines'),
            ('telecom_poles'),
            ('telecom_spans'),
            ('telecom_strands'),
            ('fiber_cable_attachments'),
            ('fiber_routes'),
            ('circuit_routes'),
            ('splice_cases'),
            ('handholes'),
            ('slack_loops'),
            ('mux_sites'),
            ('network_nodes'),
            ('network_edges'),
            ('pole_density_z8'),
            ('pole_density_z10'),
            ('pole_clusters_z12'),
            ('pole_clusters_z14'),
            ('pole_clusters_z15'),
            ('span_simplified_z10'),
            ('span_simplified_z12'),
            ('route_summary_z8'),
            ('tile_cache_metadata'),
            ('trace_cache')
        )
        SELECT
          target_tables.table_name,
          COALESCE(GREATEST(pg_class.reltuples, 0)::bigint, 0) AS estimated_rows,
          COALESCE(pg_total_relation_size(pg_class.oid), 0) AS total_bytes
        FROM target_tables
        LEFT JOIN pg_class ON pg_class.relname = target_tables.table_name
                          AND pg_class.relnamespace = 'public'::regnamespace
        ORDER BY target_tables.table_name
        """
    )
    tile_cache = _fetch_all(
        """
        SELECT layer, z, dirty, count(*) AS tile_count,
               COALESCE(sum(feature_count), 0) AS cached_feature_count,
               count(*) FILTER (WHERE truncated = TRUE) AS truncated_tile_count,
               COALESCE(sum(octet_length(mvt)), 0) AS mvt_bytes,
               max(rendered_at) AS last_rendered_at,
               max(source_updated_at) AS last_source_update_at
        FROM tile_cache_metadata
        GROUP BY layer, z, dirty
        ORDER BY layer, z, dirty
        """
    )
    trace_cache = _fetch_all(
        """
        SELECT trace_type, dirty, count(*) AS trace_count, max(updated_at) AS last_updated_at
        FROM trace_cache
        GROUP BY trace_type, dirty
        ORDER BY trace_type, dirty
        """
    )
    jobs = _fetch_all(
        """
        SELECT job_key, service_territory_id, target_pole_count, inserted_pole_count,
               inserted_span_count, next_road_offset, next_record_batch_id, completed_batch_count,
               progress_percent, job_status, current_step, requested_at, started_at, finished_at
        FROM synthetic_generation_jobs
        ORDER BY requested_at DESC
        LIMIT 10
        """
    )
    territories = _fetch_all(
        """
        SELECT id, territory_key, name, boundary_status, area_sq_miles, summary_json,
               validation_json, updated_at
        FROM service_territories
        ORDER BY updated_at DESC
        LIMIT 25
        """
    )
    warnings = []
    if not territories:
        warnings.append("No service territory has been imported; generation must be clipped to a validated territory.")
    if not any(row["table_name"] == "public_road_centerlines" and row["estimated_rows"] > 0 for row in table_estimates):
        warnings.append("No public road centerline estimate is available; street-based synthetic pole placement needs road inputs.")
    if any(row["dirty"] for row in tile_cache):
        warnings.append("Some vector tiles are dirty and will be recomputed on next request.")

    return {
        "postgis_configured": True,
        "status": "ready_for_gis_scale" if not warnings else "needs_data_or_cache_attention",
        "layers": supported_layers(),
        "table_estimates": table_estimates,
        "tile_cache": tile_cache,
        "trace_cache": trace_cache,
        "recent_generation_jobs": jobs,
        "territories": territories,
        "architecture_checks": {
            "vector_tiles": True,
            "raw_browser_pole_load": False,
            "server_side_search": True,
            "background_generation_required": True,
            "catalog_estimates_instead_of_raw_counts": True,
        },
        "warnings": warnings,
        "synthetic_boundary": "Generated telecom assets are synthetic unless imported and explicitly marked verified.",
    }


@router.get("/tiles/{layer}/{z}/{x}/{y}.mvt")
def vector_tile(layer: str, z: int, x: int, y: int, request: Request) -> Response:
    if layer not in supported_layers():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unsupported tile layer: {layer}")
    max_tile = 2**z if 0 <= z <= 24 else 0
    if not (0 <= z <= 24) or x < 0 or y < 0 or x >= max_tile or y >= max_tile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid z/x/y tile coordinate")

    try:
        tile = get_vector_tile_result(engine, layer, z, x, y)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Tile render failed: {error}") from error
    tile_body = tile.body or empty_tile()
    headers = cache_headers(layer, z, x, y, hit=tile.cache_hit, body=tile_body)
    headers["X-GIS-PostGIS"] = "true" if is_postgis_engine(engine) else "false"
    headers["X-GIS-Feature-Count"] = str(tile.feature_count)
    headers["X-GIS-Max-Features"] = str(tile.max_features)
    headers["X-GIS-Tile-Truncated"] = "true" if tile.truncated else "false"
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=tile_body, media_type=VECTOR_TILE_MIME, headers=headers)


@router.get("/service-territories")
def service_territories() -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return {**postgis_unavailable_payload(), "territories": []}
    rows = _fetch_all(
        """
        SELECT id, territory_key, name, source_type, source_reference, boundary_status,
               area_sq_miles, summary_json, validation_json, created_at, updated_at
        FROM service_territories
        ORDER BY updated_at DESC
        LIMIT 100
        """
    )
    return {"postgis_configured": True, "territories": rows}


@router.post("/service-territories/import-geojson", status_code=status.HTTP_201_CREATED)
def import_service_territory(payload: ServiceTerritoryImport) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    geometry = _extract_geojson_geometry(payload.geojson)
    territory_key = f"territory-{uuid4().hex[:12]}"
    validation = _validate_geometry_payload(geometry)
    row = _fetch_one(
        """
        WITH raw_input AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS input_geom
        ),
        normalized AS (
          SELECT
            ST_Multi(
              ST_CollectionExtract(
                ST_UnaryUnion(ST_MakeValid(input_geom)),
                3
              )
            )::geometry(MultiPolygon, 4326) AS geom,
            ST_IsValid(input_geom) AS input_is_valid,
            ST_IsValidReason(input_geom) AS input_validity_reason,
            ST_GeometryType(input_geom) AS input_geometry_type
          FROM raw_input
        )
        INSERT INTO service_territories (
          territory_key, name, source_type, source_reference, boundary_status,
          geom, geom_3857, area_sq_miles, summary_json, validation_json
        )
        SELECT
          :territory_key,
          :name,
          :source_type,
          :source_reference,
          CASE WHEN ST_IsValid(geom) AND NOT ST_IsEmpty(geom) THEN 'validated' ELSE 'needs_revision' END,
          geom,
          ST_Transform(geom, 3857),
          ST_Area(ST_Transform(geom, 5070)) / 2589988.110336,
          CAST(:summary_json AS jsonb),
          jsonb_build_object(
            'is_valid', ST_IsValid(geom),
            'reason', ST_IsValidReason(geom),
            'is_empty', ST_IsEmpty(geom),
            'input_is_valid', input_is_valid,
            'input_validity_reason', input_validity_reason,
            'input_geometry_type', input_geometry_type,
            'normalized_geometry_type', ST_GeometryType(geom),
            'normalization', 'ST_MakeValid + ST_UnaryUnion + polygon collection extract'
          ) || CAST(:validation_json AS jsonb)
        FROM normalized
        WHERE NOT ST_IsEmpty(geom)
        RETURNING id, territory_key, name, boundary_status, area_sq_miles, validation_json
        """,
        {
            "geometry": json.dumps(geometry),
            "territory_key": territory_key,
            "name": payload.name,
            "source_type": payload.source_type,
            "source_reference": payload.source_reference,
            "summary_json": json.dumps({"input_type": payload.geojson.get("type"), "synthetic_data_only": True}),
            "validation_json": json.dumps(validation),
        },
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service territory GeoJSON did not contain polygonal boundary geometry")
    return {"postgis_configured": True, "territory": row, "synthetic_generation_allowed": row["boundary_status"] == "validated"}


@router.post("/service-territories/import-geojson-file", status_code=status.HTTP_201_CREATED)
async def import_service_territory_file(
    file: UploadFile = File(...),
    name: str = Form("Synthetic service territory"),
    source_type: Literal["uploaded_geojson", "stored_postgis_polygon", "public_boundary", "manual_drawn_polygon"] = Form("uploaded_geojson"),
    source_reference: str | None = Form(None),
) -> dict[str, Any]:
    geojson = await _read_uploaded_geojson(file)
    return import_service_territory(
        ServiceTerritoryImport(
            name=name,
            source_type=source_type,
            source_reference=source_reference or file.filename or "browser file upload",
            geojson=geojson,
        )
    )


@router.get("/road-centerlines/summary")
def road_centerline_summary(service_territory_id: int | None = Query(default=None)) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return {**postgis_unavailable_payload(), "road_summary": []}
    rows = _fetch_all(
        """
        SELECT COALESCE(placement_class, 'unknown') AS placement_class,
               COALESCE(road_class, 'unknown') AS road_class,
               excluded,
               count(*) AS road_count,
               COALESCE(sum(length_miles), 0) AS route_miles
        FROM public_road_centerlines
        WHERE (:service_territory_id IS NULL OR service_territory_id = :service_territory_id)
        GROUP BY placement_class, road_class, excluded
        ORDER BY excluded, placement_class, road_count DESC
        LIMIT 200
        """,
        {"service_territory_id": service_territory_id},
    )
    return {"postgis_configured": True, "road_summary": rows}


@router.post("/road-centerlines/import-geojson", status_code=status.HTTP_201_CREATED)
def import_road_centerlines(payload: RoadCenterlineImport) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    if payload.service_territory_id is not None:
        territory = _fetch_one("SELECT id FROM service_territories WHERE id = :id", {"id": payload.service_territory_id})
        if not territory:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service territory not found")
    features = _extract_line_features(payload.geojson, payload.max_features)
    rows = []
    for index, feature in enumerate(features):
        properties = feature.get("properties") or {}
        road_class = _road_class(properties)
        excluded, exclusion_reason = _road_exclusion(road_class, properties)
        rows.append(
            {
                "road_id": str(properties.get("id") or properties.get("osm_id") or properties.get("OBJECTID") or properties.get("objectid") or f"road-{uuid4().hex[:14]}"),
                "service_territory_id": payload.service_territory_id,
                "source_name": payload.source_name,
                "source_reference": payload.source_reference,
                "road_name": str(properties.get("name") or properties.get("FULLNAME") or properties.get("road_name") or f"synthetic-road-input-{index + 1}"),
                "road_class": road_class,
                "placement_class": _placement_class(road_class, properties),
                "excluded": excluded,
                "exclusion_reason": exclusion_reason,
                "geometry": json.dumps(feature["geometry"]),
                "properties": json.dumps(properties),
            }
        )
    if not rows:
        return {"postgis_configured": True, "imported": 0, "excluded": 0}
    with engine.begin() as connection:
        result = connection.execute(
            text(
                """
                WITH raw AS (
                  SELECT
                    CAST(:road_id AS text) AS road_id,
                    CAST(:service_territory_id AS bigint) AS service_territory_id,
                    CAST(:source_name AS text) AS source_name,
                    CAST(:source_reference AS text) AS source_reference,
                    CAST(:road_name AS text) AS road_name,
                    CAST(:road_class AS text) AS road_class,
                    CAST(:placement_class AS text) AS placement_class,
                    CAST(:excluded AS boolean) AS excluded,
                    CAST(:exclusion_reason AS text) AS exclusion_reason,
                    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)) AS geom,
                    CAST(:properties AS jsonb) AS properties
                )
                INSERT INTO public_road_centerlines (
                  road_id, service_territory_id, source_name, source_reference,
                  road_name, road_class, placement_class, excluded, exclusion_reason,
                  geom, geom_3857, length_miles, properties
                )
                SELECT
                  road_id, service_territory_id, source_name, source_reference,
                  road_name, road_class, placement_class, excluded, exclusion_reason,
                  geom, ST_Transform(geom, 3857),
                  ST_Length(ST_Transform(geom, 5070)) / 1609.344,
                  properties
                FROM raw
                WHERE ST_GeometryType(geom) IN ('ST_MultiLineString', 'ST_LineString')
                ON CONFLICT (road_id)
                DO UPDATE SET service_territory_id = EXCLUDED.service_territory_id,
                              source_name = EXCLUDED.source_name,
                              source_reference = EXCLUDED.source_reference,
                              road_name = EXCLUDED.road_name,
                              road_class = EXCLUDED.road_class,
                              placement_class = EXCLUDED.placement_class,
                              excluded = EXCLUDED.excluded,
                              exclusion_reason = EXCLUDED.exclusion_reason,
                              geom = EXCLUDED.geom,
                              geom_3857 = EXCLUDED.geom_3857,
                              length_miles = EXCLUDED.length_miles,
                              properties = EXCLUDED.properties
                """
            ),
            rows,
        )
    return {
        "postgis_configured": True,
        "features_received": len(rows),
        "imported_or_updated": result.rowcount if result.rowcount is not None else len(rows),
        "excluded": sum(1 for row in rows if row["excluded"]),
        "synthetic_generation_note": "Road centerlines are public/reference inputs only. Generated telecom assets remain synthetic and are clipped to service territory during the worker job.",
    }


@router.post("/road-centerlines/import-geojson-file", status_code=status.HTTP_201_CREATED)
async def import_road_centerlines_file(
    file: UploadFile = File(...),
    source_name: str = Form("dashboard GeoJSON road centerlines"),
    source_reference: str | None = Form(None),
    service_territory_id: int | None = Form(None),
    max_features: int = Form(50_000),
) -> dict[str, Any]:
    geojson = await _read_uploaded_geojson(file)
    return import_road_centerlines(
        RoadCenterlineImport(
            source_name=source_name,
            source_reference=source_reference or file.filename or "browser file upload",
            service_territory_id=service_territory_id,
            geojson=geojson,
            max_features=max_features,
        )
    )


@router.post("/service-territories/{territory_id}/validate")
def validate_service_territory(territory_id: int) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    row = _fetch_one(
        """
        UPDATE service_territories
        SET boundary_status = CASE
              WHEN ST_IsValid(geom) AND NOT ST_IsEmpty(geom) THEN 'validated'
              ELSE 'needs_revision'
            END,
            geom_3857 = ST_Transform(geom, 3857),
            area_sq_miles = ST_Area(ST_Transform(geom, 5070)) / 2589988.110336,
            validation_json = COALESCE(validation_json, '{}'::jsonb) || jsonb_build_object(
              'is_valid', ST_IsValid(geom),
              'reason', ST_IsValidReason(geom),
              'is_empty', ST_IsEmpty(geom),
              'geometry_type', ST_GeometryType(geom),
              'validated_at', now(),
              'validation_action', 'manual_or_api_validate'
            ),
            updated_at = now()
        WHERE id = :territory_id
        RETURNING id, territory_key, name, boundary_status,
                  (validation_json->>'is_valid')::boolean AS is_valid,
                  validation_json->>'reason' AS reason,
                  area_sq_miles,
                  validation_json
        """,
        {"territory_id": territory_id},
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service territory not found")
    return {"postgis_configured": True, "validation": row}


@router.get("/service-territories/{territory_id}/generation-preflight")
def generation_preflight(
    territory_id: int,
    target_pole_count: int = Query(default=10_000_000, ge=1, le=50_000_000),
    batch_size: int = Query(default=50_000, ge=10_000, le=100_000),
    density_profile: Literal["auto", "urban", "suburban", "rural", "mixed"] = Query(default="auto"),
) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return {
            **postgis_unavailable_payload(),
            "preflight": None,
            "road_plan": [],
            "warnings": ["PostGIS is required to estimate clipped road mileage and synthetic pole placement."],
        }
    return _generation_preflight(territory_id, target_pole_count, batch_size, density_profile)


@router.post("/service-territories/{territory_id}/generation-preflight")
def generation_preflight_post(territory_id: int, payload: SyntheticGenerationPreflightRequest) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return {
            **postgis_unavailable_payload(),
            "preflight": None,
            "road_plan": [],
            "warnings": ["PostGIS is required to estimate clipped road mileage and synthetic pole placement."],
        }
    return _generation_preflight(territory_id, payload.target_pole_count, payload.batch_size, payload.density_profile)


@router.post("/service-territories/{territory_id}/generate")
@router.post("/service-territories/{territory_id}/generate-synthetic-assets")
def queue_synthetic_generation(territory_id: int, payload: SyntheticGenerationRequest) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    territory = _fetch_one("SELECT id, boundary_status FROM service_territories WHERE id = :id", {"id": territory_id})
    if not territory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service territory not found")
    if territory["boundary_status"] != "validated":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Validate the service territory before generating synthetic assets")
    preflight = _generation_preflight(territory_id, payload.target_pole_count, payload.batch_size, payload.density_profile)
    if preflight["preflight"]["eligible_road_segment_count"] == 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Import eligible public road centerlines before generating synthetic telecom assets")
    job_key = f"gisgen-{uuid4().hex[:14]}"
    row = _fetch_one(
        """
        INSERT INTO synthetic_generation_jobs (
          job_key, service_territory_id, seed, target_pole_count, density_profile,
          attachment_profile, road_source, batch_size, job_status, current_step, log_json
        )
        VALUES (
          :job_key, :territory_id, :seed, :target_pole_count, :density_profile,
          :attachment_profile, :road_source, :batch_size, 'queued', 'waiting_for_background_worker',
          CAST(:log_json AS jsonb)
        )
        RETURNING id, job_key, service_territory_id, seed, target_pole_count, job_status,
                  current_step, progress_percent, inserted_pole_count, inserted_span_count,
                  next_road_offset, next_record_batch_id, completed_batch_count
        """,
        {
            "job_key": job_key,
            "territory_id": territory_id,
            "seed": payload.seed,
            "target_pole_count": payload.target_pole_count,
            "density_profile": payload.density_profile,
            "attachment_profile": payload.attachment_profile,
            "road_source": payload.road_source,
            "batch_size": payload.batch_size,
            "log_json": json.dumps([
                "Queued synthetic generation. Worker must clip public roads to the service territory, batch COPY assets, and update dirty tiles incrementally.",
                f"Batch size target: {payload.batch_size} estimated pole records",
                f"Road source: {payload.road_source}",
            ]),
        },
    )
    return {
        "postgis_configured": True,
        "job": row,
        "preflight": preflight["preflight"],
        "workflow": [
            "clip roads to service territory",
            "classify roads urban/suburban/rural",
            "generate poles and spans in COPY batches",
            "generate fiber, splice cases, slack loops, handholes, mux sites",
            "precompute density/cluster/simplified tile tables",
            "mark only affected tiles dirty",
        ],
    }


@router.get("/generation-jobs/{job_key}")
def generation_job(job_key: str) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    row = _fetch_one("SELECT * FROM synthetic_generation_jobs WHERE job_key = :job_key", {"job_key": job_key})
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation job not found")
    return {"postgis_configured": True, "job": row}


@router.get("/generation-jobs/{job_key}/plan")
def generation_job_plan(job_key: str) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    row = _fetch_one("SELECT * FROM synthetic_generation_jobs WHERE job_key = :job_key", {"job_key": job_key})
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation job not found")
    road_plan = _fetch_all(
        """
        WITH territory AS (
          SELECT geom FROM service_territories WHERE id = :territory_id
        ),
        clipped AS (
          SELECT r.placement_class,
                 ST_Length(ST_Transform(ST_Intersection(r.geom, territory.geom), 5070)) / 1609.344 AS clipped_miles
          FROM public_road_centerlines r, territory
          WHERE r.excluded = FALSE
            AND r.geom && territory.geom
            AND ST_Intersects(r.geom, territory.geom)
        )
        SELECT placement_class,
               count(*) AS road_segment_count,
               COALESCE(sum(clipped_miles), 0) AS clipped_route_miles,
               CASE placement_class
                 WHEN 'urban' THEN '90-130 ft'
                 WHEN 'rural' THEN '180-260 ft'
                 ELSE '130-180 ft'
               END AS pole_spacing
        FROM clipped
        GROUP BY placement_class
        ORDER BY placement_class
        """,
        {"territory_id": row["service_territory_id"]},
    )
    return {
        "postgis_configured": True,
        "job": row,
        "road_plan": road_plan,
        "placement_rules": {
            "urban": {"pole_spacing_ft": "90-130", "row_offset_ft": "10-18"},
            "suburban": {"pole_spacing_ft": "130-180", "row_offset_ft": "18-30"},
            "rural": {"pole_spacing_ft": "180-260", "row_offset_ft": "25-45"},
        },
        "execution_note": "Run the background worker module, not the API request thread, to insert poles/spans/attachments in COPY-sized batches.",
    }


@router.post("/generation-jobs/{job_key}/pause")
def pause_generation_job(job_key: str) -> dict[str, Any]:
    return _set_generation_job_status(job_key, "paused", "paused_by_operator")


@router.post("/generation-jobs/{job_key}/resume")
def resume_generation_job(job_key: str) -> dict[str, Any]:
    return _set_generation_job_status(job_key, "queued", "resumed_waiting_for_background_worker")


@router.post("/generation-jobs/{job_key}/cancel")
def cancel_generation_job(job_key: str) -> dict[str, Any]:
    return _set_generation_job_status(job_key, "cancelled", "cancelled_by_operator")


@router.post("/service-territories/{territory_id}/warm-tile-cache")
def warm_service_territory_tile_cache(territory_id: int, payload: TileWarmRequest) -> dict[str, Any]:
    if payload.min_z > payload.max_z:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_z must be less than or equal to max_z")
    invalid_layers = [layer for layer in payload.layers if layer not in supported_layers()]
    if invalid_layers:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unsupported tile layers: {', '.join(invalid_layers)}")
    unsafe = [
        f"{layer}@z{z}"
        for layer in sorted(set(payload.layers))
        for z in range(payload.min_z, payload.max_z + 1)
        if not _is_safe_tile_warm_plan(layer, z)
    ]
    if unsafe:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tile warming is limited to territory and precomputed aggregate/summary plans. Unsafe layer/zoom plans: {', '.join(unsafe[:12])}",
        )
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    territory = _fetch_one(
        """
        SELECT id, territory_key, name
        FROM service_territories
        WHERE id = :territory_id
        """,
        {"territory_id": territory_id},
    )
    if not territory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service territory not found")
    tile_candidates = _territory_tile_candidates(
        territory_id,
        sorted(set(payload.layers)),
        payload.min_z,
        payload.max_z,
        payload.max_tiles,
        payload.only_dirty_or_missing,
    )
    rendered_tiles = []
    skipped_tiles = []
    for tile in tile_candidates:
        try:
            result = get_vector_tile_result(engine, tile["layer"], int(tile["z"]), int(tile["x"]), int(tile["y"]))
            rendered_tiles.append(
                {
                    "layer": tile["layer"],
                    "z": tile["z"],
                    "x": tile["x"],
                    "y": tile["y"],
                    "feature_count": result.feature_count,
                    "truncated": result.truncated,
                    "cache_hit": result.cache_hit,
                }
            )
        except Exception as error:
            skipped_tiles.append({**tile, "error": str(error)})
    return {
        "postgis_configured": True,
        "territory": territory,
        "requested_layers": sorted(set(payload.layers)),
        "zoom_range": [payload.min_z, payload.max_z],
        "only_dirty_or_missing": payload.only_dirty_or_missing,
        "candidate_tile_count": len(tile_candidates),
        "rendered_tile_count": len(rendered_tiles),
        "skipped_tile_count": len(skipped_tiles),
        "truncated": len(tile_candidates) >= payload.max_tiles,
        "rendered_tiles": rendered_tiles[:500],
        "skipped_tiles": skipped_tiles[:100],
        "safety_note": "Tile warming is capped and limited to service-territory/aggregate plans so it never pre-renders raw street-level pole inventory.",
    }


@router.post("/tiles/dirty")
def mark_tile_dirty(payload: DirtyTileRequest) -> dict[str, Any]:
    if payload.layer not in supported_layers():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unsupported tile layer: {payload.layer}")
    max_tile = 2**payload.z
    if payload.x >= max_tile or payload.y >= max_tile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid z/x/y tile coordinate")
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    row = _fetch_one(
        """
        INSERT INTO tile_cache_metadata (layer, z, x, y, dirty, dirty_reason, source_updated_at)
        VALUES (:layer, :z, :x, :y, TRUE, :reason, now())
        ON CONFLICT (layer, z, x, y)
        DO UPDATE SET dirty = TRUE,
                      dirty_reason = EXCLUDED.dirty_reason,
                      source_updated_at = now()
        RETURNING layer, z, x, y, dirty, dirty_reason, source_updated_at
        """,
        {"layer": payload.layer, "z": payload.z, "x": payload.x, "y": payload.y, "reason": payload.reason},
    )
    _execute(
        """
        UPDATE trace_cache
        SET dirty = TRUE,
            dirty_reason = :reason,
            updated_at = now()
        WHERE dirty = FALSE
        """,
        {"reason": f"tile {payload.layer}/{payload.z}/{payload.x}/{payload.y} dirty: {payload.reason}"},
    )
    return {"postgis_configured": True, "dirty_tile": row, "invalidation_scope": "single_tile"}


@router.post("/tiles/dirty-by-geometry")
def mark_tiles_dirty_by_geometry(payload: DirtyGeometryRequest) -> dict[str, Any]:
    if payload.min_z > payload.max_z:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_z must be less than or equal to max_z")
    return _mark_tiles_dirty_by_geometry(
        payload.geojson,
        payload.layers,
        payload.min_z,
        payload.max_z,
        payload.reason,
        payload.max_dirty_tiles,
    )


def _mark_tiles_dirty_by_geometry(geojson: dict[str, Any], layers: list[str], min_z: int, max_z: int, reason: str, max_dirty_tiles: int) -> dict[str, Any]:
    invalid_layers = [layer for layer in layers if layer not in supported_layers()]
    if invalid_layers:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unsupported tile layers: {', '.join(invalid_layers)}")
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    geometry = _extract_any_geojson_geometry(geojson)
    layers_values_sql = ", ".join(f"('{layer}')" for layer in sorted(set(layers)))
    rows = _fetch_all(
        f"""
        WITH raw AS (
          SELECT
            ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS geom,
            ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326), 3857) AS geom_3857
        ),
        requested_layers(layer) AS (
          VALUES {layers_values_sql}
        ),
        zooms AS (
          SELECT generate_series(:min_z, :max_z) AS z
        ),
        bbox_tiles AS (
          SELECT
            z,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((ST_XMin(geom_3857) + 20037508.342789244) / (40075016.68557849 / power(2, z)))::integer)) AS min_x,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((ST_XMax(geom_3857) + 20037508.342789244) / (40075016.68557849 / power(2, z)))::integer)) AS max_x,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((20037508.342789244 - ST_YMax(geom_3857)) / (40075016.68557849 / power(2, z)))::integer)) AS min_y,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((20037508.342789244 - ST_YMin(geom_3857)) / (40075016.68557849 / power(2, z)))::integer)) AS max_y
          FROM raw, zooms
        ),
        tile_candidates AS (
          SELECT b.z, xs.x, ys.y
          FROM bbox_tiles b
          CROSS JOIN LATERAL generate_series(LEAST(b.min_x, b.max_x), GREATEST(b.min_x, b.max_x)) AS xs(x)
          CROSS JOIN LATERAL generate_series(LEAST(b.min_y, b.max_y), GREATEST(b.min_y, b.max_y)) AS ys(y)
        ),
        intersecting AS (
          SELECT requested_layers.layer, tile_candidates.z, tile_candidates.x, tile_candidates.y
          FROM tile_candidates
          CROSS JOIN requested_layers
          CROSS JOIN raw
          WHERE ST_Intersects(raw.geom, ST_Transform(ST_TileEnvelope(tile_candidates.z, tile_candidates.x, tile_candidates.y), 4326))
          ORDER BY tile_candidates.z, requested_layers.layer, tile_candidates.x, tile_candidates.y
          LIMIT :max_dirty_tiles
        )
        INSERT INTO tile_cache_metadata (layer, z, x, y, dirty, dirty_reason, source_updated_at)
        SELECT layer, z, x, y, TRUE, :reason, now()
        FROM intersecting
        ON CONFLICT (layer, z, x, y)
        DO UPDATE SET dirty = TRUE,
                      dirty_reason = EXCLUDED.dirty_reason,
                      source_updated_at = now()
        RETURNING layer, z, x, y, dirty, dirty_reason
        """,
        {
            "geometry": json.dumps(geometry),
            "min_z": min_z,
            "max_z": max_z,
            "reason": reason,
            "max_dirty_tiles": max_dirty_tiles,
        },
    )
    _execute(
        """
        UPDATE trace_cache
        SET dirty = TRUE,
            dirty_reason = :reason,
            updated_at = now()
        WHERE dirty = FALSE
        """,
        {"reason": f"geometry dirty tile invalidation: {reason}"},
    )
    return {
        "postgis_configured": True,
        "dirty_tile_count": len(rows),
        "dirty_tiles": rows[:500],
        "truncated": len(rows) >= max_dirty_tiles,
        "invalidation_scope": "geometry_tile_footprint",
    }


def _is_safe_tile_warm_plan(layer: str, z: int) -> bool:
    plan = choose_plan(layer, z)
    return bool(plan and (plan.is_aggregate or layer == "territory"))


def _territory_tile_candidates(territory_id: int, layers: list[str], min_z: int, max_z: int, max_tiles: int, only_dirty_or_missing: bool) -> list[dict[str, Any]]:
    layers_values_sql = ", ".join(f"('{layer}')" for layer in layers)
    cache_filter = """
      AND (
        :only_dirty_or_missing = FALSE
        OR cache.id IS NULL
        OR cache.dirty = TRUE
        OR cache.mvt IS NULL
      )
    """
    return _fetch_all(
        f"""
        WITH territory AS (
          SELECT geom, geom_3857
          FROM service_territories
          WHERE id = :territory_id
        ),
        requested_layers(layer) AS (
          VALUES {layers_values_sql}
        ),
        zooms AS (
          SELECT generate_series(:min_z, :max_z) AS z
        ),
        bbox_tiles AS (
          SELECT
            z,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((ST_XMin(COALESCE(geom_3857, ST_Transform(geom, 3857))) + 20037508.342789244) / (40075016.68557849 / power(2, z)))::integer)) AS min_x,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((ST_XMax(COALESCE(geom_3857, ST_Transform(geom, 3857))) + 20037508.342789244) / (40075016.68557849 / power(2, z)))::integer)) AS max_x,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((20037508.342789244 - ST_YMax(COALESCE(geom_3857, ST_Transform(geom, 3857)))) / (40075016.68557849 / power(2, z)))::integer)) AS min_y,
            GREATEST(0, LEAST((power(2, z) - 1)::integer, floor((20037508.342789244 - ST_YMin(COALESCE(geom_3857, ST_Transform(geom, 3857)))) / (40075016.68557849 / power(2, z)))::integer)) AS max_y
          FROM territory, zooms
        ),
        candidate_tiles AS (
          SELECT requested_layers.layer, b.z, xs.x, ys.y
          FROM bbox_tiles b
          CROSS JOIN requested_layers
          CROSS JOIN LATERAL generate_series(LEAST(b.min_x, b.max_x), GREATEST(b.min_x, b.max_x)) AS xs(x)
          CROSS JOIN LATERAL generate_series(LEAST(b.min_y, b.max_y), GREATEST(b.min_y, b.max_y)) AS ys(y)
        )
        SELECT candidate_tiles.layer, candidate_tiles.z, candidate_tiles.x, candidate_tiles.y
        FROM candidate_tiles
        CROSS JOIN territory
        LEFT JOIN tile_cache_metadata cache
          ON cache.layer = candidate_tiles.layer
         AND cache.z = candidate_tiles.z
         AND cache.x = candidate_tiles.x
         AND cache.y = candidate_tiles.y
        WHERE ST_Intersects(territory.geom, ST_Transform(ST_TileEnvelope(candidate_tiles.z, candidate_tiles.x, candidate_tiles.y), 4326))
        {cache_filter}
        ORDER BY candidate_tiles.z, candidate_tiles.layer, candidate_tiles.x, candidate_tiles.y
        LIMIT :max_tiles
        """,
        {
            "territory_id": territory_id,
            "min_z": min_z,
            "max_z": max_z,
            "max_tiles": max_tiles,
            "only_dirty_or_missing": only_dirty_or_missing,
        },
    )


@router.post("/proposed-edits/{asset_type}", status_code=status.HTTP_201_CREATED)
def stage_proposed_asset_edit(asset_type: Literal["pole", "span", "fiber_route"], payload: ProposedAssetEditRequest) -> dict[str, Any]:
    if payload.min_dirty_z > payload.max_dirty_z:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_dirty_z must be less than or equal to max_dirty_z")
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    target = _proposed_edit_target(asset_type)
    geometry = _extract_any_geojson_geometry(payload.geojson)
    service_territory_id = payload.service_territory_id or _infer_service_territory_id(target, payload.base_asset_id)
    if service_territory_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="service_territory_id is required when base_asset_id is not supplied")
    proposal_id = payload.proposal_id or f"prop-{asset_type}-{uuid4().hex[:14]}"
    properties = {
        **payload.properties,
        "asset_type": asset_type,
        "base_asset_id": payload.base_asset_id,
        "synthetic": True,
        "proposed_edit": True,
        "data_boundary": "Proposed GIS-scale edit only. Base synthetic network remains unchanged until an explicit commit workflow.",
    }
    row = _fetch_one(
        f"""
        WITH raw AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326) AS geom
        ),
        territory AS (
          SELECT id, geom
          FROM service_territories
          WHERE id = :service_territory_id
        ),
        valid AS (
          SELECT raw.geom
          FROM raw, territory
          WHERE ST_IsValid(raw.geom)
            AND ST_Covers(territory.geom, raw.geom)
        )
        INSERT INTO {target["proposed_table"]} (
          proposal_id, service_territory_id, base_asset_id, edit_status,
          geom, geom_3857, properties
        )
        SELECT
          :proposal_id,
          :service_territory_id,
          :base_asset_id,
          :edit_status,
          geom,
          ST_Transform(geom, 3857),
          CAST(:properties AS jsonb)
        FROM valid
        RETURNING id, proposal_id, service_territory_id, base_asset_id, edit_status,
                  ST_AsGeoJSON(geom)::json AS geometry, properties, created_at, updated_at
        """,
        {
            "geometry": json.dumps(geometry),
            "service_territory_id": service_territory_id,
            "proposal_id": proposal_id,
            "base_asset_id": payload.base_asset_id,
            "edit_status": payload.edit_status,
            "properties": json.dumps(properties),
        },
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Proposed edit geometry must be valid and fully inside the selected service territory")
    dirty = _mark_tiles_dirty_by_geometry(
        payload.geojson,
        target["layers"],
        payload.min_dirty_z,
        payload.max_dirty_z,
        f"{payload.reason}: {proposal_id}",
        payload.max_dirty_tiles,
    )
    return {
        "postgis_configured": True,
        "asset_type": asset_type,
        "proposed_edit": row,
        "dirty_tiles": dirty,
        "base_network_mutated": False,
        "workflow": "staged_proposed_edit",
        "safety_note": "The base synthetic layer is not modified. Commit/as-built promotion must be an explicit later workflow.",
    }


@router.get("/assets/pole/{pole_id}")
def pole_detail(pole_id: str) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    row = _fetch_one(
        """
        SELECT pole_id, service_territory_id, county, town, road_name, placement_class, pole_role,
               asset_status, support_type, height_ft, row_offset_ft, span_prev_ft,
               ST_X(geom) AS longitude, ST_Y(geom) AS latitude, properties
        FROM telecom_poles
        WHERE pole_id = :pole_id
        """,
        {"pole_id": pole_id},
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pole not found")
    spans = _fetch_all(
        """
        SELECT span_id, a_pole_id, z_pole_id, span_type, asset_status, length_ft, fiber_route_id
        FROM telecom_spans
        WHERE a_pole_id = :pole_id OR z_pole_id = :pole_id
        ORDER BY span_id
        LIMIT 50
        """,
        {"pole_id": pole_id},
    )
    return {"postgis_configured": True, "pole": row, "connected_spans": spans}


@router.get("/assets/{asset_type}/{asset_id}")
def gis_asset_detail(asset_type: str, asset_id: str) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    target = _asset_detail_target(asset_type)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unsupported GIS asset detail type: {asset_type}")
    row = _fetch_one(
        f"""
        SELECT {target["id_column"]} AS id,
               {target["label_sql"]} AS label,
               COALESCE(asset_status, 'synthetic') AS status,
               service_territory_id,
               display_class,
               ST_X(ST_Centroid(geom)) AS longitude,
               ST_Y(ST_Centroid(geom)) AS latitude,
               ST_AsGeoJSON(ST_Envelope(geom))::json AS bbox_geojson,
               properties
               {target["extra_select"]}
        FROM {target["table"]}
        WHERE {target["id_column"]} = :asset_id
        """,
        {"asset_id": asset_id},
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GIS asset not found")
    related: dict[str, Any] = {}
    if asset_type == "span":
        related["endpoint_poles"] = _fetch_all(
            """
            SELECT pole_id, road_name, placement_class, asset_status, ST_X(geom) AS longitude, ST_Y(geom) AS latitude
            FROM telecom_poles
            WHERE pole_id IN (:a_pole_id, :z_pole_id)
            ORDER BY pole_id
            LIMIT 2
            """,
            {"a_pole_id": row.get("a_pole_id"), "z_pole_id": row.get("z_pole_id")},
        )
    if asset_type in {"fiber_route", "circuit_route"}:
        related["network_edges"] = _fetch_all(
            """
            SELECT edge_id, a_node_id, z_node_id, edge_type, weight
            FROM network_edges
            WHERE asset_id = :asset_id
            ORDER BY edge_id
            LIMIT 50
            """,
            {"asset_id": asset_id},
        )
        related["point_assets"] = _route_point_assets(asset_id)
    if asset_type in {"splice_case", "handhole", "slack_loop", "mux_site"}:
        related["connected_pole"] = _fetch_one(
            """
            SELECT pole_id, road_name, placement_class, asset_status, ST_X(geom) AS longitude, ST_Y(geom) AS latitude
            FROM telecom_poles
            WHERE pole_id = :pole_id
            """,
            {"pole_id": row.get("pole_id")},
        )
        related["network_edges"] = _fetch_all(
            """
            SELECT edge_id, a_node_id, z_node_id, edge_type, asset_id, weight
            FROM network_edges
            WHERE a_node_id = :asset_id OR z_node_id = :asset_id
            ORDER BY edge_id
            LIMIT 25
            """,
            {"asset_id": asset_id},
        )
    return {
        "postgis_configured": True,
        "asset_type": asset_type,
        "asset": row,
        "related": related,
        "detail_strategy": "click_to_load_server_detail",
        "payload_note": "Vector tiles contain minimal symbology fields; full selected asset details are loaded by this endpoint.",
    }


@router.get("/search")
def server_search(
    type: Literal["pole", "circuit", "fiber", "splice", "handhole", "mux"] = Query("pole"),
    q: str = Query("", min_length=2),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return {**postgis_unavailable_payload(), "results": [], "limit": limit, "offset": offset}
    target = _search_target(type)
    safe_count = safe_limit(limit)
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Search query must contain at least two non-space characters")
    where_sql = " OR ".join(f"COALESCE({column}, '') ILIKE :query ESCAPE '!'" for column in target["search_columns"])
    similarity_sql = "GREATEST(" + ", ".join(f"similarity(COALESCE({column}, ''), :raw_query)" for column in target["search_columns"]) + ")"
    rows = _fetch_all(
        f"""
        SELECT {target["id_column"]} AS id,
               COALESCE({target["label_column"]}, {target["id_column"]}) AS label,
               COALESCE(asset_status, 'synthetic') AS status,
               ST_AsGeoJSON(ST_Envelope(geom))::json AS bbox_geojson
        FROM {target["table"]}
        WHERE {where_sql}
        ORDER BY {similarity_sql} DESC, {target["id_column"]}
        LIMIT :limit OFFSET :offset
        """,
        {"query": _like_pattern(query), "raw_query": query, "limit": safe_count, "offset": offset},
    )
    return {
        "postgis_configured": True,
        "type": type,
        "query": query,
        "limit": safe_count,
        "offset": offset,
        "search_columns": target["search_columns"],
        "search_strategy": "indexed_columns_only",
        "results": rows,
    }


@router.post("/trace/circuit")
def trace_circuit(payload: TraceRequest) -> dict[str, Any]:
    return _trace_network("circuit", payload)


@router.post("/trace/fiber")
def trace_fiber(payload: TraceRequest) -> dict[str, Any]:
    return _trace_network("fiber", payload)


@router.post("/trace/span-impact")
def trace_span_impact(payload: TraceRequest) -> dict[str, Any]:
    return _trace_network("span-impact", payload)


def _trace_network(trace_type: str, payload: TraceRequest) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    if not payload.asset_id and not (payload.a_node_id and payload.z_node_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="asset_id or a_node_id/z_node_id is required")
    request_json = payload.model_dump()
    request_hash = hashlib.sha256(json.dumps({"trace_type": trace_type, **request_json}, sort_keys=True).encode("utf-8")).hexdigest()
    cached = _fetch_one(
        """
        SELECT response_json
        FROM trace_cache
        WHERE trace_type = :trace_type
          AND request_hash = :request_hash
          AND dirty = FALSE
        """,
        {"trace_type": trace_type, "request_hash": request_hash},
    )
    if cached:
        response = cached["response_json"]
        if isinstance(response, dict):
            response["trace_summary"] = {**response.get("trace_summary", {}), "cached": True}
            return response
    if payload.a_node_id and payload.z_node_id:
        rows = _trace_node_path(payload)
        trace_mode = "recursive_node_path"
    else:
        rows = _trace_asset_edges(payload)
        trace_mode = "asset_edge_lookup"
    response_payload = {
        "postgis_configured": True,
        "trace_type": trace_type,
        "trace_summary": {
            "edge_count": len(rows),
            "cached": False,
            "request_hash": request_hash,
            "trace_mode": trace_mode,
            "max_depth": payload.max_depth,
            "max_edges": payload.max_edges,
        },
        "ordered_path": rows,
        "affected_assets": sorted({row["asset_id"] for row in rows if row.get("asset_id")}),
        "cache_note": "Trace results are cached by request hash and marked dirty when affected map tiles are edited.",
    }
    _fetch_one(
        """
        INSERT INTO trace_cache (trace_type, request_hash, request_json, response_json, dirty)
        VALUES (:trace_type, :request_hash, CAST(:request_json AS jsonb), CAST(:response_json AS jsonb), FALSE)
        ON CONFLICT (trace_type, request_hash)
        DO UPDATE SET response_json = EXCLUDED.response_json,
                      request_json = EXCLUDED.request_json,
                      dirty = FALSE,
                      dirty_reason = NULL,
                      updated_at = now()
        RETURNING id
        """,
        {
            "trace_type": trace_type,
            "request_hash": request_hash,
            "request_json": json.dumps(request_json),
            "response_json": json.dumps(response_payload),
        },
    )
    return response_payload


def _trace_asset_edges(payload: TraceRequest) -> list[dict[str, Any]]:
    return _fetch_all(
        """
        SELECT edge_id, a_node_id, z_node_id, edge_type, asset_id, weight,
               1 AS depth,
               weight AS cumulative_weight,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM network_edges
        WHERE asset_id = :asset_id
        ORDER BY weight, edge_id
        LIMIT :max_edges
        """,
        {"asset_id": payload.asset_id, "max_edges": payload.max_edges},
    )


def _trace_node_path(payload: TraceRequest) -> list[dict[str, Any]]:
    return _fetch_all(
        _recursive_trace_sql(),
        {
            "asset_id": payload.asset_id,
            "a_node_id": payload.a_node_id,
            "z_node_id": payload.z_node_id,
            "max_edges": payload.max_edges,
            "max_depth": payload.max_depth,
        },
    )


def _recursive_trace_sql() -> str:
    return """
    WITH RECURSIVE candidate_edges AS (
      SELECT
        edge_id,
        a_node_id,
        z_node_id,
        edge_type,
        asset_id,
        weight,
        geom,
        'forward'::text AS direction,
        edge_id || ':forward' AS step_key
      FROM network_edges
      WHERE (:asset_id IS NULL OR asset_id = :asset_id)
      UNION ALL
      SELECT
        edge_id,
        z_node_id AS a_node_id,
        a_node_id AS z_node_id,
        edge_type,
        asset_id,
        weight,
        ST_Reverse(geom) AS geom,
        'reverse'::text AS direction,
        edge_id || ':reverse' AS step_key
      FROM network_edges
      WHERE (:asset_id IS NULL OR asset_id = :asset_id)
    ),
    walk AS (
      SELECT
        edge_id,
        a_node_id,
        z_node_id,
        edge_type,
        asset_id,
        weight,
        geom,
        direction,
        step_key,
        ARRAY[step_key]::text[] AS step_path,
        ARRAY[a_node_id, z_node_id]::text[] AS node_path,
        z_node_id AS current_node,
        weight::double precision AS cumulative_weight,
        1 AS depth
      FROM candidate_edges
      WHERE a_node_id = :a_node_id
      UNION ALL
      SELECT
        next_edge.edge_id,
        next_edge.a_node_id,
        next_edge.z_node_id,
        next_edge.edge_type,
        next_edge.asset_id,
        next_edge.weight,
        next_edge.geom,
        next_edge.direction,
        next_edge.step_key,
        walk.step_path || next_edge.step_key,
        walk.node_path || next_edge.z_node_id,
        next_edge.z_node_id,
        walk.cumulative_weight + next_edge.weight,
        walk.depth + 1
      FROM walk
      JOIN candidate_edges next_edge ON next_edge.a_node_id = walk.current_node
      WHERE walk.depth < :max_depth
        AND NOT next_edge.step_key = ANY(walk.step_path)
        AND NOT next_edge.z_node_id = ANY(walk.node_path)
    ),
    best_path AS (
      SELECT step_path, cumulative_weight, depth
      FROM walk
      WHERE current_node = :z_node_id
      ORDER BY cumulative_weight, depth
      LIMIT 1
    )
    SELECT
      edge.edge_id,
      edge.a_node_id,
      edge.z_node_id,
      edge.edge_type,
      edge.asset_id,
      edge.weight,
      edge.direction,
      array_position(best_path.step_path, edge.step_key) AS depth,
      best_path.cumulative_weight,
      ST_AsGeoJSON(edge.geom)::json AS geometry
    FROM best_path
    JOIN candidate_edges edge ON edge.step_key = ANY(best_path.step_path)
    ORDER BY array_position(best_path.step_path, edge.step_key)
    LIMIT :max_edges
    """


def _asset_detail_target(asset_type: str) -> dict[str, str] | None:
    targets = {
        "span": {
            "table": "telecom_spans",
            "id_column": "span_id",
            "label_sql": "span_id",
            "extra_select": ", a_pole_id, z_pole_id, span_type, length_ft, fiber_route_id",
        },
        "fiber_route": {
            "table": "fiber_routes",
            "id_column": "fiber_route_id",
            "label_sql": "route_name",
            "extra_select": ", route_name, route_type, fiber_count, criticality",
        },
        "circuit_route": {
            "table": "circuit_routes",
            "id_column": "circuit_route_id",
            "label_sql": "route_name",
            "extra_select": ", route_name, route_type, fiber_count, criticality",
        },
        "splice_case": {
            "table": "splice_cases",
            "id_column": "splice_case_id",
            "label_sql": "splice_case_id",
            "extra_select": ", route_id, pole_id",
        },
        "handhole": {
            "table": "handholes",
            "id_column": "handhole_id",
            "label_sql": "handhole_id",
            "extra_select": ", route_id, pole_id",
        },
        "slack_loop": {
            "table": "slack_loops",
            "id_column": "slack_loop_id",
            "label_sql": "slack_loop_id",
            "extra_select": ", route_id, pole_id",
        },
        "mux_site": {
            "table": "mux_sites",
            "id_column": "mux_site_id",
            "label_sql": "mux_site_id",
            "extra_select": ", route_id, pole_id",
        },
    }
    return targets.get(asset_type)


def _proposed_edit_target(asset_type: str) -> dict[str, Any]:
    targets = {
        "pole": {
            "proposed_table": "proposed_poles",
            "base_table": "telecom_poles",
            "base_id_column": "pole_id",
            "layers": ["poles", "pole_clusters", "spans"],
        },
        "span": {
            "proposed_table": "proposed_spans",
            "base_table": "telecom_spans",
            "base_id_column": "span_id",
            "layers": ["spans", "poles"],
        },
        "fiber_route": {
            "proposed_table": "proposed_fiber_routes",
            "base_table": "fiber_routes",
            "base_id_column": "fiber_route_id",
            "layers": ["fiber_routes", "spans", "circuit_routes"],
        },
    }
    return targets[asset_type]


def _infer_service_territory_id(target: dict[str, Any], base_asset_id: str | None) -> int | None:
    if not base_asset_id:
        return None
    row = _fetch_one(
        f"""
        SELECT service_territory_id
        FROM {target["base_table"]}
        WHERE {target["base_id_column"]} = :base_asset_id
        """,
        {"base_asset_id": base_asset_id},
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Base asset not found for proposed edit")
    return int(row["service_territory_id"]) if row.get("service_territory_id") is not None else None


def _route_point_assets(route_id: str) -> dict[str, list[dict[str, Any]]]:
    related: dict[str, list[dict[str, Any]]] = {}
    for asset_type, table_name, id_column in [
        ("splice_cases", "splice_cases", "splice_case_id"),
        ("handholes", "handholes", "handhole_id"),
        ("slack_loops", "slack_loops", "slack_loop_id"),
        ("mux_sites", "mux_sites", "mux_site_id"),
    ]:
        related[asset_type] = _fetch_all(
            f"""
            SELECT {id_column} AS id, asset_status, pole_id, ST_X(geom) AS longitude, ST_Y(geom) AS latitude
            FROM {table_name}
            WHERE route_id = :route_id
            ORDER BY {id_column}
            LIMIT 25
            """,
            {"route_id": route_id},
        )
    return related


def _search_target(asset_type: str) -> dict[str, Any]:
    targets = {
        "pole": {
            "table": "telecom_poles",
            "id_column": "pole_id",
            "label_column": "pole_id",
            "search_columns": ["pole_id", "road_name", "town", "county"],
        },
        "circuit": {
            "table": "circuit_routes",
            "id_column": "circuit_route_id",
            "label_column": "route_name",
            "search_columns": ["circuit_route_id", "route_name"],
        },
        "fiber": {
            "table": "fiber_routes",
            "id_column": "fiber_route_id",
            "label_column": "route_name",
            "search_columns": ["fiber_route_id", "route_name"],
        },
        "splice": {
            "table": "splice_cases",
            "id_column": "splice_case_id",
            "label_column": "splice_case_id",
            "search_columns": ["splice_case_id", "route_id", "pole_id"],
        },
        "handhole": {
            "table": "handholes",
            "id_column": "handhole_id",
            "label_column": "handhole_id",
            "search_columns": ["handhole_id", "route_id", "pole_id"],
        },
        "mux": {
            "table": "mux_sites",
            "id_column": "mux_site_id",
            "label_column": "mux_site_id",
            "search_columns": ["mux_site_id", "route_id", "pole_id"],
        },
    }
    return targets[asset_type]


def _like_pattern(value: str) -> str:
    escaped = value.replace("!", "!!").replace("%", "!%").replace("_", "!_")
    return f"%{escaped}%"


def _generation_preflight(territory_id: int, target_pole_count: int, batch_size: int, density_profile: str) -> dict[str, Any]:
    territory = _fetch_one(
        """
        SELECT id, territory_key, name, boundary_status, area_sq_miles
        FROM service_territories
        WHERE id = :territory_id
        """,
        {"territory_id": territory_id},
    )
    if not territory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service territory not found")

    road_plan = _fetch_all(
        """
        WITH territory AS (
          SELECT id, geom FROM service_territories WHERE id = :territory_id
        ),
        candidate_roads AS (
          SELECT
            COALESCE(r.placement_class, 'suburban') AS placement_class,
            COALESCE(r.road_class, 'unknown') AS road_class,
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
            placement_class,
            road_class,
            (ST_Dump(ST_CollectionExtract(geom, 2))).geom AS geom
          FROM candidate_roads
        ),
        measured AS (
          SELECT
            placement_class,
            road_class,
            ST_Length(ST_Transform(geom, 3857)) / 0.3048 AS length_ft,
            ST_Length(ST_Transform(geom, 5070)) / 1609.344 AS length_miles,
            CASE
              WHEN CAST(:target_pole_count AS bigint) >= 10000000
                THEN CASE placement_class WHEN 'urban' THEN 100 WHEN 'rural' THEN 200 ELSE 145 END
              ELSE CASE placement_class WHEN 'urban' THEN 110 WHEN 'rural' THEN 220 ELSE 155 END
            END AS spacing_ft,
            CASE placement_class WHEN 'urban' THEN 14 WHEN 'rural' THEN 35 ELSE 24 END AS row_offset_ft
          FROM clipped
          WHERE NOT ST_IsEmpty(geom)
        ),
        eligible AS (
          SELECT
            placement_class,
            road_class,
            length_ft,
            length_miles,
            spacing_ft,
            row_offset_ft,
            GREATEST(2, floor(length_ft / NULLIF(spacing_ft, 0))::bigint + 1) AS estimated_poles,
            GREATEST(1, floor(length_ft / NULLIF(spacing_ft, 0))::bigint) AS estimated_spans
          FROM measured
          WHERE length_ft >= 120
        )
        SELECT
          placement_class,
          count(*) AS eligible_road_segment_count,
          COALESCE(sum(length_miles), 0) AS clipped_route_miles,
          COALESCE(sum(estimated_poles), 0) AS estimated_poles,
          COALESCE(sum(estimated_spans), 0) AS estimated_spans,
          min(spacing_ft) AS spacing_ft,
          min(row_offset_ft) AS row_offset_ft,
          count(DISTINCT road_class) AS road_class_count
        FROM eligible
        GROUP BY placement_class
        ORDER BY placement_class
        """,
        {"territory_id": territory_id, "target_pole_count": target_pole_count},
    )
    totals = {
        "eligible_road_segment_count": sum(_as_int(row.get("eligible_road_segment_count")) for row in road_plan),
        "clipped_route_miles": round(sum(_as_float(row.get("clipped_route_miles")) for row in road_plan), 3),
        "estimated_poles": sum(_as_int(row.get("estimated_poles")) for row in road_plan),
        "estimated_spans": sum(_as_int(row.get("estimated_spans")) for row in road_plan),
    }
    target_fill_percent = round((min(totals["estimated_poles"], target_pole_count) / max(1, target_pole_count)) * 100, 2)
    estimated_worker_batches = (totals["estimated_poles"] + batch_size - 1) // batch_size if totals["estimated_poles"] else 0
    warnings = []
    if territory["boundary_status"] != "validated":
        warnings.append("Validate the service territory before generating synthetic assets.")
    if totals["eligible_road_segment_count"] == 0:
        warnings.append("No eligible public road centerlines intersect this territory after clipping and exclusions.")
    if totals["estimated_poles"] < target_pole_count:
        warnings.append("The clipped road network estimates fewer poles than the requested target; generation will stop when eligible roads are exhausted.")
    if target_pole_count >= 10_000_000 and totals["estimated_poles"] < 10_000_000:
        warnings.append("This preflight does not currently estimate enough street mileage for a 10M-pole run in this territory.")

    return {
        "postgis_configured": True,
        "territory": territory,
        "preflight": {
            **totals,
            "target_pole_count": target_pole_count,
            "target_fill_percent": target_fill_percent,
            "density_profile": density_profile,
            "batch_size": batch_size,
            "batch_size_scope": "estimated_pole_records_per_worker_transaction",
            "estimated_worker_batches": estimated_worker_batches,
            "status": "ready" if territory["boundary_status"] == "validated" and totals["eligible_road_segment_count"] > 0 else "not_ready",
            "synthetic_data_only": True,
        },
        "road_plan": road_plan,
        "warnings": warnings,
        "rules": {
            "urban": {"spacing_ft": "90-130 target; worker default 110", "row_offset_ft": "10-18 target; worker default 14"},
            "suburban": {"spacing_ft": "130-180 target; worker default 155", "row_offset_ft": "18-30 target; worker default 24"},
            "rural": {"spacing_ft": "180-260 target; worker default 220", "row_offset_ft": "25-45 target; worker default 35"},
        },
    }


def _as_int(value: Any) -> int:
    return int(value or 0)


def _as_float(value: Any) -> float:
    return float(value or 0)


def _set_generation_job_status(job_key: str, job_status: str, current_step: str) -> dict[str, Any]:
    if not is_postgis_engine(engine):
        return postgis_unavailable_payload()
    row = _fetch_one(
        """
        UPDATE synthetic_generation_jobs
        SET job_status = :job_status,
            current_step = :current_step,
            log_json = log_json || jsonb_build_array(CAST(:log_entry AS text))
        WHERE job_key = :job_key
        RETURNING id, job_key, service_territory_id, job_status, current_step, progress_percent,
                  inserted_pole_count, inserted_span_count, next_road_offset, next_record_batch_id, completed_batch_count
        """,
        {
            "job_key": job_key,
            "job_status": job_status,
            "current_step": current_step,
            "log_entry": f"{current_step}",
        },
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation job not found")
    return {"postgis_configured": True, "job": row}


def _extract_line_features(geojson: dict[str, Any], max_features: int) -> list[dict[str, Any]]:
    geojson_type = geojson.get("type")
    if geojson_type == "FeatureCollection":
        features = [feature for feature in geojson.get("features", []) if isinstance(feature, dict)]
    elif geojson_type == "Feature":
        features = [geojson]
    elif geojson_type in {"LineString", "MultiLineString"}:
        features = [{"type": "Feature", "properties": {}, "geometry": geojson}]
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GeoJSON must contain LineString or MultiLineString road features")
    line_features = []
    for feature in features[:max_features]:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") not in {"LineString", "MultiLineString"}:
            continue
        line_features.append({"properties": feature.get("properties") or {}, "geometry": geometry})
    if not line_features:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No LineString or MultiLineString road features found")
    return line_features


async def _read_uploaded_geojson(file: UploadFile) -> dict[str, Any]:
    content = await file.read(MAX_GEOJSON_UPLOAD_BYTES + 1)
    if len(content) > MAX_GEOJSON_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"GeoJSON upload is limited to {MAX_GEOJSON_UPLOAD_BYTES // (1024 * 1024)} MB. Use a managed PostGIS loader or chunked import for larger public road datasets.",
        )
    try:
        text_payload = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GeoJSON upload must be UTF-8 encoded text") from error
    try:
        geojson = json.loads(text_payload)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid GeoJSON JSON: {error.msg}") from error
    if not isinstance(geojson, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GeoJSON upload must be a JSON object")
    return geojson


def _road_class(properties: dict[str, Any]) -> str:
    for key in ["road_class", "highway", "RTTYP", "MTFCC", "fclass", "type", "CLASS"]:
        value = properties.get(key)
        if value:
            return str(value).lower().replace(" ", "_")
    return "unknown"


def _road_exclusion(road_class: str, properties: dict[str, Any]) -> tuple[bool, str | None]:
    road_text = " ".join([road_class, *(str(value).lower() for value in properties.values() if isinstance(value, str))])
    exclusions = {
        "motorway": "highway_or_ramp",
        "trunk": "highway_or_ramp",
        "ramp": "highway_or_ramp",
        "rail": "rail_or_non_road",
        "railway": "rail_or_non_road",
        "water": "water_or_non_road",
        "building": "building_or_non_road",
    }
    for token, reason in exclusions.items():
        if token in road_text:
            return True, reason
    return False, None


def _placement_class(road_class: str, properties: dict[str, Any]) -> str:
    road_text = " ".join([road_class, *(str(value).lower() for value in properties.values() if isinstance(value, str))])
    if any(token in road_text for token in ["residential", "living_street", "service", "city", "urban"]):
        return "urban"
    if any(token in road_text for token in ["track", "unclassified", "rural", "county", "local"]):
        return "rural"
    return "suburban"


def _extract_geojson_geometry(geojson: dict[str, Any]) -> dict[str, Any]:
    geojson_type = geojson.get("type")
    if geojson_type in {"Polygon", "MultiPolygon", "GeometryCollection"}:
        if geojson_type == "GeometryCollection":
            geometries = geojson.get("geometries") or []
            if not geometries or any((geometry or {}).get("type") not in {"Polygon", "MultiPolygon"} for geometry in geometries):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service territory GeometryCollection must contain only Polygon or MultiPolygon geometries")
        return geojson
    if geojson_type == "Feature" and isinstance(geojson.get("geometry"), dict):
        geometry = geojson["geometry"]
        if geometry.get("type") not in {"Polygon", "MultiPolygon", "GeometryCollection"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service territory Feature must contain Polygon or MultiPolygon geometry")
        return _extract_geojson_geometry(geometry)
    if geojson_type == "FeatureCollection" and geojson.get("features"):
        geometries = [
            feature.get("geometry")
            for feature in geojson["features"]
            if isinstance(feature.get("geometry"), dict) and feature["geometry"].get("type") in {"Polygon", "MultiPolygon"}
        ]
        if len(geometries) == 1:
            return geometries[0]
        if len(geometries) > 1:
            return {"type": "GeometryCollection", "geometries": geometries}
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GeoJSON must contain Polygon or MultiPolygon service territory geometry")


def _extract_any_geojson_geometry(geojson: dict[str, Any]) -> dict[str, Any]:
    allowed = {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"}
    geojson_type = geojson.get("type")
    if geojson_type in allowed:
        return geojson
    if geojson_type == "Feature" and isinstance(geojson.get("geometry"), dict):
        geometry = geojson["geometry"]
        if geometry.get("type") in allowed:
            return geometry
    if geojson_type == "FeatureCollection" and geojson.get("features"):
        geometries = [feature.get("geometry") for feature in geojson["features"] if isinstance(feature.get("geometry"), dict)]
        if len(geometries) == 1 and geometries[0].get("type") in allowed:
            return geometries[0]
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GeoJSON must contain one point, line, or polygon geometry")


def _validate_geometry_payload(geometry: dict[str, Any]) -> dict[str, Any]:
    return {
        "input_geometry_type": geometry.get("type"),
        "normalization": "Polygon and MultiPolygon inputs are normalized to a validated PostGIS MultiPolygon boundary.",
        "rule": "All synthetic assets must be generated with ST_Intersects/ST_Covers clipping against this service territory.",
    }


def _fetch_one(sql: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rows = _fetch_all(sql, params)
    return rows[0] if rows else None


def _fetch_all(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.begin() as connection:
        result = connection.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]


def _execute(sql: str, params: dict[str, Any] | None = None) -> None:
    with engine.begin() as connection:
        connection.execute(text(sql), params or {})
