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

