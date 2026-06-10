from __future__ import annotations

import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_
from sqlmodel import select

from app.auth.dependencies import SessionDep, require_roles
from app.models import Circuit, DesignAssetEvent, DesignAssetRecord, DesignAssetType, FiberCable, FiberStrand, RegionalSyntheticCircuit, User
from app.routers.crud import MODEL_REGISTRY
from app.services.audit import model_to_dict

router = APIRouter(prefix="/api/design-assets", tags=["design-assets"])

GEOMETRY_TYPES = {"point", "line", "polygon", "table_only"}
ASSET_TYPE_STATUSES = {"active", "archived"}
RECORD_STATUSES = {"active", "planned", "proposed", "in_review", "as_built", "archived"}
FIELD_TYPES = {"string", "textarea", "number", "integer", "boolean", "date", "enum", "json"}
SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,80}$")
FIELD_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
BLUEPRINT_VERSION = "gridassetlink-design-blueprint-v1"
REBUILD_PACKAGE_VERSION = "gridassetlink-design-rebuild-package-v1"
BLUEPRINT_NOTICE = "Design blueprints store synthetic/demo planning schemas and records. Do not import CEII, relay/protection settings, SCADA secrets, private fiber routes, credentials, or operational access information."


def _field(name: str, label: str, field_type: str = "string", required: bool = False, default: Any = None, enum_options: list[str] | None = None, help_text: str | None = None, validation_rules: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "label": label,
        "type": field_type,
        "required": required,
        "default": default,
        "enum_options": enum_options or [],
        "validation_rules": validation_rules or {},
        "help_text": help_text,
    }


def _backend_materialization(entity: str, unique_field: str, field_map: dict[str, Any], include_module_payload_fields: bool = True) -> dict[str, Any]:
    return {
        "backend_materialization": {
            "entity": entity,
            "unique_field": unique_field,
            "field_map": field_map,
            "include_module_payload_fields": include_module_payload_fields,
        }
    }


