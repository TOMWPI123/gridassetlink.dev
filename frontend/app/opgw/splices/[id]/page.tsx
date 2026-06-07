import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpliceManagerClient } from "@/components/SpliceManagerClient";
import { buildSpliceManagerView } from "@/lib/opgw/continuityEngine";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Splice Manager ${decodeURIComponent(id)} | GridAssetLink` };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const data = await loadSyntheticFiberContinuityData();
  const view = buildSpliceManagerView(id, data);
  if (!view) notFound();
  return <SpliceManagerClient view={view} />;
}
