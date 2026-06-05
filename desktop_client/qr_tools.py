from __future__ import annotations


def label_text(entity_type: str, entity_id: str) -> str:
    return f"{entity_type}: {entity_id}"
