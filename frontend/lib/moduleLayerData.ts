import type {
  FccMicrowaveLinkCollection,
  FccUtilityTowerCollection,
  FiberAssignment,
  FiberStrand,
  OpgwCableCollection,
  PatchPanel,
  PublicSubstationCollection,
  PublicTransmissionLineCollection,
  SpliceClosureCollection,
  SyntheticService,
  SyntheticSubstationCollection,
} from "@/lib/types/assets";
import type { JsonRecord } from "@/types";

export type ModuleLayerMetric = {
  label: string;
  value: number | string;
  detail: string;
  source: string;
  safety: string;
};

export type ModuleLayerData = {
  title: string;
  notice: string;
  rows: JsonRecord[];
  metrics: ModuleLayerMetric[];
  disableDetailLinks?: boolean;
};

const DATA_BOUNDARY =
  "Public layers are reference-only. Synthetic/demo telecom, OPGW, splicing, patch panel, strand, and circuit records are not real utility assets and are not for operations.";

export async function loadModuleLayerData(key: string): Promise<ModuleLayerData | null> {
  switch (key) {
    case "substations":
      return loadSubstations();
    case "transmission-lines":
      return loadTransmissionLines();
    case "devices":
      return loadDevices();
    case "circuits":
      return loadCircuits();
    case "opgw":
    case "fiber-cables":
      return loadOpgwCables(key);
    case "fiber-strands":
      return loadFiberStrands();
    case "fiber-assignments":
      return loadFiberAssignments();
    case "splice-closures":
      return loadSpliceClosures();
    case "fiber-splices":
      return loadFiberSplices();
    case "patch-panels":
      return loadPatchPanels();
    case "work-orders":
      return loadWorkOrders();
    default:
      return null;
  }
}

async function loadSubstations(): Promise<ModuleLayerData> {
  const [publicSubstations, syntheticSubstations] = await Promise.all([
    fetchJson<PublicSubstationCollection>("/data/iso-ne-public-substations.geojson"),
    fetchJson<SyntheticSubstationCollection>("/data/iso-ne-synthetic-substations.geojson"),
  ]);
  const verifiedPublic = publicSubstations.features.filter((feature) => {
    const owner = clean(feature.properties.utilityOwner);
    return owner && owner.toLowerCase() !== "unknown" && feature.properties.ownerSource !== "unknown";
  });
  const publicRows = verifiedPublic.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    return {
      id: properties.id,
      substation_code: properties.id,
      name: properties.osmSubstationName || properties.name || properties.id,
      region: properties.state,
      state: properties.state,
      county: properties.county,
      city: properties.city,
      voltage_level: voltageRange(properties.minVoltageKv, properties.maxVoltageKv),
      min_voltage_kv: properties.minVoltageKv,
      max_voltage_kv: properties.maxVoltageKv,
      line_count: properties.lineCount,
      utility_owner: properties.utilityOwner,
      owner_source: properties.ownerSource,
      owner_confidence: properties.ownerConfidence,
      latitude,
      longitude,
      status: properties.status || "existing",
      layer: "Public substations by verified utility owner",
      source: properties.source,
      source_type: properties.sourceType,
      read_only: true,
      synthetic: false,
      data_boundary: properties.publicDataNotice,
    };
  });
  const syntheticRows = syntheticSubstations.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    return {
      id: properties.id,
      substation_code: properties.id,
      name: properties.name,
      region: properties.state,
      state: properties.state,
      county: properties.county,
      city: properties.cityHint,
      voltage_level: properties.voltageClasses.join(", "),
      utility_owner: "Synthetic demo planning",
      owner_source: "synthetic_demo",
      owner_confidence: properties.labelType,
      planning_role: properties.planningRole,
      criticality: properties.criticality,
      connected_transmission_lines: properties.connectedTransmissionLineIds.length,
      connected_devices: properties.connectedDeviceIds.length,
      connected_circuits: properties.connectedCircuitIds.length,
      connected_fibers: properties.connectedFiberIds.length,
      latitude,
      longitude,
      status: properties.status,
      layer: "Synthetic substation planning overlay",
      source: properties.source,
      source_type: properties.sourceType,
      read_only: false,
      synthetic: true,
      data_boundary: properties.disclaimer,
    };
  });
  const rows = [...publicRows, ...syntheticRows];
  return {
    title: "Layer-backed substation inventory",
    notice:
      "This module now includes verified-owner public substation reference points plus clearly labeled synthetic planning substations. Public records are read-only references; synthetic rows are demo data.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Verified public substations", publicRows.length, "Only public records with a supported owner/operator source are included.", "HIFLD/OpenStreetMap public layers", "Reference only"),
      metric("Synthetic substations", syntheticRows.length, "Demo planning points remain labeled synthetic.", "Synthetic demo layer", "Not real assets"),
      metric("Utility owners", uniqueCount(publicRows.map((row) => row.utility_owner)), "Owner sublayer values available in the module filter.", "Verified public owner fields", "No private ownership inference"),
      metric("ISO-NE states", uniqueCount(rows.map((row) => row.state)), "Records span the New England state layer set.", "Public and synthetic layer files", DATA_BOUNDARY),
    ],
  };
}

