from __future__ import annotations

from datetime import date, datetime, timezone

from sqlmodel import Session, select

from app.auth.security import hash_password
from app.models import (
    AssumedOPGWRoute,
    Circuit,
    CommissioningChecklist,
    CommissioningChecklistItem,
    Device,
    FiberCable,
    IconNode,
    ProposedChange,
    PublicDataImportBatch,
    PublicDataSource,
    Rack,
    RegionalAccessAgreement,
    RegionalAssetPermission,
    RegionalIconRing,
    RegionalSubstation,
    RegionalSyntheticCircuit,
    RegionalTelecomOverlay,
    RegionalTransmissionLine,
    RegionalUtilityOwner,
    RegionalVoltageClass,
    SQLReport,
    Substation,
    TransmissionLine,
    User,
    WorkOrder,
    WorkOrderTask,
)
from app.reports.saved_reports import SAVED_REPORTS

REGIONAL_USERS = [
    ("contractor@example.com", "Contractor Demo", "contractor", "contractor123"),
    ("provider@example.com", "Provider Demo", "provider", "provider123"),
    ("jointengineer@example.com", "Joint Project Engineer", "engineer", "joint123"),
    ("isoneviewer@example.com", "ISO-NE Viewer Demo", "viewer", "viewer123"),
]

REGIONAL_NODE_SPECS = [
    ("MA-WBS", "MA-WBS-ICON-01", "Massachusetts", "Webster", 42.0501, -71.8809),
    ("MA-AUB", "MA-AUB-ICON-01", "Massachusetts", "Auburn", 42.1945, -71.8356),
    ("MA-MIL", "MA-MIL-ICON-01", "Massachusetts", "Millbury", 42.1934, -71.7606),
    ("MA-WOR", "MA-WOR-ICON-01", "Massachusetts", "Worcester", 42.2626, -71.8023),
    ("MA-FRA", "MA-FRA-ICON-01", "Massachusetts", "Framingham", 42.2793, -71.4162),
    ("MA-BOS", "MA-BOS-ICON-01", "Massachusetts", "Boston", 42.3601, -71.0589),
    ("RI-PVD", "RI-PVD-ICON-01", "Rhode Island", "Providence", 41.8240, -71.4128),
    ("CT-HFD", "CT-HFD-ICON-01", "Connecticut", "Hartford", 41.7658, -72.6734),
    ("CT-NHV", "CT-NHV-ICON-01", "Connecticut", "New Haven", 41.3083, -72.9279),
    ("NH-MAN", "NH-MAN-ICON-01", "New Hampshire", "Manchester", 42.9956, -71.4548),
    ("VT-RUT", "VT-RUT-ICON-01", "Vermont", "Rutland", 43.6106, -72.9726),
    ("ME-POR", "ME-POR-ICON-01", "Maine", "Portland", 43.6591, -70.2568),
]


def seed_regional_grid_addons(session: Session) -> None:
    _seed_reports(session)
    users = _seed_users(session)
    if session.exec(select(RegionalUtilityOwner)).first() and session.exec(select(RegionalSyntheticCircuit).where(RegionalSyntheticCircuit.circuit_id == "PMU-VT-RUT-MA-BOS-001")).first():
        session.commit()
        return

    owners = _seed_owners(session)
    source, batch = _seed_public_source(session, users["admin"])
    _seed_voltage_classes(session)
    regional_subs = _seed_regional_substations(session, source, batch, owners)
    regional_lines = _seed_regional_lines(session, source, batch, owners, regional_subs)
    assumptions = _seed_assumptions(session, regional_lines, users["engineer"])
    internal_subs, icon_nodes = _seed_internal_synthetic_icon_nodes(session, regional_subs)
    overlays = _seed_overlays(session, regional_subs, regional_lines, assumptions, icon_nodes)
    rings = _seed_rings(session, owners, assumptions)
    circuits = _seed_synthetic_circuits(session, owners, rings)
    work_orders = _seed_regional_work_orders(session, users, internal_subs, circuits)
    _link_circuits_to_work_orders(session, circuits, work_orders)
    _seed_access(session, users, owners, regional_subs, regional_lines, work_orders)
    _seed_regional_proposed_changes(session, users, owners, regional_lines)
    _seed_commissioning(session, users, work_orders)
    batch.validation_summary_json = {
        "public_reference_only": True,
        "dedupe_rule": "Normalized names, source IDs, voltage class, owner, and geospatial proximity are flagged for review; never auto-delete.",
        "synthetic_overlay_count": len(overlays),
        "synthetic_circuit_count": len(circuits),
    }
    session.add(batch)
    session.commit()


def _seed_reports(session: Session) -> None:
    existing = {row.report_name for row in session.exec(select(SQLReport)).all()}
    for report in SAVED_REPORTS:
        if report["report_name"] not in existing:
            session.add(SQLReport(**report))
    session.commit()


def _seed_users(session: Session) -> dict[str, User]:
    for email, full_name, role, password in REGIONAL_USERS:
        if not session.exec(select(User).where(User.email == email)).first():
            session.add(User(email=email, full_name=full_name, role=role, password_hash=hash_password(password)))
    session.commit()
    return {
        "admin": session.exec(select(User).where(User.email == "admin@example.com")).first() or session.exec(select(User)).first(),
        "engineer": session.exec(select(User).where(User.email == "engineer@example.com")).first(),
        "joint_engineer": session.exec(select(User).where(User.email == "jointengineer@example.com")).first(),
        "contractor": session.exec(select(User).where(User.email == "contractor@example.com")).first(),
        "provider": session.exec(select(User).where(User.email == "provider@example.com")).first(),
        "isone_viewer": session.exec(select(User).where(User.email == "isoneviewer@example.com")).first(),
        "field_tech": session.exec(select(User).where(User.email == "fieldtech@example.com")).first(),
    }


