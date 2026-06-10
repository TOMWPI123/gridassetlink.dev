"""schema driven design assets

Revision ID: 0003_design_assets_schema
Revises: 0002_gis_scale_postgis_schema
Create Date: 2026-06-10
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_design_assets_schema"
down_revision = "0002_gis_scale_postgis_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "design_asset_types" not in table_names:
        op.create_table(
            "design_asset_types",
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("slug", sa.String(length=100), nullable=False, unique=True),
            sa.Column("display_name", sa.String(length=180), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("geometry_type", sa.String(length=40), nullable=False),
            sa.Column("fields_json", sa.JSON(), nullable=True),
            sa.Column("searchable_fields_json", sa.JSON(), nullable=True),
            sa.Column("validation_rules_json", sa.JSON(), nullable=True),
            sa.Column("map_style_json", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="active"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )

    if "design_asset_records" not in table_names:
        op.create_table(
            "design_asset_records",
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("asset_type_id", sa.Integer(), sa.ForeignKey("design_asset_types.id"), nullable=False),
            sa.Column("record_key", sa.String(length=160), nullable=False, unique=True),
            sa.Column("display_label", sa.String(length=180), nullable=False),
            sa.Column("geometry_type", sa.String(length=40), nullable=False),
            sa.Column("geometry_json", sa.JSON(), nullable=True),
            sa.Column("properties_json", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="proposed"),
            sa.Column("source", sa.String(length=80), nullable=False, server_default="synthetic_demo"),
            sa.Column("visibility", sa.String(length=40), nullable=False, server_default="team"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )

    if "design_asset_events" not in table_names:
        op.create_table(
            "design_asset_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("asset_type_id", sa.Integer(), sa.ForeignKey("design_asset_types.id"), nullable=True),
            sa.Column("asset_record_id", sa.Integer(), sa.ForeignKey("design_asset_records.id"), nullable=True),
            sa.Column("event_type", sa.String(length=80), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("event_time", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("before_json", sa.JSON(), nullable=True),
            sa.Column("after_json", sa.JSON(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )

    _create_index_if_missing("ix_design_asset_types_slug", "design_asset_types", ["slug"], unique=True)
    _create_index_if_missing("ix_design_asset_types_status", "design_asset_types", ["status"])
    _create_index_if_missing("ix_design_asset_records_asset_type_id", "design_asset_records", ["asset_type_id"])
    _create_index_if_missing("ix_design_asset_records_record_key", "design_asset_records", ["record_key"], unique=True)
    _create_index_if_missing("ix_design_asset_records_status", "design_asset_records", ["status"])
    _create_index_if_missing("ix_design_asset_events_asset_record_id", "design_asset_events", ["asset_record_id"])
    _create_index_if_missing("ix_design_asset_events_event_type", "design_asset_events", ["event_type"])


def downgrade() -> None:
    op.drop_table("design_asset_events")
    op.drop_table("design_asset_records")
    op.drop_table("design_asset_types")


def _create_index_if_missing(name: str, table_name: str, columns: list[str], unique: bool = False) -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    if name not in existing:
        op.create_index(name, table_name, columns, unique=unique)
