from datetime import date, timedelta

from fastapi import APIRouter
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep
from app.models import Circuit, CircuitPath, DevicePort, FiberCable, FiberStrand, IconNode, LeasedService, PatchPanelPort, SpliceClosure, Substation, TransmissionLine, WorkOrder

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


def _bucket(items: list, attr: str) -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for item in items:
        key = str(getattr(item, attr) or "unknown")
        counts[key] = counts.get(key, 0) + 1
    return [{"label": key, "value": value} for key, value in sorted(counts.items())]