def _seed_owners(session: Session) -> dict[str, RegionalUtilityOwner]:
    specs = [
        ("National Grid-style owner", "transmission_owner", "Massachusetts", "Owns selected Massachusetts public-reference substations and synthetic Central Massachusetts ICON planning overlays."),
        ("Eversource-style owner", "transmission_owner", "Massachusetts", "Owns selected Eastern Massachusetts and Connecticut planning overlays."),
        ("Avangrid-style owner", "transmission_owner", "Connecticut", "Represents UI/CMP/affiliate-style regional public-reference owner records."),
        ("Unitil-style owner", "distribution_owner", "New Hampshire", "Represents smaller New England utility access examples."),
        ("Vermont utilities", "municipal_utility", "Vermont", "Represents Vermont utility planning records."),
        ("Municipal utilities consortium", "municipal_utility", "Massachusetts", "Municipal and public-power planning owner example."),
        ("ISO-NE public reference viewer", "independent_transmission_owner", None, "Public reference visibility only; no private telecom access implied."),
        ("Regional telecom provider", "telecom_provider", None, "Provider/carrier access example for leased backup and demarc work orders."),
        ("Regional field contractor", "contractor", None, "Contractor access example for assigned work orders only."),
        ("Internal planning owner", "internal_planning_owner", None, "Internal/private utility telecom planning records."),
    ]
    owners: dict[str, RegionalUtilityOwner] = {}
    for name, owner_type, state, description in specs:
        owner = session.exec(select(RegionalUtilityOwner).where(RegionalUtilityOwner.owner_name == name)).first()
        if not owner:
            owner = RegionalUtilityOwner(owner_name=name, owner_type=owner_type, iso_region="ISO-NE", state=state, service_area_description=description, notes="RegionalGrid seeded owner; fictional planning/access example.")
            session.add(owner)
            session.commit()
            session.refresh(owner)
        owners[name] = owner
    return owners


def _seed_public_source(session: Session, admin: User) -> tuple[PublicDataSource, PublicDataImportBatch]:
    source = session.exec(select(PublicDataSource).where(PublicDataSource.source_name == "RegionalGrid seeded public references")).first()
    if not source:
        source = PublicDataSource(
            source_name="RegionalGrid seeded public references",
            source_type="internal_reference",
            source_url="seed://regional-grid-public-reference-demo",
            license_name="Public/open reference placeholder",
            attribution_text="Fictional demo records modeled as public geospatial references; not actual private utility telecom data.",
            imported_by_user_id=admin.id if admin else None,
            import_notes="Seeded public-reference style records for New England planning demo.",
        )
        session.add(source)
        session.commit()
        session.refresh(source)
    batch = session.exec(select(PublicDataImportBatch).where(PublicDataImportBatch.import_batch_name == "RegionalGrid seeded New England import")).first()
    if not batch:
        batch = PublicDataImportBatch(source_id=source.id, import_batch_name="RegionalGrid seeded New England import", status="imported", notes="Seeded public-reference import batch.")
        session.add(batch)
        session.commit()
        session.refresh(batch)
    return source, batch


def _seed_voltage_classes(session: Session) -> None:
    for voltage_class, min_kv, max_kv in [("115 kV", 100, 199), ("230 kV", 200, 299), ("345 kV", 300, 399), ("subtransmission", 34.5, 99), ("unknown", None, None)]:
        if not session.exec(select(RegionalVoltageClass).where(RegionalVoltageClass.voltage_class == voltage_class)).first():
            session.add(RegionalVoltageClass(voltage_class=voltage_class, min_voltage_kv=min_kv, max_voltage_kv=max_kv, description="RegionalGrid voltage-class normalization."))
    session.commit()


def _seed_regional_substations(session: Session, source: PublicDataSource, batch: PublicDataImportBatch, owners: dict[str, RegionalUtilityOwner]) -> dict[str, RegionalSubstation]:
    owner_for_state = {
        "MA-WBS": owners["National Grid-style owner"],
        "MA-AUB": owners["National Grid-style owner"],
        "MA-MIL": owners["National Grid-style owner"],
        "MA-WOR": owners["National Grid-style owner"],
        "MA-FRA": owners["Eversource-style owner"],
        "MA-BOS": owners["Eversource-style owner"],
        "RI-PVD": owners["National Grid-style owner"],
        "CT-HFD": owners["Eversource-style owner"],
        "CT-NHV": owners["Avangrid-style owner"],
        "NH-MAN": owners["Unitil-style owner"],
        "VT-RUT": owners["Vermont utilities"],
        "ME-POR": owners["Avangrid-style owner"],
    }
    internal_map = {row.substation_code: row.id for row in session.exec(select(Substation)).all()}
    result: dict[str, RegionalSubstation] = {}
    for code, icon_name, state, city, lat, lon in REGIONAL_NODE_SPECS:
        name = f"{code} {city} public reference substation"
        existing = session.exec(select(RegionalSubstation).where(RegionalSubstation.external_source_id == f"seed-{code}")).first()
        if not existing:
            voltage = 345 if code in {"MA-BOS", "CT-HFD"} else 230 if code in {"MA-FRA", "ME-POR"} else 115
            linked = internal_map.get(code.replace("MA-", "")) if code in {"MA-WBS", "MA-AUB", "MA-MIL"} else None
            existing = RegionalSubstation(
                public_source_id=source.id,
                import_batch_id=batch.id,
                external_source_id=f"seed-{code}",
                substation_name=name,
                normalized_name=_norm(name),
                owner_id=owner_for_state[code].id,
                state=state,
                county=_county_for_city(city),
                city=city,
                voltage_class="345 kV" if voltage == 345 else "230 kV" if voltage == 230 else "115 kV",
                min_voltage_kv=voltage,
                max_voltage_kv=voltage,
                latitude=lat,
                longitude=lon,
                geometry_json={"type": "Point", "coordinates": [lon, lat]},
                confidence_score=0.82,
                source_confidence="seeded_public_reference",
                is_public_reference=True,
                linked_internal_substation_id=linked,
                notes="Public/geospatial reference record. Does not disclose or imply private telecom facilities.",
            )
            session.add(existing)
            batch.imported_substation_count += 1
        result[code] = existing
    batch.record_count = batch.imported_substation_count + batch.imported_line_count + batch.imported_structure_count
    session.add(batch)
    session.commit()
    for key, row in result.items():
        session.refresh(row)
        result[key] = row
    return result


