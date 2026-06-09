import type { FiberSplice } from "../lib/types/assets";
import { FIBER_SPLICES_PATH, SPLICE_CLOSURES_PATH, createSeededRandom, deriveSpliceBoundedCableSections, readOpgwCables, readSpliceClosures, readStructures, round, writeJson, writeSpliceClosures } from "./fiber-network-utils";

const SEED = "gridassetlink-splices-v1-matrix";

async function main() {
  const rng = createSeededRandom(SEED);
  const closures = await readSpliceClosures();
  const cables = await readOpgwCables();
  const structures = await readStructures();
  const cableSections = deriveSpliceBoundedCableSections(cables.features, structures.features, closures.features);
  const cableById = new Map(cableSections.map((section) => [section.id, section]));
  const splices: FiberSplice[] = [];

  closures.features.forEach((closure) => {
    const cableIds = closure.properties.cableIds;
    const cable = cableById.get(cableIds[0]);
    if (!cable) return;
    if (cableIds.length >= 2) {
      const second = cableById.get(cableIds[1]);
      const maxStrands = Math.min(cable.fiberCount, second?.fiberCount || cable.fiberCount);
      for (let strand = 1; strand <= maxStrands; strand += 1) splices.push(makeSplice(closure.properties.id, cableIds[0], strand, cableIds[1], strand, "straight_through", rng));
    } else {
      const maxRecords = closure.properties.closureType === "terminal_splice" ? Math.min(cable.fiberCount, 24) : Math.min(cable.fiberCount, 36);
      for (let strand = 1; strand <= maxRecords; strand += 1) {
        const spliceType = closure.properties.closureType === "terminal_splice" ? "open" : strand % 12 === 0 ? "reserved" : "express";
        splices.push(makeSplice(closure.properties.id, cableIds[0], strand, cableIds[0], strand, spliceType, rng));
      }
    }
  });

  const countByClosure = new Map<string, number>();
  splices.forEach((splice) => countByClosure.set(splice.spliceClosureId, (countByClosure.get(splice.spliceClosureId) || 0) + 1));
  closures.features.forEach((closure) => {
    closure.properties.spliceCount = countByClosure.get(closure.properties.id) || 0;
  });

  await writeJson(FIBER_SPLICES_PATH, splices);
  await writeSpliceClosures(closures);
  await writeJson(SPLICE_CLOSURES_PATH, closures);
  console.log(`Wrote ${splices.length} synthetic fiber splices.`);
}

function makeSplice(spliceClosureId: string, fromCableId: string, fromStrandNumber: number, toCableId: string, toStrandNumber: number, spliceType: FiberSplice["spliceType"], rng: () => number): FiberSplice {
  return {
    id: `${spliceClosureId}-SPL-${String(fromStrandNumber).padStart(3, "0")}-${spliceType}`,
    spliceClosureId,
    fromCableId,
    fromStrandNumber,
    toCableId,
    toStrandNumber,
    spliceType,
    lossDb: spliceType === "open" ? 0 : round(0.02 + rng() * 0.1, 3),
    status: spliceType === "reserved" ? "planned" : "existing",
    notes: "Synthetic splice matrix row for demo planning only.",
  };
}

void main();
