REPORT_NAMES = [
    "ICON ports by OPGW cable",
    "Available dark fiber strands",
    "Devices affected by fiber cable outage",
    "Circuits sharing same physical path",
    "Protection circuits without diverse path",
    "Substations with missing fiber mapping",
    "Distribution devices by feeder fiber",
    "Splice closures carrying critical circuits",
    "Private fiber circuits",
    "Leased services by provider",
    "Leased services nearing renewal",
    "Monthly leased service cost by provider",
    "Work orders assigned to field techs",
    "Work orders waiting on provider",
    "Work orders waiting on material",
    "Circuits pending installation",
    "Circuits pending testing",
    "Circuits without backup path",
    "Device ports missing connectivity",
    "Fiber strands assigned to retired circuits",
]

SAVED_REPORTS: list[dict[str, str]] = [
    {"report_name": name, "description": name, "sql_text": sql}
    for name, sql in [
        (REPORT_NAMES[0], "select c.circuit_id, e.element_label from circuits c join circuit_paths p on p.circuit_id = c.id join circuit_path_elements e on e.circuit_path_id = p.id where e.element_type = 'fiber_cable' and e.element_label like 'OPGW%'"),
        (REPORT_NAMES[1], "select fc.cable_id, fs.strand_number, fs.color, fs.status from fiber_strands fs join fiber_cables fc on fc.id = fs.fiber_cable_id where fs.status in ('available', 'dark')"),
        (REPORT_NAMES[2], "select distinct c.circuit_id, c.criticality, e.element_label from circuits c join circuit_paths p on p.circuit_id = c.id join circuit_path_elements e on e.circuit_path_id = p.id where e.element_type = 'fiber_cable'"),
        (REPORT_NAMES[3], "select e.element_type, e.element_label, count(distinct p.circuit_id) as circuit_count from circuit_path_elements e join circuit_paths p on p.id = e.circuit_path_id group by e.element_type, e.element_label having count(distinct p.circuit_id) > 1"),
        (REPORT_NAMES[4], "select c.circuit_id, c.service_type from circuits c where c.criticality = 'critical' and not exists (select 1 from circuit_paths p where p.circuit_id = c.id and p.path_role in ('backup', 'diverse_backup'))"),
        (REPORT_NAMES[5], "select s.substation_code, s.name from substations s where not exists (select 1 from fiber_cables fc where fc.a_end_substation_id = s.id or fc.z_end_substation_id = s.id)"),
        (REPORT_NAMES[6], "select df.feeder_name, fc.cable_id from distribution_feeders df join fiber_cables fc on fc.distribution_feeder_id = df.id"),
        (REPORT_NAMES[7], "select distinct c.circuit_id, e.element_label from circuits c join circuit_paths p on p.circuit_id = c.id join circuit_path_elements e on e.circuit_path_id = p.id where c.criticality = 'critical' and e.element_type = 'splice_closure'"),
        (REPORT_NAMES[8], "select circuit_id, circuit_name, service_type, status from circuits where ownership_type = 'private_fiber'"),
        (REPORT_NAMES[9], "select p.provider_name, ls.provider_circuit_id, ls.service_type, ls.monthly_cost from leased_services ls join providers p on p.id = ls.provider_id"),
        (REPORT_NAMES[10], "select provider_circuit_id, service_type, contract_end, monthly_cost from leased_services where contract_end <= date('now', '+180 days')"),
        (REPORT_NAMES[11], "select p.provider_name, sum(ls.monthly_cost) as monthly_cost from leased_services ls join providers p on p.id = ls.provider_id group by p.provider_name"),
        (REPORT_NAMES[12], "select work_order_number, title, priority, status from work_orders where assigned_field_tech_id is not null"),
        (REPORT_NAMES[13], "select work_order_number, title, provider_id from work_orders where status = 'waiting_on_provider'"),
        (REPORT_NAMES[14], "select work_order_number, title from work_orders where status = 'waiting_on_material'"),
        (REPORT_NAMES[15], "select circuit_id, circuit_name, status from circuits where status in ('ordered', 'installing')"),
        (REPORT_NAMES[16], "select circuit_id, circuit_name, status from circuits where status = 'testing'"),
        (REPORT_NAMES[17], "select c.circuit_id, c.criticality from circuits c where not exists (select 1 from circuit_paths p where p.circuit_id = c.id and p.path_role in ('backup', 'diverse_backup'))"),
        (REPORT_NAMES[18], "select dp.id, d.device_name, dp.port_name from device_ports dp join devices d on d.id = dp.device_id where dp.port_type = 'fiber' and dp.connected_fiber_strand_id is null"),
        ("Legacy retired circuit strand check", "select fc.cable_id, fs.strand_number, c.circuit_id from fiber_strands fs join fiber_cables fc on fc.id = fs.fiber_cable_id join circuits c on c.id = fs.assigned_circuit_id where c.status = 'retired'"),
        ("Available strands by fiber cable", "select fc.cable_id, fs.strand_number, fs.tube_number, fs.strand_color, fs.buffer_tube_color, fs.status from fiber_strands fs join fiber_cables fc on fc.id = fs.fiber_cable_id where fs.status in ('available', 'dark', 'spare') order by fc.cable_id, fs.strand_number"),
        ("Assigned strands by circuit", "select c.circuit_id, fc.cable_id, fs.strand_number, fa.assignment_type, fa.assignment_status from fiber_assignments fa join circuits c on c.id = fa.circuit_id join fiber_strands fs on fs.id = fa.fiber_strand_id join fiber_cables fc on fc.id = fs.fiber_cable_id order by c.circuit_id, fc.cable_id, fs.strand_number"),
        ("Device ports without fiber assignments", "select d.device_name, dp.port_name, dp.port_type, dp.status from device_ports dp join devices d on d.id = dp.device_id where dp.port_type in ('fiber', 'C37.94') and not exists (select 1 from fiber_assignments fa where fa.device_port_id = dp.id)"),
        ("Fiber strands assigned to retired circuits", "select fc.cable_id, fs.strand_number, c.circuit_id, c.status from fiber_strands fs join fiber_cables fc on fc.id = fs.fiber_cable_id join circuits c on c.id = fs.assigned_circuit_id where c.status = 'retired'"),
        ("Circuits using faulted strands", "select c.circuit_id, fc.cable_id, fs.strand_number, fs.status from fiber_assignments fa join circuits c on c.id = fa.circuit_id join fiber_strands fs on fs.id = fa.fiber_strand_id join fiber_cables fc on fc.id = fs.fiber_cable_id where fs.status in ('faulted', 'damaged')"),
        ("Splice closures carrying critical protection circuits", "select distinct sc.closure_id, c.circuit_id, c.service_type, c.criticality from splice_closures sc join circuit_path_elements e on e.element_type = 'splice_closure' and e.element_id = sc.id join circuit_paths p on p.id = e.circuit_path_id join circuits c on c.id = p.circuit_id where c.criticality = 'critical' or c.service_type in ('87L', 'DTT')"),
        ("Primary and backup paths using the same fiber cable", "select c.circuit_id, e.element_id as fiber_cable_id, count(distinct p.path_role) as path_roles from circuits c join circuit_paths p on p.circuit_id = c.id join circuit_path_elements e on e.circuit_path_id = p.id where e.element_type = 'fiber_cable' and p.path_role in ('primary', 'backup', 'diverse_backup') group by c.circuit_id, e.element_id having count(distinct p.path_role) > 1"),
        ("Primary and backup paths using the same splice closure", "select c.circuit_id, e.element_id as splice_closure_id, count(distinct p.path_role) as path_roles from circuits c join circuit_paths p on p.circuit_id = c.id join circuit_path_elements e on e.circuit_path_id = p.id where e.element_type = 'splice_closure' and p.path_role in ('primary', 'backup', 'diverse_backup') group by c.circuit_id, e.element_id having count(distinct p.path_role) > 1"),
        ("Patch panel ports without connected device ports", "select pp.panel_id, ppp.port_number, ppp.port_label, ppp.status from patch_panel_ports ppp join patch_panels pp on pp.id = ppp.patch_panel_id where ppp.connected_fiber_strand_id is not null and ppp.connected_device_port_id is null"),
        ("Work orders with incomplete fiber assignments", "select wo.work_order_number, wo.title, fa.assignment_id, fa.assignment_status from work_orders wo left join fiber_assignments fa on fa.work_order_id = wo.id where wo.work_type in ('ICON_install', 'distribution_device_install', 'OTDR_test') and (fa.id is null or fa.assignment_status not in ('tested', 'active', 'installed'))"),
    ]
]