async function loadTransmissionLines(): Promise<ModuleLayerData> {
  const transmissionLines = await fetchJson<PublicTransmissionLineCollection>("/data/iso-ne-public-transmission-lines.geojson");
  const rows = transmissionLines.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    const owner = properties.utilityOwner || properties.owner || "Unverified public owner";
    return {
      id: properties.id,
      line_name: properties.name || properties.osmLineName || properties.id,
      voltage_kv: properties.voltageKv,
      voltage_class: properties.voltageClass || "unknown",
      from_substation_id: "-",
      to_substation_id: "-",
      utility_owner: owner,
      owner_source: properties.ownerSource || "unknown",
      owner_confidence: properties.ownerConfidence || "unknown",
      states: properties.states.join(", "),
      status: properties.status || "existing",
      layer: "HIFLD transmission lines by utility owner",
      source: properties.source,
      source_type: properties.sourceType,
      read_only: true,
      synthetic: false,
      data_boundary: properties.publicDataNotice,
    };
  });
  return {
    title: "Layer-backed transmission line inventory",
    notice: "Transmission-line module rows include the same HIFLD/public line layer used on the map, including owner sublayer fields where public data supports them.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Public transmission lines", rows.length, "HIFLD/public reference corridors available to the module.", "HIFLD public transmission layer", "Reference only"),
      metric("Owner buckets", uniqueCount(rows.map((row) => row.utility_owner)), "Utility-owner layer values are filterable.", "Public owner/operator fields", "Do not infer private telecom ownership"),
      metric("Voltage classes", uniqueCount(rows.map((row) => row.voltage_class)), "Voltage class sublayers from the map are exposed in the table.", "Public line attributes", "Reference only"),
      metric("States", uniqueCount(rows.flatMap((row) => splitList(row.states))), "ISO-NE state coverage available in line records.", "Public line geometry", "Reference only"),
    ],
  };
}

