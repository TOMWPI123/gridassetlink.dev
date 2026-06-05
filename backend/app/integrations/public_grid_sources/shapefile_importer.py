from __future__ import annotations

from typing import Any

from .opengridworks_adapter import normalize_records


def normalize_shapefile_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Normalize records exported from a public Shapefile.

    The MVP intentionally does not parse binary Shapefile uploads directly so it
    avoids adding heavy geospatial dependencies. Export the public Shapefile to
    records/CSV/GeoJSON first, then pass the public attributes here.
    """

    normalized = normalize_records(records)
    normalized["source"].update(
        {
            "source_name": "Manual Shapefile public grid import",
            "source_type": "Shapefile",
            "source_url": "manual-upload://shapefile-derived-records",
            "attribution_text": "User-provided public Shapefile attribution required",
        }
    )
    normalized["validation"]["adapter"] = "shapefile_importer"
    normalized["validation"]["mvp_note"] = "Binary Shapefile parsing is a TODO; use CSV/GeoJSON export for now."
    return normalized

