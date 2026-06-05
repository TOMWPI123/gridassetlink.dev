from collections import Counter
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep, normalize_role, require_roles
from app.models import (
    Circuit,
    CircuitPath,
    CircuitPathElement,
    Device,
    DevicePort,
    FiberAssignment,
    FiberCable,
    FiberSplice,
    FiberStrand,
    LeasedService,
    PatchPanel,
    PatchPanelPort,
    SpliceClosure,
    SpliceTray,
    WorkOrder,
    WorkOrderAttachment,
    WorkOrderTask,
    WorkOrderUpdate,
)
from app.services.audit import add_audit_log

router = APIRouter(prefix="/api", tags=["workflows"])


@router.get("/circuits/{circuit_id}/trace")
def circuit_trace(circuit_id: int, session: SessionDep, _: CurrentUser) -> dict:
    return _circuit_trace_payload(circuit_id, session)


@router.get("/circuits/{circuit_id}/fiber-path")
def circuit_fiber_path(circuit_id: int, session: SessionDep, _: CurrentUser) -> dict:
    circuit = session.get(Circuit, circuit_id)
    if circuit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Circuit not found")
    assignments = session.exec(select(FiberAssignment).where(FiberAssignment.circuit_id == circuit_id)).all()
    assignment_strand_ids = {item.fiber_strand_id for item in assignments if item.fiber_strand_id is not None}
    direct_strands = session.exec(select(FiberStrand).where(FiberStrand.assigned_circuit_id == circuit_id)).all()
    strand_ids = assignment_strand_ids | {strand.id for strand in direct_strands if strand.id is not None}
    strands = [session.get(FiberStrand, strand_id) for strand_id in strand_ids]
    strands = [strand for strand in strands if strand is not None]
    splices = _splices_for_strands(session, strand_ids)
    patch_port_ids = {item.patch_panel_port_id for item in assignments if item.patch_panel_port_id is not None}
    patch_port_ids |= {strand.a_end_patch_panel_port_id for strand in strands if strand.a_end_patch_panel_port_id is not None}
    patch_port_ids |= {strand.z_end_patch_panel_port_id for strand in strands if strand.z_end_patch_panel_port_id is not None}
    patch_ports = [session.get(PatchPanelPort, port_id) for port_id in patch_port_ids]
    patch_ports = [port for port in patch_ports if port is not None]
    device_port_ids = {item.device_port_id for item in assignments if item.device_port_id is not None}
    device_port_ids |= {strand.assigned_device_port_id for strand in strands if strand.assigned_device_port_id is not None}
    device_ports = [session.get(DevicePort, port_id) for port_id in device_port_ids]
    device_ports = [port for port in device_ports if port is not None]
    warnings = _diversity_warnings(session, circuit_id)
    warnings.extend([f"Strand {strand.strand_number} is {strand.status}" for strand in strands if strand.status in {"faulted", "retired"}])
    return {
        **_circuit_trace_payload(circuit_id, session),
        "fiber_assignments": [_dump(item) for item in assignments],
        "fiber_strands": [_dump(item) for item in strands],
        "fiber_splices": [_dump(item) for item in splices],
        "patch_panel_ports": [_dump(item) for item in patch_ports],
        "device_ports": [_dump(item) for item in device_ports],
        "validation_warnings": sorted(set(warnings)),
    }


