import { traceSyntheticService, type FiberContinuityData } from "@/lib/opgw/continuityEngine";
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
} from "@/lib/types/assets";

export type OpgwCableContinuityView = {
  cable: OpgwCableFeature;
  selectedCableSection?: OpgwCableSectionFeature;
  routeId: string;
  cableSections: OpgwCableSectionFeature[];
  spanSegments: OpgwSpanSegmentFeature[];
  splicePoints: OpgwSplicePointFeature[];
  spliceClosures: SpliceClosureFeature[];
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
  const selectedCableSection = data.opgwCableSections.find((section) => section.properties.cableId === normalizedId || section.properties.cableSectionId === normalizedId);
  const cable = selectedCableSection
    ? data.opgwCables.find((feature) => feature.properties.id === selectedCableSection.properties.parentRouteCableId || opgwRouteIdForCable(feature) === selectedCableSection.properties.opgwRouteId)
    : data.opgwCables.find((feature) => feature.properties.id === normalizedId || feature.properties.cableName === normalizedId);
  if (!cable) return null;

  const routeId = selectedCableSection?.properties.opgwRouteId || opgwRouteIdForCable(cable);
  const cableSections = (selectedCableSection ? [selectedCableSection] : data.opgwCableSections.filter((section) => section.properties.opgwRouteId === routeId))
    .sort((a, b) => a.properties.cableSectionId.localeCompare(b.properties.cableSectionId, undefined, { numeric: true }));
  const spanSegments = data.opgwSpanSegments
    .filter((span) => selectedCableSection ? span.properties.cableSectionId === selectedCableSection.properties.cableSectionId : span.properties.opgwRouteId === routeId)
    .sort((a, b) => a.properties.spanSegmentId.localeCompare(b.properties.spanSegmentId, undefined, { numeric: true }));
  const splicePoints = data.opgwSplicePoints
    .filter((point) => selectedCableSection
      ? point.properties.splicePointId === selectedCableSection.properties.fromSplicePointId || point.properties.splicePointId === selectedCableSection.properties.toSplicePointId
      : point.properties.opgwRouteId === routeId)
    .sort((a, b) => structureSequence(a.properties.structureNumber) - structureSequence(b.properties.structureNumber));

  const closureIds = new Set<string>([
    ...cable.properties.connectedSpliceClosureIds,
    ...splicePoints.map((point) => point.properties.closureId).filter(Boolean) as string[],
  ]);
  const sectionIds = new Set(cableSections.map((section) => section.properties.cableSectionId));
  const sectionCableIds = new Set(cableSections.flatMap((section) => [section.properties.cableId, section.properties.cableSectionId]));
  const spliceClosures = data.spliceClosures.filter((closure) => closureIds.has(closure.properties.id) || closure.properties.cableIds.includes(cable.properties.id) || closure.properties.cableIds.some((id) => sectionCableIds.has(id)));
  spliceClosures.forEach((closure) => closureIds.add(closure.properties.id));

  const fiberAssignments = data.fiberAssignments.filter((assignment) => assignment.cableIds.includes(cable.properties.id) || assignment.cableIds.some((id) => sectionCableIds.has(id)));
  const assignmentIds = new Set(fiberAssignments.map((assignment) => assignment.id));
  const fiberSplices = data.fiberSplices.filter((splice) => {
    if (closureIds.has(splice.spliceClosureId)) return true;
    if (splice.fromCableId === cable.properties.id || splice.toCableId === cable.properties.id) return true;
    if (sectionIds.has(splice.fromCableId) || sectionIds.has(splice.toCableId)) return true;
    return Boolean(splice.assignmentId && assignmentIds.has(splice.assignmentId));
  });
  const fiberStrands = (data.fiberStrands || []).filter((strand) => strand.cableId === cable.properties.id || sectionCableIds.has(strand.cableId));
  const patchPanels = data.patchPanels.filter((panel) => panel.fiberCableIds.includes(cable.properties.id) || panel.fiberCableIds.some((id) => sectionCableIds.has(id)));
  const splicePointIds = new Set(splicePoints.map((point) => point.properties.splicePointId));

  const services = data.syntheticServices.filter((service) => {
    if (service.continuityCableIds?.some((id) => sectionCableIds.has(id))) return true;
    if (service.continuityCableIds?.includes(cable.properties.id)) return true;
    if (service.continuitySpliceClosureIds?.some((id) => closureIds.has(id))) return true;
    if (service.continuitySplicePointIds?.some((id) => splicePointIds.has(id))) return true;
    if (service.primaryPathAssignmentId && assignmentIds.has(service.primaryPathAssignmentId)) return true;
    if (service.backupPathAssignmentId && assignmentIds.has(service.backupPathAssignmentId)) return true;
    return false;
  });
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
    selectedCableSection,
    routeId,
    cableSections,
    spanSegments,
    splicePoints,
    spliceClosures,
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
