import { NextResponse } from "next/server";
import { allSpliceConnections, buildDemoMutationResponse } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const connection = allSpliceConnections(data).find((row) => row.id === decodeURIComponent(id));
  if (!connection) return NextResponse.json({ error: "Synthetic splice connection not found" }, { status: 404 });
  return NextResponse.json(connection);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  return NextResponse.json(buildDemoMutationResponse("update_splice_connection_preview", { id, ...payload }), { status: 202 });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json(buildDemoMutationResponse("delete_splice_connection_preview", { id }), { status: 202 });
}