def _seed_regional_lines(session: Session, source: PublicDataSource, batch: PublicDataImportBatch, owners: dict[str, RegionalUtilityOwner], subs: dict[str, RegionalSubstation]) -> dict[str, RegionalTransmissionLine]:
    specs = [
        ("RG-L143-MA-WBS-AUB", "Public Line 143 MA-WBS MA-AUB reference", "MA-WBS", "MA-AUB", 115, 13.4, owners["National Grid-style owner"]),
        ("RG-L172-MA-AUB-MIL", "Public Line 172 MA-AUB MA-MIL reference", "MA-AUB", "MA-MIL", 115, 9.2, owners["National Grid-style owner"]),
        ("RG-MA-WOR-WBS", "Public Worcester Webster 115 reference", "MA-WOR", "MA-WBS", 115, 17.5, owners["National Grid-style owner"]),
        ("RG-MA-FRA-BOS", "Public Framingham Boston 230 reference", "MA-FRA", "MA-BOS", 230, 24.1, owners["Eversource-style owner"]),
        ("RG-RI-PVD-BOS", "Public Providence Boston 230 reference", "RI-PVD", "MA-BOS", 230, 44.0, owners["National Grid-style owner"]),
        ("RG-CT-HFD-NHV", "Public Hartford New Haven 345 reference", "CT-HFD", "CT-NHV", 345, 39.0, owners["Eversource-style owner"]),
        ("RG-CT-NHV-PVD", "Public New Haven Providence 230 reference", "CT-NHV", "RI-PVD", 230, 86.0, owners["Avangrid-style owner"]),
        ("RG-NH-MAN-VT-RUT", "Public Manchester Rutland 115 reference", "NH-MAN", "VT-RUT", 115, 87.0, owners["Unitil-style owner"]),
        ("RG-VT-RUT-ME-POR", "Public Rutland Portland 115 reference", "VT-RUT", "ME-POR", 115, 142.0, owners["Vermont utilities"]),
        ("RG-ME-POR-BOS", "Public Portland Boston 230 reference", "ME-POR", "MA-BOS", 230, 108.0, owners["Avangrid-style owner"]),
        ("RG-MA-BOS-CT-HFD", "Public Boston Hartford 345 reference", "MA-BOS", "CT-HFD", 345, 96.0, owners["Eversource-style owner"]),
        ("RG-MA-MIL-FRA", "Public Millbury Framingham 115 reference", "MA-MIL", "MA-FRA", 115, 28.0, owners["Municipal utilities consortium"]),
    ]
    internal_lines = {row.line_name: row.id for row in session.exec(select(TransmissionLine)).all()}
    result: dict[str, RegionalTransmissionLine] = {}
    for external_id, name, a_code, z_code, voltage, miles, owner in specs:
        row = session.exec(select(RegionalTransmissionLine).where(RegionalTransmissionLine.external_source_id == external_id)).first()
        if not row:
            row = RegionalTransmissionLine(
                public_source_id=source.id,
                import_batch_id=batch.id,
                external_source_id=external_id,
                line_name=name,
                normalized_line_name=_norm(name),
                owner_id=owner.id,
                state=subs[a_code].state,
                voltage_kv=voltage,
                voltage_class="345 kV" if voltage == 345 else "230 kV" if voltage == 230 else "115 kV",
                from_regional_substation_id=subs[a_code].id,
                to_regional_substation_id=subs[z_code].id,
                geometry_json={"type": "LineString", "coordinates": [[subs[a_code].longitude, subs[a_code].latitude], [subs[z_code].longitude, subs[z_code].latitude]]},
                route_length_miles=miles,
                status="public_reference",
                confidence_score=0.8,
                source_confidence="seeded_public_reference",
                is_public_reference=True,
                linked_internal_transmission_line_id=internal_lines.get("Line 143") if external_id == "RG-L143-MA-WBS-AUB" else internal_lines.get("Line 172") if external_id == "RG-L172-MA-AUB-MIL" else None,
                notes="Public transmission reference only; OPGW/private telecom is not inferred.",
            )
            session.add(row)
            batch.imported_line_count += 1
        result[external_id] = row
    batch.record_count = batch.imported_substation_count + batch.imported_line_count + batch.imported_structure_count
    session.add(batch)
    session.commit()
    for key, row in result.items():
        session.refresh(row)
        result[key] = row
    return result


