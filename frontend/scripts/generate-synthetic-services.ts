import type {
  DistributionFiberAssignmentCollection,
  DistributionPoleFiberRouteCollection,
  FiberAssignment,
  PatchPanel,
  SyntheticService,
} from "../lib/types/assets";
import {
  DISTRIBUTION_FIBER_ASSIGNMENTS_PATH,
  DISTRIBUTION_POLE_FIBER_PATH,
  FIBER_ASSIGNMENTS_PATH,
  OUTPUT_DIR,
  PATCH_PANELS_PATH,
  SYNTHETIC_SERVICES_PATH,
  createSeededRandom,
  idSafe,
  readJson,
  readOpgwCables,
  readSpliceClosures,
  round,
  writeJson,
} from "./fiber-network-utils";

type GeoJsonCollection = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }>;
};

type TelecomHardwareNode = {
  nodeId: string;
  nodeName: string;
  siteId: string;
  deviceRole: string;
  manufacturer: string;
  model: string;
  chassis: string;
  managementIp: string;
  firmware: string;
  status: string;
  criticality: string;
  serviceIds: string[];
  cardIds: string[];
  portIds: string[];
  synthetic: true;
  notes: string;
};

type TelecomHardwareCard = {
  cardId: string;
  nodeId: string;
  slotNumber: number;
  cardType: string;
  manufacturer: string;
  model: string;
  portCount: number;
  serviceRole: string;
  firmware: string;
  status: string;
  synthetic: true;
};

type TelecomHardwarePort = {
  portId: string;
  nodeId: string;
  cardId: string;
  slotNumber: number;
  portName: string;
  portType: string;
  speed: string;
  connectorType: string;
  status: string;
  assignedServiceId?: string;
  assignedCircuitId?: string;
  patchPanelId?: string;
  patchPanelPort?: string;
  fiberAssignmentId?: string;
  synthetic: true;
};

type VerizonLeasedService = {
  provider_circuit_id: string;
  service_type: string;
  provider_id: string;
  provider_name: "Verizon";
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
  synthetic: true;
  data_boundary: string;
};

const TELECOM_NODES_PATH = `${OUTPUT_DIR}/telecomNodes.geojson`;
const TELECOM_CIRCUITS_PATH = `${OUTPUT_DIR}/telecomCircuits.geojson`;
const TELECOM_HARDWARE_PATH = `${OUTPUT_DIR}/iso-ne-synthetic-telecom-hardware.json`;
const VERIZON_LEASED_SERVICES_PATH = `${OUTPUT_DIR}/iso-ne-synthetic-verizon-leased-services.json`;
const SEED = "gridassetlink-synthetic-services-v3";
const SYNTHETIC_NOTICE = "Synthetic planning data only. Not a real utility telecom, SCADA, relay, Verizon, or private fiber service.";

