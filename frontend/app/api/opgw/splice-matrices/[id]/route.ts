import { NextResponse } from "next/server";
import { findSpliceMatrix } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const matrix = findSpliceMatrix(id, data);
  if (!matrix) return NextResponse.json({ error: "Synthetic splice matrix not found" }, { status: 404 });
  return NextResponse.json(matrix);
}
