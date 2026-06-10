import { NextResponse } from "next/server";
import { resolveContinuityTraceServices, resolveSelectedSplicePointIdForTrace, traceSyntheticService, type ContinuityTraceInput } from "@/lib/opgw/continuityEngine";
import { compareExistingProposed } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as ContinuityTraceInput;
  if (!hasCompareInput(payload)) {
    return NextResponse.json({
      error: "At least one compare input is required",
      acceptedInputs: ["serviceId", "assignmentId", "strandId", "cableSectionId", "spliceConnectionId", "splicePointId", "spliceClosureId"],
      syntheticFlag: true,
    }, { status: 400 });
  }

  const data = await loadSyntheticFiberContinuityData();
  const selectedSplicePointId = resolveSelectedSplicePointIdForTrace(payload, data);
  const matrixCompareTarget = payload.splicePointId || payload.spliceClosureId || selectedSplicePointId;
  const matrixComparison = matrixCompareTarget
    ? compareExistingProposed(matrixCompareTarget, data)
    : null;
  const existingServices = resolveContinuityTraceServices({ ...payload, layerType: "existing" }, data);
  const proposedServices = resolveContinuityTraceServices({ ...payload, layerType: "proposed" }, data);

  if (!matrixComparison && !existingServices.length && !proposedServices.length) {
    return NextResponse.json({ error: "No synthetic existing/proposed continuity matched this compare input", syntheticFlag: true }, { status: 404 });
  }

  const existingPaths = existingServices.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  const proposedPaths = proposedServices.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  const existingServiceIds = new Set(existingServices.map((service) => service.serviceId));
  const proposedServiceIds = new Set(proposedServices.map((service) => service.serviceId));

  return NextResponse.json({
    input: payload,
    syntheticFlag: true,
    warning: "Synthetic compare preview only. Proposed paths are not committed to existing continuity.",
    matrixComparison,
    existingServiceCount: existingServices.length,
    proposedServiceCount: proposedServices.length,
    existingPaths,
    proposedPaths,
    diffSummary: {
      proposedOnlyServices: proposedServices.filter((service) => !existingServiceIds.has(service.serviceId)).map((service) => service.serviceId),
      existingOnlyServices: existingServices.filter((service) => !proposedServiceIds.has(service.serviceId)).map((service) => service.serviceId),
      existingBrokenPaths: existingPaths.filter((path) => path.hasBrokenContinuity).map((path) => path.serviceId),
      proposedBrokenPaths: proposedPaths.filter((path) => path.hasBrokenContinuity).map((path) => path.serviceId),
      existingWarnings: unique(existingPaths.flatMap((path) => path.warningSummary)),
      proposedWarnings: unique(proposedPaths.flatMap((path) => path.warningSummary)),
    },
  });
}

function hasCompareInput(payload: ContinuityTraceInput) {
  return Boolean(payload.serviceId || payload.assignmentId || payload.strandId || payload.cableSectionId || payload.spliceConnectionId || payload.splicePointId || payload.spliceClosureId);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