async function loadDevices(): Promise<ModuleLayerData> {
  const [nodes, fccTowers] = await Promise.all([
    fetchJson<GeoJsonCollection>("/data/telecomNodes.geojson"),
    fetchJson<FccUtilityTowerCollection>("/data/fcc-uls-utility-towers.geojson"),
  ]);
  const telecomRows = nodes.features.map<JsonRecord>((feature) => {
    const properties = feature.properties as Record<string, unknown>;
    return {
      id: clean(properties.id),
      device_name: properties.name,
      device_type: properties.role,
      manufacturer: properties.manufacturer,
      model: properties.model,
      substation_id: properties.site,
      management_ip: properties.ipAddress,
      firmware: properties.firmware,
      status: properties.status,
      criticality: properties.criticality,
      lifecycle_state: properties.lifecycleState,
      layer: "Synthetic telecom nodes",
      source: "synthetic-demo",
      source_type: "synthetic-planning",
      read_only: false,
      synthetic: true,
      data_boundary: "Synthetic device planning data. Not a real operational inventory.",
    };
  });
  const towerRows = fccTowers.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    return {
      id: properties.id,
      device_name: properties.nodeName,
      device_type: "FCC microwave tower",
      manufacturer: "FCC ULS public record",
      model: properties.structureType || "tower",
      substation_id: properties.locationName || properties.city || properties.state,
      utility_owner: properties.utilityOwner,
      call_sign: properties.callSign,
      frequency_mhz: properties.frequencyBandsMhz.join(", "),
      linked_paths: properties.linkedPathIds.length,
      latitude,
      longitude,
      status: properties.licenseStatus || "active",
      criticality: "public-reference",
      layer: "FCC utility tower nodes",
      source: properties.source,
      source_type: properties.sourceType,
      read_only: true,
      synthetic: false,
      data_boundary: properties.publicDataNotice,
    };
  });
  const rows = [...telecomRows, ...towerRows];
  return {
    title: "Layer-backed device and tower inventory",
    notice: "Device rows include synthetic telecom nodes and the public FCC utility tower node layer. FCC rows are public reference records, not private operational nodes.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic telecom nodes", telecomRows.length, "Demo devices from the map layer.", "Synthetic node layer", "Not real operational inventory"),
      metric("FCC utility tower nodes", towerRows.length, "Public FCC ULS utility microwave site records.", "FCC ULS public layer", "Reference only"),
      metric("Utility owners", uniqueCount(towerRows.map((row) => row.utility_owner)), "FCC utility-owner sublayers available in the module.", "FCC ULS licensee names", "Public utility records only"),
      metric("Linked microwave paths", sum(towerRows.map((row) => toNumber(row.linked_paths))), "Path relationships exposed from FCC tower layer.", "FCC ULS public layer", "Reference only"),
    ],
  };
}

