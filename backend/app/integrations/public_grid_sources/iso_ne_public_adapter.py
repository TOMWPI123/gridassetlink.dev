from __future__ import annotations

from typing import Any

from .opengridworks_adapter import normalize_records


def normalize_records_from_public_map(records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    normalized = normalize_records(records or _mock_iso_ne_records())
    normalized["source"].update(
        {
            "source_name": "ISO New England public map/reference export",
            "source_type": "ISO_NE_public_map",
            "source_url": "manual-upload://iso-ne-public-reference",
            "license_name": "Public reference attribution placeholder",
            "attribution_text": "ISO New England public map/reference attribution placeholder",
        }
    )
    normalized["validation"]["adapter"] = "iso_ne_public_adapter"
    return normalized


def _mock_iso_ne_records() -> list[dict[str, Any]]:
    return [
        {"record_type": "substation", "id": "iso-ct-hfd", "name": "CT Hartford 345 Reference Substation", "owner": "Eversource", "state": "CT", "city": "Hartford", "county": "Hartford", "voltage_kv": 345, "lat": 41.7658, "lon": -72.6734},
        {"record_type": "substation", "id": "iso-ct-nhv", "name": "CT New Haven 115 Reference Substation", "owner": "Avangrid", "state": "CT", "city": "New Haven", "county": "New Haven", "voltage_kv": 115, "lat": 41.3083, "lon": -72.9279},
        {"record_type": "substation", "id": "iso-nh-man", "name": "NH Manchester 115 Reference Substation", "owner": "Eversource", "state": "NH", "city": "Manchester", "county": "Hillsborough", "voltage_kv": 115, "lat": 42.9956, "lon": -71.4548},
        {"record_type": "substation", "id": "iso-vt-rut", "name": "VT Rutland 115 Reference Substation", "owner": "Vermont utilities", "state": "VT", "city": "Rutland", "county": "Rutland", "voltage_kv": 115, "lat": 43.6106, "lon": -72.9726},
        {"record_type": "substation", "id": "iso-me-por", "name": "ME Portland 115 Reference Substation", "owner": "Avangrid", "state": "ME", "city": "Portland", "county": "Cumberland", "voltage_kv": 115, "lat": 43.6591, "lon": -70.2568},
        {"record_type": "transmission_line", "id": "iso-ct-hfd-nhv", "name": "Public Hartford New Haven 345 Reference", "owner": "Eversource", "state": "CT", "voltage_kv": 345, "from": "CT Hartford 345 Reference Substation", "to": "CT New Haven 115 Reference Substation", "length_miles": 39.0},
        {"record_type": "transmission_line", "id": "iso-nne-ring", "name": "Public Northern New England 115 Reference", "owner": "ISO-NE public reference", "state": "NH", "voltage_kv": 115, "from": "NH Manchester 115 Reference Substation", "to": "VT Rutland 115 Reference Substation", "length_miles": 86.0},
        {"record_type": "transmission_line", "id": "iso-me-bos", "name": "Public Maine Boston 230 Reference", "owner": "ISO-NE public reference", "state": "ME", "voltage_kv": 230, "from": "ME Portland 115 Reference Substation", "to": "MA Boston 345 Substation", "length_miles": 108.0},
    ]

