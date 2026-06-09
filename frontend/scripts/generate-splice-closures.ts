import type { SpliceClosureCollection, SpliceClosureFeature } from "../lib/types/assets";
import { SPLICE_CLOSURES_PATH, SYNTHETIC_DISCLAIMER, cableSectionIdForLine, createSeededRandom, nearestStructureByMile, readOpgwCables, readStructures, statusForIndex, unique, writeJson, writeOpgwCables, writeSpliceClosures, writeStructures } from "./fiber-network-utils";

const SEED = "gridassetlink-splices-v1";

async function main() {
  const rng = createSeededRandom(SEED);
  const structures = await readStructures();
  const cables = await readOpgwCables();
  const structureById = new Map(structures.features.map((feature) => [feature.properties.id, feature]));
  const closures: SpliceClosureFeature[] = [];
  const closureIdsByParentCableId = new Map<string, string[]>();
  const sectionIdsByStructureId = new Map<string, string[]>();

  structures.features.forEach((structure) => {
    structure.properties.hasSplice = false;
    structure.properties.spliceClosureIds = [];
  });

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

    const selectedStructures = [...selected.entries()]
      .map(([structureId, closureType]) => ({ structure: structureById.get(structureId), closureType }))
      .filter((entry): entry is { structure: NonNullable<ReturnType<typeof structureById.get>>; closureType: SpliceClosureFeature["properties"]["closureType"] } => Boolean(entry.structure))
      .sort((a, b) => a.structure.properties.sequenceIndex - b.structure.properties.sequenceIndex);
    const adjacentSectionIdsByStructureId = new Map<string, string[]>();

    selectedStructures.forEach((entry, index) => {
      const next = selectedStructures[index + 1];
      if (!next) return;
      const sectionId = cableSectionIdForLine(cable.properties.lineId, index + 1);
      [entry.structure.properties.id, next.structure.properties.id].forEach((structureId) => {
        adjacentSectionIdsByStructureId.set(structureId, unique([...(adjacentSectionIdsByStructureId.get(structureId) || []), sectionId]));
      });
      const startIndex = cableStructures.findIndex((structure) => structure.properties.id === entry.structure.properties.id);
      const endIndex = cableStructures.findIndex((structure) => structure.properties.id === next.structure.properties.id);
      if (startIndex < 0 || endIndex <= startIndex) return;
      cableStructures.slice(startIndex, endIndex + 1).forEach((structure) => {
        sectionIdsByStructureId.set(structure.properties.id, unique([...(sectionIdsByStructureId.get(structure.properties.id) || []), sectionId]));
      });
    });

    selectedStructures.forEach(({ structure, closureType }, closureIndex) => {
      const closureId = `SYN-SPLICE-${String(closures.length + 1).padStart(5, "0")}`;
      const adjacentCableSectionIds = adjacentSectionIdsByStructureId.get(structure.properties.id) || [];
      closures.push({
        type: "Feature",
        properties: {
          id: closureId,
          name: `${structure.properties.structureNumber} ${closureType.replaceAll("_", " ")}`,
          synthetic: true,
          source: "synthetic-demo",
          closureType,
          structureId: structure.properties.id,
          structureNumber: structure.properties.structureNumber,
          latitude: structure.properties.latitude,
          longitude: structure.properties.longitude,
          cableIds: adjacentCableSectionIds,
          spliceCount: 0,
          status: statusForIndex(cableIndex + closureIndex),
          installType: closureType === "terminal_splice" ? "terminal" : "aerial",
          notes: `${SYNTHETIC_DISCLAIMER} Cable IDs on this closure are splice-to-splice section IDs only; parent route ${cable.properties.id} is source context.`,
        },
        geometry: { type: "Point", coordinates: [structure.properties.longitude, structure.properties.latitude] },
      });
      closureIdsByParentCableId.set(cable.properties.id, unique([...(closureIdsByParentCableId.get(cable.properties.id) || []), closureId]));
      structure.properties.hasSplice = true;
      structure.properties.structureType = closureType === "terminal_splice" ? "terminal" : "splice";
      structure.properties.spliceClosureIds = unique([...structure.properties.spliceClosureIds, closureId]);
    });
  });

  cables.features.forEach((cable) => {
    cable.properties.connectedSpliceClosureIds = closureIdsByParentCableId.get(cable.properties.id) || [];
  });
  structures.features.forEach((structure) => {
    if (!structure.properties.hasOpgw) return;
    structure.properties.connectedFiberCableIds = sectionIdsByStructureId.get(structure.properties.id) || [];
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
