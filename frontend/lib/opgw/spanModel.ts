import type {
  Coordinate,
  FiberAssignment,
  FiberStrand,
  OpgwCableFeature,
  OpgwCableSectionFeature,
  OpgwCableSectionStatus,
  OpgwRouteFeature,
  OpgwSpanSegmentFeature,
  OpgwSpanSegmentStatus,
  OpgwSplicePointFeature,
  OpgwWorkflowStatus,
  PatchPanel,
  PublicTransmissionLineFeature,
  SpliceClosureFeature,
  TransmissionStructureFeature,
} from "@/lib/types/assets";

const assumptionWarning = "Synthetic planning assumption only. Not active fiber. Requires engineer/as-built verification.";

type BuildInput = {
  opgwCables: OpgwCableFeature[];
  transmissionStructures: TransmissionStructureFeature[];
  spliceClosures: SpliceClosureFeature[];
  fiberStrands: FiberStrand[];
  fiberAssignments: FiberAssignment[];
  patchPanels: PatchPanel[];
  publicTransmissionLines: PublicTransmissionLineFeature[];
};

type StrandStats = {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
};

type AssignmentStats = {
  critical: number;
  assignedStrands: number;
  reservedStrands: number;
  openWorkOrders: number;
};

type SplicePointDraft = {
  structure: TransmissionStructureFeature;
  closure?: SpliceClosureFeature;
  splicePointId: string;
  spliceType: OpgwSplicePointFeature["properties"]["spliceType"];
};

export type SyntheticOpgwEngineeringModel = {
  routes: OpgwRouteFeature[];
  cableSections: OpgwCableSectionFeature[];
  spanSegments: OpgwSpanSegmentFeature[];
  splicePoints: OpgwSplicePointFeature[];
};

