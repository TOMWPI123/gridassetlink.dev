from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.auth.security import hash_password
from app.database import create_db_and_tables, engine
from app.models import (
    Circuit,
    CircuitPath,
    CircuitPathElement,
    CommissioningChecklist,
    CommissioningChecklistItem,
    Device,
    DevicePort,
    DistributionFeeder,
    FiberAssignment,
    FiberCable,
    FiberSplice,
    FiberStrand,
    IconEngineeringProfile,
    IconModule,
    IconNode,
    IconProposedService,
    IconServiceTemplate,
    IconSlot,
    LeasedService,
    PatchPanel,
    PatchPanelPort,
    ProposedChange,
    ProposedChangeDiff,
    Provider,
    QRCode,
    Rack,
    SQLReport,
    SpliceClosure,
    SpliceTray,
    Substation,
    TimingSource,
    TransmissionLine,
    User,
    WorkOrder,
    WorkOrderMaterial,
    WorkOrderTask,
    WorkOrderUpdate,
)
from app.reports.saved_reports import SAVED_REPORTS

DEMO_USERS = [
    ("admin@example.com", "Admin Demo", "admin", "admin123"),
    ("engineer@example.com", "Engineer Demo", "engineer", "engineer123"),
    ("fieldtech@example.com", "Field Tech Demo", "field_tech", "fieldtech123"),
    ("viewer@example.com", "Viewer Demo", "viewer", "viewer123"),
    ("sqlanalyst@example.com", "SQL Analyst Demo", "sql_analyst", "sql123"),
]

COLORS = ["blue", "orange", "green", "brown", "slate", "white", "red", "black", "yellow", "violet", "rose", "aqua"]


