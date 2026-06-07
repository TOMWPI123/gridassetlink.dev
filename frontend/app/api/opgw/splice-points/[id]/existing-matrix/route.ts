import { NextResponse } from "next/server";
import { matricesForSplicePoint } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const matrices = matricesForSplicePoint(id, data);
  if (!matrices) return NextResponse.json({ error: "Splice point not found" }, { status: 404 });
  return NextResponse.json(matrices.existingMatrix);
}
