import type {
  Coordinate,
  FiberAssignment,
  FiberSplice,
  FiberStrand,
  OpgwCableCollection,
  PatchPanel,
  SpliceClosureCollection,
  StrandContinuityRecord,
  StrandContinuitySegment,
  SyntheticService,
} from "../lib/types/assets";
import {
  FIBER_ASSIGNMENTS_PATH,
  FIBER_SPLICES_PATH,
  OUTPUT_DIR,
  PATCH_PANELS_PATH,
  STRANDS_PATH,
  SYNTHETIC_SERVICES_PATH,
  createSeededRandom,
  distanceMiles,
  readJson,
  readOpgwCables,
  readSpliceClosures,
  round,
  writeJson,
} from "./fiber-network-utils";

type TelecomHardwareData = {
  nodes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  ports: Array<Record<string, unknown>>;
  synthetic_data_notice?: string;
};

const TELECOM_HARDWARE_PATH = `${OUTPUT_DIR}/iso-ne-synthetic-telecom-hardware.json`;
const STRAND_CONTINUITY_PATH = `${OUTPUT_DIR}/iso-ne-synthetic-strand-continuity.json`;
const SEED = "gridassetlink-strand-continuity-v1";
const SYNTHETIC_NOTICE = "Synthetic strand continuity demo only. Patch panels, strand paths, splices, services, and end devices are not real utility records.";

async function main() {
  const rng = createSeededRandom(SEED);
  const [opgw, closures, assignments, strands, splices, patchPanels, services, hardware] = await Promise.all([
    readOpgwCables(),
    readSpliceClosures(),
    readJson<FiberAssignment[]>(FIBER_ASSIGNMENTS_PATH, []),
    readJson<FiberStrand[]>(STRANDS_PATH, []),
    readJson<FiberSplice[]>(FIBER_SPLICES_PATH, []),
    readJson<PatchPanel[]>(PATCH_PANELS_PATH, []),
    readJson<SyntheticService[]>(SYNTHETIC_SERVICES_PATH, []),
    readJson<TelecomHardwareData>(TELECOM_HARDWARE_PATH, { nodes: [], cards: [], ports: [], synthetic_data_notice: SYNTHETIC_NOTICE }),
  ]);

  const cableById = new Map(opgw.features.map((feature) => [feature.properties.id, feature]));
  const closuresByCable = groupClosuresByCable(closures);
  const strandsByCable = groupStrandsByCable(strands);
  const panelsByCable = groupPanelsByCable(patchPanels);
  const servicesByAssignment = groupServicesByAssignment(services);
  const portsByService = groupHardwarePortsByService(hardware);
  const nodeById = new Map(hardware.nodes.map((node) => [clean(node.nodeId), node]));
  const continuity: StrandContinuityRecord[] = [];

  assignments
    .filter((assignment) => assignment.cableIds.length > 0 && assignment.strandSegments.some((segment) => segment.strandNumbers.length > 0))
    .slice(0, 900)
    .forEach((assignment, index) => {
      const cableIds = assignment.cableIds.filter((cableId) => cableById.has(cableId));
      if (!cableIds.length) return;
      const strandNumbers = uniqueNumbers(assignment.strandSegments.flatMap((segment) => segment.strandNumbers)).slice(0, 12);
      const firstCableId = cableIds[0];
      const lastCableId = cableIds[cableIds.length - 1];
      const aPanel = pickPanelForAssignment(panelsByCable.get(firstCableId) || [], assignment.id, false);
      const zPanel = pickPanelForAssignment(panelsByCable.get(lastCableId) || [], assignment.id, true);
      const relatedClosures = uniqueStrings(cableIds.flatMap((cableId) => (closuresByCable.get(cableId) || []).map((closure) => closure.properties.id))).slice(0, 18);
      const relatedSplices = splices
        .filter((splice) => cableIds.includes(splice.fromCableId) || cableIds.includes(splice.toCableId) || splice.assignmentId === assignment.id)
        .filter((splice) => !strandNumbers.length || strandNumbers.includes(splice.fromStrandNumber) || strandNumbers.includes(splice.toStrandNumber))
        .slice(0, 36);
      const service = servicesByAssignment.get(assignment.id)?.[0] || services[(index * 7) % Math.max(1, services.length)];
      const hardwarePort = pickHardwarePort(service, portsByService, hardware.ports, rng);
      const hardwareNode = hardwarePort ? nodeById.get(clean(hardwarePort.nodeId)) : undefined;
      const cableCoordinates = cableIds.map((cableId) => coordinatesForCable(cableById.get(cableId)!)).filter((coordinates) => coordinates.length > 1);
      const segments = buildSegments({
        assignment,
        service,
        aPanel,
        zPanel,
        cableIds,
        strandNumbers,
        relatedClosures,
        relatedSplices,
        hardwarePort,
        hardwareNode,
      });

      continuity.push({
        id: `STRAND-CONT-${String(continuity.length + 1).padStart(5, "0")}`,
        strandContinuityId: `STRAND-CONT-${String(continuity.length + 1).padStart(5, "0")}`,
        continuityName: `${assignment.assignmentName} strand continuity`,
        assignmentId: assignment.id,
        serviceId: service?.serviceId,
        circuitId: service?.circuitId || assignment.id,
        serviceName: service?.serviceName || assignment.assignmentName,
        serviceType: service?.serviceType || assignment.serviceType,
        status: statusFor(assignment.status, service?.operationalStatus),
        criticality: criticalityFor(assignment.serviceType, service?.criticality),
        aEndPatchPanelId: aPanel?.panel.id,
        aEndPatchPanelPortId: aPanel?.port?.id,
        zEndPatchPanelId: zPanel?.panel.id,
        zEndPatchPanelPortId: zPanel?.port?.id,
        terminatedDeviceId: clean(hardwareNode?.nodeId),
        terminatedDeviceName: clean(hardwareNode?.nodeName),
        terminatedDevicePortId: clean(hardwarePort?.portId),
        terminatedDevicePortName: clean(hardwarePort?.portName),
        cableIds,
        strandNumbers,
        spliceClosureIds: relatedClosures,
        fiberSpliceIds: relatedSplices.map((splice) => splice.id),
        routeMiles: round(cableCoordinates.reduce((sum, coordinates) => sum + lineMiles(coordinates), 0), 3),
        estimatedLossDb: round((assignment.estimatedLossDb || 0) + relatedSplices.reduce((sum, splice) => sum + (splice.lossDb || 0), 0), 2),
        continuitySegments: segments,
        mapCoordinates: cableCoordinates,
        synthetic: true,
        source: "synthetic-demo",
        notes: SYNTHETIC_NOTICE,
      });
    });

  await writeJson(STRAND_CONTINUITY_PATH, continuity);
  console.log(`Wrote ${continuity.length} synthetic strand continuity paths.`);
}

