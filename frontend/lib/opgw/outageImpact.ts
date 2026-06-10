import { buildSpliceManagerView, traceSyntheticService, type FiberContinuityData } from "@/lib/opgw/continuityEngine";
import type { FiberContinuityPath, SyntheticService } from "@/lib/types/assets";

export type OpgwOutageImpactTargetType =
  | "service"
  | "splice_point"
  | "splice_closure"
  | "cable"
  | "cable_section"
  | "span_segment"
  | "strand";

export type OpgwOutageImpactView = {
  targetType: OpgwOutageImpactTargetType;
  targetId: string;
  targetLabel: string;
  syntheticFlag: true;
  warning: string;
  serviceCount: number;
  criticalServiceCount: number;
  highestCriticality: string;
  impactedTransmissionLines: string[];
  impactedCableSections: string[];
  impactedSpanSegments: string[];
  impactedSplicePoints: string[];
  impactedPatchPanels: string[];
  estimatedRouteMiles: number;
  estimatedLossDb: number;
  warnings: string[];
  services: Array<{
    serviceId: string;
    serviceName: string;
    serviceType: string;
    criticality: string;
    protectionLevel: string;
    operationalStatus: string;
    layerType: string;
    pathStatus: string;
    transmissionLines: number;
    cableSections: number;
    spanSegments: number;
    splicePoints: number;
    estimatedLossDb: number;
    warningCount: number;
  }>;
  paths: FiberContinuityPath[];
};

export function buildOpgwOutageImpactView(
  targetType: OpgwOutageImpactTargetType,
  targetId: string,
  data: FiberContinuityData,
): OpgwOutageImpactView | null {
  const normalizedId = decodeURIComponent(targetId);
  const services = resolveServicesForOutageTarget(targetType, normalizedId, data);
  if (!services.length) return null;

  const selectedSplicePointId =
    targetType === "splice_point" || targetType === "splice_closure"
      ? buildSpliceManagerView(normalizedId, data)?.header.splicePointId
      : undefined;
  const paths = services.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  const impactedTransmissionLines = unique(paths.flatMap((path) => path.segments.map((segment) => segment.transmissionLineId).filter(Boolean) as string[]));
  const impactedCableSections = unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "cable_section").map((segment) => segment.objectId)));
  const impactedSpanSegments = unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "span_segment").map((segment) => segment.objectId)));
  const impactedSplicePoints = unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "splice_point").map((segment) => segment.objectId)));
  const impactedPatchPanels = unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "patch_panel").map((segment) => segment.objectId)));
  const warnings = unique([
    "Synthetic outage-impact preview only. Not authoritative for operations, protection, SCADA, restoration, dispatch, telecom routing, or CEII analysis.",
    ...paths.flatMap((path) => path.warningSummary),
  ]);

  return {
    targetType,
    targetId: normalizedId,
    targetLabel: targetLabelFor(targetType, normalizedId, data),
    syntheticFlag: true,
    warning: "Synthetic demo outage impact only. Public transmission references do not prove real OPGW, SCADA, relay, protection, telecom, or private fiber routing.",
    serviceCount: services.length,
    criticalServiceCount: services.filter((service) => service.criticality === "high" || service.criticality === "critical").length,
    highestCriticality: highestCriticality(services),
    impactedTransmissionLines,
    impactedCableSections,
    impactedSpanSegments,
    impactedSplicePoints,
    impactedPatchPanels,
    estimatedRouteMiles: Number(paths.reduce((sum, path) => sum + path.totalRouteMiles, 0).toFixed(3)),
    estimatedLossDb: Number(paths.reduce((sum, path) => sum + path.totalEstimatedLossDb, 0).toFixed(3)),
    warnings,
    services: services.map((service) => {
      const path = paths.find((item) => item.serviceId === service.serviceId);
      return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        serviceType: service.serviceType,
        criticality: service.criticality,
        protectionLevel: service.protectionLevel,
        operationalStatus: service.operationalStatus,
        layerType: service.layerType,
        pathStatus: path?.pathStatus || "warning",
        transmissionLines: path?.totalTransmissionLines || 0,
        cableSections: path?.totalCableSections || 0,
        spanSegments: path?.totalSpanSegments || 0,
        splicePoints: path?.totalSplicePoints || 0,
        estimatedLossDb: path?.totalEstimatedLossDb || 0,
        warningCount: path?.warningSummary.length || 0,
      };
    }),
    paths,
  };
}

