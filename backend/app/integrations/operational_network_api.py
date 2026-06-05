"""Read-only operational network API adapter for DeviceOps.

This MVP adapter returns fictional seed data. To connect a real operational
source, replace these functions with calls to the authorized read-only API and
keep the same return shapes. Do not add write methods here unless the platform
is explicitly configured and approved for live-network changes.
"""

from copy import deepcopy

API_VERSION = "mock-2026.06"
SOURCE_SYSTEM = "mock_operational_network_api"
SNAPSHOT_TIME = "2026-06-04T14:25:00+00:00"

_DEVICES = [
    {
        "id": "op-wbs-icon-01",
        "device_name": "WBS-ICON-01",
        "device_type": "SEL_ICON",
        "manufacturer": "SEL",
        "model": "ICON",
        "serial_number": "SELICON-WBS-001",
        "firmware_version": "4.2.1",
        "management_ip": "10.14.3.10",
        "substation_code": "WBS",
        "rack_name": "WBS-TELCO-R1",
        "operational_status": "up",
        "alarm_status": "normal",
        "timing_status": "normal",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "critical",
        "network_role": "ring_hub",
    },
    {
        "id": "op-aub-icon-01",
        "device_name": "AUB-ICON-01",
        "device_type": "SEL_ICON",
        "manufacturer": "SEL",
        "model": "ICON",
        "serial_number": "SELICON-AUB-001",
        "firmware_version": "4.1.8",
        "management_ip": "10.14.3.20",
        "substation_code": "AUB",
        "rack_name": "AUB-TELCO-R1",
        "operational_status": "up",
        "alarm_status": "minor",
        "timing_status": "alarm",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "critical",
        "network_role": "ring_node",
    },
    {
        "id": "op-mil-icon-01",
        "device_name": "MIL-ICON-01",
        "device_type": "SEL_ICON",
        "manufacturer": "SEL",
        "model": "ICON",
        "serial_number": "SELICON-MIL-001",
        "firmware_version": "4.2.1",
        "management_ip": "10.14.3.30",
        "substation_code": "MIL",
        "rack_name": "MIL-TELCO-R1",
        "operational_status": "up",
        "alarm_status": "normal",
        "timing_status": "normal",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "critical",
        "network_role": "ring_node",
    },
    {
        "id": "op-wbs-rtr-01",
        "device_name": "WBS-RTR-01",
        "device_type": "router",
        "manufacturer": "Cisco",
        "model": "ISR",
        "serial_number": "RTR-WBS-001",
        "firmware_version": "17.9.5",
        "management_ip": "10.14.4.1",
        "substation_code": "WBS",
        "rack_name": "WBS-TELCO-R1",
        "operational_status": "up",
        "alarm_status": "normal",
        "timing_status": "not_applicable",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "high",
    },
    {
        "id": "op-aub-rtr-01",
        "device_name": "AUB-RTR-01",
        "device_type": "router",
        "manufacturer": "Cisco",
        "model": "ISR",
        "serial_number": "RTR-AUB-001",
        "firmware_version": "17.9.5",
        "management_ip": "10.14.4.2",
        "substation_code": "AUB",
        "rack_name": "AUB-TELCO-R1",
        "operational_status": "up",
        "alarm_status": "normal",
        "timing_status": "not_applicable",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "high",
    },
    {
        "id": "op-wbs-sel411l-01",
        "device_name": "WBS-SEL411L-01",
        "device_type": "relay",
        "manufacturer": "SEL",
        "model": "411L",
        "serial_number": "411L-WBS-001",
        "firmware_version": "R120",
        "management_ip": "10.14.8.11",
        "substation_code": "WBS",
        "rack_name": "WBS-RELAY-R1",
        "operational_status": "up",
        "alarm_status": "normal",
        "timing_status": "normal",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "critical",
    },
    {
        "id": "op-aub-sel411l-01",
        "device_name": "AUB-SEL411L-01",
        "device_type": "relay",
        "manufacturer": "SEL",
        "model": "411L",
        "serial_number": "411L-AUB-001",
        "firmware_version": "R120",
        "management_ip": "10.14.8.21",
        "substation_code": "AUB",
        "rack_name": "AUB-RELAY-R1",
        "operational_status": "up",
        "alarm_status": "normal",
        "timing_status": "normal",
        "last_seen": SNAPSHOT_TIME,
        "criticality": "critical",
    },
]

_PORTS = {
    "op-wbs-icon-01": [
        {"id": "op-wbs-icon-01-line-1", "port_name": "LINE-1", "port_type": "fiber", "port_speed": "OC-3", "admin_status": "enabled", "operational_status": "up", "connected_to": "AUB-ICON-01 LINE-1", "assigned_service": "Central MA ICON Ring", "assigned_circuit": "ICON-RING-WBS-AUB-MIL"},
        {"id": "op-wbs-icon-01-c37-1", "port_name": "C37.94-1", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "up", "connected_to": "WBS-SEL411L-01 C37.94-1", "assigned_service": "87L-WBS-AUB-001", "assigned_circuit": "87L-WBS-AUB-001"},
        {"id": "op-wbs-icon-01-eth-1", "port_name": "ETH-1", "port_type": "ethernet", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "WBS-RTR-01 Gi0/1", "assigned_service": "SCADA aggregation", "assigned_circuit": "SCADA-F12-REC004"},
        {"id": "op-wbs-icon-01-c37-2", "port_name": "C37.94-2", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "down", "connected_to": None, "assigned_service": None, "assigned_circuit": None},
    ],
    "op-aub-icon-01": [
        {"id": "op-aub-icon-01-line-1", "port_name": "LINE-1", "port_type": "fiber", "port_speed": "OC-3", "admin_status": "enabled", "operational_status": "up", "connected_to": "WBS-ICON-01 LINE-1", "assigned_service": "Central MA ICON Ring", "assigned_circuit": "ICON-RING-WBS-AUB-MIL"},
        {"id": "op-aub-icon-01-c37-1", "port_name": "C37.94-1", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "up", "connected_to": "AUB-SEL411L-01 C37.94-1", "assigned_service": "87L-WBS-AUB-001", "assigned_circuit": "87L-WBS-AUB-001"},
        {"id": "op-aub-icon-01-ds1-1", "port_name": "DS1-1", "port_type": "DS1", "port_speed": "1.544M", "admin_status": "enabled", "operational_status": "up", "connected_to": "Legacy RTU DS1", "assigned_service": "LEASED-DS1-RTU-002", "assigned_circuit": "LEASED-DS1-RTU-002"},
        {"id": "op-aub-icon-01-c37-2", "port_name": "C37.94-2", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "down", "connected_to": None, "assigned_service": None, "assigned_circuit": None},
    ],
    "op-mil-icon-01": [
        {"id": "op-mil-icon-01-line-1", "port_name": "LINE-1", "port_type": "fiber", "port_speed": "OC-3", "admin_status": "enabled", "operational_status": "up", "connected_to": "AUB-ICON-01 LINE-2", "assigned_service": "Central MA ICON Ring", "assigned_circuit": "ICON-RING-WBS-AUB-MIL"},
        {"id": "op-mil-icon-01-eth-1", "port_name": "ETH-1", "port_type": "ethernet", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "SCADA switch", "assigned_service": "SCADA aggregation", "assigned_circuit": "SCADA-F12-REC004"},
        {"id": "op-mil-icon-01-ds1-1", "port_name": "DS1-1", "port_type": "DS1", "port_speed": "1.544M", "admin_status": "enabled", "operational_status": "up", "connected_to": "Undocumented DS1 mux", "assigned_service": "Undocumented DS1", "assigned_circuit": "OP-UNDOC-DS1-009"},
    ],
    "op-wbs-rtr-01": [
        {"id": "op-wbs-rtr-01-gi0-1", "port_name": "Gi0/1", "port_type": "fiber", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "WBS-ICON-01 ETH-1", "assigned_service": "SCADA aggregation", "assigned_circuit": "SCADA-F12-REC004"},
    ],
    "op-aub-rtr-01": [
        {"id": "op-aub-rtr-01-gi0-1", "port_name": "Gi0/1", "port_type": "fiber", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "AUB-ICON-01 ETH-1", "assigned_service": "SCADA engineering LAN", "assigned_circuit": "SCADA-AUB-ENG-001"},
    ],
    "op-wbs-sel411l-01": [
        {"id": "op-wbs-sel411l-01-c37-1", "port_name": "C37.94-1", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "up", "connected_to": "WBS-ICON-01 C37.94-1", "assigned_service": "87L-WBS-AUB-001", "assigned_circuit": "87L-WBS-AUB-001"},
    ],
    "op-aub-sel411l-01": [
        {"id": "op-aub-sel411l-01-c37-1", "port_name": "C37.94-1", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "up", "connected_to": "AUB-ICON-01 C37.94-1", "assigned_service": "87L-WBS-AUB-001", "assigned_circuit": "87L-WBS-AUB-001"},
    ],
}