def _seed_assumptions(session: Session, lines: dict[str, RegionalTransmissionLine], engineer: User) -> dict[str, AssumedOPGWRoute]:
    result = {}
    for key, line in lines.items():
        existing = session.exec(select(AssumedOPGWRoute).where(AssumedOPGWRoute.regional_transmission_line_id == line.id)).first()
        if not existing:
            count = 72 if (line.voltage_kv or 0) >= 300 else 48 if (line.voltage_kv or 0) >= 200 else 24
            confidence = "medium" if line.voltage_kv else "low"
            if key in {"RG-L143-MA-WBS-AUB", "RG-L172-MA-AUB-MIL"}:
                confidence = "user_verified"
            existing = AssumedOPGWRoute(
                regional_transmission_line_id=line.id,
                assumption_name=f"Assumed OPGW option for {line.line_name}",
                assumption_basis="Synthetic planning assumption from public transmission reference; does not claim OPGW exists.",
                fiber_count_assumption=count,
                shield_wire_count_assumption=1,
                assumed_install_type="OPGW shield wire planning option",
                confidence_level=confidence,
                status="user_verified" if confidence == "user_verified" else "planning_assumption",
                created_by_user_id=engineer.id if engineer else None,
                notes="Assumed until user engineering/as-built records verify actual fiber.",
            )
            session.add(existing)
        result[key] = existing
    session.commit()
    for key, row in result.items():
        session.refresh(row)
        result[key] = row
    return result


def _seed_internal_synthetic_icon_nodes(session: Session, regional_subs: dict[str, RegionalSubstation]) -> tuple[dict[str, Substation], dict[str, IconNode]]:
    substations: dict[str, Substation] = {}
    nodes: dict[str, IconNode] = {}
    for code, icon_name, state, city, lat, lon in REGIONAL_NODE_SPECS:
        sub = session.exec(select(Substation).where(Substation.substation_code == code)).first()
        if not sub:
            sub = Substation(substation_code=code, name=f"{code} {city} synthetic planning substation", voltage_level="115/230/345 kV regional planning", region=f"RegionalGrid {state}", latitude=lat, longitude=lon, status="synthetic_planning", notes="Synthetic internal planning site linked to public reference; not public disclosure.")
            session.add(sub)
            session.commit()
            session.refresh(sub)
        rack = session.exec(select(Rack).where(Rack.substation_id == sub.id)).first()
        if not rack:
            rack = Rack(substation_id=sub.id, rack_name=f"{code}-TELCO-R1", room="Control house planning placeholder", rack_unit_count=44, notes="Synthetic regional planning rack.")
            session.add(rack)
            session.commit()
            session.refresh(rack)
        device = session.exec(select(Device).where(Device.device_name == icon_name)).first()
        if not device:
            device = Device(device_name=icon_name, device_type="SEL_ICON", manufacturer="SEL", model="ICON", firmware_version="4.2.1", substation_id=sub.id, rack_id=rack.id, ip_address=f"10.200.{len(nodes)+1}.10", status="synthetic_planning", criticality="critical", notes="Synthetic SEL ICON planning node; fictional demo data.")
            session.add(device)
            session.commit()
            session.refresh(device)
        node = session.exec(select(IconNode).where(IconNode.node_name == icon_name)).first()
        if not node:
            node = IconNode(device_id=device.id, node_name=icon_name, chassis_type="ICON rack chassis", transport_mode="mixed Ethernet/SONET synthetic", icon_network_name="RegionalGrid synthetic ICON network", firmware_version="4.2.1", management_ip=device.ip_address, status="synthetic_planning", notes="Synthetic ICON node for regional planning demo.")
            session.add(node)
            session.commit()
            session.refresh(node)
        substations[code] = sub
        nodes[code] = node
        regional = regional_subs.get(code)
        if regional and not regional.linked_internal_substation_id:
            regional.linked_internal_substation_id = sub.id
            session.add(regional)
    session.commit()
    return substations, nodes


def _seed_overlays(session: Session, subs: dict[str, RegionalSubstation], lines: dict[str, RegionalTransmissionLine], assumptions: dict[str, AssumedOPGWRoute], nodes: dict[str, IconNode]) -> list[RegionalTelecomOverlay]:
    overlays = []
    for code, node in nodes.items():
        if not session.exec(select(RegionalTelecomOverlay).where(RegionalTelecomOverlay.overlay_name == f"Assumed SEL ICON overlay {node.node_name}")).first():
            overlays.append(RegionalTelecomOverlay(overlay_name=f"Assumed SEL ICON overlay {node.node_name}", regional_substation_id=subs[code].id, internal_substation_id=subs[code].linked_internal_substation_id, icon_node_id=node.id, overlay_type="assumed_SEL_ICON_node", confidence_level="medium", status="synthetic_planning", notes="Synthetic SEL ICON planning overlay only."))
    for key, assumption in assumptions.items():
        line = lines[key]
        if not session.exec(select(RegionalTelecomOverlay).where(RegionalTelecomOverlay.overlay_name == f"Assumed OPGW overlay {line.line_name}")).first():
            overlays.append(RegionalTelecomOverlay(overlay_name=f"Assumed OPGW overlay {line.line_name}", regional_transmission_line_id=line.id, overlay_type="assumed_OPGW", confidence_level=assumption.confidence_level, status=assumption.status, notes="Assumed OPGW only; no actual fiber claim."))
    session.add_all(overlays)
    session.commit()
    return overlays


