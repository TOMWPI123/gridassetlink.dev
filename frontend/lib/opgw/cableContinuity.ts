import { getFiberContinuityIndex, traceSyntheticService, type FiberContinuityData } from "@/lib/opgw/continuityEngine";
import type {
  FiberAssignment,
  FiberContinuityPath,
  FiberSplice,
  FiberStrand,
  OpgwCableFeature,
  OpgwCableSectionFeature,
  OpgwSpanSegmentFeature,
  OpgwSplicePointFeature,
  PatchPanel,
  SpliceClosureFeature,
  SyntheticService,
  TransmissionStructureFeature,
} from "@/lib/types/assets";

export type OpgwCableContinuityView = {
  cable: OpgwCableFeature;
  routeId: string;
  cableSections: OpgwCableSectionFeature[];
  spanSegments: OpgwSpanSegmentFeature[];
  splicePoints: OpgwSplicePointFeature[];
  spliceClosures: SpliceClosureFeature[];
  structures: TransmissionStructureFeature[];
  fiberSplices: FiberSplice[];
  fiberStrands: FiberStrand[];
  fiberAssignments: FiberAssignment[];
  patchPanels: PatchPanel[];
  services: SyntheticService[];
  continuityPaths: FiberContinuityPath[];
  totals: {
    routeMiles: number;
    structures: number;
    spans: number;
    cableSections: number;
    splicePoints: number;
    spliceClosures: number;
    spliceRows: number;
    patchPanels: number;
    services: number;
    assignments: number;
    totalStrands: number;
    availableStrands: number;
    assignedStrands: number;
    reservedStrands: number;
    estimatedLossDb: number;
  };
  warnings: string[];
};