async function loadCircuits(): Promise<ModuleLayerData> {
  const [telecomCircuits, microwaveLinks, syntheticServices, assignments] = await Promise.all([
    fetchJson<GeoJsonCollection>("/data/telecomCircuits.geojson"),
    fetchJson<FccMicrowaveLinkCollection>("/data/fcc-uls-utility-microwave-links.geojson"),
    fetchJson<SyntheticService[]>("/data/iso-ne-synthetic-services.json"),
    fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
  ]);
  const telecomRows = telecomCircuits.features.map<JsonRecord>((feature) => {
    const properties = feature.properties as Record<string, unknown>;
    return {
      id: properties.circuitId,
      circuit_id: properties.circuitId,
      circuit_name: properties.circuitName,
      service_type: properties.serviceType,
      ownership_type: "synthetic-demo",
      provider_id: "internal-demo",
      criticality: properties.criticality,
      status: properties.status,
      a_end: properties.aEnd,
      z_end: properties.zEnd,
      primary_route: properties.primaryRoute,
      backup_route: properties.backupRoute,
      layer: "Synthetic telecom circuits",
      source: "synthetic-demo",
      source_type: "synthetic-planning",
      synthetic: true,
      data_boundary: "Synthetic telecom circuit layer. Not a real service path.",
    };
  });
  const microwaveRows = microwaveLinks.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    return {
      id: properties.id,
      circuit_id: properties.id,
      circuit_name: properties.linkName,
      service_type: "FCC microwave link",
      ownership_type: "public-reference",
      provider_id: properties.rawLicenseeName,
      utility_owner: properties.utilityOwner,
      call_sign: properties.callSign,
      frequency_mhz: properties.frequencyAssignedMhz,
      frequency_upper_mhz: properties.frequencyUpperBandMhz,
      path_distance_miles: properties.pathDistanceMiles,
      path_type: properties.pathTypeDesc,
      states: properties.states.join(", "),
      criticality: "public-reference",
      status: properties.pathStatus || "active",
      a_end: properties.txNodeId,
      z_end: properties.rxNodeId,
      layer: "FCC microwave link paths",
      source: properties.source,
      source_type: properties.sourceType,
      read_only: true,
      synthetic: false,
      data_boundary: properties.publicDataNotice,
    };
  });
  const serviceRows = syntheticServices.map<JsonRecord>((service) => ({
    id: service.serviceId,
    circuit_id: service.serviceId,
    circuit_name: service.serviceName,
    service_type: service.serviceType,
    ownership_type: "synthetic-demo",
    provider_id: "internal-demo",
    criticality: service.criticality,
    status: service.operationalStatus,
    a_end: service.fromSiteName,
    z_end: service.toSiteName,
    primary_route: service.primaryPathAssignmentId,
    backup_route: service.backupPathAssignmentId,
    continuity_status: service.continuityStatus,
    layer: "Synthetic service continuity",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: "Synthetic service continuity record. Not a real relay, SCADA, microwave, or fiber service.",
  }));
  const assignmentRows = assignments.map<JsonRecord>((assignment) => ({
    id: assignment.id,
    circuit_id: assignment.id,
    circuit_name: assignment.assignmentName,
    service_type: assignment.serviceType,
    ownership_type: "synthetic-demo",
    provider_id: "fiber-assignment-demo",
    criticality: assignment.serviceType === "Protection" || assignment.serviceType === "C37_94" ? "high" : "normal",
    status: assignment.status,
    a_end: assignment.aEndStructureId,
    z_end: assignment.zEndStructureId,
    primary_route: assignment.cableIds.join(", "),
    estimated_distance_miles: assignment.estimatedDistanceMiles,
    estimated_loss_db: assignment.estimatedLossDb,
    layer: "Synthetic fiber assignments as circuits",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: "Synthetic strand assignment. Not a real circuit route.",
  }));
  const rows = [...telecomRows, ...microwaveRows, ...serviceRows, ...assignmentRows];
  return {
    title: "Layer-backed circuit and service inventory",
    notice: "Circuit rows include synthetic telecom circuits, synthetic fiber assignments/services, and public FCC microwave links. No row represents a verified private utility service path.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic telecom circuits", telecomRows.length, "Demo circuit path layer records.", "Synthetic circuit layer", "Not real services"),
      metric("FCC microwave links", microwaveRows.length, "Public microwave path records grouped by link type and frequency.", "FCC ULS public layer", "Reference only"),
      metric("Synthetic services", serviceRows.length, "Service continuity records from the map layer.", "Synthetic service layer", "Not real relay/SCADA paths"),
      metric("Fiber assignments", assignmentRows.length, "Synthetic strand assignment records exposed as planning services.", "Synthetic fiber layer", "Not real routing"),
    ],
  };
}

