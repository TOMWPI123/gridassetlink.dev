import { NextResponse } from "next/server";
import { resolveContinuityTraceServices, resolveSelectedSplicePointIdForTrace, traceSyntheticService, type ContinuityTraceInput } from "@/lib/opgw/continuityEngine";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as ContinuityTraceInput;
  const data = await loadSyntheticFiberContinuityData();
  const normalizedServiceId = body.serviceId ? decodeURIComponent(body.serviceId) : undefined;

  const selectedSplicePointId = resolveSelectedSplicePointIdForTrace(body, data);

  if (normalizedServiceId && !body.assignmentId && !body.strandId && !body.cableSectionId && !body.spliceClosureId && !body.layerType) {
    const service = data.syntheticServices.find((item) => item.serviceId === normalizedServiceId);
    if (!service) return NextResponse.json({ error: "Synthetic service not found" }, { status: 404 });
    return NextResponse.json(traceSyntheticService(service, data, selectedSplicePointId));
  }

  const services = resolveContinuityTraceServices(body, data);
  if (!services.length) {
    return NextResponse.json({
      error: "No synthetic services matched the requested continuity trace input",
      acceptedInputs: ["serviceId", "assignmentId", "strandId", "cableSectionId", "splicePointId", "spliceClosureId", "layerType"],
      syntheticFlag: true,
    }, { status: 404 });
  }

  const paths = services.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  return NextResponse.json({
    input: body,
    layerType: body.layerType || "compare",
    syntheticFlag: true,
    warning: "Synthetic demo continuity only. Public transmission references do not prove real OPGW, SCADA, relay, protection, telecom, or private fiber routing.",
    serviceCount: services.length,
    pathCount: paths.length,
    services: services.map((service) => ({
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

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
