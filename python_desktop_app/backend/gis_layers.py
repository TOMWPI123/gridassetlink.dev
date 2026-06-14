from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import SYNTHETIC_NOTICE, settings


GIS_LAYER_MANIFEST: list[dict[str, Any]] = [
    {
        "id": "public_transmission_lines",
        "label": "Public transmission lines",
        "filename": "iso-ne-public-transmission-lines.geojson",
        "category": "Public reference GIS",
        "color": "#9fb6ff",
        "geometry": "line",
        "render_limit": 550,
        "default_visible": True,
        "notice": "Public-reference geometry only. Not operational topology.",
    },
    {
        "id": "public_substations",
        "label": "Public substations",
        "filename": "iso-ne-public-substations.geojson",
        "category": "Public reference GIS",
        "color": "#68e1ad",
        "geometry": "point",
        "render_limit": 700,
        "default_visible": True,
        "notice": "Public-reference substation points only.",
    },
    {
        "id": "synthetic_substations",
        "label": "Synthetic substations",
        "filename": "iso-ne-synthetic-substations.geojson",
        "category": "Synthetic planning GIS",
        "color": "#54d6ff",
        "geometry": "point",
        "render_limit": 400,
        "default_visible": False,
        "notice": "Fictional synthetic/demo substation layer.",
    },
    {
        "id": "transmission_structures",
        "label": "Synthetic transmission structures",
        "filename": "iso-ne-synthetic-transmission-structures.geojson",
        "category": "Synthetic planning GIS",
        "color": "#b8c6c9",
        "geometry": "point",
        "render_limit": 850,
        "default_visible": False,
        "notice": "Fictional synthetic/demo structure sample. Full layer remains bundled.",
    },
    {
        "id": "opgw_cables",
        "label": "Synthetic OPGW cables",
        "filename": "iso-ne-synthetic-opgw-cables.geojson",
        "category": "Synthetic OPGW GIS",
        "color": "#6ee7f5",
        "geometry": "line",
        "render_limit": 650,
        "default_visible": True,
        "notice": "Fictional OPGW planning assumptions.",
    },
    {
        "id": "distribution_poles_lite",
        "label": "Distribution poles sample",
        "filename": "iso-ne-synthetic-distribution-poles-lite.geojson",
        "category": "Synthetic distribution GIS",
        "color": "#f7c96b",
        "geometry": "point",
        "render_limit": 900,
        "default_visible": False,
        "notice": "Fictional synthetic/demo distribution pole sample.",
    },
    {
        "id": "distribution_fiber_routes",
        "label": "Distribution fiber routes",
        "filename": "iso-ne-synthetic-distribution-pole-fiber.geojson",
        "category": "Synthetic distribution GIS",
        "color": "#44d07b",
        "geometry": "line",
        "render_limit": 650,
        "default_visible": True,
        "notice": "Fictional synthetic/demo distribution fiber route layer.",
    },
    {
        "id": "distribution_splice_points",
        "label": "Distribution splice points",
        "filename": "iso-ne-synthetic-distribution-splice-points.geojson",
        "category": "Synthetic distribution GIS",
        "color": "#ff9f7a",
        "geometry": "point",
        "render_limit": 900,
        "default_visible": False,
        "notice": "Fictional synthetic/demo splice point layer.",
    },
    {
        "id": "splice_closures",
        "label": "Splice closures",
        "filename": "iso-ne-synthetic-splice-closures.geojson",
        "category": "Synthetic OPGW GIS",
        "color": "#ffb38f",
        "geometry": "point",
        "render_limit": 850,
        "default_visible": False,
        "notice": "Fictional synthetic/demo splice closure layer.",
    },
    {
        "id": "fcc_utility_towers",
        "label": "FCC utility towers",
        "filename": "fcc-uls-utility-towers.geojson",
        "category": "Public reference GIS",
        "color": "#ffffff",
        "geometry": "point",
        "render_limit": 650,
        "default_visible": False,
        "notice": "Public FCC ULS utility telecom reference data.",
    },
    {
        "id": "fcc_microwave_links",
        "label": "FCC microwave paths",
        "filename": "fcc-uls-utility-microwave-links.geojson",
        "category": "Public reference GIS",
        "color": "#d59cff",
        "geometry": "line",
        "render_limit": 450,
        "default_visible": False,
        "notice": "Public FCC ULS microwave path reference data.",
    },
    {
        "id": "legacy_telecom_nodes",
        "label": "Telecom nodes",
        "filename": "telecomNodes.geojson",
        "category": "Dashboard GIS",
        "color": "#57c7ff",
        "geometry": "point",
        "render_limit": 250,
        "default_visible": True,
        "notice": "Fictional dashboard telecom node layer.",
    },
    {
        "id": "legacy_fiber_routes",
        "label": "Fiber routes",
        "filename": "fiberRoutes.geojson",
        "category": "Dashboard GIS",
        "color": "#44d07b",
        "geometry": "line",
        "render_limit": 250,
        "default_visible": True,
        "notice": "Fictional dashboard fiber route layer.",
    },
    {
        "id": "legacy_telecom_circuits",
        "label": "Telecom circuits",
        "filename": "telecomCircuits.geojson",
        "category": "Dashboard GIS",
        "color": "#ff7d7d",
        "geometry": "line",
        "render_limit": 250,
        "default_visible": True,
        "notice": "Fictional dashboard telecom circuit layer.",
    },
    {
        "id": "legacy_work_orders",
        "label": "Work orders",
        "filename": "workOrders.geojson",
        "category": "Dashboard GIS",
        "color": "#ffffff",
        "geometry": "point",
        "render_limit": 250,
        "default_visible": True,
        "notice": "Fictional dashboard work order layer.",
    },
    {
        "id": "proposed_changes",
        "label": "Proposed changes",
        "filename": "proposedChanges.geojson",
        "category": "Dashboard GIS",
        "color": "#f7c96b",
        "geometry": "line",
        "render_limit": 250,
        "default_visible": True,
        "notice": "Fictional proposed change layer.",
    },
]