async function loadOpgwCables(key: string): Promise<ModuleLayerData> {
  const [opgw, strands, assignments, spliceClosures, patchPanels] = await Promise.all([
    fetchJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson"),
    fetchJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json"),
    fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
    fetchJson<SpliceClosureCollection>("/data/iso-ne-synthetic-splice-closures.geojson"),
    fetchJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json"),
  ]);
  const strandCounts = countByKey(strands, "cableId");
  const assignedCounts = countByPredicate(strands, (strand) => strand.status === "assigned");
  const availableCounts = countByPredicate(strands, (strand) => ["available", "spare", "dark"].includes(strand.status));
  const reservedCounts = countByPredicate(strands, (strand) => strand.status === "reserved");
  const assignmentsByCable = countByCable(assignments);
  const patchPanelsByCable = countPatchPanelsByCable(patchPanels);
  const closuresByCable = countClosuresByCable(spliceClosures.features.map((feature) => feature.properties));
  const rows = opgw.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    return {
      id: properties.id,
      cable_id: properties.id,
      cable_name: properties.cableName,
      cable_type: properties.fiberType,
      fiber_count: properties.fiberCount,
      route_name: properties.cableName,
      route_miles: properties.routeMiles,
      a_end_location: properties.startStructureId,
      z_end_location: properties.endStructureId,
      line_id: properties.lineId,
      line_name: properties.lineName,
      status: properties.status,
      available_strands: availableCounts.get(properties.id) || 0,
      assigned_strands: assignedCounts.get(properties.id) || 0,
      reserved_strands: reservedCounts.get(properties.id) || 0,
      strand_records: strandCounts.get(properties.id) || 0,
      assignments: assignmentsByCable.get(properties.id) || 0,
      services_carried: assignmentsByCable.get(properties.id) || 0,
      splice_closures: closuresByCable.get(properties.id) || 0,
      primary_splice_closure_id: properties.connectedSpliceClosureIds[0],
      patch_panels: patchPanelsByCable.get(properties.id) || 0,
      structure_count: properties.structureIds.length,
      manufacturer: properties.manufacturer,
      cable_spec: properties.cableSpec,
      open_href: `/opgw/cables/${encodeURIComponent(properties.id)}`,
      open_label: "Open cable continuity",
      splice_manager_href: properties.connectedSpliceClosureIds[0] ? `/opgw/splices/${encodeURIComponent(properties.connectedSpliceClosureIds[0])}` : undefined,
      layer: "Synthetic OPGW fiber routes",
      source: properties.source,
      source_type: "synthetic-planning",
      read_only: false,
      synthetic: true,
      data_boundary: properties.notes,
    };
  });
  const totalMiles = sum(rows.map((row) => toNumber(row.route_miles)));
  return {
    title: "Layer-backed OPGW cable inventory",
    notice: "OPGW module rows include synthetic assumed/planned OPGW cable routes, strands, splices, patch panels, and assignments from the map layer. Synthetic assumptions are not active fiber.",
    rows,
    disableDetailLinks: key === "opgw",
    metrics: [
      metric("Synthetic OPGW cables", rows.length, "OPGW route layer records embedded in the module.", "Synthetic OPGW layer", "Planning/demo only"),
      metric("Route miles", totalMiles.toFixed(1), "Total synthetic OPGW miles represented by the layer.", "Synthetic OPGW layer", "Not verified active fiber"),
      metric("Fiber strands", strands.length, "One synthetic strand row per generated fiber.", "Synthetic fiber strand layer", "Planning/demo only"),
      metric("Assignments", assignments.length, "Synthetic service reservations and assignments riding the OPGW layer.", "Synthetic assignment layer", "Not real circuits"),
    ],
  };
}

async function loadFiberStrands(): Promise<ModuleLayerData> {
  const strands = await fetchJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json");
  const rows = strands.map<JsonRecord>((strand) => ({
    id: strand.id,
    fiber_cable_id: strand.cableId,
    strand_number: strand.strandNumber,
    tube_number: strand.tubeNumber,
    strand_color: strand.colorCode,
    buffer_tube_color: strand.tubeNumber ? `Tube ${strand.tubeNumber}` : undefined,
    status: strand.status,
    assigned_circuit_id: strand.circuitId,
    assignment_id: strand.assignmentId,
    layer: "Synthetic fiber strand inventory",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: strand.notes || "Synthetic strand record. Not a real fiber inventory.",
  }));
  return {
    title: "Layer-backed fiber strand inventory",
    notice: "The Fiber Strands module now embeds every synthetic OPGW strand generated for the map layer.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic strand records", rows.length, "One row per generated fiber strand.", "Synthetic fiber strand layer", "Not a real inventory"),
      metric("Available/dark/spare", rows.filter((row) => ["available", "dark", "spare"].includes(String(row.status))).length, "Capacity exposed for planning.", "Synthetic fiber strand layer", "Planning only"),
      metric("Assigned", rows.filter((row) => row.status === "assigned").length, "Synthetic assignments only.", "Synthetic fiber strand layer", "Not real circuits"),
      metric("Reserved", rows.filter((row) => row.status === "reserved").length, "Synthetic future capacity reservations.", "Synthetic fiber strand layer", "Planning only"),
    ],
  };
}