_ICON_SLOTS = {
    "op-wbs-icon-01": [
        {"slot_number": 1, "module_type": "SONET_line", "port_count": 4, "active_services": 1, "proposed_services": 1, "alarms": 0, "work_orders": 1},
        {"slot_number": 2, "module_type": "C37_94", "port_count": 4, "active_services": 1, "proposed_services": 1, "alarms": 0, "work_orders": 1},
        {"slot_number": 3, "module_type": "Ethernet_transport", "port_count": 4, "active_services": 1, "proposed_services": 1, "alarms": 0, "work_orders": 1},
    ],
    "op-aub-icon-01": [
        {"slot_number": 1, "module_type": "SONET_line", "port_count": 4, "active_services": 1, "proposed_services": 1, "alarms": 1, "work_orders": 1},
        {"slot_number": 2, "module_type": "C37_94", "port_count": 4, "active_services": 1, "proposed_services": 2, "alarms": 0, "work_orders": 1},
        {"slot_number": 3, "module_type": "DS1_tributary", "port_count": 8, "active_services": 1, "proposed_services": 1, "alarms": 0, "work_orders": 1},
    ],
    "op-mil-icon-01": [
        {"slot_number": 1, "module_type": "SONET_line", "port_count": 4, "active_services": 1, "proposed_services": 0, "alarms": 0, "work_orders": 0},
        {"slot_number": 2, "module_type": "Ethernet_transport", "port_count": 4, "active_services": 1, "proposed_services": 1, "alarms": 0, "work_orders": 0},
        {"slot_number": 3, "module_type": "DS1_tributary", "port_count": 8, "active_services": 1, "proposed_services": 1, "alarms": 0, "work_orders": 1},
    ],
}

_ICON_SERVICES = [
    {"id": "svc-c37-001", "node_id": "op-wbs-icon-01", "service_name": "87L-WBS-AUB-001", "service_type": "C37.94", "a_end": "WBS-ICON-01 C37.94-1", "z_end": "AUB-ICON-01 C37.94-1", "circuit": "87L-WBS-AUB-001", "status": "active", "latency_requirement_ms": 8.0, "measured_latency_ms": 3.4, "fiber_path": "OPGW-L143 strands 3-4", "protection_class": "87L"},
    {"id": "svc-ds1-002", "node_id": "op-aub-icon-01", "service_name": "LEASED-DS1-RTU-002", "service_type": "DS1", "a_end": "AUB-ICON-01 DS1-1", "z_end": "MIL-ICON-01 DS1-1", "circuit": "LEASED-DS1-RTU-002", "status": "active", "latency_requirement_ms": 20.0, "measured_latency_ms": 7.8, "fiber_path": "ICON ring TDM grooming", "protection_class": "SCADA"},
    {"id": "svc-eth-003", "node_id": "op-wbs-icon-01", "service_name": "SCADA aggregation", "service_type": "Ethernet", "a_end": "WBS-ICON-01 ETH-1", "z_end": "MIL-ICON-01 ETH-1", "circuit": "SCADA-F12-REC004", "status": "active", "latency_requirement_ms": 30.0, "measured_latency_ms": 6.2, "fiber_path": "ICON Ethernet pipe", "protection_class": "SCADA"},
    {"id": "svc-vsn-004", "node_id": "op-mil-icon-01", "service_name": "VSN-SCADA-MIL", "service_type": "VSN", "a_end": "MIL-ICON-01 ETH-1", "z_end": "AUB-ICON-01 ETH-1", "circuit": "SCADA-AUB-ENG-001", "status": "active", "latency_requirement_ms": 30.0, "measured_latency_ms": 5.9, "fiber_path": "VSN container 12", "protection_class": "noncritical"},
]

_CIRCUITS = [
    {"id": "op-circ-87l-001", "circuit_id": "87L-WBS-AUB-001", "circuit_name": "Webster to Auburn line differential protection", "service_type": "87L", "transport_type": "C37.94 over SEL ICON", "a_end_device": "WBS-SEL411L-01", "z_end_device": "AUB-SEL411L-01", "a_end_port": "C37.94-1", "z_end_port": "C37.94-1", "operational_status": "in_service", "measured_latency_ms": 3.4, "alarm_status": "normal"},
    {"id": "op-circ-icon-ring", "circuit_id": "ICON-RING-WBS-AUB-MIL", "circuit_name": "Central MA SEL ICON transport ring", "service_type": "SEL_ICON_transport", "transport_type": "hybrid", "a_end_device": "WBS-ICON-01", "z_end_device": "MIL-ICON-01", "a_end_port": "LINE-1", "z_end_port": "LINE-1", "operational_status": "in_service", "measured_latency_ms": 2.1, "alarm_status": "normal"},
    {"id": "op-circ-scada-001", "circuit_id": "SCADA-F12-REC004", "circuit_name": "F12 recloser SCADA Ethernet pipe", "service_type": "SCADA", "transport_type": "Ethernet over ICON", "a_end_device": "WBS-RTR-01", "z_end_device": "REC-F12-004", "a_end_port": "Gi0/1", "z_end_port": "ETH-1", "operational_status": "in_service", "measured_latency_ms": 6.2, "alarm_status": "normal"},
    {"id": "op-circ-lease-ds1", "circuit_id": "LEASED-DS1-RTU-002", "circuit_name": "Legacy leased DS1 RTU pending migration", "service_type": "DS1", "transport_type": "DS1 over ICON", "a_end_device": "AUB-ICON-01", "z_end_device": "MIL-ICON-01", "a_end_port": "DS1-1", "z_end_port": "DS1-1", "operational_status": "in_service", "measured_latency_ms": 7.8, "alarm_status": "normal"},
    {"id": "op-circ-undoc-ds1", "circuit_id": "OP-UNDOC-DS1-009", "circuit_name": "Undocumented Millbury DS1 grooming path", "service_type": "DS1", "transport_type": "DS1 over ICON", "a_end_device": "MIL-ICON-01", "z_end_device": "Legacy DS1 mux", "a_end_port": "DS1-1", "z_end_port": "CH-09", "operational_status": "in_service", "measured_latency_ms": 8.5, "alarm_status": "normal"},
]

