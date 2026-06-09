import type { FiberStrand } from "../lib/types/assets";
import { STRANDS_PATH, createSeededRandom, deriveSpliceBoundedCableSections, readOpgwCables, readSpliceClosures, readStructures, writeJson } from "./fiber-network-utils";

const SEED = "gridassetlink-opgw-v1-strands";
const COLORS = ["Blue", "Orange", "Green", "Brown", "Slate", "White", "Red", "Black", "Yellow", "Violet", "Rose", "Aqua"];

async function main() {
  const rng = createSeededRandom(SEED);
  const cables = await readOpgwCables();
  const structures = await readStructures();
  const closures = await readSpliceClosures();
  const cableSections = deriveSpliceBoundedCableSections(cables.features, structures.features, closures.features);
  const strands: FiberStrand[] = [];

  cableSections.forEach((section) => {
    for (let strandNumber = 1; strandNumber <= section.fiberCount; strandNumber += 1) {
      const darkRoll = rng();
      strands.push({
        id: `${section.id}-STRAND-${String(strandNumber).padStart(3, "0")}`,
        cableId: section.id,
        strandNumber,
        tubeNumber: Math.ceil(strandNumber / 12),
        colorCode: COLORS[(strandNumber - 1) % COLORS.length],
        status: darkRoll < 0.1 ? "dark" : darkRoll < 0.24 ? "spare" : "available",
        notes: `Synthetic strand record generated for splice-to-splice cable ${section.fromSplicePointId} to ${section.toSplicePointId}.`,
      });
    }
  });

  await writeJson(STRANDS_PATH, strands);
  console.log(`Wrote ${strands.length} synthetic fiber strands.`);
}

void main();