export function buildSyntheticOpgwEngineeringModel({
  opgwCables,
  transmissionStructures,
  spliceClosures,
  fiberStrands,
  fiberAssignments,
  patchPanels,
  publicTransmissionLines,
}: BuildInput): SyntheticOpgwEngineeringModel {
  const structureById = new Map(transmissionStructures.map((feature) => [feature.properties.id, feature]));
  const publicLineById = new Map(publicTransmissionLines.map((feature) => [feature.properties.id, feature]));
  const closuresByCableId = groupSpliceClosuresByCable(opgwCables, spliceClosures);
  const strandStatsByCableId = buildStrandStats(opgwCables, fiberStrands);
  const assignmentStatsByCableId = buildAssignmentStats(fiberAssignments);
  const patchPanelsByCableId = groupPatchPanelsByCable(patchPanels);

  const routes: OpgwRouteFeature[] = [];
  const cableSections: OpgwCableSectionFeature[] = [];
  const spanSegments: OpgwSpanSegmentFeature[] = [];
  const splicePoints: OpgwSplicePointFeature[] = [];
  const splicePointSectionIds = new Map<string, Set<string>>();

  opgwCables.forEach((cable) => {
    const structures = cable.properties.structureIds
      .map((structureId) => structureById.get(structureId))
      .filter((feature): feature is TransmissionStructureFeature => Boolean(feature))
      .sort((a, b) => a.properties.sequenceIndex - b.properties.sequenceIndex);
    if (structures.length < 2) return;

    const lineCode = lineCodeFor(cable.properties.lineId);
    const routeId = `OPGW-${lineCode}`;
    const routeStatus = routeStatusFor(cable);
    const confidence = confidenceFor(cable.properties.id, cable.properties.status);
    const closures = closuresByCableId.get(cable.properties.id) || [];
    const spliceDrafts = splicePointDraftsFor(cable, structures, closures, lineCode);
    if (spliceDrafts.length < 2) return;

    const publicLine = publicLineById.get(cable.properties.lineId)?.properties;
    const voltageClass = publicLine?.voltageClass || String(structures[0]?.properties.voltageKv || "unknown");
    const cableSectionIds: string[] = [];
    let totalSectionMiles = 0;
    let routeAvailableStrands = 0;
    let routeAssignedStrands = 0;
    let routeReservedStrands = 0;
    let routeCriticalServices = 0;
    let routeOpenWorkOrders = 0;

    for (let spliceIndex = 0; spliceIndex < spliceDrafts.length - 1; spliceIndex += 1) {
      const fromSplice = spliceDrafts[spliceIndex];
      const toSplice = spliceDrafts[spliceIndex + 1];
      const fromStructureIndex = structures.findIndex((feature) => feature.properties.id === fromSplice.structure.properties.id);
      const toStructureIndex = structures.findIndex((feature) => feature.properties.id === toSplice.structure.properties.id);
      if (fromStructureIndex < 0 || toStructureIndex <= fromStructureIndex) continue;

      const sectionStructures = structures.slice(fromStructureIndex, toStructureIndex + 1);
      const coordinates = sectionStructures.map((feature) => feature.geometry.coordinates);
      const routeMiles = lengthMiles(coordinates);
      totalSectionMiles += routeMiles;
      const sectionId = `OPGW-${lineCode}-CS-${String(spliceIndex + 1).padStart(3, "0")}`;
      const sectionCableName = `${sectionId}: ${fromSplice.splicePointId} to ${toSplice.splicePointId}`;
      cableSectionIds.push(sectionId);
      addSplicePointSection(splicePointSectionIds, fromSplice.splicePointId, sectionId);
      addSplicePointSection(splicePointSectionIds, toSplice.splicePointId, sectionId);

      const sectionStatus = sectionStatusFor(cable);
      const strandStats = strandStatsByCableId.get(sectionId) || strandStatsByCableId.get(cable.properties.id) || fallbackStrandStats(cable.properties.fiberCount);
      const assignmentStats = assignmentStatsByCableId.get(sectionId) || assignmentStatsByCableId.get(cable.properties.id) || emptyAssignmentStats();
      const panelIds = (patchPanelsByCableId.get(sectionId) || patchPanelsByCableId.get(cable.properties.id) || []).map((panel) => panel.id);
      routeAvailableStrands += strandStats.available;
      routeAssignedStrands += assignmentStats.assignedStrands;
      routeReservedStrands += assignmentStats.reservedStrands;
      routeCriticalServices += assignmentStats.critical;
      routeOpenWorkOrders += assignmentStats.openWorkOrders;
      const section: OpgwCableSectionFeature = {
        type: "Feature",
        properties: {
          cableId: sectionId,
          cableName: sectionCableName,
          cableSectionId: sectionId,
          parentRouteCableId: cable.properties.id,
          opgwRouteId: routeId,
          transmissionLineId: cable.properties.lineId,
          fromSplicePointId: fromSplice.splicePointId,
          toSplicePointId: toSplice.splicePointId,
          fromStructureId: fromSplice.structure.properties.id,
          toStructureId: toSplice.structure.properties.id,
          fromStructureNumber: fromSplice.structure.properties.structureNumber,
          toStructureNumber: toSplice.structure.properties.structureNumber,
          fiberCount: cable.properties.fiberCount,
          cableType: "OPGW",
          manufacturer: cable.properties.manufacturer || "Synthetic demo manufacturer",
          installStatus: sectionStatus,
          syntheticConfidence: confidence,
          installYear: sectionStatus === "verified" ? 2026 : undefined,
          routeMiles: Number(routeMiles.toFixed(3)),
          totalSpans: Math.max(0, sectionStructures.length - 1),
          strandCount: cable.properties.fiberCount,
        availableStrands: Math.max(0, strandStats.available),
          assignedStrands: assignmentStats.assignedStrands,
          reservedStrands: assignmentStats.reservedStrands,
          assignedServices: assignmentStats.critical,
          associatedSpliceClosureIds: [fromSplice.closure?.properties.id, toSplice.closure?.properties.id].filter(Boolean) as string[],
          associatedPatchPanelIds: panelIds,
          auditStatus: "current",
          synthetic: true,
          warning: assumptionWarning,
          notes: "Synthetic splice-point-to-splice-point OPGW cable section derived from demo route structures.",
        },
        geometry: { type: "LineString", coordinates },
      };
      cableSections.push(section);

      for (let localSpanIndex = 0; localSpanIndex < sectionStructures.length - 1; localSpanIndex += 1) {
        const fromStructure = sectionStructures[localSpanIndex];
        const toStructure = sectionStructures[localSpanIndex + 1];
        const globalSpanIndex = fromStructure.properties.sequenceIndex;
        const spanId = `OPGW-${lineCode}-SPAN-${String(globalSpanIndex).padStart(4, "0")}`;
        const spanStatus = spanStatusFor(spanId);
        const riskScore = outageRiskFor(spanId, assignmentStats.critical, strandStats.available, cable.properties.fiberCount);
        spanSegments.push({
          type: "Feature",
          properties: {
            spanSegmentId: spanId,
            cableSectionId: sectionId,
            opgwRouteId: routeId,
            transmissionLineId: cable.properties.lineId,
            fromStructureId: fromStructure.properties.id,
            toStructureId: toStructure.properties.id,
            fromStructureNumber: fromStructure.properties.structureNumber,
            toStructureNumber: toStructure.properties.structureNumber,
            spanLengthFt: Math.round(lengthMiles([fromStructure.geometry.coordinates, toStructure.geometry.coordinates]) * 5280),
            fiberCount: cable.properties.fiberCount,
            cableStatus: sectionStatus,
            spanStatus,
            hasMidspanIssue: spanStatus === "issue_found" || spanStatus === "faulted",
            sagClearanceNote: spanStatus === "issue_found" ? "Synthetic inspection issue: field verification required." : undefined,
            inspectionStatus: spanStatus === "inspection_due" ? "inspection_due" : spanStatus === "issue_found" ? "issue_found" : "not_started",
            outageRiskScore: riskScore,
            openWorkOrderCount: spanStatus === "work_order_open" || spanStatus === "issue_found" ? 1 : 0,
            synthetic: true,
            notes: "Synthetic structure-to-structure OPGW span segment.",
          },
          geometry: { type: "LineString", coordinates: [fromStructure.geometry.coordinates, toStructure.geometry.coordinates] },
        });
      }
    }

    spliceDrafts.forEach((draft) => {
      splicePoints.push({
        type: "Feature",
        properties: {
          splicePointId: draft.splicePointId,
          opgwRouteId: routeId,
          transmissionLineId: cable.properties.lineId,
          structureId: draft.structure.properties.id,
          structureNumber: draft.structure.properties.structureNumber,
          spliceType: draft.spliceType,
          closureId: draft.closure?.properties.id,
          associatedCableSectionIds: [...(splicePointSectionIds.get(draft.splicePointId) || new Set<string>())],
          latitude: draft.structure.geometry.coordinates[1],
          longitude: draft.structure.geometry.coordinates[0],
          status: cable.properties.status === "planned" ? "planned" : "synthetic_assumption",
          syntheticConfidence: confidence,
          synthetic: true,
          notes: "Synthetic splice point. Public transmission references do not prove actual OPGW.",
        },
        geometry: { type: "Point", coordinates: draft.structure.geometry.coordinates },
      });
    });

    routes.push({
      type: "Feature",
      properties: {
        opgwRouteId: routeId,
        transmissionLineId: cable.properties.lineId,
        routeName: cable.properties.cableName.replace("SYN-OPGW", "Synthetic span OPGW route"),
        fromStructureId: structures[0].properties.id,
        toStructureId: structures[structures.length - 1].properties.id,
        voltageClass,
        routeStatus,
        sourceType: "synthetic-demo",
        syntheticConfidence: confidence,
        routeMiles: Number((totalSectionMiles || cable.properties.routeMiles).toFixed(3)),
        totalStructures: structures.length,
        totalSpans: Math.max(0, structures.length - 1),
        totalCableSections: cableSectionIds.length,
        totalSplicePoints: spliceDrafts.length,
        totalFiberCount: cable.properties.fiberCount,
        availableStrands: routeAvailableStrands || fallbackStrandStats(cable.properties.fiberCount).available,
        assignedStrands: routeAssignedStrands,
        reservedStrands: routeReservedStrands,
        criticalRidingCircuits: routeCriticalServices,
        openWorkOrders: routeOpenWorkOrders,
        outageImpactCount: routeCriticalServices > 0 && confidence === "low" ? 1 : 0,
        synthetic: true,
        warning: assumptionWarning,
        notes: "Synthetic OPGW route. Cable sections are defined from splice point to splice point; spans are structure to structure.",
      },
      geometry: cable.geometry,
    });
  });

  return { routes, cableSections, spanSegments, splicePoints };
}

