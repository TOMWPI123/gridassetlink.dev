from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep
from app.models import (
    Circuit,
    CircuitPath,
    Device,
    DevicePort,
    FiberAssignment,
    FiberCable,
    FiberStrand,
    IconNode,
    LeasedService,
    PatchPanel,
    PatchPanelPort,
    ProposedChange,
    SpliceClosure,
    Substation,
    TransmissionLine,
    WorkOrder,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(session: SessionDep, _: CurrentUser) -> dict:
    circuits = session.exec(select(Circuit)).all()
    paths = session.exec(select(CircuitPath)).all()
    strands = session.exec(select(FiberStrand)).all()
    work_orders = session.exec(select(WorkOrder)).all()
    leased = session.exec(select(LeasedService)).all()
    device_ports = session.exec(select(DevicePort)).all()
    patch_ports = session.exec(select(PatchPanelPort)).all()
    cables = session.exec(select(FiberCable)).all()
    today = date.today()
    backup_ids = {path.circuit_id for path in paths if path.path_role in {"backup", "diverse_backup"}}
    renewal_threshold = today + timedelta(days=180)
    metrics = [
        {"label": "Total substations", "value": len(session.exec(select(Substation)).all())},
        {"label": "Total SEL ICON nodes", "value": len(session.exec(select(IconNode)).all())},
        {"label": "Total transmission lines", "value": len(session.exec(select(TransmissionLine)).all())},
        {"label": "Total OPGW cables", "value": len([c for c in cables if c.cable_type == "OPGW"])},
        {"label": "Total distribution fiber cables", "value": len([c for c in cables if "distribution" in c.cable_type])},
        {"label": "Total fiber strands", "value": len(strands)},
        {"label": "Available dark strands", "value": len([s for s in strands if s.status in {"available", "dark"}])},
        {"label": "Assigned strands", "value": len([s for s in strands if s.status == "assigned"])},
        {"label": "Faulted strands", "value": len([s for s in strands if s.status == "faulted"])},
        {"label": "Total circuits", "value": len(circuits)},
        {"label": "Private fiber circuits", "value": len([c for c in circuits if c.ownership_type == "private_fiber"])},
        {"label": "Leased service circuits", "value": len([c for c in circuits if c.ownership_type == "leased_service"])},
        {"label": "Monthly leased service cost", "value": round(sum(s.monthly_cost or 0 for s in leased), 2), "prefix": "$"},
        {"label": "Critical protection circuits", "value": len([c for c in circuits if c.criticality == "critical"])},
        {"label": "Circuits without backup path", "value": len([c for c in circuits if c.id not in backup_ids])},
        {"label": "Circuits pending installation", "value": len([c for c in circuits if c.status in {"ordered", "installing"}])},
        {"label": "Circuits pending testing", "value": len([c for c in circuits if c.status == "testing"])},
        {"label": "Open work orders", "value": len([w for w in work_orders if w.status not in {"closed", "cancelled"}])},
        {"label": "Overdue work orders", "value": len([w for w in work_orders if w.planned_finish and w.planned_finish.date() < today and w.status not in {"closed", "cancelled"}])},
        {"label": "Work orders waiting on provider", "value": len([w for w in work_orders if w.status == "waiting_on_provider"])},
        {"label": "Work orders waiting on material", "value": len([w for w in work_orders if w.status == "waiting_on_material"])},
        {"label": "Leased services nearing renewal", "value": len([s for s in leased if s.contract_end and today <= s.contract_end <= renewal_threshold])},
        {"label": "Devices missing fiber mapping", "value": len([p for p in device_ports if p.port_type == "fiber" and not p.connected_fiber_strand_id])},
        {"label": "Patch panel ports unassigned", "value": len([p for p in patch_ports if p.status == "available"])},
        {"label": "Splice closures carrying critical circuits", "value": len(session.exec(select(SpliceClosure)).all())},
    ]
    alerts = [
        {"severity": "high" if c.criticality == "critical" else "medium", "title": "Circuit missing backup path", "entity": c.circuit_id, "detail": c.status}
        for c in circuits
        if c.id not in backup_ids
    ]
    alerts += [
        {"severity": "medium", "title": "Leased service nearing renewal", "entity": s.provider_circuit_id, "detail": str(s.contract_end)}
        for s in leased
        if s.contract_end and today <= s.contract_end <= renewal_threshold
    ]
    return {
        "metrics": metrics,
        "alerts": alerts[:20],
        "recent_work_orders": [w.model_dump(mode="json") for w in sorted(work_orders, key=lambda item: item.created_at, reverse=True)[:8]],
        "circuits_by_status": _bucket(circuits, "status"),
        "fiber_strand_utilization": _bucket(strands, "status"),
        "leased_service_cost_summary": [{"provider_id": s.provider_id, "service": s.provider_circuit_id, "monthly_cost": s.monthly_cost or 0} for s in leased],
    }


@router.get("/map")
def dashboard_map(_: CurrentUser, session: SessionDep) -> dict[str, Any]:
    substations = session.exec(select(Substation).order_by(Substation.substation_code)).all()
    devices = session.exec(select(Device).order_by(Device.device_name)).all()
    ports = session.exec(select(DevicePort).order_by(DevicePort.port_name)).all()
    circuits = session.exec(select(Circuit).order_by(Circuit.circuit_id)).all()
    work_orders = session.exec(select(WorkOrder).order_by(WorkOrder.created_at.desc())).all()
    fiber_cables = session.exec(select(FiberCable).order_by(FiberCable.cable_id)).all()
    fiber_assignments = session.exec(select(FiberAssignment)).all()
    leased_services = session.exec(select(LeasedService)).all()
    splice_closures = session.exec(select(SpliceClosure)).all()
    patch_panels = session.exec(select(PatchPanel)).all()
    proposed_changes = session.exec(select(ProposedChange)).all()
    substation_by_id = {item.id: item for item in substations if item.id is not None}
    ports_by_device = _group_by(ports, "device_id")
    circuits_by_device = _circuits_by_device(circuits)
    fiber_assignments_by_device = _group_by(fiber_assignments, "device_id")
    work_orders_by_device = _group_by(work_orders, "device_id")
    work_orders_by_substation = _group_by(work_orders, "substation_id")
    circuits_by_substation = _circuits_by_substation(circuits)
    fiber_by_substation = _fiber_by_substation(fiber_cables)
    device_rows = [_device_link(device, substation_by_id.get(device.substation_id), ports_by_device, circuits_by_device, fiber_assignments_by_device, work_orders_by_device) for device in devices]
    substation_rows = [_substation_link(substation, devices, circuits_by_substation, fiber_by_substation, patch_panels, splice_closures, work_orders_by_substation) for substation in substations]
    circuit_rows = [_circuit_link(circuit, substation_by_id, devices, fiber_assignments, work_orders, leased_services) for circuit in circuits]
    work_order_rows = [_work_order_link(order, substation_by_id) for order in work_orders]
    annotations = _dashboard_annotations(substation_rows, device_rows, circuit_rows, work_order_rows)
    missing_locations = [row for row in device_rows if not row.get("has_location")]
    return {
        "map": {
            "title": "New England Geographic Transmission Map Through 2035",
            "source_name": "ISO New England public Maps and Diagrams",
            "official_pdf_url": "https://www.iso-ne.com/static-assets/documents/2020/04/new-england-geographic-diagram-transmission-planning.pdf",
            "local_pdf_url": "/maps/iso-ne-transmission-planning.pdf",
            "source_page_url": "https://www.iso-ne.com/about/key-stats/maps-and-diagrams",
            "disclaimer": "ISO-NE map is a public planning reference diagram. GridAssetLink dashboard links this public reference view to internal/synthetic planning records. Not for switching, dispatch, protection, restoration, SCADA operations, telecom routing, or CEII-restricted analysis.",
        },
        "counts": get_dashboard_counts(devices, circuits, work_orders, fiber_cables, fiber_assignments, leased_services, splice_closures, patch_panels, proposed_changes, missing_locations),
        "devices": device_rows,
        "substations": substation_rows,
        "circuits": circuit_rows,
        "work_orders": work_order_rows,
        "annotations": annotations,
        "missing_map_locations": missing_locations[:24],
        "search_index": _search_index(device_rows, substation_rows, circuit_rows, work_order_rows, fiber_cables, fiber_assignments, leased_services, splice_closures, patch_panels),
        "layer_defaults": ["iso_ne_public_map", "device_markers", "substation_markers", "fiber_circuit_annotations", "work_order_markers", "proposed_changes"],
    }


def get_dashboard_counts(
    devices: list[Device],
    circuits: list[Circuit],
    work_orders: list[WorkOrder],
    fiber_cables: list[FiberCable],
    fiber_assignments: list[FiberAssignment],
    leased_services: list[LeasedService],
    splice_closures: list[SpliceClosure],
    patch_panels: list[PatchPanel],
    proposed_changes: list[ProposedChange],
    missing_locations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {"label": "Total devices", "value": len(devices), "key": "total_devices"},
        {"label": "Devices in service", "value": len([item for item in devices if item.status in {"active", "in_service", "up"}]), "key": "devices_in_service"},
        {"label": "Devices planned", "value": len([item for item in devices if item.status == "planned"]), "key": "devices_planned"},
        {"label": "Devices proposed", "value": len([item for item in devices if item.status == "proposed"]), "key": "devices_proposed"},
        {"label": "Open work orders", "value": len([item for item in work_orders if item.status not in {"closed", "cancelled"}]), "key": "open_work_orders"},
        {"label": "Circuits", "value": len(circuits), "key": "circuits"},
        {"label": "Leased services", "value": len(leased_services), "key": "leased_services"},
        {"label": "OPGW fiber cables", "value": len([item for item in fiber_cables if item.cable_type == "OPGW"]), "key": "opgw_fiber_cables"},
        {"label": "Distribution fiber cables", "value": len([item for item in fiber_cables if "distribution" in (item.cable_type or "").lower()]), "key": "distribution_fiber_cables"},
        {"label": "Fiber assignments", "value": len(fiber_assignments), "key": "fiber_assignments"},
        {"label": "Splice closures", "value": len(splice_closures), "key": "splice_closures"},
        {"label": "Patch panels", "value": len(patch_panels), "key": "patch_panels"},
        {"label": "Devices missing location/substation mapping", "value": len(missing_locations), "key": "missing_map_location"},
        {"label": "Circuits missing endpoint mapping", "value": len([item for item in circuits if not item.a_end_site_id or not item.z_end_site_id]), "key": "circuits_missing_endpoint_mapping"},
        {"label": "Devices with proposed changes", "value": len({item.target_entity_id for item in proposed_changes if item.target_entity_type == "device" and item.target_entity_id}), "key": "devices_with_proposed_changes"},
    ]


def _bucket(items: list, attr: str) -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for item in items:
        key = str(getattr(item, attr) or "unknown")
        counts[key] = counts.get(key, 0) + 1
    return [{"label": key, "value": value} for key, value in sorted(counts.items())]


def _device_link(
    device: Device,
    substation: Substation | None,
    ports_by_device: dict[int, list[DevicePort]],
    circuits_by_device: dict[int, list[Circuit]],
    fiber_assignments_by_device: dict[int, list[FiberAssignment]],
    work_orders_by_device: dict[int, list[WorkOrder]],
) -> dict[str, Any]:
    location = _safe_substation_location(substation)
    return {
        "id": str(device.id),
        "label": device.device_name,
        "category": "device",
        "device_name": device.device_name,
        "device_type": device.device_type,
        "vendor": device.manufacturer,
        "model": device.model,
        "status": device.status,
        "criticality": device.criticality,
        "substation_id": device.substation_id,
        "substation": substation.substation_code if substation else None,
        "region": substation.region if substation else None,
        "state": _state_from_region(substation.region if substation else None),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "has_location": bool(location),
        "relatedCircuitIds": [str(item.id) for item in circuits_by_device.get(device.id or -1, [])],
        "relatedPortIds": [str(item.id) for item in ports_by_device.get(device.id or -1, [])],
        "relatedFiberAssignmentIds": [str(item.id) for item in fiber_assignments_by_device.get(device.id or -1, [])],
        "relatedWorkOrderIds": [str(item.id) for item in work_orders_by_device.get(device.id or -1, [])],
        "links": _links("device", device.id),
    }


def _substation_link(
    substation: Substation,
    devices: list[Device],
    circuits_by_substation: dict[int, list[Circuit]],
    fiber_by_substation: dict[int, list[FiberCable]],
    patch_panels: list[PatchPanel],
    splice_closures: list[SpliceClosure],
    work_orders_by_substation: dict[int, list[WorkOrder]],
) -> dict[str, Any]:
    related_devices = [item for item in devices if item.substation_id == substation.id]
    location = _safe_substation_location(substation)
    return {
        "id": str(substation.id),
        "label": substation.substation_code,
        "category": "substation",
        "substation_code": substation.substation_code,
        "name": substation.name,
        "region": substation.region,
        "state": _state_from_region(substation.region),
        "voltage_level": substation.voltage_level,
        "status": substation.status,
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "device_count": len(related_devices),
        "devices": [item.device_name for item in related_devices[:8]],
        "circuit_count": len(circuits_by_substation.get(substation.id or -1, [])),
        "fiber_cable_count": len(fiber_by_substation.get(substation.id or -1, [])),
        "patch_panel_count": len([item for item in patch_panels if item.substation_id == substation.id]),
        "splice_closure_count": len([item for item in splice_closures if item.substation_id == substation.id]),
        "work_order_count": len(work_orders_by_substation.get(substation.id or -1, [])),
        "links": _links("substation", substation.id),
    }


def _circuit_link(circuit: Circuit, substation_by_id: dict[int, Substation], devices: list[Device], fiber_assignments: list[FiberAssignment], work_orders: list[WorkOrder], leased_services: list[LeasedService]) -> dict[str, Any]:
    a_sub = substation_by_id.get(circuit.a_end_site_id)
    z_sub = substation_by_id.get(circuit.z_end_site_id)
    a_device = next((item for item in devices if item.id == circuit.a_end_device_id), None)
    z_device = next((item for item in devices if item.id == circuit.z_end_device_id), None)
    return {
        "id": str(circuit.id),
        "label": circuit.circuit_id,
        "category": "circuit",
        "circuit_id": circuit.circuit_id,
        "circuit_name": circuit.circuit_name,
        "service_type": circuit.service_type,
        "transport_type": circuit.transport_type,
        "ownership_type": circuit.ownership_type,
        "status": circuit.status,
        "criticality": circuit.criticality,
        "a_end_site": a_sub.substation_code if a_sub else None,
        "z_end_site": z_sub.substation_code if z_sub else None,
        "a_end_device": a_device.device_name if a_device else None,
        "z_end_device": z_device.device_name if z_device else None,
        "fiber_assignment_count": len([item for item in fiber_assignments if item.circuit_id == circuit.id]),
        "work_order_count": len([item for item in work_orders if item.circuit_id == circuit.id]),
        "leased_provider": next((item.provider_circuit_id for item in leased_services if item.circuit_id == circuit.id), None),
        "links": _links("circuit", circuit.id),
    }


def _work_order_link(order: WorkOrder, substation_by_id: dict[int, Substation]) -> dict[str, Any]:
    substation = substation_by_id.get(order.substation_id)
    return {
        "id": str(order.id),
        "label": order.work_order_number,
        "category": "work_order",
        "work_order_number": order.work_order_number,
        "title": order.title,
        "work_type": order.work_type,
        "priority": order.priority,
        "status": order.status,
        "substation": substation.substation_code if substation else None,
        "planned_finish": order.planned_finish.isoformat() if order.planned_finish else None,
        "device_id": order.device_id,
        "circuit_id": order.circuit_id,
        "fiber_cable_id": order.fiber_cable_id,
        "links": _links("work_order", order.id),
    }


def _dashboard_annotations(substations: list[dict[str, Any]], devices: list[dict[str, Any]], circuits: list[dict[str, Any]], work_orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    annotations: list[dict[str, Any]] = []
    for index, substation in enumerate([item for item in substations if item.get("latitude") and item.get("longitude")][:18]):
        annotations.append(_annotation(f"substation-{substation['id']}", substation["label"], "substation", "substation", substation["id"], substation.get("status"), 16 + (index % 6) * 11, 19 + (index // 6) * 18))
    for index, device in enumerate([item for item in devices if item.get("has_location")][:18]):
        annotations.append(_annotation(f"device-{device['id']}", device["label"], "device", "device", device["id"], device.get("status"), 20 + (index % 6) * 10, 30 + (index // 6) * 15))
    for index, circuit in enumerate(circuits[:14]):
        annotations.append(_annotation(f"circuit-{circuit['id']}", circuit["label"], "circuit", "circuit", circuit["id"], circuit.get("status"), 18 + (index % 7) * 10, 66 + (index // 7) * 9))
    for index, order in enumerate([item for item in work_orders if item.get("status") not in {"closed", "cancelled"}][:10]):
        annotations.append(_annotation(f"work-order-{order['id']}", order["label"], "work_order", "work_order", order["id"], order.get("status"), 68 + (index % 3) * 8, 25 + (index // 3) * 12))
    return annotations


def _annotation(id_: str, label: str, category: str, entity_type: str, entity_id: str, status: str | None, x: int, y: int) -> dict[str, Any]:
    return {"id": id_, "label": label, "category": category, "xPercent": x, "yPercent": y, "linkedEntityType": entity_type, "linkedEntityId": entity_id, "status": status or "unknown"}


def _search_index(devices: list[dict[str, Any]], substations: list[dict[str, Any]], circuits: list[dict[str, Any]], work_orders: list[dict[str, Any]], fiber_cables: list[FiberCable], fiber_assignments: list[FiberAssignment], leased_services: list[LeasedService], splice_closures: list[SpliceClosure], patch_panels: list[PatchPanel]) -> list[dict[str, Any]]:
    rows = [{"id": item["id"], "label": item["label"], "category": item["category"], "summary": item.get("device_type") or item.get("name") or item.get("service_type") or item.get("title"), "route": item["links"][0]["href"]} for item in [*devices, *substations, *circuits, *work_orders]]
    rows += [{"id": str(item.id), "label": item.cable_id, "category": "fiber", "summary": item.cable_type, "route": f"/fiber-cables/{item.id}"} for item in fiber_cables]
    rows += [{"id": str(item.id), "label": item.assignment_id, "category": "fiber_assignment", "summary": item.assignment_type, "route": "/fiber-assignments"} for item in fiber_assignments]
    rows += [{"id": str(item.id), "label": item.provider_circuit_id, "category": "leased_service", "summary": item.service_type, "route": f"/leased-services/{item.id}"} for item in leased_services]
    rows += [{"id": str(item.id), "label": item.closure_id, "category": "splice_closure", "summary": item.closure_type, "route": f"/splice-closures/{item.id}"} for item in splice_closures]
    rows += [{"id": str(item.id), "label": item.panel_id, "category": "patch_panel", "summary": item.panel_name, "route": f"/patch-panels/{item.id}"} for item in patch_panels]
    return rows


def _links(entity_type: str, entity_id: int | None) -> list[dict[str, str]]:
    if entity_id is None:
        return []
    entity = str(entity_id)
    base = {
        "device": [{"label": "Device page", "href": f"/devices/{entity}"}, {"label": "Device ports", "href": f"/device-ports?deviceId={entity}"}, {"label": "Circuits", "href": f"/circuits?deviceId={entity}"}, {"label": "Fiber assignments", "href": f"/fiber-assignments?deviceId={entity}"}, {"label": "Work orders", "href": f"/work-orders?assetId={entity}"}, {"label": "Commissioning", "href": "/deviceops/commissioning"}],
        "substation": [{"label": "Substation page", "href": f"/substations/{entity}"}, {"label": "RegionalGrid", "href": "/regional-grid"}, {"label": "Devices", "href": f"/devices?substationId={entity}"}, {"label": "Work orders", "href": f"/work-orders?substationId={entity}"}],
        "circuit": [{"label": "Circuit page", "href": f"/circuits/{entity}"}, {"label": "Fiber trace", "href": f"/fiber-trace?circuitId={entity}"}, {"label": "Outage impact", "href": f"/outage-impact?circuitId={entity}"}, {"label": "Work orders", "href": f"/work-orders?circuitId={entity}"}],
        "work_order": [{"label": "Work order page", "href": f"/work-orders/{entity}"}, {"label": "Fiber tasks", "href": f"/work-orders/{entity}/fiber-tasks"}, {"label": "My work orders", "href": "/my-work-orders"}],
    }
    return base.get(entity_type, [])


def _group_by(items: list[Any], attr: str) -> dict[int, list[Any]]:
    grouped: dict[int, list[Any]] = {}
    for item in items:
        key = getattr(item, attr, None)
        if key is not None:
            grouped.setdefault(key, []).append(item)
    return grouped


def _circuits_by_device(circuits: list[Circuit]) -> dict[int, list[Circuit]]:
    grouped: dict[int, list[Circuit]] = {}
    for circuit in circuits:
        for key in [circuit.a_end_device_id, circuit.z_end_device_id]:
            if key is not None:
                grouped.setdefault(key, []).append(circuit)
    return grouped


def _circuits_by_substation(circuits: list[Circuit]) -> dict[int, list[Circuit]]:
    grouped: dict[int, list[Circuit]] = {}
    for circuit in circuits:
        for key in [circuit.a_end_site_id, circuit.z_end_site_id]:
            if key is not None:
                grouped.setdefault(key, []).append(circuit)
    return grouped


def _fiber_by_substation(cables: list[FiberCable]) -> dict[int, list[FiberCable]]:
    grouped: dict[int, list[FiberCable]] = {}
    for cable in cables:
        for key in [cable.a_end_substation_id, cable.z_end_substation_id]:
            if key is not None:
                grouped.setdefault(key, []).append(cable)
    return grouped


def _safe_substation_location(substation: Substation | None) -> dict[str, float]:
    if substation and substation.latitude is not None and substation.longitude is not None:
        return {"latitude": substation.latitude, "longitude": substation.longitude}
    return {}


def _state_from_region(region: str | None) -> str | None:
    value = (region or "").upper()
    for state in ["MA", "RI", "CT", "NH", "VT", "ME"]:
        if state in value:
            return state
    return None
