import { NextResponse } from "next/server";
import {
  resolveContinuityTraceServices,
  resolveSelectedSplicePointIdForTrace,
  traceSyntheticService,
  type ContinuityTraceInput,
} from "@/lib/opgw/continuityEngine";
import { findSyntheticService } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as ContinuityTraceInput;
  if (!hasValidationInput(payload)) {
    return NextResponse.json({
      error: "At least one validation input is required",
      acceptedInputs: ["serviceId", "assignmentId", "strandId", "cableSectionId", "spliceConnectionId", "splicePointId", "spliceClosureId", "layerType"],
      syntheticFlag: true,
    }, { status: 400 });
  }
  const data = await loadSyntheticFiberContinuityData();
  const selectedSplicePointId = resolveSelectedSplicePointIdForTrace(payload, data);
  const directService = payload.serviceId ? findSyntheticService(payload.serviceId, data) : undefined;
  const services = directService ? [directService] : resolveContinuityTraceServices(payload, data);
  if (!services.length) return NextResponse.json({ error: "Synthetic continuity target not found", syntheticFlag: true }, { status: 404 });
  const traces = services.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  const brokenTraces = traces.filter((trace) => trace.hasBrokenContinuity || trace.hasFaultedSection);
  return NextResponse.json({
    validForDemoPreview: brokenTraces.length === 0,
    syntheticFlag: true,
    persisted: false,
    serviceCount: services.length,
    pathCount: traces.length,
    trace: traces[0],
    traces,
    validationIssues: brokenTraces.map((trace) => ({
      serviceId: trace.serviceId,
      severity: trace.hasBrokenContinuity ? "critical" : "warning",
      message: trace.warningSummary[0] || "Synthetic continuity warning detected.",
    })),
    warning: "Synthetic continuity validation only. Not authoritative for operations.",
  });
}

function hasValidationInput(payload: ContinuityTraceInput) {
  return Boolean(payload.serviceId || payload.assignmentId || payload.strandId || payload.cableSectionId || payload.spliceConnectionId || payload.splicePointId || payload.spliceClosureId);
}