export function buildOpgwCableContinuityView(cableId: string, data: FiberContinuityData): OpgwCableContinuityView | null {
  const normalizedId = decodeURIComponent(cableId);
  const index = getFiberContinuityIndex(data);
  const cable = index.cableById.get(normalizedId) || data.opgwCables.find((feature) => feature.properties.cableName === normalizedId);
  if (!cable) return null;

  const routeId = index.routeIdByCableId.get(cable.properties.id) || opgwRouteIdForCable(cable);
  const cableSections = [...(index.sectionsByRouteId.get(routeId) || [])];
  const spanSegments = cableSections.flatMap((section) => index.spanSegmentsBySection.get(section.properties.cableSectionId) || []);
  const splicePoints = [...(index.splicePointsByRouteId.get(routeId) || [])];
  const cableStructureIds = new Set([
    ...cable.properties.structureIds,
    ...cableSections.flatMap((section) => [section.properties.fromStructureId, section.properties.toStructureId]),
    ...spanSegments.flatMap((span) => [span.properties.fromStructureId, span.properties.toStructureId]),
    ...splicePoints.map((point) => point.properties.structureId),
  ]);
  const structures = (data.transmissionStructures || [])
    .filter((structure) => cableStructureIds.has(structure.properties.id))
    .sort((a, b) => {
      const bySequence = Number(a.properties.sequenceIndex || 0) - Number(b.properties.sequenceIndex || 0);
      return bySequence || a.properties.structureNumber.localeCompare(b.properties.structureNumber, undefined, { numeric: true });
    });

  const closureIds = new Set<string>([
    ...cable.properties.connectedSpliceClosureIds,
    ...splicePoints.map((point) => point.properties.closureId).filter(Boolean) as string[],
  ]);
  const sectionIds = new Set(cableSections.map((section) => section.properties.cableSectionId));
  const spliceClosures = uniqueBy([
    ...Array.from(closureIds).map((closureId) => index.spliceClosureById.get(closureId)).filter(Boolean) as SpliceClosureFeature[],
    ...data.spliceClosures.filter((closure) => closure.properties.cableIds.includes(cable.properties.id)),
  ], (closure) => closure.properties.id);
  spliceClosures.forEach((closure) => closureIds.add(closure.properties.id));

  const fiberAssignments = index.assignmentsByCableId.get(cable.properties.id) || [];
  const assignmentIds = new Set(fiberAssignments.map((assignment) => assignment.id));
  const fiberSplices = uniqueBy([
    ...Array.from(closureIds).flatMap((closureId) => index.splicesByClosureId.get(closureId) || []),
    ...(index.splicesByCableId.get(cable.properties.id) || []),
    ...Array.from(sectionIds).flatMap((sectionId) => index.splicesByCableId.get(sectionId) || []),
    ...Array.from(assignmentIds).flatMap((assignmentId) => index.splicesByAssignmentId.get(assignmentId) || []),
  ], (splice) => splice.id);
  const fiberStrands = index.fiberStrandsByCableId.get(cable.properties.id) || [];
  const patchPanels = index.patchPanelsByCableId.get(cable.properties.id) || [];
  const splicePointIds = new Set(splicePoints.map((point) => point.properties.splicePointId));

  const serviceMap = new Map<string, SyntheticService>();
  addServices(index.servicesByCableId.get(cable.properties.id), serviceMap);
  closureIds.forEach((closureId) => addServices(index.servicesBySpliceClosureId.get(closureId), serviceMap));
  splicePointIds.forEach((pointId) => addServices(index.servicesBySplicePointId.get(pointId), serviceMap));
  assignmentIds.forEach((assignmentId) => addServices(index.servicesByAssignmentId.get(assignmentId), serviceMap));
  const services = Array.from(serviceMap.values());
  const continuityPaths = services.map((service) => traceSyntheticService(service, data));

  const availableStrands = fiberStrands.length
    ? fiberStrands.filter((strand) => strand.status === "available" || strand.status === "dark" || strand.status === "spare").length
    : Math.max(...cableSections.map((section) => section.properties.availableStrands), 0);
  const assignedStrands = fiberStrands.length
    ? fiberStrands.filter((strand) => strand.status === "assigned").length
    : cableSections.reduce((total, section) => total + section.properties.assignedStrands, 0);
  const reservedStrands = fiberStrands.length
    ? fiberStrands.filter((strand) => strand.status === "reserved").length
    : cableSections.reduce((total, section) => total + section.properties.reservedStrands, 0);
  const routeMiles = Number((cableSections.reduce((total, section) => total + section.properties.routeMiles, 0) || cable.properties.routeMiles).toFixed(3));
  const estimatedLossDb = Number((routeMiles * 0.25 + fiberSplices.reduce((total, splice) => total + (splice.lossDb || 0), 0) + patchPanels.length * 0.5).toFixed(3));

  return {
    cable,
    routeId,
    cableSections,
    spanSegments,
    splicePoints,
    spliceClosures,
    structures,
    fiberSplices,
    fiberStrands,
    fiberAssignments,
    patchPanels,
    services,
    continuityPaths,
    totals: {
      routeMiles,
      structures: cable.properties.structureIds.length,
      spans: spanSegments.length,
      cableSections: cableSections.length,
      splicePoints: splicePoints.length,
      spliceClosures: spliceClosures.length,
      spliceRows: fiberSplices.length,
      patchPanels: patchPanels.length,
      services: services.length,
      assignments: fiberAssignments.length,
      totalStrands: fiberStrands.length || cable.properties.fiberCount,
      availableStrands,
      assignedStrands,
      reservedStrands,
      estimatedLossDb,
    },
    warnings: buildCableWarnings(cable, fiberSplices, services, continuityPaths),
  };
}

export function opgwRouteIdForCable(cable: OpgwCableFeature) {
  return `OPGW-${cable.properties.lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO"}`;
}

function structureSequence(structureNumber: string) {
  const match = structureNumber.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function buildCableWarnings(
  cable: OpgwCableFeature,
  splices: FiberSplice[],
  services: SyntheticService[],
  paths: FiberContinuityPath[],
) {
  const warnings = [
    "Synthetic OPGW cable continuity only. This does not prove real OPGW, private fiber, SCADA, relay, protection, or telecom routing.",
  ];
  if (cable.properties.status !== "planned") warnings.push("Cable is a synthetic planning assumption unless converted through engineering/as-built verification.");
  if (!splices.length) warnings.push("No splice matrix rows were generated for this cable; continuity should be reviewed before planning service use.");
  if (services.some((service) => service.layerType === "proposed" || service.operationalStatus === "proposed")) warnings.push("At least one carried service is proposed and not committed to the existing layer.");
  if (paths.some((path) => path.hasBrokenContinuity)) warnings.push("At least one synthetic service trace has broken continuity.");
  return warnings;
}

function addServices(services: SyntheticService[] | undefined, map: Map<string, SyntheticService>) {
  services?.forEach((service) => map.set(service.serviceId, service));
}

function uniqueBy<T>(values: T[], keyForValue: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyForValue(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