def _seed_rings(session: Session, owners: dict[str, RegionalUtilityOwner], assumptions: dict[str, AssumedOPGWRoute]) -> dict[str, RegionalIconRing]:
    specs = [
        ("Central Massachusetts ICON Ring", ["MA-WBS-ICON-01", "MA-AUB-ICON-01", "MA-MIL-ICON-01", "MA-WOR-ICON-01"], "RG-L143-MA-WBS-AUB", owners["National Grid-style owner"]),
        ("Eastern Massachusetts ICON Ring", ["MA-WOR-ICON-01", "MA-FRA-ICON-01", "MA-BOS-ICON-01"], "RG-MA-FRA-BOS", owners["Eversource-style owner"]),
        ("Rhode Island Tie Ring", ["RI-PVD-ICON-01", "MA-BOS-ICON-01", "MA-AUB-ICON-01"], "RG-RI-PVD-BOS", owners["National Grid-style owner"]),
        ("Connecticut ICON Ring", ["CT-HFD-ICON-01", "CT-NHV-ICON-01", "RI-PVD-ICON-01"], "RG-CT-HFD-NHV", owners["Eversource-style owner"]),
        ("Northern New England ICON Ring", ["NH-MAN-ICON-01", "VT-RUT-ICON-01", "ME-POR-ICON-01"], "RG-NH-MAN-VT-RUT", owners["Vermont utilities"]),
        ("Inter-Utility Shared Transport Ring", ["MA-BOS-ICON-01", "RI-PVD-ICON-01", "CT-HFD-ICON-01", "ME-POR-ICON-01"], "RG-MA-BOS-CT-HFD", owners["Internal planning owner"]),
        ("Leased Backup Transport Ring", ["ME-POR-ICON-01", "MA-BOS-ICON-01", "MA-WBS-ICON-01"], "RG-ME-POR-BOS", owners["Regional telecom provider"]),
    ]
    rings = {}
    for name, nodes, assumption_key, owner in specs:
        ring = session.exec(select(RegionalIconRing).where(RegionalIconRing.ring_name == name)).first()
        assumption = assumptions.get(assumption_key)
        if not ring:
            ring = RegionalIconRing(
                ring_name=name,
                nodes_json={"nodes": nodes},
                primary_fiber_path=f"Assumed public-reference path {assumption_key}",
                backup_fiber_path="Assumed diverse OPGW or leased backup planning option",
                assumed_opgw_route_ids_json={"assumed_opgw_route_ids": [assumption.id] if assumption else []},
                leased_service_backup_option="Fictional leased Ethernet backup option",
                timing_source="Synthetic GPS/PTP timing source placeholder",
                circuit_count=0,
                status="synthetic_planning",
                owner_id=owner.id,
                access_controls_json={"owner": owner.owner_name, "visibility": "internal planning only"},
                notes="Synthetic ICON ring for RegionalGrid planning demo; not actual utility topology.",
            )
            session.add(ring)
            session.commit()
            session.refresh(ring)
        rings[name] = ring
    return rings


