import { NextResponse } from "next/server";
import { traceSyntheticService } from "@/lib/opgw/continuityEngine";
import { findSyntheticService } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { serviceId?: string; splicePointId?: string };
  if (!payload.serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  const data = await loadSyntheticFiberContinuityData();
  const service = findSyntheticService(payload.serviceId, data);
  if (!service) return NextResponse.json({ error: "Synthetic service not found" }, { status: 404 });
  const trace = traceSyntheticService(service, data, payload.splicePointId);
  return NextResponse.json({
    validForDemoPreview: !trace.hasBrokenContinuity,
    syntheticFlag: true,
    persisted: false,
    trace,
    warning: "Synthetic continuity validation only. Not authoritative for operations.",
  });
}
