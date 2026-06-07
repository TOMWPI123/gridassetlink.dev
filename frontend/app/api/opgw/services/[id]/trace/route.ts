import { NextResponse } from "next/server";
import { traceSyntheticService } from "@/lib/opgw/continuityEngine";
import { findSyntheticService } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const splicePointId = new URL(request.url).searchParams.get("splicePointId") || undefined;
  const data = await loadSyntheticFiberContinuityData();
  const service = findSyntheticService(id, data);
  if (!service) return NextResponse.json({ error: "Synthetic service not found" }, { status: 404 });
  return NextResponse.json(traceSyntheticService(service, data, splicePointId));
}
