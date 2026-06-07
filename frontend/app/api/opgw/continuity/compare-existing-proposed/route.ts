import { NextResponse } from "next/server";
import { compareExistingProposed } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { splicePointId?: string };
  if (!payload.splicePointId) return NextResponse.json({ error: "splicePointId is required" }, { status: 400 });
  const data = await loadSyntheticFiberContinuityData();
  const comparison = compareExistingProposed(payload.splicePointId, data);
  if (!comparison) return NextResponse.json({ error: "Splice point not found" }, { status: 404 });
  return NextResponse.json(comparison);
}
