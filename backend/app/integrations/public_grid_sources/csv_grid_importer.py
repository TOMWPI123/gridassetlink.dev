from __future__ import annotations

import csv
from io import StringIO
from typing import Any

from .opengridworks_adapter import normalize_records


def normalize_csv(csv_text: str) -> dict[str, Any]:
    rows = list(csv.DictReader(StringIO(csv_text)))
    normalized = normalize_records(rows)
    normalized["source"].update(
        {
            "source_name": "Manual CSV public grid import",
            "source_type": "manual_CSV",
            "source_url": "manual-upload://csv",
            "attribution_text": "User-provided public CSV attribution required",
        }
    )
    normalized["validation"]["adapter"] = "csv_grid_importer"
    normalized["validation"]["csv_rows"] = len(rows)
    return normalized

