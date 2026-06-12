export type DatabaseIntegrationParameterGroup = {
  title: string;
  description: string;
  requiredParameters: string[];
  interactionTips: string[];
};

export type DatabaseObjectInteractionPath = {
  title: string;
  summary: string;
  actions: string[];
  linkedObjects: string[];
};

export const databaseIntegrationParameterGroups: DatabaseIntegrationParameterGroup[] = [
  {
    title: "Identity and source",
    description: "Give every object a stable identity before it is linked to map layers, modules, traces, or work orders.",
    requiredParameters: ["object_type", "record_key", "display_label", "source", "visibility", "synthetic_or_verified_status"],
    interactionTips: ["Use record_key as the durable cross-module ID.", "Keep source and synthetic/verified status visible on every object."],
  },
  {
    title: "Lifecycle and review",
    description: "Tell the database where the record is in the design lifecycle so proposed work does not look like active infrastructure.",
    requiredParameters: ["status", "validation_status", "approval_status", "review_notes", "materialization_mode", "as_built_evidence"],
    interactionTips: ["Use proposed or planned for new design data.", "Reserve as_built or verified only for reviewed closeout records."],
  },
  {
    title: "Geometry and map behavior",
    description: "Define whether the object appears on the dashboard map and how users should interact with it.",
    requiredParameters: ["geometry_type", "geometry_or_location", "map_style", "dashboard_layer", "service_territory", "placement_notes"],
    interactionTips: ["Use table_only for records like splice rows or strand rows.", "Use point, line, or polygon geometry for clickable map objects."],
  },
  {
    title: "Relationship keys",
    description: "Capture the IDs that let the object interact with the rest of the planning database.",
    requiredParameters: ["parent_id", "a_end_id", "z_end_id", "cable_id", "strand_numbers", "splice_ids", "patch_panel_id", "device_id", "circuit_id", "work_order_id"],
    interactionTips: ["Use explicit A-end and Z-end fields for traceable paths.", "Store IDs for cables, strands, splices, ports, devices, circuits, and work orders instead of notes-only references."],
  },
  {
    title: "Engineering parameters",
    description: "Add type-specific fields that make the object useful for planning, validation, and field execution.",
    requiredParameters: ["asset_type", "owner_or_group", "capacity", "fiber_count", "port_or_strand_range", "service_type", "criticality", "loss_or_latency_target"],
    interactionTips: ["Make the most important fields structured columns.", "Put vendor-specific or one-off values in JSON/extra attributes only after core fields are defined."],
  },
  {
    title: "Work, evidence, and continuity",
    description: "Define what proves the record is ready, installed, tested, or safe to materialize into module data.",
    requiredParameters: ["required_evidence", "acceptance_criteria", "closeout_status", "continuity_trace_id", "outage_impact_flag", "rollback_plan"],
    interactionTips: ["Link proposed changes to work orders before field work.", "Attach continuity, splice, trace, and evidence references before closeout."],
  },
];

export const databaseObjectInteractionPaths: DatabaseObjectInteractionPath[] = [
  {
    title: "Map dashboard interaction",
    summary: "Clickable map objects need geometry, display labels, lifecycle status, and a dashboard layer assignment.",
    actions: ["Open Dashboard Design Mode", "Draw or select the object", "Edit generated fields", "Open linked module or issue work"],
    linkedObjects: ["service territory", "dashboard layer", "work order", "module detail page"],
  },
  {
    title: "Backend module interaction",
    summary: "Module rows need stable record keys and backend entity mapping so reviewed design records can be materialized safely.",
    actions: ["Create object type", "Fill required fields", "Set materialization mode", "Materialize after review"],
    linkedObjects: ["object type", "module table", "module snapshot", "import/export package"],
  },
  {
    title: "Fiber and splice interaction",
    summary: "Continuity depends on explicit cable, strand, splice, patch-panel, and endpoint IDs.",
    actions: ["Create cable or span", "Generate or enter strand rows", "Add splice rows", "Trace continuity"],
    linkedObjects: ["fiber cable", "fiber strand", "splice closure", "patch panel", "fiber assignment"],
  },
  {
    title: "Device, service, and circuit interaction",
    summary: "Services should connect device ports, LIU/patch-panel ports, strands, splice IDs, and A/Z endpoint records.",
    actions: ["Create endpoint devices", "Capture ports", "Reserve strands", "Assign service", "Open fiber trace"],
    linkedObjects: ["device", "device port", "circuit", "service", "fiber trace"],
  },
  {
    title: "Work-order interaction",
    summary: "Living design records become actionable when scope, affected assets, evidence, and closeout states are linked.",
    actions: ["Select source record", "Issue work order", "Add tasks and evidence", "Review closeout", "Update lifecycle status"],
    linkedObjects: ["source object", "affected assets", "field evidence", "closeout review", "as-built record"],
  },
];
