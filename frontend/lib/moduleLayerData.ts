import type {
  DistributionFiberAssignmentCollection,
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
    case "device-ports":
      return loadDevicePorts();
    case "circuits":
      return loadCircuits();
    case "leased-services":
      return loadLeasedServices();
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
  const [publicSubstations, syntheticSubstations, opgw, patchPanels, assignments] = await Promise.all([
    fetchJson<PublicSubstationCollection>("/data/iso-ne-public-substations.geojson"),
    fetchJson<SyntheticSubstationCollection>("/data/iso-ne-synthetic-substations.geojson"),
    fetchJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson"),
    fetchJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json"),
    fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
  ]);
  const cableIdsByLineId = new Map<string, string[]>();
  for (const feature of opgw.features) {
    const properties = feature.properties;
    const existing = cableIdsByLineId.get(properties.lineId) || [];
    existing.push(properties.id);
    cableIdsByLineId.set(properties.lineId, existing);
  }
  const patchPanelsByCableId = groupPatchPanelsByCable(patchPanels);
  const assignmentsByCableId = groupAssignmentsByCable(assignments);
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
      patch_panel_count: 0,
      fiber_assignment_count: 0,
      fiber_cable_count: 0,
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
    const relatedCableIds = uniqueStrings([
      ...properties.connectedFiberIds,
      ...properties.connectedTransmissionLineIds.flatMap((lineId) => cableIdsByLineId.get(lineId) || []),
    ]);
    const relatedPatchPanels = uniqueById(relatedCableIds.flatMap((cableId) => patchPanelsByCableId.get(cableId) || []));
    const relatedAssignments = uniqueById(relatedCableIds.flatMap((cableId) => assignmentsByCableId.get(cableId) || []));
    const availablePorts = sum(relatedPatchPanels.map((panel) => panel.ports.filter((port) => port.status === "available").length));
    const reservedPorts = sum(relatedPatchPanels.map((panel) => panel.ports.filter((port) => port.status === "reserved").length));
    const assignedPorts = sum(relatedPatchPanels.map((panel) => panel.ports.filter((port) => port.status === "assigned").length));
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
      fiber_cable_count: relatedCableIds.length,
      patch_panel_count: relatedPatchPanels.length,
      patch_panel_ids: relatedPatchPanels.map((panel) => panel.id).join(", "),
      patch_panel_ports: sum(relatedPatchPanels.map((panel) => panel.portCount)),
      available_patch_panel_ports: availablePorts,
      reserved_patch_panel_ports: reservedPorts,
      assigned_patch_panel_ports: assignedPorts,
      fiber_assignment_count: relatedAssignments.length,
      fiber_assignment_ids: relatedAssignments.map((assignment) => assignment.id).join(", "),
      fiber_assignment_services: uniqueStrings(relatedAssignments.map((assignment) => assignment.serviceType)).join(", "),
      fiber_cable_ids: relatedCableIds.join(", "),
      view_patch_panels: `/patch-panels?substation=${encodeURIComponent(properties.id)}`,
      view_fiber_assignments: `/fiber-assignments?substation=${encodeURIComponent(properties.id)}`,
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
  const substationPatchPanelCount = sum(syntheticRows.map((row) => toNumber(row.patch_panel_count)));
  const substationAssignmentCount = sum(syntheticRows.map((row) => toNumber(row.fiber_assignment_count)));
  return {
    title: "Layer-backed substation inventory",
    notice:
      "This module now includes verified-owner public substation reference points plus clearly labeled synthetic planning substations, with synthetic OPGW patch panels and fiber assignments joined into substation nodes.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Verified public substations", publicRows.length, "Only public records with a supported owner/operator source are included.", "HIFLD/OpenStreetMap public layers", "Reference only"),
      metric("Synthetic substations", syntheticRows.length, "Demo planning points remain labeled synthetic.", "Synthetic demo layer", "Not real assets"),
      metric("Substation patch panels", substationPatchPanelCount, "Synthetic OPGW terminal panels connected to synthetic substation nodes.", "Synthetic patch panel layer", "Planning/demo only"),
      metric("Substation assignments", substationAssignmentCount, "Synthetic strand assignments carried by OPGW cables associated to substation nodes.", "Synthetic assignment layer", "Not real services"),
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
  const [nodes, fccTowers, hardware] = await Promise.all([
    fetchJson<GeoJsonCollection>("/data/telecomNodes.geojson"),
    fetchJson<FccUtilityTowerCollection>("/data/fcc-uls-utility-towers.geojson"),
    fetchJson<SyntheticTelecomHardwareData>("/data/iso-ne-synthetic-telecom-hardware.json").catch(() => emptyHardware()),
  ]);
  const hardwareNodesById = new Map(hardware.nodes.map((node) => [clean(node.nodeId), node]));
  const assignedPortsByNode = countHardwarePortsByNode(hardware.ports, (port) => clean(port.status) === "assigned");
  const availablePortsByNode = countHardwarePortsByNode(hardware.ports, (port) => ["available", "reserved"].includes(clean(port.status)));
  const telecomRows = nodes.features.map<JsonRecord>((feature) => {
    const properties = feature.properties as Record<string, unknown>;
    const nodeId = clean(properties.id);
    const hardwareNode = hardwareNodesById.get(nodeId);
    return {
      id: nodeId,
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
      service_count: toNumber(properties.serviceCount) || hardwareNode?.serviceIds?.length || 0,
      hardware_cards: toNumber(properties.cardCount) || hardwareNode?.cardIds?.length || 0,
      hardware_ports: toNumber(properties.portCount) || hardwareNode?.portIds?.length || 0,
      assigned_ports: assignedPortsByNode.get(nodeId) || 0,
      available_ports: availablePortsByNode.get(nodeId) || 0,
      hardware_card_ids: hardwareNode?.cardIds?.join(", "),
      hardware_port_ids: hardwareNode?.portIds?.slice(0, 24).join(", "),
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
    notice: "Device rows include synthetic telecom nodes with generated chassis/card/port inventories, plus the public FCC utility tower node layer. FCC rows are public reference records, not private operational nodes.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic telecom nodes", telecomRows.length, "Demo devices from the map layer.", "Synthetic node layer", "Not real operational inventory"),
      metric("Synthetic hardware cards", hardware.cards.length, "Generated chassis cards across telecom nodes.", "Synthetic telecom hardware", "Planning/demo only"),
      metric("Synthetic device ports", hardware.ports.length, "Generated physical/logical ports assigned to services, patch panels, and circuits.", "Synthetic telecom hardware", "Planning/demo only"),
      metric("FCC utility tower nodes", towerRows.length, "Public FCC ULS utility microwave site records.", "FCC ULS public layer", "Reference only"),
      metric("Utility owners", uniqueCount(towerRows.map((row) => row.utility_owner)), "FCC utility-owner sublayers available in the module.", "FCC ULS licensee names", "Public utility records only"),
      metric("Linked microwave paths", sum(towerRows.map((row) => toNumber(row.linked_paths))), "Path relationships exposed from FCC tower layer.", "FCC ULS public layer", "Reference only"),
    ],
  };
}

