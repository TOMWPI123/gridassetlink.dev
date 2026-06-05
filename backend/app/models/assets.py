from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin(SQLModel):
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    updated_by: Optional[int] = Field(default=None, foreign_key="users.id")


class User(TimestampMixin, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    full_name: str = Field(max_length=255)
    password_hash: str
    role: str = Field(index=True, max_length=50)
    is_active: bool = True


class Substation(TimestampMixin, table=True):
    __tablename__ = "substations"
    id: Optional[int] = Field(default=None, primary_key=True)
    substation_code: str = Field(index=True, unique=True, max_length=40)
    name: str = Field(index=True, max_length=255)
    voltage_level: Optional[str] = None
    region: Optional[str] = Field(default=None, index=True)
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class Rack(TimestampMixin, table=True):
    __tablename__ = "racks"
    id: Optional[int] = Field(default=None, primary_key=True)
    substation_id: Optional[int] = Field(default=None, foreign_key="substations.id", index=True)
    rack_name: str = Field(max_length=120)
    room: Optional[str] = None
    elevation: Optional[str] = None
    rack_unit_count: Optional[int] = None
    notes: Optional[str] = None


class Device(TimestampMixin, table=True):
    __tablename__ = "devices"
    id: Optional[int] = Field(default=None, primary_key=True)
    device_name: str = Field(index=True, unique=True, max_length=160)
    device_type: str = Field(index=True, max_length=80)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    substation_id: Optional[int] = Field(default=None, foreign_key="substations.id", index=True)
    rack_id: Optional[int] = Field(default=None, foreign_key="racks.id")
    location_description: Optional[str] = None
    ip_address: Optional[str] = None
    management_vlan: Optional[str] = None
    status: str = Field(default="active", index=True)
    criticality: str = Field(default="normal", index=True)
    notes: Optional[str] = None


class DevicePort(TimestampMixin, table=True):
    __tablename__ = "device_ports"
    id: Optional[int] = Field(default=None, primary_key=True)
    device_id: Optional[int] = Field(default=None, foreign_key="devices.id", index=True)
    port_name: str = Field(max_length=120)
    port_type: str = Field(index=True, max_length=80)
    speed: Optional[str] = None
    connector_type: Optional[str] = None
    connected_patch_panel_port_id: Optional[int] = Field(default=None, foreign_key="patch_panel_ports.id")
    connected_fiber_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id")
    connected_circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id")
    port_role: Optional[str] = None
    physical_label: Optional[str] = None
    status: str = Field(default="available", index=True)
    notes: Optional[str] = None


class IconNode(TimestampMixin, table=True):
    __tablename__ = "icon_nodes"
    id: Optional[int] = Field(default=None, primary_key=True)
    device_id: Optional[int] = Field(default=None, foreign_key="devices.id", index=True)
    node_name: str = Field(index=True, unique=True, max_length=160)
    chassis_type: Optional[str] = None
    transport_mode: Optional[str] = None
    timing_source_id: Optional[int] = Field(default=None, foreign_key="timing_sources.id")
    icon_network_name: Optional[str] = None
    firmware_version: Optional[str] = None
    management_ip: Optional[str] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class IconSlot(TimestampMixin, table=True):
    __tablename__ = "icon_slots"
    id: Optional[int] = Field(default=None, primary_key=True)
    icon_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id", index=True)
    slot_number: int
    module_id: Optional[int] = Field(default=None, foreign_key="icon_modules.id")
    notes: Optional[str] = None


class IconModule(TimestampMixin, table=True):
    __tablename__ = "icon_modules"
    id: Optional[int] = Field(default=None, primary_key=True)
    icon_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id", index=True)
    slot_number: int
    module_type: str = Field(index=True, max_length=80)
    manufacturer: Optional[str] = "SEL"
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    port_count: Optional[int] = None
    service_role: Optional[str] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class TransmissionLine(TimestampMixin, table=True):
    __tablename__ = "transmission_lines"
    id: Optional[int] = Field(default=None, primary_key=True)
    line_name: str = Field(index=True, unique=True, max_length=120)
    voltage_kv: Optional[float] = None
    from_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    to_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    structure_start: Optional[str] = None
    structure_end: Optional[str] = None
    owner: Optional[str] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class DistributionFeeder(TimestampMixin, table=True):
    __tablename__ = "distribution_feeders"
    id: Optional[int] = Field(default=None, primary_key=True)
    feeder_name: str = Field(index=True, unique=True, max_length=120)
    source_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    voltage_kv: Optional[float] = None
    feeder_type: Optional[str] = None
    region: Optional[str] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class FiberCable(TimestampMixin, table=True):
    __tablename__ = "fiber_cables"
    id: Optional[int] = Field(default=None, primary_key=True)
    cable_id: str = Field(index=True, unique=True, max_length=160)
    cable_type: str = Field(index=True, max_length=80)
    fiber_count: int
    owner: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    install_date: Optional[date] = None
    a_end_location: Optional[str] = None
    z_end_location: Optional[str] = None
    a_end_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    z_end_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    transmission_line_id: Optional[int] = Field(default=None, foreign_key="transmission_lines.id")
    distribution_feeder_id: Optional[int] = Field(default=None, foreign_key="distribution_feeders.id")
    route_name: Optional[str] = None
    route_miles: Optional[float] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class FiberSegment(TimestampMixin, table=True):
    __tablename__ = "fiber_segments"
    id: Optional[int] = Field(default=None, primary_key=True)
    fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id", index=True)
    segment_name: str = Field(max_length=160)
    a_location: Optional[str] = None
    z_location: Optional[str] = None
    a_latitude: Optional[float] = None
    a_longitude: Optional[float] = None
    z_latitude: Optional[float] = None
    z_longitude: Optional[float] = None
    length_ft: Optional[float] = None
    install_type: Optional[str] = None
    shared_conduit_risk: bool = False
    shared_structure_risk: bool = False
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class FiberStrand(TimestampMixin, table=True):
    __tablename__ = "fiber_strands"
    id: Optional[int] = Field(default=None, primary_key=True)
    fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id", index=True)
    strand_number: int = Field(index=True)
    tube_number: Optional[int] = None
    color: Optional[str] = None
    strand_color: Optional[str] = None
    buffer_tube_color: Optional[str] = None
    status: str = Field(default="available", index=True)
    assigned_service: Optional[str] = None
    assigned_circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id")
    assigned_device_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id")
    a_end_patch_panel_port_id: Optional[int] = Field(default=None, foreign_key="patch_panel_ports.id")
    z_end_patch_panel_port_id: Optional[int] = Field(default=None, foreign_key="patch_panel_ports.id")
    a_end_label: Optional[str] = None
    z_end_label: Optional[str] = None
    a_end_termination: Optional[str] = None
    z_end_termination: Optional[str] = None
    notes: Optional[str] = None


class SpliceClosure(TimestampMixin, table=True):
    __tablename__ = "splice_closures"
    id: Optional[int] = Field(default=None, primary_key=True)
    closure_id: str = Field(index=True, unique=True, max_length=160)
    closure_type: str = Field(index=True, max_length=80)
    site_or_structure: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    structure_number: Optional[str] = None
    pole_number: Optional[str] = None
    handhole_number: Optional[str] = None
    substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    install_date: Optional[date] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class SpliceTray(TimestampMixin, table=True):
    __tablename__ = "splice_trays"
    id: Optional[int] = Field(default=None, primary_key=True)
    splice_closure_id: Optional[int] = Field(default=None, foreign_key="splice_closures.id", index=True)
    tray_number: int = Field(index=True)
    tray_type: Optional[str] = None
    capacity: Optional[int] = None
    notes: Optional[str] = None


class FiberSplice(TimestampMixin, table=True):
    __tablename__ = "fiber_splices"
    id: Optional[int] = Field(default=None, primary_key=True)
    splice_closure_id: Optional[int] = Field(default=None, foreign_key="splice_closures.id", index=True)
    splice_tray_id: Optional[int] = Field(default=None, foreign_key="splice_trays.id", index=True)
    tray_position: Optional[int] = None
    incoming_fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id")
    incoming_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id")
    incoming_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id")
    incoming_strand_number: Optional[int] = None
    outgoing_fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id")
    outgoing_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id")
    outgoing_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id")
    outgoing_strand_number: Optional[int] = None
    splice_type: str = Field(default="fusion", index=True)
    loss_db: Optional[float] = None
    test_date: Optional[date] = None
    tested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    status: str = Field(default="planned", index=True)
    notes: Optional[str] = None


class PatchPanel(TimestampMixin, table=True):
    __tablename__ = "patch_panels"
    id: Optional[int] = Field(default=None, primary_key=True)
    panel_id: str = Field(index=True, unique=True, max_length=160)
    substation_id: Optional[int] = Field(default=None, foreign_key="substations.id", index=True)
    rack_id: Optional[int] = Field(default=None, foreign_key="racks.id")
    panel_name: str = Field(max_length=160)
    fiber_type: Optional[str] = None
    connector_type: Optional[str] = None
    port_count: int = 24
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class PatchPanelPort(TimestampMixin, table=True):
    __tablename__ = "patch_panel_ports"
    id: Optional[int] = Field(default=None, primary_key=True)
    patch_panel_id: Optional[int] = Field(default=None, foreign_key="patch_panels.id", index=True)
    port_number: int
    port_label: Optional[str] = None
    fiber_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id")
    connected_fiber_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id")
    connected_device_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id")
    status: str = Field(default="available", index=True)
    notes: Optional[str] = None


class FiberAssignment(TimestampMixin, table=True):
    __tablename__ = "fiber_assignments"
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: str = Field(index=True, unique=True, max_length=160)
    fiber_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id", index=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id", index=True)
    device_id: Optional[int] = Field(default=None, foreign_key="devices.id", index=True)
    device_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id", index=True)
    patch_panel_port_id: Optional[int] = Field(default=None, foreign_key="patch_panel_ports.id", index=True)
    work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)
    assignment_type: str = Field(default="circuit_transport", index=True, max_length=80)
    assignment_status: str = Field(default="planned", index=True, max_length=80)
    assigned_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    assigned_date: Optional[date] = None
    released_date: Optional[date] = None
    notes: Optional[str] = None


