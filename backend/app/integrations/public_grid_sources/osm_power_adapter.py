from __future__ import annotations

from typing import Any

from .common import confidence_for_record, normalize_name, normalize_owner, normalize_state, voltage_class


def normalize_osm_elements(elements: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    substations = []
    lines = []
    for element in elements or _mock_osm_elements():
        tags = element.get("tags", {})
        power = tags.get("power")
        if power == "substation":
            substations.append(_osm_substation(element))
        elif power in {"line", "minor_line"}:
            lines.append(_osm_line(element))
    return {
        "source": {
            "source_name": "OpenStreetMap power infrastructure export",
            "source_type": "OpenStreetMap",
            "source_url": "manual-upload://osm-power-export",
            "license_name": "Open Database License placeholder",
            "attribution_text": "OpenStreetMap contributors attribution placeholder",
        },
        "owners": sorted({item["owner_name"] for item in substations + lines}),
        "substations": substations,
        "transmission_lines": lines,
        "structures": [],
        "validation": {"adapter": "osm_power_adapter", "public_reference_only": True},
    }


def _mock_osm_elements() -> list[dict[str, Any]]:
    return [
        {"id": "osm-ma-fra", "lat": 42.2793, "lon": -71.4162, "tags": {"power": "substation", "name": "MA Framingham Reference Substation", "operator": "Eversource", "voltage": "115000", "addr:state": "MA"}},
        {"id": "osm-ma-wor", "lat": 42.2626, "lon": -71.8023, "tags": {"power": "substation", "name": "MA Worcester Reference Substation", "operator": "National Grid", "voltage": "115000", "addr:state": "MA"}},
        {"id": "osm-line-fra-bos", "tags": {"power": "line", "name": "Public Framingham Boston 115 Reference", "operator": "Eversource", "voltage": "115000", "addr:state": "MA"}},
    ]


def _kv(tags: dict[str, Any]) -> float | None:
    raw = str(tags.get("voltage", "")).split(";")[0]
    try:
        value = float(raw)
    except ValueError:
        return None
    return value / 1000 if value > 1000 else value


def _osm_substation(element: dict[str, Any]) -> dict[str, Any]:
    tags = element.get("tags", {})
    name = tags.get("name") or f"OSM substation {element.get('id')}"
    voltage = _kv(tags)
    record = {
        "external_source_id": str(element.get("id")),
        "substation_name": name,
        "normalized_name": normalize_name(name),
        "owner_name": normalize_owner(tags.get("operator") or tags.get("owner")),
        "state": normalize_state(tags.get("addr:state") or tags.get("state")),
        "voltage_class": voltage_class(voltage),
        "min_voltage_kv": voltage,
        "max_voltage_kv": voltage,
        "latitude": element.get("lat"),
        "longitude": element.get("lon"),
        "geometry_json": element.get("geometry"),
        "source_confidence": "public_reference",
        "is_public_reference": True,
        "notes": "OSM public reference only; no private telecom inferred.",
    }
    record["confidence_score"] = confidence_for_record(record)
    return record


def _osm_line(element: dict[str, Any]) -> dict[str, Any]:
    tags = element.get("tags", {})
    name = tags.get("name") or f"OSM line {element.get('id')}"
    voltage = _kv(tags)
    record = {
        "external_source_id": str(element.get("id")),
        "line_name": name,
        "normalized_line_name": normalize_name(name),
        "owner_name": normalize_owner(tags.get("operator") or tags.get("owner")),
        "state": normalize_state(tags.get("addr:state") or tags.get("state")),
        "voltage_kv": voltage,
        "voltage_class": voltage_class(voltage),
        "geometry_json": element.get("geometry"),
        "status": "public_reference",
        "source_confidence": "public_reference",
        "is_public_reference": True,
        "notes": "OSM public transmission reference only; OPGW is not implied.",
    }
    record["confidence_score"] = confidence_for_record(record)
    return record

