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
  return <OpgwCableContinuityPage view={view} />;
}
