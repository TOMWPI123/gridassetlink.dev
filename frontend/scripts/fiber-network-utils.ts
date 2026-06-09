import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Coordinate, OpgwCableCollection, PublicTransmissionLineCollection, SpliceClosureCollection, TransmissionStructureCollection } from "../lib/types/assets";

export const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
export const PUBLIC_LINES_PATH = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.geojson");
export const STRUCTURES_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-transmission-structures.geojson");
export const STRUCTURES_META_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-transmission-structures.meta.json");
export const OPGW_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-opgw-cables.geojson");
export const OPGW_META_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-opgw-cables.meta.json");
export const STRANDS_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-fiber-strands.json");
export const SPLICE_CLOSURES_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-splice-closures.geojson");
export const SPLICE_CLOSURES_META_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-splice-closures.meta.json");
export const FIBER_SPLICES_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-fiber-splices.json");
export const PATCH_PANELS_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-patch-panels.json");
export const FIBER_ASSIGNMENTS_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-fiber-assignments.json");
export const SYNTHETIC_SERVICES_PATH = path.join(OUTPUT_DIR, "iso-ne-synthetic-services.json");

export const SYNTHETIC_DISCLAIMER = "Synthetic demo/planning data. Not a real utility asset or verified utility telecom record.";

export async function ensureOutputDir() {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath: string, value: unknown) {
  await ensureOutputDir();
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

export async function readPublicLines() {
  return readJson<PublicTransmissionLineCollection>(PUBLIC_LINES_PATH, { type: "FeatureCollection", features: [] });
}

export async function readStructures() {
  return readJson<TransmissionStructureCollection>(STRUCTURES_PATH, { type: "FeatureCollection", features: [] });
}

export async function writeStructures(collection: TransmissionStructureCollection, meta?: Record<string, unknown>) {
  await writeJson(STRUCTURES_PATH, collection);
  if (meta) await writeJson(STRUCTURES_META_PATH, meta);
}

export async function readOpgwCables() {
  return readJson<OpgwCableCollection>(OPGW_PATH, { type: "FeatureCollection", features: [] });
}

export async function writeOpgwCables(collection: OpgwCableCollection, meta?: Record<string, unknown>) {
  await writeJson(OPGW_PATH, collection);
  if (meta) await writeJson(OPGW_META_PATH, meta);
}

export async function readSpliceClosures() {
  return readJson<SpliceClosureCollection>(SPLICE_CLOSURES_PATH, { type: "FeatureCollection", features: [] });
}

export async function writeSpliceClosures(collection: SpliceClosureCollection, meta?: Record<string, unknown>) {
  await writeJson(SPLICE_CLOSURES_PATH, collection);
  if (meta) await writeJson(SPLICE_CLOSURES_META_PATH, meta);
}

export function createSeededRandom(seed: string) {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chooseWeighted<T>(rng: () => number, values: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let bucket = rng() * total;
  for (let index = 0; index < values.length; index += 1) {
    bucket -= weights[index];
    if (bucket <= 0) return values[index];
  }
  return values[values.length - 1];
}

export function publicLineParts(feature: PublicTransmissionLineCollection["features"][number]): Coordinate[][] {
  if (feature.geometry.type === "LineString") return [feature.geometry.coordinates];
  return feature.geometry.coordinates;
}

export function flattenLineFeature(feature: PublicTransmissionLineCollection["features"][number]) {
  return publicLineParts(feature).flat();
}

export function lineLengthMiles(coordinates: Coordinate[]) {
  let total = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) total += distanceMiles(coordinates[index], coordinates[index + 1]);
  return total;
}

export function cumulativeMiles(coordinates: Coordinate[]) {
  const distances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    distances.push(distances[index - 1] + distanceMiles(coordinates[index - 1], coordinates[index]));
  }
  return distances;
}

export function interpolateAtMile(coordinates: Coordinate[], targetMiles: number): Coordinate {
  if (coordinates.length <= 1) return roundCoordinate(coordinates[0] || [0, 0]);
  let walked = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segmentMiles = distanceMiles(start, end);
    if (walked + segmentMiles >= targetMiles) {
      const t = segmentMiles === 0 ? 0 : (targetMiles - walked) / segmentMiles;
      return roundCoordinate([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
    }
    walked += segmentMiles;
  }
  return roundCoordinate(coordinates[coordinates.length - 1]);
}

export function nearestStructureByMile<T extends { properties: { milepost?: number } }>(structures: T[], milepost: number) {
  return structures.reduce((best, structure) => {
    const bestDistance = Math.abs((best.properties.milepost || 0) - milepost);
    const nextDistance = Math.abs((structure.properties.milepost || 0) - milepost);
    return nextDistance < bestDistance ? structure : best;
  }, structures[0]);
}

export function distanceMiles(a: Coordinate, b: Coordinate) {
  const meanLat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const milesPerLon = Math.cos(meanLat) * 69.172;
  const dx = (b[0] - a[0]) * milesPerLon;
  const dy = (b[1] - a[1]) * 69.0;
  return Math.hypot(dx, dy);
}

export function bearingDegrees(a: Coordinate, b: Coordinate) {
  return Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
}

export function angleDeltaDegrees(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function lineCodeFor(feature: PublicTransmissionLineCollection["features"][number], index: number) {
  const name = feature.properties.name?.trim();
  if (!name) return `TL-${String(index + 1).padStart(3, "0")}`;
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return code || `TL-${String(index + 1).padStart(3, "0")}`;
}

export function roundCoordinate([longitude, latitude]: Coordinate): Coordinate {
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

export function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function compact<T>(values: Array<T | undefined | null | "">) {
  return values.filter(Boolean) as T[];
}

export function fiberCountTubePlan(fiberCount: 24 | 48 | 72 | 96 | 144) {
  return { bufferTubeCount: Math.ceil(fiberCount / 12), fibersPerTube: 12 };
}

export function statusForIndex(index: number) {
  if (index % 17 === 0) return "proposed" as const;
  if (index % 7 === 0) return "planned" as const;
  return "existing" as const;
}

export function idSafe(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}
