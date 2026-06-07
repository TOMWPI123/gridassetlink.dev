import { NextResponse } from "next/server";
import { buildSpliceManagerView } from "@/lib/opgw/continuityEngine";
import { buildDemoMutationResponse } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const data = await loadSyntheticFiberContinuityData();
  const view = buildSpliceManagerView(id, data);
  if (!view) return NextResponse.json({ error: "Splice point not found" }, { status: 404 });
  return NextResponse.json(buildDemoMutationResponse("commit_proposed_matrix_preview", payload, view), { status: 202 });
}