class Provider(TimestampMixin, table=True):
    __tablename__ = "providers"
    id: Optional[int] = Field(default=None, primary_key=True)
    provider_name: str = Field(index=True, unique=True, max_length=160)
    provider_type: str = Field(index=True, max_length=80)
    account_number: Optional[str] = None
    noc_phone: Optional[str] = None
    support_email: Optional[str] = None
    escalation_contact: Optional[str] = None
    notes: Optional[str] = None


class Circuit(TimestampMixin, table=True):
    __tablename__ = "circuits"
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: str = Field(index=True, unique=True, max_length=160)
    circuit_name: str = Field(index=True, max_length=255)
    service_type: str = Field(index=True, max_length=80)
    transport_type: Optional[str] = None
    ownership_type: str = Field(index=True, max_length=80)
    provider_id: Optional[int] = Field(default=None, foreign_key="providers.id")
    a_end_site_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    z_end_site_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    a_end_device_id: Optional[int] = Field(default=None, foreign_key="devices.id")
    z_end_device_id: Optional[int] = Field(default=None, foreign_key="devices.id")
    a_end_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id")
    z_end_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id")
    bandwidth: Optional[str] = None
    vlan_id: Optional[str] = None
    ip_subnet: Optional[str] = None
    latency_requirement_ms: Optional[float] = None
    measured_latency_ms: Optional[float] = None
    protection_class: Optional[str] = None
    criticality: str = Field(default="normal", index=True)
    monthly_cost: Optional[float] = None
    install_cost: Optional[float] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    renewal_date: Optional[date] = None
    migration_status: Optional[str] = None
    status: str = Field(default="planned", index=True)
    notes: Optional[str] = None


