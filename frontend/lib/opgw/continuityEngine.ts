import type {
  FiberAssignment,
  FiberContinuityPath,
  FiberContinuityPathSegment,
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

export type FiberContinuityData = {
  opgwCables: OpgwCableFeature[];
  opgwCableSections: OpgwCableSectionFeature[];
  opgwSpanSegments: OpgwSpanSegmentFeature[];
  opgwSplicePoints: OpgwSplicePointFeature[];
  spliceClosures: SpliceClosureFeature[];
  fiberSplices: FiberSplice[];
  fiberStrands?: FiberStrand[];
  fiberAssignments: FiberAssignment[];
  patchPanels: PatchPanel[];
  syntheticServices: SyntheticService[];
  transmissionStructures?: TransmissionStructureFeature[];
};

export type ConnectedCableSection = {
  cableSectionId: string;
  transmissionLineId: string;
  opgwRouteId: string;
  fromStructure: string;
  toStructure: string;
  direction: "incoming" | "outgoing" | "branch" | "terminated";
  fiberCount: number;
  availableStrands: number;
  assignedStrands: number;
  reservedStrands: number;
  cableStatus: string;
  layer: "existing" | "proposed";
};

export type SpliceManagerViewModel = {
  splicePoint: OpgwSplicePointFeature;
  closure?: SpliceClosureFeature;
  connectedCableSections: ConnectedCableSection[];
  existingSplices: FiberSplice[];
  proposedSplices: FiberSplice[];
  services: SyntheticService[];
  continuityPaths: FiberContinuityPath[];
  outageImpact: Array<{ serviceId: string; serviceName: string; criticality: string; impact: string }>;
  warnings: string[];
  auditHistory: Array<{ eventId: string; eventType: string; timestamp: string; notes: string }>;
};

export type SpliceNodeMetrics = {
  splicePointId: string;
  spliceClosureId?: string;
  structureId?: string;
  transmissionLineId?: string;
  opgwRouteId?: string;
  locationType: string;
  fiberCount: number;
  incomingCableSections: number;
  outgoingCableSections: number;
  activeSyntheticServices: number;
  proposedSyntheticServices: number;
  status: string;
};

export function buildSpliceManagerView(splicePointId: string, data: FiberContinuityData): SpliceManagerViewModel | null {
  const normalizedId = decodeURIComponent(splicePointId);
  const closureToPoint = buildClosureToSplicePointId(data.opgwSplicePoints);
  const directPoint = data.opgwSplicePoints.find((feature) => feature.properties.splicePointId === normalizedId);
  const closurePointId = closureToPoint.get(normalizedId);
  const splicePoint = directPoint || data.opgwSplicePoints.find((feature) => feature.properties.splicePointId === closurePointId);
  if (!splicePoint) return null;

  const closure = splicePoint.properties.closureId
    ? data.spliceClosures.find((feature) => feature.properties.id === splicePoint.properties.closureId)
    : undefined;
  const closureId = closure?.properties.id || splicePoint.properties.closureId || "";
  const allSplices = closureId ? data.fiberSplices.filter((splice) => splice.spliceClosureId === closureId) : [];
  const services = servicesForSplicePoint(splicePoint.properties.splicePointId, data);
  const connectedCableSections = connectedSectionsForSplicePoint(splicePoint.properties.splicePointId, data);
  const continuityPaths = services.map((service) => traceSyntheticService(service, data, splicePoint.properties.splicePointId));
  const warnings = buildSpliceWarnings(splicePoint.properties.splicePointId, allSplices, continuityPaths);
  return {
    splicePoint,
    closure,
    connectedCableSections,
    existingSplices: allSplices.filter((splice) => splice.status === "existing"),
    proposedSplices: allSplices.filter((splice) => splice.status !== "existing"),
    services,
    continuityPaths,
    outageImpact: services.map((service) => ({
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      criticality: service.criticality,
      impact: `${service.serviceName} would require continuity review if ${splicePoint.properties.splicePointId} or its connected cable section failed.`,
    })),
    warnings,
    auditHistory: [
      { eventId: `${splicePoint.properties.splicePointId}-AUD-001`, eventType: "synthetic_matrix_generated", timestamp: "2026-06-07T00:00:00Z", notes: "Generated from synthetic/demo OPGW splice data." },
      { eventId: `${splicePoint.properties.splicePointId}-AUD-002`, eventType: "proposed_layer_available", timestamp: "2026-06-07T00:00:00Z", notes: "Proposed edits are local demo edits until committed by a future backend workflow." },
    ],
  };
}

export function buildSpliceNodeMetrics(data: FiberContinuityData) {
  const metrics = new Map<string, SpliceNodeMetrics>();
  data.opgwSplicePoints.forEach((splicePoint) => {
    const connectedSections = connectedSectionsForSplicePoint(splicePoint.properties.splicePointId, data);
    const services = servicesForSplicePoint(splicePoint.properties.splicePointId, data);
    metrics.set(splicePoint.properties.splicePointId, {
      splicePointId: splicePoint.properties.splicePointId,
      spliceClosureId: splicePoint.properties.closureId,
      structureId: splicePoint.properties.structureId,
      transmissionLineId: splicePoint.properties.transmissionLineId,
      opgwRouteId: splicePoint.properties.opgwRouteId,
      locationType: locationTypeForSplice(splicePoint.properties.spliceType),
      fiberCount: Math.max(...connectedSections.map((section) => section.fiberCount), 0),
      incomingCableSections: connectedSections.filter((section) => section.direction === "incoming").length,
      outgoingCableSections: connectedSections.filter((section) => section.direction === "outgoing").length,
      activeSyntheticServices: services.filter((service) => service.layerType === "existing" && service.operationalStatus !== "broken_demo").length,
      proposedSyntheticServices: services.filter((service) => service.layerType === "proposed" || service.operationalStatus === "proposed").length,
      status: splicePoint.properties.status === "synthetic_assumption" ? "synthetic_existing" : splicePoint.properties.status,
    });
  });
  return metrics;
}

export function servicesForSplicePoint(splicePointId: string, data: FiberContinuityData) {
  const point = data.opgwSplicePoints.find((feature) => feature.properties.splicePointId === splicePointId);
  const closureId = point?.properties.closureId;
  const sectionIds = new Set(point?.properties.associatedCableSectionIds || []);
  const cableIds = new Set(
    data.opgwCableSections
      .filter((section) => sectionIds.has(section.properties.cableSectionId))
      .map((section) => routeCableIdsForSection(section, data.opgwCables))
      .flat(),
  );

  return data.syntheticServices.filter((service) => {
    if (service.continuitySplicePointIds?.includes(splicePointId)) return true;
    if (closureId && service.continuitySpliceClosureIds?.includes(closureId)) return true;
    if (service.continuityCableIds?.some((cableId) => cableIds.has(cableId))) return true;
    const assignment = service.primaryPathAssignmentId ? data.fiberAssignments.find((item) => item.id === service.primaryPathAssignmentId) : undefined;
    if (assignment?.spliceIds.some((spliceId) => {
      const splice = data.fiberSplices.find((row) => row.id === spliceId);
      return splice?.spliceClosureId === closureId;
    })) return true;
    return false;
  });
}

export function connectedSectionsForSplicePoint(splicePointId: string, data: FiberContinuityData): ConnectedCableSection[] {
  return data.opgwCableSections
    .filter((section) => section.properties.fromSplicePointId === splicePointId || section.properties.toSplicePointId === splicePointId)
    .map((section) => ({
      cableSectionId: section.properties.cableSectionId,
      transmissionLineId: section.properties.transmissionLineId,
      opgwRouteId: section.properties.opgwRouteId,
      fromStructure: section.properties.fromStructureNumber,
      toStructure: section.properties.toStructureNumber,
      direction: section.properties.fromSplicePointId === splicePointId ? "outgoing" : "incoming",
      fiberCount: section.properties.fiberCount,
      availableStrands: section.properties.availableStrands,
      assignedStrands: section.properties.assignedStrands,
      reservedStrands: section.properties.reservedStrands,
      cableStatus: section.properties.installStatus,
      layer: section.properties.installStatus === "proposed" || section.properties.installStatus === "planned" ? "proposed" : "existing",
    }));
}

export function traceSyntheticService(service: SyntheticService, data: FiberContinuityData, selectedSplicePointId?: string): FiberContinuityPath {
  const assignment = service.primaryPathAssignmentId ? data.fiberAssignments.find((item) => item.id === service.primaryPathAssignmentId) : undefined;
  const continuityCableIds = service.continuityCableIds?.length ? service.continuityCableIds : assignment?.cableIds || [];
  const sections = data.opgwCableSections.filter((section) => routeCableIdsForSection(section, data.opgwCables).some((cableId) => continuityCableIds.includes(cableId)));
  const splicePoints = data.opgwSplicePoints.filter((point) => {
    if (service.continuitySplicePointIds?.includes(point.properties.splicePointId)) return true;
    if (service.continuitySpliceClosureIds?.includes(point.properties.closureId || "")) return true;
    return sections.some((section) => section.properties.fromSplicePointId === point.properties.splicePointId || section.properties.toSplicePointId === point.properties.splicePointId);
  });
  const splices = data.fiberSplices.filter((splice) => {
    if (assignment?.spliceIds.includes(splice.id)) return true;
    return service.continuitySpliceClosureIds?.includes(splice.spliceClosureId);
  });
  const transmissionLines = new Set(sections.map((section) => section.properties.transmissionLineId));
  const patchPanels = [service.endpointAPatchPanelId, service.endpointZPatchPanelId].filter(Boolean) as string[];
  const warningSummary = warningsForService(service, selectedSplicePointId, sections, splices);
  const segments: FiberContinuityPathSegment[] = [];
  const pathId = `CONT-${service.serviceId}`;

  patchPanels.slice(0, 1).forEach((patchPanelId) => {
    segments.push(makeSegment(pathId, segments.length + 1, "patch_panel", patchPanelId, { patchPanelId, segmentStatus: service.layerType === "proposed" ? "proposed" : "existing" }));
  });
  sections.slice(0, 30).forEach((section) => {
    segments.push(makeSegment(pathId, segments.length + 1, "cable_section", section.properties.cableSectionId, {
      transmissionLineId: section.properties.transmissionLineId,
      opgwRouteId: section.properties.opgwRouteId,
      cableSectionId: section.properties.cableSectionId,
      segmentStatus: section.properties.installStatus === "proposed" || section.properties.installStatus === "planned" ? "planned" : "existing",
      estimatedLossDb: section.properties.routeMiles * 0.25,
      notes: `${section.properties.fromStructureNumber} to ${section.properties.toStructureNumber}`,
    }));
    const point = splicePoints.find((item) => item.properties.splicePointId === section.properties.toSplicePointId);
    if (point) {
      segments.push(makeSegment(pathId, segments.length + 1, "splice_point", point.properties.splicePointId, {
        transmissionLineId: point.properties.transmissionLineId,
        opgwRouteId: point.properties.opgwRouteId,
        splicePointId: point.properties.splicePointId,
        segmentStatus: point.properties.splicePointId === selectedSplicePointId ? "warning" : service.layerType === "proposed" ? "proposed" : "existing",
        notes: point.properties.closureId ? `Closure ${point.properties.closureId}` : "Synthetic splice point",
      }));
    }
  });
  splices.slice(0, 20).forEach((splice) => {
    segments.push(makeSegment(pathId, segments.length + 1, "splice_connection", splice.id, {
      spliceConnectionId: splice.id,
      strandNumber: splice.fromStrandNumber,
      segmentStatus: splice.status === "proposed" ? "proposed" : splice.status === "planned" ? "planned" : splice.status === "faulted" ? "broken" : "existing",
      estimatedLossDb: splice.lossDb || 0,
      notes: `${splice.fromCableId}/${splice.fromStrandNumber} to ${splice.toCableId}/${splice.toStrandNumber}`,
    }));
  });
  patchPanels.slice(1, 2).forEach((patchPanelId) => {
    segments.push(makeSegment(pathId, segments.length + 1, "patch_panel", patchPanelId, { patchPanelId, segmentStatus: service.layerType === "proposed" ? "proposed" : "existing" }));
  });

  const totalRouteMiles = sections.reduce((sum, section) => sum + section.properties.routeMiles, 0) || assignment?.estimatedDistanceMiles || 0;
  const totalEstimatedLossDb = Number((totalRouteMiles * 0.25 + splices.reduce((sum, splice) => sum + (splice.lossDb || 0), 0) + patchPanels.length * 0.5).toFixed(3));
  const hasBrokenContinuity = service.continuityStatus === "broken" || warningSummary.some((warning) => warning.toLowerCase().includes("break"));
  return {
    continuityPathId: pathId,
    serviceId: service.serviceId,
    assignmentId: service.primaryPathAssignmentId,
    layerType: service.layerType,
    endpointASiteId: service.fromSiteId,
    endpointZSiteId: service.toSiteId,
    pathStatus: hasBrokenContinuity ? "broken" : service.layerType === "proposed" ? "proposed" : warningSummary.length ? "warning" : "complete",
    totalRouteMiles: Number(totalRouteMiles.toFixed(3)),
    totalCableSections: sections.length,
    totalTransmissionLines: transmissionLines.size,
    totalSplicePoints: splicePoints.length,
    totalPatchPanels: patchPanels.length,
    totalEstimatedLossDb,
    hasBrokenContinuity,
    hasFaultedSection: sections.some((section) => section.properties.installStatus === "faulted") || splices.some((splice) => splice.status === "faulted"),
    hasProposedChanges: service.layerType === "proposed" || splices.some((splice) => splice.status === "planned" || splice.status === "proposed"),
    syntheticFlag: true,
    warningSummary,
    segments,
    notes: "Synthetic demo continuity only and not authoritative for operations.",
  };
}

export function buildClosureToSplicePointId(splicePoints: OpgwSplicePointFeature[]) {
  const map = new Map<string, string>();
  splicePoints.forEach((splicePoint) => {
    if (splicePoint.properties.closureId) map.set(splicePoint.properties.closureId, splicePoint.properties.splicePointId);
  });
  return map;
}

function routeCableIdsForSection(section: OpgwCableSectionFeature, cables: OpgwCableFeature[]) {
  return cables
    .filter((cable) => opgwRouteIdForCable(cable) === section.properties.opgwRouteId)
    .map((cable) => cable.properties.id);
}

function opgwRouteIdForCable(cable: OpgwCableFeature) {
  return `OPGW-${cable.properties.lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO"}`;
}

function warningsForService(service: SyntheticService, selectedSplicePointId: string | undefined, sections: OpgwCableSectionFeature[], splices: FiberSplice[]) {
  const warnings: string[] = ["This is synthetic demo continuity only and is not authoritative."];
  if (service.continuityStatus === "broken") warnings.push(`Continuity breaks on ${service.serviceId}; proposed splice review is required.`);
  if (service.continuityStatus === "proposed_fix") warnings.push("Proposed splice changes repair a synthetic broken path preview.");
  if (service.layerType === "proposed") warnings.push("Proposed path is not committed to the existing continuity layer.");
  if (sections.length > 1) warnings.push(`Service ${service.serviceId} crosses ${new Set(sections.map((section) => section.properties.transmissionLineId)).size} transmission lines.`);
  if (selectedSplicePointId) warnings.push(`Selected splice point ${selectedSplicePointId} is on this synthetic trace.`);
  if (!splices.length && service.continuityStatus === "broken") warnings.push("Strand enters this demo path but has no outgoing synthetic splice record.");
  return warnings;
}

function buildSpliceWarnings(splicePointId: string, splices: FiberSplice[], paths: FiberContinuityPath[]) {
  const warnings = ["Synthetic splice data only. Public transmission lines do not prove actual OPGW or services."];
  if (!splices.length) warnings.push(`Continuity breaks at splice point ${splicePointId}: no splice rows are available.`);
  if (splices.some((splice) => splice.status === "faulted")) warnings.push(`Faulted splice row present at ${splicePointId}.`);
  if (paths.some((path) => path.hasBrokenContinuity)) warnings.push(`At least one synthetic service has broken continuity at or near ${splicePointId}.`);
  if (paths.some((path) => path.hasProposedChanges)) warnings.push("Proposed splice changes affect at least one service route.");
  return warnings;
}

function locationTypeForSplice(spliceType: OpgwSplicePointFeature["properties"]["spliceType"]) {
  if (spliceType === "substation_deadend") return "substation dead-end";
  if (spliceType === "junction") return "line junction";
  if (spliceType === "transition") return "transition point";
  if (spliceType === "termination") return "patch panel entrance";
  return "transmission structure";
}

function makeSegment(
  continuityPathId: string,
  sequenceNumber: number,
  objectType: FiberContinuityPathSegment["objectType"],
  objectId: string,
  values: Partial<FiberContinuityPathSegment>,
): FiberContinuityPathSegment {
  return {
    pathSegmentId: `${continuityPathId}-SEG-${String(sequenceNumber).padStart(3, "0")}`,
    continuityPathId,
    sequenceNumber,
    objectType,
    objectId,
    segmentStatus: "existing",
    ...values,
  };
}