async function main() {
  const rng = createSeededRandom(SEED);
  const [opgwCables, spliceClosures, opgwAssignments, patchPanels, distributionAssignments, distributionRoutes, legacyTelecomCircuits] = await Promise.all([
    readOpgwCables(),
    readSpliceClosures(),
    readJson<FiberAssignment[]>(FIBER_ASSIGNMENTS_PATH, []),
    readJson<PatchPanel[]>(PATCH_PANELS_PATH, []),
    readJson<DistributionFiberAssignmentCollection>(DISTRIBUTION_FIBER_ASSIGNMENTS_PATH, { type: "FeatureCollection", features: [] }),
    readJson<DistributionPoleFiberRouteCollection>(DISTRIBUTION_POLE_FIBER_PATH, { type: "FeatureCollection", features: [] }),
    readJson<GeoJsonCollection>(TELECOM_CIRCUITS_PATH, { type: "FeatureCollection", features: [] }),
  ]);

  const services: SyntheticService[] = [];
  const addService = (service: SyntheticService) => {
    services.push(service);
    return service;
  };

  const usableOpgwAssignments = opgwAssignments.filter((assignment) => assignment.cableIds.length > 0);
  usableOpgwAssignments.slice(0, 260).forEach((assignment, index) => {
    const cableWindow = opgwCables.features.slice(index % Math.max(1, opgwCables.features.length), (index % Math.max(1, opgwCables.features.length)) + 3);
    const continuityCableIds = unique([...(assignment.cableIds || []), ...cableWindow.map((feature) => feature.properties.id)]).slice(0, 4);
    const relatedClosures = spliceClosures.features
      .filter((closure) => closure.properties.cableIds.some((cableId) => continuityCableIds.includes(cableId)))
      .slice(0, 10)
      .map((closure) => closure.properties.id);
    const serviceType = opgwServiceTypeFor(index, assignment.serviceType);
    const serviceId = `SYN-SVC-OPGW-${String(index + 1).padStart(5, "0")}`;
    addService({
      serviceId,
      serviceName: `${serviceType} synthetic OPGW service ${String(index + 1).padStart(3, "0")}`,
      serviceType,
      serviceDescription: `${serviceType} carried on synthetic OPGW/fiber assignments only.`,
      fromSiteId: assignment.aEndStructureId || continuityCableIds[0] || "SYN-A-END",
      fromSiteName: assignment.aEndStructureId || "Synthetic A-end structure",
      toSiteId: assignment.zEndStructureId || continuityCableIds[continuityCableIds.length - 1] || "SYN-Z-END",
      toSiteName: assignment.zEndStructureId || "Synthetic Z-end structure",
      endpointAPatchPanelId: patchPanelForCable(patchPanels, continuityCableIds[0])?.id,
      endpointAPort: patchPortForAssignment(patchPanels, assignment.id),
      endpointZPatchPanelId: patchPanelForCable(patchPanels, continuityCableIds[continuityCableIds.length - 1])?.id,
      endpointZPort: patchPortForAssignment(patchPanels, assignment.id, true),
      primaryPathAssignmentId: assignment.id,
      backupPathAssignmentId: index % 3 === 0 ? usableOpgwAssignments[(index + 17) % usableOpgwAssignments.length]?.id : undefined,
      criticality: criticalityFor(serviceType),
      protectionLevel: protectionFor(serviceType, index),
      latencyClass: latencyFor(serviceType),
      operationalStatus: statusFor(index),
      layerType: index % 7 === 0 ? "proposed" : "existing",
      syntheticFlag: true,
      continuityCableIds,
      continuitySpliceClosureIds: relatedClosures,
      continuityStatus: index % 19 === 0 ? "proposed_change" : "complete",
      circuitId: `SYN-CKT-OPGW-${String(index + 1).padStart(5, "0")}`,
      bandwidthProfile: bandwidthFor(serviceType),
      vlanOrTimeslot: vlanOrTimeslotFor(serviceType, index),
      telecomNodeIds: [`TN-OPGW-${String(index % 96).padStart(3, "0")}`, `TN-OPGW-${String((index + 13) % 96).padStart(3, "0")}`],
      hardwareCardIds: [`CARD-OPGW-${String(index % 96).padStart(3, "0")}-1`],
      hardwarePortIds: [`PORT-OPGW-${String(index % 96).padStart(3, "0")}-${String(index % 24).padStart(3, "0")}`],
      notes: SYNTHETIC_NOTICE,
    });
  });

  const routeById = new Map(distributionRoutes.features.map((feature) => [feature.properties.routeId, feature]));
  distributionAssignments.features.forEach((feature, index) => {
    const properties = feature.properties;
    const route = routeById.get(properties.routeId);
    const serviceId = properties.serviceId || `SYN-SVC-DIST-${String(index + 1).padStart(6, "0")}`;
    addService({
      serviceId,
      serviceName: properties.serviceName || properties.assignmentName,
      serviceType: properties.serviceType,
      serviceDescription: `${properties.serviceType} from synthetic patch panel to random distribution pole endpoint.`,
      fromSiteId: properties.endpointAPatchPanelId || route?.properties.parentPatchPanelId || properties.aEndPoleId,
      fromSiteName: properties.endpointAPatchPanelId || route?.properties.parentPatchPanelId || "Synthetic distribution patch panel",
      toSiteId: properties.zEndPoleId,
      toSiteName: properties.zEndPoleId,
      endpointAPatchPanelId: properties.endpointAPatchPanelId,
      endpointAPort: properties.endpointAPort,
      endpointZPatchPanelId: properties.endpointZPatchPanelId,
      endpointZPort: properties.endpointZPort,
      distributionAssignmentId: properties.id,
      primaryPathAssignmentId: properties.id,
      backupPathAssignmentId: index % 5 === 0 ? distributionAssignments.features[(index + 23) % distributionAssignments.features.length]?.properties.id : undefined,
      criticality: properties.criticality === "normal" ? "medium" : properties.criticality,
      protectionLevel: protectionFor(properties.serviceType, index),
      latencyClass: latencyFor(properties.serviceType),
      operationalStatus: properties.status === "reserved" ? "planned" : properties.status === "active_synthetic" ? "active_synthetic" : properties.status,
      layerType: properties.status === "planned" || properties.status === "proposed" || properties.status === "reserved" ? "proposed" : "existing",
      syntheticFlag: true,
      continuityCableIds: route?.properties.parentOpgwRouteId ? [route.properties.parentOpgwRouteId] : [],
      continuitySplicePointIds: properties.splicePointIds,
      continuityStatus: properties.status === "reserved" ? "proposed_change" : "complete",
      circuitId: properties.circuitId || serviceId.replace("SYN-SVC", "SYN-CKT"),
      bandwidthProfile: properties.bandwidthProfile || bandwidthFor(properties.serviceType),
      vlanOrTimeslot: vlanOrTimeslotFor(properties.serviceType, index),
      telecomNodeIds: properties.telecomNodeIds,
      hardwarePortIds: properties.hardwarePortIds,
      notes: SYNTHETIC_NOTICE,
    });
  });

  legacyTelecomCircuits.features.forEach((feature, index) => {
    const properties = feature.properties;
    const serviceType = String(properties.serviceType || "Ethernet");
    addService({
      serviceId: `SYN-SVC-LEGACY-${String(index + 1).padStart(4, "0")}`,
      serviceName: String(properties.circuitName || properties.circuitId),
      serviceType,
      serviceDescription: "Synthetic legacy telecom circuit merged into the service inventory.",
      fromSiteId: String(properties.aEnd || "Synthetic A-end"),
      fromSiteName: String(properties.aEnd || "Synthetic A-end"),
      toSiteId: String(properties.zEnd || "Synthetic Z-end"),
      toSiteName: String(properties.zEnd || "Synthetic Z-end"),
      primaryPathAssignmentId: String(properties.primaryRoute || ""),
      backupPathAssignmentId: String(properties.backupRoute || ""),
      criticality: criticalityFor(serviceType, String(properties.criticality || "")),
      protectionLevel: protectionFor(serviceType, index),
      latencyClass: latencyFor(serviceType),
      operationalStatus: String(properties.status || "active") === "proposed" ? "proposed" : "active_synthetic",
      layerType: String(properties.status || "") === "proposed" ? "proposed" : "existing",
      syntheticFlag: true,
      continuityStatus: "complete",
      circuitId: String(properties.circuitId || `SYN-CKT-LEGACY-${index + 1}`),
      bandwidthProfile: String(properties.bandwidth || bandwidthFor(serviceType)),
      vlanOrTimeslot: vlanOrTimeslotFor(serviceType, index),
      notes: SYNTHETIC_NOTICE,
    });
  });

  const hardware = buildTelecomHardware(services, distributionRoutes, rng);
  const telecomNodesGeoJson = buildTelecomNodesGeoJson(hardware.nodes, rng);
  const verizonServices = buildVerizonServices(services, patchPanels, rng);

  await writeJson(SYNTHETIC_SERVICES_PATH, services);
  await writeJson(TELECOM_HARDWARE_PATH, hardware);
  await writeJson(TELECOM_NODES_PATH, telecomNodesGeoJson);
  await writeJson(VERIZON_LEASED_SERVICES_PATH, verizonServices);
  console.log(`Wrote ${services.length} synthetic services, ${hardware.nodes.length} telecom nodes, ${hardware.cards.length} cards, ${hardware.ports.length} ports, and ${verizonServices.length} Verizon leased services.`);
}