CORE_MODULE_BLUEPRINT = {
    "key": "core-telecom-rebuild",
    "display_name": "Core TelecomNE Rebuild Schemas",
    "description": "Installs Design/Edit object schemas that mirror the main modules and map layers so a blank instance can recreate substations, circuits, poles, OPGW, fiber, splices, patch panels, assignments, work orders, and supporting objects as schema-backed design records.",
    "synthetic_data_notice": BLUEPRINT_NOTICE,
    "asset_types": [
        {
            "slug": "design-substation",
            "display_name": "Design Substation",
            "description": "Synthetic/demo substation node record for rebuilding substation module and map layer data.",
            "geometry_type": "point",
            "fields": [
                _field("substation_code", "Substation code", required=True),
                _field("name", "Substation name", required=True),
                _field("state", "State", "enum", enum_options=["MA", "RI", "CT", "NH", "VT", "ME"]),
                _field("utility_owner", "Utility owner"),
                _field("voltage_class", "Voltage class"),
                _field("source_status", "Source status", "enum", True, "synthetic_demo", ["synthetic_demo", "public_reference", "proposed", "user_verified"]),
                _field("module_payload", "Module payload JSON", "json", help_text="Optional attributes needed by module/detail pages."),
            ],
            "searchable_fields": ["substation_code", "name", "utility_owner", "state"],
            "validation_rules": _backend_materialization("substations", "substation_code", {
                "substation_code": "properties.substation_code",
                "name": "properties.name",
                "voltage_level": "properties.voltage_class",
                "region": "properties.state",
                "latitude": "geometry.coordinates.1",
                "longitude": "geometry.coordinates.0",
                "status": "record.status",
                "notes": "record.notes",
            }),
            "map_style": {"color": "#67e8f9", "radius": 8, "fillOpacity": 0.28},
        },
        {
            "slug": "design-circuit",
            "display_name": "Design Circuit",
            "description": "Synthetic/demo circuit record for rebuilding circuit, SEL ICON, service, and layer path information.",
            "geometry_type": "line",
            "fields": [
                _field("circuit_id", "Circuit ID", required=True),
                _field("circuit_name", "Circuit name", required=True),
                _field("service_type", "Service type", "enum", True, "Ethernet", ["SEL_ICON", "C37_94", "Ethernet", "SCADA", "Protection", "DTT", "DS1", "PTP", "Leased", "Other"]),
                _field("criticality", "Criticality", "enum", False, "normal", ["low", "normal", "high", "critical"]),
                _field("a_end", "A-end site or node"),
                _field("z_end", "Z-end site or node"),
                _field("fiber_assignment_ids", "Fiber assignment IDs", "json", help_text="Array of assignment IDs or path references."),
                _field("service_parameters", "Service parameters JSON", "json", help_text="Synthetic provisioning attributes only."),
                _field("status", "Status", "enum", True, "proposed", ["proposed", "planned", "in_review", "active", "as_built", "archived"]),
            ],
            "searchable_fields": ["circuit_id", "circuit_name", "service_type", "a_end", "z_end"],
            "validation_rules": _backend_materialization("circuits", "circuit_id", {
                "circuit_id": "properties.circuit_id",
                "circuit_name": "properties.circuit_name",
                "service_type": "properties.service_type",
                "transport_type": "properties.service_type",
                "ownership_type": {"value": "synthetic_demo"},
                "criticality": "properties.criticality",
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {"color": "#f5c451", "lineWidth": 4},
        },
        {
            "slug": "design-device",
            "display_name": "Design Device",
            "description": "Synthetic/demo telecom, SEL ICON, router, switch, relay, RTU, NID, or planning device record for rebuilding device module data.",
            "geometry_type": "table_only",
            "fields": [
                _field("device_name", "Device name", required=True),
                _field("device_type", "Device type", "enum", True, "SEL_ICON", ["SEL_ICON", "router", "switch", "relay", "RTU", "NID", "recloser_controller", "OTN_DWDM", "other"]),
                _field("manufacturer", "Manufacturer"),
                _field("model", "Model"),
                _field("serial_number", "Serial number"),
                _field("firmware_version", "Firmware version"),
                _field("ip_address", "Management IP"),
                _field("criticality", "Criticality", "enum", False, "normal", ["low", "normal", "high", "critical"]),
                _field("module_payload", "Module payload JSON", "json", help_text="Optional canonical Device fields such as substation_id, rack_id, management_vlan, or location_description."),
                _field("status", "Status", "enum", True, "planned", ["proposed", "planned", "active", "as_built", "archived"]),
            ],
            "searchable_fields": ["device_name", "device_type", "manufacturer", "model", "serial_number"],
            "validation_rules": _backend_materialization("devices", "device_name", {
                "device_name": "properties.device_name",
                "device_type": "properties.device_type",
                "manufacturer": "properties.manufacturer",
                "model": "properties.model",
                "serial_number": "properties.serial_number",
                "firmware_version": "properties.firmware_version",
                "ip_address": "properties.ip_address",
                "criticality": "properties.criticality",
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {},
        },
        {
            "slug": "design-device-port",
            "display_name": "Design Device Port",
            "description": "Synthetic/demo device port record for rebuilding port dashboards, patching, circuit endpoint, and fiber assignment data.",
            "geometry_type": "table_only",
            "fields": [
                _field("port_name", "Port name", required=True),
                _field("device_ref", "Device reference"),
                _field("port_type", "Port type", "enum", True, "Ethernet", ["Ethernet", "C37_94", "DS1", "DS0", "E1", "E0", "optical", "serial", "timing", "other"]),
                _field("speed", "Speed"),
                _field("connector_type", "Connector type"),
                _field("port_role", "Port role"),
                _field("physical_label", "Physical label"),
                _field("module_payload", "Module payload JSON", "json", help_text="Optional canonical DevicePort fields such as device_id or connected_circuit_id."),
                _field("status", "Status", "enum", True, "available", ["available", "assigned", "reserved", "planned", "faulted", "retired"]),
            ],
            "searchable_fields": ["port_name", "device_ref", "port_type", "physical_label", "status"],
            "validation_rules": _backend_materialization("device-ports", "physical_label", {
                "port_name": "properties.port_name",
                "port_type": "properties.port_type",
                "speed": "properties.speed",
                "connector_type": "properties.connector_type",
                "port_role": "properties.port_role",
                "physical_label": {"coalesce": ["properties.physical_label", "properties.port_name"]},
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {},
        },
        {
            "slug": "design-distribution-pole",
            "display_name": "Design Distribution Pole",
            "description": "Synthetic/demo pole/support structure record for rebuilding distribution pole and street-level fiber layers.",
            "geometry_type": "point",
            "fields": [
                _field("pole_id", "Pole/support ID", required=True),
                _field("route_id", "Route or feeder ID"),
                _field("structure_type", "Structure type", "enum", False, "tangent", ["tangent", "angle", "deadend", "tap", "riser", "terminal", "unknown"]),
                _field("has_splice", "Has splice", "boolean", False, False),
                _field("slack_loop_feet", "Slack loop feet", "number"),
                _field("fiber_assignment_ids", "Fiber assignment IDs", "json"),
                _field("status", "Status", "enum", True, "planned", ["proposed", "planned", "active", "as_built", "archived"]),
            ],
            "searchable_fields": ["pole_id", "route_id", "structure_type", "status"],
            "validation_rules": _backend_materialization("regional-structures", "structure_number", {
                "structure_number": "properties.pole_id",
                "structure_type": "properties.structure_type",
                "latitude": "geometry.coordinates.1",
                "longitude": "geometry.coordinates.0",
                "geometry_json": "geometry",
                "source_confidence": {"value": "synthetic_demo"},
                "notes": "record.notes",
            }),
            "map_style": {"color": "#f8fafc", "radius": 5, "fillOpacity": 0.3},
        },
        {
            "slug": "design-opgw-cable",
            "display_name": "Design OPGW Cable",
            "description": "Synthetic/demo OPGW route or cable-section record for rebuilding OPGW fiber layers.",
            "geometry_type": "line",
            "fields": [
                _field("cable_id", "Cable ID", required=True),
                _field("parent_route_id", "Parent OPGW route ID"),
                _field("from_splice_point_id", "From splice point ID"),
                _field("to_splice_point_id", "To splice point ID"),
                _field("fiber_count", "Fiber count", "integer", False, 48, validation_rules={"min": 1, "max": 864}),
                _field("available_strands", "Available strands", "integer"),
                _field("assigned_strands", "Assigned strands", "integer"),
                _field("status", "OPGW workflow status", "enum", True, "synthetic_assumption", ["synthetic_assumption", "planned", "design", "work_order_issued", "in_service_synthetic", "as_built_verified", "retired"]),
            ],
            "searchable_fields": ["cable_id", "parent_route_id", "from_splice_point_id", "to_splice_point_id"],
            "validation_rules": _backend_materialization("fiber-cables", "cable_id", {
                "cable_id": "properties.cable_id",
                "cable_type": {"value": "OPGW"},
                "fiber_count": "properties.fiber_count",
                "a_end_location": "properties.from_splice_point_id",
                "z_end_location": "properties.to_splice_point_id",
                "route_name": "properties.parent_route_id",
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {"color": "#2dd4bf", "lineWidth": 4},
        },
        {
            "slug": "design-fiber-strand",
            "display_name": "Design Fiber Strand",
            "description": "Synthetic/demo individual fiber strand record for rebuilding strand tables, reservations, assignments, patching, and continuity data.",
            "geometry_type": "table_only",
            "fields": [
                _field("strand_key", "Strand key", required=True, help_text="Unique design key, for example CABLE-001-F001."),
                _field("cable_id", "Cable ID"),
                _field("strand_number", "Strand number", "integer", True),
                _field("tube_number", "Tube number", "integer"),
                _field("strand_color", "Strand color"),
                _field("buffer_tube_color", "Buffer tube color"),
                _field("assigned_service", "Assigned service"),
                _field("assigned_circuit_ref", "Assigned circuit reference"),
                _field("a_end_label", "A-end label"),
                _field("z_end_label", "Z-end label"),
                _field("module_payload", "Module payload JSON", "json", help_text="Optional canonical FiberStrand fields such as fiber_cable_id or assigned_circuit_id."),
                _field("status", "Status", "enum", True, "available", ["available", "assigned", "reserved", "dark", "spare", "faulted", "retired"]),
            ],
            "searchable_fields": ["strand_key", "cable_id", "assigned_service", "assigned_circuit_ref", "status"],
            "validation_rules": _backend_materialization("fiber-strands", "a_end_label", {
                "strand_number": "properties.strand_number",
                "tube_number": "properties.tube_number",
                "color": "properties.strand_color",
                "strand_color": "properties.strand_color",
                "buffer_tube_color": "properties.buffer_tube_color",
                "status": "properties.status",
                "assigned_service": "properties.assigned_service",
                "a_end_label": {"coalesce": ["properties.a_end_label", "properties.strand_key"]},
                "z_end_label": "properties.z_end_label",
                "notes": "record.notes",
            }),
            "map_style": {},
        },
        {
            "slug": "design-splice-point",
            "display_name": "Design Splice Point",
            "description": "Synthetic/demo splice closure or splice-point record for rebuilding splice layers and diagrams.",
            "geometry_type": "point",
            "fields": [
                _field("splice_point_id", "Splice point ID", required=True),
                _field("closure_type", "Closure type", "enum", False, "aerial_opgw_splice", ["aerial_opgw_splice", "transition_splice", "tap_splice", "midspan_splice", "terminal_splice", "handhole", "cabinet"]),
                _field("connected_cable_ids", "Connected cable IDs", "json"),
                _field("splice_count", "Splice count", "integer"),
                _field("matrix_json", "Splice matrix JSON", "json"),
                _field("status", "Status", "enum", True, "planned", ["proposed", "planned", "active", "as_built", "faulted", "archived"]),
            ],
            "searchable_fields": ["splice_point_id", "closure_type", "status"],
            "validation_rules": _backend_materialization("splice-closures", "closure_id", {
                "closure_id": "properties.splice_point_id",
                "closure_type": "properties.closure_type",
                "location_name": "record.display_label",
                "latitude": "geometry.coordinates.1",
                "longitude": "geometry.coordinates.0",
                "structure_number": "properties.splice_point_id",
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {"color": "#f59e0b", "radius": 7, "fillOpacity": 0.3},
        },
        {
            "slug": "design-fiber-splice",
            "display_name": "Design Fiber Splice",
            "description": "Synthetic/demo splice matrix row for rebuilding existing/proposed splice continuity between incoming and outgoing cable strands.",
            "geometry_type": "table_only",
            "fields": [
                _field("splice_key", "Splice key", required=True),
                _field("splice_closure_ref", "Splice closure reference"),
                _field("incoming_cable_ref", "Incoming cable reference"),
                _field("incoming_strand_number", "Incoming strand number", "integer"),
                _field("outgoing_cable_ref", "Outgoing cable reference"),
                _field("outgoing_strand_number", "Outgoing strand number", "integer"),
                _field("splice_type", "Splice type", "enum", True, "fusion", ["fusion", "straight_through", "express", "branch", "patch", "open", "reserved"]),
                _field("loss_db", "Loss dB", "number"),
                _field("module_payload", "Module payload JSON", "json", help_text="Optional canonical FiberSplice fields such as splice_closure_id, incoming_cable_id, or outgoing_cable_id."),
                _field("status", "Status", "enum", True, "planned", ["planned", "proposed", "active", "faulted", "retired"]),
            ],
            "searchable_fields": ["splice_key", "splice_closure_ref", "incoming_cable_ref", "outgoing_cable_ref", "status"],
            "validation_rules": _backend_materialization("fiber-splices", "notes", {
                "incoming_strand_number": "properties.incoming_strand_number",
                "outgoing_strand_number": "properties.outgoing_strand_number",
                "splice_type": "properties.splice_type",
                "loss_db": "properties.loss_db",
                "status": "properties.status",
                "notes": {"coalesce": ["properties.splice_key", "record.notes"]},
            }),
            "map_style": {},
        },
        {
            "slug": "design-patch-panel",
            "display_name": "Design Patch Panel",
            "description": "Synthetic/demo patch panel and port map record for rebuilding patch panel modules.",
            "geometry_type": "table_only",
            "fields": [
                _field("panel_id", "Panel ID", required=True),
                _field("location_type", "Location type", "enum", False, "substation", ["structure", "substation", "telecom_node", "cabinet"]),
                _field("location_id", "Location ID"),
                _field("port_count", "Port count", "integer", False, 48, validation_rules={"min": 1, "max": 864}),
                _field("connector_type", "Connector type", "enum", False, "LC", ["LC", "SC", "ST", "FC", "Unknown"]),
                _field("ports_json", "Ports JSON", "json"),
                _field("status", "Status", "enum", True, "planned", ["proposed", "planned", "active", "as_built", "archived"]),
            ],
            "searchable_fields": ["panel_id", "location_id", "connector_type", "status"],
            "validation_rules": _backend_materialization("patch-panels", "panel_id", {
                "panel_id": "properties.panel_id",
                "panel_name": {"coalesce": ["properties.panel_id", "record.display_label"]},
                "connector_type": "properties.connector_type",
                "fiber_type": {"value": "singlemode"},
                "port_count": "properties.port_count",
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {},
        },
        {
            "slug": "design-patch-panel-port",
            "display_name": "Design Patch Panel Port",
            "description": "Synthetic/demo patch panel port record for rebuilding patch maps, terminations, and strand/device cross-connect assignments.",
            "geometry_type": "table_only",
            "fields": [
                _field("panel_port_key", "Panel port key", required=True),
                _field("panel_ref", "Panel reference"),
                _field("port_number", "Port number", "integer", True),
                _field("port_label", "Port label"),
                _field("fiber_strand_ref", "Fiber strand reference"),
                _field("connected_device_port_ref", "Connected device port reference"),
                _field("module_payload", "Module payload JSON", "json", help_text="Optional canonical PatchPanelPort fields such as patch_panel_id or fiber_strand_id."),
                _field("status", "Status", "enum", True, "available", ["available", "assigned", "reserved", "faulted", "retired"]),
            ],
            "searchable_fields": ["panel_port_key", "panel_ref", "port_label", "status"],
            "validation_rules": _backend_materialization("patch-panel-ports", "port_label", {
                "port_number": "properties.port_number",
                "port_label": {"coalesce": ["properties.port_label", "properties.panel_port_key"]},
                "status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {},
        },
        {
            "slug": "design-fiber-assignment",
            "display_name": "Design Fiber Assignment",
            "description": "Synthetic/demo strand/circuit assignment record for rebuilding fiber assignment tables and route traces.",
            "geometry_type": "table_only",
            "fields": [
                _field("assignment_id", "Assignment ID", required=True),
                _field("assignment_name", "Assignment name", required=True),
                _field("service_type", "Service type", "enum", False, "Other", ["SEL_ICON", "C37_94", "Ethernet", "SCADA", "Protection", "DTT", "Leased", "Spare", "Other"]),
                _field("circuit_id", "Circuit ID"),
                _field("cable_ids", "Cable IDs", "json"),
                _field("strand_segments", "Strand segments JSON", "json"),
                _field("estimated_loss_db", "Estimated loss dB", "number"),
                _field("status", "Status", "enum", True, "proposed", ["proposed", "planned", "reserved", "active", "retired"]),
            ],
            "searchable_fields": ["assignment_id", "assignment_name", "service_type", "circuit_id"],
            "validation_rules": _backend_materialization("fiber-assignments", "assignment_id", {
                "assignment_id": "properties.assignment_id",
                "assignment_type": "properties.service_type",
                "assignment_status": "properties.status",
                "notes": "record.notes",
            }),
            "map_style": {},
        },
        {
            "slug": "design-database-object",
            "display_name": "Design Database Object",
            "description": "Table-only synthetic/demo database object for rebuilding arbitrary module, layer, inventory, planning, or reference records that do not have a canonical backend table yet.",
            "geometry_type": "table_only",
            "fields": [
                _field("object_id", "Object ID", required=True),
                _field("object_name", "Object name", required=True),
                _field("category", "Category"),
                _field("status", "Status", "enum", True, "planned", ["proposed", "planned", "active", "as_built", "archived"]),
                _field("metadata", "Metadata JSON", "json", help_text="Synthetic/demo attributes for any object type."),
            ],
            "searchable_fields": ["object_id", "object_name", "category", "status"],
            "validation_rules": {},
            "map_style": {},
        },
        {
            "slug": "design-module-snapshot-record",
            "display_name": "Design Module Snapshot Record",
            "description": "Table-only full-fidelity snapshot of a canonical backend module row. Used to capture module/layer database rows into Design Mode and replay them into a blank instance.",
            "geometry_type": "table_only",
            "fields": [
                _field("source_entity", "Source backend entity", required=True),
                _field("source_record_id", "Source record ID"),
                _field("source_label", "Source label"),
                _field("record_json", "Full backend row JSON", "json", True, help_text="Complete synthetic/demo backend row payload for rebuild/replay."),
                _field("snapshot_status", "Snapshot status", "enum", True, "captured", ["captured", "replayed", "failed", "archived"]),
                _field("dependency_notes", "Dependency notes", "textarea"),
            ],
            "searchable_fields": ["source_entity", "source_record_id", "source_label", "snapshot_status"],
            "validation_rules": {},
            "map_style": {},
        },
        {
            "slug": "design-work-order",
            "display_name": "Design Work Order",
            "description": "Synthetic/demo work order record for rebuilding planning workflows and closeout task data.",
            "geometry_type": "table_only",
            "fields": [
                _field("work_order_number", "Work order number", required=True),
                _field("title", "Title", required=True),
                _field("work_type", "Work type", "enum", False, "fiber_install", ["fiber_install", "splice_work", "patch_panel", "circuit_turnup", "field_verify", "inspection", "other"]),
                _field("priority", "Priority", "enum", False, "normal", ["low", "normal", "high", "critical"]),
                _field("linked_asset_ids", "Linked asset IDs", "json"),
                _field("tasks_json", "Tasks JSON", "json"),
                _field("status", "Status", "enum", True, "draft", ["draft", "planned", "issued", "in_progress", "complete", "cancelled"]),
            ],
            "searchable_fields": ["work_order_number", "title", "work_type", "priority", "status"],
            "validation_rules": _backend_materialization("work-orders", "work_order_number", {
                "work_order_number": "properties.work_order_number",
                "title": "properties.title",
                "description": "record.notes",
                "work_type": "properties.work_type",
                "priority": "properties.priority",
                "status": "properties.status",
            }),
            "map_style": {},
        },
    ],
    "records": [],
}

MODULE_BLUEPRINTS = {CORE_MODULE_BLUEPRINT["key"]: CORE_MODULE_BLUEPRINT}
MODULE_SNAPSHOT_EXCLUDED_ENTITIES = {"audit-logs", "users"}
MODULE_SNAPSHOT_DEFAULT_LIMIT = 500
MODULE_SNAPSHOT_MAX_LIMIT = 5000


def _snapshot_allowed_entities() -> list[str]:
    return sorted(entity for entity in MODEL_REGISTRY if entity not in MODULE_SNAPSHOT_EXCLUDED_ENTITIES)


AGENT_DESIGN_TOOLS = {
    "create-circuit": {
        "tool_key": "create-circuit",
        "label": "Create Circuit",
        "asset_type_slug": "design-circuit",
        "backend_entity": "circuits",
        "geometry_type": "line",
        "required_properties": ["circuit_id", "circuit_name", "service_type"],
        "description": "Create a Design Mode circuit/service path and optionally materialize it into the backend circuits module.",
        "example_properties": {"circuit_id": "DESIGN-CKT-001", "circuit_name": "Design circuit 001", "service_type": "Ethernet", "criticality": "normal", "status": "planned"},
        "example_geometry": {"type": "LineString", "coordinates": [[-71.9, 42.0], [-71.8, 42.1]]},
    },
    "create-device": {
        "tool_key": "create-device",
        "label": "Create Device",
        "asset_type_slug": "design-device",
        "backend_entity": "devices",
        "geometry_type": "table_only",
        "required_properties": ["device_name", "device_type"],
        "description": "Create a synthetic device record and optionally materialize it into backend devices.",
        "example_properties": {"device_name": "DESIGN-ICON-001", "device_type": "SEL_ICON", "manufacturer": "SEL", "model": "ICON", "firmware_version": "demo-rev", "criticality": "normal", "status": "planned"},
        "example_geometry": None,
    },
    "create-device-port": {
        "tool_key": "create-device-port",
        "label": "Create Device Port",
        "asset_type_slug": "design-device-port",
        "backend_entity": "device-ports",
        "geometry_type": "table_only",
        "required_properties": ["port_name", "port_type"],
        "description": "Create a synthetic device port and optionally materialize it into backend device ports.",
        "example_properties": {"port_name": "DESIGN-ICON-001-ETH-1", "device_ref": "DESIGN-ICON-001", "port_type": "Ethernet", "speed": "1G", "physical_label": "DESIGN-ICON-001-ETH-1", "status": "available"},
        "example_geometry": None,
    },
    "create-pole": {
        "tool_key": "create-pole",
        "label": "Create Pole / Support",
        "asset_type_slug": "design-distribution-pole",
        "backend_entity": "regional-structures",
        "geometry_type": "point",
        "required_properties": ["pole_id"],
        "description": "Create a synthetic pole/support structure and optionally materialize it into backend regional structures.",
        "example_properties": {"pole_id": "DESIGN-POLE-001", "route_id": "DESIGN-ROUTE-001", "structure_type": "tangent", "status": "planned"},
        "example_geometry": {"type": "Point", "coordinates": [-71.81, 42.08]},
    },
    "create-fiber-span": {
        "tool_key": "create-fiber-span",
        "label": "Create Fiber / OPGW Span",
        "asset_type_slug": "design-opgw-cable",
        "backend_entity": "fiber-cables",
        "geometry_type": "line",
        "required_properties": ["cable_id", "fiber_count"],
        "description": "Create a synthetic OPGW/fiber span or cable section and optionally materialize it into backend fiber cables.",
        "example_properties": {"cable_id": "DESIGN-OPGW-001", "fiber_count": 48, "from_splice_point_id": "SPL-A", "to_splice_point_id": "SPL-B", "status": "planned"},
        "example_geometry": {"type": "LineString", "coordinates": [[-71.81, 42.08], [-71.79, 42.1]]},
    },
    "create-fiber-strand": {
        "tool_key": "create-fiber-strand",
        "label": "Create Fiber Strand",
        "asset_type_slug": "design-fiber-strand",
        "backend_entity": "fiber-strands",
        "geometry_type": "table_only",
        "required_properties": ["strand_key", "strand_number"],
        "description": "Create a synthetic individual fiber strand and optionally materialize it into backend fiber strands.",
        "example_properties": {"strand_key": "DESIGN-OPGW-001-F001", "cable_id": "DESIGN-OPGW-001", "strand_number": 1, "tube_number": 1, "strand_color": "blue", "status": "available"},
        "example_geometry": None,
    },
    "create-splice": {
        "tool_key": "create-splice",
        "label": "Create Splice Point",
        "asset_type_slug": "design-splice-point",
        "backend_entity": "splice-closures",
        "geometry_type": "point",
        "required_properties": ["splice_point_id", "closure_type"],
        "description": "Create a synthetic splice point/closure and optionally materialize it into backend splice closures.",
        "example_properties": {"splice_point_id": "DESIGN-SPLICE-001", "closure_type": "aerial_opgw_splice", "connected_cable_ids": ["DESIGN-OPGW-001"], "status": "planned"},
        "example_geometry": {"type": "Point", "coordinates": [-71.8, 42.09]},
    },
    "create-fiber-splice": {
        "tool_key": "create-fiber-splice",
        "label": "Create Fiber Splice Row",
        "asset_type_slug": "design-fiber-splice",
        "backend_entity": "fiber-splices",
        "geometry_type": "table_only",
        "required_properties": ["splice_key", "splice_type"],
        "description": "Create a synthetic splice matrix row and optionally materialize it into backend fiber splices.",
        "example_properties": {"splice_key": "DESIGN-SPLICE-001-F001", "splice_closure_ref": "DESIGN-SPLICE-001", "incoming_cable_ref": "DESIGN-OPGW-001", "incoming_strand_number": 1, "outgoing_cable_ref": "DESIGN-OPGW-002", "outgoing_strand_number": 1, "splice_type": "straight_through", "loss_db": 0.04, "status": "planned"},
        "example_geometry": None,
    },
    "create-patch-panel-port": {
        "tool_key": "create-patch-panel-port",
        "label": "Create Patch Panel Port",
        "asset_type_slug": "design-patch-panel-port",
        "backend_entity": "patch-panel-ports",
        "geometry_type": "table_only",
        "required_properties": ["panel_port_key", "port_number"],
        "description": "Create a synthetic patch panel port and optionally materialize it into backend patch panel ports.",
        "example_properties": {"panel_port_key": "DESIGN-PP-001-P01", "panel_ref": "DESIGN-PP-001", "port_number": 1, "port_label": "DESIGN-PP-001-P01", "status": "available"},
        "example_geometry": None,
    },
    "create-patch-panel": {
        "tool_key": "create-patch-panel",
        "label": "Create Patch Panel",
        "asset_type_slug": "design-patch-panel",
        "backend_entity": "patch-panels",
        "geometry_type": "table_only",
        "required_properties": ["panel_id"],
        "description": "Create a synthetic patch panel and optionally materialize it into backend patch panels.",
        "example_properties": {"panel_id": "DESIGN-PP-001", "location_type": "substation", "location_id": "DESIGN-SUB-001", "port_count": 48, "connector_type": "LC", "status": "planned"},
        "example_geometry": None,
    },
    "create-fiber-assignment": {
        "tool_key": "create-fiber-assignment",
        "label": "Create Fiber Assignment",
        "asset_type_slug": "design-fiber-assignment",
        "backend_entity": "fiber-assignments",
        "geometry_type": "table_only",
        "required_properties": ["assignment_id", "assignment_name"],
        "description": "Create a synthetic strand/fiber assignment and optionally materialize it into backend fiber assignments.",
        "example_properties": {"assignment_id": "DESIGN-ASSIGN-001", "assignment_name": "Design assignment 001", "service_type": "Ethernet", "status": "planned"},
        "example_geometry": None,
    },
    "create-database-object": {
        "tool_key": "create-database-object",
        "label": "Create Database Object",
        "asset_type_slug": "design-database-object",
        "backend_entity": None,
        "geometry_type": "table_only",
        "required_properties": ["object_id", "object_name"],
        "description": "Create a generic table-only Design Mode record for arbitrary synthetic/demo data that does not need a map geometry or canonical backend module table yet.",
        "example_properties": {"object_id": "DESIGN-OBJECT-001", "object_name": "Design database object 001", "category": "custom_inventory", "status": "planned", "metadata": {"owner": "demo", "synthetic": True}},
        "example_geometry": None,
        "supports_materialize": False,
    },
}


@router.get("/asset-types")
def list_asset_types(
    session: SessionDep,
    status_filter: str | None = Query(default="active", alias="status"),
) -> list[dict[str, Any]]:
    statement = select(DesignAssetType).order_by(DesignAssetType.display_name)
    if status_filter and status_filter != "all":
        statement = statement.where(DesignAssetType.status == status_filter)
    return [_asset_type_dump(row) for row in session.exec(statement).all()]


@router.post("/asset-types", status_code=status.HTTP_201_CREATED)
def create_asset_type(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    data = _normalize_asset_type_payload(payload)
    if session.exec(select(DesignAssetType).where(DesignAssetType.slug == data["slug"])).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset type slug already exists")
    obj = DesignAssetType(**data, created_by=user.id, updated_by=user.id)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    _add_event(session, "asset_type_created", user, asset_type=obj, after=_asset_type_dump(obj))
    session.commit()
    return _asset_type_dump(obj)


@router.get("/asset-types/{slug}")
def get_asset_type(slug: str, session: SessionDep) -> dict[str, Any]:
    obj = _get_asset_type_by_slug(session, slug)
    return _asset_type_dump(obj)


@router.put("/asset-types/{asset_type_id}")
def update_asset_type(asset_type_id: int, payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    obj = session.get(DesignAssetType, asset_type_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    before = _asset_type_dump(obj)
    data = _normalize_asset_type_payload({**before, **payload}, existing=obj)
    duplicate = session.exec(select(DesignAssetType).where(DesignAssetType.slug == data["slug"], DesignAssetType.id != asset_type_id)).first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset type slug already exists")
    for key, value in data.items():
        setattr(obj, key, value)
    obj.version += 1
    obj.updated_at = _utc_now()
    obj.updated_by = user.id
    session.add(obj)
    session.commit()
    session.refresh(obj)
    _add_event(session, "asset_type_updated", user, asset_type=obj, before=before, after=_asset_type_dump(obj))
    session.commit()
    return _asset_type_dump(obj)


@router.delete("/asset-types/{asset_type_id}")
def archive_asset_type(asset_type_id: int, session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    obj = session.get(DesignAssetType, asset_type_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    before = _asset_type_dump(obj)
    obj.status = "archived"
    obj.archived_at = _utc_now()
    obj.updated_at = _utc_now()
    obj.updated_by = user.id
    session.add(obj)
    session.commit()
    session.refresh(obj)
    _add_event(session, "asset_type_archived", user, asset_type=obj, before=before, after=_asset_type_dump(obj))
    session.commit()
    return _asset_type_dump(obj)


@router.get("/records")
def list_records(
    session: SessionDep,
    asset_type_slug: str | None = None,
    status_filter: str | None = Query(default="active", alias="status"),
    q: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    statement = select(DesignAssetRecord)
    asset_type: DesignAssetType | None = None
    if asset_type_slug:
        asset_type = _get_asset_type_by_slug(session, asset_type_slug)
        statement = statement.where(DesignAssetRecord.asset_type_id == asset_type.id)
    if status_filter and status_filter != "all":
        statement = statement.where(DesignAssetRecord.status == status_filter)
    if q:
        pattern = f"%{q}%"
        statement = statement.where(or_(DesignAssetRecord.record_key.ilike(pattern), DesignAssetRecord.display_label.ilike(pattern), cast(DesignAssetRecord.properties_json, String).ilike(pattern)))
    records = session.exec(statement.order_by(DesignAssetRecord.updated_at.desc()).offset(offset).limit(limit)).all()
    type_map = _asset_type_map(session, records, asset_type)
    return [_record_dump(record, type_map.get(record.asset_type_id)) for record in records]


@router.post("/records", status_code=status.HTTP_201_CREATED)
def create_record(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    asset_type = _resolve_asset_type(session, payload)
    data = _normalize_record_payload(payload, asset_type)
    if session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == data["record_key"])).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record key already exists")
    obj = DesignAssetRecord(**data, asset_type_id=asset_type.id, created_by=user.id, updated_by=user.id)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    dumped = _record_dump(obj, asset_type)
    _add_event(session, "record_created", user, asset_type=asset_type, record=obj, after=dumped)
    session.commit()
    return dumped


@router.get("/records/{record_id}")
def get_record(record_id: int, session: SessionDep) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    return _record_dump(record, asset_type)


@router.put("/records/{record_id}")
def update_record(record_id: int, payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    if asset_type is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record has no valid asset type")
    before = _record_dump(record, asset_type)
    merged_payload = {
        "asset_type_id": asset_type.id,
        "record_key": record.record_key,
        "display_label": record.display_label,
        "geometry": record.geometry_json,
        "properties": record.properties_json,
        "status": record.status,
        "source": record.source,
        "visibility": record.visibility,
        "notes": record.notes,
        **payload,
    }
    data = _normalize_record_payload(merged_payload, asset_type, existing=record)
    duplicate = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == data["record_key"], DesignAssetRecord.id != record_id)).first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record key already exists")
    for key, value in data.items():
        setattr(record, key, value)
    record.version += 1
    record.updated_at = _utc_now()
    record.updated_by = user.id
    session.add(record)
    session.commit()
    session.refresh(record)
    dumped = _record_dump(record, asset_type)
    _add_event(session, "record_updated", user, asset_type=asset_type, record=record, before=before, after=dumped)
    session.commit()
    return dumped


@router.delete("/records/{record_id}")
def archive_record(record_id: int, session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    before = _record_dump(record, asset_type)
    record.status = "archived"
    record.archived_at = _utc_now()
    record.updated_at = _utc_now()
    record.updated_by = user.id
    session.add(record)
    session.commit()
    session.refresh(record)
    dumped = _record_dump(record, asset_type)
    _add_event(session, "record_archived", user, asset_type=asset_type, record=record, before=before, after=dumped)
    session.commit()
    return dumped


@router.get("/records/{record_id}/events")
def record_events(record_id: int, session: SessionDep) -> list[dict[str, Any]]:
    events = session.exec(select(DesignAssetEvent).where(DesignAssetEvent.asset_record_id == record_id).order_by(DesignAssetEvent.event_time.desc())).all()
    return [model_to_dict(event) for event in events]


@router.post("/records/{record_id}/materialize")
def materialize_record(record_id: int, session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor")), payload: dict[str, Any] | None = None) -> dict[str, Any]:
    record = session.get(DesignAssetRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset record not found")
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    if asset_type is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Design asset record has no valid asset type")
    mode = str((payload or {}).get("mode") or "upsert").strip().lower()
    result = _materialize_design_record(session, user, record, asset_type, mode=mode)
    session.commit()
    return result


@router.post("/materialize")
def materialize_records(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    mode = str(payload.get("mode") or "upsert").strip().lower()
    statement = select(DesignAssetRecord).where(DesignAssetRecord.status != "archived")
    if payload.get("asset_type_slug"):
        asset_type = _get_asset_type_by_slug(session, str(payload["asset_type_slug"]))
        statement = statement.where(DesignAssetRecord.asset_type_id == asset_type.id)
    if payload.get("record_ids"):
        ids = [int(item) for item in payload["record_ids"]]
        statement = statement.where(DesignAssetRecord.id.in_(ids))
    records = session.exec(statement.order_by(DesignAssetRecord.updated_at.desc()).limit(1000)).all()
    type_map = _asset_type_map(session, records)
    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for record in records:
        asset_type = type_map.get(record.asset_type_id)
        if asset_type is None:
            errors.append({"record_id": record.id, "record_key": record.record_key, "error": "missing asset type"})
            continue
        try:
            results.append(_materialize_design_record(session, user, record, asset_type, mode=mode))
        except HTTPException as exc:
            errors.append({"record_id": record.id, "record_key": record.record_key, "error": exc.detail})
    session.commit()
    return {
        "mode": mode,
        "processed_count": len(records),
        "materialized_count": len([item for item in results if item.get("action") in {"created", "updated"}]),
        "skipped_count": len([item for item in results if item.get("action") == "skipped"]),
        "error_count": len(errors),
        "results": results,
        "errors": errors,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


@router.get("/map-records")
def map_records(session: SessionDep) -> dict[str, Any]:
    asset_types = session.exec(select(DesignAssetType).where(DesignAssetType.status == "active").order_by(DesignAssetType.display_name)).all()
    type_map = {row.id: row for row in asset_types if row.id is not None}
    records = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.status != "archived").order_by(DesignAssetRecord.updated_at.desc()).limit(2000)).all()
    visible_records = [record for record in records if record.asset_type_id in type_map]
    dumped_records = [_record_dump(record, type_map.get(record.asset_type_id)) for record in visible_records]
    features = [_record_feature(record, type_map[record.asset_type_id]) for record in visible_records if record.geometry_json]
    return {
        "feature_flag": "NEXT_PUBLIC_ENABLE_MAP_EDITING=true",
        "synthetic_data_notice": "Editable planning assets are demo/planning records only. Do not enter CEII, SCADA, relay/protection, outage, private telecom, or private fiber-route data.",
        "asset_types": [_asset_type_dump(asset_type) for asset_type in asset_types],
        "records": dumped_records,
        "feature_collection": {"type": "FeatureCollection", "features": [feature for feature in features if feature is not None]},
    }


@router.get("/blueprint")
def export_blueprint(
    session: SessionDep,
    include_records: bool = True,
    asset_type_slug: str | None = None,
) -> dict[str, Any]:
    statement = select(DesignAssetType).order_by(DesignAssetType.display_name)
    if asset_type_slug:
        statement = statement.where(DesignAssetType.slug == asset_type_slug)
    asset_types = session.exec(statement).all()
    type_map = {asset_type.id: asset_type for asset_type in asset_types if asset_type.id is not None}
    records: list[DesignAssetRecord] = []
    if include_records and type_map:
        records = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.asset_type_id.in_(list(type_map.keys()))).order_by(DesignAssetRecord.record_key)).all()
    return _build_blueprint(asset_types, records, type_map)


@router.post("/blueprint/import", status_code=status.HTTP_201_CREATED)
def import_blueprint(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    result = _install_blueprint(session, user, payload, source_label="uploaded_design_blueprint")
    session.commit()
    return result


@router.get("/rebuild-package")
def export_rebuild_package(
    session: SessionDep,
    include_records: bool = True,
    asset_type_slug: str | None = None,
) -> dict[str, Any]:
    statement = select(DesignAssetType).order_by(DesignAssetType.display_name)
    if asset_type_slug:
        statement = statement.where(DesignAssetType.slug == asset_type_slug)
    asset_types = session.exec(statement).all()
    type_map = {asset_type.id: asset_type for asset_type in asset_types if asset_type.id is not None}
    records: list[DesignAssetRecord] = []
    if include_records and type_map:
        records = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.asset_type_id.in_(list(type_map.keys()))).order_by(DesignAssetRecord.record_key)).all()
    return _build_rebuild_package(session, asset_types, records, type_map)


@router.post("/rebuild-package/import", status_code=status.HTTP_201_CREATED)
def import_rebuild_package(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rebuild package payload must be a JSON object")
    blueprint = payload.get("blueprint")
    if not isinstance(blueprint, dict):
        if "asset_types" in payload or "records" in payload:
            blueprint = payload
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rebuild package must include a blueprint object")
    mode = str(payload.get("mode") or blueprint.get("mode") or "upsert").strip().lower()
    import_result = _install_blueprint(session, user, {**blueprint, "mode": mode}, source_label="uploaded_design_rebuild_package")
    replay_result = None
    if bool(payload.get("replay_snapshots", False) or payload.get("replaySnapshots", False)):
        replay_options = payload.get("replay_options") or payload.get("replayOptions") or {}
        if not isinstance(replay_options, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="replay_options must be an object")
        replay_payload = {
            "mode": replay_options.get("mode") or "upsert",
            "entities": replay_options.get("entities") or payload.get("entities") or [],
            "limit": replay_options.get("limit") or payload.get("limit") or MODULE_SNAPSHOT_MAX_LIMIT,
            "record_ids": replay_options.get("record_ids") or replay_options.get("recordIds"),
            "preserve_ids": replay_options.get("preserve_ids", replay_options.get("preserveIds", True)),
            "normalize_user_refs": replay_options.get("normalize_user_refs", replay_options.get("normalizeUserRefs", True)),
        }
        replay_result = _materialize_module_snapshot_records(session, user, replay_payload)
    session.commit()
    return {
        "package_version": payload.get("package_version") or payload.get("packageVersion") or REBUILD_PACKAGE_VERSION,
        "blueprint_import": import_result,
        "replay_result": replay_result,
        "replay_requested": replay_result is not None,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


@router.get("/rebuild-audit")
def rebuild_audit(
    session: SessionDep,
    entities: str | None = None,
    record_limit: int = Query(default=MODULE_SNAPSHOT_MAX_LIMIT, ge=1, le=MODULE_SNAPSHOT_MAX_LIMIT),
) -> dict[str, Any]:
    selected_entities = _snapshot_payload_entities({"entities": entities or "all"})
    return _build_rebuild_audit(session, selected_entities, record_limit=record_limit)


@router.get("/module-blueprints")
def list_module_blueprints() -> list[dict[str, Any]]:
    return [_module_blueprint_summary(blueprint) for blueprint in MODULE_BLUEPRINTS.values()]


@router.post("/module-blueprints/{blueprint_key}/install", status_code=status.HTTP_201_CREATED)
def install_module_blueprint(blueprint_key: str, session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    blueprint = MODULE_BLUEPRINTS.get(blueprint_key)
    if blueprint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design module blueprint not found")
    result = _install_blueprint(session, user, blueprint, source_label=f"module_blueprint:{blueprint_key}")
    session.commit()
    return result


@router.get("/module-entities")
def list_snapshot_module_entities(session: SessionDep) -> list[dict[str, Any]]:
    return [_module_entity_summary(session, entity) for entity in _snapshot_allowed_entities()]


@router.post("/module-snapshot", status_code=status.HTTP_201_CREATED)
def capture_module_snapshot(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    _ensure_core_blueprint_schemas(session, user)
    asset_type = _get_asset_type_by_slug(session, "design-module-snapshot-record")
    entities = _snapshot_payload_entities(payload)
    limit = _snapshot_payload_limit(payload)
    mode = str(payload.get("mode") or "upsert").strip().lower()
    if mode not in {"upsert", "skip_existing"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Module snapshot mode must be upsert or skip_existing")

    results: list[dict[str, Any]] = []
    entity_counts: dict[str, int] = {}
    created = updated = skipped = 0
    for entity in entities:
        model = MODEL_REGISTRY[entity]
        statement = select(model)
        if "id" in model.model_fields:  # type: ignore[attr-defined]
            statement = statement.order_by(getattr(model, "id"))
        rows = session.exec(statement.limit(limit)).all()
        entity_counts[entity] = len(rows)
        for row in rows:
            record_result = _capture_module_row_as_design_record(session, user, asset_type, entity, row, mode=mode)
            results.append(record_result)
            if record_result["action"] == "created":
                created += 1
            elif record_result["action"] == "updated":
                updated += 1
            else:
                skipped += 1
    session.commit()
    return {
        "mode": mode,
        "entities": entities,
        "limit_per_entity": limit,
        "captured_count": created + updated,
        "created_records": created,
        "updated_records": updated,
        "skipped_records": skipped,
        "entity_counts": entity_counts,
        "results": results[:200],
        "result_count": len(results),
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


@router.post("/module-snapshot/materialize")
def materialize_module_snapshot(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    result = _materialize_module_snapshot_records(session, user, payload)
    session.commit()
    return result


@router.get("/agent-tools")
def list_agent_tools() -> list[dict[str, Any]]:
    return [_agent_tool_summary(tool) for tool in AGENT_DESIGN_TOOLS.values()]


@router.post("/agent-tools/{tool_key}/run", status_code=status.HTTP_201_CREATED)
def run_agent_tool(tool_key: str, payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    result = _run_agent_design_tool(session, user, tool_key, payload, commit=True)
    return result


@router.post("/terminal-command")
def run_terminal_command(payload: dict[str, Any], session: SessionDep, user: User = Depends(require_roles("admin", "engineer", "editor"))) -> dict[str, Any]:
    command = str(payload.get("command") or "").strip()
    if not command:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="command is required")
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    materialize = bool(payload.get("materialize", True))
    result = _interpret_terminal_command(session, user, command, context or {}, materialize=materialize)
    session.commit()
    return result


def _run_agent_design_tool(session: SessionDep, user: User, tool_key: str, payload: dict[str, Any], commit: bool = False) -> dict[str, Any]:
    tool = AGENT_DESIGN_TOOLS.get(tool_key)
    if tool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design Mode agent tool not found")
    _ensure_core_blueprint_schemas(session, user)
    asset_type = _get_asset_type_by_slug(session, tool["asset_type_slug"])
    properties = payload.get("properties") or {}
    if not isinstance(properties, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="properties must be an object")
    missing = [name for name in tool["required_properties"] if _is_empty(properties.get(name))]
    if missing:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Missing required tool properties: {', '.join(missing)}")
    record_payload = {
        "asset_type_slug": asset_type.slug,
        "record_key": payload.get("record_key") or payload.get("recordKey") or _agent_record_key(tool, properties),
        "display_label": payload.get("display_label") or payload.get("displayLabel") or _agent_display_label(tool, properties),
        "geometry": payload.get("geometry"),
        "properties": properties,
        "status": _agent_record_status(payload, properties),
        "source": "synthetic_demo",
        "visibility": "synthetic-demo",
        "notes": payload.get("notes") or f"Created through Design Mode agent tool {tool_key}. Synthetic/demo planning data only.",
    }
    if asset_type.geometry_type == "table_only":
        record_payload["geometry"] = None
    existing = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == str(record_payload["record_key"]))).first()
    if existing:
        before = _record_dump(existing, asset_type)
        data = _normalize_record_payload(record_payload, asset_type, existing=existing)
        for key, value in data.items():
            setattr(existing, key, value)
        existing.asset_type_id = asset_type.id
        existing.version += 1
        existing.updated_at = _utc_now()
        existing.updated_by = user.id
        session.add(existing)
        session.flush()
        record = existing
        action = "updated"
        _add_event(session, "agent_tool_record_updated", user, asset_type=asset_type, record=record, before=before, after=_record_dump(record, asset_type))
    else:
        data = _normalize_record_payload(record_payload, asset_type)
        record = DesignAssetRecord(**data, asset_type_id=asset_type.id, created_by=user.id, updated_by=user.id)
        session.add(record)
        session.flush()
        action = "created"
        _add_event(session, "agent_tool_record_created", user, asset_type=asset_type, record=record, after=_record_dump(record, asset_type))
    materialization = None
    if bool(payload.get("materialize", False)) and bool(tool.get("supports_materialize", bool(tool.get("backend_entity")))):
        materialization = _materialize_design_record(session, user, record, asset_type, mode=str(payload.get("materialize_mode") or "upsert"))
    if commit:
        session.commit()
    return {
        "tool": _agent_tool_summary(tool),
        "record_action": action,
        "record": _record_dump(record, asset_type),
        "materialization": materialization,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


TERMINAL_REFERENCE_PATTERN = re.compile(r"\b[A-Za-z0-9][A-Za-z0-9_.:-]*(?:-STR-\d{2,6}|-POLE-\d{2,6}|-SPLICE-\d{2,6})\b", re.IGNORECASE)


def _interpret_terminal_command(session: SessionDep, user: User, command: str, context: dict[str, Any], materialize: bool) -> dict[str, Any]:
    lowered = command.lower()
    answers = _terminal_answers(session, command)
    if answers:
        return _terminal_result(command, "question", "I found matching synthetic planning data.", answers=answers)

    rename_result = _terminal_rename_record(session, user, command)
    if rename_result:
        return _terminal_result(command, "rename_object", rename_result["summary"], actions=[rename_result])

    actions: list[dict[str, Any]] = []
    prompts: list[dict[str, str]] = []
    reference_labels = _terminal_reference_labels(command)
    context_assets = _terminal_context_assets(context)
    reference_assets = [asset for asset in context_assets if asset["label"].lower() in {label.lower() for label in reference_labels}]
    if not reference_assets and reference_labels:
        reference_assets = [{"label": label, "coordinates": None, "kind": "typed_reference"} for label in reference_labels]
    selected_asset = _terminal_selected_asset(context)
    selected_label = selected_asset.get("label") if selected_asset else None

    wants_splice = "splice" in lowered or "splice can" in lowered or "splice closure" in lowered
    wants_span = "span" in lowered or "cable" in lowered and any(word in lowered for word in ["attach", "build", "create", "add"])
    wants_pole = any(phrase in lowered for phrase in ["new pole", "add pole", "build pole", "create pole", "support structure"])
    wants_database_object = any(phrase in lowered for phrase in ["database object", "custom object", "new object", "add object"])
    created_pole_id: str | None = None
    created_pole_coordinates: list[float] | None = None

    if wants_pole:
        pole_id = _terminal_pole_id(command, reference_labels)
        created_pole_id = pole_id
        created_pole_coordinates = _terminal_midpoint(reference_assets) or _terminal_asset_coordinates(selected_asset) or _terminal_default_coordinates(command)
        pole_payload = {
            "materialize": materialize,
            "geometry": {"type": "Point", "coordinates": created_pole_coordinates},
            "properties": {
                "pole_id": pole_id,
                "route_id": _terminal_route_id(command, reference_labels),
                "structure_type": "tap" if wants_splice else "tangent",
                "has_splice": wants_splice,
                "fiber_assignment_ids": [],
                "status": "planned",
                "source_command": command,
                "between_structure_refs": reference_labels,
                "synthetic": True,
            },
            "notes": "Created from the dashboard command terminal. Synthetic/demo planning data only.",
        }
        actions.append(_terminal_action("create_pole", _run_agent_design_tool(session, user, "create-pole", pole_payload)))

    if wants_splice:
        splice_target = created_pole_id or selected_label or (reference_labels[0] if reference_labels else "")
        splice_coordinates = created_pole_coordinates or _terminal_asset_coordinates(selected_asset) or _terminal_midpoint(reference_assets)
        if not splice_target:
            prompts.append({"field": "splice_target", "question": "Which pole, structure, or splice point should receive the splice can?"})
        else:
            splice_id = _terminal_splice_id(command, splice_target)
            splice_payload = {
                "materialize": materialize,
                "geometry": {"type": "Point", "coordinates": splice_coordinates or _terminal_default_coordinates(command)},
                "properties": {
                    "splice_point_id": splice_id,
                    "closure_type": "aerial_opgw_splice",
                    "connected_cable_ids": _terminal_list_after_keywords(command, ["cable", "cables"])[:8],
                    "splice_count": _terminal_int_after_keywords(command, ["splice count", "splices"]) or 0,
                    "matrix_json": {"source_command": command, "target": splice_target, "synthetic": True},
                    "status": "planned",
                    "pole_ref": splice_target,
                },
                "notes": "Created from the dashboard command terminal. Synthetic/demo splice planning data only.",
            }
            actions.append(_terminal_action("create_splice_can", _run_agent_design_tool(session, user, "create-splice", splice_payload)))

    if wants_span:
        span_coordinates = _terminal_span_coordinates(reference_assets, selected_asset, created_pole_coordinates)
        if not span_coordinates:
            prompts.append({"field": "span_endpoints", "question": "Name the A-end and Z-end pole/structure IDs for the span, or click/select one endpoint on the map first."})
        else:
            span_refs = reference_labels or unique_strings([selected_label, created_pole_id])
            cable_id = _terminal_cable_id(command, span_refs)
            span_payload = {
                "materialize": materialize,
                "geometry": {"type": "LineString", "coordinates": span_coordinates},
                "properties": {
                    "cable_id": cable_id,
                    "parent_route_id": _terminal_route_id(command, span_refs),
                    "from_splice_point_id": span_refs[0] if span_refs else "terminal-command-a-end",
                    "to_splice_point_id": span_refs[1] if len(span_refs) > 1 else "terminal-command-z-end",
                    "fiber_count": _terminal_fiber_count(command),
                    "available_strands": _terminal_fiber_count(command),
                    "assigned_strands": 0,
                    "status": "planned",
                    "source_command": command,
                    "synthetic": True,
                },
                "notes": "Created from the dashboard command terminal. Synthetic/demo fiber span only.",
            }
            actions.append(_terminal_action("create_span", _run_agent_design_tool(session, user, "create-fiber-span", span_payload)))

    if wants_database_object and not actions:
        object_name = _terminal_object_name(command)
        if not object_name:
            prompts.append({"field": "object_name", "question": "What should the new database object be called, and what category/module should it belong to?"})
        else:
            object_id = _safe_identifier(object_name, "CMD-OBJECT")
            object_payload = {
                "materialize": False,
                "properties": {
                    "object_id": object_id,
                    "object_name": object_name,
                    "category": _terminal_category(command),
                    "status": "planned",
                    "metadata": {"source_command": command, "synthetic": True, "context": context},
                },
                "notes": "Created from the dashboard command terminal as a schema-backed synthetic database object.",
            }
            actions.append(_terminal_action("create_database_object", _run_agent_design_tool(session, user, "create-database-object", object_payload)))

    if actions:
        summary = f"Completed {len(actions)} command action{'s' if len(actions) != 1 else ''}. New map objects are synthetic/demo planning records."
        return _terminal_result(command, "edit_database", summary, actions=actions, prompts=prompts)

    if not prompts:
        prompts = [
            {"field": "intent", "question": "Tell me whether you want to add, rename, splice, assign strands, create a span, or ask about a cable/service."},
            {"field": "target", "question": "Include the target asset ID, or click a pole, splice, cable, service, or structure on the map before sending the command."},
        ]
    return _terminal_result(command, "needs_parameters", "I need a little more structure before I can safely edit the database.", prompts=prompts, needs_input=True)


def _terminal_result(
    command: str,
    intent: str,
    summary: str,
    actions: list[dict[str, Any]] | None = None,
    answers: list[dict[str, Any]] | None = None,
    prompts: list[dict[str, str]] | None = None,
    needs_input: bool = False,
) -> dict[str, Any]:
    return {
        "input": command,
        "intent": intent,
        "summary": summary,
        "actions": actions or [],
        "answers": answers or [],
        "parameter_prompts": prompts or [],
        "needs_input": needs_input or bool(prompts),
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


def _terminal_action(action: str, result: dict[str, Any]) -> dict[str, Any]:
    record = result.get("record") or {}
    return {
        "action": action,
        "status": result.get("record_action") or "completed",
        "record_id": record.get("id"),
        "record_key": record.get("record_key"),
        "label": record.get("display_label"),
        "asset_type_slug": record.get("asset_type_slug"),
        "materialization": result.get("materialization"),
    }


def _terminal_answers(session: SessionDep, command: str) -> list[dict[str, Any]]:
    lowered = command.lower()
    if not any(word in lowered for word in ["how", "what", "where", "show", "find", "tell", "service", "fiber", "strand", "cable"]):
        return []
    terms = _terminal_search_terms(command)
    answers: list[dict[str, Any]] = []
    cable = _find_fiber_cable(session, terms)
    if cable:
        strand_count = session.exec(select(func.count(FiberStrand.id)).where(FiberStrand.fiber_cable_id == cable.id)).one()
        answers.append({
            "entity": "fiber_cable",
            "id": cable.cable_id,
            "summary": f"{cable.cable_id} is a {cable.fiber_count}-strand {cable.cable_type} cable from {cable.a_end_location or 'unknown A-end'} to {cable.z_end_location or 'unknown Z-end'}.",
            "fields": {
                "fiber_count": cable.fiber_count,
                "strand_records": int(strand_count or 0),
                "a_end": cable.a_end_location,
                "z_end": cable.z_end_location,
                "route_name": cable.route_name,
                "status": cable.status,
            },
        })
    design_cable = _find_design_record(session, terms, asset_type_slug="design-opgw-cable")
    if design_cable:
        props = design_cable.properties_json or {}
        answers.append({
            "entity": "design_opgw_cable",
            "id": design_cable.record_key,
            "summary": f"{design_cable.display_label} carries {props.get('fiber_count', 'unknown')} synthetic strands between {props.get('from_splice_point_id', 'unknown A-end')} and {props.get('to_splice_point_id', 'unknown Z-end')}.",
            "fields": props,
        })
    if "service" in lowered or "circuit" in lowered:
        service_answers = _find_service_answers(session, terms)
        answers.extend(service_answers)
    return answers[:6]


def _terminal_rename_record(session: SessionDep, user: User, command: str) -> dict[str, Any] | None:
    match = re.search(r"\brename\s+(?:pole|splice|span|fiber|cable|service|object|asset)?\s*([A-Za-z0-9_.:-]+)\s+(?:to|as)\s+([A-Za-z0-9_.:-]+)\b", command, re.IGNORECASE)
    if not match:
        return None
    old_key, new_key = match.group(1).strip(), match.group(2).strip()
    record = _find_design_record(session, [old_key])
    if record is None:
        return {
            "action": "rename_object",
            "status": "needs_input",
            "summary": f"I could not find a schema-backed synthetic object named {old_key}. Click the object or include its exact record key.",
            "record_key": old_key,
        }
    asset_type = session.get(DesignAssetType, record.asset_type_id)
    if asset_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    before = _record_dump(record, asset_type)
    properties = dict(record.properties_json or {})
    for property_key in ["pole_id", "splice_point_id", "cable_id", "assignment_id", "object_id", "object_name"]:
        if str(properties.get(property_key) or "").lower() == old_key.lower() or property_key.endswith("_name"):
            properties[property_key] = new_key
            break
    duplicate = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == new_key, DesignAssetRecord.id != record.id)).first()
    if duplicate is None:
        record.record_key = new_key
    record.display_label = new_key
    record.properties_json = properties
    record.version += 1
    record.updated_at = _utc_now()
    record.updated_by = user.id
    session.add(record)
    session.flush()
    after = _record_dump(record, asset_type)
    _add_event(session, "terminal_record_renamed", user, asset_type=asset_type, record=record, before=before, after=after)
    return {
        "action": "rename_object",
        "status": "updated",
        "summary": f"Renamed {old_key} to {new_key}.",
        "record_id": record.id,
        "record_key": record.record_key,
        "label": record.display_label,
        "record": after,
    }


def _terminal_reference_labels(command: str) -> list[str]:
    return unique_strings(match.group(0).strip() for match in TERMINAL_REFERENCE_PATTERN.finditer(command))


def unique_strings(values: Any) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value:
            continue
        text = str(value).strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _terminal_context_assets(context: dict[str, Any]) -> list[dict[str, Any]]:
    assets = context.get("reference_assets")
    if not isinstance(assets, list):
        return []
    normalized: list[dict[str, Any]] = []
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        label = str(asset.get("label") or asset.get("id") or "").strip()
        coordinates = asset.get("coordinates")
        normalized.append({
            "id": asset.get("id"),
            "label": label,
            "kind": asset.get("kind"),
            "coordinates": coordinates if _coordinate(coordinates) else None,
        })
    return normalized


def _terminal_selected_asset(context: dict[str, Any]) -> dict[str, Any] | None:
    asset = context.get("selected_asset")
    if not isinstance(asset, dict):
        return None
    return {
        "id": asset.get("id"),
        "label": str(asset.get("label") or asset.get("id") or "").strip(),
        "kind": asset.get("kind"),
        "coordinates": asset.get("coordinates") if _coordinate(asset.get("coordinates")) else None,
    }


def _terminal_asset_coordinates(asset: dict[str, Any] | None) -> list[float] | None:
    if not asset:
        return None
    coordinates = asset.get("coordinates")
    return [float(coordinates[0]), float(coordinates[1])] if _coordinate(coordinates) else None


def _terminal_midpoint(assets: list[dict[str, Any]]) -> list[float] | None:
    coordinates = [_terminal_asset_coordinates(asset) for asset in assets]
    valid = [coordinate for coordinate in coordinates if coordinate]
    if len(valid) < 2:
        return valid[0] if valid else None
    return [sum(point[0] for point in valid) / len(valid), sum(point[1] for point in valid) / len(valid)]


def _terminal_span_coordinates(reference_assets: list[dict[str, Any]], selected_asset: dict[str, Any] | None, created_pole_coordinates: list[float] | None) -> list[list[float]] | None:
    coordinates = [_terminal_asset_coordinates(asset) for asset in reference_assets]
    valid = [coordinate for coordinate in coordinates if coordinate]
    selected_coordinates = _terminal_asset_coordinates(selected_asset)
    if created_pole_coordinates and selected_coordinates:
        return [selected_coordinates, created_pole_coordinates]
    if len(valid) >= 2:
        return [valid[0], valid[1]]
    if created_pole_coordinates and len(valid) == 1:
        return [valid[0], created_pole_coordinates]
    return None


def _terminal_default_coordinates(command: str) -> list[float]:
    seed = sum(ord(char) for char in command)
    return [-71.82 + ((seed % 60) - 30) / 1000, 42.28 + (((seed // 7) % 60) - 30) / 1000]


def _terminal_pole_id(command: str, reference_labels: list[str]) -> str:
    explicit = _terminal_value_after(command, ["pole id", "pole named", "pole called", "structure id"])
    if explicit and "-STR-" not in explicit.upper():
        return _safe_identifier(explicit, "CMD-POLE")
    if len(reference_labels) >= 2:
        return _safe_identifier(f"CMD-POLE-{reference_labels[0]}-{reference_labels[1]}", "CMD-POLE")
    return _safe_identifier(f"CMD-POLE-{uuid4().hex[:8]}", "CMD-POLE")


def _terminal_splice_id(command: str, target: str) -> str:
    explicit = _terminal_value_after(command, ["splice id", "splice can", "splice"])
    if explicit and explicit.lower() not in {"can", "closure", "point", "to", "on", "at", "for", "my", "the"}:
        return _safe_identifier(explicit, "CMD-SPLICE")
    return _safe_identifier(f"CMD-SPLICE-{target}", "CMD-SPLICE")


def _terminal_cable_id(command: str, references: list[str]) -> str:
    explicit = _terminal_value_after(command, ["cable id", "span id", "fiber id"])
    if explicit:
        return _safe_identifier(explicit, "CMD-CABLE")
    if len(references) >= 2:
        return _safe_identifier(f"CMD-CABLE-{references[0]}-{references[1]}", "CMD-CABLE")
    return _safe_identifier(f"CMD-CABLE-{uuid4().hex[:8]}", "CMD-CABLE")


def _terminal_route_id(command: str, references: list[str]) -> str:
    explicit = _terminal_value_after(command, ["route id", "route", "feeder"])
    if explicit:
        return _safe_identifier(explicit, "CMD-ROUTE")
    if references:
        return _safe_identifier(f"CMD-ROUTE-{references[0]}", "CMD-ROUTE")
    return "CMD-ROUTE-TERMINAL"


def _terminal_fiber_count(command: str) -> int:
    match = re.search(r"\b(24|48|72|96|144|288|432|864)\s*(?:f|fiber|fibers|strand|strands)\b", command, re.IGNORECASE)
    return int(match.group(1)) if match else 48


def _terminal_object_name(command: str) -> str:
    match = re.search(r"(?:database object|custom object|new object|add object)\s+(?:called|named)?\s*([A-Za-z0-9_.: -]{3,80})", command, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _terminal_category(command: str) -> str:
    match = re.search(r"\b(?:category|module|table)\s+([A-Za-z0-9_.:-]+)", command, re.IGNORECASE)
    return match.group(1).strip() if match else "terminal_command_object"


def _terminal_value_after(command: str, keywords: list[str]) -> str:
    for keyword in keywords:
        match = re.search(rf"\b{re.escape(keyword)}\s*(?:=|:|called|named)?\s*([A-Za-z0-9_.:-]+)", command, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def _terminal_int_after_keywords(command: str, keywords: list[str]) -> int | None:
    for keyword in keywords:
        match = re.search(rf"\b{re.escape(keyword)}\s*(?:=|:)?\s*(\d+)", command, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def _terminal_list_after_keywords(command: str, keywords: list[str]) -> list[str]:
    values: list[str] = []
    for keyword in keywords:
        for match in re.finditer(rf"\b{re.escape(keyword)}\s*(?:=|:)?\s*([A-Za-z0-9_.:-]+)", command, re.IGNORECASE):
            values.append(match.group(1))
    return unique_strings(values)


def _terminal_search_terms(command: str) -> list[str]:
    explicit = _terminal_reference_labels(command)
    tokens = re.findall(r"\b[A-Za-z0-9][A-Za-z0-9_.:-]{4,}\b", command)
    stop_words = {"build", "between", "where", "cable", "fiber", "service", "strands", "strand", "about", "what", "goes", "rename"}
    return unique_strings([*explicit, *(token for token in tokens if token.lower() not in stop_words)])


def _find_fiber_cable(session: SessionDep, terms: list[str]) -> FiberCable | None:
    for term in terms:
        pattern = f"%{term}%"
        cable = session.exec(
            select(FiberCable).where(or_(FiberCable.cable_id.ilike(pattern), FiberCable.route_name.ilike(pattern))).limit(1)
        ).first()
        if cable:
            return cable
    return None


def _find_design_record(session: SessionDep, terms: list[str], asset_type_slug: str | None = None) -> DesignAssetRecord | None:
    if not terms:
        return None
    statement = select(DesignAssetRecord)
    if asset_type_slug:
        asset_type = session.exec(select(DesignAssetType).where(DesignAssetType.slug == asset_type_slug)).first()
        if asset_type is None:
            return None
        statement = statement.where(DesignAssetRecord.asset_type_id == asset_type.id)
    for term in terms:
        pattern = f"%{term}%"
        record = session.exec(
            statement.where(or_(DesignAssetRecord.record_key.ilike(pattern), DesignAssetRecord.display_label.ilike(pattern), cast(DesignAssetRecord.properties_json, String).ilike(pattern))).limit(1)
        ).first()
        if record:
            return record
    return None


def _find_service_answers(session: SessionDep, terms: list[str]) -> list[dict[str, Any]]:
    answers: list[dict[str, Any]] = []
    for term in terms[:4]:
        pattern = f"%{term}%"
        circuits = session.exec(select(Circuit).where(or_(Circuit.circuit_id.ilike(pattern), Circuit.circuit_name.ilike(pattern), Circuit.service_type.ilike(pattern))).limit(3)).all()
        for circuit in circuits:
            answers.append({
                "entity": "circuit",
                "id": circuit.circuit_id,
                "summary": f"{circuit.circuit_id} is a {circuit.service_type} service named {circuit.circuit_name} with {circuit.status} status.",
                "fields": model_to_dict(circuit),
            })
        regional = session.exec(select(RegionalSyntheticCircuit).where(or_(RegionalSyntheticCircuit.circuit_id.ilike(pattern), RegionalSyntheticCircuit.service_type.ilike(pattern), RegionalSyntheticCircuit.a_end_site.ilike(pattern), RegionalSyntheticCircuit.z_end_site.ilike(pattern))).limit(3)).all()
        for circuit in regional:
            answers.append({
                "entity": "regional_synthetic_circuit",
                "id": circuit.circuit_id,
                "summary": f"{circuit.circuit_id} is a synthetic {circuit.service_type} service from {circuit.a_end_site} to {circuit.z_end_site}.",
                "fields": model_to_dict(circuit),
            })
    return answers


def _safe_identifier(value: str, prefix: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_-]+", "-", value.upper()).strip("-")
    text = re.sub(r"-{2,}", "-", text)
    if not text or text == prefix:
        text = f"{prefix}-{uuid4().hex[:8].upper()}"
    if not text.startswith(prefix):
        text = f"{prefix}-{text}"
    return text[:150]


def _module_entity_summary(session: SessionDep, entity: str) -> dict[str, Any]:
    model = MODEL_REGISTRY[entity]
    fields = list(model.model_fields.keys())  # type: ignore[attr-defined]
    return {
        "entity": entity,
        "model_name": model.__name__,
        "record_count": _module_entity_count(session, model),
        "fields": fields,
        "primary_key": "id" if "id" in fields else None,
        "snapshot_record_key_prefix": f"module-snapshot:{entity}:",
        "excluded": entity in MODULE_SNAPSHOT_EXCLUDED_ENTITIES,
    }


def _build_rebuild_package(session: SessionDep, asset_types: list[DesignAssetType], records: list[DesignAssetRecord], type_map: dict[int, DesignAssetType]) -> dict[str, Any]:
    snapshot_records = [record for record in records if type_map.get(record.asset_type_id) and type_map[record.asset_type_id].slug == "design-module-snapshot-record"]
    snapshot_entities = sorted({str((record.properties_json or {}).get("source_entity")) for record in snapshot_records if (record.properties_json or {}).get("source_entity")})
    return {
        "package_version": REBUILD_PACKAGE_VERSION,
        "exported_at": _utc_now().isoformat(),
        "synthetic_data_notice": BLUEPRINT_NOTICE,
        "blueprint": _build_blueprint(asset_types, records, type_map),
        "module_entities": [_module_entity_summary(session, entity) for entity in _snapshot_allowed_entities()],
        "module_blueprints": [_module_blueprint_summary(blueprint) for blueprint in MODULE_BLUEPRINTS.values()],
        "agent_tools": [_agent_tool_summary(tool) for tool in AGENT_DESIGN_TOOLS.values()],
        "snapshot_summary": {
            "snapshot_record_count": len(snapshot_records),
            "snapshot_entities": snapshot_entities,
        },
        "rebuild_steps": [
            "Import this package through POST /api/design-assets/rebuild-package/import or the Design Mode dashboard.",
            "Install or update asset type schemas and Design Mode records from the embedded blueprint.",
            "Replay design-module-snapshot-record rows when backend module rows should be recreated in a blank instance.",
            "Use Design Mode agent tools for new poles, devices, ports, spans, strands, splices, circuits, fiber assignments, and custom database objects.",
        ],
    }


def _build_rebuild_audit(session: SessionDep, entities: list[str], record_limit: int) -> dict[str, Any]:
    snapshot_type = session.exec(select(DesignAssetType).where(DesignAssetType.slug == "design-module-snapshot-record")).first()
    snapshot_records: list[DesignAssetRecord] = []
    if snapshot_type and snapshot_type.id is not None:
        snapshot_records = session.exec(
            select(DesignAssetRecord)
            .where(DesignAssetRecord.asset_type_id == snapshot_type.id, DesignAssetRecord.status != "archived")
            .order_by(DesignAssetRecord.record_key)
            .limit(record_limit)
        ).all()

    snapshots_by_entity: dict[str, list[DesignAssetRecord]] = {entity: [] for entity in entities}
    orphan_snapshot_count = 0
    for record in snapshot_records:
        entity = str((record.properties_json or {}).get("source_entity") or "")
        if entity in snapshots_by_entity:
            snapshots_by_entity[entity].append(record)
        else:
            orphan_snapshot_count += 1

    rows: list[dict[str, Any]] = []
    for entity in entities:
        model = MODEL_REGISTRY[entity]
        model_fields = set(model.model_fields.keys())  # type: ignore[attr-defined]
        backend_count = _module_entity_count(session, model)
        records = snapshots_by_entity.get(entity, [])
        observed_fields: set[str] = set()
        replay_ready_count = 0
        invalid_snapshot_count = 0
        sample_record_keys: list[str] = []
        for record in records:
            if len(sample_record_keys) < 5:
                sample_record_keys.append(record.record_key)
            properties = record.properties_json or {}
            row_json = properties.get("record_json")
            if not isinstance(row_json, dict):
                invalid_snapshot_count += 1
                continue
            observed_fields.update(str(key) for key in row_json.keys())
            if str(properties.get("source_entity") or "") == entity and set(row_json.keys()) <= model_fields:
                replay_ready_count += 1
            else:
                invalid_snapshot_count += 1
        ignored_fields = {"created_at", "updated_at", "created_by", "updated_by"}
        missing_model_fields = sorted(model_fields - observed_fields - ignored_fields) if records else sorted(model_fields - ignored_fields)
        coverage_ratio = 1.0 if backend_count == 0 else min(len(records) / backend_count, 1.0)
        if backend_count == 0 and len(records) == 0:
            coverage_status = "empty"
        elif backend_count == 0 and len(records) > 0:
            coverage_status = "package_only"
        elif len(records) == 0:
            coverage_status = "missing_snapshots"
        elif len(records) < backend_count:
            coverage_status = "partial"
        elif invalid_snapshot_count or missing_model_fields:
            coverage_status = "needs_review"
        else:
            coverage_status = "replay_ready"
        rows.append({
            "entity": entity,
            "model_name": model.__name__,
            "backend_record_count": backend_count,
            "snapshot_record_count": len(records),
            "replay_ready_count": replay_ready_count,
            "invalid_snapshot_count": invalid_snapshot_count,
            "coverage_ratio": coverage_ratio,
            "coverage_status": coverage_status,
            "missing_model_fields": missing_model_fields[:60],
            "missing_model_field_count": len(missing_model_fields),
            "sample_record_keys": sample_record_keys,
        })

    totals = {
        "entity_count": len(rows),
        "backend_record_count": sum(row["backend_record_count"] for row in rows),
        "snapshot_record_count": sum(row["snapshot_record_count"] for row in rows),
        "replay_ready_entity_count": len([row for row in rows if row["coverage_status"] == "replay_ready"]),
        "missing_snapshot_entity_count": len([row for row in rows if row["coverage_status"] == "missing_snapshots"]),
        "partial_entity_count": len([row for row in rows if row["coverage_status"] == "partial"]),
        "needs_review_entity_count": len([row for row in rows if row["coverage_status"] == "needs_review"]),
        "package_only_entity_count": len([row for row in rows if row["coverage_status"] == "package_only"]),
        "empty_entity_count": len([row for row in rows if row["coverage_status"] == "empty"]),
        "invalid_snapshot_count": sum(row["invalid_snapshot_count"] for row in rows),
        "orphan_snapshot_count": orphan_snapshot_count,
    }
    return {
        "audit_time": _utc_now().isoformat(),
        "entities": entities,
        "totals": totals,
        "rows": rows,
        "rebuild_ready": totals["missing_snapshot_entity_count"] == 0 and totals["partial_entity_count"] == 0 and totals["needs_review_entity_count"] == 0 and totals["invalid_snapshot_count"] == 0,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


def _module_entity_count(session: SessionDep, model: Any) -> int:
    try:
        return int(session.exec(select(func.count()).select_from(model)).one() or 0)
    except Exception:  # noqa: BLE001
        return len(session.exec(select(model).limit(MODULE_SNAPSHOT_MAX_LIMIT)).all())


def _materialize_module_snapshot_records(session: SessionDep, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    asset_type = _get_asset_type_by_slug(session, "design-module-snapshot-record")
    entities = _snapshot_payload_entities(payload, allow_empty=True)
    mode = str(payload.get("mode") or "upsert").strip().lower()
    if mode not in {"upsert", "skip_existing"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Module snapshot materialization mode must be upsert or skip_existing")
    preserve_ids = bool(payload.get("preserve_ids", payload.get("preserveIds", True)))
    normalize_user_refs = bool(payload.get("normalize_user_refs", payload.get("normalizeUserRefs", True)))
    limit = _snapshot_payload_limit(payload)

    statement = select(DesignAssetRecord).where(DesignAssetRecord.asset_type_id == asset_type.id, DesignAssetRecord.status != "archived").order_by(DesignAssetRecord.record_key)
    if payload.get("record_ids") or payload.get("recordIds"):
        ids = [int(item) for item in (payload.get("record_ids") or payload.get("recordIds") or [])]
        statement = statement.where(DesignAssetRecord.id.in_(ids))
    records = session.exec(statement.limit(limit)).all()
    if entities:
        records = [record for record in records if (record.properties_json or {}).get("source_entity") in entities]

    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for record in records:
        try:
            results.append(_materialize_module_snapshot_record(session, user, record, asset_type, mode=mode, preserve_ids=preserve_ids, normalize_user_refs=normalize_user_refs))
        except HTTPException as exc:
            errors.append({"record_id": record.id, "record_key": record.record_key, "error": exc.detail})
    return {
        "mode": mode,
        "preserve_ids": preserve_ids,
        "normalize_user_refs": normalize_user_refs,
        "processed_count": len(records),
        "materialized_count": len([item for item in results if item.get("action") in {"created", "updated"}]),
        "skipped_count": len([item for item in results if item.get("action") == "skipped"]),
        "error_count": len(errors),
        "results": results[:200],
        "errors": errors[:200],
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


def _snapshot_payload_entities(payload: dict[str, Any], allow_empty: bool = False) -> list[str]:
    allowed = set(_snapshot_allowed_entities())
    raw_entities = payload.get("entities") or payload.get("entity") or []
    if isinstance(raw_entities, str):
        if raw_entities.strip().lower() == "all":
            return sorted(allowed)
        raw_entities = [item.strip() for item in raw_entities.split(",") if item.strip()]
    if not raw_entities:
        return [] if allow_empty else sorted(allowed)
    if not isinstance(raw_entities, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="entities must be a list, comma-separated string, or 'all'")
    entities = [str(item).strip() for item in raw_entities if str(item).strip()]
    invalid = [entity for entity in entities if entity not in allowed]
    if invalid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unsupported or excluded module snapshot entities: {', '.join(invalid)}")
    return entities


def _snapshot_payload_limit(payload: dict[str, Any]) -> int:
    raw_limit = payload.get("limit_per_entity") or payload.get("limit") or MODULE_SNAPSHOT_DEFAULT_LIMIT
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Module snapshot limit must be an integer") from exc
    return min(max(limit, 1), MODULE_SNAPSHOT_MAX_LIMIT)


def _capture_module_row_as_design_record(session: SessionDep, user: User, asset_type: DesignAssetType, entity: str, row: Any, mode: str) -> dict[str, Any]:
    row_json = model_to_dict(row)
    record_key = _module_snapshot_record_key(entity, row_json)
    record_payload = {
        "asset_type_slug": asset_type.slug,
        "record_key": record_key,
        "display_label": _module_snapshot_display_label(entity, row_json),
        "geometry": None,
        "properties": {
            "source_entity": entity,
            "source_record_id": str(row_json.get("id") or ""),
            "source_label": _module_snapshot_source_label(entity, row_json),
            "record_json": row_json,
            "snapshot_status": "captured",
            "dependency_notes": "Captured from canonical backend module row for Design Mode rebuild/replay.",
        },
        "status": "as_built" if str(row_json.get("status") or "").lower() in {"active", "as_built"} else "planned",
        "source": "module_snapshot",
        "visibility": "synthetic-demo",
        "notes": f"Full-fidelity Design Mode snapshot of backend entity {entity}.",
    }
    existing = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == record_key)).first()
    if existing:
        if mode == "skip_existing":
            return {"action": "skipped", "record_id": existing.id, "record_key": existing.record_key, "entity": entity}
        before = _record_dump(existing, asset_type)
        data = _normalize_record_payload(record_payload, asset_type, existing=existing)
        for key, value in data.items():
            setattr(existing, key, value)
        existing.asset_type_id = asset_type.id
        existing.version += 1
        existing.updated_at = _utc_now()
        existing.updated_by = user.id
        session.add(existing)
        session.flush()
        after = _record_dump(existing, asset_type)
        _add_event(session, "module_snapshot_record_updated", user, asset_type=asset_type, record=existing, before=before, after=after)
        return {"action": "updated", "record_id": existing.id, "record_key": existing.record_key, "entity": entity}

    data = _normalize_record_payload(record_payload, asset_type)
    record = DesignAssetRecord(**data, asset_type_id=asset_type.id, created_by=user.id, updated_by=user.id)
    session.add(record)
    session.flush()
    _add_event(session, "module_snapshot_record_created", user, asset_type=asset_type, record=record, after=_record_dump(record, asset_type))
    return {"action": "created", "record_id": record.id, "record_key": record.record_key, "entity": entity}


def _materialize_module_snapshot_record(session: SessionDep, user: User, record: DesignAssetRecord, asset_type: DesignAssetType, mode: str, preserve_ids: bool, normalize_user_refs: bool) -> dict[str, Any]:
    properties = record.properties_json or {}
    entity = str(properties.get("source_entity") or "").strip()
    if entity not in _snapshot_allowed_entities():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Snapshot record references unsupported entity: {entity}")
    raw_payload = properties.get("record_json")
    if not isinstance(raw_payload, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Snapshot record_json must be an object")
    model = MODEL_REGISTRY[entity]
    model_fields = set(model.model_fields.keys())  # type: ignore[attr-defined]
    payload = {key: value for key, value in raw_payload.items() if key in model_fields}
    if not preserve_ids:
        payload.pop("id", None)
    if normalize_user_refs:
        for key in list(payload.keys()):
            if key in {"created_by", "updated_by"}:
                payload[key] = user.id
            elif key.endswith("_user_id"):
                payload[key] = None

    existing = None
    if preserve_ids and payload.get("id") is not None and "id" in model_fields:
        try:
            existing = session.get(model, int(payload["id"]))
        except (TypeError, ValueError):
            existing = None
    if existing is not None:
        if mode == "skip_existing":
            return _module_snapshot_materialization_result(record, entity, getattr(existing, "id", None), "skipped", payload, reason="Backend row already exists")
        before = model_to_dict(existing)
        for key, value in payload.items():
            if key != "id" and hasattr(existing, key):
                setattr(existing, key, value)
        if hasattr(existing, "updated_by"):
            setattr(existing, "updated_by", user.id)
        session.add(existing)
        session.flush()
        result = _module_snapshot_materialization_result(record, entity, getattr(existing, "id", None), "updated", payload)
        _mark_snapshot_record_replayed(session, user, record, asset_type, result, before=before)
        return result

    try:
        obj = model.model_validate(payload) if hasattr(model, "model_validate") else model(**payload)  # type: ignore[attr-defined]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Snapshot materialization payload failed validation for {entity}: {exc}") from exc
    if hasattr(obj, "created_by"):
        setattr(obj, "created_by", user.id)
    if hasattr(obj, "updated_by"):
        setattr(obj, "updated_by", user.id)
    session.add(obj)
    session.flush()
    result = _module_snapshot_materialization_result(record, entity, getattr(obj, "id", None), "created", payload)
    _mark_snapshot_record_replayed(session, user, record, asset_type, result)
    return result


def _module_snapshot_record_key(entity: str, row_json: dict[str, Any]) -> str:
    row_id = row_json.get("id")
    if row_id is not None:
        return f"module-snapshot:{entity}:{row_id}"
    return f"module-snapshot:{entity}:{uuid4().hex[:10]}"


def _module_snapshot_source_label(entity: str, row_json: dict[str, Any]) -> str:
    for key in [
        "name",
        "display_label",
        "device_name",
        "circuit_id",
        "cable_id",
        "assignment_id",
        "closure_id",
        "panel_id",
        "line_name",
        "substation_code",
        "work_order_number",
        "node_name",
        "provider_name",
        "report_name",
    ]:
        value = row_json.get(key)
        if not _is_empty(value):
            return str(value)
    row_id = row_json.get("id")
    return f"{entity} #{row_id}" if row_id is not None else entity


def _module_snapshot_display_label(entity: str, row_json: dict[str, Any]) -> str:
    return f"{entity}: {_module_snapshot_source_label(entity, row_json)}"


def _module_snapshot_materialization_result(record: DesignAssetRecord, entity: str, entity_id: Any, action: str, payload: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    result = {
        "record_id": record.id,
        "record_key": record.record_key,
        "entity": entity,
        "entity_id": entity_id,
        "action": action,
        "payload_field_count": len(payload),
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }
    if reason:
        result["reason"] = reason
    return result


def _mark_snapshot_record_replayed(session: SessionDep, user: User, record: DesignAssetRecord, asset_type: DesignAssetType, result: dict[str, Any], before: dict[str, Any] | None = None) -> None:
    properties = dict(record.properties_json or {})
    properties["snapshot_status"] = "replayed"
    record.properties_json = properties
    record.updated_at = _utc_now()
    record.updated_by = user.id
    session.add(record)
    _add_event(session, "module_snapshot_record_materialized", user, asset_type=asset_type, record=record, before=before, after=result)


def _build_blueprint(asset_types: list[DesignAssetType], records: list[DesignAssetRecord], type_map: dict[int, DesignAssetType]) -> dict[str, Any]:
    return {
        "blueprint_version": BLUEPRINT_VERSION,
        "exported_at": _utc_now().isoformat(),
        "synthetic_data_notice": BLUEPRINT_NOTICE,
        "asset_types": [_asset_type_dump(asset_type) for asset_type in asset_types],
        "records": [_record_dump(record, type_map.get(record.asset_type_id)) for record in records],
    }


def _module_blueprint_summary(blueprint: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": blueprint["key"],
        "display_name": blueprint["display_name"],
        "description": blueprint["description"],
        "synthetic_data_notice": blueprint.get("synthetic_data_notice") or BLUEPRINT_NOTICE,
        "asset_type_count": len(blueprint.get("asset_types") or []),
        "record_count": len(blueprint.get("records") or []),
        "asset_types": blueprint.get("asset_types") or [],
    }


def _agent_tool_summary(tool: dict[str, Any]) -> dict[str, Any]:
    supports_materialize = bool(tool.get("supports_materialize", bool(tool.get("backend_entity"))))
    return {
        "tool_key": tool["tool_key"],
        "label": tool["label"],
        "description": tool["description"],
        "asset_type_slug": tool["asset_type_slug"],
        "backend_entity": tool.get("backend_entity"),
        "geometry_type": tool["geometry_type"],
        "required_properties": tool["required_properties"],
        "example_properties": tool["example_properties"],
        "example_geometry": tool["example_geometry"],
        "endpoint": f"/api/design-assets/agent-tools/{tool['tool_key']}/run",
        "method": "POST",
        "supports_materialize": supports_materialize,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


def _ensure_core_blueprint_schemas(session: SessionDep, user: User) -> None:
    missing = [
        spec["slug"]
        for spec in CORE_MODULE_BLUEPRINT["asset_types"]
        if session.exec(select(DesignAssetType).where(DesignAssetType.slug == spec["slug"])).first() is None
    ]
    if missing:
        _install_blueprint(session, user, CORE_MODULE_BLUEPRINT, source_label="agent_tool_auto_install_core_blueprint")


def _agent_record_key(tool: dict[str, Any], properties: dict[str, Any]) -> str:
    for field in tool["required_properties"]:
        value = properties.get(field)
        if not _is_empty(value):
            return str(value)
    return f"{tool['asset_type_slug']}-{uuid4().hex[:10]}"


def _agent_display_label(tool: dict[str, Any], properties: dict[str, Any]) -> str:
    for field in ["circuit_name", "assignment_name", "name", "title", *tool["required_properties"]]:
        value = properties.get(field)
        if not _is_empty(value):
            return str(value)
    return f"{tool['label']} planning object"


def _agent_record_status(payload: dict[str, Any], properties: dict[str, Any]) -> str:
    candidate = str(payload.get("record_status") or payload.get("recordStatus") or payload.get("status") or properties.get("record_status") or properties.get("workflow_status") or properties.get("status") or "planned").strip().lower()
    return candidate if candidate in RECORD_STATUSES else "planned"


def _install_blueprint(session: SessionDep, user: User, payload: dict[str, Any], source_label: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Blueprint payload must be a JSON object")
    mode = str(payload.get("mode") or "upsert").strip().lower()
    if mode not in {"upsert", "skip_existing"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Blueprint import mode must be upsert or skip_existing")
    raw_asset_types = payload.get("asset_types") or payload.get("assetTypes") or []
    raw_records = payload.get("records") or []
    if not isinstance(raw_asset_types, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="asset_types must be a list")
    if not isinstance(raw_records, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="records must be a list")

    installed_slugs: list[str] = []
    created_types = 0
    updated_types = 0
    skipped_types = 0
    created_records = 0
    updated_records = 0
    skipped_records = 0

    for raw_type in raw_asset_types:
        if not isinstance(raw_type, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each blueprint asset type must be an object")
        data = _normalize_asset_type_payload(raw_type)
        existing = session.exec(select(DesignAssetType).where(DesignAssetType.slug == data["slug"])).first()
        if existing:
            installed_slugs.append(existing.slug)
            if mode == "skip_existing":
                skipped_types += 1
                continue
            before = _asset_type_dump(existing)
            for key, value in data.items():
                setattr(existing, key, value)
            existing.version += 1
            existing.updated_at = _utc_now()
            existing.updated_by = user.id
            session.add(existing)
            session.flush()
            _add_event(session, "asset_type_blueprint_updated", user, asset_type=existing, before=before, after=_asset_type_dump(existing))
            updated_types += 1
            continue
        obj = DesignAssetType(**data, created_by=user.id, updated_by=user.id)
        session.add(obj)
        session.flush()
        installed_slugs.append(obj.slug)
        _add_event(session, "asset_type_blueprint_created", user, asset_type=obj, after=_asset_type_dump(obj))
        created_types += 1

    for raw_record in raw_records:
        if not isinstance(raw_record, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each blueprint record must be an object")
        asset_type = _resolve_asset_type(session, raw_record)
        existing_record = session.exec(select(DesignAssetRecord).where(DesignAssetRecord.record_key == str(raw_record.get("record_key") or raw_record.get("recordKey") or ""))).first()
        if existing_record:
            if mode == "skip_existing":
                skipped_records += 1
                continue
            before = _record_dump(existing_record, asset_type)
            data = _normalize_record_payload(raw_record, asset_type, existing=existing_record)
            for key, value in data.items():
                setattr(existing_record, key, value)
            existing_record.asset_type_id = asset_type.id
            existing_record.version += 1
            existing_record.updated_at = _utc_now()
            existing_record.updated_by = user.id
            session.add(existing_record)
            session.flush()
            _add_event(session, "record_blueprint_updated", user, asset_type=asset_type, record=existing_record, before=before, after=_record_dump(existing_record, asset_type))
            updated_records += 1
            continue
        data = _normalize_record_payload(raw_record, asset_type)
        obj = DesignAssetRecord(**data, asset_type_id=asset_type.id, created_by=user.id, updated_by=user.id)
        session.add(obj)
        session.flush()
        _add_event(session, "record_blueprint_created", user, asset_type=asset_type, record=obj, after=_record_dump(obj, asset_type))
        created_records += 1

    return {
        "blueprint_version": payload.get("blueprint_version") or payload.get("blueprintVersion") or BLUEPRINT_VERSION,
        "source_label": source_label,
        "mode": mode,
        "installed_asset_type_slugs": installed_slugs,
        "created_asset_types": created_types,
        "updated_asset_types": updated_types,
        "skipped_asset_types": skipped_types,
        "created_records": created_records,
        "updated_records": updated_records,
        "skipped_records": skipped_records,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }


def _materialize_design_record(session: SessionDep, user: User, record: DesignAssetRecord, asset_type: DesignAssetType, mode: str = "upsert") -> dict[str, Any]:
    mode = mode.strip().lower()
    if mode not in {"upsert", "skip_existing"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Materialization mode must be upsert or skip_existing")
    rules = _materialization_rules(asset_type)
    if not rules:
        return {
            "record_id": record.id,
            "record_key": record.record_key,
            "asset_type_slug": asset_type.slug,
            "action": "skipped",
            "reason": "No backend materialization rules are defined for this Design Mode object type.",
        }
    entity = str(rules.get("entity") or "").strip()
    model = MODEL_REGISTRY.get(entity)
    if model is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unsupported backend materialization entity: {entity}")
    payload = _materialization_payload(record, asset_type, rules, model)
    unique_field = str(rules.get("unique_field") or "").strip()
    if unique_field and unique_field not in model.model_fields:  # type: ignore[attr-defined]
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown materialization unique field: {unique_field}")
    unique_value = payload.get(unique_field) if unique_field else None
    if unique_field and _is_empty(unique_value):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Materialization requires {unique_field}")

    existing = None
    if unique_field:
        existing = session.exec(select(model).where(getattr(model, unique_field) == unique_value)).first()
    if existing is not None:
        entity_id = getattr(existing, "id", None)
        if mode == "skip_existing":
            result = _materialization_result(record, asset_type, entity, entity_id, "skipped", payload, reason="Backend record already exists")
            _add_event(session, "record_materialization_skipped", user, asset_type=asset_type, record=record, after=result)
            return result
        before = model_to_dict(existing)
        for key, value in payload.items():
            if key != "id" and hasattr(existing, key):
                setattr(existing, key, value)
        if hasattr(existing, "updated_by"):
            setattr(existing, "updated_by", user.id)
        session.add(existing)
        session.flush()
        result = _materialization_result(record, asset_type, entity, getattr(existing, "id", None), "updated", payload)
        _add_event(session, "record_materialized_updated_backend", user, asset_type=asset_type, record=record, before=before, after={**result, "backend_record": model_to_dict(existing)})
        return result

    try:
        obj = model.model_validate(payload) if hasattr(model, "model_validate") else model(**payload)  # type: ignore[attr-defined]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Materialization payload failed validation: {exc}") from exc
    if hasattr(obj, "created_by"):
        setattr(obj, "created_by", user.id)
    if hasattr(obj, "updated_by"):
        setattr(obj, "updated_by", user.id)
    session.add(obj)
    session.flush()
    result = _materialization_result(record, asset_type, entity, getattr(obj, "id", None), "created", payload)
    _add_event(session, "record_materialized_created_backend", user, asset_type=asset_type, record=record, after={**result, "backend_record": model_to_dict(obj)})
    return result


def _materialization_rules(asset_type: DesignAssetType) -> dict[str, Any]:
    rules = asset_type.validation_rules_json or {}
    materialization = rules.get("backend_materialization") if isinstance(rules, dict) else None
    return materialization if isinstance(materialization, dict) else {}


def _materialization_payload(record: DesignAssetRecord, asset_type: DesignAssetType, rules: dict[str, Any], model: Any) -> dict[str, Any]:
    field_map = rules.get("field_map") or {}
    if not isinstance(field_map, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="backend_materialization.field_map must be an object")
    context = {
        "record": {
            "id": record.id,
            "record_key": record.record_key,
            "display_label": record.display_label,
            "status": record.status,
            "source": record.source,
            "visibility": record.visibility,
            "notes": record.notes,
        },
        "asset_type": {
            "slug": asset_type.slug,
            "display_name": asset_type.display_name,
            "geometry_type": asset_type.geometry_type,
        },
        "properties": record.properties_json or {},
        "geometry": record.geometry_json or {},
    }
    payload: dict[str, Any] = {}
    model_fields = set(model.model_fields.keys())  # type: ignore[attr-defined]
    module_payload = (record.properties_json or {}).get("module_payload")
    if isinstance(module_payload, dict) and rules.get("include_module_payload_fields", True):
        for key, value in module_payload.items():
            if key in model_fields and key not in {"id", "created_at", "updated_at"}:
                payload[key] = value
    for target_field, source in field_map.items():
        target = str(target_field)
        if target not in model_fields or target in {"id", "created_at", "updated_at"}:
            continue
        value = _resolve_materialization_source(source, context)
        if value is not None:
            payload[target] = value
    return payload


def _resolve_materialization_source(source: Any, context: dict[str, Any]) -> Any:
    if isinstance(source, dict):
        if "value" in source:
            return source["value"]
        if "path" in source:
            return _path_value(context, str(source["path"]))
        if "coalesce" in source and isinstance(source["coalesce"], list):
            for item in source["coalesce"]:
                value = _resolve_materialization_source(item, context)
                if not _is_empty(value):
                    return value
            return None
    if isinstance(source, str):
        return _path_value(context, source)
    return source


def _path_value(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
            continue
        if isinstance(current, list) and part.isdigit():
            index = int(part)
            current = current[index] if index < len(current) else None
            continue
        return None
    return current


def _materialization_result(record: DesignAssetRecord, asset_type: DesignAssetType, entity: str, entity_id: Any, action: str, payload: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    result = {
        "record_id": record.id,
        "record_key": record.record_key,
        "asset_type_slug": asset_type.slug,
        "entity": entity,
        "entity_id": entity_id,
        "action": action,
        "payload": payload,
        "synthetic_data_notice": BLUEPRINT_NOTICE,
    }
    if reason:
        result["reason"] = reason
    return result


def _normalize_asset_type_payload(payload: dict[str, Any], existing: DesignAssetType | None = None) -> dict[str, Any]:
    slug = str(payload.get("slug") or existing.slug if existing else payload.get("slug") or "").strip().lower()
    if not SLUG_PATTERN.match(slug):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Slug must start with a letter and contain only lowercase letters, numbers, and hyphens")
    display_name = str(payload.get("display_name") or payload.get("displayName") or slug.replace("-", " ").title()).strip()
    geometry_type = str(payload.get("geometry_type") or payload.get("geometryType") or existing.geometry_type if existing else payload.get("geometry_type") or "").strip().lower()
    if geometry_type not in GEOMETRY_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"geometry_type must be one of {sorted(GEOMETRY_TYPES)}")
    fields = _normalize_fields(payload.get("fields") or payload.get("fields_json") or [])
    searchable_fields = _normalize_searchable_fields(payload.get("searchable_fields") or payload.get("searchableFields") or payload.get("searchable_fields_json") or [], fields)
    status_value = str(payload.get("status") or "active").strip().lower()
    if status_value not in ASSET_TYPE_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Asset type status must be active or archived")
    return {
        "slug": slug,
        "display_name": display_name,
        "description": payload.get("description"),
        "geometry_type": geometry_type,
        "fields_json": fields,
        "searchable_fields_json": searchable_fields,
        "validation_rules_json": _dict_value(payload.get("validation_rules") or payload.get("validationRules") or payload.get("validation_rules_json") or {}),
        "map_style_json": _dict_value(payload.get("map_style") or payload.get("mapStyle") or payload.get("map_style_json") or {}),
        "status": status_value,
        "notes": payload.get("notes"),
    }


def _normalize_fields(fields: Any) -> list[dict[str, Any]]:
    if not isinstance(fields, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="fields must be a list")
    normalized = []
    seen: set[str] = set()
    for raw_field in fields:
        if not isinstance(raw_field, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each field must be an object")
        name = str(raw_field.get("name") or "").strip()
        if not FIELD_NAME_PATTERN.match(name):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid field name: {name}")
        if name in seen:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Duplicate field name: {name}")
        seen.add(name)
        field_type = str(raw_field.get("type") or "string").strip().lower()
        if field_type not in FIELD_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid field type for {name}")
        enum_options = raw_field.get("enum_options") or raw_field.get("enumOptions") or raw_field.get("options") or []
        if field_type == "enum" and (not isinstance(enum_options, list) or not enum_options):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Enum field {name} requires options")
        normalized.append(
            {
                "name": name,
                "label": str(raw_field.get("label") or name.replace("_", " ").title()),
                "type": field_type,
                "required": bool(raw_field.get("required", False)),
                "default": raw_field.get("default"),
                "enum_options": [str(option) for option in enum_options],
                "validation_rules": _dict_value(raw_field.get("validation_rules") or raw_field.get("validationRules") or {}),
                "help_text": raw_field.get("help_text") or raw_field.get("helpText"),
            }
        )
    return normalized


def _normalize_searchable_fields(values: Any, fields: list[dict[str, Any]]) -> list[str]:
    field_names = {field["name"] for field in fields}
    if not values:
        return [field["name"] for field in fields if field["type"] in {"string", "textarea", "enum"}][:5]
    if not isinstance(values, list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="searchable_fields must be a list")
    invalid = [str(value) for value in values if str(value) not in field_names]
    if invalid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown searchable fields: {', '.join(invalid)}")
    return [str(value) for value in values]


def _normalize_record_payload(payload: dict[str, Any], asset_type: DesignAssetType, existing: DesignAssetRecord | None = None) -> dict[str, Any]:
    record_key = str(payload.get("record_key") or payload.get("recordKey") or existing.record_key if existing else payload.get("record_key") or f"{asset_type.slug}-{uuid4().hex[:10]}").strip()
    display_label = str(payload.get("display_label") or payload.get("displayLabel") or payload.get("label") or record_key).strip()
    status_value = str(payload.get("status") or (existing.status if existing else "proposed")).strip().lower()
    if status_value not in RECORD_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Record status must be one of {sorted(RECORD_STATUSES)}")
    raw_properties = payload.get("properties") or payload.get("properties_json") or {}
    properties = _validate_properties(_dict_value(raw_properties), asset_type.fields_json or [])
    geometry = _validate_geometry(payload.get("geometry") if "geometry" in payload else payload.get("geometry_json"), asset_type.geometry_type)
    return {
        "record_key": record_key,
        "display_label": display_label,
        "geometry_type": asset_type.geometry_type,
        "geometry_json": geometry,
        "properties_json": properties,
        "status": status_value,
        "source": str(payload.get("source") or (existing.source if existing else "synthetic_demo")),
        "visibility": str(payload.get("visibility") or (existing.visibility if existing else "team")),
        "notes": payload.get("notes"),
    }


def _validate_properties(properties: dict[str, Any], fields: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = dict(properties)
    for field in fields:
        name = field["name"]
        if name not in normalized and field.get("default") is not None:
            normalized[name] = field.get("default")
        value = normalized.get(name)
        if field.get("required") and _is_empty(value):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Missing required field: {name}")
        if _is_empty(value):
            continue
        normalized[name] = _validate_field_value(name, value, field)
    return normalized


def _validate_field_value(name: str, value: Any, field: dict[str, Any]) -> Any:
    field_type = field["type"]
    if field_type in {"string", "textarea", "date"}:
        value = str(value)
    elif field_type == "integer":
        if isinstance(value, bool):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be an integer")
        try:
            value = int(value)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be an integer") from error
    elif field_type == "number":
        if isinstance(value, bool):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be a number")
        try:
            value = float(value)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be a number") from error
    elif field_type == "boolean":
        if not isinstance(value, bool):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be true or false")
    elif field_type == "enum":
        value = str(value)
        if value not in set(field.get("enum_options") or []):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be one of {field.get('enum_options')}")
    elif field_type == "json" and not isinstance(value, (dict, list)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} must be JSON object or array")
    return _apply_validation_rules(name, value, field.get("validation_rules") or {})


def _apply_validation_rules(name: str, value: Any, rules: dict[str, Any]) -> Any:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "min" in rules and value < float(rules["min"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is below minimum")
        if "max" in rules and value > float(rules["max"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is above maximum")
    if isinstance(value, str):
        if "min_length" in rules and len(value) < int(rules["min_length"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is shorter than minimum length")
        if "max_length" in rules and len(value) > int(rules["max_length"]):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} is longer than maximum length")
        if rules.get("pattern") and not re.search(str(rules["pattern"]), value):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{name} does not match required pattern")
    return value


def _validate_geometry(geometry: Any, geometry_type: str) -> dict[str, Any] | None:
    if geometry_type == "table_only":
        return None
    if not isinstance(geometry, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="GeoJSON geometry is required")
    geojson_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "point":
        if geojson_type != "Point" or not _coordinate(coordinates):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Point asset records require GeoJSON Point geometry")
    elif geometry_type == "line":
        if geojson_type == "LineString":
            if not isinstance(coordinates, list) or len(coordinates) < 2 or any(not _coordinate(item) for item in coordinates):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line asset records require at least two coordinates")
        elif geojson_type == "MultiLineString":
            if not isinstance(coordinates, list) or any(not isinstance(line, list) or len(line) < 2 or any(not _coordinate(item) for item in line) for line in coordinates):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line asset records require valid MultiLineString coordinates")
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line asset records require LineString or MultiLineString geometry")
    elif geometry_type == "polygon":
        if geojson_type == "Polygon":
            _validate_polygon_coordinates(coordinates)
        elif geojson_type == "MultiPolygon":
            if not isinstance(coordinates, list) or any(_validate_polygon_coordinates(polygon, raise_errors=False) is False for polygon in coordinates):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Polygon asset records require valid MultiPolygon coordinates")
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Polygon asset records require Polygon or MultiPolygon geometry")
    return deepcopy(geometry)


def _validate_polygon_coordinates(coordinates: Any, raise_errors: bool = True) -> bool:
    valid = isinstance(coordinates, list) and bool(coordinates)
    if valid:
        for ring in coordinates:
            if not isinstance(ring, list) or len(ring) < 4 or any(not _coordinate(item) for item in ring) or ring[0] != ring[-1]:
                valid = False
                break
    if not valid and raise_errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Polygon rings must be closed and contain at least four coordinates")
    return valid


def _coordinate(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value[:2])


def _resolve_asset_type(session: SessionDep, payload: dict[str, Any]) -> DesignAssetType:
    if payload.get("asset_type_id") is not None:
        asset_type = session.get(DesignAssetType, int(payload["asset_type_id"]))
        if asset_type:
            return asset_type
    slug = payload.get("asset_type_slug") or payload.get("assetTypeSlug") or payload.get("asset_type")
    if slug:
        return _get_asset_type_by_slug(session, str(slug))
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="asset_type_slug or asset_type_id is required")


def _get_asset_type_by_slug(session: SessionDep, slug: str) -> DesignAssetType:
    obj = session.exec(select(DesignAssetType).where(DesignAssetType.slug == slug)).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design asset type not found")
    return obj


def _asset_type_map(session: SessionDep, records: list[DesignAssetRecord], known_asset_type: DesignAssetType | None = None) -> dict[int, DesignAssetType]:
    if known_asset_type and known_asset_type.id is not None:
        return {known_asset_type.id: known_asset_type}
    ids = sorted({record.asset_type_id for record in records})
    if not ids:
        return {}
    return {row.id: row for row in session.exec(select(DesignAssetType).where(DesignAssetType.id.in_(ids))).all() if row.id is not None}


def _asset_type_dump(obj: DesignAssetType) -> dict[str, Any]:
    data = model_to_dict(obj)
    data["fields"] = data.get("fields_json") or []
    data["searchable_fields"] = data.get("searchable_fields_json") or []
    data["validation_rules"] = data.get("validation_rules_json") or {}
    data["map_style"] = data.get("map_style_json") or {}
    return data


def _record_dump(record: DesignAssetRecord, asset_type: DesignAssetType | None) -> dict[str, Any]:
    data = model_to_dict(record)
    data["asset_type_slug"] = asset_type.slug if asset_type else None
    data["asset_type_display_name"] = asset_type.display_name if asset_type else None
    data["map_style"] = asset_type.map_style_json if asset_type else {}
    data["properties"] = data.get("properties_json") or {}
    data["geometry"] = data.get("geometry_json")
    return data


def _record_feature(record: DesignAssetRecord, asset_type: DesignAssetType) -> dict[str, Any] | None:
    if not record.geometry_json:
        return None
    return {
        "type": "Feature",
        "properties": {
            "kind": "design_asset_record",
            "id": str(record.id),
            "recordKey": record.record_key,
            "label": record.display_label,
            "status": record.status,
            "assetTypeSlug": asset_type.slug,
            "assetTypeName": asset_type.display_name,
            "geometryType": asset_type.geometry_type,
            "source": record.source,
            "synthetic": record.source == "synthetic_demo",
            "warning": "Editable planning asset. Demo/planning data only; do not enter CEII, SCADA, relay/protection, outage, private telecom, or private fiber-route data.",
        },
        "geometry": record.geometry_json,
    }


def _add_event(
    session: SessionDep,
    event_type: str,
    user: User | None,
    asset_type: DesignAssetType | None = None,
    record: DesignAssetRecord | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    session.add(
        DesignAssetEvent(
            asset_type_id=asset_type.id if asset_type else None,
            asset_record_id=record.id if record else None,
            event_type=event_type,
            actor_user_id=user.id if user else None,
            before_json=before,
            after_json=after,
        )
    )


def _dict_value(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Expected a JSON object")


def _is_empty(value: Any) -> bool:
    return value is None or value == ""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