async function loadDevicePorts(): Promise<ModuleLayerData> {
  const hardware = await fetchJson<SyntheticTelecomHardwareData>("/data/iso-ne-synthetic-telecom-hardware.json");
  const nodeById = new Map(hardware.nodes.map((node) => [clean(node.nodeId), node]));
  const cardById = new Map(hardware.cards.map((card) => [clean(card.cardId), card]));
  const rows = hardware.ports.map<JsonRecord>((port) => {
    const node = nodeById.get(clean(port.nodeId));
    const card = cardById.get(clean(port.cardId));
    return {
      id: port.portId,
      device_id: port.nodeId,
      device_name: node?.nodeName,
      device_type: node?.deviceRole,
      card_id: port.cardId,
      slot_number: port.slotNumber,
      card_type: card?.cardType,
      port_name: port.portName,
      port_type: port.portType,
      port_role: card?.serviceRole,
      physical_label: `${node?.nodeName || port.nodeId} / slot ${port.slotNumber} / ${port.portName}`,
      speed: port.speed,
      connector_type: port.connectorType,
      status: port.status,
      connected_circuit_id: port.assignedCircuitId,
      connected_service_id: port.assignedServiceId,
      patch_panel_id: port.patchPanelId,
      patch_panel_port: port.patchPanelPort,
      fiber_assignment_id: port.fiberAssignmentId,
      layer: "Synthetic telecom hardware ports",
      source: "synthetic-demo",
      source_type: "synthetic-planning",
      synthetic: true,
      data_boundary: hardware.synthetic_data_notice || DATA_BOUNDARY,
    };
  });
  return {
    title: "Layer-backed device port inventory",
    notice: "Device Port rows now come from the generated synthetic telecom hardware model: devices, cards, slots, ports, patch panel handoffs, service IDs, circuit IDs, and fiber assignment references stay in sync with the map-layer service data.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic ports", rows.length, "Generated port records across telecom devices.", "Synthetic telecom hardware", "Planning/demo only"),
      metric("Assigned ports", rows.filter((row) => row.status === "assigned").length, "Ports linked to synthetic services/circuits.", "Synthetic telecom hardware", "Not real operational state"),
      metric("Available/reserved ports", rows.filter((row) => ["available", "reserved"].includes(String(row.status))).length, "Capacity exposed for planning views.", "Synthetic telecom hardware", "Planning only"),
      metric("Hardware cards", hardware.cards.length, "Card and slot records backing the port inventory.", "Synthetic telecom hardware", "Planning/demo only"),
    ],
  };
}

