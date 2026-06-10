from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine


VECTOR_TILE_MIME = "application/vnd.mapbox-vector-tile"


@dataclass(frozen=True)
class TilePlan:
    source_table: str
    source_layer: str
    id_column: str
    geom_column: str = "geom"
    where_sql: str = "TRUE"
    min_zoom: int = 0
    max_zoom: int = 24
    is_aggregate: bool = False
    source_tile_z: int | None = None
    max_features: int = 5000


@dataclass(frozen=True)
class TileResult:
    body: bytes
    cache_hit: bool
    feature_count: int = 0
    truncated: bool = False
    max_features: int = 0


LAYER_PLANS: dict[str, list[TilePlan]] = {
    "territory": [TilePlan("service_territories", "territory", "territory_key", max_features=1000)],
    "poles": [
        TilePlan("pole_density_z8", "poles", "id", max_zoom=8, is_aggregate=True, source_tile_z=8, max_features=12000),
        TilePlan("pole_density_z10", "poles", "id", min_zoom=9, max_zoom=10, is_aggregate=True, source_tile_z=10, max_features=12000),
        TilePlan("pole_clusters_z12", "poles", "id", min_zoom=11, max_zoom=12, is_aggregate=True, source_tile_z=12, max_features=10000),
        TilePlan("pole_clusters_z14", "poles", "id", min_zoom=13, max_zoom=14, is_aggregate=True, source_tile_z=14, max_features=10000),
        TilePlan("pole_clusters_z15", "poles", "id", min_zoom=15, max_zoom=15, is_aggregate=True, source_tile_z=15, max_features=10000),
        TilePlan("telecom_poles", "poles", "pole_id", min_zoom=16, max_features=8000),
    ],
    "pole_clusters": [
        TilePlan("pole_density_z10", "pole_clusters", "id", max_zoom=10, is_aggregate=True, source_tile_z=10, max_features=12000),
        TilePlan("pole_clusters_z12", "pole_clusters", "id", min_zoom=11, max_zoom=12, is_aggregate=True, source_tile_z=12, max_features=10000),
        TilePlan("pole_clusters_z14", "pole_clusters", "id", min_zoom=13, max_zoom=14, is_aggregate=True, source_tile_z=14, max_features=10000),
        TilePlan("pole_clusters_z15", "pole_clusters", "id", min_zoom=15, max_zoom=15, is_aggregate=True, source_tile_z=15, max_features=10000),
    ],
    "spans": [
        TilePlan("span_simplified_z10", "spans", "id", max_zoom=11, is_aggregate=True, source_tile_z=10, max_features=10000),
        TilePlan("span_simplified_z12", "spans", "id", min_zoom=12, max_zoom=14, is_aggregate=True, source_tile_z=12, max_features=10000),
        TilePlan("telecom_spans", "spans", "span_id", min_zoom=15, max_features=12000),
    ],
    "fiber_routes": [
        TilePlan("route_summary_z8", "fiber_routes", "id", max_zoom=10, is_aggregate=True, source_tile_z=8, max_features=5000),
        TilePlan("fiber_routes", "fiber_routes", "fiber_route_id", min_zoom=11, max_features=3000),
    ],
    "splice_cases": [TilePlan("splice_cases", "splice_cases", "splice_case_id", min_zoom=16, max_features=4000)],
    "handholes": [TilePlan("handholes", "handholes", "handhole_id", min_zoom=16, max_features=4000)],
    "slack_loops": [TilePlan("slack_loops", "slack_loops", "slack_loop_id", min_zoom=16, max_features=4000)],
    "mux_sites": [TilePlan("mux_sites", "mux_sites", "mux_site_id", min_zoom=14, max_features=2000)],
    "circuit_routes": [TilePlan("circuit_routes", "circuit_routes", "circuit_route_id", min_zoom=10, max_features=3000)],
}


def supported_layers() -> list[str]:
    return sorted(LAYER_PLANS)


def is_postgis_engine(engine: Engine) -> bool:
    return engine.dialect.name == "postgresql"


def tile_etag(layer: str, z: int, x: int, y: int, version: str = "v1") -> str:
    return sha256(f"{version}:{layer}:{z}:{x}:{y}".encode("utf-8")).hexdigest()[:24]


def tile_body_etag(layer: str, z: int, x: int, y: int, body: bytes, version: str = "v2") -> str:
    hash_input = f"{version}:{layer}:{z}:{x}:{y}:".encode("utf-8") + body
    return sha256(hash_input).hexdigest()[:24]