def _seed_synthetic_circuits(session: Session, owners: dict[str, RegionalUtilityOwner], rings: dict[str, RegionalIconRing]) -> list[RegionalSyntheticCircuit]:
    if session.exec(select(RegionalSyntheticCircuit)).first():
        return session.exec(select(RegionalSyntheticCircuit).order_by(RegionalSyntheticCircuit.circuit_id)).all()
    examples = [
        ("87L-MA-WBS-AUB-001", "87L", "MA-WBS", "MA-AUB", "MA-WBS-ICON-01", "MA-AUB-ICON-01", "C37.94-1", "C37.94-1", "Central Massachusetts ICON Ring", "C37.94 / 87L line differential", "critical", "private_fiber_synthetic", owners["National Grid-style owner"]),
        ("DTT-MA-AUB-MIL-001", "DTT", "MA-AUB", "MA-MIL", "MA-AUB-ICON-01", "MA-MIL-ICON-01", "C37.94-2", "C37.94-2", "Central Massachusetts ICON Ring", "direct transfer trip", "critical", "private_fiber_synthetic", owners["National Grid-style owner"]),
        ("SCADA-MA-WOR-FDR12-001", "SCADA", "MA-WOR", "FDR12 field device group", "MA-WOR-ICON-01", "FIELD-FDR12", "ETH-1", "ETH-1", "Central Massachusetts ICON Ring", "distribution automation SCADA", "high", "private_fiber_synthetic", owners["National Grid-style owner"]),
        ("ETH-MA-FRA-BOS-001", "Ethernet_Pipe", "MA-FRA", "MA-BOS", "MA-FRA-ICON-01", "MA-BOS-ICON-01", "ETH-1", "ETH-1", "Eastern Massachusetts ICON Ring", "Ethernet pipe", "high", "private_fiber_synthetic", owners["Eversource-style owner"]),
        ("DS1-MIG-MA-WBS-CTRL-001", "DS1_migration", "MA-WBS", "Control center placeholder", "MA-WBS-ICON-01", "CTRL-NID", "DS1-1", "DS1-1", "Leased Backup Transport Ring", "leased DS1 migration candidate", "normal", "leased_service_migration_synthetic", owners["Regional telecom provider"]),
        ("VSN-RI-PVD-MA-BOS-001", "VSN", "RI-PVD", "MA-BOS", "RI-PVD-ICON-01", "MA-BOS-ICON-01", "ETH-2", "ETH-2", "Rhode Island Tie Ring", "VSN / Ethernet transport service", "high", "joint_owner_synthetic", owners["Internal planning owner"]),
        ("PTP-CT-HFD-NHV-001", "PTP", "CT-HFD", "CT-NHV", "CT-HFD-ICON-01", "CT-NHV-ICON-01", "TIMING-1", "TIMING-1", "Connecticut ICON Ring", "timing service", "critical", "private_fiber_synthetic", owners["Eversource-style owner"]),
        ("MB-NH-MAN-VT-RUT-001", "Mirrored_Bits", "NH-MAN", "VT-RUT", "NH-MAN-ICON-01", "VT-RUT-ICON-01", "C37.94-1", "C37.94-1", "Northern New England ICON Ring", "Mirrored Bits service", "critical", "joint_owner_synthetic", owners["Vermont utilities"]),
        ("LEASED-BKUP-ME-POR-BOS-001", "leased_Ethernet_backup", "ME-POR", "MA-BOS", "ME-POR-ICON-01", "MA-BOS-ICON-01", "NID-1", "NID-1", "Leased Backup Transport Ring", "leased Ethernet backup service", "high", "leased_service_synthetic", owners["Regional telecom provider"]),
        ("PMU-VT-RUT-MA-BOS-001", "PMU", "VT-RUT", "MA-BOS", "VT-RUT-ICON-01", "MA-BOS-ICON-01", "ETH-3", "ETH-3", "Inter-Utility Shared Transport Ring", "synchrophasor data circuit", "high", "joint_owner_synthetic", owners["Internal planning owner"]),
    ]
    service_pool = [
        ("87L", "line differential", "critical"),
        ("DTT", "direct transfer trip", "critical"),
        ("Mirrored_Bits", "mirrored bits", "critical"),
        ("C37.94", "relay channel", "critical"),
        ("permissive_transfer_trip", "permissive transfer trip", "critical"),
        ("blocking_scheme", "blocking scheme communications", "critical"),
        ("RTU_backhaul", "RTU backhaul", "high"),
        ("distribution_SCADA", "distribution automation SCADA", "high"),
        ("recloser_aggregation", "recloser aggregation", "high"),
        ("capacitor_controller", "capacitor bank controller backhaul", "normal"),
        ("voltage_regulator", "voltage regulator controller backhaul", "normal"),
        ("substation_LAN", "substation LAN extension", "high"),
        ("DS1_migration", "DS1 migration", "normal"),
        ("DS0_grooming", "DS0 grooming", "normal"),
        ("analog_4wire", "analog 4-wire leased replacement", "normal"),
        ("FXO_FXS", "FXO/FXS replacement", "normal"),
        ("pilot_wire_replacement", "pilot wire replacement", "high"),
        ("Ethernet_Pipe", "Ethernet pipe", "high"),
        ("VLAN", "VLAN service", "normal"),
        ("SCADA_VLAN", "SCADA VLAN", "high"),
        ("engineering_access_VLAN", "engineering access VLAN", "normal"),
        ("NMS_VLAN", "NMS VLAN", "normal"),
        ("relay_engineering_VLAN", "relay engineering VLAN", "high"),
        ("PMU", "PMU/synchrophasor circuit", "high"),
        ("IRIG_B", "IRIG-B distribution", "critical"),
        ("PTP", "IEEE 1588 PTP timing", "critical"),
        ("Stratum_1_timing", "Stratum 1 timing extension", "critical"),
        ("GPS_backup_timing", "GPS backup timing", "critical"),
        ("leased_Ethernet_backup", "leased Ethernet backup", "high"),
        ("leased_DS1_pending_migration", "leased DS1 pending migration", "normal"),
    ]
    node_pairs = [
        ("MA-WBS", "MA-AUB", "Central Massachusetts ICON Ring", owners["National Grid-style owner"]),
        ("MA-AUB", "MA-MIL", "Central Massachusetts ICON Ring", owners["National Grid-style owner"]),
        ("MA-WOR", "MA-WBS", "Central Massachusetts ICON Ring", owners["National Grid-style owner"]),
        ("MA-FRA", "MA-BOS", "Eastern Massachusetts ICON Ring", owners["Eversource-style owner"]),
        ("RI-PVD", "MA-BOS", "Rhode Island Tie Ring", owners["National Grid-style owner"]),
        ("CT-HFD", "CT-NHV", "Connecticut ICON Ring", owners["Eversource-style owner"]),
        ("CT-NHV", "RI-PVD", "Connecticut ICON Ring", owners["Avangrid-style owner"]),
        ("NH-MAN", "VT-RUT", "Northern New England ICON Ring", owners["Unitil-style owner"]),
        ("VT-RUT", "ME-POR", "Northern New England ICON Ring", owners["Vermont utilities"]),
        ("ME-POR", "MA-BOS", "Leased Backup Transport Ring", owners["Regional telecom provider"]),
    ]
    generated = list(examples)
    for index in range(30):
        service_type, label, criticality = service_pool[index % len(service_pool)]
        a_site, z_site, ring_name, owner = node_pairs[index % len(node_pairs)]
        circuit_id = f"{service_type.upper().replace('_', '-')}-{a_site}-{z_site}-{index + 2:03d}"
        generated.append((circuit_id, service_type, a_site, z_site, f"{a_site}-ICON-01", f"{z_site}-ICON-01", f"PORT-{(index % 4) + 1}", f"PORT-{(index % 4) + 1}", ring_name, label, criticality, "synthetic_assumed_overlay", owner))
    circuits: list[RegionalSyntheticCircuit] = []
    for index, (circuit_id, service_type, a_site, z_site, a_node, z_node, a_port, z_port, ring_name, label, criticality, ownership, owner) in enumerate(generated[:40], start=1):
        ring = rings[ring_name]
        path_label = "low_confidence_assumed_OPGW" if index % 11 == 0 else "synthetic_assumed"
        status = "pending_host_approval" if index in {6, 10, 31, 36} else "field_verification_pending" if index % 9 == 0 else "synthetic_planning"
        circuit = RegionalSyntheticCircuit(
            circuit_id=circuit_id,
            service_type=service_type,
            ownership_type=ownership,
            a_end_site=a_site,
            z_end_site=z_site,
            a_end_icon_node=a_node,
            z_end_icon_node=z_node,
            a_end_port=a_port,
            z_end_port=z_port,
            primary_path=f"{ring.primary_fiber_path}; assumed OPGW planning option",
            backup_path=ring.backup_fiber_path if "leased" not in service_type.lower() else "Fictional leased carrier backup option",
            assumed_or_verified_path=path_label,
            latency_requirement_ms=8 if criticality == "critical" else 25,
            measured_latency_ms=3.0 + (index % 12) * 0.8,
            protection_class=label,
            criticality=criticality,
            owner_id=owner.id,
            access_group=owner.owner_name,
            status=status,
            ring_id=ring.id,
            notes="Synthetic RegionalGrid SEL ICON-related circuit. Fictional demo data; no real private telecom topology claimed.",
        )
        session.add(circuit)
        circuits.append(circuit)
    session.commit()
    for ring in rings.values():
        ring.circuit_count = len([c for c in circuits if c.ring_id == ring.id])
        session.add(ring)
    session.commit()
    return circuits