@router.post("/fiber-assignments", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("admin", "engineer"))])
def create_fiber_assignment(payload: dict, session: SessionDep, user: CurrentUser) -> dict:
    allow_conflict = bool(payload.pop("allow_conflict", False))
    strand = session.get(FiberStrand, payload.get("fiber_strand_id")) if payload.get("fiber_strand_id") else None
    if strand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fiber strand not found")
    active_statuses = {"assigned", "installed", "tested", "active"}
    conflicting = [
        item
        for item in session.exec(select(FiberAssignment).where(FiberAssignment.fiber_strand_id == strand.id)).all()
        if item.assignment_status in active_statuses and item.circuit_id != payload.get("circuit_id")
    ]
    if conflicting and not (allow_conflict and normalize_role(user.role) == "admin"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fiber strand is already active on another circuit")
    payload.setdefault("assignment_id", f"FA-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{strand.id}")
    payload.setdefault("assignment_status", "planned")
    payload.setdefault("assignment_type", "circuit_transport")
    payload["assigned_by_user_id"] = user.id
    payload.setdefault("assigned_date", date.today())
    assignment = FiberAssignment.model_validate(payload)
    session.add(assignment)
    strand.assigned_circuit_id = assignment.circuit_id or strand.assigned_circuit_id
    strand.assigned_device_port_id = assignment.device_port_id or strand.assigned_device_port_id
    strand.status = _strand_status_for_assignment(assignment.assignment_status)
    session.add(strand)
    if assignment.device_port_id:
        device_port = session.get(DevicePort, assignment.device_port_id)
        if device_port:
            device_port.connected_fiber_strand_id = strand.id
            device_port.connected_circuit_id = assignment.circuit_id or device_port.connected_circuit_id
            device_port.status = "assigned"
            session.add(device_port)
    if assignment.patch_panel_port_id:
        patch_port = session.get(PatchPanelPort, assignment.patch_panel_port_id)
        if patch_port:
            patch_port.connected_fiber_strand_id = strand.id
            patch_port.fiber_strand_id = strand.id
            patch_port.connected_device_port_id = assignment.device_port_id or patch_port.connected_device_port_id
            patch_port.status = "assigned"
            session.add(patch_port)
    add_audit_log(session, user, "create", "fiber_assignments", None, new_value=assignment)
    session.commit()
    session.refresh(assignment)
    warnings = _assignment_warnings(session, assignment, strand)
    return {"assignment": _dump(assignment), "validation_warnings": warnings}


@router.put("/fiber-assignments/{assignment_id}/status", dependencies=[Depends(require_roles("admin", "engineer"))])
def update_fiber_assignment_status(assignment_id: int, payload: dict, session: SessionDep, user: CurrentUser) -> dict:
    assignment = session.get(FiberAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fiber assignment not found")
    old_value = assignment.model_dump(mode="json")
    assignment.assignment_status = payload.get("assignment_status", assignment.assignment_status)
    if assignment.assignment_status == "released":
        assignment.released_date = date.today()
    session.add(assignment)
    if assignment.fiber_strand_id:
        strand = session.get(FiberStrand, assignment.fiber_strand_id)
        if strand:
            strand.status = _strand_status_for_assignment(assignment.assignment_status)
            session.add(strand)
    add_audit_log(session, user, "update_assignment_status", "fiber_assignments", assignment_id, old_value, assignment)
    session.commit()
    session.refresh(assignment)
    return _dump(assignment)


@router.get("/fiber-cables/{fiber_cable_id}/strand-assignments")
def fiber_cable_strand_assignments(fiber_cable_id: int, session: SessionDep, _: CurrentUser) -> dict:
    cable = _required(session, FiberCable, fiber_cable_id, "Fiber cable")
    strands = session.exec(select(FiberStrand).where(FiberStrand.fiber_cable_id == fiber_cable_id).order_by(FiberStrand.strand_number)).all()
    strand_ids = {strand.id for strand in strands if strand.id is not None}
    assignments = session.exec(select(FiberAssignment).where(FiberAssignment.fiber_strand_id.in_(strand_ids))).all() if strand_ids else []
    status_counts = Counter(strand.status for strand in strands)
    warnings = [f"Strand {strand.strand_number} is assigned to a {strand.status} state" for strand in strands if strand.status in {"faulted", "retired", "damaged"} and strand.assigned_circuit_id]
    return {"fiber_cable": _dump(cable), "strands": [_dump(item) for item in strands], "assignments": [_dump(item) for item in assignments], "summary": dict(status_counts), "validation_warnings": warnings}


@router.get("/fiber-cables/{fiber_cable_id}/splice-map")
def fiber_cable_splice_map(fiber_cable_id: int, session: SessionDep, _: CurrentUser) -> dict:
    cable = _required(session, FiberCable, fiber_cable_id, "Fiber cable")
    splices = session.exec(
        select(FiberSplice).where(
            (FiberSplice.incoming_fiber_cable_id == fiber_cable_id)
            | (FiberSplice.outgoing_fiber_cable_id == fiber_cable_id)
            | (FiberSplice.incoming_cable_id == fiber_cable_id)
            | (FiberSplice.outgoing_cable_id == fiber_cable_id)
        )
    ).all()
    closure_ids = {splice.splice_closure_id for splice in splices if splice.splice_closure_id is not None}
    tray_ids = {splice.splice_tray_id for splice in splices if splice.splice_tray_id is not None}
    closures = [session.get(SpliceClosure, item_id) for item_id in closure_ids]
    trays = [session.get(SpliceTray, item_id) for item_id in tray_ids]
    return {"fiber_cable": _dump(cable), "splices": [_dump(item) for item in splices], "splice_closures": [_dump(item) for item in closures if item], "splice_trays": [_dump(item) for item in trays if item]}


@router.get("/splice-closures/{splice_closure_id}/trays")
def splice_closure_trays(splice_closure_id: int, session: SessionDep, _: CurrentUser) -> dict:
    closure = _required(session, SpliceClosure, splice_closure_id, "Splice closure")
    trays = session.exec(select(SpliceTray).where(SpliceTray.splice_closure_id == splice_closure_id).order_by(SpliceTray.tray_number)).all()
    return {"splice_closure": _dump(closure), "splice_trays": [_dump(item) for item in trays]}


@router.get("/splice-closures/{splice_closure_id}/splices")
def splice_closure_splices(splice_closure_id: int, session: SessionDep, _: CurrentUser) -> dict:
    closure = _required(session, SpliceClosure, splice_closure_id, "Splice closure")
    splices = session.exec(select(FiberSplice).where(FiberSplice.splice_closure_id == splice_closure_id).order_by(FiberSplice.tray_position)).all()
    trays = session.exec(select(SpliceTray).where(SpliceTray.splice_closure_id == splice_closure_id).order_by(SpliceTray.tray_number)).all()
    cable_ids = {splice.incoming_fiber_cable_id or splice.incoming_cable_id for splice in splices if splice.incoming_fiber_cable_id or splice.incoming_cable_id}
    cable_ids |= {splice.outgoing_fiber_cable_id or splice.outgoing_cable_id for splice in splices if splice.outgoing_fiber_cable_id or splice.outgoing_cable_id}
    cables = [session.get(FiberCable, item_id) for item_id in cable_ids]
    circuit_ids = _circuits_through_closure(session, splice_closure_id)
    circuits = [session.get(Circuit, item_id) for item_id in circuit_ids]
    warnings = []
    if any(splice.status in {"planned", "incomplete"} for splice in splices):
        warnings.append("Splice closure has incomplete splice records")
    return {"splice_closure": _dump(closure), "splice_trays": [_dump(item) for item in trays], "splices": [_dump(item) for item in splices], "fiber_cables": [_dump(item) for item in cables if item], "circuits": [_dump(item) for item in circuits if item], "validation_warnings": warnings}


@router.get("/patch-panels/{patch_panel_id}/port-map")
def patch_panel_port_map(patch_panel_id: int, session: SessionDep, _: CurrentUser) -> dict:
    panel = _required(session, PatchPanel, patch_panel_id, "Patch panel")
    ports = session.exec(select(PatchPanelPort).where(PatchPanelPort.patch_panel_id == patch_panel_id).order_by(PatchPanelPort.port_number)).all()
    assignments = session.exec(select(FiberAssignment).where(FiberAssignment.patch_panel_port_id.in_({port.id for port in ports if port.id is not None}))).all() if ports else []
    strand_ids = {port.connected_fiber_strand_id or port.fiber_strand_id for port in ports if port.connected_fiber_strand_id or port.fiber_strand_id}
    strands = [session.get(FiberStrand, item_id) for item_id in strand_ids]
    device_port_ids = {port.connected_device_port_id for port in ports if port.connected_device_port_id is not None}
    device_ports = [session.get(DevicePort, item_id) for item_id in device_port_ids]
    warnings = [f"Patch panel port {port.port_number} has no connected device port" for port in ports if (port.connected_fiber_strand_id or port.fiber_strand_id) and not port.connected_device_port_id]
    return {"patch_panel": _dump(panel), "ports": [_dump(item) for item in ports], "fiber_strands": [_dump(item) for item in strands if item], "device_ports": [_dump(item) for item in device_ports if item], "assignments": [_dump(item) for item in assignments], "validation_warnings": warnings}


@router.get("/devices/{device_id}/fiber-connectivity")
def device_fiber_connectivity(device_id: int, session: SessionDep, _: CurrentUser) -> dict:
    device = _required(session, Device, device_id, "Device")
    ports = session.exec(select(DevicePort).where(DevicePort.device_id == device_id).order_by(DevicePort.port_name)).all()
    assignments = session.exec(select(FiberAssignment).where((FiberAssignment.device_id == device_id) | (FiberAssignment.device_port_id.in_({port.id for port in ports if port.id is not None})))).all() if ports else []
    strand_ids = {port.connected_fiber_strand_id for port in ports if port.connected_fiber_strand_id is not None}
    strand_ids |= {item.fiber_strand_id for item in assignments if item.fiber_strand_id is not None}
    strands = [session.get(FiberStrand, item_id) for item_id in strand_ids]
    patch_port_ids = {port.connected_patch_panel_port_id for port in ports if port.connected_patch_panel_port_id is not None}
    patch_port_ids |= {item.patch_panel_port_id for item in assignments if item.patch_panel_port_id is not None}
    patch_ports = [session.get(PatchPanelPort, item_id) for item_id in patch_port_ids]
    warnings = [f"Device port {port.port_name} has no patch panel or fiber mapping" for port in ports if port.port_type in {"fiber", "C37.94"} and not (port.connected_patch_panel_port_id or port.connected_fiber_strand_id)]
    return {"device": _dump(device), "device_ports": [_dump(item) for item in ports], "fiber_assignments": [_dump(item) for item in assignments], "fiber_strands": [_dump(item) for item in strands if item], "patch_panel_ports": [_dump(item) for item in patch_ports if item], "validation_warnings": warnings}


@router.get("/work-orders/{work_order_id}/fiber-tasks")
def work_order_fiber_tasks(work_order_id: int, session: SessionDep, _: CurrentUser) -> dict:
    order = _required(session, WorkOrder, work_order_id, "Work order")
    assignments = session.exec(select(FiberAssignment).where(FiberAssignment.work_order_id == work_order_id)).all()
    tasks = session.exec(select(WorkOrderTask).where(WorkOrderTask.work_order_id == work_order_id).order_by(WorkOrderTask.task_number)).all()
    fiber_tasks = [task for task in tasks if task.fiber_assignment_id or task.fiber_strand_id or task.fiber_splice_id or task.patch_panel_port_id or "fiber" in task.task_title.lower() or "splice" in task.task_title.lower() or "test" in task.task_title.lower()]
    warnings = []
    if order.status in {"field_complete", "engineering_review", "closed"} and any(task.photo_required and not task.test_uploaded for task in fiber_tasks):
        warnings.append("Work order is closing before required fiber tests/photos are uploaded")
    return {"work_order": _dump(order), "fiber_assignments": [_dump(item) for item in assignments], "fiber_tasks": [_dump(item) for item in fiber_tasks], "validation_warnings": warnings}


@router.get("/fiber-cables/{fiber_cable_id}/impact")
def fiber_cable_impact(fiber_cable_id: int, session: SessionDep, _: CurrentUser) -> dict:
    return _impact_for_element(session, "fiber_cable", fiber_cable_id)


@router.get("/splice-closures/{splice_closure_id}/impact")
def splice_closure_impact(splice_closure_id: int, session: SessionDep, _: CurrentUser) -> dict:
    return _impact_for_element(session, "splice_closure", splice_closure_id)


@router.get("/providers/{provider_id}/leased-services")
def provider_leased_services(provider_id: int, session: SessionDep, _: CurrentUser) -> list[dict]:
    return [service.model_dump(mode="json") for service in session.exec(select(LeasedService).where(LeasedService.provider_id == provider_id)).all()]


@router.get("/work-orders/my")
def my_work_orders(session: SessionDep, user: CurrentUser) -> list[dict]:
    role = normalize_role(user.role)
    if role == "field_tech":
        statement = select(WorkOrder).where(WorkOrder.assigned_field_tech_id == user.id)
    elif role == "engineer":
        statement = select(WorkOrder).where(WorkOrder.assigned_engineer_id == user.id)
    else:
        statement = select(WorkOrder)
    return [item.model_dump(mode="json") for item in session.exec(statement).all()]


@router.post("/work-orders/{work_order_id}/closeout", dependencies=[Depends(require_roles("admin", "engineer", "field_tech"))])
def closeout_work_order(work_order_id: int, payload: dict, session: SessionDep, user: CurrentUser) -> dict:
    work_order = session.get(WorkOrder, work_order_id)
    if work_order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    if normalize_role(user.role) == "field_tech" and work_order.assigned_field_tech_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Work order is not assigned to you")
    old_value = work_order.model_dump(mode="json")
    work_order.status = payload.get("status") or "field_complete"
    work_order.closeout_summary = payload.get("closeout_summary") or payload.get("notes")
    if work_order.status in {"field_complete", "engineering_review", "closed"}:
        work_order.actual_finish = datetime.now(timezone.utc)
    session.add(work_order)
    session.add(WorkOrderUpdate(work_order_id=work_order.id, user_id=user.id, update_type="closeout", update_text=work_order.closeout_summary or "Field closeout submitted"))
    for item in payload.get("attachments", []) or []:
        session.add(WorkOrderAttachment(work_order_id=work_order.id, uploaded_by_user_id=user.id, filename=item.get("filename", "field-closeout.txt"), file_url=item.get("file_url", "/uploads/stubbed-field-closeout.txt"), attachment_type=item.get("attachment_type", "photo"), notes=item.get("notes")))
    add_audit_log(session, user, "closeout", "work_orders", work_order_id, old_value, work_order)
    session.commit()
    session.refresh(work_order)
    return work_order.model_dump(mode="json")


@router.put("/work-order-tasks/{task_id}/status", dependencies=[Depends(require_roles("admin", "engineer", "field_tech"))])
def update_task_status(task_id: int, payload: dict, session: SessionDep, user: CurrentUser) -> dict:
    task = session.get(WorkOrderTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    old_value = task.model_dump(mode="json")
    task.status = payload.get("status", task.status)
    task.notes = payload.get("notes", task.notes)
    if task.status in {"complete", "completed", "done"}:
        task.completed_at = datetime.now(timezone.utc)
    session.add(task)
    add_audit_log(session, user, "update_task_status", "work_order_tasks", task_id, old_value, task)
    session.commit()
    session.refresh(task)
    return task.model_dump(mode="json")


def _dump(item) -> dict:
    return item.model_dump(mode="json")


def _required(session: SessionDep, model, item_id: int, label: str):
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return item


def _circuit_trace_payload(circuit_id: int, session: SessionDep) -> dict:
    circuit = session.get(Circuit, circuit_id)
    if circuit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Circuit not found")
    paths = session.exec(select(CircuitPath).where(CircuitPath.circuit_id == circuit_id)).all()
    response_paths = []
    for path in paths:
        elements = session.exec(select(CircuitPathElement).where(CircuitPathElement.circuit_path_id == path.id).order_by(CircuitPathElement.sequence_number)).all()
        response_paths.append({**path.model_dump(mode="json"), "elements": [element.model_dump(mode="json") for element in elements]})
    return {"circuit": circuit.model_dump(mode="json"), "paths": response_paths}


def _strand_status_for_assignment(assignment_status: str) -> str:
    if assignment_status in {"planned", "reserved"}:
        return "reserved"
    if assignment_status in {"released"}:
        return "available"
    if assignment_status in {"retired"}:
        return "retired"
    return "assigned"


def _assignment_warnings(session: SessionDep, assignment: FiberAssignment, strand: FiberStrand) -> list[str]:
    warnings: list[str] = []
    if strand.status in {"faulted", "retired"}:
        warnings.append(f"Assigned strand is {strand.status}")
    if assignment.circuit_id:
        warnings.extend(_diversity_warnings(session, assignment.circuit_id))
    if assignment.device_port_id:
        device_port = session.get(DevicePort, assignment.device_port_id)
        if device_port and not (device_port.connected_patch_panel_port_id or assignment.patch_panel_port_id):
            warnings.append("Device port has no patch panel mapping")
    return sorted(set(warnings))


def _path_elements_by_role(session: SessionDep, circuit_id: int, element_type: str) -> dict[str, set[int]]:
    by_role: dict[str, set[int]] = {}
    paths = session.exec(select(CircuitPath).where(CircuitPath.circuit_id == circuit_id)).all()
    for path in paths:
        elements = session.exec(select(CircuitPathElement).where(CircuitPathElement.circuit_path_id == path.id, CircuitPathElement.element_type == element_type)).all()
        by_role.setdefault(path.path_role, set()).update(element.element_id for element in elements if element.element_id is not None)
    return by_role


def _diversity_warnings(session: SessionDep, circuit_id: int) -> list[str]:
    warnings: list[str] = []
    for element_type, label in [("fiber_cable", "fiber cable"), ("splice_closure", "splice closure")]:
        by_role = _path_elements_by_role(session, circuit_id, element_type)
        primary = set().union(*(ids for role, ids in by_role.items() if role == "primary"))
        backups = set().union(*(ids for role, ids in by_role.items() if "backup" in role or role in {"secondary", "diverse"}))
        if primary & backups:
            warnings.append(f"Primary and backup paths use the same {label}")
    return warnings


def _splices_for_strands(session: SessionDep, strand_ids: set[int | None]) -> list[FiberSplice]:
    ids = {item_id for item_id in strand_ids if item_id is not None}
    if not ids:
        return []
    return session.exec(select(FiberSplice).where((FiberSplice.incoming_strand_id.in_(ids)) | (FiberSplice.outgoing_strand_id.in_(ids)))).all()


def _circuits_through_closure(session: SessionDep, splice_closure_id: int) -> set[int]:
    elements = session.exec(select(CircuitPathElement).where(CircuitPathElement.element_type == "splice_closure", CircuitPathElement.element_id == splice_closure_id)).all()
    path_ids = {element.circuit_path_id for element in elements}
    paths = [path for path in session.exec(select(CircuitPath)).all() if path.id in path_ids]
    circuit_ids = {path.circuit_id for path in paths if path.circuit_id is not None}
    splices = session.exec(select(FiberSplice).where(FiberSplice.splice_closure_id == splice_closure_id)).all()
    strand_ids = {splice.incoming_strand_id for splice in splices if splice.incoming_strand_id is not None}
    strand_ids |= {splice.outgoing_strand_id for splice in splices if splice.outgoing_strand_id is not None}
    if strand_ids:
        assignments = session.exec(select(FiberAssignment).where(FiberAssignment.fiber_strand_id.in_(strand_ids))).all()
        circuit_ids |= {assignment.circuit_id for assignment in assignments if assignment.circuit_id is not None}
    return circuit_ids


def _impact_for_element(session: SessionDep, element_type: str, element_id: int) -> dict:
    elements = session.exec(select(CircuitPathElement).where(CircuitPathElement.element_type == element_type, CircuitPathElement.element_id == element_id)).all()
    path_ids = {element.circuit_path_id for element in elements}
    paths = [path for path in session.exec(select(CircuitPath)).all() if path.id in path_ids]
    circuit_ids = {path.circuit_id for path in paths}
    circuits = [session.get(Circuit, circuit_id) for circuit_id in circuit_ids if circuit_id is not None]
    circuits = [circuit for circuit in circuits if circuit is not None]
    orders = session.exec(select(WorkOrder)).all()
    return {
        "element_type": element_type,
        "element_id": element_id,
        "affected_circuits": [circuit.model_dump(mode="json") for circuit in circuits],
        "affected_work_orders": [order.model_dump(mode="json") for order in orders if order.circuit_id in circuit_ids or getattr(order, "fiber_cable_id", None) == element_id],
        "affected_path_elements": [element.model_dump(mode="json") for element in elements],
        "summary": {"circuit_count": len(circuits), "work_order_count": len([order for order in orders if order.circuit_id in circuit_ids])},
    }
