import { NextResponse } from "next/server";
import { validateProposedMatrix } from "@/lib/opgw/spliceMatrixApi";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const data = await loadSyntheticFiberContinuityData();
  const validation = validateProposedMatrix(id, data, payload);
  if (!validation) return NextResponse.json({ error: "Splice point not found" }, { status: 404 });
  return NextResponse.json(validation);
}