def gis_layer_dir() -> Path:
    return settings.resource_dir / "data" / "gis_layers"


def list_gis_layers() -> list[dict[str, Any]]:
    return [metadata_for_layer(layer) for layer in GIS_LAYER_MANIFEST]


def metadata_for_layer(layer: dict[str, Any]) -> dict[str, Any]:
    path = gis_layer_dir() / layer["filename"]
    count = 0
    geometry_types: list[str] = []
    if path.exists():
        try:
            data = _load_geojson(layer["id"])
            features = data.get("features", [])
            count = len(features)
            geometry_types = sorted({str(feature.get("geometry", {}).get("type")) for feature in features if feature.get("geometry")})
        except Exception:
            count = 0
            geometry_types = []
    return {
        **{key: value for key, value in layer.items() if key != "filename"},
        "filename": layer["filename"],
        "available": path.exists(),
        "feature_count": count,
        "geometry_types": geometry_types,
    }


def get_gis_layer(layer_id: str, limit: int | None = None) -> dict[str, Any]:
    layer = _manifest_by_id().get(layer_id)
    if not layer:
        raise KeyError(layer_id)
    data = _load_geojson(layer_id)
    features = data.get("features", [])
    render_limit = layer["render_limit"] if limit is None else max(0, limit)
    sampled = _sample_features(features, render_limit)
    return {
        "id": layer_id,
        "label": layer["label"],
        "category": layer["category"],
        "color": layer["color"],
        "geometry": layer["geometry"],
        "feature_count": len(features),
        "rendered_count": len(sampled),
        "render_limit": render_limit,
        "sampled": len(sampled) < len(features),
        "synthetic_data_notice": SYNTHETIC_NOTICE,
        "notice": layer["notice"],
        "feature_collection": {
            "type": "FeatureCollection",
            "features": sampled,
        },
    }


@lru_cache(maxsize=32)
def _load_geojson(layer_id: str) -> dict[str, Any]:
    layer = _manifest_by_id().get(layer_id)
    if not layer:
        raise KeyError(layer_id)
    path = gis_layer_dir() / layer["filename"]
    if not path.exists():
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _manifest_by_id() -> dict[str, dict[str, Any]]:
    return {layer["id"]: layer for layer in GIS_LAYER_MANIFEST}


def _sample_features(features: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if limit <= 0 or len(features) <= limit:
        return features
    step = len(features) / limit
    return [features[min(int(index * step), len(features) - 1)] for index in range(limit)]

