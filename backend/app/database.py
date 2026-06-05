from collections.abc import Generator

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings


def _connect_args(url: str) -> dict[str, object]:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


engine_kwargs: dict[str, object] = {
    "connect_args": _connect_args(settings.database_url),
    "pool_pre_ping": True,
}
if settings.database_url == "sqlite:///:memory:":
    engine_kwargs["poolclass"] = StaticPool

engine: Engine = create_engine(settings.database_url, **engine_kwargs)


def create_db_and_tables() -> None:
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    if engine.dialect.name != "sqlite":
        return
    additions: dict[str, dict[str, str]] = {
        "device_ports": {"port_role": "TEXT", "physical_label": "TEXT"},
        "fiber_cables": {"a_end_location": "TEXT", "z_end_location": "TEXT"},
        "fiber_strands": {
            "strand_color": "TEXT",
            "buffer_tube_color": "TEXT",
            "assigned_device_port_id": "INTEGER",
            "a_end_patch_panel_port_id": "INTEGER",
            "z_end_patch_panel_port_id": "INTEGER",
            "a_end_label": "TEXT",
            "z_end_label": "TEXT",
        },
        "splice_closures": {
            "location_name": "TEXT",
            "structure_number": "TEXT",
            "pole_number": "TEXT",
            "handhole_number": "TEXT",
            "substation_id": "INTEGER",
        },
        "fiber_splices": {
            "splice_tray_id": "INTEGER",
            "tray_position": "INTEGER",
            "incoming_fiber_cable_id": "INTEGER",
            "incoming_strand_id": "INTEGER",
            "outgoing_fiber_cable_id": "INTEGER",
            "outgoing_strand_id": "INTEGER",
            "tested_by_user_id": "INTEGER",
            "status": "TEXT DEFAULT 'planned'",
        },
        "patch_panel_ports": {"port_label": "TEXT", "connected_fiber_strand_id": "INTEGER"},
        "work_order_tasks": {
            "fiber_assignment_id": "INTEGER",
            "fiber_strand_id": "INTEGER",
            "fiber_splice_id": "INTEGER",
            "patch_panel_port_id": "INTEGER",
            "test_result": "TEXT",
            "photo_required": "INTEGER DEFAULT 0",
            "test_uploaded": "INTEGER DEFAULT 0",
        },
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        for table_name, columns in additions.items():
            if table_name not in table_names:
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name not in existing:
                    connection.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_type}'))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