async function loadFiberAssignments(): Promise<ModuleLayerData> {
  const assignments = await fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json");
  const rows = assignments.map<JsonRecord>((assignment) => ({
    id: assignment.id,
    assignment_id: assignment.id,
    assignment_name: assignment.assignmentName,
    assignment_type: assignment.serviceType,
    assignment_status: assignment.status,
    fiber_strand_id: firstStrandId(assignment),
    circuit_id: assignment.id,
    device_port_id: assignment.aEndNodeId,
    work_order_id: undefined,
    a_end_structure_id: assignment.aEndStructureId,
    z_end_structure_id: assignment.zEndStructureId,
    cable_ids: assignment.cableIds.join(", "),
    strand_count: assignment.strandSegments.reduce((count, segment) => count + segment.strandNumbers.length, 0),
    splice_count: assignment.spliceIds.length,
    estimated_distance_miles: assignment.estimatedDistanceMiles,
    estimated_loss_db: assignment.estimatedLossDb,
    layer: "Synthetic fiber assignment planner",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: assignment.notes || "Synthetic fiber assignment. Not a real service route.",
  }));
  return {
    title: "Layer-backed fiber assignments",
    notice: "Fiber assignment module rows now include the synthetic map-layer assignment planner output.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic assignments", rows.length, "Generated assignment planner records.", "Synthetic assignment layer", "Planning/demo only"),
      metric("Active synthetic", rows.filter((row) => row.assignment_status === "active").length, "Synthetic active-like records for demo views.", "Synthetic assignment layer", "Not operational state"),
      metric("Planned/proposed", rows.filter((row) => ["planned", "proposed"].includes(String(row.assignment_status))).length, "Future-state planning records.", "Synthetic assignment layer", "Planning only"),
      metric("Reserved", rows.filter((row) => row.assignment_status === "reserved").length, "Capacity reservation records.", "Synthetic assignment layer", "Planning only"),
    ],
  };
}

async function loadSpliceClosures(): Promise<ModuleLayerData> {
  const spliceClosures = await fetchJson<SpliceClosureCollection>("/data/iso-ne-synthetic-splice-closures.geojson");
  const rows = spliceClosures.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    return {
      id: properties.id,
      closure_id: properties.id,
      closure_name: properties.name,
      closure_type: properties.closureType,
      location_name: properties.structureNumber,
      structure_number: properties.structureNumber,
      pole_number: properties.structureId,
      cable_ids: properties.cableIds.join(", "),
      splice_count: properties.spliceCount,
      install_type: properties.installType,
      latitude,
      longitude,
      status: properties.status,
      layer: "Synthetic splice closures",
      source: properties.source,
      source_type: "synthetic-planning",
      synthetic: true,
      data_boundary: properties.notes || "Synthetic splice closure. Not a real field record.",
    };
  });
  return {
    title: "Layer-backed splice closures",
    notice: "Splice Closure rows include the same synthetic OPGW splice-node layer used on the map.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic splice closures", rows.length, "Generated splice nodes on OPGW routes.", "Synthetic splice layer", "Planning/demo only"),
      metric("Terminal closures", rows.filter((row) => row.closure_type === "terminal_splice").length, "Terminal points exposed from the layer.", "Synthetic splice layer", "Not field verified"),
      metric("Tap/midspan closures", rows.filter((row) => ["tap_splice", "midspan_splice"].includes(String(row.closure_type))).length, "Intermediate splice planning points.", "Synthetic splice layer", "Not real locations"),
      metric("Planned/proposed", rows.filter((row) => ["planned", "proposed"].includes(String(row.status))).length, "Future-state splice rows.", "Synthetic splice layer", "Planning only"),
    ],
  };
}