def cache_headers(layer: str, z: int, x: int, y: int, version: str = "v1", hit: bool = False, body: bytes | None = None) -> dict[str, str]:
    max_age = 86400 if z <= 14 else 900
    etag = tile_body_etag(layer, z, x, y, body) if body is not None else tile_etag(layer, z, x, y, version)
    return {
        "Cache-Control": f"public, max-age={max_age}, s-maxage={max_age}, stale-while-revalidate=86400",
        "ETag": f'"{etag}"',
        "X-GIS-Tile-Cache": "hit" if hit else "computed",
        "X-GIS-LOD": lod_label(layer, z),
    }


def choose_plan(layer: str, z: int) -> TilePlan | None:
    for plan in LAYER_PLANS.get(layer, []):
        if plan.min_zoom <= z <= plan.max_zoom:
            return plan
    return None


def lod_label(layer: str, z: int) -> str:
    if layer == "poles":
        if z < 8:
            return "territory-summary"
        if z < 11:
            return "density"
        if z < 16:
            return "cluster"
        return "individual"
    if layer == "spans" and z < 15:
        return "simplified"
    return "detail"


def empty_tile() -> bytes:
    return b""


def get_vector_tile(engine: Engine, layer: str, z: int, x: int, y: int) -> bytes:
    return get_vector_tile_result(engine, layer, z, x, y).body


def get_vector_tile_result(engine: Engine, layer: str, z: int, x: int, y: int) -> TileResult:
    if layer not in LAYER_PLANS:
        raise ValueError(f"Unsupported tile layer: {layer}")
    if not is_postgis_engine(engine):
        return TileResult(empty_tile(), False)
    if layer == "poles" and z < 8:
        return TileResult(empty_tile(), False)
    plan = choose_plan(layer, z)
    if not plan:
        return TileResult(empty_tile(), False)

    cached = _cached_tile(engine, layer, z, x, y)
    if cached is not None:
        return cached

    sql = text(_tile_sql(plan))
    with engine.begin() as connection:
        row = connection.execute(sql, {"z": z, "x": x, "y": y}).mappings().first()
    body = bytes((row or {}).get("mvt") or b"")
    feature_count = int((row or {}).get("feature_count") or 0)
    truncated = bool((row or {}).get("truncated") or False)
    _store_tile(engine, layer, z, x, y, body, feature_count, truncated, plan.max_features)
    return TileResult(body, False, feature_count, truncated, plan.max_features)


def _cached_tile(engine: Engine, layer: str, z: int, x: int, y: int) -> TileResult | None:
    sql = text(
        """
        SELECT mvt, feature_count, truncated, max_features
        FROM tile_cache_metadata
        WHERE layer = :layer
          AND z = :z
          AND x = :x
          AND y = :y
          AND dirty = FALSE
          AND mvt IS NOT NULL
        """
    )
    with engine.begin() as connection:
        row = connection.execute(sql, {"layer": layer, "z": z, "x": x, "y": y}).mappings().first()
    if not row:
        return None
    return TileResult(
        bytes(row["mvt"] or b""),
        True,
        int(row["feature_count"] or 0),
        bool(row["truncated"]),
        int(row["max_features"] or 0),
    )


def _store_tile(engine: Engine, layer: str, z: int, x: int, y: int, body: bytes, feature_count: int, truncated: bool, max_features: int) -> None:
    sql = text(
        """
        INSERT INTO tile_cache_metadata (
          layer, z, x, y, etag, mvt, feature_count, truncated, max_features,
          dirty, dirty_reason, rendered_at
        )
        VALUES (
          :layer, :z, :x, :y, :etag, :mvt, :feature_count, :truncated, :max_features,
          FALSE, NULL, now()
        )
        ON CONFLICT (layer, z, x, y)
        DO UPDATE SET etag = EXCLUDED.etag,
                      mvt = EXCLUDED.mvt,
                      feature_count = EXCLUDED.feature_count,
                      truncated = EXCLUDED.truncated,
                      max_features = EXCLUDED.max_features,
                      dirty = FALSE,
                      dirty_reason = NULL,
                      rendered_at = now()
        """
    )
    with engine.begin() as connection:
        connection.execute(
            sql,
            {
                "layer": layer,
                "z": z,
                "x": x,
                "y": y,
                "etag": tile_body_etag(layer, z, x, y, body),
                "mvt": body,
                "feature_count": feature_count,
                "truncated": truncated,
                "max_features": max_features,
            },
        )