_ALARMS = [
    {"id": "alarm-aub-timing-001", "device_id": "op-aub-icon-01", "device_name": "AUB-ICON-01", "severity": "warning", "alarm_type": "timing", "message": "Primary timing source degraded; using holdover fallback", "raised_at": "2026-06-04T13:58:00+00:00"},
    {"id": "alarm-aub-fw-001", "device_id": "op-aub-icon-01", "device_name": "AUB-ICON-01", "severity": "info", "alarm_type": "firmware", "message": "Firmware differs from engineering standard placeholder", "raised_at": "2026-06-04T14:00:00+00:00"},
]

_PROVISIONING_CATEGORIES = {
    "node_identity": ["node_name", "site", "management_ip", "firmware_revision", "chassis_type", "rack_location", "serial_number", "operational_role", "network_role"],
    "transport_configuration": ["transport_mode", "sonet_transport", "ethernet_transport", "vsn_container", "ethernet_pipe", "vlan_id", "bandwidth_allocation", "primary_path", "backup_path", "topology_type", "restoration_behavior"],
    "line_module_configuration": ["chassis_slot", "module_type", "module_serial_number", "port_count", "line_port", "tributary_port", "service_role", "optical_interface_type", "sfp_type", "fiber_pair", "patch_panel_port", "remote_node"],
    "service_provisioning": ["service_name", "service_type", "a_end_node", "z_end_node", "a_end_port", "z_end_port", "circuit_id", "criticality", "bandwidth", "latency_requirement_ms", "protection_class", "service_status"],
    "protection_telecom_service": ["scheme_type", "relay_a", "relay_b", "c37_94", "transfer_trip", "maximum_latency_requirement", "asymmetry_limit", "primary_communications_path", "backup_communications_path", "diversity_required", "end_to_end_test_status"],
    "tdm_legacy_service": ["ds1", "ds0", "e1", "e0", "channel_bank_use", "grooming_path", "timeslot_assignment", "analog_4wire", "fxo", "fxs", "legacy_circuit_migration_status"],
    "ethernet_service": ["ethernet_service_type", "vlan_id", "ethernet_pipe", "bridge_access_module", "port_speed", "duplex", "mtu", "qos_class", "traffic_class", "scada_noncritical_traffic_flag", "goose_support_flag", "broadcast_containment_flag"],
    "timing_parameters": ["timing_source", "gps", "irig_b", "ieee_1588_ptp_telecom_profile", "ieee_1588_power_profile", "sonet_timing", "stratum_1_source", "primary_timing_source", "backup_timing_source", "timing_quality", "holdover_fallback_behavior", "timing_alarm_status"],
    "security_management": ["user_role_model", "authentication_mode", "centralized_authentication", "local_account_fallback", "nms_integration", "sel_5051_5052_reference", "snmp_status", "syslog_status", "change_log_status", "firmware_tracking", "cybersecurity_notes"],
    "commissioning_test_parameters": ["pre_install_checklist_status", "bench_configuration_status", "field_installation_status", "fiber_continuity_test", "optical_loss", "otdr_attachment", "service_turnup_test", "latency_test", "failover_restoration_test", "timing_verification", "protection_relay_communications_test", "as_built_photos", "final_engineer_approval"],
}

_REGIONAL_ICON_NODE_SPECS = [
    ("op-ma-wor-icon-01", "MA-WOR-ICON-01", "MA-WOR", "Worcester", "10.200.4.10", "Central Massachusetts ICON Ring", "normal", "normal", "ring_node"),
    ("op-ma-fra-icon-01", "MA-FRA-ICON-01", "MA-FRA", "Framingham", "10.200.5.10", "Eastern Massachusetts ICON Ring", "normal", "normal", "packet_edge"),
    ("op-ma-bos-icon-01", "MA-BOS-ICON-01", "MA-BOS", "Boston", "10.200.6.10", "Eastern Massachusetts ICON Ring", "minor", "normal", "regional_hub"),
    ("op-ri-pvd-icon-01", "RI-PVD-ICON-01", "RI-PVD", "Providence", "10.200.7.10", "Rhode Island Tie Ring", "normal", "normal", "tie_node"),
    ("op-ct-hfd-icon-01", "CT-HFD-ICON-01", "CT-HFD", "Hartford", "10.200.8.10", "Connecticut ICON Ring", "normal", "normal", "regional_hub"),
    ("op-ct-nhv-icon-01", "CT-NHV-ICON-01", "CT-NHV", "New Haven", "10.200.9.10", "Connecticut ICON Ring", "normal", "normal", "ring_node"),
    ("op-nh-man-icon-01", "NH-MAN-ICON-01", "NH-MAN", "Manchester", "10.200.10.10", "Northern New England ICON Ring", "normal", "normal", "edge_node"),
    ("op-vt-rut-icon-01", "VT-RUT-ICON-01", "VT-RUT", "Rutland", "10.200.11.10", "Northern New England ICON Ring", "normal", "normal", "edge_node"),
    ("op-me-por-icon-01", "ME-POR-ICON-01", "ME-POR", "Portland", "10.200.12.10", "Leased Backup Transport Ring", "major", "holdover", "leased_backup_hub"),
]

_DEVICE_TYPE_EXAMPLES = [
    ("op-ma-bos-sw-01", "MA-BOS-SW-01", "switch", "Arista", "Utility Ethernet switch", "10.200.6.20", "MA-BOS", "normal", "high"),
    ("op-ma-wor-rtu-01", "MA-WOR-RTU-01", "RTU", "SEL", "RTU planning placeholder", "10.200.4.30", "MA-WOR", "normal", "high"),
    ("op-ri-pvd-rec-agg-01", "RI-PVD-REC-AGG-01", "recloser_controller", "SEL", "Recloser aggregation controller", "10.200.7.31", "RI-PVD", "normal", "high"),
    ("op-ct-hfd-otn-01", "CT-HFD-OTN-01", "OTN_DWDM_shelf", "FictionalOptics", "OTN/DWDM shelf", "10.200.8.40", "CT-HFD", "normal", "critical"),
    ("op-me-por-nid-01", "ME-POR-NID-01", "provider_NID", "Provider", "Leased Ethernet NID", "10.200.12.50", "ME-POR", "minor", "normal"),
    ("op-ma-fra-fw-01", "MA-FRA-FW-01", "firewall", "Palo Alto", "Substation security gateway", "10.200.5.60", "MA-FRA", "normal", "high"),
    ("op-ma-wbs-clock-01", "MA-WBS-GPS-01", "timing_clock", "SEL", "GPS/PTP clock", "10.200.1.70", "MA-WBS", "normal", "critical"),
]