function splicePointDraftsFor(
  cable: OpgwCableFeature,
  structures: TransmissionStructureFeature[],
  closures: SpliceClosureFeature[],
  lineCode: string,
) {
  const structureById = new Map(structures.map((feature) => [feature.properties.id, feature]));
  const closureByStructureId = new Map<string, SpliceClosureFeature>();
  closures.forEach((closure) => {
    if (structureById.has(closure.properties.structureId)) closureByStructureId.set(closure.properties.structureId, closure);
  });
  const draftsByStructureId = new Map<string, SplicePointDraft>();

  const addDraft = (structure: TransmissionStructureFeature, closure: SpliceClosureFeature | undefined, spliceType: SplicePointDraft["spliceType"]) => {
    const structureToken = structure.properties.structureNumber.replace(/[^A-Za-z0-9]+/g, "-");
    draftsByStructureId.set(structure.properties.id, {
      structure,
      closure,
      spliceType,
      splicePointId: `SP-${lineCode}-${structureToken}`,
    });
  };

  addDraft(structures[0], closureByStructureId.get(structures[0].properties.id), "substation_deadend");
  closures.forEach((closure) => {
    const structure = structureById.get(closure.properties.structureId);
    if (!structure) return;
    addDraft(structure, closure, closure.properties.closureType === "tap_splice" ? "tap" : "line_splice");
  });
  addDraft(structures[structures.length - 1], closureByStructureId.get(structures[structures.length - 1].properties.id), "substation_deadend");

  return [...draftsByStructureId.values()].sort((a, b) => a.structure.properties.sequenceIndex - b.structure.properties.sequenceIndex);
}

