from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from app.auth.dependencies import CurrentUser, SessionDep, normalize_role, require_roles
from app.integrations.public_grid_sources import (
    csv_grid_importer,
    geojson_importer,
    iso_ne_public_adapter,
    opengridworks_adapter,
    osm_power_adapter,
    shapefile_importer,
)
from app.integrations.public_grid_sources.common import normalize_name, normalize_owner, voltage_class
from app.models import (
    AssumedOPGWRoute,
    Circuit,
    Device,
    FiberCable,
    FiberSegment,
    FiberStrand,
    IconNode,
    ProposedChange,
    PublicDataImportBatch,
    PublicDataSource,
    RegionalAccessAgreement,
    RegionalAssetPermission,
    RegionalIconRing,
    RegionalStructure,
    RegionalSubstation,
    RegionalSyntheticCircuit,
    RegionalTelecomOverlay,
    RegionalTransmissionLine,
    RegionalUtilityOwner,
    RegionalVoltageClass,
    Substation,
    TransmissionLine,
    User,
    WorkOrder,
)
from app.services.audit import add_audit_log

router = APIRouter(prefix="/api/regional-grid", tags=["regional-grid"])


@router.get("/summary")
def regional_summary(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    substations = session.exec(select(RegionalSubstation)).all()
    lines = session.exec(select(RegionalTransmissionLine)).all()
    assumptions = session.exec(select(AssumedOPGWRoute)).all()
    overlays = session.exec(select(RegionalTelecomOverlay)).all()
    circuits = session.exec(select(RegionalSyntheticCircuit)).all()
    work_orders = session.exec(select(WorkOrder)).all()
    visible_work_orders = _visible_work_orders(session, user)
    cards = [
        {"label": "Total imported regional substations", "value": len(substations)},
        {"label": "Total imported transmission lines", "value": len(lines)},
        {"label": "Imported substations by state", "value": ", ".join(f"{k}:{v}" for k, v in sorted(Counter(row.state for row in substations).items())) or "0"},
        {"label": "Imported lines by voltage class", "value": ", ".join(f"{k}:{v}" for k, v in sorted(Counter(row.voltage_class or "unknown" for row in lines).items())) or "0"},
        {"label": "Regional records linked to internal assets", "value": len([row for row in substations if row.linked_internal_substation_id]) + len([row for row in lines if row.linked_internal_transmission_line_id])},
        {"label": "Unlinked public substations", "value": len([row for row in substations if not row.linked_internal_substation_id])},
        {"label": "Unlinked public transmission lines", "value": len([row for row in lines if not row.linked_internal_transmission_line_id])},
        {"label": "Assumed OPGW routes", "value": len([row for row in assumptions if row.status in {"draft_assumption", "planning_assumption"}])},
        {"label": "User-verified OPGW routes", "value": len([row for row in assumptions if row.status in {"user_verified", "replaced_by_actual_record"}])},
        {"label": "Proposed SEL ICON nodes", "value": len([row for row in overlays if row.overlay_type == "assumed_SEL_ICON_node"])},
        {"label": "Proposed SEL ICON circuits", "value": len(circuits)},
        {"label": "Mixed-access assets", "value": len(session.exec(select(RegionalAccessAgreement)).all())},
        {"label": "Assets visible to current user", "value": _visible_asset_count(session, user)},
        {"label": "Assets hidden by owner access rules", "value": max(len(circuits) + len(work_orders) - _visible_asset_count(session, user), 0)},
        {"label": "Work orders across utilities", "value": len([row for row in work_orders if row.work_type.startswith("regional_") or "cross-utility" in (row.description or "").lower()])},
        {"label": "Leased services crossing utility boundaries", "value": len([row for row in circuits if "leased" in row.service_type.lower() or "leased" in (row.backup_path or "").lower()])},
        {"label": "Proposed circuits pending host-utility approval", "value": len([row for row in circuits if row.status == "pending_host_approval"])},
    ]
    return {
        "cards": cards,
        "states": sorted({row.state for row in substations if row.state}),
        "owners": [_dump(row) for row in session.exec(select(RegionalUtilityOwner).order_by(RegionalUtilityOwner.owner_name)).all()],
        "recent_import_batches": [_dump(row) for row in session.exec(select(PublicDataImportBatch).order_by(PublicDataImportBatch.import_time.desc()).limit(5)).all()],
        "visible_work_orders": [_dump(row) for row in visible_work_orders[:8]],
        "safety_note": "Public records are geospatial references only. Synthetic telecom overlays do not claim actual OPGW, SEL ICON, or private circuit topology.",
    }


@router.post("/import/mock-opengridworks", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_mock_opengridworks(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    return _import_normalized(session, user, opengridworks_adapter.normalize_records(), "Mock OpenGridWorks public export")


@router.post("/import/mock-iso-ne", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_mock_iso_ne(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    return _import_normalized(session, user, iso_ne_public_adapter.normalize_records_from_public_map(), "Mock ISO-NE public reference export")


@router.post("/import/mock-osm", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_mock_osm(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    return _import_normalized(session, user, osm_power_adapter.normalize_osm_elements(), "Mock OpenStreetMap power export")


@router.post("/import/csv", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_csv(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    csv_text = payload.get("csv_text")
    if not csv_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="csv_text is required")
    return _import_normalized(session, user, csv_grid_importer.normalize_csv(csv_text), payload.get("import_batch_name", "Manual CSV public grid import"))


@router.post("/import/geojson", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_geojson(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    geojson = payload.get("geojson") or payload
    return _import_normalized(session, user, geojson_importer.normalize_geojson(geojson), payload.get("import_batch_name", "Manual GeoJSON public grid import"))


@router.post("/import/shapefile-records", dependencies=[Depends(require_roles("admin", "engineer"))])
def import_shapefile_records(payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    records = payload.get("records")
    if not isinstance(records, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="records list is required")
    return _import_normalized(session, user, shapefile_importer.normalize_shapefile_records(records), payload.get("import_batch_name", "Manual Shapefile-derived public grid import"))


@router.get("/substations")
def regional_substations(session: SessionDep, _: CurrentUser, state: str | None = None, owner_id: int | None = None, voltage_class_filter: str | None = None, linked: bool | None = None) -> list[dict[str, Any]]:
    rows = session.exec(select(RegionalSubstation).order_by(RegionalSubstation.state, RegionalSubstation.substation_name)).all()
    if state:
        rows = [row for row in rows if row.state == state]
    if owner_id:
        rows = [row for row in rows if row.owner_id == owner_id]
    if voltage_class_filter:
        rows = [row for row in rows if row.voltage_class == voltage_class_filter]
    if linked is not None:
        rows = [row for row in rows if bool(row.linked_internal_substation_id) == linked]
    return [_regional_substation_payload(row, session) for row in rows]


@router.get("/substations/{substation_id}")
def regional_substation_detail(substation_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    substation = _required(session, RegionalSubstation, substation_id, "Regional substation")
    overlays = session.exec(select(RegionalTelecomOverlay).where(RegionalTelecomOverlay.regional_substation_id == substation_id)).all()
    permissions = session.exec(select(RegionalAssetPermission).where(RegionalAssetPermission.entity_type == "regional_substation", RegionalAssetPermission.entity_id == substation_id)).all()
    work_orders = [row for row in _visible_work_orders(session, user) if row.substation_id == substation.linked_internal_substation_id]
    return {
        "regional_substation": _regional_substation_payload(substation, session),
        "public_source": _dump(session.get(PublicDataSource, substation.public_source_id)) if substation.public_source_id else None,
        "import_batch": _dump(session.get(PublicDataImportBatch, substation.import_batch_id)) if substation.import_batch_id else None,
        "linked_internal_substation": _dump(session.get(Substation, substation.linked_internal_substation_id)) if substation.linked_internal_substation_id else None,
        "telecom_overlays": [_dump(row) for row in overlays],
        "work_orders": [_dump(row) for row in work_orders],
        "access_controls": [_dump(row) for row in permissions],
    }


@router.put("/substations/{substation_id}/link", dependencies=[Depends(require_roles("admin", "engineer"))])
def link_regional_substation(substation_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    substation = _required(session, RegionalSubstation, substation_id, "Regional substation")
    internal_id = payload.get("internal_substation_id")
    if not session.get(Substation, internal_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal substation not found")
    substation.linked_internal_substation_id = internal_id
    substation.notes = _append_note(substation.notes, "Linked after engineering review.")
    substation.updated_by = user.id
    substation.updated_at = datetime.now(timezone.utc)
    session.add(substation)
    add_audit_log(session, user, "link", "regional_substation", substation_id, new_value=substation)
    session.commit()
    session.refresh(substation)
    return _regional_substation_payload(substation, session)


@router.get("/transmission-lines")
def regional_lines(session: SessionDep, _: CurrentUser, state: str | None = None, owner_id: int | None = None, voltage_class_filter: str | None = None, linked: bool | None = None, opgw_assumption: str | None = None) -> list[dict[str, Any]]:
    rows = session.exec(select(RegionalTransmissionLine).order_by(RegionalTransmissionLine.state, RegionalTransmissionLine.line_name)).all()
    if state:
        rows = [row for row in rows if row.state == state]
    if owner_id:
        rows = [row for row in rows if row.owner_id == owner_id]
    if voltage_class_filter:
        rows = [row for row in rows if row.voltage_class == voltage_class_filter]
    if linked is not None:
        rows = [row for row in rows if bool(row.linked_internal_transmission_line_id) == linked]
    if opgw_assumption:
        assumption_line_ids = {row.regional_transmission_line_id for row in session.exec(select(AssumedOPGWRoute)).all() if row.status == opgw_assumption or row.confidence_level == opgw_assumption}
        rows = [row for row in rows if row.id in assumption_line_ids]
    return [_regional_line_payload(row, session) for row in rows]


@router.get("/transmission-lines/{line_id}")
def regional_line_detail(line_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    line = _required(session, RegionalTransmissionLine, line_id, "Regional transmission line")
    assumptions = session.exec(select(AssumedOPGWRoute).where(AssumedOPGWRoute.regional_transmission_line_id == line_id)).all()
    overlays = session.exec(select(RegionalTelecomOverlay).where(RegionalTelecomOverlay.regional_transmission_line_id == line_id)).all()
    circuits = [row for row in _visible_synthetic_circuits(session, user) if (row.primary_path and line.line_name in row.primary_path) or (row.backup_path and line.line_name in row.backup_path)]
    permissions = session.exec(select(RegionalAssetPermission).where(RegionalAssetPermission.entity_type == "regional_transmission_line", RegionalAssetPermission.entity_id == line_id)).all()
    return {
        "regional_transmission_line": _regional_line_payload(line, session),
        "assumed_opgw": [_dump(row) for row in assumptions],
        "linked_internal_transmission_line": _dump(session.get(TransmissionLine, line.linked_internal_transmission_line_id)) if line.linked_internal_transmission_line_id else None,
        "telecom_overlays": [_dump(row) for row in overlays],
        "proposed_circuits": [_dump(row) for row in circuits],
        "access_controls": [_dump(row) for row in permissions],
        "geometry": line.geometry_json,
    }


@router.put("/transmission-lines/{line_id}/link", dependencies=[Depends(require_roles("admin", "engineer"))])
def link_regional_line(line_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    line = _required(session, RegionalTransmissionLine, line_id, "Regional transmission line")
    internal_id = payload.get("internal_transmission_line_id")
    if not session.get(TransmissionLine, internal_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal transmission line not found")
    line.linked_internal_transmission_line_id = internal_id
    line.notes = _append_note(line.notes, "Linked after engineering review.")
    line.updated_by = user.id
    line.updated_at = datetime.now(timezone.utc)
    session.add(line)
    add_audit_log(session, user, "link", "regional_transmission_line", line_id, new_value=line)
    session.commit()
    session.refresh(line)
    return _regional_line_payload(line, session)


@router.post("/transmission-lines/{line_id}/assume-opgw", dependencies=[Depends(require_roles("admin", "engineer"))])
def create_assumed_opgw(line_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    line = _required(session, RegionalTransmissionLine, line_id, "Regional transmission line")
    fiber_count = payload.get("fiber_count_assumption") or _default_fiber_count(line.voltage_kv)
    if not fiber_count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown voltage requires manual fiber_count_assumption")
    assumption = AssumedOPGWRoute(
        regional_transmission_line_id=line.id,
        assumption_name=payload.get("assumption_name") or f"Assumed OPGW planning option - {line.line_name}",
        assumption_basis=payload.get("assumption_basis") or "Planning assumption from public transmission reference; not verified.",
        fiber_count_assumption=int(fiber_count),
        shield_wire_count_assumption=payload.get("shield_wire_count_assumption", 1),
        assumed_install_type=payload.get("assumed_install_type", "OPGW shield wire planning option"),
        confidence_level=payload.get("confidence_level", "medium" if line.voltage_kv else "low"),
        status=payload.get("status", "planning_assumption"),
        created_by_user_id=user.id,
        notes=_assumption_note(payload.get("notes")),
        created_by=user.id,
        updated_by=user.id,
    )
    session.add(assumption)
    session.commit()
    session.refresh(assumption)
    session.add(RegionalTelecomOverlay(overlay_name=assumption.assumption_name, regional_transmission_line_id=line.id, overlay_type="assumed_OPGW", confidence_level=assumption.confidence_level, status=assumption.status, notes="Assumed OPGW overlay only; no actual OPGW claim.", created_by=user.id, updated_by=user.id))
    add_audit_log(session, user, "create", "assumed_opgw_route", assumption.id, new_value=assumption)
    session.commit()
    return _dump(assumption)


@router.post("/opgw-assumptions/{assumption_id}/convert-to-fiber", dependencies=[Depends(require_roles("admin", "engineer"))])
def convert_assumption_to_fiber(assumption_id: int, payload: dict[str, Any], session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    assumption = _required(session, AssumedOPGWRoute, assumption_id, "Assumed OPGW route")
    if not payload.get("engineer_approved"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Engineer approval is required before converting an OPGW assumption to planned fiber")
    if assumption.status not in {"planning_assumption", "user_verified", "engineering_record_verified"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assumption is not eligible for conversion")
    if assumption.linked_fiber_cable_id:
        cable = session.get(FiberCable, assumption.linked_fiber_cable_id)
        return {"assumption": _dump(assumption), "fiber_cable": _dump(cable) if cable else None}
    line = _required(session, RegionalTransmissionLine, assumption.regional_transmission_line_id, "Regional transmission line")
    cable_id = payload.get("cable_id") or f"ASSUMED-OPGW-{line.id}-{assumption.fiber_count_assumption}F"
    cable = FiberCable(
        cable_id=cable_id,
        cable_type="assumed_OPGW_planning",
        fiber_count=assumption.fiber_count_assumption or 24,
        owner=_owner_name(session, line.owner_id),
        a_end_location=_regional_sub_name(session, line.from_regional_substation_id),
        z_end_location=_regional_sub_name(session, line.to_regional_substation_id),
        transmission_line_id=line.linked_internal_transmission_line_id,
        route_name=f"Assumed planning route for {line.line_name}",
        route_miles=line.route_length_miles,
        status="planned_assumed",
        notes="Created from assumed OPGW planning route. Not active; requires as-built verification before verified status.",
        created_by=user.id,
        updated_by=user.id,
    )
    session.add(cable)
    session.commit()
    session.refresh(cable)
    segment = FiberSegment(fiber_cable_id=cable.id, segment_name=f"Assumed segment - {line.line_name}", a_location=cable.a_end_location, z_location=cable.z_end_location, length_ft=(line.route_length_miles or 0) * 5280, install_type=assumption.assumed_install_type, status="planned_assumed", notes="Assumed public-reference route segment.", created_by=user.id, updated_by=user.id)
    session.add(segment)
    strands = [
        FiberStrand(fiber_cable_id=cable.id, strand_number=number, tube_number=((number - 1) // 12) + 1, color=_strand_color(number), strand_color=_strand_color(number), buffer_tube_color=_strand_color(((number - 1) // 12) + 1), status="planned_assumed", assigned_service="RegionalGrid assumed OPGW planning")
        for number in range(1, cable.fiber_count + 1)
    ]
    session.add_all(strands)
    assumption.linked_fiber_cable_id = cable.id
    assumption.status = "replaced_by_actual_record" if assumption.confidence_level == "engineering_record_verified" else "planning_assumption"
    assumption.reviewed_by_user_id = user.id
    assumption.reviewed_at = datetime.now(timezone.utc)
    assumption.updated_by = user.id
    assumption.updated_at = datetime.now(timezone.utc)
    session.add(assumption)
    session.add(RegionalTelecomOverlay(overlay_name=f"Planned fiber from {assumption.assumption_name}", regional_transmission_line_id=line.id, fiber_cable_id=cable.id, overlay_type="assumed_OPGW", confidence_level=assumption.confidence_level, status="planned_assumed", notes="Converted to planned FiberCable; still not active or verified.", created_by=user.id, updated_by=user.id))
    add_audit_log(session, user, "convert_to_planned_fiber", "assumed_opgw_route", assumption.id, new_value=cable)
    session.commit()
    session.refresh(assumption)
    session.refresh(cable)
    return {"assumption": _dump(assumption), "fiber_cable": _dump(cable), "strand_count": len(strands), "status_note": "planned_assumed; not active and not verified"}


@router.get("/opgw-assumptions")
def opgw_assumptions(session: SessionDep, _: CurrentUser) -> list[dict[str, Any]]:
    rows = session.exec(select(AssumedOPGWRoute).order_by(AssumedOPGWRoute.confidence_level, AssumedOPGWRoute.assumption_name)).all()
    return [{**_dump(row), "regional_line": _dump(session.get(RegionalTransmissionLine, row.regional_transmission_line_id)) if row.regional_transmission_line_id else None, "converted_to_fiber": bool(row.linked_fiber_cable_id)} for row in rows]


@router.get("/mixed-access")
def mixed_access(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    return {
        "current_user": {"id": user.id, "role": user.role},
        "owners": [_dump(row) for row in session.exec(select(RegionalUtilityOwner).order_by(RegionalUtilityOwner.owner_name)).all()],
        "agreements": [_agreement_payload(row, session) for row in session.exec(select(RegionalAccessAgreement).order_by(RegionalAccessAgreement.agreement_name)).all()],
        "permissions": [_dump(row) for row in session.exec(select(RegionalAssetPermission)).all()],
        "visible_work_orders": [_dump(row) for row in _visible_work_orders(session, user)],
        "rules": [
            "Public regional reference records are visible to all authenticated users.",
            "Contractors and field techs see assigned work orders only.",
            "Foreign-owned proposed changes require host owner approval.",
            "Synthetic telecom overlays are internal planning data and are filtered by regional permissions.",
        ],
    }


@router.get("/telecom-overlay")
def telecom_overlay(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    return {
        "substations": [_regional_substation_payload(row, session) for row in session.exec(select(RegionalSubstation)).all()],
        "transmission_lines": [_regional_line_payload(row, session) for row in session.exec(select(RegionalTransmissionLine)).all()],
        "overlays": [_dump(row) for row in _visible_overlays(session, user)],
        "assumptions": [_dump(row) for row in session.exec(select(AssumedOPGWRoute)).all()],
        "map_layers": _map_layers(session, user),
    }


@router.get("/sel-icon-synthetic-network")
def synthetic_network(session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    return {
        "rings": [_ring_payload(row, session) for row in session.exec(select(RegionalIconRing).order_by(RegionalIconRing.ring_name)).all()],
        "circuits": [_dump(row) for row in _visible_synthetic_circuits(session, user)],
        "disclaimer": "Synthetic planning model only. It is not an actual utility telecom topology.",
    }


@router.get("/map")
def regional_map(session: SessionDep, user: CurrentUser, state: str | None = None, owner_id: int | None = None, asset_type: str | None = None, voltage_class_filter: str | None = None) -> dict[str, Any]:
    layers = _map_layers(session, user)
    for key, values in list(layers.items()):
        if asset_type and key != asset_type:
            layers[key] = []
            continue
        filtered = []
        for row in values:
            if state and row.get("state") != state:
                continue
            if owner_id and row.get("owner_id") != owner_id:
                continue
            if voltage_class_filter and row.get("voltage_class") != voltage_class_filter:
                continue
            filtered.append(row)
        layers[key] = filtered
    return {
        "viewport": {"name": "New England", "states": ["Massachusetts", "Rhode Island", "Connecticut", "New Hampshire", "Vermont", "Maine"]},
        "layers": layers,
        "todo": "Replace this map-ready payload with Leaflet/MapLibre rendering when frontend map dependencies are available.",
    }


@router.get("/work-orders/visible")
def visible_regional_work_orders(session: SessionDep, user: CurrentUser) -> list[dict[str, Any]]:
    return [_dump(row) for row in _visible_work_orders(session, user)]


@router.get("/access/proposed-changes/{change_id}/host-approval")
def host_approval_for_change(change_id: int, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    change = _required(session, ProposedChange, change_id, "Proposed change")
    required_owner_ids = _required_host_owner_ids(session, change)
    user_owner_ids = _user_owner_ids(session, user)
    return {
        "proposed_change": _dump(change),
        "required_host_owner_ids": sorted(required_owner_ids),
        "current_user_owner_ids": sorted(user_owner_ids),
        "host_approval_required": bool(required_owner_ids - user_owner_ids),
        "can_current_user_approve": normalize_role(user.role) == "admin" or bool(required_owner_ids & user_owner_ids),
    }


def _import_normalized(session: SessionDep, user: CurrentUser, normalized: dict[str, Any], batch_name: str) -> dict[str, Any]:
    source_payload = normalized["source"]
    source = PublicDataSource(
        source_name=source_payload.get("source_name", batch_name),
        source_type=source_payload.get("source_type", "other"),
        source_url=source_payload.get("source_url"),
        license_name=source_payload.get("license_name"),
        license_url=source_payload.get("license_url"),
        attribution_text=source_payload.get("attribution_text"),
        imported_by_user_id=user.id,
        import_notes="Public-reference import. No private telecom detail inferred.",
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    owners = {owner.owner_name: owner for owner in session.exec(select(RegionalUtilityOwner)).all()}
    for owner_name in normalized.get("owners", []):
        owners.setdefault(owner_name, _get_or_create_owner(session, owner_name, None))

    batch = PublicDataImportBatch(
        source_id=source.id,
        import_batch_name=batch_name,
        record_count=len(normalized.get("substations", [])) + len(normalized.get("transmission_lines", [])) + len(normalized.get("structures", [])),
        imported_substation_count=0,
        imported_line_count=0,
        imported_structure_count=0,
        status="imported",
        validation_summary_json={**normalized.get("validation", {}), "duplicates": []},
        notes="Imported public geospatial references only.",
    )
    session.add(batch)
    session.commit()
    session.refresh(batch)
    sub_by_name: dict[str, RegionalSubstation] = {}
    duplicates = []
    for item in normalized.get("substations", []):
        owner = _get_or_create_owner(session, item.get("owner_name"), item.get("state"))
        existing = _likely_duplicate_substation(session, item)
        if existing:
            duplicates.append({"type": "substation", "incoming": item.get("substation_name"), "possible_duplicate_id": existing.id})
        row = RegionalSubstation(public_source_id=source.id, import_batch_id=batch.id, owner_id=owner.id, **_regional_substation_fields(item))
        session.add(row)
        session.commit()
        session.refresh(row)
        sub_by_name[row.normalized_name] = row
        batch.imported_substation_count += 1
    for item in normalized.get("transmission_lines", []):
        owner = _get_or_create_owner(session, item.get("owner_name"), item.get("state"))
        from_sub = sub_by_name.get(normalize_name(item.get("from_substation_name"))) or _regional_substation_by_name(session, item.get("from_substation_name"))
        to_sub = sub_by_name.get(normalize_name(item.get("to_substation_name"))) or _regional_substation_by_name(session, item.get("to_substation_name"))
        existing_line = _likely_duplicate_line(session, item)
        if existing_line:
            duplicates.append({"type": "transmission_line", "incoming": item.get("line_name"), "possible_duplicate_id": existing_line.id})
        fields = _regional_line_fields(item)
        fields["from_regional_substation_id"] = from_sub.id if from_sub else None
        fields["to_regional_substation_id"] = to_sub.id if to_sub else None
        row = RegionalTransmissionLine(public_source_id=source.id, import_batch_id=batch.id, owner_id=owner.id, **fields)
        session.add(row)
        batch.imported_line_count += 1
    for item in normalized.get("structures", []):
        session.add(RegionalStructure(**item))
        batch.imported_structure_count += 1
    batch.validation_summary_json = {**(batch.validation_summary_json or {}), "duplicates": duplicates, "dedupe_rule": "Flag by source ID or normalized name; never delete automatically."}
    session.add(batch)
    add_audit_log(session, user, "import", "regional_grid_public_reference", batch.id, new_value=batch)
    session.commit()
    session.refresh(batch)
    return {"source": _dump(source), "batch": _dump(batch), "duplicates": duplicates, "public_reference_only": True}


def _regional_substation_fields(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "external_source_id": item.get("external_source_id"),
        "substation_name": item["substation_name"],
        "normalized_name": item.get("normalized_name") or normalize_name(item["substation_name"]),
        "state": item.get("state", "unknown"),
        "county": item.get("county"),
        "city": item.get("city"),
        "voltage_class": item.get("voltage_class"),
        "min_voltage_kv": item.get("min_voltage_kv"),
        "max_voltage_kv": item.get("max_voltage_kv"),
        "latitude": item.get("latitude"),
        "longitude": item.get("longitude"),
        "geometry_json": item.get("geometry_json"),
        "confidence_score": item.get("confidence_score", 0.75),
        "source_confidence": item.get("source_confidence", "public_reference"),
        "is_public_reference": True,
        "notes": item.get("notes"),
    }


def _regional_line_fields(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "external_source_id": item.get("external_source_id"),
        "line_name": item["line_name"],
        "normalized_line_name": item.get("normalized_line_name") or normalize_name(item["line_name"]),
        "state": item.get("state", "unknown"),
        "voltage_kv": item.get("voltage_kv"),
        "voltage_class": item.get("voltage_class") or voltage_class(item.get("voltage_kv")),
        "geometry_json": item.get("geometry_json"),
        "route_length_miles": item.get("route_length_miles"),
        "status": item.get("status", "public_reference"),
        "confidence_score": item.get("confidence_score", 0.75),
        "source_confidence": item.get("source_confidence", "public_reference"),
        "is_public_reference": True,
        "notes": item.get("notes"),
    }


def _regional_substation_payload(row: RegionalSubstation, session: SessionDep) -> dict[str, Any]:
    return {**_dump(row), "owner_name": _owner_name(session, row.owner_id), "linked": bool(row.linked_internal_substation_id), "reference_type": "public_reference"}


def _regional_line_payload(row: RegionalTransmissionLine, session: SessionDep) -> dict[str, Any]:
    assumptions = session.exec(select(AssumedOPGWRoute).where(AssumedOPGWRoute.regional_transmission_line_id == row.id)).all()
    return {**_dump(row), "owner_name": _owner_name(session, row.owner_id), "linked": bool(row.linked_internal_transmission_line_id), "opgw_assumption_count": len(assumptions), "reference_type": "public_reference"}


def _agreement_payload(row: RegionalAccessAgreement, session: SessionDep) -> dict[str, Any]:
    return {**_dump(row), "owning_utility": _owner_name(session, row.owning_utility_id), "accessing_utility": _owner_name(session, row.accessing_utility_id)}


def _ring_payload(row: RegionalIconRing, session: SessionDep) -> dict[str, Any]:
    circuits = session.exec(select(RegionalSyntheticCircuit).where(RegionalSyntheticCircuit.ring_id == row.id)).all()
    return {**_dump(row), "owner_name": _owner_name(session, row.owner_id), "circuits": [_dump(item) for item in circuits[:8]], "synthetic": True}


def _map_layers(session: SessionDep, user: CurrentUser) -> dict[str, list[dict[str, Any]]]:
    regional_substations = session.exec(select(RegionalSubstation)).all()
    regional_lines = session.exec(select(RegionalTransmissionLine)).all()
    line_by_id = {row.id: row for row in regional_lines if row.id is not None}
    regional_by_site = {_regional_site_code(row): row for row in regional_substations}
    internal_substations = {row.id: row for row in session.exec(select(Substation)).all() if row.id is not None}
    devices = {row.id: row for row in session.exec(select(Device)).all() if row.id is not None}
    return {
        "substations": [_regional_substation_map_payload(row, session) for row in regional_substations],
        "transmission_lines": [_regional_line_map_payload(row, session) for row in regional_lines],
        "assumed_opgw": [_assumed_opgw_map_payload(row, line_by_id, session) for row in session.exec(select(AssumedOPGWRoute)).all()],
        "verified_fiber": [_fiber_map_payload(row, internal_substations) for row in session.exec(select(FiberCable)).all() if row.status in {"active", "verified", "as_built", "planned_assumed"}],
        "sel_icon_nodes": [_icon_node_map_payload(row, devices, internal_substations) for row in session.exec(select(IconNode)).all()],
        "circuit_paths": [_synthetic_circuit_map_payload(row, regional_by_site, session) for row in _visible_synthetic_circuits(session, user)],
        "work_order_locations": [_work_order_map_payload(row, internal_substations) for row in _visible_work_orders(session, user)],
    }


def _regional_substation_map_payload(row: RegionalSubstation, session: SessionDep) -> dict[str, Any]:
    payload = _regional_substation_payload(row, session)
    return {
        **payload,
        "asset_type": "substation",
        "asset_label": row.substation_name,
        "site_code": _regional_site_code(row),
        "latitude": row.latitude,
        "longitude": row.longitude,
        "href": f"/regional-grid/substations/{row.id}",
        "synthetic_status": "public_reference",
    }


def _regional_line_map_payload(row: RegionalTransmissionLine, session: SessionDep) -> dict[str, Any]:
    payload = _regional_line_payload(row, session)
    return {
        **payload,
        "asset_type": "transmission_line",
        "asset_label": row.line_name,
        "geometry_coordinates": _line_coordinates(row),
        "href": f"/regional-grid/transmission-lines/{row.id}",
        "synthetic_status": "public_reference",
    }


def _assumed_opgw_map_payload(row: AssumedOPGWRoute, lines: dict[int, RegionalTransmissionLine], session: SessionDep) -> dict[str, Any]:
    line = lines.get(row.regional_transmission_line_id or -1)
    return {
        **_dump(row),
        "asset_type": "assumed_opgw",
        "asset_label": row.assumption_name,
        "line_name": line.line_name if line else None,
        "state": line.state if line else None,
        "owner_id": line.owner_id if line else None,
        "owner_name": _owner_name(session, line.owner_id) if line else "Unknown",
        "voltage_class": line.voltage_class if line else None,
        "geometry_coordinates": _line_coordinates(line) if line else [],
        "href": f"/regional-grid/transmission-lines/{line.id}" if line else "/regional-grid/opgw-assumptions",
        "synthetic_status": row.status,
    }


def _fiber_map_payload(row: FiberCable, substations: dict[int, Substation]) -> dict[str, Any]:
    a_sub = substations.get(row.a_end_substation_id or -1)
    z_sub = substations.get(row.z_end_substation_id or -1)
    return {
        **_dump(row),
        "asset_type": "verified_fiber",
        "asset_label": row.cable_id,
        "a_latitude": a_sub.latitude if a_sub else None,
        "a_longitude": a_sub.longitude if a_sub else None,
        "z_latitude": z_sub.latitude if z_sub else None,
        "z_longitude": z_sub.longitude if z_sub else None,
        "state": _state_from_site_code(a_sub.substation_code if a_sub else None),
        "href": f"/fiber-cables/{row.id}",
        "synthetic_status": row.status,
    }


def _icon_node_map_payload(row: IconNode, devices: dict[int, Device], substations: dict[int, Substation]) -> dict[str, Any]:
    device = devices.get(row.device_id or -1)
    substation = substations.get(device.substation_id or -1) if device else None
    return {
        **_dump(row),
        "asset_type": "sel_icon_node",
        "asset_label": row.node_name,
        "device_name": device.device_name if device else row.node_name,
        "substation_code": substation.substation_code if substation else _site_code_from_node_name(row.node_name),
        "state": _state_from_site_code(substation.substation_code if substation else row.node_name),
        "latitude": substation.latitude if substation else None,
        "longitude": substation.longitude if substation else None,
        "href": f"/icon/{row.id}",
        "synthetic_status": row.status,
    }


def _synthetic_circuit_map_payload(row: RegionalSyntheticCircuit, substations_by_site: dict[str, RegionalSubstation], session: SessionDep) -> dict[str, Any]:
    a_sub = substations_by_site.get(row.a_end_site)
    z_sub = substations_by_site.get(row.z_end_site)
    ring = session.get(RegionalIconRing, row.ring_id) if row.ring_id else None
    return {
        **_dump(row),
        "asset_type": "circuit_path",
        "asset_label": row.circuit_id,
        "ring_name": ring.ring_name if ring else None,
        "owner_name": _owner_name(session, row.owner_id),
        "state": a_sub.state if a_sub else _state_from_site_code(row.a_end_site),
        "a_latitude": a_sub.latitude if a_sub else None,
        "a_longitude": a_sub.longitude if a_sub else None,
        "z_latitude": z_sub.latitude if z_sub else None,
        "z_longitude": z_sub.longitude if z_sub else None,
        "href": "/regional-grid/sel-icon-synthetic-network",
        "synthetic_status": row.status,
    }


def _work_order_map_payload(row: WorkOrder, substations: dict[int, Substation]) -> dict[str, Any]:
    substation = substations.get(row.substation_id or -1)
    return {
        **_dump(row),
        "asset_type": "work_order_location",
        "asset_label": row.work_order_number,
        "state": _state_from_site_code(substation.substation_code if substation else None),
        "latitude": substation.latitude if substation else None,
        "longitude": substation.longitude if substation else None,
        "substation_code": substation.substation_code if substation else None,
        "href": f"/work-orders/{row.id}",
        "synthetic_status": row.status,
    }


def _line_coordinates(row: RegionalTransmissionLine | None) -> list[list[float]]:
    geometry = row.geometry_json if row else None
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(coordinates, list):
        return []
    return [point for point in coordinates if isinstance(point, list) and len(point) >= 2]


def _regional_site_code(row: RegionalSubstation) -> str:
    if row.external_source_id and row.external_source_id.startswith("seed-"):
        return row.external_source_id.removeprefix("seed-")
    name = row.substation_name or ""
    return name.split(" ", 1)[0]


def _site_code_from_node_name(value: str | None) -> str | None:
    if not value:
        return None
    parts = value.split("-")
    if len(parts) >= 2:
        return "-".join(parts[:2])
    return value


def _state_from_site_code(value: str | None) -> str | None:
    if not value:
        return None
    prefix = value.split("-", 1)[0].upper()
    return {
        "MA": "Massachusetts",
        "RI": "Rhode Island",
        "CT": "Connecticut",
        "NH": "New Hampshire",
        "VT": "Vermont",
        "ME": "Maine",
    }.get(prefix)


def _visible_synthetic_circuits(session: SessionDep, user: CurrentUser) -> list[RegionalSyntheticCircuit]:
    rows = session.exec(select(RegionalSyntheticCircuit).order_by(RegionalSyntheticCircuit.circuit_id)).all()
    if normalize_role(user.role) in {"admin", "engineer", "sql_analyst"}:
        return rows
    owner_ids = _user_owner_ids(session, user)
    return [row for row in rows if row.owner_id in owner_ids]


def _visible_overlays(session: SessionDep, user: CurrentUser) -> list[RegionalTelecomOverlay]:
    rows = session.exec(select(RegionalTelecomOverlay).order_by(RegionalTelecomOverlay.overlay_name)).all()
    if normalize_role(user.role) in {"admin", "engineer", "sql_analyst"}:
        return rows
    allowed = _user_owner_ids(session, user)
    line_owner_ids = {line.id: line.owner_id for line in session.exec(select(RegionalTransmissionLine)).all()}
    return [row for row in rows if row.regional_transmission_line_id is None or line_owner_ids.get(row.regional_transmission_line_id) in allowed]


def _visible_work_orders(session: SessionDep, user: CurrentUser) -> list[WorkOrder]:
    rows = session.exec(select(WorkOrder).order_by(WorkOrder.work_order_number)).all()
    role = normalize_role(user.role)
    if role in {"field_tech", "contractor"}:
        return [row for row in rows if row.assigned_field_tech_id == user.id]
    if role == "provider":
        return [row for row in rows if row.provider_id is not None]
    return rows


def _visible_asset_count(session: SessionDep, user: CurrentUser) -> int:
    public_refs = len(session.exec(select(RegionalSubstation)).all()) + len(session.exec(select(RegionalTransmissionLine)).all())
    return public_refs + len(_visible_synthetic_circuits(session, user)) + len(_visible_work_orders(session, user))


def _required_host_owner_ids(session: SessionDep, change: ProposedChange) -> set[int]:
    ids: set[int] = set()
    if change.target_entity_type == "regional_transmission_line" and change.target_entity_id:
        line = session.get(RegionalTransmissionLine, change.target_entity_id)
        if line and line.owner_id:
            ids.add(line.owner_id)
    if change.target_entity_type == "regional_substation" and change.target_entity_id:
        substation = session.get(RegionalSubstation, change.target_entity_id)
        if substation and substation.owner_id:
            ids.add(substation.owner_id)
    if change.proposed_state_json:
        for owner_id in change.proposed_state_json.get("affected_owner_ids", []) or []:
            ids.add(int(owner_id))
    return ids


def _user_owner_ids(session: SessionDep, user: User) -> set[int]:
    permissions = session.exec(select(RegionalAssetPermission).where(RegionalAssetPermission.user_id == user.id)).all()
    return {row.utility_owner_id for row in permissions if row.utility_owner_id is not None}


def _get_or_create_owner(session: SessionDep, owner_name: str | None, state: str | None) -> RegionalUtilityOwner:
    normalized = normalize_owner(owner_name)
    existing = session.exec(select(RegionalUtilityOwner).where(RegionalUtilityOwner.owner_name == normalized)).first()
    if existing:
        return existing
    owner_type = "unknown"
    if "provider" in normalized.lower() or "carrier" in normalized.lower():
        owner_type = "telecom_provider"
    elif "contractor" in normalized.lower():
        owner_type = "contractor"
    elif "iso" in normalized.lower():
        owner_type = "independent_transmission_owner"
    elif normalized != "Unknown public source owner":
        owner_type = "transmission_owner"
    owner = RegionalUtilityOwner(owner_name=normalized, owner_type=owner_type, state=state, service_area_description="RegionalGrid public-reference/import owner", notes="Owner label from public or synthetic planning data.")
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return owner


def _likely_duplicate_substation(session: SessionDep, item: dict[str, Any]) -> RegionalSubstation | None:
    normalized = item.get("normalized_name") or normalize_name(item.get("substation_name"))
    external = item.get("external_source_id")
    rows = session.exec(select(RegionalSubstation)).all()
    for row in rows:
        if external and row.external_source_id == external:
            return row
        if row.normalized_name == normalized and row.state == item.get("state"):
            return row
    return None


def _likely_duplicate_line(session: SessionDep, item: dict[str, Any]) -> RegionalTransmissionLine | None:
    normalized = item.get("normalized_line_name") or normalize_name(item.get("line_name"))
    external = item.get("external_source_id")
    rows = session.exec(select(RegionalTransmissionLine)).all()
    for row in rows:
        if external and row.external_source_id == external:
            return row
        if row.normalized_line_name == normalized and row.state == item.get("state"):
            return row
    return None


def _regional_substation_by_name(session: SessionDep, name: str | None) -> RegionalSubstation | None:
    normalized = normalize_name(name)
    return session.exec(select(RegionalSubstation).where(RegionalSubstation.normalized_name == normalized)).first()


def _default_fiber_count(voltage_kv: float | None) -> int | None:
    if voltage_kv is None:
        return None
    if voltage_kv >= 300:
        return 72
    if voltage_kv >= 200:
        return 48
    if voltage_kv >= 100:
        return 24
    return None


def _owner_name(session: SessionDep, owner_id: int | None) -> str:
    owner = session.get(RegionalUtilityOwner, owner_id) if owner_id else None
    return owner.owner_name if owner else "Unknown"


def _regional_sub_name(session: SessionDep, substation_id: int | None) -> str | None:
    substation = session.get(RegionalSubstation, substation_id) if substation_id else None
    return substation.substation_name if substation else None


def _strand_color(number: int) -> str:
    colors = ["blue", "orange", "green", "brown", "slate", "white", "red", "black", "yellow", "violet", "rose", "aqua"]
    return colors[(number - 1) % len(colors)]


def _assumption_note(note: str | None) -> str:
    base = "Assumption only. This record does not claim OPGW exists and must be user-verified before as-built use."
    return f"{base} {note}" if note else base


def _append_note(existing: str | None, note: str) -> str:
    return f"{existing}\n{note}" if existing else note


def _required(session: SessionDep, model, item_id: int | None, label: str):
    item = session.get(model, item_id) if item_id is not None else None
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return item


def _dump(item) -> dict[str, Any]:
    if item is None:
        return {}
    if hasattr(item, "model_dump"):
        data = item.model_dump(mode="json")
        if data:
            return data
    if hasattr(item, "__table__"):
        return {column.name: _json_value(getattr(item, column.name)) for column in item.__table__.columns}
    if hasattr(item, "dict"):
        return item.dict()
    return dict(item)


def _json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value
