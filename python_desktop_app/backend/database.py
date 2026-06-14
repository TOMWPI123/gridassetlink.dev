from __future__ import annotations

import csv
import io
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

from .config import SYNTHETIC_NOTICE, settings


VALID_ASSET_TYPES = {
    "substation",
    "transmission_line",
    "distribution_pole",
    "structure",
    "opgw_route",
    "fiber_span",
    "splice_point",
    "device",
    "circuit",
    "service",
    "work_order",
}

VALID_GEOMETRY_TYPES = {"Point", "LineString", "Polygon"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(settings.database_path)
    connection.row_factory = sqlite3.Row
    return connection


def init_db(reset: bool = False) -> None:
    if reset and settings.database_path.exists():
        settings.database_path.unlink()
    with connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                asset_type TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                lifecycle TEXT NOT NULL,
                geometry_type TEXT NOT NULL,
                geometry_json TEXT NOT NULL,
                properties_json TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_assets_lifecycle ON assets(lifecycle)")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                asset_id TEXT,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        db.commit()
    seed_if_empty()


def seed_if_empty(force: bool = False) -> None:
    with connect() as db:
        current_count = db.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        if current_count and not force:
            return
        if force:
            db.execute("DELETE FROM assets")
            db.execute("DELETE FROM audit_log")
        seed = json.loads(Path(settings.seed_path).read_text(encoding="utf-8"))
        for raw_asset in seed.get("assets", []):
            asset = normalize_asset(raw_asset, preserve_timestamps=False)
            _upsert_asset(db, asset, action="seed")
        db.commit()


def normalize_asset(raw_asset: dict[str, Any], preserve_timestamps: bool = True) -> dict[str, Any]:
    asset = dict(raw_asset)
    asset_type = str(asset.get("asset_type") or asset.get("type") or "").strip()
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"Unsupported asset_type: {asset_type or '<missing>'}")

    geometry = asset.get("geometry")
    if not isinstance(geometry, dict):
        raise ValueError("Asset geometry must be a GeoJSON geometry object")
    geometry_type = str(geometry.get("type") or "")
    if geometry_type not in VALID_GEOMETRY_TYPES:
        raise ValueError(f"Unsupported geometry type: {geometry_type or '<missing>'}")
    _validate_coordinates(geometry)

    asset_id = str(asset.get("id") or _asset_id(asset_type)).strip()
    name = str(asset.get("name") or asset.get("display_label") or asset_id).strip()
    properties = asset.get("properties") or {}
    if not isinstance(properties, dict):
        raise ValueError("Asset properties must be an object")

    created_at = str(asset.get("created_at") or now_iso()) if preserve_timestamps else now_iso()
    updated_at = str(asset.get("updated_at") or created_at) if preserve_timestamps else created_at

    return {
        "id": asset_id,
        "asset_type": asset_type,
        "name": name,
        "status": str(asset.get("status") or properties.get("status") or "existing"),
        "lifecycle": str(asset.get("lifecycle") or properties.get("lifecycle") or "existing"),
        "geometry_type": geometry_type,
        "geometry": geometry,
        "properties": properties,
        "source": str(asset.get("source") or properties.get("source") or "synthetic-demo"),
        "created_at": created_at,
        "updated_at": updated_at,
    }


def _validate_coordinates(geometry: dict[str, Any]) -> None:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Point":
        if not _is_coordinate(coordinates):
            raise ValueError("Point geometry requires [longitude, latitude]")
        return
    if geometry_type == "LineString":
        if not isinstance(coordinates, list) or len(coordinates) < 2 or not all(_is_coordinate(item) for item in coordinates):
            raise ValueError("LineString geometry requires at least two coordinates")
        return
    if geometry_type == "Polygon":
        if (
            not isinstance(coordinates, list)
            or not coordinates
            or not all(isinstance(ring, list) and len(ring) >= 4 and all(_is_coordinate(item) for item in ring) for ring in coordinates)
        ):
            raise ValueError("Polygon geometry requires one or more closed coordinate rings")


def _is_coordinate(value: Any) -> bool:
    if not isinstance(value, list) or len(value) != 2:
        return False
    lon, lat = value
    return isinstance(lon, (int, float)) and isinstance(lat, (int, float)) and -180 <= lon <= 180 and -90 <= lat <= 90


def _asset_id(asset_type: str) -> str:
    prefix = {
        "substation": "SUB",
        "transmission_line": "TL",
        "distribution_pole": "POLE",
        "structure": "STR",
        "opgw_route": "OPGW",
        "fiber_span": "FBR",
        "splice_point": "SPL",
        "device": "DEV",
        "circuit": "CIR",
        "service": "SVC",
        "work_order": "WO",
    }.get(asset_type, "ASSET")
    return f"{prefix}-{uuid4().hex[:8].upper()}"