_SERVICE_TYPE_DETAILS = {
    "C37.94": {
        "payload_summary": "Line differential relay communications channel",
        "bandwidth_profile": "64 kbps protection channel",
        "device_roles": "SEL relay pair carried through ICON C37.94 tributary card",
        "timing_profile": "Latency and asymmetry tracked for protection communications",
        "commissioning_status": "passed synthetic relay communications test",
        "evidence_requirements": "latency sheet, relay channel screenshot, as-built patch photo",
    },
    "DTT": {
        "payload_summary": "Direct transfer trip / teleprotection contact channel",
        "bandwidth_profile": "64 kbps protection channel",
        "device_roles": "transfer-trip relay I/O endpoints carried through ICON protection cards",
        "timing_profile": "Fast-trip path latency tracked with backup-path failover test",
        "commissioning_status": "ready for field retest",
        "evidence_requirements": "trip path continuity, failover record, relay test evidence",
    },
    "Mirrored_Bits": {
        "payload_summary": "Mirrored Bits relay status and permissive/blocking signals",
        "bandwidth_profile": "low-rate protection signaling",
        "device_roles": "relay logic endpoints carried through C37.94-style service placeholder",
        "timing_profile": "End-to-end signaling delay tracked",
        "commissioning_status": "synthetic bench-test complete",
        "evidence_requirements": "logic status capture and end-to-end test sheet",
    },
    "SCADA_VLAN": {
        "payload_summary": "SCADA RTU, recloser, and controller telemetry",
        "bandwidth_profile": "1G access with reserved SCADA VLAN",
        "device_roles": "RTU, switch, router, and distribution automation device traffic",
        "timing_profile": "Best-effort packet timing; monitored for congestion",
        "commissioning_status": "active synthetic telemetry service",
        "evidence_requirements": "VLAN test, ping/SCADA poll evidence, port photo",
    },
    "Ethernet_Pipe": {
        "payload_summary": "Point-to-point Ethernet pipe for operations traffic",
        "bandwidth_profile": "1G pipe with synthetic QoS profile",
        "device_roles": "router/switch handoff carried through ICON Ethernet transport",
        "timing_profile": "Packet latency measured during turnup",
        "commissioning_status": "active synthetic packet service",
        "evidence_requirements": "throughput test, VLAN handoff screenshot, patch photo",
    },
    "VSN": {
        "payload_summary": "Virtual synchronous network / containerized transport placeholder",
        "bandwidth_profile": "VSN container with engineered bandwidth allocation",
        "device_roles": "packet and legacy service bundle carried across ICON overlay",
        "timing_profile": "Container timing monitored against SONET/packet source",
        "commissioning_status": "pending synthetic engineering review",
        "evidence_requirements": "container assignment, path trace, service bundle checklist",
    },
    "PTP": {
        "payload_summary": "IEEE 1588 PTP timing distribution",
        "bandwidth_profile": "timing packet flow with priority QoS",
        "device_roles": "grandmaster, boundary clock, relay/IED timing endpoints",
        "timing_profile": "Primary timing service; quality and holdover tracked",
        "commissioning_status": "timing verification required",
        "evidence_requirements": "PTP lock evidence, timing quality capture, holdover test",
    },
    "DS1": {
        "payload_summary": "Legacy DS1 migration or TDM grooming path",
        "bandwidth_profile": "1.544 Mbps DS1",
        "device_roles": "RTU, channel bank, provider handoff, or legacy mux endpoint",
        "timing_profile": "TDM timing tracked from ICON transport source",
        "commissioning_status": "migration candidate",
        "evidence_requirements": "bit-error test, timeslot sheet, migration closeout",
    },
    "NMS_VLAN": {
        "payload_summary": "NMS, syslog, SNMP, and management reachability",
        "bandwidth_profile": "management VLAN with restricted access placeholder",
        "device_roles": "ICON management, router, firewall, and NMS collector traffic",
        "timing_profile": "not timing critical",
        "commissioning_status": "active synthetic management service",
        "evidence_requirements": "NMS reachability, syslog/SNMP status, access review",
    },
    "PMU": {
        "payload_summary": "Synchrophasor / PMU data transport",
        "bandwidth_profile": "packet telemetry with timing-aware QoS",
        "device_roles": "PMU, phasor data concentrator, and operations network handoff",
        "timing_profile": "PTP/GPS-aligned data flow monitored",
        "commissioning_status": "synthetic monitoring enabled",
        "evidence_requirements": "PDC receipt capture, timing quality, packet-loss check",
    },
    "leased_Ethernet_backup": {
        "payload_summary": "Provider Ethernet backup path",
        "bandwidth_profile": "leased Ethernet backup, provider-demarc placeholder",
        "device_roles": "provider NID, firewall, router, and ICON Ethernet handoff",
        "timing_profile": "backup path latency monitored during failover",
        "commissioning_status": "provider demarc verification pending",
        "evidence_requirements": "provider handoff test, demarc photo, failover evidence",
    },
    "relay_engineering_VLAN": {
        "payload_summary": "Relay engineering access VLAN",
        "bandwidth_profile": "restricted engineering VLAN",
        "device_roles": "relay engineering workstation jump path and relay management ports",
        "timing_profile": "not timing critical",
        "commissioning_status": "access review required",
        "evidence_requirements": "firewall rule review, access test, change-log evidence",
    },
}


def _site_from_node(node_name: str) -> str:
    return node_name.rsplit("-ICON-01", 1)[0] if "-ICON-01" in node_name else node_name.split("-", 1)[0]


def _device_name_for_site(site: str, service_type: str, role: str) -> str:
    suffix_by_type = {
        "C37.94": "SEL411L",
        "DTT": "SEL-TRIP",
        "Mirrored_Bits": "SEL-MB",
        "PTP": "GPS",
        "DS1": "RTU",
        "SCADA_VLAN": "RTU",
        "Ethernet_Pipe": "SW",
        "VSN": "VSN-GW",
        "NMS_VLAN": "NMS-GW",
        "PMU": "PMU",
        "leased_Ethernet_backup": "NID",
        "relay_engineering_VLAN": "FW",
    }
    suffix = suffix_by_type.get(service_type, "EDGE")
    return f"{site}-{suffix}-{role}"


def _service_detail_fields(service_type: str, a_node: str, z_node: str, ring: str, circuit_id: str, criticality: str) -> dict:
    profile = _SERVICE_TYPE_DETAILS.get(service_type, _SERVICE_TYPE_DETAILS["Ethernet_Pipe"])
    a_site = _site_from_node(a_node)
    z_site = _site_from_node(z_node)
    carried_devices = [_device_name_for_site(a_site, service_type, "A"), _device_name_for_site(z_site, service_type, "Z")]
    service_owner = "Internal utility telecom" if service_type != "leased_Ethernet_backup" else "Synthetic telecom provider"
    access_group = "protection_telecom" if criticality == "critical" else "operations_telecom"
    if service_type in {"NMS_VLAN", "relay_engineering_VLAN"}:
        access_group = "restricted_management"
    return {
        "carried_devices": carried_devices,
        "carried_devices_summary": "; ".join(carried_devices),
        "carried_device_count": len(carried_devices),
        "service_profile_summary": f"{service_type} service carrying {profile['payload_summary']} over {ring}.",
        "payload_summary": profile["payload_summary"],
        "bandwidth_profile": profile["bandwidth_profile"],
        "endpoint_device_roles": profile["device_roles"],
        "timing_profile": profile["timing_profile"],
        "commissioning_status": profile["commissioning_status"],
        "evidence_requirements": profile["evidence_requirements"],
        "service_owner": service_owner,
        "owner_access_group": access_group,
        "assumed_or_verified_path": "synthetic_assumed_transport_path",
        "vlan_or_timeslot": _vlan_or_timeslot(service_type, circuit_id),
        "field_notes": "Synthetic service record for planning demos; verify against approved engineering records before field use.",
        "risk_notes": "Do not treat as actual live topology or protection setting.",
    }


