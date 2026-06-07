import { NextResponse } from "next/server";
import { allSpliceMatrices } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function GET() {
  const data = await loadSyntheticFiberContinuityData();
  return NextResponse.json({
    syntheticFlag: true,
    warning: "Synthetic demo splice matrices only. Existing matrices are read-only.",
    matrices: allSpliceMatrices(data),
  });
}