def seed_database() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        if session.exec(select(User)).first():
            _seed_deviceops_addons(session)
            from app.seed.regional_seed import seed_regional_grid_addons

            seed_regional_grid_addons(session)
            return
        users = [User(email=email, full_name=name, role=role, password_hash=hash_password(password)) for email, name, role, password in DEMO_USERS]
        session.add_all(users)
        session.commit()
        for user in users:
            session.refresh(user)
        _, engineer, field_tech, _, _ = users

        providers = [
            Provider(provider_name="Internal Utility Fiber", provider_type="utility_owned", noc_phone="555-0100"),
            Provider(provider_name="Verizon", provider_type="telecom_carrier", account_number="VZ-CTRL-8842"),
            Provider(provider_name="Lumen", provider_type="telecom_carrier", account_number="LMN-2271"),
            Provider(provider_name="Crown Castle", provider_type="fiber_provider"),
            Provider(provider_name="Comcast Business", provider_type="ISP"),
        ]
        session.add_all(providers)
        session.commit()
        for item in providers:
            session.refresh(item)

        substations = [
            Substation(substation_code="WBS", name="Webster Substation", voltage_level="115/13.8 kV", region="Central MA", latitude=42.0501, longitude=-71.8809, status="active"),
            Substation(substation_code="AUB", name="Auburn Substation", voltage_level="115/13.8 kV", region="Central MA", latitude=42.1945, longitude=-71.8356, status="active"),
            Substation(substation_code="MIL", name="Millbury Substation", voltage_level="115/13.8 kV", region="Central MA", latitude=42.1934, longitude=-71.7606, status="active"),
            Substation(substation_code="OXF", name="Oxford Substation", voltage_level="69/13.8 kV", region="Central MA", latitude=42.1168, longitude=-71.8648, status="planned"),
        ]
        session.add_all(substations)
        session.commit()
        for item in substations:
            session.refresh(item)
        wbs, aub, mil, oxf = substations

        racks = [Rack(substation_id=s.id, rack_name=f"{s.substation_code}-TELCO-R1", room="Control house", rack_unit_count=44) for s in substations]
        session.add_all(racks)
        session.commit()
        for item in racks:
            session.refresh(item)

        lines = [
            TransmissionLine(line_name="Line 143", voltage_kv=115, from_substation_id=wbs.id, to_substation_id=aub.id, structure_start="143-001", structure_end="143-084", owner="Fictional Electric Utility", status="active"),
            TransmissionLine(line_name="Line 172", voltage_kv=115, from_substation_id=aub.id, to_substation_id=mil.id, structure_start="172-001", structure_end="172-061", owner="Fictional Electric Utility", status="active"),
        ]
        feeders = [
            DistributionFeeder(feeder_name="F12", source_substation_id=wbs.id, voltage_kv=13.8, feeder_type="overhead", region="Webster", status="active"),
            DistributionFeeder(feeder_name="F07", source_substation_id=aub.id, voltage_kv=13.8, feeder_type="mixed", region="Auburn", status="active"),
        ]
        session.add_all(lines + feeders)
        session.commit()
        for item in lines + feeders:
            session.refresh(item)

        cables = [
            FiberCable(cable_id="OPGW-L143-WBS-AUB-48F", cable_type="OPGW", fiber_count=48, owner="Internal Utility Fiber", manufacturer="Fictional Fiberworks", model="OPGW-48-SM", a_end_location="Webster control house FPP-01", z_end_location="Auburn control house FPP-01", a_end_substation_id=wbs.id, z_end_substation_id=aub.id, transmission_line_id=lines[0].id, route_name="Line 143 Webster-Auburn", route_miles=13.4, status="active"),
            FiberCable(cable_id="OPGW-L172-AUB-MIL-72F", cable_type="OPGW", fiber_count=72, owner="Internal Utility Fiber", manufacturer="Fictional Fiberworks", model="OPGW-72-SM", a_end_location="Auburn control house FPP-01", z_end_location="Millbury control house FPP-01", a_end_substation_id=aub.id, z_end_substation_id=mil.id, transmission_line_id=lines[1].id, route_name="Line 172 Auburn-Millbury", route_miles=9.2, status="active"),
            FiberCable(cable_id="DIST-FIBER-F12-24F", cable_type="aerial_distribution_fiber", fiber_count=24, owner="Internal Utility Fiber", manufacturer="Fictional Fiberworks", model="ADSS-24-SM", a_end_location="Webster F12 fiber panel", z_end_location="REC-F12-004 field cabinet", a_end_substation_id=wbs.id, distribution_feeder_id=feeders[0].id, route_name="F12 DA backbone", route_miles=4.7, status="active"),
            FiberCable(cable_id="DIST-FIBER-F07-12F", cable_type="underground_distribution_fiber", fiber_count=12, owner="Internal Utility Fiber", a_end_location="Auburn F07 cabinet", z_end_location="F07 loop handhole", a_end_substation_id=aub.id, distribution_feeder_id=feeders[1].id, route_name="F07 underground loop", route_miles=2.8, status="active"),
        ]
        session.add_all(cables)
        session.commit()
        for item in cables:
            session.refresh(item)

        strands = []
        for cable in cables:
            for number in range(1, cable.fiber_count + 1):
                status_value = "available"
                service = None
                if cable.cable_id.startswith("OPGW-L143") and number <= 8:
                    status_value, service = "assigned", "SEL ICON protection transport"
                if cable.cable_id.startswith("OPGW-L172") and number <= 6:
                    status_value, service = "assigned", "SEL ICON ring transport"
                if cable.cable_id.startswith("DIST-FIBER-F12") and number in {1, 2}:
                    status_value, service = "assigned", "SCADA-F12-REC004"
                if cable.cable_id.startswith("DIST-FIBER-F07") and number == 7:
                    status_value = "faulted"
                strand_color = COLORS[(number - 1) % 12]
                tube_color = COLORS[((number - 1) // 12) % 12]
                strands.append(FiberStrand(fiber_cable_id=cable.id, strand_number=number, tube_number=((number - 1) // 12) + 1, color=strand_color, strand_color=strand_color, buffer_tube_color=tube_color, status=status_value, assigned_service=service, a_end_label=f"{cable.cable_id}-{number:02d}A", z_end_label=f"{cable.cable_id}-{number:02d}Z"))
        session.add_all(strands)
        session.commit()

        closures = [
            SpliceClosure(closure_id="SPL-L143-022", closure_type="OPGW_splice_box", site_or_structure="Structure 143-022", location_name="Line 143 structure 022", structure_number="143-022", latitude=42.1073, longitude=-71.8588, manufacturer="Fictional Splice", model="OPGW dome 48", install_date=date(2024, 8, 14), status="active"),
            SpliceClosure(closure_id="SPL-L143-044", closure_type="OPGW_splice_box", site_or_structure="Structure 143-044", location_name="Line 143 structure 044", structure_number="143-044", latitude=42.1424, longitude=-71.8462, manufacturer="Fictional Splice", model="OPGW dome 48", install_date=date(2024, 8, 16), status="active"),
            SpliceClosure(closure_id="SPL-F12-004", closure_type="pole_splice_case", site_or_structure="Pole F12-004", location_name="F12 pole 004", pole_number="F12-004", latitude=42.0625, longitude=-71.8564, manufacturer="Fictional Splice", model="Pole case 24", install_date=date(2025, 3, 7), status="active"),
            SpliceClosure(closure_id="SPL-L172-018", closure_type="OPGW_splice_box", site_or_structure="Structure 172-018", location_name="Line 172 structure 018", structure_number="172-018", latitude=42.1907, longitude=-71.7992, manufacturer="Fictional Splice", model="OPGW dome 72", install_date=date(2024, 9, 4), status="active"),
        ]
        panels = [
            PatchPanel(panel_id="WBS-FPP-01", substation_id=wbs.id, rack_id=racks[0].id, panel_name="Webster Fiber Panel", fiber_type="singlemode", connector_type="LC", port_count=48),
            PatchPanel(panel_id="AUB-FPP-01", substation_id=aub.id, rack_id=racks[1].id, panel_name="Auburn Fiber Panel", fiber_type="singlemode", connector_type="LC", port_count=72),
            PatchPanel(panel_id="MIL-FPP-01", substation_id=mil.id, rack_id=racks[2].id, panel_name="Millbury Fiber Panel", fiber_type="singlemode", connector_type="LC", port_count=72),
        ]
        session.add_all(closures + panels)
        session.commit()
        for item in closures + panels:
            session.refresh(item)
        session.add_all([PatchPanelPort(patch_panel_id=panel.id, port_number=n, port_label=f"{panel.panel_id}-{n:02d}", status="available") for panel in panels for n in range(1, panel.port_count + 1)])
        session.commit()

        trays = [
            SpliceTray(splice_closure_id=closures[0].id, tray_number=1, tray_type="OPGW 12-position", capacity=12, notes="Line 143 express-through tray"),
            SpliceTray(splice_closure_id=closures[1].id, tray_number=1, tray_type="OPGW 12-position", capacity=12, notes="Line 143 express-through tray"),
            SpliceTray(splice_closure_id=closures[2].id, tray_number=1, tray_type="distribution 12-position", capacity=12, notes="F12 DA breakout tray"),
        ]
        session.add_all(trays)
        session.commit()
        for item in trays:
            session.refresh(item)

        def strand_for(cable: FiberCable, number: int) -> FiberStrand:
            return session.exec(select(FiberStrand).where(FiberStrand.fiber_cable_id == cable.id, FiberStrand.strand_number == number)).one()

        splices: list[FiberSplice] = []
        for closure_index, tray in [(0, trays[0]), (1, trays[1])]:
            for position, strand_number in enumerate([1, 2, 3, 4], start=1):
                strand = strand_for(cables[0], strand_number)
                splices.append(FiberSplice(splice_closure_id=closures[closure_index].id, splice_tray_id=tray.id, tray_position=position, incoming_fiber_cable_id=cables[0].id, incoming_strand_id=strand.id, incoming_strand_number=strand_number, outgoing_fiber_cable_id=cables[0].id, outgoing_strand_id=strand.id, outgoing_strand_number=strand_number, splice_type="express_through", loss_db=0.04, test_date=date(2026, 2, 10 + closure_index), status="complete", notes="Continuity splice for Line 143 active transport fibers"))
        for position, strand_number in enumerate([1, 2], start=1):
            strand = strand_for(cables[2], strand_number)
            splices.append(FiberSplice(splice_closure_id=closures[2].id, splice_tray_id=trays[2].id, tray_position=position, incoming_fiber_cable_id=cables[2].id, incoming_strand_id=strand.id, incoming_strand_number=strand_number, outgoing_fiber_cable_id=cables[2].id, outgoing_strand_id=strand.id, outgoing_strand_number=strand_number, splice_type="breakout", loss_db=0.08, test_date=date(2026, 3, 3), status="complete", notes="Breakout to REC-F12-004 cabinet"))
        session.add_all(splices)
        session.commit()
        for item in splices:
            session.refresh(item)

        devices = [
            Device(device_name="WBS-ICON-01", device_type="SEL_ICON", manufacturer="SEL", model="ICON", firmware_version="4.2.1", substation_id=wbs.id, rack_id=racks[0].id, ip_address="10.14.3.10", status="active", criticality="critical"),
            Device(device_name="AUB-ICON-01", device_type="SEL_ICON", manufacturer="SEL", model="ICON", firmware_version="4.2.1", substation_id=aub.id, rack_id=racks[1].id, ip_address="10.14.3.20", status="active", criticality="critical"),
            Device(device_name="MIL-ICON-01", device_type="SEL_ICON", manufacturer="SEL", model="ICON", firmware_version="4.2.1", substation_id=mil.id, rack_id=racks[2].id, ip_address="10.14.3.30", status="active", criticality="critical"),
            Device(device_name="WBS-RTR-01", device_type="router", manufacturer="Cisco", model="ISR", substation_id=wbs.id, rack_id=racks[0].id, ip_address="10.14.4.1", status="active", criticality="high"),
            Device(device_name="WBS-SEL411L-01", device_type="relay", manufacturer="SEL", model="411L", substation_id=wbs.id, rack_id=racks[0].id, status="active", criticality="critical"),
            Device(device_name="AUB-SEL411L-01", device_type="relay", manufacturer="SEL", model="411L", substation_id=aub.id, rack_id=racks[1].id, status="active", criticality="critical"),
            Device(device_name="REC-F12-004", device_type="recloser_controller", manufacturer="SEL", model="651R", substation_id=wbs.id, location_description="F12 pole 004", status="active", criticality="high"),
            Device(device_name="CTRL-NID-ETH-01", device_type="provider_NID", manufacturer="Provider", model="Ethernet NID", substation_id=mil.id, status="active", criticality="normal"),
        ]
        session.add_all(devices)
        session.commit()
        for item in devices:
            session.refresh(item)
        wbs_icon, aub_icon, mil_icon, wbs_router, wbs_relay, aub_relay, recloser, provider_nid = devices

        timing = TimingSource(source_name="WBS GPS Clock", source_type="GPS", substation_id=wbs.id, device_id=wbs_icon.id, accuracy_class="Stratum 1", primary_or_backup="primary", status="active")
        session.add(timing)
        session.commit()
        session.refresh(timing)
        nodes = [
            IconNode(device_id=wbs_icon.id, node_name="WBS-ICON-01", chassis_type="ICON rack chassis", transport_mode="hybrid", timing_source_id=timing.id, icon_network_name="Central MA ICON Ring", firmware_version="4.2.1", management_ip="10.14.3.10", status="active"),
            IconNode(device_id=aub_icon.id, node_name="AUB-ICON-01", chassis_type="ICON rack chassis", transport_mode="hybrid", icon_network_name="Central MA ICON Ring", firmware_version="4.2.1", management_ip="10.14.3.20", status="active"),
            IconNode(device_id=mil_icon.id, node_name="MIL-ICON-01", chassis_type="ICON compact node", transport_mode="Ethernet", icon_network_name="Central MA ICON Ring", firmware_version="4.2.1", management_ip="10.14.3.30", status="active"),
        ]
        session.add_all(nodes)
        session.commit()
        for node in nodes:
            session.refresh(node)
            for slot, module_type in [(1, "SONET_line"), (2, "C37_94"), (3, "Ethernet_transport")]:
                module = IconModule(icon_node_id=node.id, slot_number=slot, module_type=module_type, model=f"ICON {module_type}", port_count=4, service_role="transport", status="active")
                session.add(module)
                session.commit()
                session.refresh(module)
                session.add(IconSlot(icon_node_id=node.id, slot_number=slot, module_id=module.id))

        ports = [
            DevicePort(device_id=wbs_icon.id, port_name="LINE-1", port_type="fiber", speed="OC-3", connector_type="LC", port_role="transport_a_end", physical_label="WBS ICON LINE 1", status="assigned"),
            DevicePort(device_id=aub_icon.id, port_name="LINE-1", port_type="fiber", speed="OC-3", connector_type="LC", port_role="transport_z_end", physical_label="AUB ICON LINE 1", status="assigned"),
            DevicePort(device_id=wbs_relay.id, port_name="C37.94-1", port_type="C37.94", speed="64k", connector_type="LC", port_role="protection_a_end", physical_label="WBS 411L C37.94", status="assigned"),
            DevicePort(device_id=aub_relay.id, port_name="C37.94-1", port_type="C37.94", speed="64k", connector_type="LC", port_role="protection_z_end", physical_label="AUB 411L C37.94", status="assigned"),
            DevicePort(device_id=recloser.id, port_name="ETH-1", port_type="ethernet", speed="100M", connector_type="RJ45", port_role="field_device", physical_label="REC004 ETH1", status="assigned"),
            DevicePort(device_id=provider_nid.id, port_name="UNI-1", port_type="ethernet", speed="100M", connector_type="RJ45", port_role="provider_handoff", physical_label="NID UNI", status="assigned"),
            DevicePort(device_id=wbs_router.id, port_name="Gi0/1", port_type="fiber", speed="1G", connector_type="LC", port_role="scada_headend", physical_label="WBS RTR Gi0/1", status="assigned"),
        ]
        session.add_all(ports)
        session.commit()
        for item in ports:
            session.refresh(item)

        circuits = [
            Circuit(circuit_id="87L-WBS-AUB-001", circuit_name="Webster to Auburn line differential protection", service_type="87L", transport_type="C37.94 over SEL ICON", ownership_type="private_fiber", provider_id=providers[0].id, a_end_site_id=wbs.id, z_end_site_id=aub.id, a_end_device_id=wbs_relay.id, z_end_device_id=aub_relay.id, a_end_port_id=ports[2].id, z_end_port_id=ports[3].id, bandwidth="64 kbps", latency_requirement_ms=8, measured_latency_ms=3.4, criticality="critical", status="in_service"),
            Circuit(circuit_id="DTT-WBS-AUB-001", circuit_name="Webster Auburn direct transfer trip", service_type="DTT", transport_type="SEL ICON TDM", ownership_type="private_fiber", provider_id=providers[0].id, a_end_site_id=wbs.id, z_end_site_id=aub.id, criticality="critical", status="testing"),
            Circuit(circuit_id="SCADA-F12-REC004", circuit_name="F12 recloser REC004 SCADA", service_type="SCADA", transport_type="Ethernet", ownership_type="private_fiber", provider_id=providers[0].id, a_end_site_id=wbs.id, a_end_device_id=wbs_router.id, z_end_device_id=recloser.id, a_end_port_id=ports[6].id, z_end_port_id=ports[4].id, bandwidth="100 Mbps", criticality="high", status="installing"),
            Circuit(circuit_id="LEASED-ETH-CTRL-001", circuit_name="Control center leased Ethernet handoff", service_type="leased_Ethernet", transport_type="Ethernet", ownership_type="leased_service", provider_id=providers[1].id, a_end_site_id=mil.id, a_end_device_id=provider_nid.id, bandwidth="100 Mbps", monthly_cost=1850, contract_start=date(2025, 7, 1), contract_end=date(2026, 10, 1), renewal_date=date(2026, 7, 1), criticality="high", status="ordered"),
            Circuit(circuit_id="LEASED-DS1-RTU-002", circuit_name="Legacy leased DS1 RTU pending migration", service_type="leased_T1", transport_type="DS1", ownership_type="leased_service", provider_id=providers[2].id, bandwidth="1.544 Mbps", monthly_cost=950, contract_end=date.today() + timedelta(days=120), renewal_date=date.today() + timedelta(days=60), migration_status="pending ICON migration", criticality="normal", status="in_service"),
            Circuit(circuit_id="ICON-RING-WBS-AUB-MIL", circuit_name="Central MA SEL ICON transport ring", service_type="SEL_ICON_transport", transport_type="hybrid", ownership_type="utility_owned_transport", provider_id=providers[0].id, a_end_site_id=wbs.id, z_end_site_id=mil.id, a_end_device_id=wbs_icon.id, z_end_device_id=mil_icon.id, bandwidth="OC-3 / 1G Ethernet", criticality="critical", status="in_service"),
        ]
        session.add_all(circuits)
        session.commit()
        for item in circuits:
            session.refresh(item)

        def path(circuit: Circuit, name: str, role: str, labels: list[tuple[str, int | None, str]]) -> None:
            p = CircuitPath(circuit_id=circuit.id, path_name=name, path_role=role, diversity_group=role, is_active=role == "primary")
            session.add(p)
            session.commit()
            session.refresh(p)
            for index, (kind, element_id, label) in enumerate(labels, start=1):
                session.add(CircuitPathElement(circuit_path_id=p.id, sequence_number=index, element_type=kind, element_id=element_id, element_label=label, latency_ms=0.5))

        path(circuits[0], "87L primary OPGW route", "primary", [("device", wbs_relay.id, "WBS-SEL411L-01"), ("patch_panel", panels[0].id, "WBS-FPP-01"), ("fiber_cable", cables[0].id, "OPGW-L143-WBS-AUB-48F"), ("splice_closure", closures[0].id, "SPL-L143-022"), ("splice_closure", closures[1].id, "SPL-L143-044"), ("patch_panel", panels[1].id, "AUB-FPP-01"), ("device", aub_relay.id, "AUB-SEL411L-01")])
        path(circuits[0], "87L diverse leased backup", "diverse_backup", [("provider_handoff", providers[1].id, "Verizon protected Ethernet"), ("leased_service", None, "Emergency leased backup placeholder")])
        path(circuits[1], "DTT primary OPGW route", "primary", [("fiber_cable", cables[0].id, "OPGW-L143-WBS-AUB-48F"), ("splice_closure", closures[0].id, "SPL-L143-022"), ("splice_closure", closures[1].id, "SPL-L143-044")])
        path(circuits[2], "F12 distribution fiber route", "primary", [("patch_panel", panels[0].id, "WBS-FPP-01"), ("fiber_cable", cables[2].id, "DIST-FIBER-F12-24F"), ("splice_closure", closures[2].id, "SPL-F12-004"), ("device", recloser.id, "REC-F12-004")])
        path(circuits[5], "ICON ring WBS-AUB-MIL", "primary", [("device", wbs_icon.id, "WBS-ICON-01"), ("patch_panel", panels[0].id, "WBS-FPP-01"), ("fiber_cable", cables[0].id, "OPGW-L143-WBS-AUB-48F"), ("splice_closure", closures[0].id, "SPL-L143-022"), ("splice_closure", closures[1].id, "SPL-L143-044"), ("device", aub_icon.id, "AUB-ICON-01"), ("fiber_cable", cables[1].id, "OPGW-L172-AUB-MIL-72F"), ("device", mil_icon.id, "MIL-ICON-01")])

        session.add_all([
            LeasedService(circuit_id=circuits[3].id, provider_id=providers[1].id, provider_circuit_id="VZ-ETH-CTRL-001", service_type="leased_Ethernet", bandwidth="100 Mbps", handoff_type="RJ45_Ethernet", monthly_cost=1850, contract_start=date(2025, 7, 1), contract_end=date(2026, 10, 1), status="ordered"),
            LeasedService(circuit_id=circuits[4].id, provider_id=providers[2].id, provider_circuit_id="LMN-DS1-RTU-002", service_type="leased_T1", bandwidth="1.544 Mbps", handoff_type="DS1_smart_jack", monthly_cost=950, contract_end=date.today() + timedelta(days=120), status="active"),
        ])

        now = datetime.now(timezone.utc)
        work_orders = [
            WorkOrder(work_order_number="WO-2026-0041", title="Install ICON C37.94 circuit for Webster to Auburn 87L", work_type="ICON_install", priority="critical", status="engineering_review", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=wbs.id, circuit_id=circuits[0].id, device_id=wbs_icon.id, fiber_cable_id=cables[0].id, planned_finish=now - timedelta(days=2), outage_required=True),
            WorkOrder(work_order_number="WO-2026-0042", title="Install distribution fiber service to recloser REC-F12-004", work_type="distribution_device_install", priority="high", status="in_progress", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=wbs.id, circuit_id=circuits[2].id, device_id=recloser.id, fiber_cable_id=cables[2].id),
            WorkOrder(work_order_number="WO-2026-0043", title="Leased Ethernet provider turnup waiting on provider", work_type="leased_service_turnup", priority="normal", status="waiting_on_provider", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=mil.id, circuit_id=circuits[3].id, provider_id=providers[1].id),
            WorkOrder(work_order_number="WO-2026-0044", title="OTDR test OPGW-L143 strands 1-12", work_type="OTDR_test", priority="normal", status="assigned", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=wbs.id, fiber_cable_id=cables[0].id),
            WorkOrder(work_order_number="WO-2026-0045", title="Migrate leased DS1 to SEL ICON transport", work_type="migration", priority="high", status="waiting_on_material", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=mil.id, circuit_id=circuits[4].id, provider_id=providers[2].id),
        ]
        session.add_all(work_orders)
        session.commit()
        for order in work_orders:
            session.refresh(order)

        def panel_port(panel: PatchPanel, number: int) -> PatchPanelPort:
            return session.exec(select(PatchPanelPort).where(PatchPanelPort.patch_panel_id == panel.id, PatchPanelPort.port_number == number)).one()

        fiber_links = [
            ("FA-ICON-L143-001", strand_for(cables[0], 1), circuits[5], wbs_icon, ports[0], panel_port(panels[0], 1), panel_port(panels[1], 1), panel_port(panels[0], 1), work_orders[0], "circuit_transport", "active", "SEL ICON transport circuit strand 1"),
            ("FA-ICON-L143-002", strand_for(cables[0], 2), circuits[5], aub_icon, ports[1], panel_port(panels[0], 2), panel_port(panels[1], 2), panel_port(panels[1], 2), work_orders[0], "circuit_transport", "active", "SEL ICON transport circuit strand 2"),
            ("FA-87L-L143-003", strand_for(cables[0], 3), circuits[0], wbs_relay, ports[2], panel_port(panels[0], 3), panel_port(panels[1], 3), panel_port(panels[0], 3), work_orders[0], "protection_path", "active", "C37.94 protection fiber A"),
            ("FA-87L-L143-004", strand_for(cables[0], 4), circuits[0], aub_relay, ports[3], panel_port(panels[0], 4), panel_port(panels[1], 4), panel_port(panels[1], 4), work_orders[0], "protection_path", "active", "C37.94 protection fiber B"),
            ("FA-SCADA-F12-001", strand_for(cables[2], 1), circuits[2], wbs_router, ports[6], panel_port(panels[0], 9), None, panel_port(panels[0], 9), work_orders[1], "SCADA", "installed", "Distribution automation SCADA headend fiber"),
            ("FA-SCADA-F12-002", strand_for(cables[2], 2), circuits[2], recloser, ports[4], panel_port(panels[0], 10), None, None, work_orders[1], "SCADA", "installed", "Distribution automation SCADA field fiber"),
        ]
        assignments = []
        for assignment_id, strand, circuit, device, device_port, a_panel_port, z_panel_port, device_panel_port, work_order, assignment_type, assignment_status, notes in fiber_links:
            strand.status = "assigned"
            strand.assigned_service = circuit.circuit_id
            strand.assigned_circuit_id = circuit.id
            strand.assigned_device_port_id = device_port.id
            strand.a_end_patch_panel_port_id = a_panel_port.id if a_panel_port else None
            strand.z_end_patch_panel_port_id = z_panel_port.id if z_panel_port else None
            strand.a_end_termination = a_panel_port.port_label if a_panel_port else strand.a_end_termination
            strand.z_end_termination = z_panel_port.port_label if z_panel_port else strand.z_end_termination
            if a_panel_port:
                a_panel_port.connected_fiber_strand_id = strand.id
                a_panel_port.fiber_strand_id = strand.id
                a_panel_port.status = "assigned"
                session.add(a_panel_port)
            if z_panel_port:
                z_panel_port.connected_fiber_strand_id = strand.id
                z_panel_port.fiber_strand_id = strand.id
                z_panel_port.status = "assigned"
                session.add(z_panel_port)
            if device_panel_port:
                device_panel_port.connected_device_port_id = device_port.id
                device_panel_port.status = "assigned"
                session.add(device_panel_port)
            device_port.connected_patch_panel_port_id = device_panel_port.id if device_panel_port else device_port.connected_patch_panel_port_id
            device_port.connected_fiber_strand_id = strand.id
            device_port.connected_circuit_id = circuit.id
            device_port.status = "assigned"
            session.add(strand)
            session.add(device_port)
            assignments.append(FiberAssignment(assignment_id=assignment_id, fiber_strand_id=strand.id, circuit_id=circuit.id, device_id=device.id, device_port_id=device_port.id, patch_panel_port_id=device_panel_port.id if device_panel_port else None, work_order_id=work_order.id, assignment_type=assignment_type, assignment_status=assignment_status, assigned_by_user_id=engineer.id, assigned_date=date(2026, 2, 20), notes=notes))
        session.add_all(assignments)
        session.commit()
        for item in assignments:
            session.refresh(item)

        for order in work_orders:
            session.add(WorkOrderTask(work_order_id=order.id, task_number=1, task_title="Review design package", assigned_to_user_id=field_tech.id, status="open"))
            session.add(WorkOrderMaterial(work_order_id=order.id, material_name="LC fiber patch cord", quantity=2, unit="each", status="available"))
        session.add_all([
            WorkOrderTask(work_order_id=work_orders[0].id, task_number=2, task_title="Patch WBS and AUB C37.94 fiber ports", assigned_to_user_id=field_tech.id, fiber_assignment_id=assignments[2].id, fiber_strand_id=assignments[2].fiber_strand_id, patch_panel_port_id=assignments[2].patch_panel_port_id, photo_required=True, status="complete", test_uploaded=True, test_result="OTDR and light level pass"),
            WorkOrderTask(work_order_id=work_orders[0].id, task_number=3, task_title="Verify Line 143 splice records for 87L circuit", assigned_to_user_id=field_tech.id, fiber_assignment_id=assignments[3].id, fiber_strand_id=assignments[3].fiber_strand_id, fiber_splice_id=splices[2].id, photo_required=True, status="complete", test_uploaded=True, test_result="splice tray photo uploaded"),
            WorkOrderTask(work_order_id=work_orders[1].id, task_number=2, task_title="Splice F12 distribution fiber to REC-F12-004", assigned_to_user_id=field_tech.id, fiber_assignment_id=assignments[4].id, fiber_strand_id=assignments[4].fiber_strand_id, fiber_splice_id=splices[-2].id, photo_required=True, status="in_progress", test_uploaded=False),
            WorkOrderTask(work_order_id=work_orders[1].id, task_number=3, task_title="Upload SCADA fiber test results", assigned_to_user_id=field_tech.id, fiber_assignment_id=assignments[5].id, fiber_strand_id=assignments[5].fiber_strand_id, fiber_splice_id=splices[-1].id, photo_required=True, status="open", test_uploaded=False),
        ])
        session.add(WorkOrderUpdate(work_order_id=work_orders[2].id, user_id=engineer.id, update_type="provider", update_text="Provider FOC pending."))

        parameter_categories = [
            "node_identity",
            "transport_configuration",
            "line_module_configuration",
            "service_provisioning",
            "protection_telecom_service",
            "tdm_legacy_service",
            "ethernet_service",
            "timing_parameters",
            "security_management",
            "commissioning_test_parameters",
        ]

        def template(name: str, service_type: str, required_fields: list[str], work_tasks: list[str]) -> IconServiceTemplate:
            return IconServiceTemplate(
                template_name=name,
                service_type=service_type,
                description=f"Reusable DeviceOps template for {name}. Uses parameter categories and reference placeholders only.",
                manual_reference="SEL manual/application guide section placeholder; verify authorized revision before field use.",
                required_parameters_json={"required_fields": required_fields, "recommended_categories": parameter_categories},
                default_parameters_json={
                    "manual_reference": "SEL manual section placeholder",
                    "manual_revision": "authorized revision placeholder",
                    "engineering_standard_reference": "TelecomNE internal engineering standard placeholder",
                    "source_state": "proposed",
                    "read_only_operational_api": True,
                },
                validation_rules_json={
                    "rules": [
                        "Verify ports exist and are available.",
                        "Verify required parameters are complete.",
                        "Verify circuit ID uniqueness.",
                        "Verify no conflict with actual operational state.",
                        "Verify fiber path diversity when required.",
                    ]
                },
                commissioning_steps_json={
                    "steps": [
                        {"category": "Engineering", "task_text": "Verify approved configuration package and reference placeholders.", "expected_result": "Approved package matches service scope."},
                        {"category": "Physical", "task_text": "Verify slot, module, port, patch panel, and fiber assignments.", "expected_result": "Physical assignments match design package."},
                        {"category": "Turnup", "task_text": "Turn up service using approved configuration package.", "expected_result": "Service becomes active without unexpected alarms."},
                        {"category": "Test", "task_text": "Record latency, continuity, failover, and service-specific test results.", "expected_result": "Results satisfy internal engineering standard placeholder."},
                        {"category": "Closeout", "task_text": "Upload test evidence and as-built photos.", "expected_result": "Evidence is ready for engineering closeout."},
                    ]
                },
                test_requirements_json={
                    "evidence": ["configuration screenshot", "latency test", "continuity test", "as-built photo"],
                    "work_order_task_suggestions": work_tasks,
                },
                created_by_user_id=engineer.id,
                created_by=engineer.id,
                updated_by=engineer.id,
            )

        icon_templates = [
            template("SEL ICON node installation", "SEL_ICON_node_installation", ["node_name", "substation_code", "management_ip", "chassis_type", "timing_mode"], ["Verify rack location.", "Install ICON chassis.", "Verify management reachability.", "Verify timing source.", "Upload as-built photos."]),
            template("ICON line module installation", "ICON_line_module_installation", ["icon_node_id", "chassis_slot", "module_type", "port_count", "optical_interface_type"], ["Verify approved module assignment.", "Install module in assigned slot.", "Verify optical levels.", "Update as-built module record."]),
            template("ICON C37.94 service", "C37.94", ["service_type", "a_end_node_id", "z_end_node_id", "a_end_port_id", "z_end_port_id", "circuit_id", "relay_a", "relay_b", "latency_requirement_ms"], ["Verify approved engineering package.", "Verify ICON C37.94 ports.", "Patch A-end and Z-end ports.", "Measure latency.", "Test protection communications.", "Upload test sheets."]),
            template("ICON 87L line differential service", "87L", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "relay_a", "relay_b", "maximum_latency_requirement", "asymmetry_limit"], ["Verify 87L package.", "Verify primary communications path.", "Verify backup path if required.", "Run end-to-end relay communications test.", "Upload relay test evidence."]),
            template("ICON DTT / transfer trip service", "DTT", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "scheme_type", "primary_path", "backup_path"], ["Verify DTT package.", "Patch direct trip communications path.", "Run transfer trip communications test.", "Test failover if applicable."]),
            template("ICON Mirrored Bits service", "Mirrored_Bits", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "relay_a", "relay_b"], ["Verify Mirrored Bits package.", "Patch service path.", "Run end-to-end status bit test.", "Upload screenshots."]),
            template("ICON DS1 service", "DS1", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "timeslot_assignment"], ["Verify DS1 mapping.", "Patch DS1 handoff.", "Run bit error test.", "Record grooming path."]),
            template("ICON DS0 grooming service", "DS0", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "timeslot_assignment"], ["Verify DS0 grooming plan.", "Provision timeslots.", "Test analog/DS0 path.", "Record as-built grooming."]),
            template("ICON Ethernet service", "Ethernet", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "port_speed", "mtu"], ["Verify Ethernet service plan.", "Patch Ethernet ports.", "Verify link state.", "Run traffic test."]),
            template("ICON Ethernet pipe / VLAN service", "Ethernet_Pipe", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "vlan_id", "bandwidth"], ["Verify VLAN ID.", "Provision Ethernet pipe.", "Verify QoS/traffic class.", "Run SCADA reachability test."]),
            template("ICON VSN service", "VSN", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "vsn_container"], ["Verify VSN container.", "Provision service.", "Run path and latency tests.", "Upload evidence."]),
            template("ICON timing service", "PTP", ["service_type", "icon_node_id", "timing_source", "primary_timing_source", "backup_timing_source"], ["Verify timing profile.", "Set primary and backup timing references.", "Verify timing quality.", "Clear timing alarms."]),
            template("ICON leased-service migration", "leased_service_migration", ["service_type", "legacy_circuit_id", "target_icon_service", "migration_window"], ["Verify leased service migration package.", "Pre-test ICON path.", "Move traffic during approved window.", "Record provider disconnect status."]),
            template("ICON SCADA aggregation service", "SCADA", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "vlan_id", "traffic_class"], ["Verify SCADA aggregation package.", "Patch Ethernet handoffs.", "Run SCADA polling test.", "Upload traffic verification."]),
        ]
        session.add_all(icon_templates)
        session.commit()
        for item in icon_templates:
            session.refresh(item)
        template_by_name = {item.template_name: item for item in icon_templates}

        profiles = [
            IconEngineeringProfile(icon_node_id=nodes[0].id, profile_name="WBS ICON hybrid ring profile", profile_revision="REV-A", manual_reference="SEL manual section placeholder", engineering_standard_reference="TelecomNE ICON STD-001 placeholder", transport_mode="mixed_ethernet_sonet", topology_type="ring", timing_mode="GPS", redundancy_mode="ring_protected", security_profile="centralized_auth_with_local_fallback", commissioning_status="commissioned", notes="Webster timing source normal in mock operational API."),
            IconEngineeringProfile(icon_node_id=nodes[1].id, profile_name="AUB ICON ring node profile", profile_revision="REV-A", manual_reference="SEL manual section placeholder", engineering_standard_reference="TelecomNE ICON STD-001 placeholder", transport_mode="mixed_ethernet_sonet", topology_type="ring", timing_mode="SONET_timing", redundancy_mode="ring_protected", security_profile="centralized_auth_with_local_fallback", commissioning_status="needs_timing_verification", notes="Auburn has timing alarm in mock operational API."),
            IconEngineeringProfile(icon_node_id=nodes[2].id, profile_name="MIL ICON ethernet/DS1 profile", profile_revision="REV-A", manual_reference="SEL manual section placeholder", engineering_standard_reference="TelecomNE ICON STD-001 placeholder", transport_mode="ethernet_only", topology_type="hybrid_ring_linear", timing_mode="SONET_timing", redundancy_mode="ring_protected", security_profile="centralized_auth_with_local_fallback", commissioning_status="commissioned"),
        ]
        session.add_all(profiles)

        deviceops_orders = [
            WorkOrder(work_order_number="WO-2026-DOP-0060", title="Install ICON C37.94 service for 87L-WBS-AUB-002", description="Generated from DeviceOps proposed change. Operational API remains read-only.", work_type="proposed_change_install", priority="critical", status="ready_for_field", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=wbs.id, device_id=wbs_icon.id, outage_required=True, protection_impact="yes"),
            WorkOrder(work_order_number="WO-2026-DOP-0061", title="Turn up ICON Ethernet pipe for SCADA", description="Generated from DeviceOps proposed change. Operational API remains read-only.", work_type="proposed_change_install", priority="high", status="ready_for_field", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=wbs.id, device_id=wbs_icon.id, outage_required=False, protection_impact="no"),
            WorkOrder(work_order_number="WO-2026-DOP-0062", title="Migrate leased DS1 to ICON transport", description="Generated from DeviceOps proposed change. Operational API remains read-only.", work_type="proposed_change_install", priority="high", status="ready_for_field", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=mil.id, circuit_id=circuits[4].id, device_id=mil_icon.id, outage_required=True, protection_impact="no"),
            WorkOrder(work_order_number="WO-2026-DOP-0063", title="Verify Auburn ICON timing source profile", description="Generated from DeviceOps proposed change. Operational API remains read-only.", work_type="proposed_change_install", priority="high", status="ready_for_field", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id, substation_id=aub.id, device_id=aub_icon.id, outage_required=False, protection_impact="yes"),
        ]
        session.add_all(deviceops_orders)
        session.commit()
        for order in deviceops_orders:
            session.refresh(order)
            for index, task_title in enumerate([
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
            ], start=1):
                session.add(WorkOrderTask(work_order_id=order.id, task_number=index, task_title=task_title, assigned_to_user_id=field_tech.id, photo_required=index in {13, 14}, status="open"))

        proposed_changes = [
            ProposedChange(change_number="PCR-2026-0001", title="Add new ICON C37.94 service for 87L-WBS-AUB-002", description="Stage C37.94 communications service for the second Webster-Auburn 87L package.", change_type="add_icon_service", target_entity_type="icon_node", target_entity_id=nodes[0].id, source_state="proposed", proposed_state_json={"service_template_id": template_by_name["ICON C37.94 service"].id, "service_name": "87L-WBS-AUB-002", "service_type": "C37.94", "a_end_node_id": nodes[0].id, "z_end_node_id": nodes[1].id, "a_end_port_id": ports[2].id, "z_end_port_id": ports[3].id, "circuit_id": "87L-WBS-AUB-002", "relay_a": "WBS-SEL411L-01", "relay_b": "AUB-SEL411L-01", "fiber_strand_ids": [strand_for(cables[0], 5).id, strand_for(cables[0], 6).id], "patch_panels": ["WBS-FPP-01", "AUB-FPP-01"], "latency_requirement_ms": 8, "protection_class": "87L", "diversity_required": True, "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE 87L communications standard placeholder"}, reason="New protection package for planned line relay upgrade.", risk_level="critical", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=deviceops_orders[0].id),
            ProposedChange(change_number="PCR-2026-0002", title="Add ICON Ethernet pipe for SCADA", description="Stage Ethernet pipe for SCADA traffic on the ICON ring.", change_type="add_icon_service", target_entity_type="icon_node", target_entity_id=nodes[0].id, source_state="proposed", proposed_state_json={"service_template_id": template_by_name["ICON Ethernet pipe / VLAN service"].id, "service_name": "SCADA-PIPE-WBS-AUB-002", "service_type": "Ethernet_Pipe", "a_end_node_id": nodes[0].id, "z_end_node_id": nodes[1].id, "circuit_id": "SCADA-PIPE-WBS-AUB-002", "vlan_id": "214", "bandwidth": "100 Mbps", "traffic_class": "SCADA", "scada_noncritical_traffic_flag": False, "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE SCADA transport standard placeholder"}, reason="Move SCADA polling to utility-owned transport.", risk_level="high", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=deviceops_orders[1].id),
            ProposedChange(change_number="PCR-2026-0003", title="Migrate leased DS1 to ICON transport", description="Replace legacy leased DS1 with ICON transport service.", change_type="migrate_leased_service", target_entity_type="circuit", target_entity_id=circuits[4].id, source_state="proposed", proposed_state_json={"service_template_id": template_by_name["ICON leased-service migration"].id, "service_name": "LEASED-DS1-RTU-002-MIGRATION", "service_type": "leased_service_migration", "legacy_circuit_id": "LEASED-DS1-RTU-002", "target_icon_service": "ICON-DS1-RTU-002", "migration_window": "maintenance window placeholder", "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE leased migration standard placeholder"}, reason="Reduce recurring carrier cost and improve as-built documentation.", risk_level="high", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=deviceops_orders[2].id),
            ProposedChange(change_number="PCR-2026-0004", title="Add backup fiber path for DTT-WBS-AUB-001", description="Stage diverse backup fiber path for the Webster-Auburn transfer trip service.", change_type="protection_service_change", target_entity_type="circuit", target_entity_id=circuits[1].id, source_state="proposed", proposed_state_json={"service_template_id": template_by_name["ICON DTT / transfer trip service"].id, "service_name": "DTT-WBS-AUB-001-BACKUP", "service_type": "DTT", "a_end_node_id": nodes[0].id, "z_end_node_id": nodes[1].id, "circuit_id": "DTT-WBS-AUB-001", "scheme_type": "transfer_trip", "primary_path": "OPGW-L143-WBS-AUB-48F", "backup_path": "", "diversity_required": True, "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE DTT communications standard placeholder"}, reason="Improve protection path diversity.", risk_level="critical", engineering_status="under_engineering_review", approval_status="pending_approval", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id),
            ProposedChange(change_number="PCR-2026-0005", title="Update timing source profile at Auburn", description="Stage Auburn ICON timing profile update and field verification.", change_type="timing_change", target_entity_type="icon_node", target_entity_id=nodes[1].id, source_state="proposed", proposed_state_json={"service_template_id": template_by_name["ICON timing service"].id, "service_name": "AUB-ICON-TIMING-REV-B", "service_type": "PTP", "icon_node_id": nodes[1].id, "timing_source": "SONET_timing", "primary_timing_source": "WBS GPS via ICON ring", "backup_timing_source": "local_clock", "timing_quality": "engineering review placeholder", "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE timing standard placeholder"}, reason="Mock operational API reports Auburn timing alarm.", risk_level="high", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=deviceops_orders[3].id),
        ]
        session.add_all(proposed_changes)
        session.commit()
        for change in proposed_changes:
            session.refresh(change)

        session.add_all([
            ProposedChangeDiff(proposed_change_id=proposed_changes[0].id, entity_type="device_port", entity_id=ports[2].id, field_name="status", actual_value="assigned", planned_value="assigned", proposed_value="assigned_to_new_service", diff_type="value_mismatch", severity="warning", notes="Seeded warning: proposed C37.94 service should verify port availability before field work."),
            ProposedChangeDiff(proposed_change_id=proposed_changes[3].id, entity_type="circuit_path", entity_id=circuits[1].id, field_name="backup_path", actual_value="", planned_value="", proposed_value="", diff_type="missing_in_planned", severity="warning", notes="Backup path is required but not fully selected."),
        ])

        icon_services = []
        for change in proposed_changes:
            state = change.proposed_state_json or {}
            if state.get("service_type"):
                icon_services.append(IconProposedService(proposed_change_id=change.id, icon_node_id=change.target_entity_id if change.target_entity_type == "icon_node" else state.get("a_end_node_id"), service_template_id=state.get("service_template_id"), service_name=state.get("service_name", change.title), service_type=state["service_type"], a_end_node_id=state.get("a_end_node_id"), z_end_node_id=state.get("z_end_node_id"), a_end_port_id=state.get("a_end_port_id"), z_end_port_id=state.get("z_end_port_id"), circuit_id=change.target_entity_id if change.target_entity_type == "circuit" else None, proposed_parameters_json=state, validation_status="warning" if change.approval_status == "pending_approval" else "valid", commissioning_status="ready_for_field" if change.related_work_order_id else "not_started", notes=change.reason))
        session.add_all(icon_services)

        for order, checklist_type in [
            (deviceops_orders[0], "C37_94_service"),
            (deviceops_orders[1], "Ethernet_service"),
            (deviceops_orders[2], "leased_service_migration"),
            (deviceops_orders[3], "timing_service"),
        ]:
            checklist = CommissioningChecklist(checklist_name=f"Commissioning - {order.title}", entity_type="work_order", entity_id=order.id, checklist_type=checklist_type, manual_reference="SEL manual section placeholder", status="in_progress", created_by_user_id=engineer.id, assigned_to_user_id=field_tech.id, notes="Seeded DeviceOps commissioning checklist with concise action items and evidence placeholders.")
            session.add(checklist)
            session.commit()
            session.refresh(checklist)
            for index, (category, task_text, expected) in enumerate([
                ("Engineering", "Verify approved engineering package.", "Package matches proposed change and internal standard placeholder."),
                ("Physical", "Verify ICON slot/module/port and patch panel assignments.", "Assignments match work order."),
                ("Fiber", "Verify fiber continuity and optical loss evidence.", "Continuity and loss are within approved limits."),
                ("Service", "Turn up service and record operational state.", "Service is active without unexpected alarms."),
                ("Test", "Upload screenshots, test sheets, and as-built photos.", "Evidence is available for engineer closeout."),
            ], start=1):
                session.add(CommissioningChecklistItem(checklist_id=checklist.id, item_number=index, category=category, task_text=task_text, expected_result=expected, status="not_started"))

        for entity_type, entity_id, url, label in [
            ("substations", "WBS", "/substations/WBS", "Webster Substation"),
            ("devices", "WBS-ICON-01", "/devices/WBS-ICON-01", "WBS-ICON-01"),
            ("fiber-cables", "OPGW-L143-WBS-AUB-48F", "/fiber-cables/OPGW-L143-WBS-AUB-48F", "OPGW L143 48F"),
            ("circuits", "87L-WBS-AUB-001", "/circuits/87L-WBS-AUB-001", "87L-WBS-AUB-001"),
            ("work-orders", "WO-2026-0041", "/work-orders/WO-2026-0041", "WO-2026-0041"),
        ]:
            session.add(QRCode(entity_type=entity_type, entity_id=entity_id, permanent_url=url, qr_image_url=f"/api/qr/stub/{entity_id}.png", label_text=label))
        for report in SAVED_REPORTS:
            session.add(SQLReport(**report))
        session.commit()
        from app.seed.regional_seed import seed_regional_grid_addons

        seed_regional_grid_addons(session)


