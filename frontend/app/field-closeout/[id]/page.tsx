import { FieldCloseoutPage } from "@/components/WorkOrderPages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <FieldCloseoutPage id={id} />; }