SAVED_REPORTS.extend(
    [
        {
            "report_name": "DeviceOps - Devices in operational API missing from planning database",
            "description": "Actual devices from the latest operational snapshot that have no planning database match.",
            "sql_text": "select device_name, device_type, substation_code, operational_status, alarm_status from operational_device_states where snapshot_id = (select max(id) from operational_snapshots) and match_status = 'unmatched_actual_only'",
        },
        {
            "report_name": "DeviceOps - Devices in planning database missing from operational API",
            "description": "Planning devices that were not found in the latest operational API snapshot.",
            "sql_text": "select device_name, device_type, manufacturer, model, management_ip from operational_device_states where snapshot_id = (select max(id) from operational_snapshots) and match_status = 'unmatched_planned_only'",
        },
        {
            "report_name": "DeviceOps - SEL ICON firmware mismatch report",
            "description": "SEL ICON devices whose actual firmware differs from the planned device or ICON node record.",
            "sql_text": "select ods.device_name, ods.firmware_version as actual_firmware, coalesce(d.firmware_version, n.firmware_version) as planned_firmware from operational_device_states ods left join devices d on d.id = ods.matched_device_id left join icon_nodes n on n.device_id = d.id where ods.snapshot_id = (select max(id) from operational_snapshots) and ods.device_type = 'SEL_ICON' and coalesce(d.firmware_version, n.firmware_version) is not null and ods.firmware_version <> coalesce(d.firmware_version, n.firmware_version)",
        },
        {
            "report_name": "DeviceOps - SEL ICON nodes with timing alarms",
            "description": "Actual SEL ICON nodes with non-normal timing status.",
            "sql_text": "select device_name, substation_code, timing_status, alarm_status from operational_device_states where snapshot_id = (select max(id) from operational_snapshots) and device_type = 'SEL_ICON' and timing_status not in ('normal', 'not_applicable')",
        },
        {
            "report_name": "DeviceOps - SEL ICON ports available for service",
            "description": "Actual ICON ports with no assigned operational circuit.",
            "sql_text": "select ods.device_name, ops.port_name, ops.port_type, ops.port_speed, ops.operational_status from operational_port_states ops join operational_device_states ods on ods.snapshot_id = ops.snapshot_id and ods.external_device_id = ops.external_device_id where ops.snapshot_id = (select max(id) from operational_snapshots) and ods.device_type = 'SEL_ICON' and ops.assigned_circuit is null",
        },
        {
            "report_name": "DeviceOps - SEL ICON ports assigned to active circuits",
            "description": "Actual ICON ports carrying operational circuits.",
            "sql_text": "select ods.device_name, ops.port_name, ops.port_type, ops.assigned_service, ops.assigned_circuit from operational_port_states ops join operational_device_states ods on ods.snapshot_id = ops.snapshot_id and ods.external_device_id = ops.external_device_id where ops.snapshot_id = (select max(id) from operational_snapshots) and ods.device_type = 'SEL_ICON' and ops.assigned_circuit is not null",
        },
        {
            "report_name": "DeviceOps - Proposed changes awaiting approval",
            "description": "Staged engineering changes waiting for approval.",
            "sql_text": "select change_number, title, change_type, risk_level, engineering_status, approval_status from proposed_changes where approval_status = 'pending_approval'",
        },
        {
            "report_name": "DeviceOps - Proposed changes with conflicts",
            "description": "Proposed changes with warning or critical diff rows.",
            "sql_text": "select pc.change_number, pc.title, d.field_name, d.diff_type, d.severity, d.notes from proposed_changes pc join proposed_change_diffs d on d.proposed_change_id = pc.id where d.severity in ('warning', 'critical')",
        },
        {
            "report_name": "DeviceOps - Proposed ICON services not yet converted to work orders",
            "description": "Proposed ICON services without generated work orders.",
            "sql_text": "select pc.change_number, ips.service_name, ips.service_type, ips.validation_status, ips.commissioning_status from icon_proposed_services ips join proposed_changes pc on pc.id = ips.proposed_change_id where pc.related_work_order_id is null",
        },
        {
            "report_name": "DeviceOps - Work orders generated from proposed changes",
            "description": "Work orders linked to DeviceOps proposed changes.",
            "sql_text": "select pc.change_number, pc.title, wo.work_order_number, wo.status, wo.priority from proposed_changes pc join work_orders wo on wo.id = pc.related_work_order_id",
        },
        {
            "report_name": "DeviceOps - Commissioning checklists incomplete",
            "description": "Commissioning checklists not yet completed or commissioned.",
            "sql_text": "select checklist_name, entity_type, entity_id, checklist_type, status from commissioning_checklists where status not in ('complete', 'completed', 'commissioned')",
        },
        {
            "report_name": "DeviceOps - ICON services with missing fiber assignments",
            "description": "Proposed ICON services whose parameter JSON does not include fiber strand assignments.",
            "sql_text": "select ips.service_name, ips.service_type, pc.change_number from icon_proposed_services ips join proposed_changes pc on pc.id = ips.proposed_change_id where json_extract(ips.proposed_parameters_json, '$.fiber_strand_ids') is null",
        },
        {
            "report_name": "DeviceOps - Protection circuits with missing latency test evidence",
            "description": "Protection checklists without latency evidence attachments.",
            "sql_text": "select cc.checklist_name, cci.item_number, cci.task_text, cci.status from commissioning_checklists cc join commissioning_checklist_items cci on cci.checklist_id = cc.id where cc.checklist_type in ('C37_94_service', 'DTT_service', '87L_service') and cci.task_text like '%latency%' and cci.evidence_attachment_id is null",
        },
        {
            "report_name": "DeviceOps - C37.94 services missing commissioning evidence",
            "description": "C37.94 commissioning checklist items without evidence attachments.",
            "sql_text": "select cc.checklist_name, cci.task_text, cci.status from commissioning_checklists cc join commissioning_checklist_items cci on cci.checklist_id = cc.id where cc.checklist_type = 'C37_94_service' and cci.evidence_attachment_id is null",
        },
        {
            "report_name": "DeviceOps - VSN services proposed but not installed",
            "description": "VSN proposed services that are not yet commissioned.",
            "sql_text": "select ips.service_name, pc.change_number, ips.commissioning_status from icon_proposed_services ips join proposed_changes pc on pc.id = ips.proposed_change_id where ips.service_type = 'VSN' and ips.commissioning_status not in ('commissioned', 'passed_test')",
        },
        {
            "report_name": "DeviceOps - Leased-service migrations proposed but not approved",
            "description": "Leased service migration changes still awaiting approval.",
            "sql_text": "select change_number, title, engineering_status, approval_status from proposed_changes where change_type = 'migrate_leased_service' and approval_status <> 'approved'",
        },
        {
            "report_name": "DeviceOps - Actual circuits not documented in planning database",
            "description": "Operational circuits with no matching planning circuit.",
            "sql_text": "select external_circuit_id, circuit_name, service_type, transport_type, operational_status from operational_circuit_states where snapshot_id = (select max(id) from operational_snapshots) and match_status = 'unmatched_actual_only'",
        },
        {
            "report_name": "DeviceOps - Planned circuits not found in operational API",
            "description": "Planning circuits missing from the latest operational snapshot.",
            "sql_text": "select external_circuit_id, circuit_name, service_type, transport_type, operational_status from operational_circuit_states where snapshot_id = (select max(id) from operational_snapshots) and match_status = 'unmatched_planned_only'",
        },
        {
            "report_name": "DeviceOps - As-built records not reconciled with actual API state",
            "description": "Implemented or converted changes that have not been reconciled after operational refresh.",
            "sql_text": "select change_number, title, engineering_status, approval_status, related_work_order_id from proposed_changes where engineering_status in ('converted_to_work_order', 'implemented')",
        },
        {
            "report_name": "DeviceOps - Device ports with actual/planned/proposed mismatch",
            "description": "Operational port state rows with conflicts or unmatched planning ports.",
            "sql_text": "select ods.device_name, ops.port_name, ops.port_type, ops.assigned_circuit, ops.match_status from operational_port_states ops join operational_device_states ods on ods.snapshot_id = ops.snapshot_id and ods.external_device_id = ops.external_device_id where ops.snapshot_id = (select max(id) from operational_snapshots) and ops.match_status <> 'matched'",
        },
    ]
)

