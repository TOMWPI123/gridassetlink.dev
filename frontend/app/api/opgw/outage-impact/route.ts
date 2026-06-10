import { NextResponse } from "next/server";
import { buildOpgwOutageImpactView, type OpgwOutageImpactTargetType } from "@/lib/opgw/outageImpact";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return respondWithOutageImpact(targetFromSearch(url.searchParams));
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { targetType?: OpgwOutageImpactTargetType; targetId?: string };
  return respondWithOutageImpact(payload);
}

async function respondWithOutageImpact(payload: { targetType?: OpgwOutageImpactTargetType; targetId?: string }) {
  if (!payload.targetType || !payload.targetId) {
    return NextResponse.json({
      error: "targetType and targetId are required",
      acceptedTargetTypes: ["service", "assignment", "splice_point", "splice_closure", "splice_connection", "cable", "cable_section", "span_segment", "strand"],
      syntheticFlag: true,
    }, { status: 400 });
  }

  const data = await loadSyntheticFiberContinuityData();
  const view = buildOpgwOutageImpactView(payload.targetType, payload.targetId, data);
  if (!view) return NextResponse.json({ error: "No synthetic outage-impact services matched this target", syntheticFlag: true }, { status: 404 });
  return NextResponse.json(view);
}

function targetFromSearch(searchParams: URLSearchParams) {
  const pairs: Array<[OpgwOutageImpactTargetType, string | null]> = [
    ["service", searchParams.get("service") || searchParams.get("serviceId")],
    ["assignment", searchParams.get("assignment") || searchParams.get("assignmentId")],
    ["splice_point", searchParams.get("splicePoint") || searchParams.get("splicePointId")],
    ["splice_closure", searchParams.get("spliceClosure") || searchParams.get("spliceClosureId")],
    ["splice_connection", searchParams.get("spliceConnection") || searchParams.get("spliceConnectionId")],
    ["cable", searchParams.get("cable") || searchParams.get("cableId")],
    ["cable_section", searchParams.get("cableSection") || searchParams.get("cableSectionId")],
    ["span_segment", searchParams.get("span") || searchParams.get("spanSegment") || searchParams.get("spanSegmentId")],
    ["strand", searchParams.get("strand") || searchParams.get("strandId")],
  ];
  const target = pairs.find(([, value]) => Boolean(value));
  return { targetType: target?.[0], targetId: target?.[1] || undefined };
}
