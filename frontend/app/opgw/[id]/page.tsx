import { EntityDetailPage } from "@/components/EntityDetailPage"; import { entityConfigs } from "@/lib/entities";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EntityDetailPage config={entityConfigs.opgw} id={id} />; }
