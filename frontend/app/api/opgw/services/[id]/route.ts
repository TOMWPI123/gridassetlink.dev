import { NextResponse } from "next/server";
import { findSyntheticService } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const service = findSyntheticService(id, data);
  if (!service) return NextResponse.json({ error: "Synthetic service not found" }, { status: 404 });
  return NextResponse.json(service);
}