function groupSpliceClosuresByCable(cables: OpgwCableFeature[], closures: SpliceClosureFeature[]) {
  const groups = new Map<string, SpliceClosureFeature[]>();
  const parentCableIdsByStructureId = new Map<string, string[]>();
  cables.forEach((cable) => {
    cable.properties.structureIds.forEach((structureId) => {
      parentCableIdsByStructureId.set(structureId, [...(parentCableIdsByStructureId.get(structureId) || []), cable.properties.id]);
    });
  });
  closures.forEach((closure) => {
    const parentCableIds = new Set([
      ...closure.properties.cableIds.filter((cableId) => cables.some((cable) => cable.properties.id === cableId)),
      ...(parentCableIdsByStructureId.get(closure.properties.structureId) || []),
    ]);
    parentCableIds.forEach((cableId) => {
      const current = groups.get(cableId) || [];
      current.push(closure);
      groups.set(cableId, current);
    });
  });
  return groups;
}

function groupPatchPanelsByCable(panels: PatchPanel[]) {
  const groups = new Map<string, PatchPanel[]>();
  panels.forEach((panel) => {
    panel.fiberCableIds.forEach((cableId) => {
      const current = groups.get(cableId) || [];
      current.push(panel);
      groups.set(cableId, current);
    });
  });
  return groups;
}

function buildStrandStats(cables: OpgwCableFeature[], strands: FiberStrand[]) {
  const stats = new Map<string, StrandStats>();
  cables.forEach((cable) => stats.set(cable.properties.id, fallbackStrandStats(cable.properties.fiberCount)));
  if (!strands.length) return stats;
  stats.clear();
  strands.forEach((strand) => {
    const current = stats.get(strand.cableId) || { total: 0, available: 0, assigned: 0, reserved: 0 };
    current.total += 1;
    if (strand.status === "assigned") current.assigned += 1;
    else if (strand.status === "reserved") current.reserved += 1;
    else if (strand.status !== "faulted" && strand.status !== "retired") current.available += 1;
    stats.set(strand.cableId, current);
  });
  cables.forEach((cable) => {
    if (!stats.has(cable.properties.id)) stats.set(cable.properties.id, fallbackStrandStats(cable.properties.fiberCount));
  });
  return stats;
}

