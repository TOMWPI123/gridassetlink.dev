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

const MAX_TRACE_SECTIONS = 30;
const MAX_TRACE_SPAN_SEGMENTS = 160;
const MAX_TRACE_SPLICE_SEGMENTS = 30;

type FiberContinuityIndex = {
  cableById: Map<string, OpgwCableFeature>;
  routeIdByCableId: Map<string, string>;
  cableIdsByRouteId: Map<string, string[]>;
  sectionsById: Map<string, OpgwCableSectionFeature>;
  sectionsByRouteId: Map<string, OpgwCableSectionFeature[]>;
  sectionsBySplicePointId: Map<string, OpgwCableSectionFeature[]>;
  spanSegmentsBySection: Map<string, OpgwSpanSegmentFeature[]>;
  splicePointById: Map<string, OpgwSplicePointFeature>;
  splicePointsByRouteId: Map<string, OpgwSplicePointFeature[]>;
  closureToSplicePointId: Map<string, string>;
  spliceClosureById: Map<string, SpliceClosureFeature>;
  splicesById: Map<string, FiberSplice>;
  splicesByClosureId: Map<string, FiberSplice[]>;
  splicesByAssignmentId: Map<string, FiberSplice[]>;
  splicesByCableId: Map<string, FiberSplice[]>;
  fiberStrandById: Map<string, FiberStrand>;
  fiberStrandsByCableId: Map<string, FiberStrand[]>;
  assignmentById: Map<string, FiberAssignment>;
  assignmentsByCableId: Map<string, FiberAssignment[]>;
  servicesById: Map<string, SyntheticService>;
  servicesByCircuitId: Map<string, SyntheticService>;
  servicesByAssignmentId: Map<string, SyntheticService[]>;
  servicesByCableId: Map<string, SyntheticService[]>;
  servicesBySpliceClosureId: Map<string, SyntheticService[]>;
  servicesBySplicePointId: Map<string, SyntheticService[]>;
  patchPanelsByCableId: Map<string, PatchPanel[]>;
  assignmentIdsBySpliceClosureId: Map<string, string[]>;
  duplicateStrandCountByAssignmentId: Map<string, number>;
  duplicateAssignmentStrandCount: number;
  structureById: Map<string, TransmissionStructureFeature>;
};

const indexCache = new WeakMap<FiberContinuityData, FiberContinuityIndex>();

