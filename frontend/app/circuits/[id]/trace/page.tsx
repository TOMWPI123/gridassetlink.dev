import { CircuitTraceDetailPage } from "@/components/CircuitWorkflowPages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CircuitTraceDetailPage id={id} />; }