function buildTelecomHardware(services: SyntheticService[], distributionRoutes: DistributionPoleFiberRouteCollection, rng: () => number) {
  const nodeCount = Math.min(240, Math.max(96, Math.ceil(services.length / 18)));
  const nodes: TelecomHardwareNode[] = [];
  const cards: TelecomHardwareCard[] = [];
  const ports: TelecomHardwarePort[] = [];
  const roles = [
    ["SEL ICON", "SEL", "ICON", "ICON Main Chassis"],
    ["IP/MPLS Router", "Cisco", "IE-5000 synthetic", "DIN/Rack router"],
    ["Packet Optical", "Nokia", "1830 PSS synthetic", "Packet optical shelf"],
    ["Distribution Switch", "Ruggedcom", "RSG synthetic", "Substation switch"],
    ["RTU Gateway", "SEL", "RTAC synthetic", "Automation gateway"],
    ["Provider NID", "Verizon", "Carrier Ethernet NID synthetic", "Carrier NID"],
  ] as const;
  for (let index = 0; index < nodeCount; index += 1) {
    const route = distributionRoutes.features[index % Math.max(1, distributionRoutes.features.length)];
    const [role, manufacturer, model, chassis] = roles[index % roles.length];
    const nodeId = `TN-SYN-${String(index + 1).padStart(5, "0")}`;
    const serviceIds = services.filter((_, serviceIndex) => serviceIndex % nodeCount === index || serviceIndex % nodeCount === (index + 11) % nodeCount).slice(0, 24).map((service) => service.serviceId);
    const cardIds: string[] = [];
    const portIds: string[] = [];
    const cardPlan = cardPlanFor(role);
    nodes.push({
      nodeId,
      nodeName: `${route?.properties.state || "NE"}-${idSafe(route?.properties.feederId || "SYN")}-TN-${String(index + 1).padStart(3, "0")}`.slice(0, 80),
      siteId: route?.properties.parentPatchPanelId || route?.properties.firstPoleId || `SYN-SITE-${index + 1}`,
      deviceRole: role,
      manufacturer,
      model,
      chassis,
      managementIp: `10.${40 + (index % 80)}.${Math.floor(index / 200) + 10}.${20 + (index % 210)} placeholder`,
      firmware: firmwareFor(role, index),
      status: index % 17 === 0 ? "planned" : index % 23 === 0 ? "maintenance" : "online",
      criticality: index % 5 === 0 ? "critical" : index % 3 === 0 ? "high" : "normal",
      serviceIds,
      cardIds,
      portIds,
      synthetic: true,
      notes: SYNTHETIC_NOTICE,
    });
    cardPlan.forEach((plan, slotIndex) => {
      const cardId = `${nodeId}-CARD-${String(slotIndex + 1).padStart(2, "0")}`;
      cardIds.push(cardId);
      cards.push({
        cardId,
        nodeId,
        slotNumber: slotIndex + 1,
        cardType: plan.cardType,
        manufacturer,
        model: plan.model,
        portCount: plan.portCount,
        serviceRole: plan.serviceRole,
        firmware: firmwareFor(role, index + slotIndex),
        status: slotIndex === cardPlan.length - 1 && index % 13 === 0 ? "planned" : "active",
        synthetic: true,
      });
      for (let port = 1; port <= plan.portCount; port += 1) {
        const assignedService = services[(index * 17 + slotIndex * 7 + port) % Math.max(1, services.length)];
        const assigned = assignedService && (port <= Math.ceil(plan.portCount * 0.72));
        const portId = `${cardId}-PORT-${String(port).padStart(3, "0")}`;
        portIds.push(portId);
        ports.push({
          portId,
          nodeId,
          cardId,
          slotNumber: slotIndex + 1,
          portName: `${plan.portPrefix}${port}`,
          portType: plan.portType,
          speed: plan.speed,
          connectorType: plan.connector,
          status: assigned ? "assigned" : port % 11 === 0 ? "reserved" : "available",
          assignedServiceId: assigned ? assignedService.serviceId : undefined,
          assignedCircuitId: assigned ? assignedService.circuitId || assignedService.serviceId : undefined,
          patchPanelId: assigned ? assignedService.endpointAPatchPanelId || assignedService.endpointZPatchPanelId : undefined,
          patchPanelPort: assigned ? assignedService.endpointAPort || assignedService.endpointZPort : undefined,
          fiberAssignmentId: assigned ? assignedService.primaryPathAssignmentId || assignedService.distributionAssignmentId : undefined,
          synthetic: true,
        });
      }
    });
  }
  return { nodes, cards, ports, synthetic_data_notice: SYNTHETIC_NOTICE };
}