function buildSegments({
  assignment,
  service,
  aPanel,
  zPanel,
  cableIds,
  strandNumbers,
  relatedClosures,
  relatedSplices,
  hardwarePort,
  hardwareNode,
}: {
  assignment: FiberAssignment;
  service?: SyntheticService;
  aPanel?: { panel: PatchPanel; port?: PatchPanel["ports"][number] };
  zPanel?: { panel: PatchPanel; port?: PatchPanel["ports"][number] };
  cableIds: string[];
  strandNumbers: number[];
  relatedClosures: string[];
  relatedSplices: FiberSplice[];
  hardwarePort?: Record<string, unknown>;
  hardwareNode?: Record<string, unknown>;
}) {
  const segments: StrandContinuitySegment[] = [];
  const add = (segment: Omit<StrandContinuitySegment, "sequenceNumber">) => {
    segments.push({ sequenceNumber: segments.length + 1, ...segment });
  };
  if (aPanel) {
    add({ objectType: "patch_panel", objectId: aPanel.panel.id, label: `${aPanel.panel.name} A-end patch panel`, notes: "Synthetic substation panel handoff" });
    if (aPanel.port) add({ objectType: "patch_panel_port", objectId: aPanel.port.id, label: `Panel port ${aPanel.port.portNumber}`, strandNumbers });
  }
  cableIds.forEach((cableId) => {
    add({ objectType: "fiber_cable", objectId: cableId, label: `Cable ${cableId}`, cableId, strandNumbers });
    add({ objectType: "strand", objectId: `${cableId}:${strandNumbers.join("/")}`, label: `Strands ${strandNumbers.join(", ")}`, cableId, strandNumbers });
    relatedClosures.slice(0, 2).forEach((closureId) => add({ objectType: "splice_closure", objectId: closureId, label: `Splice closure ${closureId}`, cableId }));
  });
  relatedSplices.slice(0, 12).forEach((splice) => {
    add({
      objectType: "fiber_splice",
      objectId: splice.id,
      label: `${splice.fromCableId}:${splice.fromStrandNumber} to ${splice.toCableId}:${splice.toStrandNumber}`,
      cableId: splice.fromCableId,
      strandNumbers: [splice.fromStrandNumber, splice.toStrandNumber],
      lossDb: splice.lossDb,
    });
  });
  if (zPanel) {
    add({ objectType: "patch_panel", objectId: zPanel.panel.id, label: `${zPanel.panel.name} Z-end patch panel`, notes: "Synthetic terminal panel handoff" });
    if (zPanel.port) add({ objectType: "patch_panel_port", objectId: zPanel.port.id, label: `Panel port ${zPanel.port.portNumber}`, strandNumbers });
  }
  if (hardwareNode) add({ objectType: "telecom_device", objectId: clean(hardwareNode.nodeId), label: clean(hardwareNode.nodeName) || "Synthetic telecom node" });
  if (hardwarePort) add({ objectType: "device_port", objectId: clean(hardwarePort.portId), label: clean(hardwarePort.portName) || "Synthetic device port" });
  if (service) add({ objectType: "service", objectId: service.serviceId, label: service.serviceName, notes: service.serviceType });
  if (!segments.length) add({ objectType: "service", objectId: assignment.id, label: assignment.assignmentName });
  return segments;
}

