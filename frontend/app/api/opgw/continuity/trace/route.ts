import { NextResponse } from "next/server";
import { traceSyntheticService } from "@/lib/opgw/continuityEngine";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { serviceId?: string; splicePointId?: string };
  if (!body.serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  const data = await loadSyntheticFiberContinuityData();
  const service = data.syntheticServices.find((item) => item.serviceId === body.serviceId);
  if (!service) return NextResponse.json({ error: "Synthetic service not found" }, { status: 404 });
  return NextResponse.json(traceSyntheticService(service, data, body.splicePointId));
}