class CircuitPath(TimestampMixin, table=True):
    __tablename__ = "circuit_paths"
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id", index=True)
    path_name: str = Field(max_length=160)
    path_role: str = Field(index=True, max_length=80)
    is_active: bool = True
    diversity_group: Optional[str] = None
    notes: Optional[str] = None


class CircuitPathElement(TimestampMixin, table=True):
    __tablename__ = "circuit_path_elements"
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_path_id: Optional[int] = Field(default=None, foreign_key="circuit_paths.id", index=True)
    sequence_number: int = Field(index=True)
    element_type: str = Field(index=True, max_length=80)
    element_id: Optional[int] = None
    element_label: str = Field(max_length=255)
    a_side_port: Optional[str] = None
    z_side_port: Optional[str] = None
    loss_db: Optional[float] = None
    latency_ms: Optional[float] = None
    notes: Optional[str] = None


class LeasedService(TimestampMixin, table=True):
    __tablename__ = "leased_services"
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id", index=True)
    provider_id: Optional[int] = Field(default=None, foreign_key="providers.id", index=True)
    provider_circuit_id: str = Field(index=True, max_length=160)
    service_order_number: Optional[str] = None
    billing_account: Optional[str] = None
    service_type: str = Field(index=True, max_length=80)
    bandwidth: Optional[str] = None
    handoff_type: Optional[str] = None
    demarc_location: Optional[str] = None
    a_end_address: Optional[str] = None
    z_end_address: Optional[str] = None
    sla_availability: Optional[str] = None
    sla_latency_ms: Optional[float] = None
    monthly_cost: Optional[float] = None
    install_cost: Optional[float] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    renewal_date: Optional[date] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class TimingSource(TimestampMixin, table=True):
    __tablename__ = "timing_sources"
    id: Optional[int] = Field(default=None, primary_key=True)
    source_name: str = Field(index=True, max_length=160)
    source_type: str = Field(index=True, max_length=80)
    substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    device_id: Optional[int] = Field(default=None, foreign_key="devices.id")
    accuracy_class: Optional[str] = None
    primary_or_backup: Optional[str] = None
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class ProtectionService(TimestampMixin, table=True):
    __tablename__ = "protection_services"
    id: Optional[int] = Field(default=None, primary_key=True)
    service_name: str = Field(index=True, max_length=160)
    scheme_type: str = Field(index=True, max_length=80)
    relay_a_device_id: Optional[int] = Field(default=None, foreign_key="devices.id")
    relay_b_device_id: Optional[int] = Field(default=None, foreign_key="devices.id")
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id")
    max_latency_ms: Optional[float] = None
    path_diversity_required: bool = True
    status: str = Field(default="active", index=True)
    notes: Optional[str] = None