function buildAssignmentStats(assignments: FiberAssignment[]) {
  const stats = new Map<string, AssignmentStats>();
  assignments.forEach((assignment) => {
    assignment.cableIds.forEach((cableId) => {
      const current = stats.get(cableId) || emptyAssignmentStats();
      if (isCriticalAssignment(assignment)) current.critical += 1;
      const strandCount = assignment.strandSegments
        .filter((segment) => segment.cableId === cableId)
        .reduce((sum, segment) => sum + segment.strandNumbers.length, 0);
      if (assignment.status === "active") current.assignedStrands += strandCount;
      if (assignment.status === "reserved" || assignment.status === "planned" || assignment.status === "proposed") {
        current.reservedStrands += strandCount;
        current.openWorkOrders += 1;
      }
      stats.set(cableId, current);
    });
  });
  return stats;
}

function fallbackStrandStats(fiberCount: number): StrandStats {
  return { total: fiberCount, available: fiberCount, assigned: 0, reserved: 0 };
}

function emptyAssignmentStats(): AssignmentStats {
  return { critical: 0, assignedStrands: 0, reservedStrands: 0, openWorkOrders: 0 };
}

function addSplicePointSection(map: Map<string, Set<string>>, splicePointId: string, sectionId: string) {
  const current = map.get(splicePointId) || new Set<string>();
  current.add(sectionId);
  map.set(splicePointId, current);
}

function routeStatusFor(cable: OpgwCableFeature): OpgwWorkflowStatus {
  if (cable.properties.status === "planned") return "planned";
  if (cable.properties.status === "proposed") return "design";
  return "synthetic_assumption";
}

function sectionStatusFor(cable: OpgwCableFeature): OpgwCableSectionStatus {
  if (cable.properties.status === "planned") return "planned";
  if (cable.properties.status === "proposed") return "proposed";
  return "assumed";
}

function confidenceFor(id: string, status: OpgwCableFeature["properties"]["status"]) {
  if (status === "planned") return "high";
  if (status === "proposed") return "medium";
  return deterministicScore(id) > 0.76 ? "medium" : "low";
}

function spanStatusFor(id: string): OpgwSpanSegmentStatus {
  const score = deterministicScore(id);
  if (score > 0.985) return "faulted";
  if (score > 0.94) return "issue_found";
  if (score > 0.88) return "work_order_open";
  if (score > 0.8) return "inspection_due";
  return "normal";
}

function outageRiskFor(id: string, criticalCount: number, availableStrands: number, fiberCount: number) {
  const sparePenalty = Math.max(0, 24 - availableStrands) * 1.7;
  const criticalPenalty = Math.min(45, criticalCount * 9);
  const randomPenalty = Math.round(deterministicScore(`${id}-risk`) * 22);
  const capacityRelief = Math.max(0, fiberCount - 24) / 4;
  return Math.max(1, Math.min(100, Math.round(criticalPenalty + sparePenalty + randomPenalty - capacityRelief)));
}

function isCriticalAssignment(assignment: FiberAssignment) {
  return assignment.serviceType === "SEL_ICON"
    || assignment.serviceType === "C37_94"
    || assignment.serviceType === "Protection"
    || assignment.serviceType === "DTT"
    || assignment.serviceType === "SCADA";
}

function lineCodeFor(lineId: string) {
  return lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO";
}

function lengthMiles(coordinates: Coordinate[]) {
  let miles = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    miles += distanceMiles(coordinates[index], coordinates[index + 1]);
  }
  return miles;
}

function distanceMiles(a: Coordinate, b: Coordinate) {
  const earthRadiusMiles = 3958.8;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function deterministicScore(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
