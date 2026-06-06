import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Coordinate, IsoNeState, PublicSubstationCollection, PublicSubstationFeature, PublicSubstationOwnerSource, PublicTransmissionLineCollection, PublicTransmissionLineFeature } from "../lib/types/assets";
import { ISO_NE_STATES, isInIsoNeBounds } from "./clip-to-iso-ne";

const DEFAULT_HIFLD_SUBSTATIONS_FEATURESERVER_URL = "https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0";
const PUBLIC_NOTICE = "Public substation reference data only. Not for operations. Utility-owner buckets are public-field values when available, otherwise inferred from nearest public HIFLD transmission-line owner.";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_GEOJSON = path.join(OUTPUT_DIR, "iso-ne-public-substations.geojson");
const OUTPUT_META = path.join(OUTPUT_DIR, "iso-ne-public-substations.meta.json");
const PUBLIC_LINES_PATH = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.geojson");
const MAX_OWNER_INFERENCE_DISTANCE_MILES = 4;

type ArcGisQueryResponse = {
  features?: ArcGisFeature[];
  error?: { message?: string; details?: string[] };
};

type ArcGisFeature = {
  type?: string;
  properties?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown; x?: number; y?: number };
};

type IngestMeta = {
  sourceName: string;
  sourceType: "public-reference";
  sourceUrl: string;
  generatedAt: string;
  featureCount: number;
  statesIncluded: typeof ISO_NE_STATES;
  ownerInferenceMaxMiles: number;
  ownerSummary: Record<string, number>;
  notes: string;
  warning?: string;
};

async function main() {
  const sourceName = process.env.NEXT_PUBLIC_SUBSTATIONS_SOURCE_NAME || "HIFLD Electric Substations";
  const sourceUrl = normalizeLayerUrl(process.env.SUBSTATIONS_FEATURESERVER_URL || DEFAULT_HIFLD_SUBSTATIONS_FEATURESERVER_URL);

  await mkdir(OUTPUT_DIR, { recursive: true });

  try {
    const publicLines = await readPublicLines();
    const outFields = await getSafeOutFields(sourceUrl);
    const features = await fetchAllFeatures(sourceUrl, outFields);
    const normalized = features
      .map((feature, index) => normalizeSubstationFeature(feature, index, publicLines.features))
      .filter((feature): feature is PublicSubstationFeature => feature !== null);
    await writeOutputs(
      { type: "FeatureCollection", features: dedupeSubstations(normalized) },
      {
        sourceName,
        sourceType: "public-reference",
        sourceUrl,
        generatedAt: new Date().toISOString(),
        featureCount: normalized.length,
        statesIncluded: ISO_NE_STATES,
        ownerInferenceMaxMiles: MAX_OWNER_INFERENCE_DISTANCE_MILES,
        ownerSummary: summarizeOwners(normalized),
        notes: PUBLIC_NOTICE,
      },
    );
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    await writeOutputs(
      { type: "FeatureCollection", features: [] },
      {
        sourceName,
        sourceType: "public-reference",
        sourceUrl,
        generatedAt: new Date().toISOString(),
        featureCount: 0,
        statesIncluded: ISO_NE_STATES,
        ownerInferenceMaxMiles: MAX_OWNER_INFERENCE_DISTANCE_MILES,
        ownerSummary: {},
        notes: PUBLIC_NOTICE,
        warning,
      },
    );
    console.warn(`Public substation ingestion warning: ${warning}`);
  }
}