function buildTelecomNodesGeoJson(nodes: TelecomHardwareNode[], rng: () => number): GeoJsonCollection {
  return {
    type: "FeatureCollection",
    features: nodes.map((node, index) => ({
      type: "Feature",
      properties: {
        id: node.nodeId,
        name: node.nodeName,
        site: node.siteId,
        manufacturer: node.manufacturer,
        model: node.model,
        role: node.deviceRole,
        ipAddress: node.managementIp,
        firmware: node.firmware,
        status: node.status,
        lifecycleState: node.status === "planned" ? "Planned" : "Existing",
        installDate: `202${index % 7}-0${(index % 9) + 1}-15`,
        criticality: node.criticality,
        serviceCount: node.serviceIds.length,
        cardCount: node.cardIds.length,
        portCount: node.portIds.length,
        notes: node.notes,
      },
      geometry: {
        type: "Point",
        coordinates: [
          round(-73.7 + rng() * 6.6, 6),
          round(41.1 + rng() * 5.7, 6),
        ],
      },
    })),
  };
}

function buildVerizonServices(services: SyntheticService[], patchPanels: PatchPanel[], rng: () => number): VerizonLeasedService[] {
  return services
    .filter((service, index) => service.serviceType.includes("Leased") || service.protectionLevel === "backup_available" || index % 13 === 0)
    .slice(0, 180)
    .map((service, index) => {
      const bandwidth = verizonBandwidthFor(service.serviceType, index);
      const monthlyCost = bandwidth.includes("10 Gbps") ? 6200 : bandwidth.includes("1 Gbps") ? 2850 : bandwidth.includes("100 Mbps") ? 1150 : 650;
      const panel = patchPanels[index % Math.max(1, patchPanels.length)];
      return {
        provider_circuit_id: `VZ-SYN-${String(index + 1).padStart(6, "0")}`,
        service_type: service.serviceType.includes("DS1") ? "Verizon DS1 synthetic" : bandwidth.includes("Ethernet") ? "Verizon Ethernet synthetic" : "Verizon private-line synthetic",
        provider_id: "Verizon",
        provider_name: "Verizon",
        bandwidth,
        monthly_cost: monthlyCost + Math.round(rng() * 450),
        contract_end: `${2026 + (index % 4)}-${String((index % 12) + 1).padStart(2, "0")}-01`,
        status: index % 9 === 0 ? "pending_disconnect" : index % 7 === 0 ? "ordered" : "active_synthetic",
        a_end: service.fromSiteName,
        z_end: service.toSiteName,
        handoff_type: bandwidth.includes("DS1") ? "DS1 smart jack" : "Ethernet NID",
        sla_availability: index % 5 === 0 ? "99.99 synthetic" : "99.9 synthetic",
        sla_latency_ms: bandwidth.includes("10 Gbps") ? 8 : bandwidth.includes("1 Gbps") ? 12 : 25,
        backup_for_service_id: service.serviceId,
        demarc_patch_panel_id: service.endpointAPatchPanelId || panel?.id,
        synthetic: true,
        data_boundary: SYNTHETIC_NOTICE,
      };
    });
}