def _vlan_or_timeslot(service_type: str, circuit_id: str) -> str:
    token = sum(ord(char) for char in circuit_id) % 200
    if service_type in {"SCADA_VLAN", "NMS_VLAN", "relay_engineering_VLAN"}:
        return f"VLAN {2100 + token}"
    if service_type in {"Ethernet_Pipe", "VSN", "PMU", "leased_Ethernet_backup"}:
        return f"Pipe/VSN container {100 + token}"
    if service_type == "DS1":
        return f"DS1 timeslot group {1 + (token % 24)}"
    if service_type in {"C37.94", "DTT", "Mirrored_Bits"}:
        return f"Protection channel {1 + (token % 8)}"
    return "engineering assignment placeholder"


def _provisioning_parameters(site: str, node_name: str, module_type: str, service_type: str | None = None, slot_number: int | None = None) -> dict:
    return {
        "manual_reference": "SEL manual/application guide section placeholder",
        "manual_revision": "authorized revision placeholder",
        "engineering_standard_reference": "TelecomNE SEL ICON provisioning standard placeholder",
        "synthetic_data_notice": "Fictional demo parameters; not actual utility telecom topology or protection settings.",
        "parameter_categories": deepcopy(_PROVISIONING_CATEGORIES),
        "node_identity": {
            "node_name": node_name,
            "site_substation": site,
            "management_ip": "synthetic management IP placeholder",
            "firmware_revision": "4.2.1 planning standard",
            "chassis_type": "ICON rack chassis",
            "operational_role": "synthetic planning role",
            "network_role": "regional ICON transport overlay",
        },
        "line_module_configuration": {
            "chassis_slot": slot_number,
            "module_type": module_type,
            "module_serial_number": f"SYN-{site}-{slot_number or 0}-{module_type}".replace("_", "-"),
            "port_count": 8 if "DS1" in module_type else 4,
            "service_role": service_type or "transport",
            "optical_interface_type": "singlemode LC placeholder",
            "patch_panel_port": f"{site}-FPP planning port placeholder",
        },
        "service_provisioning": {
            "service_type": service_type or "transport",
            "criticality": "critical" if service_type in {"C37.94", "87L", "DTT", "PTP", "IRIG_B"} else "high",
            "latency_requirement_ms": 8 if service_type in {"C37.94", "87L", "DTT"} else 25,
            "protection_class": service_type or "transport",
            "service_status": "synthetic_planning",
        },
        "security_management": {
            "authentication_mode": "centralized_auth_with_local_fallback",
            "nms_integration": "NMS reference placeholder",
            "snmp_status": "enabled placeholder",
            "syslog_status": "enabled placeholder",
            "firmware_tracking": "tracked against planning standard placeholder",
        },
        "commissioning_test_parameters": {
            "pre_install_checklist_status": "required",
            "fiber_continuity_test": "required",
            "latency_test": "required for protection and SCADA paths",
            "timing_verification": "required for timing or SONET-derived services",
            "final_engineer_approval": "required before as-built closeout",
        },
    }


def _icon_slot(slot_number: int, module_type: str, node_name: str, site: str, service_type: str, active: int, proposed: int, alarms: int = 0) -> dict:
    port_count = 8 if module_type == "DS1_tributary" else 6 if module_type == "VSN_packet" else 4
    return {
        "slot_number": slot_number,
        "card_type": module_type,
        "module_type": module_type,
        "module_name": f"{node_name} {module_type} card",
        "port_count": port_count,
        "active_services": active,
        "proposed_services": proposed,
        "alarms": alarms,
        "work_orders": 1 if proposed else 0,
        "ports": [f"{module_type}-P{index}" for index in range(1, port_count + 1)],
        "provisioning_parameters": _provisioning_parameters(site, node_name, module_type, service_type, slot_number),
    }


def _service(service_id: str, service_name: str, service_type: str, a_node: str, z_node: str, a_port: str, z_port: str, circuit_id: str, ring: str, latency_requirement_ms: float, measured_latency_ms: float, criticality: str = "high") -> dict:
    a_device = next((item for item in _DEVICES if item["device_name"] == a_node), None)
    site = _site_from_node(a_node)
    detail_fields = _service_detail_fields(service_type, a_node, z_node, ring, circuit_id, criticality)
    return {
        "id": service_id,
        "node_id": a_device["id"] if a_device else service_id,
        "service_name": service_name,
        "service_type": service_type,
        "a_end": f"{a_node} {a_port}",
        "z_end": f"{z_node} {z_port}",
        "circuit": circuit_id,
        "status": "active",
        "latency_requirement_ms": latency_requirement_ms,
        "measured_latency_ms": measured_latency_ms,
        "fiber_path": f"{ring} synthetic assumed transport path",
        "protection_class": service_type,
        "criticality": criticality,
        "proposed_change_status": "none",
        "work_order": "synthetic operational view",
        "provisioning_parameters": _provisioning_parameters(site, a_node, service_type, service_type),
        **detail_fields,
    }


def _circuit_from_service(service: dict) -> dict:
    return {
        "id": f"op-circ-{service['circuit'].lower().replace('.', '').replace('/', '-').replace('_', '-').replace(' ', '-')}",
        "circuit_id": service["circuit"],
        "circuit_name": service["service_name"],
        "service_type": service["service_type"],
        "transport_type": "SEL ICON synthetic operational service",
        "a_end_device": service["a_end"].split(" ", 1)[0],
        "z_end_device": service["z_end"].split(" ", 1)[0],
        "a_end_port": service["a_end"].split(" ", 1)[1],
        "z_end_port": service["z_end"].split(" ", 1)[1],
        "operational_status": "in_service",
        "measured_latency_ms": service["measured_latency_ms"],
        "alarm_status": "normal",
        "provisioning_parameters": service["provisioning_parameters"],
        "service_profile_summary": service.get("service_profile_summary"),
        "carried_devices_summary": service.get("carried_devices_summary"),
        "bandwidth_profile": service.get("bandwidth_profile"),
        "vlan_or_timeslot": service.get("vlan_or_timeslot"),
        "owner_access_group": service.get("owner_access_group"),
        "assumed_or_verified_path": service.get("assumed_or_verified_path"),
    }


def _enrich_existing_icon_services() -> None:
    for service in _ICON_SERVICES:
        if service.get("carried_devices_summary"):
            continue
        a_node = str(service.get("a_end", "")).split(" ", 1)[0]
        z_node = str(service.get("z_end", "")).split(" ", 1)[0]
        circuit_id = str(service.get("circuit") or service.get("service_name") or service["id"])
        service_type = str(service.get("service_type") or "Ethernet_Pipe")
        criticality = "critical" if service_type in {"C37.94", "87L", "DTT", "Mirrored_Bits", "PTP"} else "high"
        service.setdefault("criticality", criticality)
        service.setdefault("proposed_change_status", "none")
        service.setdefault("work_order", "synthetic operational view")
        service.setdefault("protection_class", service_type)
        service.setdefault("provisioning_parameters", _provisioning_parameters(_site_from_node(a_node), a_node, service_type, service_type))
        service.update(_service_detail_fields(service_type, a_node, z_node, str(service.get("fiber_path") or "Existing ICON synthetic path"), circuit_id, criticality))