async function loadFiberSplices(): Promise<ModuleLayerData> {
  const splices = await fetchJson<GeoJsonRecord[]>("/data/iso-ne-synthetic-fiber-splices.json");
  const rows = splices.map<JsonRecord>((splice) => ({
    id: splice.id,
    splice_closure_id: splice.spliceClosureId,
    tray_position: `${splice.fromStrandNumber}-${splice.toStrandNumber}`,
    incoming_fiber_cable_id: splice.fromCableId,
    incoming_strand_number: splice.fromStrandNumber,
    outgoing_fiber_cable_id: splice.toCableId,
    outgoing_strand_number: splice.toStrandNumber,
    splice_type: splice.spliceType,
    loss_db: splice.lossDb,
    status: splice.status,
    assignment_id: splice.assignmentId,
    layer: "Synthetic fiber splice matrix",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: splice.notes || "Synthetic splice matrix row. Not a real splice sheet.",
  }));
  return {
    title: "Layer-backed fiber splices",
    notice: "Fiber Splices module rows include the generated splice matrix data from the synthetic map layer.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic splice rows", rows.length, "Generated strand-to-strand splice matrix rows.", "Synthetic splice matrix layer", "Not a real splice sheet"),
      metric("Straight-through", rows.filter((row) => row.splice_type === "straight_through").length, "Synthetic continuity splice rows.", "Synthetic splice matrix layer", "Planning only"),
      metric("Open/reserved", rows.filter((row) => ["open", "reserved"].includes(String(row.splice_type))).length, "Unassigned demo rows.", "Synthetic splice matrix layer", "Planning only"),
      metric("Planned/proposed", rows.filter((row) => ["planned", "proposed"].includes(String(row.status))).length, "Future-state splice records.", "Synthetic splice matrix layer", "Planning only"),
    ],
  };
}

async function loadPatchPanels(): Promise<ModuleLayerData> {
  const patchPanels = await fetchJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json");
  const rows = patchPanels.map<JsonRecord>((panel) => ({
    id: panel.id,
    panel_id: panel.id,
    panel_name: panel.name,
    substation_id: panel.locationType === "substation" ? panel.locationId : undefined,
    location_type: panel.locationType,
    location_id: panel.locationId,
    connector_type: panel.connectorType,
    port_count: panel.portCount,
    assigned_ports: panel.ports.filter((port) => port.status === "assigned").length,
    reserved_ports: panel.ports.filter((port) => port.status === "reserved").length,
    available_ports: panel.ports.filter((port) => port.status === "available").length,
    fiber_cable_ids: panel.fiberCableIds.join(", "),
    status: panel.ports.some((port) => port.status === "faulted") ? "faulted" : "planned",
    layer: "Synthetic patch panels",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: panel.notes || "Synthetic patch panel. Not a real field panel.",
  }));
  return {
    title: "Layer-backed patch panels",
    notice: "Patch Panel rows now include generated terminal panels and port utilization from the synthetic OPGW layer.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic patch panels", rows.length, "Generated terminal panels on OPGW route endpoints.", "Synthetic patch panel layer", "Planning/demo only"),
      metric("Patch panel ports", sum(rows.map((row) => toNumber(row.port_count))), "Generated port count across panels.", "Synthetic patch panel layer", "Not field verified"),
      metric("Available ports", sum(rows.map((row) => toNumber(row.available_ports))), "Demo capacity view.", "Synthetic patch panel layer", "Planning only"),
      metric("Reserved ports", sum(rows.map((row) => toNumber(row.reserved_ports))), "Synthetic assignment reservations.", "Synthetic patch panel layer", "Planning only"),
    ],
  };
}

