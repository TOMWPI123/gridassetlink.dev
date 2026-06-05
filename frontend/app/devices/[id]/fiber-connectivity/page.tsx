import { DeviceFiberConnectivityPage } from "@/components/FiberWorkflowPages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeviceFiberConnectivityPage id={id} />;
}