class QRCode(SQLModel, table=True):
    __tablename__ = "qr_codes"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: str = Field(index=True, max_length=160)
    permanent_url: str
    qr_image_url: Optional[str] = None
    label_text: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class Attachment(SQLModel, table=True):
    __tablename__ = "attachments"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: str = Field(index=True, max_length=160)
    filename: str
    file_url: str
    attachment_type: str = Field(index=True, max_length=80)
    uploaded_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    uploaded_at: datetime = Field(default_factory=utc_now)
    notes: Optional[str] = None


class MaintenanceRecord(TimestampMixin, table=True):
    __tablename__ = "maintenance_records"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: str = Field(index=True, max_length=160)
    maintenance_date: date
    technician: Optional[str] = None
    work_type: Optional[str] = None
    notes: Optional[str] = None
    next_due_date: Optional[date] = None


class WorkOrder(TimestampMixin, table=True):
    __tablename__ = "work_orders"
    id: Optional[int] = Field(default=None, primary_key=True)
    work_order_number: str = Field(index=True, unique=True, max_length=80)
    title: str = Field(index=True, max_length=255)
    description: Optional[str] = None
    work_type: str = Field(index=True, max_length=80)
    priority: str = Field(default="normal", index=True)
    status: str = Field(default="draft", index=True)
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    assigned_engineer_id: Optional[int] = Field(default=None, foreign_key="users.id")
    assigned_field_tech_id: Optional[int] = Field(default=None, foreign_key="users.id")
    substation_id: Optional[int] = Field(default=None, foreign_key="substations.id")
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id")
    device_id: Optional[int] = Field(default=None, foreign_key="devices.id")
    fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id")
    provider_id: Optional[int] = Field(default=None, foreign_key="providers.id")
    planned_start: Optional[datetime] = None
    planned_finish: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_finish: Optional[datetime] = None
    outage_required: bool = False
    switching_required: bool = False
    protection_impact: Optional[str] = None
    customer_impact: Optional[str] = None
    closeout_summary: Optional[str] = None


class WorkOrderTask(TimestampMixin, table=True):
    __tablename__ = "work_order_tasks"
    id: Optional[int] = Field(default=None, primary_key=True)
    work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)
    task_number: int
    task_title: str = Field(max_length=255)
    task_description: Optional[str] = None
    assigned_to_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    fiber_assignment_id: Optional[int] = Field(default=None, foreign_key="fiber_assignments.id")
    fiber_strand_id: Optional[int] = Field(default=None, foreign_key="fiber_strands.id")
    fiber_splice_id: Optional[int] = Field(default=None, foreign_key="fiber_splices.id")
    patch_panel_port_id: Optional[int] = Field(default=None, foreign_key="patch_panel_ports.id")
    test_result: Optional[str] = None
    photo_required: bool = False
    test_uploaded: bool = False
    status: str = Field(default="open", index=True)
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class WorkOrderMaterial(TimestampMixin, table=True):
    __tablename__ = "work_order_materials"
    id: Optional[int] = Field(default=None, primary_key=True)
    work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)
    material_name: str = Field(max_length=255)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    quantity: float = 1
    unit: Optional[str] = None
    status: str = Field(default="needed", index=True)
    notes: Optional[str] = None


class WorkOrderUpdate(TimestampMixin, table=True):
    __tablename__ = "work_order_updates"
    id: Optional[int] = Field(default=None, primary_key=True)
    work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    update_type: str = Field(index=True, max_length=80)
    update_text: str


class WorkOrderAttachment(SQLModel, table=True):
    __tablename__ = "work_order_attachments"
    id: Optional[int] = Field(default=None, primary_key=True)
    work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)
    uploaded_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    filename: str
    file_url: str
    attachment_type: str = Field(index=True, max_length=80)
    uploaded_at: datetime = Field(default_factory=utc_now)
    notes: Optional[str] = None


