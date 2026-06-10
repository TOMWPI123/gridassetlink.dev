import { NextResponse } from "next/server";
import { buildSpliceManagerView, traceSyntheticService } from "@/lib/opgw/continuityEngine";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";
import type { SyntheticService } from "@/lib/types/assets";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as TraceRequestPayload;
  const data = await loadSyntheticFiberContinuityData();
  const normalizedServiceId = body.serviceId ? decodeURIComponent(body.serviceId) : undefined;

  const selectedSplicePointId = resolveSelectedSplicePointId(body, data);

  if (normalizedServiceId && !body.assignmentId && !body.strandId && !body.cableSectionId && !body.spliceClosureId && !body.layerType) {
    const service = data.syntheticServices.find((item) => item.serviceId === normalizedServiceId);
    if (!service) return NextResponse.json({ error: "Synthetic service not found" }, { status: 404 });
    return NextResponse.json(traceSyntheticService(service, data, selectedSplicePointId));
  }

  const services = resolveTraceServices(body, data.syntheticServices, data);
  const filteredServices = filterServicesByLayer(services, body.layerType);
  if (!filteredServices.length) {
    return NextResponse.json({
      error: "No synthetic services matched the requested continuity trace input",
      acceptedInputs: ["serviceId", "assignmentId", "strandId", "cableSectionId", "splicePointId", "spliceClosureId", "layerType"],
      syntheticFlag: true,
    }, { status: 404 });
  }

  const paths = filteredServices.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  return NextResponse.json({
    input: body,
    layerType: body.layerType || "compare",
    syntheticFlag: true,
    warning: "Synthetic demo continuity only. Public transmission references do not prove real OPGW, SCADA, relay, protection, telecom, or private fiber routing.",
    serviceCount: filteredServices.length,
    pathCount: paths.length,
    services: filteredServices.map((service) => ({
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      serviceType: service.serviceType,
      criticality: service.criticality,
      protectionLevel: service.protectionLevel,
      layerType: service.layerType,
      operationalStatus: service.operationalStatus,
    })),
    paths,
    summary: {
      transmissionLines: unique(paths.flatMap((path) => path.segments.map((segment) => segment.transmissionLineId).filter(Boolean))).length,
      cableSections: unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "cable_section").map((segment) => segment.objectId))).length,
      spanSegments: unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "span_segment").map((segment) => segment.objectId))).length,
      splicePoints: unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "splice_point").map((segment) => segment.objectId))).length,
      patchPanels: unique(paths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "patch_panel").map((segment) => segment.objectId))).length,
      warnings: unique(paths.flatMap((path) => path.warningSummary)),
    },
  });
}

type TraceRequestPayload = {
  serviceId?: string;
  assignmentId?: string;
  strandId?: string;
  cableSectionId?: string;
  splicePointId?: string;
  spliceClosureId?: string;
  layerType?: "existing" | "proposed" | "compare";
};

type ContinuityData = Awaited<ReturnType<typeof loadSyntheticFiberContinuityData>>;

function resolveTraceServices(payload: TraceRequestPayload, services: SyntheticService[], data: ContinuityData) {
  const matched = new Map<string, SyntheticService>();
  const add = (service: SyntheticService | undefined) => {
    if (service) matched.set(service.serviceId, service);
  };

  if (payload.serviceId) add(services.find((service) => service.serviceId === decodeURIComponent(payload.serviceId || "")));
  if (payload.assignmentId) {
    const assignmentId = decodeURIComponent(payload.assignmentId);
    services
      .filter((service) => service.primaryPathAssignmentId === assignmentId || service.backupPathAssignmentId === assignmentId)
      .forEach(add);
  }
  if (payload.strandId) {
    const strandId = decodeURIComponent(payload.strandId);
    const strand = (data.fiberStrands || []).find((item) => item.id === strandId);
    if (strand?.assignmentId) {
      services
        .filter((service) => service.primaryPathAssignmentId === strand.assignmentId || service.backupPathAssignmentId === strand.assignmentId)
        .forEach(add);
    }
    if (strand?.cableId) addServicesForCableIds(new Set([strand.cableId]), services, matched);
  }
  if (payload.cableSectionId) {
    const cableSectionId = decodeURIComponent(payload.cableSectionId);
    const section = data.opgwCableSections.find((item) => item.properties.cableSectionId === cableSectionId);
    if (section) addServicesForCableSection(section.properties.opgwRouteId, services, data, matched);
  }
  if (payload.splicePointId) {
    const view = buildSpliceManagerView(payload.splicePointId, data);
    view?.services.forEach(add);
  }
  if (payload.spliceClosureId) {
    const view = buildSpliceManagerView(payload.spliceClosureId, data);
    view?.services.forEach(add);
  }

  return Array.from(matched.values());
}

function resolveSelectedSplicePointId(payload: TraceRequestPayload, data: ContinuityData) {
  if (payload.splicePointId) return buildSpliceManagerView(payload.splicePointId, data)?.header.splicePointId || decodeURIComponent(payload.splicePointId);
  if (payload.spliceClosureId) return buildSpliceManagerView(payload.spliceClosureId, data)?.header.splicePointId;
  return undefined;
}

function addServicesForCableSection(routeId: string, services: SyntheticService[], data: ContinuityData, matched: Map<string, SyntheticService>) {
  const cableIds = new Set(
    data.opgwCables
      .filter((cable) => opgwRouteIdForCable(cable.properties.lineId) === routeId)
      .map((cable) => cable.properties.id),
  );
  addServicesForCableIds(cableIds, services, matched);
}

function addServicesForCableIds(cableIds: Set<string>, services: SyntheticService[], matched: Map<string, SyntheticService>) {
  services
    .filter((service) => service.continuityCableIds?.some((cableId) => cableIds.has(cableId)))
    .forEach((service) => matched.set(service.serviceId, service));
}

function filterServicesByLayer(services: SyntheticService[], layerType: TraceRequestPayload["layerType"]) {
  if (!layerType || layerType === "compare") return services;
  if (layerType === "existing") return services.filter((service) => service.layerType === "existing");
  return services.filter((service) => service.layerType === "proposed" || service.operationalStatus === "planned" || service.operationalStatus === "proposed");
}

function opgwRouteIdForCable(lineId: string) {
  return `OPGW-${lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO"}`;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