SAVED_REPORTS.extend(
    [
        {"report_name": "RegionalGrid - Imported substations by state", "description": "Regional public-reference substations grouped by ISO-NE state.", "sql_text": "select state, count(*) as substation_count from regional_substations group by state order by state"},
        {"report_name": "RegionalGrid - Imported transmission lines by voltage class", "description": "Regional public-reference lines grouped by voltage class.", "sql_text": "select voltage_class, count(*) as line_count from regional_transmission_lines group by voltage_class order by voltage_class"},
        {"report_name": "RegionalGrid - Public regional records not linked to internal assets", "description": "Public substations and lines still awaiting internal linkage review.", "sql_text": "select 'substation' as record_type, substation_name as name, state from regional_substations where linked_internal_substation_id is null union all select 'transmission_line', line_name, state from regional_transmission_lines where linked_internal_transmission_line_id is null"},
        {"report_name": "RegionalGrid - Assumed OPGW routes by confidence level", "description": "Assumed OPGW planning hypotheses grouped by confidence level.", "sql_text": "select confidence_level, status, count(*) as route_count from assumed_opgw_routes group by confidence_level, status"},
        {"report_name": "RegionalGrid - Circuits using low-confidence assumed OPGW", "description": "Synthetic circuits whose path is low-confidence assumed OPGW.", "sql_text": "select circuit_id, service_type, primary_path, assumed_or_verified_path, criticality from regional_synthetic_circuits where assumed_or_verified_path like '%low_confidence%'"},
        {"report_name": "RegionalGrid - Proposed ICON nodes by state", "description": "Synthetic/assumed SEL ICON overlays grouped by state.", "sql_text": "select rs.state, count(*) as proposed_icon_nodes from regional_telecom_overlays rto join regional_substations rs on rs.id = rto.regional_substation_id where rto.overlay_type in ('assumed_SEL_ICON_node', 'verified_SEL_ICON_node') group by rs.state"},
        {"report_name": "RegionalGrid - SEL ICON circuits by ring", "description": "Synthetic SEL ICON circuits grouped by regional ICON ring.", "sql_text": "select rir.ring_name, count(rsc.id) as circuit_count from regional_icon_rings rir left join regional_synthetic_circuits rsc on rsc.ring_id = rir.id group by rir.ring_name order by rir.ring_name"},
        {"report_name": "RegionalGrid - SEL ICON circuits by service type", "description": "Synthetic SEL ICON circuits grouped by service type.", "sql_text": "select service_type, count(*) as circuit_count from regional_synthetic_circuits group by service_type order by service_type"},
        {"report_name": "RegionalGrid - Circuits crossing utility owner boundaries", "description": "Synthetic circuits with joint or cross-utility ownership markers.", "sql_text": "select circuit_id, service_type, ownership_type, access_group, status from regional_synthetic_circuits where ownership_type like '%joint%' or status = 'pending_host_approval' or access_group = 'Internal planning owner'"},
        {"report_name": "RegionalGrid - Work orders requiring host utility approval", "description": "Regional work orders still requiring host utility approval.", "sql_text": "select work_order_number, title, status, priority from work_orders where status = 'host_approval_required' or work_type = 'regional_cross_utility_approval'"},
        {"report_name": "RegionalGrid - Assets visible to current user by utility owner", "description": "Permission grants by utility owner.", "sql_text": "select ruo.owner_name, rap.access_level, count(*) as permission_count from regional_asset_permissions rap join regional_utility_owners ruo on ruo.id = rap.utility_owner_id group by ruo.owner_name, rap.access_level"},
        {"report_name": "RegionalGrid - Assets blocked by access control", "description": "Synthetic circuits without broad internal owner permissions.", "sql_text": "select circuit_id, service_type, access_group, status from regional_synthetic_circuits where owner_id not in (select utility_owner_id from regional_asset_permissions where access_level in ('admin', 'edit_planning', 'propose_change'))"},
        {"report_name": "RegionalGrid - Leased services used as backup paths", "description": "Synthetic circuits using leased backup options.", "sql_text": "select circuit_id, service_type, backup_path from regional_synthetic_circuits where lower(service_type) like '%leased%' or lower(backup_path) like '%leased%'"},
        {"report_name": "RegionalGrid - Protection circuits using leased backup", "description": "Critical protection-style circuits with leased backup paths.", "sql_text": "select circuit_id, service_type, protection_class, backup_path from regional_synthetic_circuits where criticality = 'critical' and lower(backup_path) like '%leased%'"},
        {"report_name": "RegionalGrid - Transmission lines with assumed OPGW but no verified fiber records", "description": "Assumed OPGW routes that have not been converted to planned/verified fiber records.", "sql_text": "select rtl.line_name, aor.assumption_name, aor.confidence_level, aor.status from assumed_opgw_routes aor join regional_transmission_lines rtl on rtl.id = aor.regional_transmission_line_id where aor.linked_fiber_cable_id is null"},
        {"report_name": "RegionalGrid - Substations with proposed ICON nodes but no verified device installation", "description": "Assumed ICON node overlays not marked as verified installation.", "sql_text": "select rs.substation_name, rto.overlay_name, rto.status from regional_telecom_overlays rto join regional_substations rs on rs.id = rto.regional_substation_id where rto.overlay_type = 'assumed_SEL_ICON_node' and rto.status <> 'verified_SEL_ICON_node'"},
        {"report_name": "RegionalGrid - Regional circuits pending field verification", "description": "Synthetic circuits waiting on field verification.", "sql_text": "select circuit_id, service_type, a_end_site, z_end_site, status from regional_synthetic_circuits where status = 'field_verification_pending'"},
        {"report_name": "RegionalGrid - Cross-utility proposed changes awaiting approval", "description": "Regional proposed changes waiting on host or cross-utility approval.", "sql_text": "select change_number, title, engineering_status, approval_status from proposed_changes where target_entity_type like 'regional_%' and approval_status in ('pending_approval', 'not_submitted')"},
        {"report_name": "RegionalGrid - Regional public substations with duplicate names", "description": "Likely duplicate public substation names for review.", "sql_text": "select normalized_name, state, count(*) as duplicate_count from regional_substations group by normalized_name, state having count(*) > 1"},
        {"report_name": "RegionalGrid - Transmission line records with unknown owner or voltage", "description": "Public line records missing owner or voltage class.", "sql_text": "select line_name, state, owner_id, voltage_kv, voltage_class from regional_transmission_lines where owner_id is null or voltage_class is null or voltage_class = 'unknown'"},
    ]
)

