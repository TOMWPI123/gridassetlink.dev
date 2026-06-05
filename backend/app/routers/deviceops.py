from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep, require_roles
from app.integrations import operational_network_api as operational_api
from app.models import (
    Attachment,
    Circuit,
    CommissioningChecklist,
    CommissioningChecklistItem,
    Device,
    DevicePort,
    FiberAssignment,
    FiberStrand,
    IconEngineeringProfile,
    IconModule,
    IconNode,
    IconProposedService,
    IconServiceTemplate,
    OperationalCircuitState,
    OperationalDeviceState,
    OperationalPortState,
    OperationalSnapshot,
    ProposedChange,
    ProposedChangeDiff,
    RegionalSyntheticCircuit,
    Substation,
    WorkOrder,
    WorkOrderTask,
)
from app.services.audit import add_audit_log

router = APIRouter(prefix="/api", tags=["deviceops"])


@router.get("/deviceops/summary")
def deviceops_summary(session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    snapshot = _latest_snapshot(session)
    devices = session.exec(select(Device)).all()
    icon_nodes = session.exec(select(IconNode)).all()
    actual_devices = _latest_device_states(session)
    actual_ports = _latest_port_states(session)
    actual_circuits = _latest_circuit_states(session)
    proposed = session.exec(select(ProposedChange)).all()
    checklists = session.exec(select(CommissioningChecklist)).all()
    work_orders = session.exec(select(WorkOrder)).all()
    modules = session.exec(select(IconModule)).all()
    templates = session.exec(select(IconServiceTemplate)).all()
    regional_circuits = session.exec(select(RegionalSyntheticCircuit)).all()
    device_type_count = len({item.device_type for item in devices if item.device_type} | {item.get("device_type") for item in operational_api.get_devices() if item.get("device_type")})

    cards = [
        {"label": "Total managed devices", "value": len(devices)},
        {"label": "SEL ICON nodes", "value": len(icon_nodes)},
        {"label": "Devices from operational API", "value": len([item for item in actual_devices if item.match_status != "unmatched_planned_only"])},
        {"label": "Devices missing from planning database", "value": len([item for item in actual_devices if item.match_status == "unmatched_actual_only"])},
        {"label": "Devices missing from operational API", "value": len([item for item in actual_devices if item.match_status == "unmatched_planned_only"])},
        {"label": "Devices with planned/proposed changes", "value": len({item.target_entity_id for item in proposed if item.target_entity_type in {"device", "icon_node"}})},
        {"label": "ICON nodes with open alarms", "value": len([item for item in actual_devices if item.device_type == "SEL_ICON" and item.alarm_status not in {None, "normal"}])},
        {"label": "ICON nodes with timing alarms", "value": len([item for item in actual_devices if item.device_type == "SEL_ICON" and item.timing_status not in {None, "normal"}])},
        {"label": "ICON nodes with firmware mismatch", "value": len(_firmware_mismatches(session, actual_devices))},
        {"label": "ICON ports available", "value": len([item for item in actual_ports if item.port_type in {"C37.94", "DS1", "ethernet", "fiber"} and not item.assigned_circuit])},
        {"label": "ICON ports assigned", "value": len([item for item in actual_ports if item.assigned_circuit])},
        {"label": "ICON circuits active", "value": len([item for item in actual_circuits if item.operational_status in {"in_service", "active"}])},
        {"label": "ICON circuits proposed", "value": len([item for item in proposed if "icon" in item.change_type.lower() or "service" in item.change_type.lower()])},
        {"label": "Protection circuits active", "value": len([item for item in actual_circuits if item.service_type in {"87L", "DTT", "C37.94"} and item.operational_status in {"in_service", "active"}])},
        {"label": "Protection circuits proposed", "value": len([item for item in proposed if item.change_type == "protection_service_change" or (item.proposed_state_json or {}).get("service_type") in {"87L", "DTT", "C37.94"}])},
        {"label": "C37.94 services active", "value": len([item for item in actual_ports if item.port_type == "C37.94" and item.assigned_circuit])},
        {"label": "DS1 services active", "value": len([item for item in actual_circuits if item.service_type == "DS1"])},
        {"label": "Ethernet services active", "value": len([item for item in actual_circuits if "Ethernet" in (item.transport_type or "") or item.service_type in {"SCADA", "Ethernet"}])},
        {"label": "VSN services active", "value": len([item for item in operational_api.get_service_status() if item["service_type"] == "VSN"])},
        {"label": "Leased services pending migration", "value": len([item for item in proposed if item.change_type == "migrate_leased_service"])},
        {"label": "Work orders generated from proposed changes", "value": len([item for item in proposed if item.related_work_order_id])},
        {"label": "Proposed changes awaiting engineering review", "value": len([item for item in proposed if item.engineering_status == "under_engineering_review"])},
        {"label": "Proposed changes awaiting approval", "value": len([item for item in proposed if item.approval_status == "pending_approval"])},
        {"label": "Proposed changes ready for field installation", "value": len([item for item in proposed if item.engineering_status == "converted_to_work_order"])},
        {"label": "Commissioning checklists incomplete", "value": len([item for item in checklists if item.status not in {"complete", "completed", "commissioned"}])},
        {"label": "SEL ICON card modules", "value": len(modules) + sum(len(operational_api.get_icon_modules(item["id"])) for item in operational_api.get_icon_nodes())},
        {"label": "SEL ICON line cards", "value": len([item for item in modules if "line" in item.module_type.lower()]) + _operational_module_count("line")},
        {"label": "SEL ICON protection cards", "value": len([item for item in modules if "c37" in item.module_type.lower()]) + _operational_module_count("c37")},
        {"label": "SEL ICON Ethernet cards", "value": len([item for item in modules if "ethernet" in item.module_type.lower() or "vsn" in item.module_type.lower()]) + _operational_module_count("ethernet") + _operational_module_count("vsn")},
        {"label": "Device type modules", "value": device_type_count},
        {"label": "Synthetic SEL ICON circuits", "value": len(regional_circuits) + len(operational_api.get_circuits())},
        {"label": "SEL ICON provisioning templates", "value": len(templates)},
        {"label": "SEL ICON provisioning parameter sets", "value": len(_icon_parameter_categories())},
    ]
    return {
        "latest_snapshot": _dump(snapshot) if snapshot else None,
        "cards": cards,
        "recent_proposed_changes": [_dump(item) for item in proposed[-8:]],
        "recent_work_orders": [_dump(item) for item in work_orders[-8:]],
    }


@router.get("/deviceops/icon/provisioning-dashboard")
def icon_provisioning_dashboard(session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    operational_nodes = operational_api.get_icon_nodes()
    operational_modules = [
        {**module, "node_name": node["device_name"], "source": "actual_operational_api"}
        for node in operational_nodes
        for module in operational_api.get_icon_modules(node["id"])
    ]
    operational_services = [
        {**service, "source": "actual_operational_api"}
        for node in operational_nodes
        for service in operational_api.get_icon_services(node["id"])
    ]
    module_counter = Counter(item.get("module_type", "unknown") for item in operational_modules)
    device_rows = [_dump(item) for item in session.exec(select(Device)).all()] + operational_api.get_devices()
    device_counter = Counter(row.get("device_type", "unknown") for row in device_rows)
    actual_circuits = [{**item, "source": "actual_operational_api", "synthetic": True} for item in operational_api.get_circuits()]
    regional_circuits = [
        {**_dump(item), "source": "regional_synthetic_planning", "synthetic": True}
        for item in session.exec(select(RegionalSyntheticCircuit).order_by(RegionalSyntheticCircuit.circuit_id)).all()
    ]
    planned_circuits = [
        {**_dump(item), "source": "planned_database"}
        for item in session.exec(select(Circuit).where(Circuit.transport_type.like("%ICON%"))).all()
    ]
    templates = session.exec(select(IconServiceTemplate).order_by(IconServiceTemplate.template_name)).all()
    proposed_services = session.exec(select(IconProposedService).order_by(IconProposedService.service_type, IconProposedService.service_name)).all()
    parameter_cards = _icon_parameter_categories()
    service_type_cards = _service_type_cards(operational_services)
    node_service_summary = _node_service_summary(operational_nodes, operational_services)
    return {
        "cards": [
            {"label": "Operational SEL ICON nodes", "value": len(operational_nodes), "href": "/deviceops/icon"},
            {"label": "SEL ICON card modules", "value": len(operational_modules), "href": "/deviceops/icon/provisioning"},
            {"label": "Device type modules", "value": len(device_counter), "href": "/deviceops/devices"},
            {"label": "Operational ICON services", "value": len({item["id"] for item in operational_services}), "href": "/deviceops/icon/provisioning"},
            {"label": "Service classes carried", "value": len(service_type_cards), "href": "/deviceops/icon/provisioning"},
            {"label": "Endpoint devices carried", "value": sum(int(item.get("carried_device_count") or 0) for item in node_service_summary), "href": "/deviceops/devices"},
            {"label": "Synthetic regional circuits", "value": len(regional_circuits), "href": "/regional-grid/sel-icon-synthetic-network"},
            {"label": "Planned ICON circuits", "value": len(planned_circuits), "href": "/circuits"},
            {"label": "Proposed ICON services", "value": len(proposed_services), "href": "/deviceops/change-requests"},
            {"label": "Provisioning parameter categories", "value": len(parameter_cards), "href": "/deviceops/service-templates"},
        ],
        "module_cards": [
            {
                "module_type": module_type,
                "label": _module_label(module_type),
                "value": count,
                "detail": _module_detail_text(module_type),
                "manual_reference": "SEL manual/application guide section placeholder",
                "engineering_standard_reference": "TelecomNE ICON module standard placeholder",
            }
            for module_type, count in sorted(module_counter.items())
        ],
        "device_type_cards": [
            {
                "device_type": device_type,
                "label": _device_type_label(device_type),
                "value": count,
                "examples": [row.get("device_name") for row in device_rows if row.get("device_type") == device_type][:8],
                "href": "/deviceops/devices",
            }
            for device_type, count in sorted(device_counter.items())
        ],
        "service_type_cards": service_type_cards,
        "node_service_summary": node_service_summary,
        "provisioning_parameter_cards": parameter_cards,
        "nodes": operational_nodes,
        "modules": operational_modules,
        "services": _unique_by(operational_services, "id"),
        "circuits": actual_circuits + planned_circuits + regional_circuits,
        "templates": [_dump(item) for item in templates],
        "proposed_services": [_dump(item) for item in proposed_services],
        "safety_note": "All demo provisioning values are fictional placeholders. The operational adapter remains read-only and no SEL manual text is copied.",
    }


@router.post("/operational/refresh", dependencies=[Depends(require_roles("admin", "engineer"))])
def refresh_operational_state(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    devices = operational_api.get_devices()
    circuits = operational_api.get_circuits()
    alarms = operational_api.get_alarms()
    snapshot = OperationalSnapshot(
        snapshot_time=_parse_dt(getattr(operational_api, "SNAPSHOT_TIME", None)) or datetime.now(timezone.utc),
        source_system=getattr(operational_api, "SOURCE_SYSTEM", "operational_network_api"),
        api_version=getattr(operational_api, "API_VERSION", None),
        status="complete",
        device_count=len(devices),
        circuit_count=len(circuits),
        alarm_count=len(alarms),
        raw_summary_json={
            "read_only": True,
            "adapter": "backend/app/integrations/operational_network_api.py",
            "topology": operational_api.get_topology(),
        },
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)

    planned_devices = {item.device_name: item for item in session.exec(select(Device)).all()}
    actual_device_names: set[str] = set()
    for item in devices:
        actual_device_names.add(item["device_name"])
        planned = planned_devices.get(item["device_name"])
        session.add(
            OperationalDeviceState(
                snapshot_id=snapshot.id,
                external_device_id=item["id"],
                device_name=item["device_name"],
                device_type=item.get("device_type"),
                manufacturer=item.get("manufacturer"),
                model=item.get("model"),
                serial_number=item.get("serial_number"),
                firmware_version=item.get("firmware_version"),
                management_ip=item.get("management_ip"),
                substation_code=item.get("substation_code"),
                rack_name=item.get("rack_name"),
                operational_status=item.get("operational_status"),
                alarm_status=item.get("alarm_status"),
                timing_status=item.get("timing_status"),
                last_seen=_parse_dt(item.get("last_seen")),
                raw_payload_json=item,
                matched_device_id=planned.id if planned else None,
                match_status=_device_match_status(planned, item),
            )
        )
        _add_port_states(session, snapshot, item, planned)

    for planned_name, planned in planned_devices.items():
        if planned_name not in actual_device_names:
            session.add(
                OperationalDeviceState(
                    snapshot_id=snapshot.id,
                    external_device_id=f"planned:{planned.id}",
                    device_name=planned.device_name,
                    device_type=planned.device_type,
                    manufacturer=planned.manufacturer,
                    model=planned.model,
                    firmware_version=planned.firmware_version,
                    management_ip=planned.ip_address,
                    operational_status="missing_from_api",
                    alarm_status="unknown",
                    timing_status="unknown",
                    raw_payload_json={"planned_device_id": planned.id, "source": "planning_database"},
                    matched_device_id=planned.id,
                    match_status="unmatched_planned_only",
                )
            )

    planned_circuits = {item.circuit_id: item for item in session.exec(select(Circuit)).all()}
    actual_circuit_ids: set[str] = set()
    for item in circuits:
        actual_circuit_ids.add(item["circuit_id"])
        planned = planned_circuits.get(item["circuit_id"])
        session.add(
            OperationalCircuitState(
                snapshot_id=snapshot.id,
                external_circuit_id=item["circuit_id"],
                circuit_name=item.get("circuit_name") or item["circuit_id"],
                service_type=item.get("service_type"),
                transport_type=item.get("transport_type"),
                a_end_device=item.get("a_end_device"),
                z_end_device=item.get("z_end_device"),
                a_end_port=item.get("a_end_port"),
                z_end_port=item.get("z_end_port"),
                operational_status=item.get("operational_status"),
                measured_latency_ms=item.get("measured_latency_ms"),
                alarm_status=item.get("alarm_status"),
                raw_payload_json=item,
                matched_circuit_id=planned.id if planned else None,
                match_status=_circuit_match_status(planned, item),
            )
        )
    for circuit_id, planned in planned_circuits.items():
        if circuit_id not in actual_circuit_ids:
            session.add(
                OperationalCircuitState(
                    snapshot_id=snapshot.id,
                    external_circuit_id=f"planned:{planned.id}",
                    circuit_name=planned.circuit_name,
                    service_type=planned.service_type,
                    transport_type=planned.transport_type,
                    operational_status="missing_from_api",
                    raw_payload_json={"planned_circuit_id": planned.id, "source": "planning_database"},
                    matched_circuit_id=planned.id,
                    match_status="unmatched_planned_only",
                )
            )
    add_audit_log(session, user, "refresh", "operational_snapshot", snapshot.id, new_value=snapshot)
    session.commit()
    return {
        "snapshot": _dump(snapshot),
        "device_count": len(devices),
        "circuit_count": len(circuits),
        "alarm_count": len(alarms),
        "read_only": True,
    }


@router.get("/operational/snapshots")
def operational_snapshots(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [_dump(item) for item in session.exec(select(OperationalSnapshot).order_by(OperationalSnapshot.snapshot_time.desc())).all()]


@router.get("/operational/devices")
def operational_devices(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [_device_with_source(row, session) for row in _latest_device_states(session)]


@router.get("/operational/devices/{device_id}")
def operational_device(device_id: str, session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    row = _operational_device_by_id(session, device_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operational device not found")
    return _device_dashboard_payload(row, session)


@router.get("/operational/icon")
def operational_icon(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    rows = [row for row in _latest_device_states(session) if row.device_type == "SEL_ICON"]
    return [_icon_row_payload(row, session) for row in rows]


@router.get("/operational/icon/{node_id}")
def operational_icon_node(node_id: str, session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    row = _operational_device_by_id(session, node_id)
    if row is None or row.device_type != "SEL_ICON":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operational ICON node not found")
    return _icon_detail_payload(row, session)


@router.get("/operational/circuits")
def operational_circuits(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [_dump(item) for item in _latest_circuit_states(session)]


@router.get("/operational/alarms")
def operational_alarms(_: SessionDep, __: CurrentUser) -> list[dict[str, Any]]:
    return operational_api.get_alarms()


@router.get("/compare/actual-vs-planned")
def compare_actual_vs_planned(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return _actual_planned_diffs(session)


@router.get("/compare/planned-vs-proposed")
def compare_planned_vs_proposed(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for change in session.exec(select(ProposedChange)).all():
        rows.extend(_proposed_change_diffs(session, change))
    return rows


@router.get("/compare/actual-vs-proposed")
def compare_actual_vs_proposed(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for change in session.exec(select(ProposedChange)).all():
        state = change.proposed_state_json or {}
        rows.append(
            _diff(
                change.target_entity_type or "proposed_change",
                change.target_entity_id,
                "proposed_change",
                _actual_summary_for_change(session, change),
                None,
                state.get("service_name") or state.get("circuit_id") or change.title,
                "proposed_add" if change.change_type.startswith("add_") else "proposed_modify",
                "info" if change.approval_status == "approved" else "warning",
                "Proposed change is staged only; operational API remains read-only.",
            )
        )
        rows.extend(_validate_change(session, change))
    return rows


@router.get("/compare/proposed-vs-as-built")
def compare_proposed_vs_as_built(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    rows = []
    for change in session.exec(select(ProposedChange)).all():
        as_built = "as_built" if change.source_state == "as_built" or change.engineering_status in {"implemented", "reconciled"} else None
        rows.append(
            _diff(
                change.target_entity_type or "proposed_change",
                change.target_entity_id,
                "as_built_status",
                None,
                None,
                change.engineering_status,
                "proposed_modify",
                "info" if as_built else "warning",
                "Proposed state has been reconciled as-built." if as_built else "Proposed state has not yet been marked as-built.",
            )
        )
    return rows


@router.get("/compare/as-built-vs-actual")
def compare_as_built_vs_actual(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    rows = []
    for change in session.exec(select(ProposedChange)).all():
        if change.source_state == "as_built" or change.engineering_status in {"implemented", "reconciled"}:
            rows.append(
                _diff(
                    change.target_entity_type or "proposed_change",
                    change.target_entity_id,
                    "operational_reconciliation",
                    _actual_summary_for_change(session, change),
                    "as-built closeout",
                    change.proposed_state_json,
                    "value_mismatch" if _actual_summary_for_change(session, change) == "not_found_in_latest_actual" else "proposed_modify",
                    "warning" if _actual_summary_for_change(session, change) == "not_found_in_latest_actual" else "info",
                    "As-built record compared against latest operational API snapshot.",
                )
            )
    return rows or [_diff("as_built", None, "operational_reconciliation", None, None, None, "missing_in_actual", "info", "No as-built/reconciled proposed changes found.")]


@router.get("/compare/device/{device_id}")
def compare_device(device_id: int, session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [row for row in _actual_planned_diffs(session) if row.get("entity_type") == "device" and row.get("entity_id") == device_id]


@router.get("/compare/icon/{node_id}")
def compare_icon(node_id: int, session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    node = session.get(IconNode, node_id)
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ICON node not found")
    return compare_device(node.device_id or 0, session, _)


@router.get("/compare/circuit/{circuit_id}")
def compare_circuit(circuit_id: int, session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [row for row in _actual_planned_diffs(session) if row.get("entity_type") == "circuit" and row.get("entity_id") == circuit_id]


@router.get("/proposed-changes")
def list_proposed_changes(session: SessionDep, _: CurrentUser, status_filter: str | None = None) -> list[dict[str, Any]]:
    statement = select(ProposedChange).order_by(ProposedChange.updated_at.desc())
    rows = session.exec(statement).all()
    if status_filter:
        rows = [row for row in rows if row.engineering_status == status_filter or row.approval_status == status_filter]
    return [_change_payload(row, session) for row in rows]


@router.post("/proposed-changes", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("admin", "engineer"))])
def create_proposed_change(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    payload = dict(payload)
    state = payload.get("proposed_state_json") or {}
    payload.setdefault("change_number", _next_change_number(session))
    payload.setdefault("title", _proposed_title(payload))
    payload.setdefault("change_type", "add_icon_service")
    payload.setdefault("target_entity_type", "icon_node")
    payload.setdefault("source_state", "proposed")
    payload.setdefault("risk_level", "normal")
    payload.setdefault("engineering_status", "draft")
    payload.setdefault("approval_status", "not_submitted")
    payload["requested_by_user_id"] = user.id
    payload.setdefault("assigned_engineer_id", user.id)
    payload["proposed_state_json"] = state
    change = ProposedChange.model_validate(payload)
    session.add(change)
    session.commit()
    session.refresh(change)
    _sync_icon_proposed_service(session, change)
    _store_diff_rows(session, change)
    add_audit_log(session, user, "create", "proposed_changes", change.id, new_value=change)
    session.commit()
    return _change_payload(change, session)


@router.get("/proposed-changes/{change_id}")
def get_proposed_change(change_id: int, session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    return _change_payload(change, session)


@router.put("/proposed-changes/{change_id}", dependencies=[Depends(require_roles("admin", "engineer"))])
def update_proposed_change(change_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    old = _dump(change)
    for key, value in payload.items():
        if key != "id" and hasattr(change, key):
            setattr(change, key, value)
    change.updated_by = user.id
    change.updated_at = datetime.now(timezone.utc)
    session.add(change)
    session.commit()
    session.refresh(change)
    _sync_icon_proposed_service(session, change)
    _store_diff_rows(session, change)
    add_audit_log(session, user, "update", "proposed_changes", change_id, old_value=old, new_value=change)
    session.commit()
    return _change_payload(change, session)


@router.post("/proposed-changes/{change_id}/submit", dependencies=[Depends(require_roles("admin", "engineer"))])
def submit_proposed_change(change_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    warnings = _validate_change(session, change)
    if any(row["severity"] == "critical" for row in warnings):
        change.engineering_status = "needs_revision"
        change.approval_status = "not_submitted"
    else:
        change.engineering_status = "under_engineering_review"
        change.approval_status = "pending_approval"
    change.updated_by = user.id
    change.updated_at = datetime.now(timezone.utc)
    session.add(change)
    add_audit_log(session, user, "submit", "proposed_changes", change_id, new_value=change)
    session.commit()
    session.refresh(change)
    return {**_change_payload(change, session), "validation": warnings}


@router.post("/proposed-changes/{change_id}/approve", dependencies=[Depends(require_roles("admin", "engineer"))])
def approve_proposed_change(change_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    change.engineering_status = "engineering_approved"
    change.approval_status = "approved"
    change.approved_by_user_id = user.id
    change.approved_at = datetime.now(timezone.utc)
    change.updated_by = user.id
    change.updated_at = datetime.now(timezone.utc)
    session.add(change)
    add_audit_log(session, user, "approve", "proposed_changes", change_id, new_value=change)
    session.commit()
    session.refresh(change)
    return _change_payload(change, session)


@router.post("/proposed-changes/{change_id}/reject", dependencies=[Depends(require_roles("admin", "engineer"))])
def reject_proposed_change(change_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    change.engineering_status = "needs_revision"
    change.approval_status = "rejected"
    change.reason = payload.get("reason", change.reason)
    change.updated_by = user.id
    change.updated_at = datetime.now(timezone.utc)
    session.add(change)
    add_audit_log(session, user, "reject", "proposed_changes", change_id, new_value=change)
    session.commit()
    session.refresh(change)
    return _change_payload(change, session)


@router.post("/proposed-changes/{change_id}/convert-to-work-order", dependencies=[Depends(require_roles("admin", "engineer"))])
def convert_change_to_work_order(change_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    if change.approval_status != "approved":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Proposed change must be approved before work order conversion")
    if change.related_work_order_id:
        order = session.get(WorkOrder, change.related_work_order_id)
        return {"proposed_change": _change_payload(change, session), "work_order": _dump(order) if order else None}

    state = change.proposed_state_json or {}
    device_id = _device_id_for_change(session, change)
    circuit = _circuit_for_state(session, state)
    order = WorkOrder(
        work_order_number=_next_work_order_number(session),
        title=state.get("work_order_title") or f"Install {state.get('service_type', 'ICON')} service for {state.get('circuit_id', change.change_number)}",
        description=_work_order_description(change, state),
        work_type="proposed_change_install",
        priority=_priority_from_risk(change.risk_level),
        status="ready_for_field",
        requested_by_user_id=change.requested_by_user_id,
        assigned_engineer_id=change.assigned_engineer_id or user.id,
        substation_id=_substation_id_for_change(session, change, state),
        circuit_id=circuit.id if circuit else None,
        device_id=device_id,
        outage_required=bool(state.get("outage_required", False)),
        protection_impact="yes" if state.get("protection_class") or state.get("service_type") in {"C37.94", "87L", "DTT"} else "no",
        closeout_summary="Generated from approved proposed change; operational API remains read-only.",
    )
    session.add(order)
    session.commit()
    session.refresh(order)

    for index, task in enumerate(_work_order_tasks_for_change(change, session), start=1):
        session.add(
            WorkOrderTask(
                work_order_id=order.id,
                task_number=index,
                task_title=task,
                assigned_to_user_id=None,
                photo_required=index in {13, 14},
                status="open",
            )
        )
    checklist = _create_commissioning_checklist(session, change, order, user)
    change.related_work_order_id = order.id
    change.engineering_status = "converted_to_work_order"
    change.updated_by = user.id
    change.updated_at = datetime.now(timezone.utc)
    session.add(change)
    add_audit_log(session, user, "convert_to_work_order", "proposed_changes", change_id, new_value=order)
    session.commit()
    session.refresh(change)
    session.refresh(order)
    session.refresh(checklist)
    return {"proposed_change": _change_payload(change, session), "work_order": _dump(order), "commissioning_checklist": _dump(checklist)}


@router.post("/proposed-changes/{change_id}/reconcile", dependencies=[Depends(require_roles("admin", "engineer"))])
def reconcile_proposed_change(change_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    change.engineering_status = "reconciled"
    change.source_state = "as_built"
    change.updated_by = user.id
    change.updated_at = datetime.now(timezone.utc)
    session.add(change)
    add_audit_log(session, user, "reconcile", "proposed_changes", change_id, new_value=change)
    session.commit()
    session.refresh(change)
    return _change_payload(change, session)


@router.get("/icon/service-templates")
def icon_service_templates(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [_dump(item) for item in session.exec(select(IconServiceTemplate).order_by(IconServiceTemplate.service_type, IconServiceTemplate.template_name)).all()]


@router.post("/icon/service-templates", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("admin", "engineer"))])
def create_icon_service_template(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    payload = dict(payload)
    payload["created_by_user_id"] = user.id
    template = IconServiceTemplate.model_validate(payload)
    session.add(template)
    session.commit()
    session.refresh(template)
    return _dump(template)


@router.get("/icon/service-templates/{template_id}")
def get_icon_service_template(template_id: int, session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    return _dump(_required(session, IconServiceTemplate, template_id, "ICON service template"))


@router.get("/commissioning/checklists")
def commissioning_checklists(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    return [_checklist_payload(item, session) for item in session.exec(select(CommissioningChecklist).order_by(CommissioningChecklist.created_at.desc())).all()]


@router.post("/commissioning/checklists", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("admin", "engineer"))])
def create_commissioning_checklist(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    payload = dict(payload)
    items = payload.pop("items", [])
    payload["created_by_user_id"] = user.id
    checklist = CommissioningChecklist.model_validate(payload)
    session.add(checklist)
    session.commit()
    session.refresh(checklist)
    for index, item in enumerate(items, start=1):
        item.setdefault("item_number", index)
        item["checklist_id"] = checklist.id
        session.add(CommissioningChecklistItem.model_validate(item))
    session.commit()
    return _checklist_payload(checklist, session)


@router.get("/commissioning/checklists/{checklist_id}")
def get_commissioning_checklist(checklist_id: int, session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    checklist = _required(session, CommissioningChecklist, checklist_id, "Commissioning checklist")
    return _checklist_payload(checklist, session)


@router.put("/commissioning/checklists/{checklist_id}", dependencies=[Depends(require_roles("admin", "engineer", "field_tech"))])
def update_commissioning_checklist(checklist_id: int, payload: dict[str, Any], session: SessionDep, _: CurrentUser) -> dict[str, Any]:
    checklist = _required(session, CommissioningChecklist, checklist_id, "Commissioning checklist")
    for key, value in payload.items():
        if key != "id" and hasattr(checklist, key):
            setattr(checklist, key, value)
    if checklist.status in {"complete", "completed", "commissioned"} and checklist.completed_at is None:
        checklist.completed_at = datetime.now(timezone.utc)
    session.add(checklist)
    session.commit()
    session.refresh(checklist)
    return _checklist_payload(checklist, session)


@router.post("/commissioning/checklists/{checklist_id}/complete-item", dependencies=[Depends(require_roles("admin", "engineer", "field_tech"))])
def complete_checklist_item(checklist_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    checklist = _required(session, CommissioningChecklist, checklist_id, "Commissioning checklist")
    item_id = payload.get("item_id")
    item_number = payload.get("item_number")
    item = session.get(CommissioningChecklistItem, item_id) if item_id else None
    if item is None and item_number:
        item = session.exec(select(CommissioningChecklistItem).where(CommissioningChecklistItem.checklist_id == checklist_id, CommissioningChecklistItem.item_number == item_number)).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    item.status = payload.get("status", "pass")
    item.actual_result = payload.get("actual_result", item.actual_result)
    item.notes = payload.get("notes", item.notes)
    item.completed_by_user_id = user.id
    item.completed_at = datetime.now(timezone.utc)
    session.add(item)
    _update_checklist_status(session, checklist)
    session.commit()
    return _checklist_payload(checklist, session)


@router.post("/commissioning/checklists/{checklist_id}/attach-evidence", dependencies=[Depends(require_roles("admin", "engineer", "field_tech"))])
def attach_checklist_evidence(checklist_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    _required(session, CommissioningChecklist, checklist_id, "Commissioning checklist")
    attachment = Attachment(
        entity_type="commissioning_checklist",
        entity_id=str(checklist_id),
        filename=payload.get("filename", "commissioning-evidence.txt"),
        file_url=payload.get("file_url", "/uploads/stubbed-commissioning-evidence.txt"),
        attachment_type=payload.get("attachment_type", "test_evidence"),
        uploaded_by_user_id=user.id,
        notes=payload.get("notes"),
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    item_id = payload.get("item_id")
    if item_id:
        item = session.get(CommissioningChecklistItem, item_id)
        if item:
            item.evidence_attachment_id = attachment.id
            session.add(item)
            session.commit()
            session.refresh(attachment)
    return _dump(attachment)


def _add_port_states(session, snapshot: OperationalSnapshot, actual_device: dict[str, Any], planned: Device | None) -> None:
    planned_ports = []
    if planned and planned.id:
        planned_ports = session.exec(select(DevicePort).where(DevicePort.device_id == planned.id)).all()
    planned_by_name = {port.port_name: port for port in planned_ports}
    for port in operational_api.get_device_ports(actual_device["id"]):
        planned_port = planned_by_name.get(port["port_name"])
        session.add(
            OperationalPortState(
                snapshot_id=snapshot.id,
                external_device_id=actual_device["id"],
                external_port_id=port["id"],
                port_name=port["port_name"],
                port_type=port.get("port_type"),
                port_speed=port.get("port_speed"),
                admin_status=port.get("admin_status"),
                operational_status=port.get("operational_status"),
                connected_to=port.get("connected_to"),
                assigned_service=port.get("assigned_service"),
                assigned_circuit=port.get("assigned_circuit"),
                raw_payload_json=port,
                matched_device_port_id=planned_port.id if planned_port else None,
                match_status="matched" if planned_port else "unmatched_actual_only",
            )
        )


def _actual_planned_diffs(session: SessionDep) -> list[dict[str, Any]]:
    diffs: list[dict[str, Any]] = []
    actual_devices = _latest_device_states(session)
    actual_circuits = _latest_circuit_states(session)
    for row in actual_devices:
        if row.match_status == "unmatched_actual_only":
            diffs.append(_diff("device", row.matched_device_id, "device_name", row.device_name, None, None, "missing_in_planned", "warning", "Device exists in operational API but not planning database"))
        elif row.match_status == "unmatched_planned_only":
            diffs.append(_diff("device", row.matched_device_id, "device_name", None, row.device_name, None, "missing_in_actual", "warning", "Device exists in planning database but not operational API"))
        elif row.matched_device_id:
            planned = session.get(Device, row.matched_device_id)
            if planned:
                if planned.firmware_version and row.firmware_version and planned.firmware_version != row.firmware_version:
                    diffs.append(_diff("device", planned.id, "firmware_version", row.firmware_version, planned.firmware_version, None, "value_mismatch", "warning", "Firmware mismatch against planning record"))
                if row.alarm_status not in {None, "normal"}:
                    diffs.append(_diff("device", planned.id, "alarm_status", row.alarm_status, "normal", None, "value_mismatch", "critical" if row.alarm_status == "critical" else "warning", "Alarm exists on actual node"))
                if row.timing_status not in {None, "normal", "not_applicable"}:
                    diffs.append(_diff("device", planned.id, "timing_status", row.timing_status, "normal", None, "value_mismatch", "warning", "Timing source mismatch or alarm"))
    for row in actual_circuits:
        if row.match_status == "unmatched_actual_only":
            diffs.append(_diff("circuit", row.matched_circuit_id, "circuit_id", row.external_circuit_id, None, None, "missing_in_planned", "warning", "Actual circuit not documented in planning database"))
        elif row.match_status == "unmatched_planned_only":
            diffs.append(_diff("circuit", row.matched_circuit_id, "circuit_id", None, row.circuit_name, None, "missing_in_actual", "warning", "Planned circuit not found in operational API"))
        elif row.matched_circuit_id:
            planned = session.get(Circuit, row.matched_circuit_id)
            if planned and planned.measured_latency_ms and row.measured_latency_ms and abs(planned.measured_latency_ms - row.measured_latency_ms) > 2:
                diffs.append(_diff("circuit", planned.id, "measured_latency_ms", row.measured_latency_ms, planned.measured_latency_ms, None, "value_mismatch", "info", "Measured latency differs from planning record"))
    diffs.extend(_port_diffs(session))
    return diffs


def _port_diffs(session: SessionDep) -> list[dict[str, Any]]:
    rows = []
    for port in _latest_port_states(session):
        if port.match_status == "unmatched_actual_only":
            rows.append(_diff("device_port", port.matched_device_port_id, "port_name", port.port_name, None, None, "missing_in_planned", "info", "Operational port has no planning port match"))
        if port.matched_device_port_id:
            planned = session.get(DevicePort, port.matched_device_port_id)
            if planned and port.assigned_circuit and planned.connected_circuit_id:
                planned_circuit = session.get(Circuit, planned.connected_circuit_id)
                if planned_circuit and planned_circuit.circuit_id != port.assigned_circuit:
                    rows.append(_diff("device_port", planned.id, "assigned_circuit", port.assigned_circuit, planned_circuit.circuit_id, None, "value_mismatch", "warning", "Device port actual/planned/proposed mismatch"))
    return rows


def _proposed_change_diffs(session: SessionDep, change: ProposedChange) -> list[dict[str, Any]]:
    stored = session.exec(select(ProposedChangeDiff).where(ProposedChangeDiff.proposed_change_id == change.id)).all()
    if stored:
        return [_diff_from_model(item) for item in stored]
    return _validate_change(session, change)


def _validate_change(session: SessionDep, change: ProposedChange) -> list[dict[str, Any]]:
    state = change.proposed_state_json or {}
    diffs: list[dict[str, Any]] = []
    required = _required_fields_for_change(session, change)
    for field in required:
        if state.get(field) in {None, ""}:
            diffs.append(_diff(change.target_entity_type or "proposed_change", change.target_entity_id, field, None, None, None, "proposed_modify", "critical", "Required engineering parameter is missing"))
    circuit_id = state.get("circuit_id")
    if circuit_id and session.exec(select(Circuit).where(Circuit.circuit_id == circuit_id)).first():
        diffs.append(_diff("circuit", None, "circuit_id", circuit_id, circuit_id, circuit_id, "value_mismatch", "warning", "Circuit ID already exists in planning database"))
    for port_field in ["a_end_port_id", "z_end_port_id"]:
        port_id = state.get(port_field)
        if port_id:
            port = session.get(DevicePort, int(port_id))
            if port is None:
                diffs.append(_diff("device_port", None, port_field, None, None, str(port_id), "missing_in_planned", "critical", "Selected port does not exist"))
            elif port.status not in {"available", "planned", "reserved"}:
                diffs.append(_diff("device_port", port.id, "status", port.status, port.status, "assigned", "value_mismatch", "warning", "Proposed service uses unavailable port"))
    for strand_id in state.get("fiber_strand_ids", []) or []:
        strand = session.get(FiberStrand, int(strand_id))
        if strand and strand.status not in {"available", "dark", "spare"}:
            diffs.append(_diff("fiber_strand", strand.id, "status", strand.status, strand.status, "assigned", "value_mismatch", "warning", "Proposed service uses assigned fiber strand"))
    if state.get("diversity_required") and not state.get("backup_path"):
        diffs.append(_diff("circuit_path", change.target_entity_id, "backup_path", None, None, None, "missing_in_planned", "warning", "Diverse backup path is required but not staged"))
    return diffs or [_diff(change.target_entity_type or "proposed_change", change.target_entity_id, "validation", None, None, "valid", "proposed_modify", "info", "No blocking conflicts found")]


def _store_diff_rows(session: SessionDep, change: ProposedChange) -> None:
    existing = session.exec(select(ProposedChangeDiff).where(ProposedChangeDiff.proposed_change_id == change.id)).all()
    for row in existing:
        session.delete(row)
    session.flush()
    for row in _validate_change(session, change):
        session.add(
            ProposedChangeDiff(
                proposed_change_id=change.id,
                entity_type=row["entity_type"],
                entity_id=row.get("entity_id"),
                field_name=row["field"],
                actual_value=_string(row.get("actual")),
                planned_value=_string(row.get("planned")),
                proposed_value=_string(row.get("proposed")),
                diff_type=row["diff_type"],
                severity=row["severity"],
                notes=row["notes"],
            )
        )


def _sync_icon_proposed_service(session: SessionDep, change: ProposedChange) -> None:
    state = change.proposed_state_json or {}
    if "service" not in change.change_type and not state.get("service_type"):
        return
    existing = session.exec(select(IconProposedService).where(IconProposedService.proposed_change_id == change.id)).first()
    payload = {
        "proposed_change_id": change.id,
        "icon_node_id": change.target_entity_id if change.target_entity_type == "icon_node" else state.get("icon_node_id"),
        "service_template_id": state.get("service_template_id"),
        "service_name": state.get("service_name") or state.get("circuit_id") or change.title,
        "service_type": state.get("service_type") or "other",
        "a_end_node_id": state.get("a_end_node_id"),
        "z_end_node_id": state.get("z_end_node_id"),
        "a_end_port_id": state.get("a_end_port_id"),
        "z_end_port_id": state.get("z_end_port_id"),
        "circuit_id": _circuit_for_state(session, state).id if _circuit_for_state(session, state) else state.get("planning_circuit_id"),
        "protection_service_id": state.get("protection_service_id"),
        "proposed_parameters_json": state,
        "validation_status": "invalid" if any(row["severity"] == "critical" for row in _validate_change(session, change)) else "warning" if any(row["severity"] == "warning" for row in _validate_change(session, change)) else "valid",
        "commissioning_status": "ready_for_field" if change.approval_status == "approved" else "not_started",
        "notes": change.reason,
    }
    if existing:
        for key, value in payload.items():
            setattr(existing, key, value)
        session.add(existing)
    else:
        session.add(IconProposedService.model_validate(payload))


def _service_type_cards(services: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for service_type in sorted({str(item.get("service_type") or "unknown") for item in services}):
        matching = [item for item in services if str(item.get("service_type") or "unknown") == service_type]
        carried = _flatten_summary_values(matching, "carried_devices_summary", limit=8)
        payloads = _flatten_summary_values(matching, "payload_summary", limit=4)
        bandwidths = _flatten_summary_values(matching, "bandwidth_profile", limit=4)
        timing = _flatten_summary_values(matching, "timing_profile", limit=4)
        rows.append(
            {
                "service_type": service_type,
                "label": _module_label(service_type),
                "value": len(matching),
                "carried_devices": "; ".join(carried) if carried else "No endpoint devices listed",
                "payloads_carried": "; ".join(payloads) if payloads else "Synthetic payload placeholder",
                "bandwidth_profiles": "; ".join(bandwidths) if bandwidths else "Engineering bandwidth placeholder",
                "timing_profiles": "; ".join(timing) if timing else "Timing profile placeholder",
                "critical_services": len([item for item in matching if item.get("criticality") == "critical"]),
                "commissioning_statuses": ", ".join(sorted({str(item.get("commissioning_status")) for item in matching if item.get("commissioning_status")})),
            }
        )
    return rows


def _node_service_summary(nodes: list[dict[str, Any]], services: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for node in nodes:
        node_name = node["device_name"]
        matching = [item for item in services if node_name in str(item.get("a_end")) or node_name in str(item.get("z_end")) or item.get("node_id") == node.get("id")]
        service_types = sorted({str(item.get("service_type")) for item in matching if item.get("service_type")})
        carried = _flatten_summary_values(matching, "carried_devices_summary", limit=10)
        rows.append(
            {
                "id": node.get("id"),
                "node_name": node_name,
                "substation_code": node.get("substation_code"),
                "network_role": node.get("network_role"),
                "firmware_version": node.get("firmware_version"),
                "timing_status": node.get("timing_status"),
                "alarm_status": node.get("alarm_status"),
                "service_count": len({item.get("id") for item in matching}),
                "service_classes_carried": ", ".join(service_types) or "none",
                "critical_service_count": len([item for item in matching if item.get("criticality") == "critical"]),
                "carried_device_count": len(carried),
                "carried_device_summary": "; ".join(carried) if carried else "No synthetic endpoint devices assigned",
                "circuits_carried": ", ".join([str(item.get("circuit")) for item in matching[:8] if item.get("circuit")]),
            }
        )
    return rows


def _flatten_summary_values(rows: list[dict[str, Any]], key: str, limit: int = 8) -> list[str]:
    values: list[str] = []
    for row in rows:
        raw = row.get(key)
        if isinstance(raw, list):
            candidates = [str(item) for item in raw]
        else:
            candidates = [part.strip() for part in str(raw or "").split(";")]
        for candidate in candidates:
            if candidate and candidate not in values:
                values.append(candidate)
            if len(values) >= limit:
                return values
    return values


def _icon_parameter_categories() -> list[dict[str, Any]]:
    categories = [
        ("node_identity", "Node identity", ["node name", "site/substation", "management IP", "firmware revision", "chassis type", "rack location", "serial number", "operational role", "network role"]),
        ("transport_configuration", "Transport configuration", ["transport mode", "SONET transport", "Ethernet transport", "VSN container", "Ethernet pipe", "VLAN ID", "bandwidth allocation", "primary path", "backup path", "topology type", "path restoration behavior"]),
        ("line_module_configuration", "Line/module configuration", ["chassis slot", "module type", "module serial number", "port count", "line port", "tributary port", "service role", "optical interface type", "SFP type", "fiber pair", "patch panel port", "remote node"]),
        ("service_provisioning", "Service provisioning", ["service name", "service type", "A-end node", "Z-end node", "A-end port", "Z-end port", "circuit ID", "criticality", "bandwidth", "latency requirement", "measured latency", "protection class", "service status"]),
        ("protection_telecom_service", "Protection telecom service", ["scheme type", "87L", "DTT", "Mirrored Bits", "C37.94", "relay A", "relay B", "maximum latency requirement", "asymmetry limit", "primary communications path", "backup communications path", "diversity required", "end-to-end test status"]),
        ("tdm_legacy_service", "TDM / legacy service", ["DS1", "DS0", "E1", "E0", "channel bank use", "grooming path", "timeslot assignment", "analog 4-wire", "FXO", "FXS", "legacy migration status"]),
        ("ethernet_service", "Ethernet service", ["Ethernet service type", "VLAN ID", "Ethernet pipe", "port speed", "duplex", "MTU", "QoS class", "traffic class", "SCADA/noncritical traffic flag", "IEC 61850 / GOOSE support flag", "broadcast containment flag"]),
        ("timing_parameters", "Timing parameters", ["timing source", "GPS", "IRIG-B", "IEEE 1588 PTP Telecom Profile", "SONET timing", "Stratum 1 source", "primary timing source", "backup timing source", "timing quality", "holdover/fallback behavior", "timing alarm status"]),
        ("security_management", "Security / management", ["user role model", "authentication mode", "centralized authentication", "local account fallback", "NMS integration", "SEL-5051/5052 reference", "SNMP status", "syslog status", "change log status", "firmware tracking"]),
        ("commissioning_test_parameters", "Commissioning and test", ["pre-install checklist status", "bench configuration status", "field installation status", "fiber continuity test", "optical loss", "OTDR attachment", "service turnup test", "latency test", "failover/restoration test", "timing verification", "as-built photos", "final engineer approval"]),
    ]
    return [
        {
            "key": key,
            "label": label,
            "field_count": len(fields),
            "fields": fields,
            "manual_reference": "SEL manual/application guide section placeholder",
            "engineering_standard_reference": "TelecomNE internal engineering standard placeholder",
            "status": "parameterized_placeholder",
        }
        for key, label, fields in categories
    ]


def _operational_module_count(fragment: str) -> int:
    fragment = fragment.lower()
    return len(
        [
            module
            for node in operational_api.get_icon_nodes()
            for module in operational_api.get_icon_modules(node["id"])
            if fragment in str(module.get("module_type", "")).lower()
        ]
    )


def _module_label(module_type: str) -> str:
    return module_type.replace("_", " ").replace("-", " ").title()


def _module_detail_text(module_type: str) -> str:
    value = module_type.lower()
    if "c37" in value:
        return "Protection relay channel cards with C37.94-style placeholders."
    if "ds1" in value or "tributary" in value:
        return "TDM tributary cards for DS1/DS0 grooming and migration planning."
    if "ethernet" in value or "vsn" in value:
        return "Packet cards for Ethernet pipes, VLANs, SCADA, NMS, and VSN containers."
    if "timing" in value:
        return "Timing I/O cards for PTP, IRIG-B, SONET timing, and holdover verification."
    if "processor" in value:
        return "Control/management card with NMS, security, firmware, and commissioning references."
    return "Transport card with synthetic provisioning fields and commissioning placeholders."


def _device_type_label(device_type: str) -> str:
    return device_type.replace("_", " ").replace("-", " ").upper() if device_type == "RTU" else device_type.replace("_", " ").replace("-", " ").title()


def _unique_by(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for row in rows:
        value = row.get(key)
        if value in seen:
            continue
        seen.add(value)
        result.append(row)
    return result


def _device_dashboard_payload(row: OperationalDeviceState, session: SessionDep) -> dict[str, Any]:
    planned = session.get(Device, row.matched_device_id) if row.matched_device_id else None
    proposed = session.exec(select(ProposedChange).where(ProposedChange.target_entity_type.in_(["device", "icon_node"]))).all()
    proposed = [item for item in proposed if item.target_entity_id in {planned.id if planned else None, _icon_node_id_for_device(session, planned.id if planned else None)}]
    ports = _latest_ports_for_device(session, row.external_device_id)
    circuits = [item for item in _latest_circuit_states(session) if item.a_end_device == row.device_name or item.z_end_device == row.device_name]
    work_orders = session.exec(select(WorkOrder).where(WorkOrder.device_id == row.matched_device_id)).all() if row.matched_device_id else []
    checklists = session.exec(select(CommissioningChecklist).where(CommissioningChecklist.entity_type.in_(["device", "icon_node"]))).all()
    checklists = [item for item in checklists if item.entity_id in {row.matched_device_id, _icon_node_id_for_device(session, row.matched_device_id)}]
    return {
        "actual": _dump(row),
        "planned": _dump(planned) if planned else None,
        "source_status": row.match_status,
        "ports": [_dump(item) for item in ports],
        "circuits": [_dump(item) for item in circuits],
        "proposed_changes": [_change_payload(item, session) for item in proposed],
        "work_orders": [_dump(item) for item in work_orders],
        "alarms": [alarm for alarm in operational_api.get_alarms() if alarm.get("device_name") == row.device_name],
        "commissioning": [_checklist_payload(item, session) for item in checklists],
        "fiber_connectivity": _fiber_for_device(session, row.matched_device_id),
        "qr_link": f"/devices/{row.matched_device_id}" if row.matched_device_id else f"/deviceops/devices/{row.id}",
        "diffs": [item for item in _actual_planned_diffs(session) if item.get("entity_type") == "device" and item.get("entity_id") == row.matched_device_id],
    }


def _icon_detail_payload(row: OperationalDeviceState, session: SessionDep) -> dict[str, Any]:
    payload = _device_dashboard_payload(row, session)
    node = session.exec(select(IconNode).where(IconNode.device_id == row.matched_device_id)).first() if row.matched_device_id else None
    profile = session.exec(select(IconEngineeringProfile).where(IconEngineeringProfile.icon_node_id == node.id)).first() if node and node.id else None
    proposed = session.exec(select(IconProposedService).where(IconProposedService.icon_node_id == node.id)).all() if node and node.id else []
    payload.update(
        {
            "icon_node": _dump(node) if node else None,
            "engineering_profile": _dump(profile) if profile else None,
            "slots": operational_api.get_icon_slots(row.external_device_id),
            "modules": operational_api.get_icon_modules(row.external_device_id),
            "services": operational_api.get_icon_services(row.external_device_id),
            "proposed_services": [_dump(item) for item in proposed],
            "timing": [item for item in operational_api.get_timing_status() if item["device_name"] == row.device_name],
            "security_parameters": {
                "user_role_model": "role_based_placeholder",
                "authentication_mode": "centralized_auth_with_local_fallback",
                "nms_integration": "NMS reference placeholder",
                "manual_reference": "SEL manual section placeholder",
                "engineering_standard_reference": "TelecomNE ICON security standard placeholder",
            },
        }
    )
    return payload


def _icon_row_payload(row: OperationalDeviceState, session: SessionDep) -> dict[str, Any]:
    ports = _latest_ports_for_device(session, row.external_device_id)
    services = operational_api.get_icon_services(row.external_device_id)
    proposed_count = len([item for item in session.exec(select(ProposedChange)).all() if item.target_entity_type == "icon_node" and item.target_entity_id == _icon_node_id_for_device(session, row.matched_device_id)])
    return {
        **_dump(row),
        "source": "actual",
        "service_count": len(services),
        "active_circuits": len({item.get("circuit") for item in services}),
        "port_utilization": f"{len([item for item in ports if item.assigned_circuit])}/{len(ports)}",
        "open_alarms": len([alarm for alarm in operational_api.get_alarms() if alarm.get("device_name") == row.device_name]),
        "pending_proposed_changes": proposed_count,
        "transport_mode": (row.raw_payload_json or {}).get("network_role", "hybrid"),
    }


def _device_with_source(row: OperationalDeviceState, session: SessionDep) -> dict[str, Any]:
    data = _dump(row)
    data["source"] = "planned" if row.match_status == "unmatched_planned_only" else "actual"
    data["planned_device_id"] = row.matched_device_id
    planned = session.get(Device, row.matched_device_id) if row.matched_device_id else None
    data["criticality"] = planned.criticality if planned else (row.raw_payload_json or {}).get("criticality")
    return data


def _change_payload(change: ProposedChange, session: SessionDep) -> dict[str, Any]:
    work_order = session.get(WorkOrder, change.related_work_order_id) if change.related_work_order_id else None
    proposed_services = session.exec(select(IconProposedService).where(IconProposedService.proposed_change_id == change.id)).all()
    return {**_dump(change), "source": "proposed", "diffs": _proposed_change_diffs(session, change), "work_order": _dump(work_order) if work_order else None, "icon_proposed_services": [_dump(item) for item in proposed_services]}


def _checklist_payload(checklist: CommissioningChecklist, session: SessionDep) -> dict[str, Any]:
    items = session.exec(select(CommissioningChecklistItem).where(CommissioningChecklistItem.checklist_id == checklist.id).order_by(CommissioningChecklistItem.item_number)).all()
    return {**_dump(checklist), "items": [_dump(item) for item in items]}


def _create_commissioning_checklist(session: SessionDep, change: ProposedChange, order: WorkOrder, user: CurrentUser) -> CommissioningChecklist:
    state = change.proposed_state_json or {}
    service_type = state.get("service_type", "SEL_ICON_service_turnup")
    checklist_type = _checklist_type(service_type)
    checklist = CommissioningChecklist(
        checklist_name=f"Commissioning - {change.title}",
        entity_type="work_order",
        entity_id=order.id,
        checklist_type=checklist_type,
        manual_reference=state.get("manual_reference", "SEL manual section placeholder"),
        status="not_started",
        created_by_user_id=user.id,
        assigned_to_user_id=order.assigned_field_tech_id,
        notes="Checklist generated from proposed change. Manual text is not copied; references and internal standards are placeholders.",
    )
    session.add(checklist)
    session.commit()
    session.refresh(checklist)
    for index, task in enumerate(_commissioning_steps_for_change(change, session), start=1):
        session.add(
            CommissioningChecklistItem(
                checklist_id=checklist.id,
                item_number=index,
                category=task["category"],
                task_text=task["task_text"],
                expected_result=task["expected_result"],
                status="not_started",
                notes=task.get("notes"),
            )
        )
    return checklist


def _commissioning_steps_for_change(change: ProposedChange, session: SessionDep) -> list[dict[str, str]]:
    state = change.proposed_state_json or {}
    template = session.get(IconServiceTemplate, state.get("service_template_id")) if state.get("service_template_id") else None
    steps = (template.commissioning_steps_json or {}).get("steps") if template else None
    if steps:
        return steps
    return [
        {"category": "Engineering package", "task_text": "Verify approved engineering package and manual/reference placeholders.", "expected_result": "Approved package matches work order scope."},
        {"category": "Port assignment", "task_text": "Verify ICON node, slot, module, and service port assignment.", "expected_result": "Assigned ports match approved design."},
        {"category": "Fiber", "task_text": "Verify assigned fiber strands and patch panel ports.", "expected_result": "Fiber continuity and labels are correct."},
        {"category": "Turnup", "task_text": "Turn up service per approved configuration package.", "expected_result": "Service is active without unexpected alarms."},
        {"category": "Latency", "task_text": "Measure latency and record test evidence.", "expected_result": "Latency is within approved engineering requirement."},
        {"category": "Protection", "task_text": "Test protection communications or control-system path as applicable.", "expected_result": "End-to-end test passes."},
        {"category": "Closeout", "task_text": "Upload screenshots, test sheets, and as-built photos.", "expected_result": "Evidence is attached for engineering closeout."},
    ]


def _work_order_tasks_for_change(change: ProposedChange, session: SessionDep) -> list[str]:
    state = change.proposed_state_json or {}
    template = session.get(IconServiceTemplate, state.get("service_template_id")) if state.get("service_template_id") else None
    suggestions = (template.test_requirements_json or {}).get("work_order_task_suggestions") if template else None
    if suggestions:
        return suggestions
    return [
        "Verify approved engineering package.",
        "Verify ICON node and slot/module assignment.",
        "Verify assigned device ports.",
        "Verify assigned patch panel ports.",
        "Verify fiber strand assignment.",
        "Patch A-end ICON service port.",
        "Patch Z-end ICON service port.",
        "Verify optical/fiber continuity.",
        "Turn up service per approved configuration package.",
        "Measure latency.",
        "Test protection communications.",
        "Test failover/path restoration if applicable.",
        "Upload screenshots/test sheets.",
        "Upload as-built photos.",
        "Submit field closeout.",
    ]


def _required_fields_for_change(session: SessionDep, change: ProposedChange) -> list[str]:
    state = change.proposed_state_json or {}
    template = session.get(IconServiceTemplate, state.get("service_template_id")) if state.get("service_template_id") else None
    fields = (template.required_parameters_json or {}).get("required_fields") if template else None
    return fields or ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id"]


def _fiber_for_device(session: SessionDep, device_id: int | None) -> list[dict[str, Any]]:
    if not device_id:
        return []
    assignments = session.exec(select(FiberAssignment).where(FiberAssignment.device_id == device_id)).all()
    return [_dump(item) for item in assignments]


def _latest_snapshot(session: SessionDep) -> OperationalSnapshot | None:
    return session.exec(select(OperationalSnapshot).order_by(OperationalSnapshot.snapshot_time.desc(), OperationalSnapshot.id.desc())).first()


def _latest_device_states(session: SessionDep) -> list[OperationalDeviceState]:
    snapshot = _latest_snapshot(session)
    return session.exec(select(OperationalDeviceState).where(OperationalDeviceState.snapshot_id == snapshot.id).order_by(OperationalDeviceState.device_name)).all() if snapshot else []


def _latest_port_states(session: SessionDep) -> list[OperationalPortState]:
    snapshot = _latest_snapshot(session)
    return session.exec(select(OperationalPortState).where(OperationalPortState.snapshot_id == snapshot.id).order_by(OperationalPortState.external_device_id, OperationalPortState.port_name)).all() if snapshot else []


def _latest_circuit_states(session: SessionDep) -> list[OperationalCircuitState]:
    snapshot = _latest_snapshot(session)
    return session.exec(select(OperationalCircuitState).where(OperationalCircuitState.snapshot_id == snapshot.id).order_by(OperationalCircuitState.external_circuit_id)).all() if snapshot else []


def _latest_ports_for_device(session: SessionDep, external_device_id: str) -> list[OperationalPortState]:
    return [item for item in _latest_port_states(session) if item.external_device_id == external_device_id]


def _operational_device_by_id(session: SessionDep, device_id: str) -> OperationalDeviceState | None:
    rows = _latest_device_states(session)
    return next((row for row in rows if str(row.id) == str(device_id) or row.external_device_id == device_id or row.device_name == device_id or str(row.matched_device_id) == str(device_id)), None)


def _device_match_status(planned: Device | None, item: dict[str, Any]) -> str:
    if not planned:
        return "unmatched_actual_only"
    if planned.firmware_version and item.get("firmware_version") and planned.firmware_version != item.get("firmware_version"):
        return "conflict"
    return "matched"


def _circuit_match_status(planned: Circuit | None, item: dict[str, Any]) -> str:
    if not planned:
        return "unmatched_actual_only"
    if planned.service_type and item.get("service_type") and planned.service_type != item.get("service_type"):
        return "conflict"
    return "matched"


def _firmware_mismatches(session: SessionDep, actual_devices: list[OperationalDeviceState]) -> list[OperationalDeviceState]:
    mismatches = []
    for row in actual_devices:
        planned = session.get(Device, row.matched_device_id) if row.matched_device_id else None
        node = session.exec(select(IconNode).where(IconNode.device_id == planned.id)).first() if planned and planned.id else None
        planned_fw = planned.firmware_version or (node.firmware_version if node else None)
        if row.device_type == "SEL_ICON" and planned_fw and row.firmware_version and planned_fw != row.firmware_version:
            mismatches.append(row)
    return mismatches


def _icon_node_id_for_device(session: SessionDep, device_id: int | None) -> int | None:
    if not device_id:
        return None
    node = session.exec(select(IconNode).where(IconNode.device_id == device_id)).first()
    return node.id if node else None


def _device_id_for_change(session: SessionDep, change: ProposedChange) -> int | None:
    if change.target_entity_type == "device":
        return change.target_entity_id
    if change.target_entity_type == "icon_node" and change.target_entity_id:
        node = session.get(IconNode, change.target_entity_id)
        return node.device_id if node else None
    return None


def _substation_id_for_change(session: SessionDep, change: ProposedChange, state: dict[str, Any]) -> int | None:
    device_id = _device_id_for_change(session, change)
    if device_id:
        device = session.get(Device, device_id)
        if device:
            return device.substation_id
    code = state.get("substation_code")
    substation = session.exec(select(Substation).where(Substation.substation_code == code)).first() if code else None
    return substation.id if substation else None


def _circuit_for_state(session: SessionDep, state: dict[str, Any]) -> Circuit | None:
    circuit_id = state.get("circuit_id")
    return session.exec(select(Circuit).where(Circuit.circuit_id == circuit_id)).first() if circuit_id else None


def _actual_summary_for_change(session: SessionDep, change: ProposedChange) -> str:
    state = change.proposed_state_json or {}
    circuit_id = state.get("circuit_id")
    if circuit_id:
        actual_circuit = next((row for row in _latest_circuit_states(session) if row.external_circuit_id == circuit_id), None)
        if actual_circuit:
            return f"{actual_circuit.external_circuit_id}: {actual_circuit.operational_status}"
    if change.target_entity_type == "icon_node" and change.target_entity_id:
        node = session.get(IconNode, change.target_entity_id)
        actual_device = next((row for row in _latest_device_states(session) if row.device_name == node.node_name), None) if node else None
        if actual_device:
            return f"{actual_device.device_name}: {actual_device.operational_status}"
    if change.target_entity_type == "device" and change.target_entity_id:
        actual_device = next((row for row in _latest_device_states(session) if row.matched_device_id == change.target_entity_id), None)
        if actual_device:
            return f"{actual_device.device_name}: {actual_device.operational_status}"
    return "not_found_in_latest_actual"


def _next_change_number(session: SessionDep) -> str:
    count = len(session.exec(select(ProposedChange)).all()) + 1
    return f"PCR-2026-{count:04d}"


def _next_work_order_number(session: SessionDep) -> str:
    existing = len(session.exec(select(WorkOrder)).all()) + 1
    return f"WO-2026-DOP-{existing:04d}"


def _proposed_title(payload: dict[str, Any]) -> str:
    state = payload.get("proposed_state_json") or {}
    service_type = state.get("service_type", "DeviceOps")
    circuit_id = state.get("circuit_id", payload.get("change_number", "staged change"))
    return f"Add {service_type} service for {circuit_id}"


def _work_order_description(change: ProposedChange, state: dict[str, Any]) -> str:
    details = [
        change.description or change.reason or "Approved DeviceOps proposed change.",
        "Operational API is read-only; this work order stages field installation and commissioning only.",
        f"Service template: {state.get('service_template_id', 'not selected')}",
        f"Fiber strands: {state.get('fiber_strand_ids', [])}",
        f"Patch panels: {state.get('patch_panels', [])}",
        f"Manual reference: {state.get('manual_reference', 'SEL manual section placeholder')}",
        f"Internal standard: {state.get('engineering_standard_reference', 'TelecomNE engineering standard placeholder')}",
    ]
    return "\n".join(details)


def _priority_from_risk(risk: str | None) -> str:
    return {"critical": "critical", "high": "high", "medium": "normal", "low": "low"}.get((risk or "").lower(), "normal")


def _checklist_type(service_type: str) -> str:
    mapping = {
        "C37.94": "C37_94_service",
        "87L": "87L_service",
        "DTT": "DTT_service",
        "DS1": "DS1_service",
        "DS0": "DS1_service",
        "Ethernet": "Ethernet_service",
        "Ethernet_Pipe": "Ethernet_service",
        "VLAN": "Ethernet_service",
        "VSN": "VSN_service",
        "PTP": "timing_service",
        "IRIG_B": "timing_service",
        "leased_service_migration": "leased_service_migration",
    }
    return mapping.get(service_type, "SEL_ICON_service_turnup")


def _update_checklist_status(session: SessionDep, checklist: CommissioningChecklist) -> None:
    items = session.exec(select(CommissioningChecklistItem).where(CommissioningChecklistItem.checklist_id == checklist.id)).all()
    statuses = {item.status for item in items}
    if statuses and statuses <= {"pass", "not_applicable"}:
        checklist.status = "complete"
        checklist.completed_at = datetime.now(timezone.utc)
    elif "fail" in statuses:
        checklist.status = "failed_test"
    elif any(status in {"pass", "fail", "in_progress"} for status in statuses):
        checklist.status = "in_progress"
    session.add(checklist)


def _required(session: SessionDep, model, item_id: int, label: str):
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return item


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _dump(item) -> dict[str, Any]:
    return item.model_dump(mode="json") if item is not None else {}


def _diff(entity_type: str, entity_id: int | None, field: str, actual: Any, planned: Any, proposed: Any, diff_type: str, severity: str, notes: str) -> dict[str, Any]:
    return {"entity_type": entity_type, "entity_id": entity_id, "field": field, "actual": actual, "planned": planned, "proposed": proposed, "diff_type": diff_type, "severity": severity, "notes": notes}


def _diff_from_model(row: ProposedChangeDiff) -> dict[str, Any]:
    return _diff(row.entity_type, row.entity_id, row.field_name, row.actual_value, row.planned_value, row.proposed_value, row.diff_type, row.severity, row.notes or "")


def _string(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