async function loadWorkOrders(): Promise<ModuleLayerData> {
  const workOrders = await fetchJson<GeoJsonCollection>("/data/workOrders.geojson");
  const rows = workOrders.features.map<JsonRecord>((feature) => {
    const properties = feature.properties as Record<string, unknown>;
    return {
      id: properties.woId,
      work_order_number: properties.woId,
      title: properties.title,
      work_type: properties.assignedGroup,
      priority: properties.priority,
      status: properties.status,
      assigned_field_tech_id: properties.assignedGroup,
      due_date: properties.dueDate,
      related_asset_id: properties.relatedAssetId,
      site: properties.site,
      layer: "Synthetic work order locations",
      source: "synthetic-demo",
      source_type: "synthetic-planning",
      synthetic: true,
      data_boundary: "Synthetic work order layer. Not a real dispatch or field assignment.",
    };
  });
  return {
    title: "Layer-backed work orders",
    notice: "Work Orders include the synthetic map-layer work order locations, so module counts match the planning overlay.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic work orders", rows.length, "Map-layer work order records embedded in the module.", "Synthetic work order layer", "Not real dispatch data"),
      metric("Open/in progress", rows.filter((row) => ["open", "in_progress"].includes(String(row.status))).length, "Demo active work queue.", "Synthetic work order layer", "Planning only"),
      metric("Critical/high priority", rows.filter((row) => ["critical", "high"].includes(String(row.priority))).length, "Priority rows available to filter/search.", "Synthetic work order layer", "Planning only"),
      metric("Related assets", uniqueCount(rows.map((row) => row.related_asset_id)), "Layer relationships preserved in module rows.", "Synthetic work order layer", "Planning only"),
    ],
  };
}

type GeoJsonRecord = Record<string, unknown>;
type GeoJsonCollection = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: GeoJsonRecord; geometry: unknown }>;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return (await response.json()) as T;
}

function metric(label: string, value: number | string, detail: string, source: string, safety: string): ModuleLayerMetric {
  return { label, value, detail, source, safety };
}

function voltageRange(min?: number | null, max?: number | null): string {
  if (min && max && min !== max) return `${min}-${max} kV`;
  if (max) return `${max} kV`;
  if (min) return `${min} kV`;
  return "unknown";
}

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function splitList(value: unknown): string[] {
  return clean(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueCount(values: unknown[]): number {
  return new Set(values.map(clean).filter(Boolean)).size;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function countByKey<T extends Record<string, unknown>>(items: T[], key: keyof T): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = clean(item[key]);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function countByPredicate(items: FiberStrand[], predicate: (item: FiberStrand) => boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!predicate(item)) continue;
    counts.set(item.cableId, (counts.get(item.cableId) || 0) + 1);
  }
  return counts;
}

function countByCable(assignments: FiberAssignment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    for (const cableId of assignment.cableIds) counts.set(cableId, (counts.get(cableId) || 0) + 1);
  }
  return counts;
}

function countPatchPanelsByCable(panels: PatchPanel[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const panel of panels) {
    for (const cableId of panel.fiberCableIds) counts.set(cableId, (counts.get(cableId) || 0) + 1);
  }
  return counts;
}

function countClosuresByCable(closures: Array<{ cableIds: string[] }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const closure of closures) {
    for (const cableId of closure.cableIds) counts.set(cableId, (counts.get(cableId) || 0) + 1);
  }
  return counts;
}

function firstStrandId(assignment: FiberAssignment): string | undefined {
  const firstSegment = assignment.strandSegments[0];
  const firstStrand = firstSegment?.strandNumbers[0];
  return firstSegment && firstStrand ? `${firstSegment.cableId}:${firstStrand}` : undefined;
}