async function loadCircuits(): Promise<ModuleLayerData> {
  const [telecomCircuits, microwaveLinks, syntheticServices, assignments, distributionAssignments, verizonServices] = await Promise.all([
    fetchJson<GeoJsonCollection>("/data/telecomCircuits.geojson"),
    fetchJson<FccMicrowaveLinkCollection>("/data/fcc-uls-utility-microwave-links.geojson"),
    fetchJson<SyntheticService[]>("/data/iso-ne-synthetic-services.json"),
    fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
    fetchJson<DistributionFiberAssignmentCollection>("/data/iso-ne-synthetic-distribution-fiber-assignments.geojson"),
    fetchJson<VerizonLeasedServiceRecord[]>("/data/iso-ne-synthetic-verizon-leased-services.json").catch(() => []),
  ]);
  const mergedSyntheticCircuitIds = new Set(syntheticServices.flatMap((service) => [service.serviceId, service.circuitId]).filter(Boolean).map(String));
  const telecomRows = telecomCircuits.features.filter((feature) => !mergedSyntheticCircuitIds.has(String((feature.properties as Record<string, unknown>).circuitId || ""))).map<JsonRecord>((feature) => {
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
      map_view: circuitDashboardHref(String(properties.circuitId || "")),
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
    circuit_id: service.circuitId || service.serviceId,
    circuit_name: service.serviceName,
    service_type: service.serviceType,
    ownership_type: "synthetic-demo",
    provider_id: service.providerName || "internal-demo",
    provider_name: service.providerName,
    criticality: service.criticality,
    status: service.operationalStatus,
    a_end: service.fromSiteName,
    z_end: service.toSiteName,
    primary_route: service.primaryPathAssignmentId,
    backup_route: service.backupPathAssignmentId,
    bandwidth_profile: service.bandwidthProfile,
    vlan_or_timeslot: service.vlanOrTimeslot,
    distribution_assignment_id: service.distributionAssignmentId,
    endpoint_a_patch_panel: service.endpointAPatchPanelId,
    endpoint_a_port: service.endpointAPort,
    endpoint_z_patch_panel: service.endpointZPatchPanelId,
    endpoint_z_port: service.endpointZPort,
    telecom_node_ids: service.telecomNodeIds?.join(", "),
    hardware_port_ids: service.hardwarePortIds?.join(", "),
    continuity_status: service.continuityStatus,
    map_view: circuitDashboardHref(service.serviceId),
    layer: "Merged synthetic telecom services",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: "Synthetic service continuity record. Not a real relay, SCADA, microwave, or fiber service.",
  }));
  const syntheticServiceAssignmentIds = new Set(syntheticServices.map((service) => service.distributionAssignmentId).filter(Boolean).map(String));
  const distributionAssignmentRows = distributionAssignments.features
    .filter((feature) => !syntheticServiceAssignmentIds.has(feature.properties.id))
    .map<JsonRecord>((feature) => {
      const properties = feature.properties;
      return {
        id: properties.serviceId || properties.id,
        circuit_id: properties.circuitId || properties.serviceId || properties.id,
        circuit_name: properties.serviceName || properties.assignmentName,
        service_type: properties.serviceType,
        ownership_type: "synthetic-demo",
        provider_id: "distribution-fiber-demo",
        utility_owner: properties.utilityOwner,
        criticality: properties.criticality,
        status: properties.status,
        a_end: properties.endpointAPatchPanelId || properties.aEndPoleId,
        z_end: properties.zEndPoleId,
        primary_route: properties.routeId,
        bandwidth_profile: properties.bandwidthProfile,
        endpoint_a_patch_panel: properties.endpointAPatchPanelId,
        endpoint_a_port: properties.endpointAPort,
        endpoint_z_patch_panel: properties.endpointZPatchPanelId,
        endpoint_z_port: properties.endpointZPort,
        telecom_node_ids: properties.telecomNodeIds?.join(", "),
        hardware_port_ids: properties.hardwarePortIds?.join(", "),
        map_view: circuitDashboardHref(String(properties.serviceId || properties.circuitId || properties.id)),
        layer: "Synthetic distribution fiber services",
        source: properties.source,
        source_type: "synthetic-planning",
        synthetic: true,
        data_boundary: properties.notes,
      };
    });
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
    map_view: circuitDashboardHref(assignment.id),
    layer: "Synthetic fiber assignments as circuits",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: "Synthetic strand assignment. Not a real circuit route.",
  }));
  const verizonRows = verizonServices.map<JsonRecord>((service) => ({
    id: service.provider_circuit_id,
    circuit_id: service.provider_circuit_id,
    circuit_name: `${service.service_type} backing ${service.backup_for_service_id || "synthetic service"}`,
    service_type: service.service_type,
    ownership_type: "leased_service",
    provider_id: service.provider_id,
    provider_name: service.provider_name,
    criticality: service.service_type.includes("protected") ? "high" : "medium",
    status: service.status,
    a_end: service.a_end,
    z_end: service.z_end,
    bandwidth_profile: service.bandwidth,
    sla_latency_ms: service.sla_latency_ms,
    backup_for_service_id: service.backup_for_service_id,
    endpoint_a_patch_panel: service.demarc_patch_panel_id,
    layer: "Verizon leased service overlay",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: service.data_boundary,
  }));
  const rows = [...microwaveRows, ...serviceRows, ...distributionAssignmentRows, ...telecomRows, ...assignmentRows, ...verizonRows];
  return {
    title: "Layer-backed circuit and service inventory",
    notice: "Circuit rows merge synthetic telecom circuits into the larger synthetic service inventory, add distribution-fiber services from patch panels to random pole endpoints, include Verizon leased-service overlays, and keep public FCC microwave links as reference-only rows.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Merged synthetic services", serviceRows.length, "Generated OPGW, distribution, SEL ICON, SCADA, timing, protection, and telecom services.", "Synthetic service layer", "Not real services"),
      metric("Distribution service fallbacks", distributionAssignmentRows.length, "Distribution assignments exposed directly when not already merged into services.", "Synthetic distribution layer", "Planning/demo only"),
      metric("Legacy telecom rows", telecomRows.length, "Unmerged legacy circuit path records retained only if not already present in services.", "Synthetic circuit layer", "Not real services"),
      metric("Verizon leased overlays", verizonRows.length, "Synthetic Verizon services associated to backup/diverse service needs.", "Synthetic leased service layer", "Not real Verizon circuits"),
      metric("FCC microwave links", microwaveRows.length, "Public microwave path records grouped by link type and frequency.", "FCC ULS public layer", "Reference only"),
      metric("Fiber assignments", assignmentRows.length, "Synthetic strand assignment records exposed as planning services.", "Synthetic fiber layer", "Not real routing"),
    ],
  };
}

