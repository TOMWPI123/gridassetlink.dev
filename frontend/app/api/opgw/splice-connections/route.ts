import { NextResponse } from "next/server";
import { allSpliceConnections, buildDemoMutationResponse } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function GET() {
  const data = await loadSyntheticFiberContinuityData();
  return NextResponse.json({
    syntheticFlag: true,
    warning: "Synthetic demo splice connections only. Existing connections are read-only.",
    connections: allSpliceConnections(data),
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  return NextResponse.json(buildDemoMutationResponse("create_splice_connection_preview", payload), { status: 202 });
}
