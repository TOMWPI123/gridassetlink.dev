import { NextResponse } from "next/server";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function GET() {
  const data = await loadSyntheticFiberContinuityData();
  return NextResponse.json(data.syntheticServices);
}
