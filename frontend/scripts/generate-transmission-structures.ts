import type { Coordinate, TransmissionStructureCollection, TransmissionStructureFeature } from "../lib/types/assets";
import { SYNTHETIC_DISCLAIMER, angleDeltaDegrees, bearingDegrees, createSeededRandom, ensureOutputDir, flattenLineFeature, interpolateAtMile, lineCodeFor, lineLengthMiles, readPublicLines, round, writeStructures } from "./fiber-network-utils";

const SEED = "gridassetlink-structures-v1";

async function main() {
  await ensureOutputDir();
  const rng = createSeededRandom(SEED);
  const publicLines = await readPublicLines();
  const structures: TransmissionStructureFeature[] = [];

  publicLines.features.forEach((line, lineIndex) => {
    const coordinates = flattenLineFeature(line);
    const routeMiles = lineLengthMiles(coordinates);
    const lineCode = lineCodeFor(line, lineIndex);
    const spacingMiles = 0.15 + rng() * 0.1;
    const sampleMiles = routeMiles > 0
      ? createSampleMiles(routeMiles, spacingMiles)
      : [0];

    sampleMiles.forEach((milepost, sequenceIndex) => {
      const coordinate = interpolateAtMile(coordinates, milepost);
      const structureType = classifyStructure(coordinates, routeMiles, milepost, sequenceIndex, sampleMiles.length, lineIndex);
      const structureNumber = `${lineCode}-STR-${String(sequenceIndex + 1).padStart(4, "0")}`;
      structures.push({
        type: "Feature",
        properties: {
          id: `${line.properties.id}-STR-${String(sequenceIndex + 1).padStart(4, "0")}`,
          structureNumber,
          lineId: line.properties.id,
          lineName: line.properties.name,
          sequenceIndex: sequenceIndex + 1,
          latitude: coordinate[1],
          longitude: coordinate[0],
          milepost: round(milepost, 3),
          structureType,
          voltageKv: line.properties.voltageKv ?? undefined,
          source: "synthetic-demo",
          synthetic: true,
          hasOpgw: false,
          hasSplice: false,
          spliceClosureIds: [],
          connectedFiberCableIds: [],
          notes: `${SYNTHETIC_DISCLAIMER} Structure spacing is deterministic demo sampling along public line geometry.`,
        },
        geometry: { type: "Point", coordinates: coordinate },
      });
    });
  });

  const collection: TransmissionStructureCollection = { type: "FeatureCollection", features: structures };
  await writeStructures(collection, {
    sourceName: "GridAssetLink synthetic transmission structures",
    sourceType: "synthetic-planning",
    generatedAt: new Date().toISOString(),
    seed: SEED,
    featureCount: structures.length,
    publicLineCount: publicLines.features.length,
    disclaimer: SYNTHETIC_DISCLAIMER,
    notes: "Every structure is a deterministic synthetic demo point sampled along public transmission-line reference geometry.",
  });
  console.log(`Wrote ${structures.length} synthetic structures for ${publicLines.features.length} public lines.`);
}

function createSampleMiles(routeMiles: number, spacingMiles: number) {
  const samples = [0];
  for (let mile = spacingMiles; mile < routeMiles; mile += spacingMiles) samples.push(round(mile, 3));
  if (routeMiles > 0 && samples[samples.length - 1] !== routeMiles) samples.push(round(routeMiles, 3));
  return samples;
}

function classifyStructure(coordinates: Coordinate[], routeMiles: number, milepost: number, sequenceIndex: number, totalCount: number, lineIndex: number): TransmissionStructureFeature["properties"]["structureType"] {
  if (sequenceIndex === 0 || sequenceIndex === totalCount - 1) return "terminal";
  if (sequenceIndex % 61 === 0) return "tap";
  if (sequenceIndex % 43 === 0) return "deadend";
  if (routeMiles <= 0 || coordinates.length < 3) return "tangent";
  const before = interpolateAtMile(coordinates, Math.max(0, milepost - 0.08));
  const current = interpolateAtMile(coordinates, milepost);
  const after = interpolateAtMile(coordinates, Math.min(routeMiles, milepost + 0.08));
  const delta = angleDeltaDegrees(bearingDegrees(before, current), bearingDegrees(current, after));
  if (delta > 32 + (lineIndex % 11)) return "angle";
  return "tangent";
}

void main();
