from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import requests


class GridAssetClient:
    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None

    def login(self, email: str, password: str) -> dict[str, Any]:
        response = requests.post(f"{self.base_url}/api/auth/login", json={"email": email, "password": password}, timeout=20)
        response.raise_for_status()
        payload = response.json()
        self.token = payload["access_token"]
        return payload

    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def import_preview(self, entity: str, csv_path: str | Path) -> dict[str, Any]:
        with Path(csv_path).open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        response = requests.post(f"{self.base_url}/api/import/csv", headers=self.headers(), json={"entity": entity, "rows": rows}, timeout=30)
        response.raise_for_status()
        return response.json()

    def generate_qr(self, entity_type: str, entity_id: str, label_text: str) -> dict[str, Any]:
        response = requests.post(f"{self.base_url}/api/qr/generate", headers=self.headers(), json={"entity_type": entity_type, "entity_id": entity_id, "label_text": label_text}, timeout=20)
        response.raise_for_status()
        return response.json()

    def export_csv(self, entity: str, output_path: str | Path) -> Path:
        response = requests.get(f"{self.base_url}/api/export/{entity}", headers=self.headers(), timeout=30)
        response.raise_for_status()
        path = Path(output_path)
        path.write_text(response.text, encoding="utf-8")
        return path