class OperationalSnapshot(SQLModel, table=True):
    __tablename__ = "operational_snapshots"
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_time: datetime = Field(default_factory=utc_now, index=True)
    source_system: str = Field(default="mock_operational_network_api", index=True, max_length=120)
    api_version: Optional[str] = Field(default=None, max_length=80)
    status: str = Field(default="complete", index=True, max_length=80)
    device_count: int = 0
    circuit_count: int = 0
    alarm_count: int = 0
    raw_summary_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class OperationalDeviceState(SQLModel, table=True):
    __tablename__ = "operational_device_states"
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_id: Optional[int] = Field(default=None, foreign_key="operational_snapshots.id", index=True)
    external_device_id: str = Field(index=True, max_length=160)
    device_name: str = Field(index=True, max_length=160)
    device_type: Optional[str] = Field(default=None, index=True, max_length=80)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    management_ip: Optional[str] = None
    substation_code: Optional[str] = Field(default=None, index=True, max_length=40)
    rack_name: Optional[str] = None
    operational_status: Optional[str] = Field(default=None, index=True, max_length=80)
    alarm_status: Optional[str] = Field(default=None, index=True, max_length=80)
    timing_status: Optional[str] = Field(default=None, index=True, max_length=80)
    last_seen: Optional[datetime] = None
    raw_payload_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    matched_device_id: Optional[int] = Field(default=None, foreign_key="devices.id", index=True)
    match_status: str = Field(default="unmatched_actual_only", index=True, max_length=80)
    created_at: datetime = Field(default_factory=utc_now)


class OperationalPortState(SQLModel, table=True):
    __tablename__ = "operational_port_states"
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_id: Optional[int] = Field(default=None, foreign_key="operational_snapshots.id", index=True)
    external_device_id: str = Field(index=True, max_length=160)
    external_port_id: str = Field(index=True, max_length=160)
    port_name: str = Field(index=True, max_length=120)
    port_type: Optional[str] = Field(default=None, index=True, max_length=80)
    port_speed: Optional[str] = None
    admin_status: Optional[str] = Field(default=None, index=True, max_length=80)
    operational_status: Optional[str] = Field(default=None, index=True, max_length=80)
    connected_to: Optional[str] = None
    assigned_service: Optional[str] = None
    assigned_circuit: Optional[str] = Field(default=None, index=True, max_length=160)
    raw_payload_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    matched_device_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id", index=True)
    match_status: str = Field(default="unmatched_actual_only", index=True, max_length=80)
    created_at: datetime = Field(default_factory=utc_now)


class OperationalCircuitState(SQLModel, table=True):
    __tablename__ = "operational_circuit_states"
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_id: Optional[int] = Field(default=None, foreign_key="operational_snapshots.id", index=True)
    external_circuit_id: str = Field(index=True, max_length=160)
    circuit_name: str = Field(index=True, max_length=255)
    service_type: Optional[str] = Field(default=None, index=True, max_length=80)
    transport_type: Optional[str] = Field(default=None, index=True, max_length=120)
    a_end_device: Optional[str] = None
    z_end_device: Optional[str] = None
    a_end_port: Optional[str] = None
    z_end_port: Optional[str] = None
    operational_status: Optional[str] = Field(default=None, index=True, max_length=80)
    measured_latency_ms: Optional[float] = None
    alarm_status: Optional[str] = Field(default=None, index=True, max_length=80)
    raw_payload_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    matched_circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id", index=True)
    match_status: str = Field(default="unmatched_actual_only", index=True, max_length=80)
    created_at: datetime = Field(default_factory=utc_now)


class ProposedChange(TimestampMixin, table=True):
    __tablename__ = "proposed_changes"
    id: Optional[int] = Field(default=None, primary_key=True)
    change_number: str = Field(index=True, unique=True, max_length=80)
    title: str = Field(index=True, max_length=255)
    description: Optional[str] = None
    change_type: str = Field(index=True, max_length=80)
    target_entity_type: Optional[str] = Field(default=None, index=True, max_length=80)
    target_entity_id: Optional[int] = Field(default=None, index=True)
    source_state: str = Field(default="planned", index=True, max_length=80)
    proposed_state_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    reason: Optional[str] = None
    risk_level: str = Field(default="normal", index=True, max_length=80)
    engineering_status: str = Field(default="draft", index=True, max_length=80)
    approval_status: str = Field(default="not_submitted", index=True, max_length=80)
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    assigned_engineer_id: Optional[int] = Field(default=None, foreign_key="users.id")
    approved_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    approved_at: Optional[datetime] = None
    related_work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)


class ProposedChangeDiff(SQLModel, table=True):
    __tablename__ = "proposed_change_diffs"
    id: Optional[int] = Field(default=None, primary_key=True)
    proposed_change_id: Optional[int] = Field(default=None, foreign_key="proposed_changes.id", index=True)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: Optional[int] = Field(default=None, index=True)
    field_name: str = Field(index=True, max_length=160)
    actual_value: Optional[str] = None
    planned_value: Optional[str] = None
    proposed_value: Optional[str] = None
    diff_type: str = Field(index=True, max_length=80)
    severity: str = Field(default="info", index=True, max_length=80)
    notes: Optional[str] = None