function resolveServicesForOutageTarget(targetType: OpgwOutageImpactTargetType, targetId: string, data: FiberContinuityData) {
  const matched = new Map<string, SyntheticService>();
  const add = (service: SyntheticService | undefined) => {
    if (service) matched.set(service.serviceId, service);
  };

  if (targetType === "service") add(data.syntheticServices.find((service) => service.serviceId === targetId));
  if (targetType === "splice_point" || targetType === "splice_closure") buildSpliceManagerView(targetId, data)?.services.forEach(add);
  if (targetType === "cable") addServicesForCableIds(new Set([targetId]), data, matched);
  if (targetType === "cable_section") {
    const section = data.opgwCableSections.find((item) => item.properties.cableSectionId === targetId);
    if (section) addServicesForRoute(section.properties.opgwRouteId, data, matched);
  }
  if (targetType === "span_segment") {
    const span = data.opgwSpanSegments.find((item) => item.properties.spanSegmentId === targetId);
    if (span) addServicesForRoute(span.properties.opgwRouteId, data, matched);
  }
  if (targetType === "strand") {
    const strand = (data.fiberStrands || []).find((item) => item.id === targetId);
    if (strand?.assignmentId) {
      data.syntheticServices
        .filter((service) => service.primaryPathAssignmentId === strand.assignmentId || service.backupPathAssignmentId === strand.assignmentId)
        .forEach(add);
    }
    if (strand?.cableId) addServicesForCableIds(new Set([strand.cableId]), data, matched);
  }

  return Array.from(matched.values());
}

function addServicesForRoute(routeId: string, data: FiberContinuityData, matched: Map<string, SyntheticService>) {
  const cableIds = new Set(
    data.opgwCables
      .filter((cable) => opgwRouteIdForLineId(cable.properties.lineId) === routeId)
      .map((cable) => cable.properties.id),
  );
  addServicesForCableIds(cableIds, data, matched);
}

function addServicesForCableIds(cableIds: Set<string>, data: FiberContinuityData, matched: Map<string, SyntheticService>) {
  data.syntheticServices
    .filter((service) => service.continuityCableIds?.some((cableId) => cableIds.has(cableId)))
    .forEach((service) => matched.set(service.serviceId, service));
}

function targetLabelFor(targetType: OpgwOutageImpactTargetType, targetId: string, data: FiberContinuityData) {
  if (targetType === "service") return data.syntheticServices.find((service) => service.serviceId === targetId)?.serviceName || targetId;
  if (targetType === "cable") return data.opgwCables.find((cable) => cable.properties.id === targetId)?.properties.cableName || targetId;
  if (targetType === "cable_section") return data.opgwCableSections.find((section) => section.properties.cableSectionId === targetId)?.properties.cableSectionId || targetId;
  if (targetType === "span_segment") return data.opgwSpanSegments.find((span) => span.properties.spanSegmentId === targetId)?.properties.spanSegmentId || targetId;
  if (targetType === "splice_point") return data.opgwSplicePoints.find((point) => point.properties.splicePointId === targetId)?.properties.structureNumber || targetId;
  if (targetType === "splice_closure") return data.spliceClosures.find((closure) => closure.properties.id === targetId)?.properties.name || targetId;
  return targetId;
}

function highestCriticality(services: SyntheticService[]) {
  const order = ["low", "medium", "high", "critical"];
  return services.reduce((highest, service) => order.indexOf(service.criticality) > order.indexOf(highest) ? service.criticality : highest, "low");
}

function opgwRouteIdForLineId(lineId: string) {
  return `OPGW-${lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO"}`;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