async function fetchAllFeatures(sourceUrl: string, outFields: string) {
  const normalizedFeatures: ArcGisFeature[] = [];
  const pageSize = 2000;
  let offset = 0;

  while (true) {
    const response = await queryArcGis(sourceUrl, offset, pageSize, outFields);
    if (response.error) throw new Error([response.error.message, ...(response.error.details || [])].filter(Boolean).join(" "));
    const features = Array.isArray(response.features) ? response.features : [];
    normalizedFeatures.push(...features);
    if (features.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break;
  }

  return normalizedFeatures;
}

async function queryArcGis(sourceUrl: string, offset: number, pageSize: number, outFields: string): Promise<ArcGisQueryResponse> {
  const url = new URL(`${sourceUrl}/query`);
  url.searchParams.set("f", "geojson");
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(pageSize));
  url.searchParams.set("geometry", "-74.2,40.8,-66.7,47.7");
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HIFLD substation query failed: ${response.status} ${response.statusText}`);
  return await response.json() as ArcGisQueryResponse;
}

async function getSafeOutFields(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set("f", "json");
    const response = await fetch(url);
    if (!response.ok) return "*";
    const metadata = await response.json() as { fields?: Array<{ name?: string }> };
    const available = new Set((metadata.fields || []).map((field) => field.name).filter(Boolean) as string[]);
    const wanted = ["OBJECTID_1", "OBJECTID", "FID", "ID", "NAME", "CITY", "STATE", "ZIP", "TYPE", "STATUS", "COUNTY", "LATITUDE", "LONGITUDE", "NAICS_DESC", "SOURCE", "LINES", "MAX_VOLT", "MAX_VOLTAG", "MIN_VOLT", "MIN_VOLTAG", "MAX_INFER", "MIN_INFER", "OWNER", "OWNER_NAME", "OPERATOR", "UTILITY"];
    const selected = wanted.filter((field) => available.has(field));
    return selected.length ? selected.join(",") : "*";
  } catch {
    return "*";
  }
}

async function readPublicLines(): Promise<PublicTransmissionLineCollection> {
  try {
    const content = await readFile(PUBLIC_LINES_PATH, "utf-8");
    return JSON.parse(content) as PublicTransmissionLineCollection;
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}

function normalizeSubstationFeature(feature: ArcGisFeature, fallbackIndex: number, publicLines: PublicTransmissionLineFeature[]): PublicSubstationFeature | null {
  const raw = feature.properties || feature.attributes || {};
  const coordinates = pointCoordinates(feature);
  if (!coordinates || !isInIsoNeBounds(coordinates)) return null;
  const state = cleanText(firstDefined(raw, ["STATE", "state"])).toUpperCase();
  if (!isIsoNeState(state)) return null;

  const sourceId = cleanText(firstDefined(raw, ["ID", "OBJECTID", "OBJECTID_1", "FID"])) || `HIFLD-SUB-${fallbackIndex + 1}`;
  const rawOwner = cleanText(firstDefined(raw, ["OWNER", "OWNER_NAME", "OPERATOR", "UTILITY"]));
  const nearest = rawOwner ? null : nearestPublicLineOwner(coordinates, publicLines);
  const owner = ownerFrom(rawOwner, nearest);
  const ownerSource = ownerSourceFrom(rawOwner, nearest);
  const ownerConfidence = rawOwner
    ? "public_record"
    : nearest
      ? "public_line_inferred"
      : "unknown";

  return {
    type: "Feature",
    properties: {
      id: sourceId.startsWith("HIFLD-SUB-") ? sourceId : `HIFLD-SUB-${sourceId}`,
      name: cleanText(firstDefined(raw, ["NAME", "name"])) || `Public substation ${sourceId}`,
      city: cleanNullable(firstDefined(raw, ["CITY", "city"])),
      county: cleanNullable(firstDefined(raw, ["COUNTY", "county"])),
      state,
      substationType: cleanNullable(firstDefined(raw, ["TYPE", "type"])),
      status: normalizeStatus(firstDefined(raw, ["STATUS", "status"])),
      maxVoltageKv: parsePublicNumber(firstDefined(raw, ["MAX_VOLT", "MAX_VOLTAG", "MAXVOLT"])),
      minVoltageKv: parsePublicNumber(firstDefined(raw, ["MIN_VOLT", "MIN_VOLTAG", "MINVOLT"])),
      lineCount: parsePublicNumber(firstDefined(raw, ["LINES", "line_count"])),
      utilityOwner: owner,
      ownerSource,
      ownerConfidence,
      nearestPublicLineId: nearest?.lineId || null,
      nearestPublicLineDistanceMiles: nearest ? Number(nearest.distanceMiles.toFixed(3)) : null,
      source: "HIFLD",
      sourceType: "public-reference",
      readOnly: true,
      synthetic: false,
      isoNe: true,
      rawSource: cleanNullable(firstDefined(raw, ["SOURCE", "source", "NAICS_DESC"])),
      publicDataNotice: "Public substation reference point. Not for operations.",
    },
    geometry: { type: "Point", coordinates },
  };
}

function pointCoordinates(feature: ArcGisFeature): Coordinate | null {
  const geometry = feature.geometry;
  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates) && typeof geometry.coordinates[0] === "number" && typeof geometry.coordinates[1] === "number") {
    return [roundCoord(geometry.coordinates[0]), roundCoord(geometry.coordinates[1])];
  }
  if (typeof geometry?.x === "number" && typeof geometry.y === "number") {
    return [roundCoord(geometry.x), roundCoord(geometry.y)];
  }
  const raw = feature.properties || feature.attributes || {};
  const longitude = parsePublicNumber(firstDefined(raw, ["LONGITUDE", "longitude"]));
  const latitude = parsePublicNumber(firstDefined(raw, ["LATITUDE", "latitude"]));
  if (typeof longitude === "number" && typeof latitude === "number") return [roundCoord(longitude), roundCoord(latitude)];
  return null;
}

function nearestPublicLineOwner(coordinate: Coordinate, publicLines: PublicTransmissionLineFeature[]) {
  let best: { owner: string; lineId: string; distanceMiles: number } | null = null;
  for (const line of publicLines) {
    if (!line.properties.owner) continue;
    const distanceMiles = distanceToLineMiles(coordinate, line.geometry.type === "LineString" ? line.geometry.coordinates : line.geometry.coordinates.flat());
    if (!best || distanceMiles < best.distanceMiles) {
      best = { owner: line.properties.owner, lineId: line.properties.id, distanceMiles };
    }
  }
  if (!best || best.distanceMiles > MAX_OWNER_INFERENCE_DISTANCE_MILES) return null;
  return best;
}

function distanceToLineMiles(point: Coordinate, line: Coordinate[]) {
  if (!line.length) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < line.length; index += 1) {
    best = Math.min(best, haversineMiles(point, line[index]));
  }
  return best;
}

function haversineMiles([lon1, lat1]: Coordinate, [lon2, lat2]: Coordinate) {
  const radiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ownerFrom(rawOwner: string, nearest: ReturnType<typeof nearestPublicLineOwner>) {
  if (rawOwner) return rawOwner;
  if (nearest?.owner) return nearest.owner;
  return "Unknown public owner";
}

function ownerSourceFrom(rawOwner: string, nearest: ReturnType<typeof nearestPublicLineOwner>): PublicSubstationOwnerSource {
  if (rawOwner) return "public_substation_owner_field";
  if (nearest?.owner) return "nearest_public_hifld_transmission_line_owner";
  return "unknown";
}

function dedupeSubstations(features: PublicSubstationFeature[]) {
  const seen = new Set<string>();
  return features.filter((feature) => {
    const key = `${feature.properties.id}|${feature.geometry.coordinates.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeOwners(features: PublicSubstationFeature[]) {
  return features.reduce<Record<string, number>>((summary, feature) => {
    summary[feature.properties.utilityOwner] = (summary[feature.properties.utilityOwner] || 0) + 1;
    return summary;
  }, {});
}

async function writeOutputs(collection: PublicSubstationCollection, metadata: IngestMeta) {
  const finalMeta = { ...metadata, featureCount: collection.features.length, ownerSummary: summarizeOwners(collection.features) };
  await writeFile(OUTPUT_GEOJSON, `${JSON.stringify(collection, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_META, `${JSON.stringify(finalMeta, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${collection.features.length} public substation features to ${path.relative(process.cwd(), OUTPUT_GEOJSON)}`);
}

function normalizeLayerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/\/FeatureServer$/i.test(trimmed)) return `${trimmed}/0`;
  return trimmed;
}

function normalizeStatus(value: unknown): "existing" | "planned" | "proposed" | "unknown" {
  const normalized = cleanText(value).toLowerCase();
  if (normalized.includes("proposed")) return "proposed";
  if (normalized.includes("planned") || normalized.includes("future")) return "planned";
  if (normalized.includes("in service") || normalized.includes("existing") || normalized.includes("operat")) return "existing";
  return "unknown";
}

function firstDefined(properties: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(properties);
  for (const key of keys) {
    const direct = properties[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
    const fuzzy = entries.find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase())?.[1];
    if (fuzzy !== undefined && fuzzy !== null && fuzzy !== "") return fuzzy;
  }
  return undefined;
}

function cleanNullable(value: unknown) {
  const text = cleanText(value);
  return text ? text : null;
}

function cleanText(value: unknown) {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text || /^not available$/i.test(text) || /^unknown$/i.test(text) || /^none$/i.test(text) || text === "-999999") return "";
  return text;
}

function parsePublicNumber(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed === -999999) return null;
  return parsed;
}

function isIsoNeState(value: string): value is IsoNeState {
  return (ISO_NE_STATES as readonly string[]).includes(value);
}

function roundCoord(value: number) {
  return Number(value.toFixed(6));
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

void main();
