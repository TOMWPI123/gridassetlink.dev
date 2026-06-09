import type { SpliceClosureCollection, SpliceClosureFeature } from "../lib/types/assets";
import { SPLICE_CLOSURES_PATH, SYNTHETIC_DISCLAIMER, createSeededRandom, nearestStructureByMile, readOpgwCables, readStructures, round, statusForIndex, unique, writeJson, writeOpgwCables, writeSpliceClosures, writeStructures } from "./fiber-network-utils";

const SEED = "gridassetlink-splices-v1";

async function main() {
  const rng = createSeededRandom(SEED);
  const structures = await readStructures();
  const cables = await readOpgwCables();
  const structureById = new Map(structures.features.map((feature) => [feature.properties.id, feature]));
  const closures: SpliceClosureFeature[] = [];

  cables.features.forEach((cable, cableIndex) => {
    const cableStructures = cable.properties.structureIds
      .map((id) => structureById.get(id))
      .filter(Boolean)
      .sort((a, b) => (a!.properties.sequenceIndex - b!.properties.sequenceIndex)) as NonNullable<ReturnType<typeof structureById.get>>[];
    if (!cableStructures.length) return;

    const selected = new Map<string, SpliceClosureFeature["properties"]["closureType"]>();
    selected.set(cableStructures[0].properties.id, "terminal_splice");
    selected.set(cableStructures[cableStructures.length - 1].properties.id, "terminal_splice");

    let nextMile = 5 + rng() * 7;
    while (nextMile < cable.properties.routeMiles - 0.5) {
      const structure = nearestStructureByMile(cableStructures, nextMile);
      selected.set(structure.properties.id, rng() < 0.18 ? "tap_splice" : "midspan_splice");
      nextMile += 5 + rng() * 7;
    }

    if (cable.properties.routeMiles > 12 && rng() < 0.28) {
      const tap = cableStructures[Math.max(1, Math.min(cableStructures.length - 2, Math.floor(rng() * cableStructures.length)))];
      selected.set(tap.properties.id, "tap_splice");
    }

    [...selected.entries()].forEach(([structureId, closureType], closureIndex) => {
      const structure = structureById.get(structureId);
      if (!structure) return;
      const closureId = `SYN-SPLICE-${String(closures.length + 1).padStart(5, "0")}`;
      closures.push({
        type: "Feature",
        properties: {
          id: closureId,
          name: `${structure.properties.structureNumber} ${closureType.replaceAll("_", " ")}`,
          synthetic: true,
          source: "synthetic-demo",
          closureType,
          structureId,
          structureNumber: structure.properties.structureNumber,
          latitude: structure.properties.latitude,
          longitude: structure.properties.longitude,
          cableIds: [cable.properties.id],
          spliceCount: 0,
          status: statusForIndex(cableIndex + closureIndex),
          installType: closureType === "terminal_splice" ? "terminal" : "aerial",
          notes: `${SYNTHETIC_DISCLAIMER} Closure is mounted on a synthetic transmission structure for demo planning only.`,
        },
        geometry: { type: "Point", coordinates: [structure.properties.longitude, structure.properties.latitude] },
      });
      structure.properties.hasSplice = true;
      structure.properties.structureType = closureType === "terminal_splice" ? "terminal" : "splice";
      structure.properties.spliceClosureIds = unique([...structure.properties.spliceClosureIds, closureId]);
    });
  });

  cables.features.forEach((cable) => {
    cable.properties.connectedSpliceClosureIds = closures
      .filter((closure) => closure.properties.cableIds.includes(cable.properties.id))
      .map((closure) => closure.properties.id);
  });

  const collection: SpliceClosureCollection = { type: "FeatureCollection", features: closures };
  await writeSpliceClosures(collection, {
    sourceName: "GridAssetLink synthetic splice closures",
    sourceType: "synthetic-planning",
    generatedAt: new Date().toISOString(),
    seed: SEED,
    featureCount: closures.length,
    disclaimer: SYNTHETIC_DISCLAIMER,
  });
  await writeStructures(structures);
  await writeOpgwCables(cables);
  await writeJson(SPLICE_CLOSURES_PATH, collection);
  console.log(`Wrote ${closures.length} synthetic splice closures.`);
}

void main();