function cardPlanFor(role: string) {
  if (role === "SEL ICON") {
    return [
      { cardType: "SONET line card", model: "ICON OC-n synthetic", portCount: 4, serviceRole: "ring transport", portType: "optical", speed: "OC-3/OC-12", connector: "LC", portPrefix: "L" },
      { cardType: "C37.94 protection card", model: "ICON C37.94 synthetic", portCount: 8, serviceRole: "relay/protection", portType: "C37.94", speed: "64 kbps", connector: "ST", portPrefix: "P" },
      { cardType: "Ethernet tributary card", model: "ICON Ethernet synthetic", portCount: 8, serviceRole: "SCADA/packet", portType: "ethernet", speed: "1G", connector: "RJ45/SFP", portPrefix: "E" },
    ];
  }
  if (role === "Packet Optical") return [{ cardType: "OTN muxponder", model: "10G muxponder synthetic", portCount: 12, serviceRole: "wavelengths", portType: "optical", speed: "1G/10G", connector: "LC", portPrefix: "O" }];
  if (role === "Provider NID") return [{ cardType: "Carrier Ethernet NID", model: "Verizon NID synthetic", portCount: 6, serviceRole: "leased handoff", portType: "ethernet", speed: "100M/1G", connector: "RJ45/LC", portPrefix: "UNI" }];
  return [
    { cardType: "Ethernet access card", model: "Rugged access synthetic", portCount: 12, serviceRole: "field aggregation", portType: "ethernet", speed: "100M/1G", connector: "RJ45/SFP", portPrefix: "E" },
    { cardType: "Serial/RTU card", model: "serial synthetic", portCount: 8, serviceRole: "RTU/SCADA", portType: "serial", speed: "RS-232/RS-485", connector: "DB9", portPrefix: "S" },
  ];
}

function opgwServiceTypeFor(index: number, fallback: string) {
  const types = ["SEL ICON Transport", "C37.94 Relay Channel", "87L Line Differential", "DTT Transfer Trip", "SCADA VLAN", "NMS VLAN", "PTP Timing", "PMU Synchrophasor", "Engineering Access VLAN", "Ethernet Pipe", fallback];
  return types[index % types.length];
}