class IconEngineeringProfile(TimestampMixin, table=True):
    __tablename__ = "icon_engineering_profiles"
    id: Optional[int] = Field(default=None, primary_key=True)
    icon_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id", index=True)
    profile_name: str = Field(index=True, max_length=160)
    profile_revision: Optional[str] = Field(default=None, max_length=80)
    manual_reference: Optional[str] = None
    engineering_standard_reference: Optional[str] = None
    transport_mode: Optional[str] = Field(default=None, index=True, max_length=80)
    topology_type: Optional[str] = Field(default=None, index=True, max_length=80)
    timing_mode: Optional[str] = Field(default=None, index=True, max_length=80)
    redundancy_mode: Optional[str] = Field(default=None, index=True, max_length=80)
    security_profile: Optional[str] = Field(default=None, index=True, max_length=80)
    commissioning_status: str = Field(default="not_started", index=True, max_length=80)
    notes: Optional[str] = None


class IconServiceTemplate(TimestampMixin, table=True):
    __tablename__ = "icon_service_templates"
    id: Optional[int] = Field(default=None, primary_key=True)
    template_name: str = Field(index=True, unique=True, max_length=180)
    service_type: str = Field(index=True, max_length=80)
    description: Optional[str] = None
    manual_reference: Optional[str] = None
    required_parameters_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    default_parameters_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    validation_rules_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    commissioning_steps_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    test_requirements_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")


class IconProposedService(SQLModel, table=True):
    __tablename__ = "icon_proposed_services"
    id: Optional[int] = Field(default=None, primary_key=True)
    proposed_change_id: Optional[int] = Field(default=None, foreign_key="proposed_changes.id", index=True)
    icon_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id", index=True)
    service_template_id: Optional[int] = Field(default=None, foreign_key="icon_service_templates.id")
    service_name: str = Field(index=True, max_length=180)
    service_type: str = Field(index=True, max_length=80)
    a_end_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id")
    z_end_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id")
    a_end_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id")
    z_end_port_id: Optional[int] = Field(default=None, foreign_key="device_ports.id")
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id", index=True)
    protection_service_id: Optional[int] = Field(default=None, foreign_key="protection_services.id")
    proposed_parameters_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    validation_status: str = Field(default="not_validated", index=True, max_length=80)
    commissioning_status: str = Field(default="not_started", index=True, max_length=80)
    notes: Optional[str] = None


class CommissioningChecklist(SQLModel, table=True):
    __tablename__ = "commissioning_checklists"
    id: Optional[int] = Field(default=None, primary_key=True)
    checklist_name: str = Field(index=True, max_length=180)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: Optional[int] = Field(default=None, index=True)
    checklist_type: str = Field(index=True, max_length=80)
    manual_reference: Optional[str] = None
    status: str = Field(default="not_started", index=True, max_length=80)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    assigned_to_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class CommissioningChecklistItem(SQLModel, table=True):
    __tablename__ = "commissioning_checklist_items"
    id: Optional[int] = Field(default=None, primary_key=True)
    checklist_id: Optional[int] = Field(default=None, foreign_key="commissioning_checklists.id", index=True)
    item_number: int = Field(index=True)
    category: Optional[str] = Field(default=None, index=True, max_length=80)
    task_text: str
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    status: str = Field(default="not_started", index=True, max_length=80)
    completed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    completed_at: Optional[datetime] = None
    evidence_attachment_id: Optional[int] = Field(default=None, foreign_key="attachments.id")
    notes: Optional[str] = None


class PublicDataSource(SQLModel, table=True):
    __tablename__ = "public_data_sources"
    id: Optional[int] = Field(default=None, primary_key=True)
    source_name: str = Field(index=True, max_length=180)
    source_type: str = Field(index=True, max_length=80)
    source_url: Optional[str] = None
    license_name: Optional[str] = None
    license_url: Optional[str] = None
    attribution_text: Optional[str] = None
    imported_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    import_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class PublicDataImportBatch(SQLModel, table=True):
    __tablename__ = "public_data_import_batches"
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="public_data_sources.id", index=True)
    import_batch_name: str = Field(index=True, max_length=180)
    import_time: datetime = Field(default_factory=utc_now, index=True)
    record_count: int = 0
    imported_substation_count: int = 0
    imported_line_count: int = 0
    imported_structure_count: int = 0
    status: str = Field(default="imported", index=True, max_length=80)
    validation_summary_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    notes: Optional[str] = None


class RegionalUtilityOwner(TimestampMixin, table=True):
    __tablename__ = "regional_utility_owners"
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_name: str = Field(index=True, unique=True, max_length=180)
    owner_type: str = Field(default="unknown", index=True, max_length=80)
    iso_region: str = Field(default="ISO-NE", index=True, max_length=80)
    state: Optional[str] = Field(default=None, index=True, max_length=40)
    service_area_description: Optional[str] = None
    notes: Optional[str] = None


