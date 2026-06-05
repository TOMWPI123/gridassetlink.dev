from __future__ import annotations

from typing import Any

from .opengridworks_adapter import normalize_records


def normalize_geojson(payload: dict[str, Any]) -> dict[str, Any]:
    records = []
    for feature in payload.get("features", []):
        props = dict(feature.get("properties", {}))
        geometry = feature.get("geometry")
        props["geometry"] = geometry
        props.setdefault("record_type", props.get("asset_type") or props.get("power") or "substation")
        if geometry and geometry.get("type") == "Point":
            coords = geometry.get("coordinates", [])
            if len(coords) >= 2:
                props.setdefault("lon", coords[0])
                props.setdefault("lat", coords[1])
        records.append(props)
    normalized = normalize_records(records)
    normalized["source"].update(
        {
            "source_name": "Manual GeoJSON public grid import",
            "source_type": "GeoJSON",
            "source_url": "manual-upload://geojson",
            "attribution_text": "User-provided public GeoJSON attribution required",
        }
    )
    normalized["validation"]["adapter"] = "geojson_importer"
    return normalized