def _seed_deviceops_addons(session: Session) -> None:
    existing_reports = {row.report_name for row in session.exec(select(SQLReport)).all()}
    for report in SAVED_REPORTS:
        if report["report_name"] not in existing_reports:
            session.add(SQLReport(**report))

    if session.exec(select(IconServiceTemplate)).first():
        session.commit()
        return

    engineer = session.exec(select(User).where(User.role == "engineer")).first() or session.exec(select(User)).first()
    field_tech = session.exec(select(User).where(User.role == "field_tech")).first()
    if engineer is None:
        session.commit()
        return

    parameter_categories = [
        "node_identity",
        "transport_configuration",
        "line_module_configuration",
        "service_provisioning",
        "protection_telecom_service",
        "tdm_legacy_service",
        "ethernet_service",
        "timing_parameters",
        "security_management",
        "commissioning_test_parameters",
    ]

    template_specs = [
        ("SEL ICON node installation", "SEL_ICON_node_installation", ["node_name", "substation_code", "management_ip", "chassis_type", "timing_mode"]),
        ("ICON line module installation", "ICON_line_module_installation", ["icon_node_id", "chassis_slot", "module_type", "port_count", "optical_interface_type"]),
        ("ICON C37.94 service", "C37.94", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "relay_a", "relay_b", "latency_requirement_ms"]),
        ("ICON 87L line differential service", "87L", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "relay_a", "relay_b", "maximum_latency_requirement"]),
        ("ICON DTT / transfer trip service", "DTT", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "scheme_type", "primary_path", "backup_path"]),
        ("ICON Mirrored Bits service", "Mirrored_Bits", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "relay_a", "relay_b"]),
        ("ICON DS1 service", "DS1", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "timeslot_assignment"]),
        ("ICON DS0 grooming service", "DS0", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "timeslot_assignment"]),
        ("ICON Ethernet service", "Ethernet", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "port_speed", "mtu"]),
        ("ICON Ethernet pipe / VLAN service", "Ethernet_Pipe", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "vlan_id", "bandwidth"]),
        ("ICON VSN service", "VSN", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "vsn_container"]),
        ("ICON timing service", "PTP", ["service_type", "icon_node_id", "timing_source", "primary_timing_source", "backup_timing_source"]),
        ("ICON leased-service migration", "leased_service_migration", ["service_type", "legacy_circuit_id", "target_icon_service", "migration_window"]),
        ("ICON SCADA aggregation service", "SCADA", ["service_type", "a_end_node_id", "z_end_node_id", "circuit_id", "vlan_id", "traffic_class"]),
    ]
    templates = [
        IconServiceTemplate(
            template_name=name,
            service_type=service_type,
            description=f"Reusable DeviceOps template for {name}. Uses parameter categories and reference placeholders only.",
            manual_reference="SEL manual/application guide section placeholder; verify authorized revision before field use.",
            required_parameters_json={"required_fields": required_fields, "recommended_categories": parameter_categories},
            default_parameters_json={"manual_reference": "SEL manual section placeholder", "manual_revision": "authorized revision placeholder", "engineering_standard_reference": "TelecomNE internal engineering standard placeholder", "read_only_operational_api": True},
            validation_rules_json={"rules": ["Verify ports exist and are available.", "Verify required parameters are complete.", "Verify circuit ID uniqueness.", "Verify no conflict with actual operational state.", "Verify fiber path diversity when required."]},
            commissioning_steps_json={"steps": [{"category": "Engineering", "task_text": "Verify approved configuration package and reference placeholders.", "expected_result": "Approved package matches service scope."}, {"category": "Physical", "task_text": "Verify slot, module, port, patch panel, and fiber assignments.", "expected_result": "Physical assignments match design package."}, {"category": "Test", "task_text": "Record latency, continuity, failover, and service-specific test results.", "expected_result": "Results satisfy internal engineering standard placeholder."}]},
            test_requirements_json={"evidence": ["configuration screenshot", "latency test", "continuity test", "as-built photo"], "work_order_task_suggestions": ["Verify approved engineering package.", "Verify ICON node and slot/module assignment.", "Verify assigned device ports.", "Verify assigned patch panel ports.", "Verify fiber strand assignment.", "Turn up service per approved configuration package.", "Measure latency.", "Upload screenshots/test sheets.", "Upload as-built photos.", "Submit field closeout."]},
            created_by_user_id=engineer.id,
            created_by=engineer.id,
            updated_by=engineer.id,
        )
        for name, service_type, required_fields in template_specs
    ]
    session.add_all(templates)
    session.commit()
    for item in templates:
        session.refresh(item)
    template_by_type = {item.service_type: item for item in templates}

    nodes = {row.node_name: row for row in session.exec(select(IconNode)).all()}
    devices = {row.device_name: row for row in session.exec(select(Device)).all()}
    circuits = {row.circuit_id: row for row in session.exec(select(Circuit)).all()}
    if nodes:
        for node in nodes.values():
            if not session.exec(select(IconEngineeringProfile).where(IconEngineeringProfile.icon_node_id == node.id)).first():
                session.add(IconEngineeringProfile(icon_node_id=node.id, profile_name=f"{node.node_name} engineering profile", profile_revision="REV-A", manual_reference="SEL manual section placeholder", engineering_standard_reference="TelecomNE ICON standard placeholder", transport_mode=node.transport_mode, topology_type="ring", timing_mode="SONET_timing", redundancy_mode="ring_protected", security_profile="centralized_auth_with_local_fallback", commissioning_status="commissioned"))

    if session.exec(select(ProposedChange).where(ProposedChange.change_number == "PCR-2026-0001")).first():
        session.commit()
        return

    now = datetime.now(timezone.utc)
    wbs_node = nodes.get("WBS-ICON-01")
    aub_node = nodes.get("AUB-ICON-01")
    mil_node = nodes.get("MIL-ICON-01") or aub_node or wbs_node
    wbs_device = devices.get("WBS-ICON-01")
    aub_device = devices.get("AUB-ICON-01")
    mil_device = devices.get("MIL-ICON-01") or aub_device or wbs_device
    if not (wbs_node and aub_node and wbs_device):
        session.commit()
        return

    def add_order(number: str, title: str, device: Device | None, circuit: Circuit | None = None) -> WorkOrder:
        existing = session.exec(select(WorkOrder).where(WorkOrder.work_order_number == number)).first()
        if existing:
            return existing
        order = WorkOrder(work_order_number=number, title=title, description="Generated from DeviceOps proposed change. Operational API remains read-only.", work_type="proposed_change_install", priority="high", status="ready_for_field", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, assigned_field_tech_id=field_tech.id if field_tech else None, substation_id=device.substation_id if device else None, circuit_id=circuit.id if circuit else None, device_id=device.id if device else None, outage_required=False, protection_impact="yes" if "C37.94" in title or "timing" in title.lower() else "no")
        session.add(order)
        session.commit()
        session.refresh(order)
        for index, task_title in enumerate(["Verify approved engineering package.", "Verify ICON node and slot/module assignment.", "Verify assigned device ports.", "Verify assigned patch panel ports.", "Verify fiber strand assignment.", "Turn up service per approved configuration package.", "Measure latency.", "Upload screenshots/test sheets.", "Upload as-built photos.", "Submit field closeout."], start=1):
            session.add(WorkOrderTask(work_order_id=order.id, task_number=index, task_title=task_title, assigned_to_user_id=field_tech.id if field_tech else None, photo_required=index in {8, 9}, status="open"))
        return order

    orders = [
        add_order("WO-2026-DOP-0060", "Install ICON C37.94 service for 87L-WBS-AUB-002", wbs_device),
        add_order("WO-2026-DOP-0061", "Turn up ICON Ethernet pipe for SCADA", wbs_device),
        add_order("WO-2026-DOP-0062", "Migrate leased DS1 to ICON transport", mil_device, circuits.get("LEASED-DS1-RTU-002")),
        add_order("WO-2026-DOP-0063", "Verify Auburn ICON timing source profile", aub_device),
    ]

    changes = [
        ProposedChange(change_number="PCR-2026-0001", title="Add new ICON C37.94 service for 87L-WBS-AUB-002", description="Stage C37.94 communications service.", change_type="add_icon_service", target_entity_type="icon_node", target_entity_id=wbs_node.id, source_state="proposed", proposed_state_json={"service_template_id": template_by_type["C37.94"].id, "service_name": "87L-WBS-AUB-002", "service_type": "C37.94", "a_end_node_id": wbs_node.id, "z_end_node_id": aub_node.id, "circuit_id": "87L-WBS-AUB-002", "relay_a": "WBS-SEL411L-01", "relay_b": "AUB-SEL411L-01", "latency_requirement_ms": 8, "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE 87L standard placeholder"}, reason="New protection package.", risk_level="critical", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=orders[0].id),
        ProposedChange(change_number="PCR-2026-0002", title="Add ICON Ethernet pipe for SCADA", description="Stage Ethernet pipe for SCADA traffic.", change_type="add_icon_service", target_entity_type="icon_node", target_entity_id=wbs_node.id, source_state="proposed", proposed_state_json={"service_template_id": template_by_type["Ethernet_Pipe"].id, "service_name": "SCADA-PIPE-WBS-AUB-002", "service_type": "Ethernet_Pipe", "a_end_node_id": wbs_node.id, "z_end_node_id": aub_node.id, "circuit_id": "SCADA-PIPE-WBS-AUB-002", "vlan_id": "214", "bandwidth": "100 Mbps", "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE SCADA standard placeholder"}, reason="Move SCADA polling to utility-owned transport.", risk_level="high", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=orders[1].id),
        ProposedChange(change_number="PCR-2026-0003", title="Migrate leased DS1 to ICON transport", description="Replace legacy leased DS1 with ICON transport.", change_type="migrate_leased_service", target_entity_type="circuit", target_entity_id=circuits.get("LEASED-DS1-RTU-002").id if circuits.get("LEASED-DS1-RTU-002") else None, source_state="proposed", proposed_state_json={"service_template_id": template_by_type["leased_service_migration"].id, "service_name": "LEASED-DS1-RTU-002-MIGRATION", "service_type": "leased_service_migration", "legacy_circuit_id": "LEASED-DS1-RTU-002", "target_icon_service": "ICON-DS1-RTU-002", "migration_window": "maintenance window placeholder", "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE migration standard placeholder"}, reason="Reduce recurring carrier cost.", risk_level="high", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=orders[2].id),
        ProposedChange(change_number="PCR-2026-0004", title="Add backup fiber path for DTT-WBS-AUB-001", description="Stage diverse backup fiber path.", change_type="protection_service_change", target_entity_type="circuit", target_entity_id=circuits.get("DTT-WBS-AUB-001").id if circuits.get("DTT-WBS-AUB-001") else None, source_state="proposed", proposed_state_json={"service_template_id": template_by_type["DTT"].id, "service_name": "DTT-WBS-AUB-001-BACKUP", "service_type": "DTT", "a_end_node_id": wbs_node.id, "z_end_node_id": aub_node.id, "circuit_id": "DTT-WBS-AUB-001", "scheme_type": "transfer_trip", "primary_path": "OPGW-L143-WBS-AUB-48F", "backup_path": "", "diversity_required": True, "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE DTT standard placeholder"}, reason="Improve protection path diversity.", risk_level="critical", engineering_status="under_engineering_review", approval_status="pending_approval", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id),
        ProposedChange(change_number="PCR-2026-0005", title="Update timing source profile at Auburn", description="Stage Auburn ICON timing profile update.", change_type="timing_change", target_entity_type="icon_node", target_entity_id=aub_node.id, source_state="proposed", proposed_state_json={"service_template_id": template_by_type["PTP"].id, "service_name": "AUB-ICON-TIMING-REV-B", "service_type": "PTP", "icon_node_id": aub_node.id, "timing_source": "SONET_timing", "primary_timing_source": "WBS GPS via ICON ring", "backup_timing_source": "local_clock", "manual_reference": "SEL manual section placeholder", "engineering_standard_reference": "TelecomNE timing standard placeholder"}, reason="Mock operational API reports Auburn timing alarm.", risk_level="high", engineering_status="converted_to_work_order", approval_status="approved", requested_by_user_id=engineer.id, assigned_engineer_id=engineer.id, approved_by_user_id=engineer.id, approved_at=now, related_work_order_id=orders[3].id),
    ]
    session.add_all(changes)
    session.commit()
    for change in changes:
        session.refresh(change)
        state = change.proposed_state_json or {}
        if state.get("service_type"):
            session.add(IconProposedService(proposed_change_id=change.id, icon_node_id=change.target_entity_id if change.target_entity_type == "icon_node" else state.get("a_end_node_id"), service_template_id=state.get("service_template_id"), service_name=state.get("service_name", change.title), service_type=state["service_type"], a_end_node_id=state.get("a_end_node_id"), z_end_node_id=state.get("z_end_node_id"), circuit_id=change.target_entity_id if change.target_entity_type == "circuit" else None, proposed_parameters_json=state, validation_status="warning" if change.approval_status == "pending_approval" else "valid", commissioning_status="ready_for_field" if change.related_work_order_id else "not_started", notes=change.reason))

    session.add_all([
        ProposedChangeDiff(proposed_change_id=changes[0].id, entity_type="device_port", field_name="status", actual_value="assigned", planned_value="assigned", proposed_value="assigned_to_new_service", diff_type="value_mismatch", severity="warning", notes="Verify port availability before field work."),
        ProposedChangeDiff(proposed_change_id=changes[3].id, entity_type="circuit_path", field_name="backup_path", actual_value="", planned_value="", proposed_value="", diff_type="missing_in_planned", severity="warning", notes="Backup path is required but not fully selected."),
    ])

    for order, checklist_type in [(orders[0], "C37_94_service"), (orders[1], "Ethernet_service"), (orders[2], "leased_service_migration"), (orders[3], "timing_service")]:
        checklist = CommissioningChecklist(checklist_name=f"Commissioning - {order.title}", entity_type="work_order", entity_id=order.id, checklist_type=checklist_type, manual_reference="SEL manual section placeholder", status="in_progress", created_by_user_id=engineer.id, assigned_to_user_id=field_tech.id if field_tech else None, notes="Seeded DeviceOps commissioning checklist with concise action items and evidence placeholders.")
        session.add(checklist)
        session.commit()
        session.refresh(checklist)
        for index, (category, task_text, expected) in enumerate([("Engineering", "Verify approved engineering package.", "Package matches proposed change and internal standard placeholder."), ("Physical", "Verify ICON slot/module/port and patch panel assignments.", "Assignments match work order."), ("Fiber", "Verify fiber continuity and optical loss evidence.", "Continuity and loss are within approved limits."), ("Service", "Turn up service and record operational state.", "Service is active without unexpected alarms."), ("Test", "Upload screenshots, test sheets, and as-built photos.", "Evidence is available for engineer closeout.")], start=1):
            session.add(CommissioningChecklistItem(checklist_id=checklist.id, item_number=index, category=category, task_text=task_text, expected_result=expected, status="not_started"))
    session.commit()


if __name__ == "__main__":
    seed_database()