function groupClosuresByCable(closures: SpliceClosureCollection) {
  const groups = new Map<string, SpliceClosureCollection["features"]>();
  closures.features.forEach((closure) => {
    closure.properties.cableIds.forEach((cableId) => {
      const existing = groups.get(cableId) || [];
      existing.push(closure);
      groups.set(cableId, existing);
    });
  });
  return groups;
}

function groupStrandsByCable(strands: FiberStrand[]) {
  const groups = new Map<string, FiberStrand[]>();
  strands.forEach((strand) => {
    const existing = groups.get(strand.cableId) || [];
    existing.push(strand);
    groups.set(strand.cableId, existing);
  });
  return groups;
}

function groupPanelsByCable(panels: PatchPanel[]) {
  const groups = new Map<string, PatchPanel[]>();
  panels.forEach((panel) => {
    panel.fiberCableIds.forEach((cableId) => {
      const existing = groups.get(cableId) || [];
      existing.push(panel);
      groups.set(cableId, existing);
    });
  });
  return groups;
}

function groupServicesByAssignment(services: SyntheticService[]) {
  const groups = new Map<string, SyntheticService[]>();
  services.forEach((service) => {
    [service.primaryPathAssignmentId, service.backupPathAssignmentId].filter(Boolean).forEach((assignmentId) => {
      const key = String(assignmentId);
      const existing = groups.get(key) || [];
      existing.push(service);
      groups.set(key, existing);
    });
  });
  return groups;
}

function groupHardwarePortsByService(hardware: TelecomHardwareData) {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  hardware.ports.forEach((port) => {
    const serviceId = clean(port.assignedServiceId);
    if (!serviceId) return;
    const existing = groups.get(serviceId) || [];
    existing.push(port);
    groups.set(serviceId, existing);
  });
  return groups;
}

function pickPanelForAssignment(panels: PatchPanel[], assignmentId: string, last: boolean) {
  const matches = panels
    .map((panel) => ({ panel, port: panel.ports.find((port) => port.assignmentId === assignmentId) }))
    .filter((item) => item.port);
  if (matches.length) return last ? matches[matches.length - 1] : matches[0];
  const panel = last ? panels[panels.length - 1] : panels[0];
  return panel ? { panel, port: panel.ports[0] } : undefined;
}

function pickHardwarePort(service: SyntheticService | undefined, portsByService: Map<string, Array<Record<string, unknown>>>, ports: Array<Record<string, unknown>>, rng: () => number) {
  const direct = service ? portsByService.get(service.serviceId)?.[0] : undefined;
  if (direct) return direct;
  const assigned = ports.filter((port) => clean(port.status) === "assigned");
  return assigned[Math.floor(rng() * Math.max(1, assigned.length))] || ports[0];
}

function coordinatesForCable(feature: OpgwCableCollection["features"][number]) {
  if (feature.geometry.type === "LineString") return feature.geometry.coordinates;
  return feature.geometry.coordinates.flat();
}

function lineMiles(coordinates: Coordinate[]) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) total += distanceMiles(coordinates[index - 1], coordinates[index]);
  return total;
}

function statusFor(assignmentStatus: FiberAssignment["status"], serviceStatus?: SyntheticService["operationalStatus"]): StrandContinuityRecord["status"] {
  if (serviceStatus === "broken_demo") return "broken_demo";
  if (assignmentStatus === "active") return "active_synthetic";
  if (assignmentStatus === "planned") return "planned";
  if (assignmentStatus === "proposed") return "proposed";
  if (assignmentStatus === "reserved") return "reserved";
  return serviceStatus === "planned" || serviceStatus === "proposed" ? serviceStatus : "active_synthetic";
}

function criticalityFor(serviceType: string, serviceCriticality?: SyntheticService["criticality"]): StrandContinuityRecord["criticality"] {
  if (serviceCriticality) return serviceCriticality;
  const value = serviceType.toLowerCase();
  if (value.includes("protection") || value.includes("c37") || value.includes("dtt") || value.includes("87l")) return "critical";
  if (value.includes("scada") || value.includes("timing")) return "high";
  if (value.includes("spare")) return "low";
  return "normal";
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function clean(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

void main();
