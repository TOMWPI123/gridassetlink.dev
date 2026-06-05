import { EntityListPage } from "@/components/EntityListPage"; import { entityConfigs } from "@/lib/entities";
export default function Page() { return <EntityListPage config={entityConfigs["fiber-cables"]} />; }