def _seed_regional_work_orders(session: Session, users: dict[str, User], internal_subs: dict[str, Substation], circuits: list[RegionalSyntheticCircuit]) -> list[WorkOrder]:
    specs = [
        ("WO-REG-2026-0101", "Install MA-WBS to MA-AUB C37.94 service", "regional_icon_install", "critical", "MA-WBS", circuits[0]),
        ("WO-REG-2026-0102", "Add backup path for DTT MA-AUB to MA-MIL", "regional_backup_path", "critical", "MA-AUB", circuits[1]),
        ("WO-REG-2026-0103", "Turn up Ethernet pipe MA-FRA to MA-BOS", "regional_ethernet_turnup", "high", "MA-FRA", circuits[3]),
        ("WO-REG-2026-0104", "Migrate leased DS1 at MA-WBS", "regional_leased_migration", "high", "MA-WBS", circuits[4]),
        ("WO-REG-2026-0105", "Verify timing alarm at AUB", "regional_timing_verification", "high", "MA-AUB", circuits[6]),
        ("WO-REG-2026-0106", "OTDR assumed OPGW segment on Line 143", "regional_otdr_assumed_opgw", "normal", "MA-WBS", circuits[0]),
        ("WO-REG-2026-0107", "Validate regional substation linkage from OpenGridWorks import", "regional_import_review", "normal", "MA-WBS", None),
        ("WO-REG-2026-0108", "Field verify assumed OPGW on selected 115 kV corridor", "regional_field_verify_assumption", "high", "MA-AUB", circuits[1]),
        ("WO-REG-2026-0109", "Install distribution automation SCADA aggregation", "regional_scada_aggregation", "high", "MA-WOR", circuits[2]),
        ("WO-REG-2026-0110", "Provider turnup for leased backup path", "regional_provider_turnup", "normal", "ME-POR", circuits[8]),
        ("WO-REG-2026-0111", "Cross-utility circuit approval for RI-PVD to MA-BOS", "regional_cross_utility_approval", "high", "RI-PVD", circuits[5]),
        ("WO-REG-2026-0112", "Reconcile operational API state after field closeout", "regional_reconciliation", "normal", "MA-BOS", circuits[9]),
    ]
    orders = []
    for number, title, work_type, priority, sub_code, circuit in specs:
        order = session.exec(select(WorkOrder).where(WorkOrder.work_order_number == number)).first()
        if not order:
            substation = internal_subs.get(sub_code)
            order = WorkOrder(work_order_number=number, title=title, description="RegionalGrid synthetic planning work order. Cross-utility/private telecom details remain internal and fictional.", work_type=work_type, priority=priority, status="host_approval_required" if "Cross-utility" in title else "assigned", requested_by_user_id=users["engineer"].id if users["engineer"] else None, assigned_engineer_id=users["joint_engineer"].id if users["joint_engineer"] else users["engineer"].id if users["engineer"] else None, assigned_field_tech_id=users["contractor"].id if "Field verify" in title or "OTDR" in title else users["field_tech"].id if users["field_tech"] else None, substation_id=substation.id if substation else None, outage_required=priority == "critical", protection_impact="yes" if priority == "critical" else "no", customer_impact="synthetic planning only")
            session.add(order)
            session.commit()
            session.refresh(order)
            for task_number, task_title in enumerate(["Verify public-reference and synthetic planning labels.", "Confirm owner/access approvals.", "Perform field or engineering task.", "Upload evidence or closeout notes."], start=1):
                session.add(WorkOrderTask(work_order_id=order.id, task_number=task_number, task_title=task_title, assigned_to_user_id=order.assigned_field_tech_id, photo_required=task_number == 4, status="open"))
        orders.append(order)
    session.commit()
    return orders


def _link_circuits_to_work_orders(session: Session, circuits: list[RegionalSyntheticCircuit], orders: list[WorkOrder]) -> None:
    for circuit, order in zip(circuits[: len(orders)], orders):
        circuit.work_order_id = order.id
        session.add(circuit)
    session.commit()