class RegionalVoltageClass(SQLModel, table=True):
    __tablename__ = "regional_voltage_classes"
    id: Optional[int] = Field(default=None, primary_key=True)
    voltage_class: str = Field(index=True, unique=True, max_length=80)
    min_voltage_kv: Optional[float] = None
    max_voltage_kv: Optional[float] = None
    description: Optional[str] = None


class RegionalSubstation(TimestampMixin, table=True):
    __tablename__ = "regional_substations"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_source_id: Optional[int] = Field(default=None, foreign_key="public_data_sources.id", index=True)
    import_batch_id: Optional[int] = Field(default=None, foreign_key="public_data_import_batches.id", index=True)
    external_source_id: Optional[str] = Field(default=None, index=True, max_length=180)
    substation_name: str = Field(index=True, max_length=180)
    normalized_name: str = Field(index=True, max_length=180)
    owner_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    state: str = Field(index=True, max_length=40)
    county: Optional[str] = Field(default=None, index=True, max_length=120)
    city: Optional[str] = Field(default=None, index=True, max_length=120)
    voltage_class: Optional[str] = Field(default=None, index=True, max_length=80)
    min_voltage_kv: Optional[float] = None
    max_voltage_kv: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geometry_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    confidence_score: float = Field(default=0.75, index=True)
    source_confidence: str = Field(default="public_reference", index=True, max_length=80)
    is_public_reference: bool = Field(default=True, index=True)
    linked_internal_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id", index=True)
    notes: Optional[str] = None


class RegionalTransmissionLine(TimestampMixin, table=True):
    __tablename__ = "regional_transmission_lines"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_source_id: Optional[int] = Field(default=None, foreign_key="public_data_sources.id", index=True)
    import_batch_id: Optional[int] = Field(default=None, foreign_key="public_data_import_batches.id", index=True)
    external_source_id: Optional[str] = Field(default=None, index=True, max_length=180)
    line_name: str = Field(index=True, max_length=180)
    normalized_line_name: str = Field(index=True, max_length=180)
    owner_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    state: str = Field(index=True, max_length=40)
    voltage_kv: Optional[float] = Field(default=None, index=True)
    voltage_class: Optional[str] = Field(default=None, index=True, max_length=80)
    from_regional_substation_id: Optional[int] = Field(default=None, foreign_key="regional_substations.id")
    to_regional_substation_id: Optional[int] = Field(default=None, foreign_key="regional_substations.id")
    geometry_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    route_length_miles: Optional[float] = None
    status: str = Field(default="public_reference", index=True, max_length=80)
    confidence_score: float = Field(default=0.75, index=True)
    source_confidence: str = Field(default="public_reference", index=True, max_length=80)
    is_public_reference: bool = Field(default=True, index=True)
    linked_internal_transmission_line_id: Optional[int] = Field(default=None, foreign_key="transmission_lines.id", index=True)
    notes: Optional[str] = None


class RegionalStructure(SQLModel, table=True):
    __tablename__ = "regional_structures"
    id: Optional[int] = Field(default=None, primary_key=True)
    regional_transmission_line_id: Optional[int] = Field(default=None, foreign_key="regional_transmission_lines.id", index=True)
    structure_number: Optional[str] = Field(default=None, index=True, max_length=120)
    structure_type: Optional[str] = Field(default=None, index=True, max_length=80)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geometry_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    source_confidence: str = Field(default="public_reference", index=True, max_length=80)
    notes: Optional[str] = None


class RegionalAccessAgreement(TimestampMixin, table=True):
    __tablename__ = "regional_access_agreements"
    id: Optional[int] = Field(default=None, primary_key=True)
    agreement_name: str = Field(index=True, max_length=180)
    owning_utility_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    accessing_utility_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    access_type: str = Field(index=True, max_length=80)
    asset_scope: str = Field(index=True, max_length=180)
    effective_date: Optional[date] = None
    expiration_date: Optional[date] = None
    status: str = Field(default="active", index=True, max_length=80)
    notes: Optional[str] = None


class RegionalAssetPermission(SQLModel, table=True):
    __tablename__ = "regional_asset_permissions"
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: Optional[int] = Field(default=None, index=True)
    utility_owner_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    role_id: Optional[str] = Field(default=None, index=True, max_length=80)
    access_level: str = Field(default="view", index=True, max_length=80)
    granted_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    granted_at: datetime = Field(default_factory=utc_now)
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None


