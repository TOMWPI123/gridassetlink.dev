import { DeviceOpsIconServicesPage } from "@/components/DeviceOpsPages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeviceOpsIconServicesPage id={id} />;
}