def _row_to_asset(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "asset_type": row["asset_type"],
        "name": row["name"],
        "status": row["status"],
        "lifecycle": row["lifecycle"],
        "geometry_type": row["geometry_type"],
        "geometry": json.loads(row["geometry_json"]),
        "properties": json.loads(row["properties_json"]),
        "source": row["source"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _upsert_asset(db: sqlite3.Connection, asset: dict[str, Any], action: str) -> dict[str, Any]:
    payload = (
        asset["id"],
        asset["asset_type"],
        asset["name"],
        asset["status"],
        asset["lifecycle"],
        asset["geometry_type"],
        json.dumps(asset["geometry"], separators=(",", ":")),
        json.dumps(asset["properties"], separators=(",", ":"), sort_keys=True),
        asset["source"],
        asset["created_at"],
        asset["updated_at"],
    )
    db.execute(
        """
        INSERT INTO assets (
            id, asset_type, name, status, lifecycle, geometry_type, geometry_json,
            properties_json, source, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            asset_type = excluded.asset_type,
            name = excluded.name,
            status = excluded.status,
            lifecycle = excluded.lifecycle,
            geometry_type = excluded.geometry_type,
            geometry_json = excluded.geometry_json,
            properties_json = excluded.properties_json,
            source = excluded.source,
            updated_at = excluded.updated_at
        """,
        payload,
    )
    audit(db, action, asset["id"], asset)
    return asset


def audit(db: sqlite3.Connection, action: str, asset_id: str | None, payload: Any) -> None:
    db.execute(
        "INSERT INTO audit_log(action, asset_id, payload_json, created_at) VALUES (?, ?, ?, ?)",
        (action, asset_id, json.dumps(payload, default=str, separators=(",", ":")), now_iso()),
    )


def list_assets(
    asset_type: str | None = None,
    lifecycle: str | None = None,
    status: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[str] = []
    if asset_type:
        clauses.append("asset_type = ?")
        params.append(asset_type)
    if lifecycle and lifecycle != "all":
        clauses.append("lifecycle = ?")
        params.append(lifecycle)
    if status and status != "all":
        clauses.append("status = ?")
        params.append(status)
    if q:
        clauses.append("(lower(id) LIKE ? OR lower(name) LIKE ? OR lower(properties_json) LIKE ?)")
        like = f"%{q.lower()}%"
        params.extend([like, like, like])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connect() as db:
        rows = db.execute(
            f"SELECT * FROM assets {where} ORDER BY asset_type, name COLLATE NOCASE",
            params,
        ).fetchall()
    return [_row_to_asset(row) for row in rows]


def get_asset(asset_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    return _row_to_asset(row) if row else None


def save_asset(raw_asset: dict[str, Any], action: str = "create") -> dict[str, Any]:
    asset = normalize_asset({**raw_asset, "updated_at": now_iso()})
    existing = get_asset(asset["id"])
    if existing:
        asset["created_at"] = existing["created_at"]
        action = "update" if action == "create" else action
    with connect() as db:
        saved = _upsert_asset(db, asset, action=action)
        db.commit()
    return saved


def delete_asset(asset_id: str) -> bool:
    with connect() as db:
        existing = db.execute("SELECT id FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if not existing:
            return False
        db.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        audit(db, "delete", asset_id, {"id": asset_id})
        db.commit()
    return True


def summary() -> dict[str, Any]:
    with connect() as db:
        by_type = {
            row["asset_type"]: row["count"]
            for row in db.execute("SELECT asset_type, COUNT(*) AS count FROM assets GROUP BY asset_type").fetchall()
        }
        by_status = {
            row["status"]: row["count"]
            for row in db.execute("SELECT status, COUNT(*) AS count FROM assets GROUP BY status").fetchall()
        }
        by_lifecycle = {
            row["lifecycle"]: row["count"]
            for row in db.execute("SELECT lifecycle, COUNT(*) AS count FROM assets GROUP BY lifecycle").fetchall()
        }
        total = db.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
    assets = list_assets()
    high_risk = [
        asset
        for asset in assets
        if str(asset["properties"].get("criticality", "")).lower() in {"high", "critical"}
        or float(asset["properties"].get("risk_score") or 0) >= 80
    ]
    return {
        "total": total,
        "by_type": by_type,
        "by_status": by_status,
        "by_lifecycle": by_lifecycle,
        "high_risk_count": len(high_risk),
        "synthetic_data_notice": SYNTHETIC_NOTICE,
    }


def to_geojson(assets: Iterable[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "synthetic_data_notice": SYNTHETIC_NOTICE,
        "features": [
            {
                "type": "Feature",
                "id": asset["id"],
                "geometry": asset["geometry"],
                "properties": {
                    "id": asset["id"],
                    "asset_type": asset["asset_type"],
                    "name": asset["name"],
                    "status": asset["status"],
                    "lifecycle": asset["lifecycle"],
                    "source": asset["source"],
                    **asset["properties"],
                },
            }
            for asset in assets
        ],
    }


def geojson_to_assets(payload: dict[str, Any], default_asset_type: str = "distribution_pole") -> list[dict[str, Any]]:
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise ValueError("GeoJSON import requires a FeatureCollection")
    imported: list[dict[str, Any]] = []
    for index, feature in enumerate(payload["features"]):
        properties = feature.get("properties") or {}
        if not isinstance(properties, dict):
            raise ValueError(f"Feature {index} properties must be an object")
        asset_type = str(properties.get("asset_type") or properties.get("type") or default_asset_type)
        asset_id = str(feature.get("id") or properties.get("id") or properties.get("asset_id") or _asset_id(asset_type))
        asset = normalize_asset(
            {
                "id": asset_id,
                "asset_type": asset_type,
                "name": properties.get("name") or properties.get("display_label") or asset_id,
                "status": properties.get("status") or "imported",
                "lifecycle": properties.get("lifecycle") or "proposed",
                "geometry": feature.get("geometry"),
                "properties": {key: value for key, value in properties.items() if key not in {"id", "asset_type", "name"}},
                "source": "geojson-import",
            },
            preserve_timestamps=False,
        )
        imported.append(asset)
    return imported


def import_geojson(payload: dict[str, Any], default_asset_type: str = "distribution_pole") -> list[dict[str, Any]]:
    assets = geojson_to_assets(payload, default_asset_type=default_asset_type)
    with connect() as db:
        for asset in assets:
            _upsert_asset(db, asset, action="import_geojson")
        db.commit()
    return assets


def assets_to_csv(assets: Iterable[dict[str, Any]]) -> str:
    output = io.StringIO()
    fieldnames = [
        "id",
        "asset_type",
        "name",
        "status",
        "lifecycle",
        "longitude",
        "latitude",
        "geometry_json",
        "properties_json",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for asset in assets:
        lon = lat = ""
        if asset["geometry"]["type"] == "Point":
            lon, lat = asset["geometry"]["coordinates"]
        writer.writerow(
            {
                "id": asset["id"],
                "asset_type": asset["asset_type"],
                "name": asset["name"],
                "status": asset["status"],
                "lifecycle": asset["lifecycle"],
                "longitude": lon,
                "latitude": lat,
                "geometry_json": json.dumps(asset["geometry"], separators=(",", ":")),
                "properties_json": json.dumps(asset["properties"], separators=(",", ":"), sort_keys=True),
            }
        )
    return output.getvalue()


def import_csv_text(text: str, default_asset_type: str = "distribution_pole") -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    imported: list[dict[str, Any]] = []
    for row_number, row in enumerate(reader, start=2):
        asset_type = (row.get("asset_type") or default_asset_type).strip()
        try:
            properties = json.loads(row.get("properties_json") or "{}")
            geometry = json.loads(row.get("geometry_json") or "null")
        except json.JSONDecodeError as error:
            raise ValueError(f"CSV row {row_number} contains invalid JSON: {error}") from error
        if geometry is None:
            lon = float(row.get("longitude") or row.get("lon") or row.get("x") or "")
            lat = float(row.get("latitude") or row.get("lat") or row.get("y") or "")
            geometry = {"type": "Point", "coordinates": [lon, lat]}
        asset = normalize_asset(
            {
                "id": row.get("id") or _asset_id(asset_type),
                "asset_type": asset_type,
                "name": row.get("name") or row.get("id") or _asset_id(asset_type),
                "status": row.get("status") or "imported",
                "lifecycle": row.get("lifecycle") or "proposed",
                "geometry": geometry,
                "properties": properties,
                "source": "csv-import",
            },
            preserve_timestamps=False,
        )
        imported.append(asset)
    with connect() as db:
        for asset in imported:
            _upsert_asset(db, asset, action="import_csv")
        db.commit()
    return imported


def dependencies_for(asset_id: str) -> dict[str, Any]:
    selected = get_asset(asset_id)
    if not selected:
        raise KeyError(asset_id)
    dependents: list[dict[str, Any]] = []
    direct_dependencies: list[dict[str, Any]] = []
    assets = list_assets()
    by_id = {asset["id"]: asset for asset in assets}
    for dependency_id in _dependency_ids(selected):
        if dependency_id in by_id:
            direct_dependencies.append(by_id[dependency_id])
    for asset in assets:
        if asset["id"] == asset_id:
            continue
        if asset_id in _dependency_ids(asset):
            dependents.append(asset)
    return {
        "asset": selected,
        "direct_dependencies": direct_dependencies,
        "dependents": dependents,
    }


def _dependency_ids(asset: dict[str, Any]) -> set[str]:
    properties = asset["properties"]
    keys = [
        "dependency_ids",
        "depends_on",
        "route_asset_ids",
        "linked_asset_ids",
        "connected_asset_ids",
        "device_ids",
        "fiber_span_ids",
        "splice_point_ids",
        "circuit_ids",
        "service_ids",
    ]
    dependency_ids: set[str] = set()
    for key in keys:
        value = properties.get(key)
        if isinstance(value, str):
            dependency_ids.add(value)
        elif isinstance(value, list):
            dependency_ids.update(str(item) for item in value if item)
    for key in ("site", "from_site", "to_site", "from_structure_id", "to_structure_id", "fiber_span_id", "circuit_id"):
        value = properties.get(key)
        if value:
            dependency_ids.add(str(value))
    return dependency_ids