def _seed_access(session: Session, users: dict[str, User], owners: dict[str, RegionalUtilityOwner], subs: dict[str, RegionalSubstation], lines: dict[str, RegionalTransmissionLine], orders: list[WorkOrder]) -> None:
    agreements = [
        ("National Grid host / Eversource tenant engineering", owners["National Grid-style owner"], owners["Eversource-style owner"], "tenant_engineering_propose_only", "transmission_lines,OPGW,SEL_ICON_nodes,circuits"),
        ("Eversource host / Avangrid read-only shared circuit", owners["Eversource-style owner"], owners["Avangrid-style owner"], "tenant_read_only", "substations,transmission_lines,circuits"),
        ("Regional contractor field installation", owners["Internal planning owner"], owners["Regional field contractor"], "field_installation_contractor", "work_orders,commissioning_records"),
        ("Provider demarc leased backup", owners["Internal planning owner"], owners["Regional telecom provider"], "provider_demarc_access", "leased_services,work_orders"),
        ("ISO-NE public reference view", owners["Internal planning owner"], owners["ISO-NE public reference viewer"], "emergency_view_only", "public_references"),
    ]
    for name, owning, accessing, access_type, scope in agreements:
        if not session.exec(select(RegionalAccessAgreement).where(RegionalAccessAgreement.agreement_name == name)).first():
            session.add(RegionalAccessAgreement(agreement_name=name, owning_utility_id=owning.id, accessing_utility_id=accessing.id, access_type=access_type, asset_scope=scope, effective_date=date(2026, 1, 1), status="active", notes="Seeded mixed-access agreement for RegionalGrid demo."))
    permission_specs = [
        (users["engineer"], owners["National Grid-style owner"], "admin"),
        (users["joint_engineer"], owners["National Grid-style owner"], "propose_change"),
        (users["joint_engineer"], owners["Eversource-style owner"], "propose_change"),
        (users["contractor"], owners["Regional field contractor"], "view"),
        (users["provider"], owners["Regional telecom provider"], "view"),
        (users["isone_viewer"], owners["ISO-NE public reference viewer"], "view"),
    ]
    for user, owner, access_level in permission_specs:
        if user and not session.exec(select(RegionalAssetPermission).where(RegionalAssetPermission.entity_type == "owner", RegionalAssetPermission.entity_id == owner.id, RegionalAssetPermission.user_id == user.id)).first():
            session.add(RegionalAssetPermission(entity_type="owner", entity_id=owner.id, utility_owner_id=owner.id, user_id=user.id, role_id=user.role, access_level=access_level, granted_by_user_id=users["admin"].id if users["admin"] else None, notes="Seeded utility-owner access membership."))
    session.commit()


def _seed_regional_proposed_changes(session: Session, users: dict[str, User], owners: dict[str, RegionalUtilityOwner], lines: dict[str, RegionalTransmissionLine]) -> None:
    if session.exec(select(ProposedChange).where(ProposedChange.change_number == "REG-PCR-2026-0001")).first():
        return
    target_line = lines["RG-RI-PVD-BOS"]
    session.add(
        ProposedChange(
            change_number="REG-PCR-2026-0001",
            title="Cross-utility proposed ICON VSN service RI-PVD to MA-BOS",
            description="Synthetic cross-utility proposed change requiring host owner approval.",
            change_type="add_icon_service",
            target_entity_type="regional_transmission_line",
            target_entity_id=target_line.id,
            source_state="proposed",
            proposed_state_json={"service_type": "VSN", "circuit_id": "VSN-RI-PVD-MA-BOS-001", "affected_owner_ids": [owners["National Grid-style owner"].id, owners["Eversource-style owner"].id], "synthetic": True, "public_reference_only": False},
            reason="RegionalGrid synthetic planning demo.",
            risk_level="high",
            engineering_status="under_engineering_review",
            approval_status="pending_approval",
            requested_by_user_id=users["joint_engineer"].id if users["joint_engineer"] else None,
            assigned_engineer_id=users["engineer"].id if users["engineer"] else None,
        )
    )
    session.commit()


def _seed_commissioning(session: Session, users: dict[str, User], orders: list[WorkOrder]) -> None:
    for order in orders[:6]:
        if session.exec(select(CommissioningChecklist).where(CommissioningChecklist.entity_type == "work_order", CommissioningChecklist.entity_id == order.id)).first():
            continue
        checklist = CommissioningChecklist(checklist_name=f"Regional commissioning - {order.title}", entity_type="work_order", entity_id=order.id, checklist_type="regional_planning_field_verification", manual_reference="RegionalGrid internal standard placeholder", status="not_started", created_by_user_id=users["engineer"].id if users["engineer"] else None, assigned_to_user_id=order.assigned_field_tech_id, notes="RegionalGrid field verification checklist; no real protection settings.")
        session.add(checklist)
        session.commit()
        session.refresh(checklist)
        for item_number, task in enumerate(["Verify public-reference source and synthetic labels.", "Confirm owner/access agreement reference.", "Verify assumed OPGW or circuit path in field if assigned.", "Upload evidence and as-built notes."], start=1):
            session.add(CommissioningChecklistItem(checklist_id=checklist.id, item_number=item_number, category="Regional verification", task_text=task, expected_result="Evidence supports planning/as-built decision.", status="not_started"))
    session.commit()


def _county_for_city(city: str) -> str:
    return {
        "Webster": "Worcester",
        "Auburn": "Worcester",
        "Millbury": "Worcester",
        "Worcester": "Worcester",
        "Framingham": "Middlesex",
        "Boston": "Suffolk",
        "Providence": "Providence",
        "Hartford": "Hartford",
        "New Haven": "New Haven",
        "Manchester": "Hillsborough",
        "Rutland": "Rutland",
        "Portland": "Cumberland",
    }.get(city, "Unknown")


def _norm(value: str) -> str:
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in value).split())