SAVED_REPORTS.extend(
    [
        {
            "report_name": "Synthetic Services - Circuits by service type and criticality",
            "description": "Backend circuit inventory grouped the same way the frontend synthetic service layer is displayed.",
            "sql_text": "select service_type, criticality, status, count(*) as circuit_count from circuits group by service_type, criticality, status order by service_type, criticality",
        },
        {
            "report_name": "Synthetic Services - Fiber assignments by circuit and device port",
            "description": "Fiber assignment rows joined to circuits, device ports, and fiber strands for service synchronization checks.",
            "sql_text": "select c.circuit_id, c.service_type, d.device_name, dp.port_name, fc.cable_id, fs.strand_number, fa.assignment_type, fa.assignment_status from fiber_assignments fa left join circuits c on c.id = fa.circuit_id left join device_ports dp on dp.id = fa.device_port_id left join devices d on d.id = dp.device_id left join fiber_strands fs on fs.id = fa.fiber_strand_id left join fiber_cables fc on fc.id = fs.fiber_cable_id order by c.circuit_id, d.device_name, dp.port_name",
        },
        {
            "report_name": "Synthetic Services - Patch panel handoffs by device port",
            "description": "Patch panel ports connected to device ports, showing the panel-to-hardware handoff model used by the frontend synthetic data.",
            "sql_text": "select pp.panel_id, ppp.port_number, ppp.port_label, d.device_name, dp.port_name, dp.port_type, dp.status from patch_panel_ports ppp join patch_panels pp on pp.id = ppp.patch_panel_id left join device_ports dp on dp.id = ppp.connected_device_port_id left join devices d on d.id = dp.device_id order by pp.panel_id, ppp.port_number",
        },
        {
            "report_name": "Synthetic Services - Device hardware port utilization",
            "description": "Device ports grouped by device, port type, and status for hardware/card utilization review.",
            "sql_text": "select d.device_name, d.device_type, dp.port_type, dp.status, count(*) as port_count from device_ports dp join devices d on d.id = dp.device_id group by d.device_name, d.device_type, dp.port_type, dp.status order by d.device_name, dp.port_type",
        },
        {
            "report_name": "Synthetic Services - SEL ICON module and card utilization",
            "description": "ICON module/card rows by node, slot, module type, and service role.",
            "sql_text": "select n.node_name, im.slot_number, im.module_type, im.port_count, im.service_role, im.status from icon_modules im join icon_nodes n on n.id = im.icon_node_id order by n.node_name, im.slot_number",
        },
        {
            "report_name": "Synthetic Services - Verizon leased service inventory",
            "description": "Verizon provider leased services tracked by bandwidth, cost, contract end, and status.",
            "sql_text": "select p.provider_name, ls.provider_circuit_id, ls.service_type, ls.bandwidth, ls.monthly_cost, ls.contract_end, ls.status from leased_services ls join providers p on p.id = ls.provider_id where lower(p.provider_name) like '%verizon%' order by ls.contract_end, ls.provider_circuit_id",
        },
        {
            "report_name": "Synthetic Services - Verizon leased services nearing renewal",
            "description": "Verizon leased services whose contract end is inside the next 180 days.",
            "sql_text": "select p.provider_name, ls.provider_circuit_id, ls.service_type, ls.bandwidth, ls.monthly_cost, ls.contract_end, ls.status from leased_services ls join providers p on p.id = ls.provider_id where lower(p.provider_name) like '%verizon%' and ls.contract_end <= date('now', '+180 days') order by ls.contract_end",
        },
        {
            "report_name": "Synthetic Services - Leased backup circuits by provider",
            "description": "Circuits with leased ownership or leased backup markers grouped by provider.",
            "sql_text": "select coalesce(p.provider_name, 'internal or synthetic') as provider_name, c.service_type, c.criticality, c.status, count(*) as circuit_count from circuits c left join providers p on p.id = c.provider_id where lower(c.ownership_type) like '%leased%' or lower(c.service_type) like '%leased%' group by coalesce(p.provider_name, 'internal or synthetic'), c.service_type, c.criticality, c.status",
        },
        {
            "report_name": "Synthetic Services - Fiber cables carrying the most assignments",
            "description": "Fiber cables ranked by the number of assignment rows riding their strands.",
            "sql_text": "select fc.cable_id, fc.cable_type, count(fa.id) as assignment_count from fiber_cables fc left join fiber_strands fs on fs.fiber_cable_id = fc.id left join fiber_assignments fa on fa.fiber_strand_id = fs.id group by fc.cable_id, fc.cable_type order by assignment_count desc",
        },
        {
            "report_name": "Synthetic Services - Device ports missing service or fiber assignment",
            "description": "Device ports that are marked assigned but do not have linked circuit or fiber assignment references.",
            "sql_text": "select d.device_name, dp.port_name, dp.port_type, dp.status, dp.connected_circuit_id, dp.connected_fiber_strand_id from device_ports dp join devices d on d.id = dp.device_id where dp.status = 'assigned' and (dp.connected_circuit_id is null or not exists (select 1 from fiber_assignments fa where fa.device_port_id = dp.id))",
        },
    ]
)
