import type { OpgwCableCollection, OpgwCableFeature, TransmissionStructureCollection } from "../lib/types/assets";
import { OPGW_PATH, SYNTHETIC_DISCLAIMER, chooseWeighted, createSeededRandom, fiberCountTubePlan, flattenLineFeature, lineCodeFor, lineLengthMiles, readPublicLines, readStructures, round, statusForIndex, writeJson, writeOpgwCables, writeStructures } from "./fiber-network-utils";

const SEED = "gridassetlink-opgw-v1";
const FIBER_COUNTS = [24, 48, 72, 96, 144] as const;

async function main() {
  const rng = createSeededRandom(SEED);
  const publicLines = await readPublicLines();
  const structuresCollection = await readStructures();
  const structuresByLine = groupStructuresByLine(structuresCollection);
  const cables: OpgwCableFeature[] = [];

  publicLines.features.forEach((line, lineIndex) => {
    const structures = structuresByLine.get(line.properties.id) || [];
    if (!structures.length) return;
    const voltage = line.properties.voltageKv ?? 0;
    const routeMiles = lineLengthMiles(flattenLineFeature(line));
    const chance = opgwChance(voltage, routeMiles);
    if (rng() > chance) return;
    const fiberCount = chooseWeighted(rng, FIBER_COUNTS, [0.15, 0.3, 0.25, 0.2, 0.1]);
    const code = lineCodeFor(line, lineIndex);
    const cableId = `SYN-OPGW-${String(cables.length + 1).padStart(4, "0")}`;
    const { bufferTubeCount, fibersPerTube } = fiberCountTubePlan(fiberCount);
    const first = structures[0].properties;
    const last = structures[structures.length - 1].properties;
    cables.push({
      type: "Feature",
      properties: {
        id: cableId,
        cableName: line.properties.name ? `SYN-OPGW-${code}-${fiberCount}F` : `SYN-OPGW-TL-${String(lineIndex + 1).padStart(3, "0")}-${fiberCount}F`,
        lineId: line.properties.id,
        lineName: line.properties.name,
        synthetic: true,
        source: "synthetic-demo",
        status: statusForIndex(lineIndex),
        fiberCount,
        fiberType: "OPGW",
        startStructureId: first.id,
        endStructureId: last.id,
        structureIds: structures.map((structure) => structure.properties.id),
        routeMiles: round(routeMiles, 3),
        manufacturer: chooseWeighted(rng, ["Synthetic FiberWorks", "DemoGrid Cable", "Planning Optics"], [0.4, 0.35, 0.25]),
        cableSpec: `${fiberCount}F OPGW synthetic planning cable`,
        bufferTubeCount,
        fibersPerTube,
        connectedSpliceClosureIds: [],
        notes: `${SYNTHETIC_DISCLAIMER} OPGW is randomly assigned for planning visualization only.`,
      },
      geometry: line.geometry,
    });
  });

  normalizeCoverage(cables, publicLines.features, structuresByLine, rng);
  applyCableReferencesToStructures(structuresCollection, cables);
  await writeOpgwCables({ type: "FeatureCollection", features: cables }, {
    sourceName: "GridAssetLink synthetic OPGW cables",
    sourceType: "synthetic-planning",
    generatedAt: new Date().toISOString(),
    seed: SEED,
    featureCount: cables.length,
    publicLineCount: publicLines.features.length,
    coveragePercent: publicLines.features.length ? round((cables.length / publicLines.features.length) * 100, 2) : 0,
    disclaimer: SYNTHETIC_DISCLAIMER,
  });
  await writeStructures(structuresCollection);
  await writeJson(OPGW_PATH, { type: "FeatureCollection", features: cables } satisfies OpgwCableCollection);
  console.log(`Wrote ${cables.length} synthetic OPGW cables.`);
}

function opgwChance(voltageKv: number, routeMiles: number) {
  const lengthBoost = routeMiles > 20 ? 0.08 : routeMiles > 8 ? 0.04 : 0;
  if (voltageKv >= 345) return Math.min(0.9, 0.8 + lengthBoost);
  if (voltageKv >= 230) return Math.min(0.82, 0.7 + lengthBoost);
  if (voltageKv >= 115) return Math.min(0.68, 0.55 + lengthBoost);
  return Math.min(0.45, 0.3 + lengthBoost);
}

function normalizeCoverage(cables: OpgwCableFeature[], lines: Awaited<ReturnType<typeof readPublicLines>>["features"], structuresByLine: Map<string, TransmissionStructureCollection["features"]>, rng: () => number) {
  const targetMin = Math.ceil(lines.length * 0.55);
  const selected = new Set(cables.map((cable) => cable.properties.lineId));
  if (cables.length >= targetMin) return;
  const candidates = lines
    .map((line, index) => ({ line, index, score: (line.properties.voltageKv || 0) * 10 + lineLengthMiles(flattenLineFeature(line)) }))
    .filter(({ line }) => !selected.has(line.properties.id) && (structuresByLine.get(line.properties.id)?.length || 0) > 1)
    .sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (cables.length >= targetMin) break;
    const structures = structuresByLine.get(candidate.line.properties.id) || [];
    const fiberCount = chooseWeighted(rng, FIBER_COUNTS, [0.15, 0.3, 0.25, 0.2, 0.1]);
    const { bufferTubeCount, fibersPerTube } = fiberCountTubePlan(fiberCount);
    const code = lineCodeFor(candidate.line, candidate.index);
    cables.push({
      type: "Feature",
      properties: {
        id: `SYN-OPGW-${String(cables.length + 1).padStart(4, "0")}`,
        cableName: `SYN-OPGW-${code}-${fiberCount}F`,
        lineId: candidate.line.properties.id,
        lineName: candidate.line.properties.name,
        synthetic: true,
        source: "synthetic-demo",
        status: statusForIndex(candidate.index),
        fiberCount,
        fiberType: "OPGW",
        startStructureId: structures[0].properties.id,
        endStructureId: structures[structures.length - 1].properties.id,
        structureIds: structures.map((structure) => structure.properties.id),
        routeMiles: round(lineLengthMiles(flattenLineFeature(candidate.line)), 3),
        manufacturer: "Synthetic FiberWorks",
        cableSpec: `${fiberCount}F OPGW synthetic planning cable`,
        bufferTubeCount,
        fibersPerTube,
        connectedSpliceClosureIds: [],
        notes: `${SYNTHETIC_DISCLAIMER} Added to keep demo coverage in the 55-70 percent planning range.`,
      },
      geometry: candidate.line.geometry,
    });
  }
}

function groupStructuresByLine(collection: TransmissionStructureCollection) {
  const grouped = new Map<string, TransmissionStructureCollection["features"]>();
  collection.features.forEach((structure) => {
    const current = grouped.get(structure.properties.lineId) || [];
    current.push(structure);
    grouped.set(structure.properties.lineId, current);
  });
  grouped.forEach((items) => items.sort((a, b) => a.properties.sequenceIndex - b.properties.sequenceIndex));
  return grouped;
}

function applyCableReferencesToStructures(collection: TransmissionStructureCollection, cables: OpgwCableFeature[]) {
  const byStructure = new Map<string, string[]>();
  cables.forEach((cable) => {
    cable.properties.structureIds.forEach((structureId) => {
      const current = byStructure.get(structureId) || [];
      current.push(cable.properties.id);
      byStructure.set(structureId, current);
    });
  });
  collection.features.forEach((structure) => {
    const cableIds = byStructure.get(structure.properties.id) || [];
    structure.properties.hasOpgw = cableIds.length > 0;
    structure.properties.connectedFiberCableIds = cableIds;
  });
}

void main();