def _tile_sql(plan: TilePlan) -> str:
    properties = _property_select(plan)
    aggregate_filter = _aggregate_filter(plan)
    return f"""
    WITH bounds AS (
      SELECT ST_TileEnvelope(:z, :x, :y) AS geom_3857
    ),
    candidates AS MATERIALIZED (
      SELECT
        {plan.id_column}::text AS id,
        {properties},
        {plan.geom_column} AS source_geom
      FROM {plan.source_table}, bounds
      WHERE {plan.geom_column} && ST_Transform(bounds.geom_3857, 4326)
        AND ST_Intersects({plan.geom_column}, ST_Transform(bounds.geom_3857, 4326))
        {aggregate_filter}
        AND {plan.where_sql}
      ORDER BY {plan.id_column}::text
      LIMIT {plan.max_features + 1}
    ),
    budgeted AS (
      SELECT *
      FROM candidates
      LIMIT {plan.max_features}
    ),
    clipped AS (
      SELECT
        id,
        {', '.join(_property_aliases(plan))},
        ST_AsMVTGeom(
          ST_Transform(source_geom, 3857),
          bounds.geom_3857,
          4096,
          64,
          true
        ) AS geom
      FROM budgeted, bounds
    )
    SELECT
      COALESCE((SELECT ST_AsMVT(mvt_rows, '{plan.source_layer}', 4096, 'geom') FROM (SELECT * FROM clipped WHERE geom IS NOT NULL) AS mvt_rows), ''::bytea) AS mvt,
      (SELECT count(*) FROM budgeted)::integer AS feature_count,
      ((SELECT count(*) FROM candidates) > {plan.max_features}) AS truncated
    """


def _aggregate_filter(plan: TilePlan) -> str:
    if not plan.is_aggregate:
        return ""
    source_z = "COALESCE(:z, 0)" if plan.source_tile_z is None else str(plan.source_tile_z)
    return f"""
        AND tile_z = {source_z}
        AND tile_x BETWEEN
          CASE
            WHEN {source_z} >= :z THEN (:x * power(2, {source_z} - :z))::integer
            ELSE floor(:x / power(2, :z - {source_z}))::integer
          END
          AND
          CASE
            WHEN {source_z} >= :z THEN (((:x + 1) * power(2, {source_z} - :z)) - 1)::integer
            ELSE floor(:x / power(2, :z - {source_z}))::integer
          END
        AND tile_y BETWEEN
          CASE
            WHEN {source_z} >= :z THEN (:y * power(2, {source_z} - :z))::integer
            ELSE floor(:y / power(2, :z - {source_z}))::integer
          END
          AND
          CASE
            WHEN {source_z} >= :z THEN (((:y + 1) * power(2, {source_z} - :z)) - 1)::integer
            ELSE floor(:y / power(2, :z - {source_z}))::integer
          END
    """


def _property_select(plan: TilePlan) -> str:
    if plan.is_aggregate:
        return """
        COALESCE(display_class, 'aggregate')::text AS display_class,
        COALESCE(feature_count, 0)::bigint AS feature_count,
        COALESCE(properties->>'asset_type', 'aggregate')::text AS asset_type,
        COALESCE(properties->>'status', 'synthetic')::text AS status
        """
    if plan.source_table == "service_territories":
        return """
        'territory'::text AS display_class,
        'service_territory'::text AS asset_type,
        boundary_status::text AS status,
        name::text AS name
        """
    return """
    COALESCE(display_class, 'asset')::text AS display_class,
    COALESCE(asset_status, 'synthetic')::text AS status,
    COALESCE(properties->>'asset_type', display_class, 'asset')::text AS asset_type
    """


def _property_aliases(plan: TilePlan) -> list[str]:
    if plan.is_aggregate:
        return ["display_class", "feature_count", "asset_type", "status"]
    if plan.source_table == "service_territories":
        return ["display_class", "asset_type", "status", "name"]
    return ["display_class", "status", "asset_type"]


def safe_limit(value: int | None, default: int = 25, maximum: int = 100) -> int:
    if value is None:
        return default
    return max(1, min(value, maximum))


def postgis_unavailable_payload() -> dict[str, Any]:
    return {
        "postgis_configured": False,
        "detail": "Set DATABASE_URL to a PostgreSQL/PostGIS database and run Alembic migrations to enable GIS-scale tiles.",
        "synthetic_data_only": True,
    }
