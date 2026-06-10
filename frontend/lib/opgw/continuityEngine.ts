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

export type SpliceManagerHeaderSummary = {
  splicePointId: string;
  spliceClosureId?: string;
  structureId: string;
  structureNumber: string;
  transmissionLineId: string;
  opgwRouteId: string;
  region: string;
  voltageClass: string;
  latitude: number;
  longitude: number;
  closureType: string;
  trayCount: number;
  fiberCapacity: number;
  spliceCapacity: number;
  existingProposedStatus: string;
  sourceLabel: string;
};

export type SpliceManagerViewModel = {
  header: SpliceManagerHeaderSummary;
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
  const fiberCapacity = Math.max(...connectedCableSections.map((section) => section.fiberCount), matrixFiberCapacity(allSplices), 24);
  return {
    header: {
      splicePointId: splicePoint.properties.splicePointId,
      spliceClosureId: closureId || undefined,
      structureId: splicePoint.properties.structureId,
      structureNumber: splicePoint.properties.structureNumber,
      transmissionLineId: splicePoint.properties.transmissionLineId,
      opgwRouteId: splicePoint.properties.opgwRouteId,
      region: "ISO New England synthetic demo",
      voltageClass: voltageClassForSplicePoint(splicePoint, data),
      latitude: splicePoint.geometry.coordinates[1],
      longitude: splicePoint.geometry.coordinates[0],
      closureType: closure?.properties.closureType || splicePoint.properties.spliceType,
      trayCount: Math.max(1, Math.ceil(fiberCapacity / 24)),
      fiberCapacity,
      spliceCapacity: Math.max(fiberCapacity, allSplices.length),
      existingProposedStatus: splicePoint.properties.status === "synthetic_assumption" ? "synthetic_existing" : splicePoint.properties.status,
      sourceLabel: closure?.properties.source || "synthetic-demo",
    },
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

function voltageClassForSplicePoint(splicePoint: OpgwSplicePointFeature, data: FiberContinuityData) {
  const structure = data.transmissionStructures?.find((feature) => feature.properties.id === splicePoint.properties.structureId);
  if (structure?.properties.voltageKv) return `${structure.properties.voltageKv} kV`;
  return "public corridor reference";
}

function matrixFiberCapacity(rows: FiberSplice[]) {
  return Math.max(0, ...rows.map((row) => Math.max(row.fromStrandNumber, row.toStrandNumber)));
}

export type ContinuityTraceLayerType = "existing" | "proposed" | "compare";

export type ContinuityTraceInput = {
  serviceId?: string;
  assignmentId?: string;
  strandId?: string;
  cableSectionId?: string;
  spliceConnectionId?: string;
  splicePointId?: string;
  spliceClosureId?: string;
  layerType?: ContinuityTraceLayerType;
};

export function resolveContinuityTraceServices(input: ContinuityTraceInput, data: FiberContinuityData) {
  const matched = new Map<string, SyntheticService>();
  const add = (service: SyntheticService | undefined) => {
    if (service) matched.set(service.serviceId, service);
  };

  if (input.serviceId) add(data.syntheticServices.find((service) => service.serviceId === decodeURIComponent(input.serviceId || "")));
  if (input.assignmentId) {
    const assignmentId = decodeURIComponent(input.assignmentId);
    data.syntheticServices
      .filter((service) => service.primaryPathAssignmentId === assignmentId || service.backupPathAssignmentId === assignmentId)
      .forEach(add);
  }
  if (input.strandId) {
    const strandId = decodeURIComponent(input.strandId);
    const strand = (data.fiberStrands || []).find((item) => item.id === strandId);
    if (strand?.assignmentId) {
      data.syntheticServices
        .filter((service) => service.primaryPathAssignmentId === strand.assignmentId || service.backupPathAssignmentId === strand.assignmentId)
        .forEach(add);
    }
    if (strand?.cableId) addServicesForTraceCableIds(new Set([strand.cableId]), data.syntheticServices, matched);
  }
  if (input.cableSectionId) {
    const cableSectionId = decodeURIComponent(input.cableSectionId);
    const section = data.opgwCableSections.find((item) => item.properties.cableSectionId === cableSectionId);
    if (section) addServicesForTraceCableSection(section.properties.opgwRouteId, data, matched);
  }
  if (input.spliceConnectionId) {
    const spliceConnectionId = decodeURIComponent(input.spliceConnectionId);
    const spliceConnection = data.fiberSplices.find((splice) => splice.id === spliceConnectionId);
    if (spliceConnection) {
      if (spliceConnection.assignmentId) {
        data.syntheticServices
          .filter((service) => service.primaryPathAssignmentId === spliceConnection.assignmentId || service.backupPathAssignmentId === spliceConnection.assignmentId)
          .forEach(add);
      }
      data.syntheticServices
        .filter((service) => {
          if (service.continuitySpliceClosureIds?.includes(spliceConnection.spliceClosureId)) return true;
          if (service.continuityCableIds?.includes(spliceConnection.fromCableId) || service.continuityCableIds?.includes(spliceConnection.toCableId)) return true;
          return false;
        })
        .forEach(add);
    }
  }
  if (input.splicePointId) buildSpliceManagerView(input.splicePointId, data)?.services.forEach(add);
  if (input.spliceClosureId) buildSpliceManagerView(input.spliceClosureId, data)?.services.forEach(add);

  return filterContinuityTraceServicesByLayer(Array.from(matched.values()), input.layerType);
}

export function resolveSelectedSplicePointIdForTrace(input: ContinuityTraceInput, data: FiberContinuityData) {
  if (input.splicePointId) return buildSpliceManagerView(input.splicePointId, data)?.header.splicePointId || decodeURIComponent(input.splicePointId);
  if (input.spliceClosureId) return buildSpliceManagerView(input.spliceClosureId, data)?.header.splicePointId;
  if (input.spliceConnectionId) {
    const spliceConnectionId = decodeURIComponent(input.spliceConnectionId);
    const spliceConnection = data.fiberSplices.find((splice) => splice.id === spliceConnectionId);
    if (spliceConnection) return buildSpliceManagerView(spliceConnection.spliceClosureId, data)?.header.splicePointId;
  }
  return undefined;
}

export function filterContinuityTraceServicesByLayer(services: SyntheticService[], layerType: ContinuityTraceLayerType | undefined) {
  if (!layerType || layerType === "compare") return services;
  if (layerType === "existing") return services.filter((service) => service.layerType === "existing");
  return services.filter((service) => service.layerType === "proposed" || service.operationalStatus === "planned" || service.operationalStatus === "proposed");
}

function addServicesForTraceCableSection(routeId: string, data: FiberContinuityData, matched: Map<string, SyntheticService>) {
  const cableIds = new Set(
    data.opgwCables
      .filter((cable) => opgwRouteIdForCable(cable) === routeId)
      .map((cable) => cable.properties.id),
  );
  addServicesForTraceCableIds(cableIds, data.syntheticServices, matched);
}

function addServicesForTraceCableIds(cableIds: Set<string>, services: SyntheticService[], matched: Map<string, SyntheticService>) {
  services
    .filter((service) => service.continuityCableIds?.some((cableId) => cableIds.has(cableId)))
    .forEach((service) => matched.set(service.serviceId, service));
}

export function traceSyntheticService(service: SyntheticService, data: FiberContinuityData, selectedSplicePointId?: string): FiberContinuityPath {
  const assignment = service.primaryPathAssignmentId ? data.fiberAssignments.find((item) => item.id === service.primaryPathAssignmentId) : undefined;
  const continuityCableIds = service.continuityCableIds?.length ? service.continuityCableIds : assignment?.cableIds || [];
  const sections = data.opgwCableSections.filter((section) => routeCableIdsForSection(section, data.opgwCables).some((cableId) => continuityCableIds.includes(cableId)));
  const spanSegmentsBySection = buildSpanSegmentsBySection(data.opgwSpanSegments);
  const pathSpanSegments = sections.flatMap((section) => spanSegmentsBySection.get(section.properties.cableSectionId) || []);
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
  const warningSummary = warningsForService(service, selectedSplicePointId, sections, pathSpanSegments, splicePoints, splices, data.fiberAssignments, assignment);
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
    (spanSegmentsBySection.get(section.properties.cableSectionId) || []).forEach((span) => {
      segments.push(makeSegment(pathId, segments.length + 1, "span_segment", span.properties.spanSegmentId, {
        transmissionLineId: span.properties.transmissionLineId,
        opgwRouteId: span.properties.opgwRouteId,
        cableSectionId: span.properties.cableSectionId,
        spanSegmentId: span.properties.spanSegmentId,
        segmentStatus: spanStatusForContinuity(span),
        estimatedLossDb: (span.properties.spanLengthFt / 5280) * 0.25,
        notes: `${span.properties.fromStructureNumber} to ${span.properties.toStructureNumber}`,
      }));
    });
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
    totalSpanSegments: pathSpanSegments.length,
    totalSplicePoints: splicePoints.length,
    totalPatchPanels: patchPanels.length,
    totalEstimatedLossDb,
    hasBrokenContinuity,
    hasFaultedSection: sections.some((section) => section.properties.installStatus === "faulted") || pathSpanSegments.some((span) => span.properties.spanStatus === "faulted" || span.properties.hasMidspanIssue) || splices.some((splice) => splice.status === "faulted"),
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

function buildSpanSegmentsBySection(spans: OpgwSpanSegmentFeature[]) {
  const grouped = new Map<string, OpgwSpanSegmentFeature[]>();
  spans.forEach((span) => {
    const current = grouped.get(span.properties.cableSectionId) || [];
    current.push(span);
    grouped.set(span.properties.cableSectionId, current);
  });
  grouped.forEach((items) => {
    items.sort((a, b) => a.properties.spanSegmentId.localeCompare(b.properties.spanSegmentId, undefined, { numeric: true }));
  });
  return grouped;
}

function spanStatusForContinuity(span: OpgwSpanSegmentFeature): FiberContinuityPathSegment["segmentStatus"] {
  if (span.properties.spanStatus === "faulted") return "broken";
  if (span.properties.hasMidspanIssue || span.properties.spanStatus === "issue_found" || span.properties.spanStatus === "work_order_open" || span.properties.spanStatus === "inspection_due") return "warning";
  if (span.properties.cableStatus === "proposed" || span.properties.cableStatus === "planned") return "planned";
  return "existing";
}

function warningsForService(
  service: SyntheticService,
  selectedSplicePointId: string | undefined,
  sections: OpgwCableSectionFeature[],
  spans: OpgwSpanSegmentFeature[],
  splicePoints: OpgwSplicePointFeature[],
  splices: FiberSplice[],
  assignments: FiberAssignment[],
  selectedAssignment?: FiberAssignment,
) {
  const warnings: string[] = ["This is synthetic demo continuity only and is not authoritative."];
  if (service.continuityStatus === "broken") warnings.push(`Continuity breaks on ${service.serviceId}; proposed splice review is required.`);
  if (service.continuityStatus === "proposed_fix") warnings.push("Proposed splice changes repair a synthetic broken path preview.");
  if (service.layerType === "proposed") warnings.push("Proposed path is not committed to the existing continuity layer.");
  if (sections.length > 1) warnings.push(`Service ${service.serviceId} crosses ${new Set(sections.map((section) => section.properties.transmissionLineId)).size} transmission lines.`);
  if (spans.length) warnings.push(`Service ${service.serviceId} crosses ${spans.length} synthetic OPGW span segments.`);
  if (spans.some((span) => span.properties.hasMidspanIssue || span.properties.spanStatus === "faulted")) warnings.push("At least one synthetic span segment has an inspection issue, fault, or field-verification warning.");
  if (sections.some((section) => ["faulted", "retired", "superseded"].includes(section.properties.installStatus))) warnings.push("Cable section path includes a retired, faulted, or superseded synthetic section.");
  if (splicePoints.some((point) => String(point.properties.status) === "faulted" || point.properties.status === "retired")) warnings.push("A splice point in this continuity path is faulted or retired.");
  if (splices.some((splice) => splice.spliceType === "open")) warnings.push("At least one splice row is open; strand continuity should be treated as incomplete until reviewed.");
  if (splices.some((splice) => splice.status === "faulted")) warnings.push("At least one splice connection is faulted.");
  const duplicateAssignmentWarning = duplicateActiveAssignmentWarning(assignments, selectedAssignment);
  if (duplicateAssignmentWarning) warnings.push(duplicateAssignmentWarning);
  if (service.backupPathAssignmentId || service.protectionLevel === "backup_available" || service.protectionLevel === "diverse_path" || service.protectionLevel === "ring_protected") warnings.push("Alternate or protected synthetic path information is available for planning comparison.");
  if (service.protectionLevel === "ring_protected" || hasRepeatedContinuityPoint(splicePoints)) warnings.push("Loop or ring-style continuity should be reviewed with the compare/proposed path view.");
  if (selectedSplicePointId) warnings.push(`Selected splice point ${selectedSplicePointId} is on this synthetic trace.`);
  if (!splices.length && service.continuityStatus === "broken") warnings.push("Strand enters this demo path but has no outgoing synthetic splice record.");
  return warnings;
}

function duplicateActiveAssignmentWarning(assignments: FiberAssignment[], selectedAssignment?: FiberAssignment) {
  const selectedIds = new Set([selectedAssignment?.id].filter(Boolean) as string[]);
  const seen = new Map<string, string>();
  const duplicateKeys = new Set<string>();
  assignments
    .filter((assignment) => assignment.status === "active" || assignment.status === "planned" || assignment.status === "proposed" || assignment.status === "reserved")
    .forEach((assignment) => {
      assignment.strandSegments.forEach((segment) => {
        segment.strandNumbers.forEach((strandNumber) => {
          const key = `${segment.cableId}:${strandNumber}`;
          const existingAssignmentId = seen.get(key);
          if (existingAssignmentId && existingAssignmentId !== assignment.id && (!selectedIds.size || selectedIds.has(existingAssignmentId) || selectedIds.has(assignment.id))) duplicateKeys.add(key);
          seen.set(key, assignment.id);
        });
      });
    });
  if (!duplicateKeys.size) return "";
  return `Duplicate active/reserved assignment warning on ${duplicateKeys.size} synthetic strand${duplicateKeys.size === 1 ? "" : "s"}.`;
}

function hasRepeatedContinuityPoint(splicePoints: OpgwSplicePointFeature[]) {
  const seen = new Set<string>();
  return splicePoints.some((point) => {
    if (seen.has(point.properties.splicePointId)) return true;
    seen.add(point.properties.splicePointId);
    return false;
  });
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