function criticalityFor(serviceType: string, fallback = ""): "low" | "medium" | "high" | "critical" {
  const value = `${serviceType} ${fallback}`.toLowerCase();
  if (value.includes("87l") || value.includes("dtt") || value.includes("protection") || value.includes("relay")) return "critical";
  if (value.includes("scada") || value.includes("timing") || value.includes("pmu") || value.includes("automation")) return "high";
  if (value.includes("spare") || value.includes("dark")) return "low";
  return "medium";
}

function protectionFor(serviceType: string, index: number): SyntheticService["protectionLevel"] {
  const value = serviceType.toLowerCase();
  if (value.includes("87l") || value.includes("dtt") || value.includes("relay") || value.includes("protection")) return "ring_protected";
  if (value.includes("leased") || index % 5 === 0) return "backup_available";
  if (value.includes("scada") || value.includes("timing") || index % 3 === 0) return "diverse_path";
  if (value.includes("spare") || value.includes("dark")) return "none";
  return "single_path";
}

function latencyFor(serviceType: string): SyntheticService["latencyClass"] {
  const value = serviceType.toLowerCase();
  if (value.includes("87l") || value.includes("dtt") || value.includes("protection") || value.includes("relay")) return "protection_grade";
  if (value.includes("timing") || value.includes("scada") || value.includes("pmu")) return "low_latency";
  if (value.includes("spare") || value.includes("dark")) return "best_effort";
  return "normal";
}

function statusFor(index: number): SyntheticService["operationalStatus"] {
  if (index % 31 === 0) return "broken_demo";
  if (index % 11 === 0) return "proposed";
  if (index % 7 === 0) return "planned";
  return "active_synthetic";
}

function bandwidthFor(serviceType: string) {
  const value = serviceType.toLowerCase();
  if (value.includes("87l") || value.includes("dtt") || value.includes("c37")) return "64 kbps protection channel";
  if (value.includes("ptp") || value.includes("timing")) return "timing profile";
  if (value.includes("pmu")) return "10 Mbps synchrophasor";
  if (value.includes("scada") || value.includes("automation")) return "10-100 Mbps operations";
  if (value.includes("nms") || value.includes("engineering")) return "100 Mbps management";
  if (value.includes("ethernet") || value.includes("transport") || value.includes("backhaul")) return "1 Gbps Ethernet";
  return "reserved fiber pair";
}

function vlanOrTimeslotFor(serviceType: string, index: number) {
  const value = serviceType.toLowerCase();
  if (value.includes("ds1")) return `DS1-${(index % 28) + 1}`;
  if (value.includes("c37") || value.includes("87l") || value.includes("dtt")) return `C37.94-${(index % 8) + 1}`;
  if (value.includes("scada")) return `VLAN-${1200 + (index % 120)}`;
  if (value.includes("nms")) return `VLAN-${2100 + (index % 90)}`;
  if (value.includes("engineering")) return `VLAN-${2300 + (index % 90)}`;
  return `VLAN-${3000 + (index % 500)}`;
}

function verizonBandwidthFor(serviceType: string, index: number) {
  if (serviceType.includes("DS1")) return "DS1 1.544 Mbps";
  if (serviceType.includes("Protection") || serviceType.includes("DTT")) return "100 Mbps Ethernet protected";
  if (index % 11 === 0) return "10 Gbps Ethernet";
  if (index % 4 === 0) return "1 Gbps Ethernet";
  return "100 Mbps Ethernet";
}

function firmwareFor(role: string, index: number) {
  if (role === "SEL ICON") return `ICON ${4 + (index % 2)}.${index % 10}.x synthetic`;
  if (role === "Provider NID") return `NID ${2 + (index % 3)}.${index % 8}.x synthetic`;
  if (role === "Packet Optical") return `OTN ${11 + (index % 5)}.x synthetic`;
  return `FW ${17 + (index % 4)}.${index % 12}.x synthetic`;
}

function patchPanelForCable(panels: PatchPanel[], cableId?: string) {
  if (!cableId) return undefined;
  return panels.find((panel) => panel.fiberCableIds.includes(cableId));
}

function patchPortForAssignment(panels: PatchPanel[], assignmentId?: string, last = false) {
  if (!assignmentId) return undefined;
  const matches = panels.flatMap((panel) => panel.ports.filter((port) => port.assignmentId === assignmentId));
  return (last ? matches[matches.length - 1] : matches[0])?.id;
}

function unique<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

void main();
