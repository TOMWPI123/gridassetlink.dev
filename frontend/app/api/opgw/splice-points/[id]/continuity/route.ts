import { NextResponse } from "next/server";
import { buildSpliceManagerView } from "@/lib/opgw/continuityEngine";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const view = buildSpliceManagerView(id, data);
  if (!view) return NextResponse.json({ error: "Splice point not found" }, { status: 404 });
  return NextResponse.json(view.continuityPaths);
}