function circuitDashboardHref(circuitId: string) {
  return `/dashboard?circuit=${encodeURIComponent(circuitId)}&routeView=full`;
}

async function loadLeasedServices(): Promise<ModuleLayerData> {
  const services = await fetchJson<VerizonLeasedServiceRecord[]>("/data/iso-ne-synthetic-verizon-leased-services.json");
  const rows = services.map<JsonRecord>((service) => ({
    id: service.provider_circuit_id,
    provider_circuit_id: service.provider_circuit_id,
    service_type: service.service_type,
    provider_id: service.provider_id,
    provider_name: service.provider_name,
    bandwidth: service.bandwidth,
    monthly_cost: service.monthly_cost,
    contract_end: service.contract_end,
    status: service.status,
    a_end: service.a_end,
    z_end: service.z_end,
    handoff_type: service.handoff_type,
    sla_availability: service.sla_availability,
    sla_latency_ms: service.sla_latency_ms,
    backup_for_service_id: service.backup_for_service_id,
    demarc_patch_panel_id: service.demarc_patch_panel_id,
    renewal_risk: renewalRisk(service.contract_end),
    layer: "Verizon synthetic leased services",
    source: "synthetic-demo",
    source_type: "synthetic-planning",
    synthetic: true,
    data_boundary: service.data_boundary,
  }));
  return {
    title: "Layer-backed Verizon leased service inventory",
    notice: "Leased Service rows include generated Verizon network service examples associated to synthetic backup, diverse-path, DS1, Ethernet, and provider NID handoff scenarios. These are demo rows only and do not represent real Verizon circuits.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Verizon synthetic services", rows.length, "Generated provider-circuit rows in the static service layer.", "Synthetic Verizon layer", "Not real provider data"),
      metric("Active synthetic", rows.filter((row) => row.status === "active_synthetic").length, "Demo active-like leased services.", "Synthetic Verizon layer", "Not operational state"),
      metric("Ordered / disconnect", rows.filter((row) => ["ordered", "pending_disconnect"].includes(String(row.status))).length, "Planning rows for lifecycle workflows.", "Synthetic Verizon layer", "Planning/demo only"),
      metric("Renewal risk", rows.filter((row) => row.renewal_risk !== "low").length, "Contract dates due within the demo planning horizon.", "Synthetic Verizon layer", "Planning/demo only"),
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
  const strandSummaryByCable = summarizeFiberStrandsByCable(strands);
  const assignmentsByCable = countByCable(assignments);
  const patchPanelsByCable = countPatchPanelsByCable(patchPanels);
  const closuresByCable = countClosuresByCable(spliceClosures.features.map((feature) => feature.properties));
  const rows = opgw.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    const strandSummary = strandSummaryByCable.get(properties.id);
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
      available_strands: strandSummary?.available || 0,
      assigned_strands: strandSummary?.assigned || 0,
      reserved_strands: strandSummary?.reserved || 0,
      strand_records: strandSummary?.total || 0,
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
  const [assignments, distributionAssignments] = await Promise.all([
    fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
    fetchJson<DistributionFiberAssignmentCollection>("/data/iso-ne-synthetic-distribution-fiber-assignments.geojson"),
  ]);
  const opgwRows = assignments.map<JsonRecord>((assignment) => ({
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
  const distributionRows = distributionAssignments.features.map<JsonRecord>((feature) => {
    const properties = feature.properties;
    return {
      id: properties.id,
      assignment_id: properties.id,
      assignment_name: properties.serviceName || properties.assignmentName,
      assignment_type: properties.serviceType,
      assignment_status: properties.status,
      fiber_strand_id: properties.strandNumbers[0] ? `${properties.routeId}:${properties.strandNumbers[0]}` : undefined,
      circuit_id: properties.circuitId || properties.serviceId,
      device_port_id: properties.hardwarePortIds?.[0],
      work_order_id: undefined,
      a_end_structure_id: properties.endpointAPatchPanelId || properties.aEndPoleId,
      z_end_structure_id: properties.zEndPoleId,
      cable_ids: properties.routeId,
      strand_count: properties.strandNumbers.length,
      splice_count: properties.splicePointIds.length,
      estimated_distance_miles: properties.routeMiles,
      estimated_loss_db: properties.estimatedLossDb,
      bandwidth_profile: properties.bandwidthProfile,
      endpoint_a_patch_panel: properties.endpointAPatchPanelId,
      endpoint_a_port: properties.endpointAPort,
      endpoint_z_patch_panel: properties.endpointZPatchPanelId,
      endpoint_z_port: properties.endpointZPort,
      telecom_node_ids: properties.telecomNodeIds?.join(", "),
      hardware_port_ids: properties.hardwarePortIds?.join(", "),
      utility_owner: properties.utilityOwner,
      layer: "Synthetic distribution patch-panel-to-pole assignment",
      source: properties.source,
      source_type: "synthetic-planning",
      synthetic: true,
      data_boundary: properties.notes,
    };
  });
  const rows = [...opgwRows, ...distributionRows];
  return {
    title: "Layer-backed fiber assignments",
    notice: "Fiber assignment module rows now include synthetic OPGW assignments plus distribution patch-panel-to-random-pole services, endpoint ports, telecom nodes, and hardware port references.",
    rows,
    disableDetailLinks: true,
    metrics: [
      metric("Synthetic assignments", rows.length, "Generated assignment planner records.", "Synthetic assignment layer", "Planning/demo only"),
      metric("OPGW assignments", opgwRows.length, "Generated OPGW strand assignment records.", "Synthetic OPGW assignment layer", "Planning/demo only"),
      metric("Distribution assignments", distributionRows.length, "Patch-panel to distribution-pole service assignments.", "Synthetic distribution layer", "Planning/demo only"),
      metric("Active synthetic", rows.filter((row) => ["active", "active_synthetic"].includes(String(row.assignment_status))).length, "Synthetic active-like records for demo views.", "Synthetic assignment layer", "Not operational state"),
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

type SyntheticTelecomHardwareNode = {
  nodeId: string;
  nodeName: string;
  siteId?: string;
  deviceRole?: string;
  serviceIds?: string[];
  cardIds?: string[];
  portIds?: string[];
  [key: string]: unknown;
};

type SyntheticTelecomHardwareCard = {
  cardId: string;
  nodeId: string;
  slotNumber?: number;
  cardType?: string;
  serviceRole?: string;
  [key: string]: unknown;
};

type SyntheticTelecomHardwarePort = {
  portId: string;
  nodeId: string;
  cardId: string;
  slotNumber?: number;
  portName?: string;
  portType?: string;
  speed?: string;
  connectorType?: string;
  status?: string;
  assignedServiceId?: string;
  assignedCircuitId?: string;
  patchPanelId?: string;
  patchPanelPort?: string;
  fiberAssignmentId?: string;
  [key: string]: unknown;
};

type SyntheticTelecomHardwareData = {
  nodes: SyntheticTelecomHardwareNode[];
  cards: SyntheticTelecomHardwareCard[];
  ports: SyntheticTelecomHardwarePort[];
  synthetic_data_notice?: string;
};

type VerizonLeasedServiceRecord = {
  provider_circuit_id: string;
  service_type: string;
  provider_id: string;
  provider_name: string;
  bandwidth: string;
  monthly_cost: number;
  contract_end: string;
  status: string;
  a_end: string;
  z_end: string;
  handoff_type: string;
  sla_availability: string;
  sla_latency_ms: number;
  backup_for_service_id?: string;
  demarc_patch_panel_id?: string;
  data_boundary?: string;
  [key: string]: unknown;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
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

function emptyHardware(): SyntheticTelecomHardwareData {
  return { nodes: [], cards: [], ports: [], synthetic_data_notice: DATA_BOUNDARY };
}

function countHardwarePortsByNode(ports: SyntheticTelecomHardwarePort[], predicate: (port: SyntheticTelecomHardwarePort) => boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const port of ports) {
    if (!predicate(port)) continue;
    const nodeId = clean(port.nodeId);
    if (!nodeId) continue;
    counts.set(nodeId, (counts.get(nodeId) || 0) + 1);
  }
  return counts;
}

function renewalRisk(contractEnd: unknown): string {
  const end = new Date(clean(contractEnd));
  if (Number.isNaN(end.getTime())) return "unknown";
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 90) return "high";
  if (days <= 180) return "medium";
  return "low";
}

type StrandCableSummary = {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
};

function summarizeFiberStrandsByCable(strands: FiberStrand[]): Map<string, StrandCableSummary> {
  const summaries = new Map<string, StrandCableSummary>();
  for (const strand of strands) {
    const current = summaries.get(strand.cableId) || { total: 0, available: 0, assigned: 0, reserved: 0 };
    current.total += 1;
    if (strand.status === "assigned") current.assigned += 1;
    if (strand.status === "reserved") current.reserved += 1;
    if (strand.status === "available" || strand.status === "spare" || strand.status === "dark") current.available += 1;
    summaries.set(strand.cableId, current);
  }
  return summaries;
}

function countByCable(assignments: FiberAssignment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    for (const cableId of assignment.cableIds) counts.set(cableId, (counts.get(cableId) || 0) + 1);
  }
  return counts;
}

function groupAssignmentsByCable(assignments: FiberAssignment[]): Map<string, FiberAssignment[]> {
  const groups = new Map<string, FiberAssignment[]>();
  for (const assignment of assignments) {
    for (const cableId of assignment.cableIds) {
      const existing = groups.get(cableId) || [];
      existing.push(assignment);
      groups.set(cableId, existing);
    }
  }
  return groups;
}

function countPatchPanelsByCable(panels: PatchPanel[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const panel of panels) {
    for (const cableId of panel.fiberCableIds) counts.set(cableId, (counts.get(cableId) || 0) + 1);
  }
  return counts;
}

function groupPatchPanelsByCable(panels: PatchPanel[]): Map<string, PatchPanel[]> {
  const groups = new Map<string, PatchPanel[]>();
  for (const panel of panels) {
    for (const cableId of panel.fiberCableIds) {
      const existing = groups.get(cableId) || [];
      existing.push(panel);
      groups.set(cableId, existing);
    }
  }
  return groups;
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