def _refresh_icon_device_summaries() -> None:
    for device in _DEVICES:
        if device.get("device_type") != "SEL_ICON":
            continue
        node_name = device["device_name"]
        services = [item for item in _ICON_SERVICES if item.get("node_id") == device["id"] or node_name in str(item.get("a_end")) or node_name in str(item.get("z_end"))]
        service_types = sorted({str(item.get("service_type")) for item in services if item.get("service_type")})
        carried_devices = sorted({
            carried
            for item in services
            for carried in str(item.get("carried_devices_summary") or "").split("; ")
            if carried
        })
        critical_count = len([item for item in services if item.get("criticality") == "critical"])
        device["service_count"] = len({item.get("id") for item in services})
        device["service_classes_carried"] = ", ".join(service_types) or "none"
        device["services_carried_summary"] = ", ".join(f"{service_type}:{len([item for item in services if item.get('service_type') == service_type])}" for service_type in service_types) or "No synthetic services assigned"
        device["carried_device_count"] = len(carried_devices)
        device["carried_device_summary"] = "; ".join(carried_devices[:8]) if carried_devices else "No synthetic endpoint devices assigned"
        device["critical_service_count"] = critical_count
        device["field_focus"] = "Protection/timing priority" if critical_count else "Operations and packet services"


def _add_synthetic_expansion() -> None:
    if any(item["id"] == "op-ma-wor-icon-01" for item in _DEVICES):
        return

    _enrich_existing_icon_services()

    for device_id, device_name, substation_code, _city, ip, ring_name, alarm_status, timing_status, network_role in _REGIONAL_ICON_NODE_SPECS:
        _DEVICES.append(
            {
                "id": device_id,
                "device_name": device_name,
                "device_type": "SEL_ICON",
                "manufacturer": "SEL",
                "model": "ICON",
                "serial_number": f"SYN-{device_name}",
                "firmware_version": "4.2.1" if alarm_status != "major" else "4.1.9",
                "management_ip": ip,
                "substation_code": substation_code,
                "rack_name": f"{substation_code}-TELCO-R1",
                "operational_status": "up",
                "alarm_status": alarm_status,
                "timing_status": timing_status,
                "last_seen": SNAPSHOT_TIME,
                "criticality": "critical",
                "network_role": network_role,
                "synthetic_status": "synthetic_operational_api",
                "icon_network_name": ring_name,
            }
        )
        _PORTS[device_id] = [
            {"id": f"{device_id}-line-1", "port_name": "LINE-1", "port_type": "fiber", "port_speed": "OC-3", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic adjacent ICON node", "assigned_service": ring_name, "assigned_circuit": f"RING-{substation_code}-SYN"},
            {"id": f"{device_id}-line-2", "port_name": "LINE-2", "port_type": "fiber", "port_speed": "OC-3", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic alternate ICON node", "assigned_service": ring_name, "assigned_circuit": f"RING-{substation_code}-SYN"},
            {"id": f"{device_id}-c37-1", "port_name": "C37.94-1", "port_type": "C37.94", "port_speed": "64k", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic relay channel", "assigned_service": "protection telecom", "assigned_circuit": None},
            {"id": f"{device_id}-ds1-1", "port_name": "DS1-1", "port_type": "DS1", "port_speed": "1.544M", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic DS1 mux", "assigned_service": "legacy migration", "assigned_circuit": None},
            {"id": f"{device_id}-eth-1", "port_name": "ETH-1", "port_type": "ethernet", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic SCADA switch", "assigned_service": "Ethernet/SCADA", "assigned_circuit": None},
            {"id": f"{device_id}-timing-1", "port_name": "TIMING-1", "port_type": "PTP", "port_speed": "timing", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic timing source", "assigned_service": "PTP/IRIG-B timing", "assigned_circuit": None},
        ]
        _ICON_SLOTS[device_id] = [
            _icon_slot(1, "control_processor", device_name, substation_code, "management", 1, 0, 0),
            _icon_slot(2, "SONET_line", device_name, substation_code, "transport", 2, 1, 1 if timing_status != "normal" else 0),
            _icon_slot(3, "C37_94", device_name, substation_code, "C37.94", 2, 2, 0),
            _icon_slot(4, "DS1_tributary", device_name, substation_code, "DS1", 2, 1, 0),
            _icon_slot(5, "Ethernet_transport", device_name, substation_code, "Ethernet_Pipe", 3, 2, 0),
            _icon_slot(6, "VSN_packet", device_name, substation_code, "VSN", 1, 2, 0),
            _icon_slot(7, "timing_IO", device_name, substation_code, "PTP", 1, 1, 1 if timing_status != "normal" else 0),
        ]

    for device_id, device_name, device_type, manufacturer, model, ip, substation_code, alarm_status, criticality in _DEVICE_TYPE_EXAMPLES:
        _DEVICES.append(
            {
                "id": device_id,
                "device_name": device_name,
                "device_type": device_type,
                "manufacturer": manufacturer,
                "model": model,
                "serial_number": f"SYN-{device_name}",
                "firmware_version": "synthetic-standard",
                "management_ip": ip,
                "substation_code": substation_code,
                "rack_name": f"{substation_code}-TELCO-R1",
                "operational_status": "up",
                "alarm_status": alarm_status,
                "timing_status": "not_applicable",
                "last_seen": SNAPSHOT_TIME,
                "criticality": criticality,
                "synthetic_status": "synthetic_operational_api",
            }
        )
        _PORTS[device_id] = [
            {"id": f"{device_id}-mgmt", "port_name": "MGMT-1", "port_type": "ethernet", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic management network", "assigned_service": "NMS", "assigned_circuit": None},
            {"id": f"{device_id}-svc", "port_name": "SVC-1", "port_type": "ethernet", "port_speed": "1G", "admin_status": "enabled", "operational_status": "up", "connected_to": "synthetic ICON service handoff", "assigned_service": "service handoff", "assigned_circuit": None},
        ]

    service_specs = [
        ("svc-ma-wbs-aub-87l-002", "87L-MA-WBS-AUB-002", "C37.94", "MA-WBS-ICON-01", "MA-AUB-ICON-01", "C37.94-1", "C37.94-1", "87L-MA-WBS-AUB-002", "Central Massachusetts ICON Ring", 8, 3.2, "critical"),
        ("svc-ma-aub-mil-dtt-002", "DTT-MA-AUB-MIL-002", "DTT", "MA-AUB-ICON-01", "MA-MIL-ICON-01", "C37.94-1", "C37.94-1", "DTT-MA-AUB-MIL-002", "Central Massachusetts ICON Ring", 8, 3.6, "critical"),
        ("svc-ma-wor-wbs-scada-001", "SCADA-MA-WOR-WBS-001", "SCADA_VLAN", "MA-WOR-ICON-01", "MA-WBS-ICON-01", "ETH-1", "ETH-1", "SCADA-MA-WOR-WBS-001", "Central Massachusetts ICON Ring", 25, 5.4, "high"),
        ("svc-ma-fra-bos-eth-001", "ETH-MA-FRA-BOS-001", "Ethernet_Pipe", "MA-FRA-ICON-01", "MA-BOS-ICON-01", "ETH-1", "ETH-1", "ETH-MA-FRA-BOS-001", "Eastern Massachusetts ICON Ring", 25, 4.8, "high"),
        ("svc-ri-pvd-bos-vsn-001", "VSN-RI-PVD-BOS-001", "VSN", "RI-PVD-ICON-01", "MA-BOS-ICON-01", "VSN-1", "VSN-1", "VSN-RI-PVD-BOS-001", "Rhode Island Tie Ring", 20, 6.1, "high"),
        ("svc-ct-hfd-nhv-ptp-001", "PTP-CT-HFD-NHV-001", "PTP", "CT-HFD-ICON-01", "CT-NHV-ICON-01", "TIMING-1", "TIMING-1", "PTP-CT-HFD-NHV-001", "Connecticut ICON Ring", 5, 1.9, "critical"),
        ("svc-nh-man-vt-rut-mb-001", "MB-NH-MAN-VT-RUT-001", "Mirrored_Bits", "NH-MAN-ICON-01", "VT-RUT-ICON-01", "C37.94-1", "C37.94-1", "MB-NH-MAN-VT-RUT-001", "Northern New England ICON Ring", 8, 4.2, "critical"),
        ("svc-me-por-bos-leased-001", "LEASED-BKUP-ME-POR-BOS-001", "leased_Ethernet_backup", "ME-POR-ICON-01", "MA-BOS-ICON-01", "ETH-1", "ETH-2", "LEASED-BKUP-ME-POR-BOS-001", "Leased Backup Transport Ring", 35, 14.5, "high"),
        ("svc-vt-rut-bos-pmu-001", "PMU-VT-RUT-MA-BOS-001", "PMU", "VT-RUT-ICON-01", "MA-BOS-ICON-01", "ETH-2", "ETH-3", "PMU-VT-RUT-MA-BOS-001", "Inter-Utility Shared Transport Ring", 16, 7.3, "high"),
        ("svc-ma-wbs-ds1-mig-001", "DS1-MIG-MA-WBS-CTRL-001", "DS1", "MA-WBS-ICON-01", "ME-POR-ICON-01", "DS1-1", "DS1-1", "DS1-MIG-MA-WBS-CTRL-001", "Leased Backup Transport Ring", 20, 8.9, "normal"),
        ("svc-ct-nhv-ri-pvd-relay-vlan", "RELAY-ENG-CT-NHV-RI-PVD-001", "relay_engineering_VLAN", "CT-NHV-ICON-01", "RI-PVD-ICON-01", "ETH-2", "ETH-2", "RELAY-ENG-CT-NHV-RI-PVD-001", "Connecticut ICON Ring", 30, 9.1, "high"),
        ("svc-ma-bos-nms-001", "NMS-MA-BOS-REGION-001", "NMS_VLAN", "MA-BOS-ICON-01", "CT-HFD-ICON-01", "ETH-4", "ETH-4", "NMS-MA-BOS-REGION-001", "Inter-Utility Shared Transport Ring", 30, 6.8, "normal"),
        ("svc-ma-wbs-aub-mb-003", "MB-MA-WBS-AUB-003", "Mirrored_Bits", "MA-WBS-ICON-01", "MA-AUB-ICON-01", "C37.94-2", "C37.94-2", "MB-MA-WBS-AUB-003", "Central Massachusetts ICON Ring", 8, 3.3, "critical"),
        ("svc-ma-wor-aub-scada-001", "SCADA-MA-WOR-AUB-REC-001", "SCADA_VLAN", "MA-WOR-ICON-01", "MA-AUB-ICON-01", "ETH-2", "ETH-2", "SCADA-MA-WOR-AUB-REC-001", "Central Massachusetts ICON Ring", 25, 5.8, "high"),
        ("svc-ma-bos-fra-nms-002", "NMS-MA-BOS-FRA-002", "NMS_VLAN", "MA-BOS-ICON-01", "MA-FRA-ICON-01", "ETH-3", "ETH-3", "NMS-MA-BOS-FRA-002", "Eastern Massachusetts ICON Ring", 30, 4.4, "normal"),
        ("svc-ri-pvd-fra-leased-002", "LEASED-BKUP-RI-PVD-MA-FRA-002", "leased_Ethernet_backup", "RI-PVD-ICON-01", "MA-FRA-ICON-01", "ETH-3", "ETH-3", "LEASED-BKUP-RI-PVD-MA-FRA-002", "Rhode Island Tie Ring", 35, 12.4, "high"),
        ("svc-ct-hfd-bos-pmu-002", "PMU-CT-HFD-MA-BOS-002", "PMU", "CT-HFD-ICON-01", "MA-BOS-ICON-01", "ETH-2", "ETH-5", "PMU-CT-HFD-MA-BOS-002", "Inter-Utility Shared Transport Ring", 16, 6.6, "high"),
        ("svc-ct-nhv-hfd-ds1-002", "DS1-MIG-CT-NHV-HFD-002", "DS1", "CT-NHV-ICON-01", "CT-HFD-ICON-01", "DS1-1", "DS1-1", "DS1-MIG-CT-NHV-HFD-002", "Connecticut ICON Ring", 20, 8.1, "normal"),
        ("svc-nh-man-me-por-scada-001", "SCADA-NH-MAN-ME-POR-001", "SCADA_VLAN", "NH-MAN-ICON-01", "ME-POR-ICON-01", "ETH-1", "ETH-1", "SCADA-NH-MAN-ME-POR-001", "Northern New England ICON Ring", 28, 10.4, "high"),
        ("svc-vt-rut-nh-man-ptp-002", "PTP-VT-RUT-NH-MAN-002", "PTP", "VT-RUT-ICON-01", "NH-MAN-ICON-01", "TIMING-1", "TIMING-1", "PTP-VT-RUT-NH-MAN-002", "Northern New England ICON Ring", 5, 2.2, "critical"),
        ("svc-ma-mil-wor-eth-002", "ETH-MA-MIL-WOR-002", "Ethernet_Pipe", "MA-MIL-ICON-01", "MA-WOR-ICON-01", "ETH-2", "ETH-3", "ETH-MA-MIL-WOR-002", "Central Massachusetts ICON Ring", 25, 5.1, "high"),
        ("svc-ma-aub-ri-pvd-vsn-002", "VSN-MA-AUB-RI-PVD-002", "VSN", "MA-AUB-ICON-01", "RI-PVD-ICON-01", "VSN-2", "VSN-2", "VSN-MA-AUB-RI-PVD-002", "Inter-Utility Shared Transport Ring", 20, 7.6, "high"),
        ("svc-me-por-nh-man-nms-001", "NMS-ME-POR-NH-MAN-001", "NMS_VLAN", "ME-POR-ICON-01", "NH-MAN-ICON-01", "ETH-2", "ETH-2", "NMS-ME-POR-NH-MAN-001", "Leased Backup Transport Ring", 30, 9.7, "normal"),
        ("svc-ma-bos-ri-pvd-relay-vlan-002", "RELAY-ENG-MA-BOS-RI-PVD-002", "relay_engineering_VLAN", "MA-BOS-ICON-01", "RI-PVD-ICON-01", "ETH-6", "ETH-4", "RELAY-ENG-MA-BOS-RI-PVD-002", "Rhode Island Tie Ring", 30, 6.3, "high"),
        ("svc-ct-hfd-ri-pvd-dtt-003", "DTT-CT-HFD-RI-PVD-003", "DTT", "CT-HFD-ICON-01", "RI-PVD-ICON-01", "C37.94-2", "C37.94-2", "DTT-CT-HFD-RI-PVD-003", "Inter-Utility Shared Transport Ring", 8, 4.9, "critical"),
        ("svc-vt-rut-ct-nhv-c37-004", "87L-VT-RUT-CT-NHV-004", "C37.94", "VT-RUT-ICON-01", "CT-NHV-ICON-01", "C37.94-2", "C37.94-2", "87L-VT-RUT-CT-NHV-004", "Inter-Utility Shared Transport Ring", 8, 6.4, "critical"),
        ("svc-ma-fra-ct-hfd-eth-003", "ETH-MA-FRA-CT-HFD-003", "Ethernet_Pipe", "MA-FRA-ICON-01", "CT-HFD-ICON-01", "ETH-4", "ETH-3", "ETH-MA-FRA-CT-HFD-003", "Inter-Utility Shared Transport Ring", 25, 6.9, "high"),
        ("svc-ma-wbs-bos-pmu-003", "PMU-MA-WBS-BOS-003", "PMU", "MA-WBS-ICON-01", "MA-BOS-ICON-01", "ETH-3", "ETH-7", "PMU-MA-WBS-BOS-003", "Eastern Massachusetts ICON Ring", 16, 5.7, "high"),
        ("svc-ma-wor-ri-pvd-ds1-003", "DS1-MIG-MA-WOR-RI-PVD-003", "DS1", "MA-WOR-ICON-01", "RI-PVD-ICON-01", "DS1-1", "DS1-1", "DS1-MIG-MA-WOR-RI-PVD-003", "Rhode Island Tie Ring", 20, 9.4, "normal"),
        ("svc-nh-man-bos-leased-003", "LEASED-BKUP-NH-MAN-MA-BOS-003", "leased_Ethernet_backup", "NH-MAN-ICON-01", "MA-BOS-ICON-01", "ETH-3", "ETH-8", "LEASED-BKUP-NH-MAN-MA-BOS-003", "Leased Backup Transport Ring", 35, 13.1, "high"),
        ("svc-me-por-vt-rut-mb-002", "MB-ME-POR-VT-RUT-002", "Mirrored_Bits", "ME-POR-ICON-01", "VT-RUT-ICON-01", "C37.94-1", "C37.94-1", "MB-ME-POR-VT-RUT-002", "Northern New England ICON Ring", 8, 5.5, "critical"),
        ("svc-ct-nhv-fra-scada-002", "SCADA-CT-NHV-MA-FRA-002", "SCADA_VLAN", "CT-NHV-ICON-01", "MA-FRA-ICON-01", "ETH-3", "ETH-5", "SCADA-CT-NHV-MA-FRA-002", "Inter-Utility Shared Transport Ring", 25, 7.2, "high"),
        ("svc-ma-mil-ct-hfd-nms-003", "NMS-MA-MIL-CT-HFD-003", "NMS_VLAN", "MA-MIL-ICON-01", "CT-HFD-ICON-01", "ETH-3", "ETH-4", "NMS-MA-MIL-CT-HFD-003", "Inter-Utility Shared Transport Ring", 30, 7.9, "normal"),
        ("svc-ri-pvd-me-por-ptp-004", "PTP-RI-PVD-ME-POR-004", "PTP", "RI-PVD-ICON-01", "ME-POR-ICON-01", "TIMING-2", "TIMING-2", "PTP-RI-PVD-ME-POR-004", "Leased Backup Transport Ring", 5, 3.6, "critical"),
        ("svc-ma-aub-bos-relay-vlan-004", "RELAY-ENG-MA-AUB-BOS-004", "relay_engineering_VLAN", "MA-AUB-ICON-01", "MA-BOS-ICON-01", "ETH-4", "ETH-9", "RELAY-ENG-MA-AUB-BOS-004", "Eastern Massachusetts ICON Ring", 30, 5.2, "high"),
        ("svc-ma-wbs-vt-rut-dtt-004", "DTT-MA-WBS-VT-RUT-004", "DTT", "MA-WBS-ICON-01", "VT-RUT-ICON-01", "C37.94-3", "C37.94-3", "DTT-MA-WBS-VT-RUT-004", "Inter-Utility Shared Transport Ring", 8, 6.8, "critical"),
    ]
    for args in service_specs:
        service = _service(*args)
        _ICON_SERVICES.append(service)
        _CIRCUITS.append(_circuit_from_service(service))

    _refresh_icon_device_summaries()

    _ALARMS.extend(
        [
            {"id": "alarm-me-por-holdover-001", "device_id": "op-me-por-icon-01", "device_name": "ME-POR-ICON-01", "severity": "critical", "alarm_type": "timing", "message": "Synthetic leased backup hub in holdover timing state", "raised_at": "2026-06-04T14:05:00+00:00"},
            {"id": "alarm-ma-bos-minor-001", "device_id": "op-ma-bos-icon-01", "device_name": "MA-BOS-ICON-01", "severity": "warning", "alarm_type": "service", "message": "Synthetic VSN service has pending provisioning review", "raised_at": "2026-06-04T14:08:00+00:00"},
        ]
    )


_add_synthetic_expansion()


def _copy(value):
    return deepcopy(value)


def get_devices() -> list[dict]:
    return _copy(_DEVICES)


def get_device(device_id: str) -> dict | None:
    return _copy(next((item for item in _DEVICES if item["id"] == device_id or item["device_name"] == device_id), None))


def get_device_ports(device_id: str) -> list[dict]:
    device = get_device(device_id)
    if not device:
        return []
    return _copy(_PORTS.get(device["id"], []))


def get_icon_nodes() -> list[dict]:
    nodes = [item for item in _DEVICES if item["device_type"] == "SEL_ICON"]
    return _copy(nodes)


def get_icon_node(node_id: str) -> dict | None:
    device = get_device(node_id)
    if not device or device.get("device_type") != "SEL_ICON":
        return None
    return _copy(device)


def get_icon_slots(node_id: str) -> list[dict]:
    node = get_icon_node(node_id)
    if not node:
        return []
    return _copy(_ICON_SLOTS.get(node["id"], []))


def get_icon_modules(node_id: str) -> list[dict]:
    return get_icon_slots(node_id)


def get_icon_services(node_id: str) -> list[dict]:
    node = get_icon_node(node_id)
    if not node:
        return []
    node_name = node["device_name"]
    services = [item for item in _ICON_SERVICES if item["node_id"] == node["id"] or node_name in item["a_end"] or node_name in item["z_end"]]
    return _copy(services)


def get_circuits() -> list[dict]:
    return _copy(_CIRCUITS)


def get_circuit(circuit_id: str) -> dict | None:
    return _copy(next((item for item in _CIRCUITS if item["id"] == circuit_id or item["circuit_id"] == circuit_id), None))


def get_network_links() -> list[dict]:
    return [
        {"id": "link-wbs-aub", "a_end": "WBS-ICON-01", "z_end": "AUB-ICON-01", "medium": "OPGW", "status": "active", "fiber_cable": "OPGW-L143-WBS-AUB-48F"},
        {"id": "link-aub-mil", "a_end": "AUB-ICON-01", "z_end": "MIL-ICON-01", "medium": "OPGW", "status": "active", "fiber_cable": "OPGW-L172-AUB-MIL-72F"},
    ]


def get_alarms() -> list[dict]:
    return _copy(_ALARMS)


def get_firmware_versions() -> list[dict]:
    return [{"device_name": item["device_name"], "firmware_version": item.get("firmware_version"), "standard_version": "4.2.1" if item["device_type"] == "SEL_ICON" else item.get("firmware_version")} for item in _DEVICES]


def get_timing_status() -> list[dict]:
    return [{"device_name": item["device_name"], "timing_status": item.get("timing_status"), "source": "GPS" if item["device_name"] == "WBS-ICON-01" else "SONET_timing"} for item in _DEVICES if item["device_type"] == "SEL_ICON"]


def get_service_status() -> list[dict]:
    return [{"service_name": item["service_name"], "service_type": item["service_type"], "status": item["status"], "circuit": item["circuit"]} for item in _ICON_SERVICES]


def get_topology() -> dict:
    return {"name": "Central MA ICON Ring", "mode": "hybrid_ring_linear", "nodes": get_icon_nodes(), "links": get_network_links(), "snapshot_time": SNAPSHOT_TIME}