export function getFiberContinuityIndex(data: FiberContinuityData): FiberContinuityIndex {
  const cached = indexCache.get(data);
  if (cached) return cached;

  const cableById = new Map<string, OpgwCableFeature>();
  const routeIdByCableId = new Map<string, string>();
  const cableIdsByRouteId = new Map<string, string[]>();
  data.opgwCables.forEach((cable) => {
    const cableId = cable.properties.id;
    const routeId = opgwRouteIdForCable(cable);
    cableById.set(cableId, cable);
    routeIdByCableId.set(cableId, routeId);
    pushToMap(cableIdsByRouteId, routeId, cableId);
  });

  const sectionsById = new Map<string, OpgwCableSectionFeature>();
  const sectionsByRouteId = new Map<string, OpgwCableSectionFeature[]>();
  const sectionsBySplicePointId = new Map<string, OpgwCableSectionFeature[]>();
  data.opgwCableSections.forEach((section) => {
    sectionsById.set(section.properties.cableSectionId, section);
    pushToMap(sectionsByRouteId, section.properties.opgwRouteId, section);
    pushToMap(sectionsBySplicePointId, section.properties.fromSplicePointId, section);
    pushToMap(sectionsBySplicePointId, section.properties.toSplicePointId, section);
  });
  sectionsByRouteId.forEach(sortCableSections);
  sectionsBySplicePointId.forEach(sortCableSections);

  const spanSegmentsBySection = buildSpanSegmentsBySection(data.opgwSpanSegments);
  const splicePointById = new Map<string, OpgwSplicePointFeature>();
  const splicePointsByRouteId = new Map<string, OpgwSplicePointFeature[]>();
  const closureToSplicePointId = new Map<string, string>();
  data.opgwSplicePoints.forEach((splicePoint) => {
    splicePointById.set(splicePoint.properties.splicePointId, splicePoint);
    pushToMap(splicePointsByRouteId, splicePoint.properties.opgwRouteId, splicePoint);
    if (splicePoint.properties.closureId) closureToSplicePointId.set(splicePoint.properties.closureId, splicePoint.properties.splicePointId);
  });
  splicePointsByRouteId.forEach((points) => {
    points.sort((a, b) => a.properties.structureNumber.localeCompare(b.properties.structureNumber, undefined, { numeric: true }));
  });

  const spliceClosureById = new Map<string, SpliceClosureFeature>();
  data.spliceClosures.forEach((closure) => spliceClosureById.set(closure.properties.id, closure));

  const splicesById = new Map<string, FiberSplice>();
  const splicesByClosureId = new Map<string, FiberSplice[]>();
  const splicesByAssignmentId = new Map<string, FiberSplice[]>();
  const splicesByCableId = new Map<string, FiberSplice[]>();
  data.fiberSplices.forEach((splice) => {
    splicesById.set(splice.id, splice);
    pushToMap(splicesByClosureId, splice.spliceClosureId, splice);
    if (splice.assignmentId) pushToMap(splicesByAssignmentId, splice.assignmentId, splice);
    pushToMap(splicesByCableId, splice.fromCableId, splice);
    if (splice.toCableId !== splice.fromCableId) pushToMap(splicesByCableId, splice.toCableId, splice);
  });

  const fiberStrandById = new Map<string, FiberStrand>();
  const fiberStrandsByCableId = new Map<string, FiberStrand[]>();
  (data.fiberStrands || []).forEach((strand) => {
    fiberStrandById.set(strand.id, strand);
    pushToMap(fiberStrandsByCableId, strand.cableId, strand);
  });

  const assignmentById = new Map<string, FiberAssignment>();
  const assignmentsByCableId = new Map<string, FiberAssignment[]>();
  data.fiberAssignments.forEach((assignment) => {
    assignmentById.set(assignment.id, assignment);
    assignment.cableIds.forEach((cableId) => pushToMap(assignmentsByCableId, cableId, assignment));
  });

  const assignmentIdsBySpliceClosureId = new Map<string, string[]>();
  data.fiberAssignments.forEach((assignment) => {
    assignment.spliceIds.forEach((spliceId) => {
      const splice = splicesById.get(spliceId);
      if (splice?.spliceClosureId) pushUniqueToMap(assignmentIdsBySpliceClosureId, splice.spliceClosureId, assignment.id);
    });
  });

  const servicesById = new Map<string, SyntheticService>();
  const servicesByCircuitId = new Map<string, SyntheticService>();
  const servicesByAssignmentId = new Map<string, SyntheticService[]>();
  const servicesByCableId = new Map<string, SyntheticService[]>();
  const servicesBySpliceClosureId = new Map<string, SyntheticService[]>();
  const servicesBySplicePointId = new Map<string, SyntheticService[]>();
  const patchPanelsByCableId = new Map<string, PatchPanel[]>();
  data.syntheticServices.forEach((service) => {
    servicesById.set(service.serviceId, service);
    if (service.circuitId) servicesByCircuitId.set(service.circuitId, service);
    if (service.primaryPathAssignmentId) pushToMap(servicesByAssignmentId, service.primaryPathAssignmentId, service);
    if (service.backupPathAssignmentId) pushToMap(servicesByAssignmentId, service.backupPathAssignmentId, service);
    service.continuityCableIds?.forEach((cableId) => pushToMap(servicesByCableId, cableId, service));
    service.continuitySpliceClosureIds?.forEach((closureId) => pushToMap(servicesBySpliceClosureId, closureId, service));
    service.continuitySplicePointIds?.forEach((pointId) => pushToMap(servicesBySplicePointId, pointId, service));
  });
  data.patchPanels.forEach((panel) => {
    panel.fiberCableIds.forEach((cableId) => pushToMap(patchPanelsByCableId, cableId, panel));
  });

  const assignmentIdsByStrandKey = new Map<string, Set<string>>();
  data.fiberAssignments.forEach((assignment) => {
    if (!isActiveAssignmentStatus(assignment.status)) return;
    assignment.strandSegments.forEach((segment) => {
      segment.strandNumbers.forEach((strandNumber) => {
        const key = `${segment.cableId}:${strandNumber}`;
        let current = assignmentIdsByStrandKey.get(key);
        if (!current) {
          current = new Set<string>();
          assignmentIdsByStrandKey.set(key, current);
        }
        current.add(assignment.id);
      });
    });
  });
  const duplicateStrandCountByAssignmentId = new Map<string, number>();
  let duplicateAssignmentStrandCount = 0;
  assignmentIdsByStrandKey.forEach((assignmentIds) => {
    if (assignmentIds.size < 2) return;
    duplicateAssignmentStrandCount += 1;
    assignmentIds.forEach((assignmentId) => {
      duplicateStrandCountByAssignmentId.set(assignmentId, (duplicateStrandCountByAssignmentId.get(assignmentId) || 0) + 1);
    });
  });

  const structureById = new Map<string, TransmissionStructureFeature>();
  (data.transmissionStructures || []).forEach((structure) => structureById.set(structure.properties.id, structure));

  const index = {
    cableById,
    routeIdByCableId,
    cableIdsByRouteId,
    sectionsById,
    sectionsByRouteId,
    sectionsBySplicePointId,
    spanSegmentsBySection,
    splicePointById,
    splicePointsByRouteId,
    closureToSplicePointId,
    spliceClosureById,
    splicesById,
    splicesByClosureId,
    splicesByAssignmentId,
    splicesByCableId,
    fiberStrandById,
    fiberStrandsByCableId,
    assignmentById,
    assignmentsByCableId,
    servicesById,
    servicesByCircuitId,
    servicesByAssignmentId,
    servicesByCableId,
    servicesBySpliceClosureId,
    servicesBySplicePointId,
    patchPanelsByCableId,
    assignmentIdsBySpliceClosureId,
    duplicateStrandCountByAssignmentId,
    duplicateAssignmentStrandCount,
    structureById,
  };
  indexCache.set(data, index);
  return index;
}

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
  const index = getFiberContinuityIndex(data);
  const directPoint = index.splicePointById.get(normalizedId);
  const closurePointId = index.closureToSplicePointId.get(normalizedId);
  const splicePoint = directPoint || (closurePointId ? index.splicePointById.get(closurePointId) : undefined);
  if (!splicePoint) return null;

  const closure = splicePoint.properties.closureId
    ? index.spliceClosureById.get(splicePoint.properties.closureId)
    : undefined;
  const closureId = closure?.properties.id || splicePoint.properties.closureId || "";
  const allSplices = closureId ? index.splicesByClosureId.get(closureId) || [] : [];
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
  const index = getFiberContinuityIndex(data);
  data.opgwSplicePoints.forEach((splicePoint) => {
    const connectedSections = connectedSectionsForSplicePoint(splicePoint.properties.splicePointId, data);
    const services = servicesForSplicePoint(splicePoint.properties.splicePointId, data, index);
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

export function servicesForSplicePoint(splicePointId: string, data: FiberContinuityData, providedIndex?: FiberContinuityIndex) {
  const index = providedIndex || getFiberContinuityIndex(data);
  const point = index.splicePointById.get(splicePointId);
  const closureId = point?.properties.closureId;
  const cableIds = new Set<string>();
  (point?.properties.associatedCableSectionIds || []).forEach((sectionId) => {
    const section = index.sectionsById.get(sectionId);
    if (!section) return;
    (index.cableIdsByRouteId.get(section.properties.opgwRouteId) || []).forEach((cableId) => cableIds.add(cableId));
  });

  const matched = new Map<string, SyntheticService>();
  addServicesToMap(index.servicesBySplicePointId.get(splicePointId), matched);
  if (closureId) {
    addServicesToMap(index.servicesBySpliceClosureId.get(closureId), matched);
    (index.assignmentIdsBySpliceClosureId.get(closureId) || []).forEach((assignmentId) => {
      addServicesToMap(index.servicesByAssignmentId.get(assignmentId), matched);
    });
  }
  cableIds.forEach((cableId) => addServicesToMap(index.servicesByCableId.get(cableId), matched));
  return Array.from(matched.values());
}

export function connectedSectionsForSplicePoint(splicePointId: string, data: FiberContinuityData): ConnectedCableSection[] {
  const index = getFiberContinuityIndex(data);
  return (index.sectionsBySplicePointId.get(splicePointId) || [])
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
  const structure = getFiberContinuityIndex(data).structureById.get(splicePoint.properties.structureId);
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
  const index = getFiberContinuityIndex(data);
  const add = (service: SyntheticService | undefined) => {
    if (service) matched.set(service.serviceId, service);
  };

  if (input.serviceId) {
    const serviceId = decodeURIComponent(input.serviceId || "");
    add(index.servicesById.get(serviceId) || index.servicesByCircuitId.get(serviceId));
  }
  if (input.assignmentId) {
    const assignmentId = decodeURIComponent(input.assignmentId);
    addServicesToMap(index.servicesByAssignmentId.get(assignmentId), matched);
  }
  if (input.strandId) {
    const strandId = decodeURIComponent(input.strandId);
    const strand = index.fiberStrandById.get(strandId);
    if (strand?.assignmentId) {
      addServicesToMap(index.servicesByAssignmentId.get(strand.assignmentId), matched);
    }
    if (strand?.cableId) addServicesForTraceCableIds(new Set([strand.cableId]), data, matched, index);
  }
  if (input.cableSectionId) {
    const cableSectionId = decodeURIComponent(input.cableSectionId);
    const section = index.sectionsById.get(cableSectionId);
    if (section) addServicesForTraceCableSection(section.properties.opgwRouteId, data, matched, index);
  }
  if (input.spliceConnectionId) {
    const spliceConnectionId = decodeURIComponent(input.spliceConnectionId);
    const spliceConnection = index.splicesById.get(spliceConnectionId);
    if (spliceConnection) {
      if (spliceConnection.assignmentId) {
        addServicesToMap(index.servicesByAssignmentId.get(spliceConnection.assignmentId), matched);
      }
      addServicesToMap(index.servicesBySpliceClosureId.get(spliceConnection.spliceClosureId), matched);
      addServicesForTraceCableIds(new Set([spliceConnection.fromCableId, spliceConnection.toCableId]), data, matched, index);
    }
  }
  if (input.splicePointId) buildSpliceManagerView(input.splicePointId, data)?.services.forEach(add);
  if (input.spliceClosureId) buildSpliceManagerView(input.spliceClosureId, data)?.services.forEach(add);

  return filterContinuityTraceServicesByLayer(Array.from(matched.values()), input.layerType);
}

export function resolveSelectedSplicePointIdForTrace(input: ContinuityTraceInput, data: FiberContinuityData) {
  const index = getFiberContinuityIndex(data);
  if (input.splicePointId) {
    const normalizedId = decodeURIComponent(input.splicePointId);
    return index.splicePointById.get(normalizedId)?.properties.splicePointId || index.closureToSplicePointId.get(normalizedId) || normalizedId;
  }
  if (input.spliceClosureId) return index.closureToSplicePointId.get(decodeURIComponent(input.spliceClosureId));
  if (input.spliceConnectionId) {
    const spliceConnectionId = decodeURIComponent(input.spliceConnectionId);
    const spliceConnection = index.splicesById.get(spliceConnectionId);
    if (spliceConnection) return index.closureToSplicePointId.get(spliceConnection.spliceClosureId);
  }
  return undefined;
}

export function traceSpliceConnection(spliceConnectionId: string, data: FiberContinuityData): FiberContinuityPath | null {
  const normalizedId = decodeURIComponent(spliceConnectionId);
  const index = getFiberContinuityIndex(data);
  const spliceConnection = index.splicesById.get(normalizedId);
  if (!spliceConnection) return null;

  const selectedSplicePointId = resolveSelectedSplicePointIdForTrace({ spliceConnectionId: normalizedId }, data);
  const spliceView = selectedSplicePointId ? buildSpliceManagerView(selectedSplicePointId, data) : null;
  const connectedSectionIds = new Set(spliceView?.connectedCableSections.map((section) => section.cableSectionId) || []);
  const connectedCableIds = new Set([spliceConnection.fromCableId, spliceConnection.toCableId]);
  const localSections = (index.sectionsBySplicePointId.get(selectedSplicePointId || "") || []).filter((section) => {
    if (!connectedSectionIds.has(section.properties.cableSectionId)) return false;
    return (index.cableIdsByRouteId.get(section.properties.opgwRouteId) || []).some((cableId) => connectedCableIds.has(cableId));
  });
  const fallbackSections = [...connectedCableIds].flatMap((cableId) => sectionsForCableId(cableId, data, index));
  const sections = uniqueBy(localSections.length ? localSections : fallbackSections, (section) => section.properties.cableSectionId).slice(0, 6);
  const pathSpanSegments = sections.flatMap((section) => index.spanSegmentsBySection.get(section.properties.cableSectionId) || []);
  const transmissionLines = new Set(sections.map((section) => section.properties.transmissionLineId).filter(Boolean));
  const pathId = `TRACE-${normalizedId}`;
  const segments: FiberContinuityPathSegment[] = [];

  if (spliceView?.header.splicePointId) {
    segments.push(makeSegment(pathId, segments.length + 1, "splice_point", spliceView.header.splicePointId, {
      transmissionLineId: spliceView.header.transmissionLineId,
      opgwRouteId: spliceView.header.opgwRouteId,
      splicePointId: spliceView.header.splicePointId,
      segmentStatus: "warning",
      notes: `Closure ${spliceConnection.spliceClosureId}`,
    }));
  }

  sections.forEach((section) => {
    segments.push(makeSegment(pathId, segments.length + 1, "cable_section", section.properties.cableSectionId, {
      transmissionLineId: section.properties.transmissionLineId,
      opgwRouteId: section.properties.opgwRouteId,
      cableSectionId: section.properties.cableSectionId,
      segmentStatus: section.properties.installStatus === "proposed" ? "proposed" : section.properties.installStatus === "planned" ? "planned" : "existing",
      estimatedLossDb: section.properties.routeMiles * 0.25,
      notes: `${section.properties.fromStructureNumber} to ${section.properties.toStructureNumber}`,
    }));
  });

  segments.push(makeSegment(pathId, segments.length + 1, "splice_connection", spliceConnection.id, {
    spliceConnectionId: spliceConnection.id,
    strandNumber: spliceConnection.fromStrandNumber,
    segmentStatus: spliceConnection.status === "faulted"
      ? "broken"
      : spliceConnection.status === "proposed"
        ? "proposed"
        : spliceConnection.status === "planned"
          ? "planned"
          : spliceConnection.spliceType === "open" || spliceConnection.spliceType === "reserved"
            ? "warning"
            : "existing",
    estimatedLossDb: spliceConnection.lossDb || 0,
    notes: `${spliceConnection.fromCableId}/${spliceConnection.fromStrandNumber} to ${spliceConnection.toCableId}/${spliceConnection.toStrandNumber}`,
  }));

  const totalRouteMiles = sections.reduce((sum, section) => sum + section.properties.routeMiles, 0);
  const totalEstimatedLossDb = Number((totalRouteMiles * 0.25 + (spliceConnection.lossDb || 0)).toFixed(3));
  const pathStatus: FiberContinuityPath["pathStatus"] = spliceConnection.status === "faulted"
    ? "broken"
    : spliceConnection.status === "proposed" || spliceConnection.status === "planned"
      ? "proposed"
      : spliceConnection.spliceType === "open" || spliceConnection.spliceType === "reserved"
        ? "warning"
        : "complete";
  const warningSummary = [
    "This splice connection has no matched carried service; showing synthetic cable, strand, and closure continuity context instead.",
    "Synthetic demo continuity only and not authoritative for operations.",
  ];
  if (spliceConnection.spliceType === "open") warningSummary.push("Connection type is open; end-to-end strand continuity may be incomplete until a planned splice is added.");
  if (spliceConnection.status === "faulted") warningSummary.push("Connection status is faulted in the synthetic planning data.");

  return {
    continuityPathId: pathId,
    serviceId: `SPLICE-CONNECTION-${spliceConnection.id}`,
    assignmentId: spliceConnection.assignmentId,
    layerType: spliceConnection.status === "proposed" || spliceConnection.status === "planned" ? "proposed" : "existing",
    endpointASiteId: sections[0]?.properties.fromStructureNumber || spliceConnection.fromCableId,
    endpointZSiteId: sections[sections.length - 1]?.properties.toStructureNumber || spliceConnection.toCableId,
    pathStatus,
    totalRouteMiles: Number(totalRouteMiles.toFixed(3)),
    totalCableSections: sections.length,
    totalTransmissionLines: transmissionLines.size,
    totalSpanSegments: pathSpanSegments.length,
    totalSplicePoints: spliceView?.header.splicePointId ? 1 : 0,
    totalPatchPanels: 0,
    totalEstimatedLossDb,
    hasBrokenContinuity: pathStatus === "broken" || spliceConnection.spliceType === "open",
    hasFaultedSection: spliceConnection.status === "faulted" || sections.some((section) => section.properties.installStatus === "faulted"),
    hasProposedChanges: spliceConnection.status === "planned" || spliceConnection.status === "proposed",
    syntheticFlag: true,
    warningSummary,
    segments,
    notes: "Synthetic splice-connection trace generated without a carried service match.",
  };
}

export function filterContinuityTraceServicesByLayer(services: SyntheticService[], layerType: ContinuityTraceLayerType | undefined) {
  if (!layerType || layerType === "compare") return services;
  if (layerType === "existing") return services.filter((service) => service.layerType === "existing");
  return services.filter((service) => service.layerType === "proposed" || service.operationalStatus === "planned" || service.operationalStatus === "proposed");
}

function addServicesForTraceCableSection(routeId: string, data: FiberContinuityData, matched: Map<string, SyntheticService>, providedIndex?: FiberContinuityIndex) {
  const index = providedIndex || getFiberContinuityIndex(data);
  addServicesForTraceCableIds(new Set(index.cableIdsByRouteId.get(routeId) || []), data, matched, index);
}

function addServicesForTraceCableIds(cableIds: Set<string>, data: FiberContinuityData, matched: Map<string, SyntheticService>, providedIndex?: FiberContinuityIndex) {
  const index = providedIndex || getFiberContinuityIndex(data);
  cableIds.forEach((cableId) => addServicesToMap(index.servicesByCableId.get(cableId), matched));
}

function sectionsForCableId(cableId: string, data: FiberContinuityData, providedIndex?: FiberContinuityIndex) {
  const index = providedIndex || getFiberContinuityIndex(data);
  const routeId = index.routeIdByCableId.get(cableId);
  return routeId ? index.sectionsByRouteId.get(routeId) || [] : [];
}

export function traceSyntheticService(service: SyntheticService, data: FiberContinuityData, selectedSplicePointId?: string): FiberContinuityPath {
  const index = getFiberContinuityIndex(data);
  const assignment = service.primaryPathAssignmentId ? index.assignmentById.get(service.primaryPathAssignmentId) : undefined;
  const continuityCableIds = service.continuityCableIds?.length ? service.continuityCableIds : assignment?.cableIds || [];
  const sections = uniqueBy(
    continuityCableIds.flatMap((cableId) => sectionsForCableId(cableId, data, index)),
    (section) => section.properties.cableSectionId,
  );
  const pathSpanSegments = sections.flatMap((section) => index.spanSegmentsBySection.get(section.properties.cableSectionId) || []);
  const splicePoints = uniqueBy([
    ...(service.continuitySplicePointIds || []).map((pointId) => index.splicePointById.get(pointId)).filter(Boolean) as OpgwSplicePointFeature[],
    ...(service.continuitySpliceClosureIds || []).map((closureId) => {
      const pointId = index.closureToSplicePointId.get(closureId);
      return pointId ? index.splicePointById.get(pointId) : undefined;
    }).filter(Boolean) as OpgwSplicePointFeature[],
    ...sections.flatMap((section) => [
      index.splicePointById.get(section.properties.fromSplicePointId),
      index.splicePointById.get(section.properties.toSplicePointId),
    ]).filter(Boolean) as OpgwSplicePointFeature[],
  ], (point) => point.properties.splicePointId);
  const splices = uniqueBy([
    ...((assignment?.spliceIds || []).map((spliceId) => index.splicesById.get(spliceId)).filter(Boolean) as FiberSplice[]),
    ...((service.continuitySpliceClosureIds || []).flatMap((closureId) => index.splicesByClosureId.get(closureId) || [])),
  ], (splice) => splice.id);
  const transmissionLines = new Set(sections.map((section) => section.properties.transmissionLineId));
  const patchPanels = [service.endpointAPatchPanelId, service.endpointZPatchPanelId].filter(Boolean) as string[];
  const warningSummary = warningsForService(service, selectedSplicePointId, sections, pathSpanSegments, splicePoints, splices, data.fiberAssignments, assignment, index);
  const segments: FiberContinuityPathSegment[] = [];
  const pathId = `CONT-${service.serviceId}`;
  let renderedSpanSegmentCount = 0;

  patchPanels.slice(0, 1).forEach((patchPanelId) => {
    segments.push(makeSegment(pathId, segments.length + 1, "patch_panel", patchPanelId, { patchPanelId, segmentStatus: service.layerType === "proposed" ? "proposed" : "existing" }));
  });
  sections.slice(0, MAX_TRACE_SECTIONS).forEach((section) => {
    segments.push(makeSegment(pathId, segments.length + 1, "cable_section", section.properties.cableSectionId, {
      transmissionLineId: section.properties.transmissionLineId,
      opgwRouteId: section.properties.opgwRouteId,
      cableSectionId: section.properties.cableSectionId,
      segmentStatus: section.properties.installStatus === "proposed" || section.properties.installStatus === "planned" ? "planned" : "existing",
      estimatedLossDb: section.properties.routeMiles * 0.25,
      notes: `${section.properties.fromStructureNumber} to ${section.properties.toStructureNumber}`,
    }));
    for (const span of index.spanSegmentsBySection.get(section.properties.cableSectionId) || []) {
      if (renderedSpanSegmentCount >= MAX_TRACE_SPAN_SEGMENTS) break;
      renderedSpanSegmentCount += 1;
      segments.push(makeSegment(pathId, segments.length + 1, "span_segment", span.properties.spanSegmentId, {
        transmissionLineId: span.properties.transmissionLineId,
        opgwRouteId: span.properties.opgwRouteId,
        cableSectionId: span.properties.cableSectionId,
        spanSegmentId: span.properties.spanSegmentId,
        segmentStatus: spanStatusForContinuity(span),
        estimatedLossDb: (span.properties.spanLengthFt / 5280) * 0.25,
        notes: `${span.properties.fromStructureNumber} to ${span.properties.toStructureNumber}`,
      }));
    }
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
  splices.slice(0, MAX_TRACE_SPLICE_SEGMENTS).forEach((splice) => {
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
  index?: FiberContinuityIndex,
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
  const duplicateAssignmentWarning = duplicateActiveAssignmentWarning(assignments, selectedAssignment, index);
  if (duplicateAssignmentWarning) warnings.push(duplicateAssignmentWarning);
  if (service.backupPathAssignmentId || service.protectionLevel === "backup_available" || service.protectionLevel === "diverse_path" || service.protectionLevel === "ring_protected") warnings.push("Alternate or protected synthetic path information is available for planning comparison.");
  if (service.protectionLevel === "ring_protected" || hasRepeatedContinuityPoint(splicePoints)) warnings.push("Loop or ring-style continuity should be reviewed with the compare/proposed path view.");
  if (selectedSplicePointId) warnings.push(`Selected splice point ${selectedSplicePointId} is on this synthetic trace.`);
  if (!splices.length && service.continuityStatus === "broken") warnings.push("Strand enters this demo path but has no outgoing synthetic splice record.");
  return warnings;
}

function duplicateActiveAssignmentWarning(assignments: FiberAssignment[], selectedAssignment?: FiberAssignment, index?: FiberContinuityIndex) {
  if (index) {
    const duplicateKeys = selectedAssignment
      ? index.duplicateStrandCountByAssignmentId.get(selectedAssignment.id) || 0
      : index.duplicateAssignmentStrandCount;
    if (!duplicateKeys) return "";
    return `Duplicate active/reserved assignment warning on ${duplicateKeys} synthetic strand${duplicateKeys === 1 ? "" : "s"}.`;
  }
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

function uniqueBy<T>(values: T[], keyForValue: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyForValue(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pushToMap<K, V>(map: Map<K, V[]>, key: K | undefined, value: V) {
  if (key === undefined || key === null || key === "") return;
  const current = map.get(key) || [];
  current.push(value);
  map.set(key, current);
}

function pushUniqueToMap<K, V>(map: Map<K, V[]>, key: K | undefined, value: V) {
  if (key === undefined || key === null || key === "") return;
  const current = map.get(key) || [];
  if (!current.includes(value)) current.push(value);
  map.set(key, current);
}

function addServicesToMap(services: SyntheticService[] | undefined, matched: Map<string, SyntheticService>) {
  services?.forEach((service) => matched.set(service.serviceId, service));
}

function sortCableSections(sections: OpgwCableSectionFeature[]) {
  sections.sort((a, b) => a.properties.cableSectionId.localeCompare(b.properties.cableSectionId, undefined, { numeric: true }));
}

function isActiveAssignmentStatus(status: FiberAssignment["status"]) {
  return status === "active" || status === "planned" || status === "proposed" || status === "reserved";
}
