import type { PatchPanel } from "../lib/types/assets";
import { PATCH_PANELS_PATH, chooseWeighted, createSeededRandom, readOpgwCables, readSpliceClosures, writeJson } from "./fiber-network-utils";

const SEED = "gridassetlink-patch-panels-v1";

async function main() {
  const rng = createSeededRandom(SEED);
  const closures = await readSpliceClosures();
  const cables = await readOpgwCables();
  const cableById = new Map(cables.features.map((cable) => [cable.properties.id, cable.properties]));
  const panels: PatchPanel[] = [];

  closures.features
    .filter((closure) => closure.properties.closureType === "terminal_splice")
    .forEach((closure) => {
      closure.properties.cableIds.forEach((cableId) => {
        const cable = cableById.get(cableId);
        if (!cable) return;
        const panelId = `SYN-PANEL-${String(panels.length + 1).padStart(5, "0")}`;
        panels.push({
          id: panelId,
          name: `${closure.properties.structureNumber} ${cable.fiberCount}F Patch Panel`,
          synthetic: true,
          locationType: "structure",
          locationId: closure.properties.structureId,
          fiberCableIds: [cableId],
          portCount: cable.fiberCount,
          connectorType: chooseWeighted(rng, ["LC", "SC", "ST", "FC", "Unknown"], [0.58, 0.28, 0.04, 0.03, 0.07]),
          ports: Array.from({ length: cable.fiberCount }, (_, index) => ({
            id: `${panelId}-PORT-${String(index + 1).padStart(3, "0")}`,
            panelId,
            portNumber: index + 1,
            cableId,
            strandNumber: index + 1,
            status: "available",
          })),
          notes: "Synthetic terminal patch panel generated for OPGW planning demo only.",
        });
      });
    });

  await writeJson(PATCH_PANELS_PATH, panels);
  console.log(`Wrote ${panels.length} synthetic patch panels.`);
}

void main();
