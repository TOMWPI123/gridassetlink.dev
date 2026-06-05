from __future__ import annotations

import re
from typing import Any

NEW_ENGLAND_STATES = {
    "MA": "Massachusetts",
    "RI": "Rhode Island",
    "CT": "Connecticut",
    "NH": "New Hampshire",
    "VT": "Vermont",
    "ME": "Maine",
    "Massachusetts": "Massachusetts",
    "Rhode Island": "Rhode Island",
    "Connecticut": "Connecticut",
    "New Hampshire": "New Hampshire",
    "Vermont": "Vermont",
    "Maine": "Maine",
}


def normalize_name(value: str | None) -> str:
    text = (value or "unknown").strip().lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_state(value: str | None) -> str:
    text = (value or "").strip()
    return NEW_ENGLAND_STATES.get(text, text or "unknown")


def normalize_owner(value: str | None) -> str:
    text = (value or "Unknown public source owner").strip()
    aliases = {
        "national grid": "National Grid-style owner",
        "new england power": "National Grid-style owner",
        "massachusetts electric": "National Grid-style owner",
        "eversource": "Eversource-style owner",
        "nstar": "Eversource-style owner",
        "avangrid": "Avangrid-style owner",
        "ui": "Avangrid-style owner",
        "cmp": "Avangrid-style owner",
        "unitil": "Unitil-style owner",
    }
    return aliases.get(text.lower(), text)


def voltage_class(voltage_kv: float | int | str | None) -> str:
    try:
        value = float(voltage_kv) if voltage_kv not in {None, ""} else 0
    except (TypeError, ValueError):
        return "unknown"
    if value >= 300:
        return "345 kV"
    if value >= 200:
        return "230 kV"
    if value >= 100:
        return "115 kV"
    if value > 0:
        return "subtransmission"
    return "unknown"


def confidence_for_record(record: dict[str, Any]) -> float:
    score = 0.45
    if record.get("external_source_id"):
        score += 0.15
    if record.get("latitude") and record.get("longitude"):
        score += 0.15
    if record.get("owner_name"):
        score += 0.1
    if record.get("voltage_kv") or record.get("voltage_class"):
        score += 0.1
    return min(score, 0.95)

