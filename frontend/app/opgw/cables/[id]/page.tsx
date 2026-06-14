import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpgwCableContinuityPage } from "@/components/OpgwCableContinuityPage";
import { buildOpgwCableContinuityView } from "@/lib/opgw/cableContinuity";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `OPGW Cable ${decodeURIComponent(id)} | GridAssetLink` };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const view = buildOpgwCableContinuityView(id, data);
  if (!view) notFound();
  const cableModules = data.opgwCables.map((feature) => {
    const cable = feature.properties;
    return {
      id: cable.id,
      cableName: cable.cableName,
      lineId: cable.lineId,
      lineName: cable.lineName || cable.lineId,
      status: cable.status,
      fiberCount: cable.fiberCount,
      routeMiles: cable.routeMiles,
      spliceClosureCount: cable.connectedSpliceClosureIds.length,
    };
  });
  return <OpgwCableContinuityPage view={view} cableModules={cableModules} />;
}
