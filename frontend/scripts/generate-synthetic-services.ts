import type { FiberAssignment, PatchPanel, SyntheticService } from "../lib/types/assets";
import { FIBER_ASSIGNMENTS_PATH, PATCH_PANELS_PATH, SYNTHETIC_SERVICES_PATH, readJson, readOpgwCables, readSpliceClosures, writeJson } from "./fiber-network-utils";

const SERVICE_BLUEPRINTS: Array<{
  id: string;
  name: string;
  type: SyntheticService["serviceType"];
  criticality: SyntheticService["criticality"];
  protection: SyntheticService["protectionLevel"];
  latency: SyntheticService["latencyClass"];
  status: SyntheticService["operationalStatus"];
  layer: SyntheticService["layerType"];
  continuityStatus: NonNullable<SyntheticService["continuityStatus"]>;
}> = [
  { id: "DEMO-SCADA-001", name: "DEMO SCADA backbone continuity", type: "SCADA synthetic demo", criticality: "high", protection: "diverse_path", latency: "low_latency", status: "active_synthetic", layer: "existing", continuityStatus: "complete" },
  { id: "DEMO-RELAY-PROTECTION-001", name: "DEMO relay protection channel", type: "Relay/protection synthetic demo", criticality: "critical", protection: "ring_protected", latency: "protection_grade", status: "active_synthetic", layer: "existing", continuityStatus: "complete" },
  { id: "DEMO-SEL-ICON-001", name: "DEMO SEL ICON transport service", type: "SEL ICON synthetic demo", criticality: "critical", protection: "ring_protected", latency: "protection_grade", status: "active_synthetic", layer: "existing", continuityStatus: "complete" },
  { id: "DEMO-MICROWAVE-BACKHAUL-001", name: "DEMO microwave backhaul handoff", type: "Microwave backhaul synthetic demo", criticality: "medium", protection: "backup_available", latency: "normal", status: "planned", layer: "proposed", continuityStatus: "proposed_change" },
  { id: "DEMO-SUBSTATION-LAN-001", name: "DEMO substation LAN extension", type: "Substation LAN synthetic demo", criticality: "medium", protection: "single_path", latency: "normal", status: "active_synthetic", layer: "existing", continuityStatus: "complete" },
  { id: "DEMO-EMS-RTU-001", name: "DEMO EMS RTU telemetry", type: "EMS/RTU synthetic demo", criticality: "high", protection: "diverse_path", latency: "low_latency", status: "active_synthetic", layer: "existing", continuityStatus: "complete" },
  { id: "DEMO-DARK-FIBER-001", name: "DEMO dark fiber reservation", type: "Dark fiber synthetic demo", criticality: "low", protection: "none", latency: "best_effort", status: "planned", layer: "proposed", continuityStatus: "proposed_change" },
  { id: "DEMO-LEASED-FIBER-001", name: "DEMO leased fiber transition", type: "Leased fiber synthetic demo", criticality: "medium", protection: "backup_available", latency: "normal", status: "proposed", layer: "proposed", continuityStatus: "proposed_change" },
  { id: "DEMO-DERMS-COMMS-001", name: "DEMO DERMS communications path", type: "DERMS communications synthetic demo", criticality: "medium", protection: "single_path", latency: "normal", status: "broken_demo", layer: "existing", continuityStatus: "broken" },
  { id: "DEMO-VOICE-OPERATIONS-001", name: "DEMO voice operations backup", type: "Voice operations synthetic demo", criticality: "low", protection: "backup_available", latency: "best_effort", status: "planned", layer: "proposed", continuityStatus: "proposed_fix" },
];

async function main() {
  const cables = await readOpgwCables();
  const closures = await readSpliceClosures();
  const assignments = await readJson<FiberAssignment[]>(FIBER_ASSIGNMENTS_PATH, []);
  const patchPanels = await readJson<PatchPanel[]>(PATCH_PANELS_PATH, []);
  const usableAssignments = assignments.filter((assignment) => assignment.cableIds.length > 0);
  const services = SERVICE_BLUEPRINTS.map((blueprint, index): SyntheticService => {
    const primary = usableAssignments[index % Math.max(1, usableAssignments.length)];
    const backup = usableAssignments[(index + 7) % Math.max(1, usableAssignments.length)];
    const cableWindow = cables.features.slice(index * 2, index * 2 + (index < 3 ? 3 : 2));
    const continuityCableIds = unique([...(primary?.cableIds || []), ...cableWindow.map((feature) => feature.properties.id)]).slice(0, index < 3 ? 4 : 2);
    const relatedClosureIds = closures.features
      .filter((closure) => closure.properties.cableIds.some((cableId) => continuityCableIds.includes(cableId)))
      .slice(0, 8)
      .map((closure) => closure.properties.id);
    const endpointPanels = patchPanels.filter((panel) => panel.fiberCableIds.some((cableId) => continuityCableIds.includes(cableId)));
    const aPanel = endpointPanels[0];
    const zPanel = endpointPanels[endpointPanels.length - 1];
    return {
      serviceId: blueprint.id,
      serviceName: blueprint.name,
      serviceType: blueprint.type,
      serviceDescription: `${blueprint.name} using synthetic OPGW planning records only.`,
      fromSiteId: primary?.aEndStructureId || continuityCableIds[0] || "DEMO-A-END",
      fromSiteName: primary?.aEndStructureId || "DEMO A-end synthetic structure",
      toSiteId: primary?.zEndStructureId || continuityCableIds[continuityCableIds.length - 1] || "DEMO-Z-END",
      toSiteName: primary?.zEndStructureId || "DEMO Z-end synthetic structure",
      endpointAPatchPanelId: aPanel?.id,
      endpointAPort: aPanel?.ports.find((port) => port.assignmentId === primary?.id)?.id || "DEMO-A-PORT",
      endpointZPatchPanelId: zPanel?.id,
      endpointZPort: zPanel?.ports.find((port) => port.assignmentId === primary?.id)?.id || "DEMO-Z-PORT",
      primaryPathAssignmentId: primary?.id,
      backupPathAssignmentId: blueprint.protection === "none" ? undefined : backup?.id,
      criticality: blueprint.criticality,
      protectionLevel: blueprint.protection,
      latencyClass: blueprint.latency,
      operationalStatus: blueprint.status,
      layerType: blueprint.layer,
      syntheticFlag: true,
      continuityCableIds,
      continuitySpliceClosureIds: relatedClosureIds,
      continuityStatus: blueprint.continuityStatus,
      notes: "Synthetic demo service. Does not represent real SCADA, relay, protection, telecom, or private fiber routing.",
    };
  });

  await writeJson(SYNTHETIC_SERVICES_PATH, services);
  console.log(`Wrote ${services.length} synthetic OPGW services.`);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

void main();
