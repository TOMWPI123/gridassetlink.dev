from __future__ import annotations

from typing import Any

from .common import confidence_for_record, normalize_name, normalize_owner, normalize_state, voltage_class


def normalize_records(records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = records or mock_export()
    substations = []
    lines = []
    for row in rows:
        kind = str(row.get("record_type", row.get("type", ""))).lower()
        if "substation" in kind:
            sub = _substation(row)
            substations.append(sub)
        elif "line" in kind or "transmission" in kind:
            lines.append(_line(row))
    return {
        "source": {
            "source_name": "OpenGridWorks public export",
            "source_type": "OpenGridWorks",
            "source_url": "manual-upload://opengridworks-public-export",
            "license_name": "Public/open data license placeholder",
            "attribution_text": "OpenGridWorks public export attribution placeholder",
        },
        "owners": sorted({item["owner_name"] for item in substations + lines}),
        "substations": substations,
        "transmission_lines": lines,
        "structures": [],
        "validation": {"adapter": "opengridworks_adapter", "public_reference_only": True},
    }


def mock_export() -> list[dict[str, Any]]:
    return [
        {"record_type": "substation", "id": "ogw-ma-wbs", "name": "MA Webster 115 Substation", "owner": "National Grid", "state": "MA", "city": "Webster", "county": "Worcester", "voltage_kv": 115, "lat": 42.0501, "lon": -71.8809},
        {"record_type": "substation", "id": "ogw-ma-aub", "name": "MA Auburn 115 Substation", "owner": "National Grid", "state": "MA", "city": "Auburn", "county": "Worcester", "voltage_kv": 115, "lat": 42.1945, "lon": -71.8356},
        {"record_type": "substation", "id": "ogw-ma-mil", "name": "MA Millbury 115 Substation", "owner": "National Grid", "state": "MA", "city": "Millbury", "county": "Worcester", "voltage_kv": 115, "lat": 42.1934, "lon": -71.7606},
        {"record_type": "substation", "id": "ogw-ma-bos", "name": "MA Boston 345 Substation", "owner": "Eversource", "state": "MA", "city": "Boston", "county": "Suffolk", "voltage_kv": 345, "lat": 42.3601, "lon": -71.0589},
        {"record_type": "substation", "id": "ogw-ri-pvd", "name": "RI Providence 115 Substation", "owner": "National Grid", "state": "RI", "city": "Providence", "county": "Providence", "voltage_kv": 115, "lat": 41.824, "lon": -71.4128},
        {"record_type": "transmission_line", "id": "ogw-line-143", "name": "Public Line 143 Webster Auburn", "owner": "National Grid", "state": "MA", "voltage_kv": 115, "from": "MA Webster 115 Substation", "to": "MA Auburn 115 Substation", "length_miles": 13.4},
        {"record_type": "transmission_line", "id": "ogw-line-172", "name": "Public Line 172 Auburn Millbury", "owner": "National Grid", "state": "MA", "voltage_kv": 115, "from": "MA Auburn 115 Substation", "to": "MA Millbury 115 Substation", "length_miles": 9.2},
        {"record_type": "transmission_line", "id": "ogw-line-pvd-bos", "name": "Public Providence Boston 230 Reference", "owner": "ISO-NE public reference", "state": "RI", "voltage_kv": 230, "from": "RI Providence 115 Substation", "to": "MA Boston 345 Substation", "length_miles": 44.0},
    ]


def _substation(row: dict[str, Any]) -> dict[str, Any]:
    name = row.get("name") or row.get("substation_name") or "Unnamed public substation"
    voltage = row.get("voltage_kv")
    record = {
        "external_source_id": row.get("id") or row.get("external_source_id"),
        "substation_name": name,
        "normalized_name": normalize_name(name),
        "owner_name": normalize_owner(row.get("owner")),
        "state": normalize_state(row.get("state")),
        "county": row.get("county"),
        "city": row.get("city"),
        "voltage_class": voltage_class(voltage),
        "min_voltage_kv": voltage,
        "max_voltage_kv": voltage,
        "latitude": row.get("lat") or row.get("latitude"),
        "longitude": row.get("lon") or row.get("longitude"),
        "geometry_json": row.get("geometry"),
        "source_confidence": "public_reference",
        "is_public_reference": True,
        "notes": "Public geospatial reference only; no telecom detail inferred.",
    }
    record["confidence_score"] = confidence_for_record(record)
    return record


def _line(row: dict[str, Any]) -> dict[str, Any]:
    name = row.get("name") or row.get("line_name") or "Unnamed public transmission line"
    voltage = row.get("voltage_kv")
    record = {
        "external_source_id": row.get("id") or row.get("external_source_id"),
        "line_name": name,
        "normalized_line_name": normalize_name(name),
        "owner_name": normalize_owner(row.get("owner")),
        "state": normalize_state(row.get("state")),
        "voltage_kv": voltage,
        "voltage_class": voltage_class(voltage),
        "from_substation_name": row.get("from") or row.get("from_substation"),
        "to_substation_name": row.get("to") or row.get("to_substation"),
        "geometry_json": row.get("geometry"),
        "route_length_miles": row.get("length_miles") or row.get("route_length_miles"),
        "status": "public_reference",
        "source_confidence": "public_reference",
        "is_public_reference": True,
        "notes": "Public transmission reference only; OPGW is not implied.",
    }
    record["confidence_score"] = confidence_for_record(record)
    return record