class AssumedOPGWRoute(TimestampMixin, table=True):
    __tablename__ = "assumed_opgw_routes"
    id: Optional[int] = Field(default=None, primary_key=True)
    regional_transmission_line_id: Optional[int] = Field(default=None, foreign_key="regional_transmission_lines.id", index=True)
    linked_fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id", index=True)
    assumption_name: str = Field(index=True, max_length=180)
    assumption_basis: str = Field(default="planning_assumption_from_public_reference", max_length=255)
    fiber_count_assumption: Optional[int] = None
    shield_wire_count_assumption: Optional[int] = None
    assumed_install_type: Optional[str] = Field(default=None, index=True, max_length=80)
    confidence_level: str = Field(default="low", index=True, max_length=80)
    status: str = Field(default="draft_assumption", index=True, max_length=80)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_at: Optional[datetime] = None
    notes: Optional[str] = None


class RegionalTelecomOverlay(TimestampMixin, table=True):
    __tablename__ = "regional_telecom_overlays"
    id: Optional[int] = Field(default=None, primary_key=True)
    overlay_name: str = Field(index=True, max_length=180)
    regional_substation_id: Optional[int] = Field(default=None, foreign_key="regional_substations.id", index=True)
    regional_transmission_line_id: Optional[int] = Field(default=None, foreign_key="regional_transmission_lines.id", index=True)
    internal_substation_id: Optional[int] = Field(default=None, foreign_key="substations.id", index=True)
    internal_transmission_line_id: Optional[int] = Field(default=None, foreign_key="transmission_lines.id", index=True)
    fiber_cable_id: Optional[int] = Field(default=None, foreign_key="fiber_cables.id", index=True)
    icon_node_id: Optional[int] = Field(default=None, foreign_key="icon_nodes.id", index=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuits.id", index=True)
    overlay_type: str = Field(index=True, max_length=80)
    confidence_level: str = Field(default="low", index=True, max_length=80)
    status: str = Field(default="synthetic_planning", index=True, max_length=80)
    notes: Optional[str] = None


class RegionalIconRing(TimestampMixin, table=True):
    __tablename__ = "regional_icon_rings"
    id: Optional[int] = Field(default=None, primary_key=True)
    ring_name: str = Field(index=True, unique=True, max_length=180)
    nodes_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    primary_fiber_path: Optional[str] = None
    backup_fiber_path: Optional[str] = None
    assumed_opgw_route_ids_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    leased_service_backup_option: Optional[str] = None
    timing_source: Optional[str] = None
    circuit_count: int = 0
    status: str = Field(default="synthetic_planning", index=True, max_length=80)
    owner_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    access_controls_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    notes: Optional[str] = None


class RegionalSyntheticCircuit(TimestampMixin, table=True):
    __tablename__ = "regional_synthetic_circuits"
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: str = Field(index=True, unique=True, max_length=180)
    service_type: str = Field(index=True, max_length=80)
    ownership_type: str = Field(index=True, max_length=80)
    a_end_site: str = Field(index=True, max_length=180)
    z_end_site: str = Field(index=True, max_length=180)
    a_end_icon_node: Optional[str] = Field(default=None, index=True, max_length=180)
    z_end_icon_node: Optional[str] = Field(default=None, index=True, max_length=180)
    a_end_port: Optional[str] = None
    z_end_port: Optional[str] = None
    primary_path: Optional[str] = None
    backup_path: Optional[str] = None
    assumed_or_verified_path: str = Field(default="synthetic_assumed", index=True, max_length=80)
    latency_requirement_ms: Optional[float] = None
    measured_latency_ms: Optional[float] = None
    protection_class: Optional[str] = Field(default=None, index=True, max_length=80)
    criticality: str = Field(default="normal", index=True, max_length=80)
    owner_id: Optional[int] = Field(default=None, foreign_key="regional_utility_owners.id", index=True)
    access_group: Optional[str] = Field(default=None, index=True, max_length=120)
    status: str = Field(default="synthetic_planning", index=True, max_length=80)
    proposed_change_id: Optional[int] = Field(default=None, foreign_key="proposed_changes.id", index=True)
    work_order_id: Optional[int] = Field(default=None, foreign_key="work_orders.id", index=True)
    ring_id: Optional[int] = Field(default=None, foreign_key="regional_icon_rings.id", index=True)
    notes: Optional[str] = None


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    action: str = Field(index=True, max_length=80)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: Optional[str] = Field(default=None, index=True)
    timestamp: datetime = Field(default_factory=utc_now, index=True)
    old_value_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    new_value_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))


class SQLReport(TimestampMixin, table=True):
    __tablename__ = "sql_reports"
    id: Optional[int] = Field(default=None, primary_key=True)
    report_name: str = Field(index=True, unique=True, max_length=180)
    description: Optional[str] = None
    sql_text: str
    allowed_roles: str = "admin,sql_analyst,engineer"
    is_active: bool = True
