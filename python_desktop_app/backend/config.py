from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - handled by requirements at runtime
    load_dotenv = None


APP_NAME = "GridAssetLink Desktop"
SYNTHETIC_NOTICE = (
    "GridAssetLink Desktop uses fictional synthetic/demo utility telecom data by "
    "default. It is not an official National Grid product and is not for "
    "operations, SCADA, protection, CEII, or field switching decisions."
)


def _base_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def _resource_dir() -> Path:
    if hasattr(sys, "_MEIPASS"):
        return Path(getattr(sys, "_MEIPASS"))
    return _base_dir()


def _default_app_data_dir() -> Path:
    configured = os.getenv("GRIDASSETLINK_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    if hasattr(sys, "_MEIPASS"):
        local_app_data = os.getenv("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(local_app_data) / "GridAssetLinkDesktop"
    return _base_dir() / "data"


@dataclass(frozen=True)
class Settings:
    base_dir: Path
    resource_dir: Path
    app_data_dir: Path
    frontend_dir: Path
    seed_path: Path
    database_path: Path
    postgis_url: str | None
    offline_map_mode: bool
    host: str = "127.0.0.1"


def get_settings() -> Settings:
    base = _base_dir()
    resource = _resource_dir()
    app_data = _default_app_data_dir()

    if load_dotenv:
        load_dotenv(base / ".env")
        load_dotenv(app_data / ".env")

    app_data.mkdir(parents=True, exist_ok=True)
    return Settings(
        base_dir=base,
        resource_dir=resource,
        app_data_dir=app_data,
        frontend_dir=resource / "frontend",
        seed_path=resource / "data" / "demo_assets.json",
        database_path=Path(os.getenv("GRIDASSETLINK_DB_PATH", app_data / "gridassetlink_demo.sqlite")),
        postgis_url=os.getenv("GRIDASSETLINK_POSTGIS_URL") or None,
        offline_map_mode=os.getenv("GRIDASSETLINK_OFFLINE_MAP", "true").lower() != "false",
    )


settings = get_settings()

