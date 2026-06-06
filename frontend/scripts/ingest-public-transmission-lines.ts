import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Coordinate, IsoNeState, PublicTransmissionLineCollection, PublicTransmissionLineFeature, TransmissionVoltageClass } from "../lib/types/assets";
import { getVoltageClass } from "../lib/map/voltage";
import { resolvePublicTransmissionOwner, UNKNOWN_PUBLIC_OWNER, type PublicOwnerSource } from "../lib/map/public-owner";
import { ISO_NE_STATES, isInIsoNeBounds, statesForCoordinates } from "./clip-to-iso-ne";
import { dedupeTransmissionLineFeatures, normalizeTransmissionLineFeature } from "./normalize-transmission-lines";

const DEFAULT_HIFLD_FEATURESERVER_URL = "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/ArcGIS/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0";
const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const ISO_NE_STATE_BBOXES: Array<{ label: IsoNeState; bbox: [number, number, number, number] }> = [
  { label: "CT", bbox: [40.9, -73.8, 42.15, -71.75] },
  { label: "MA", bbox: [41.15, -73.55, 42.9, -69.8] },
  { label: "RI", bbox: [41.1, -71.95, 42.05, -71.05] },
  { label: "NH", bbox: [42.65, -72.65, 45.35, -70.55] },
  { label: "VT", bbox: [42.7, -73.45, 45.05, -71.45] },
  { label: "ME", bbox: [42.95, -71.1, 47.55, -66.7] },
];
const PUBLIC_NOTICE = "Public reference data only. Not for operations. Owner buckets use public HIFLD OWNER fields, close OpenStreetMap line owner/operator matches, and explicit public line-name tokens; unsupported lines remain Unknown public owner.";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_GEOJSON = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.geojson");
const OUTPUT_META = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.meta.json");
const MAX_OSM_LINE_OWNER_MATCH_DISTANCE_MILES = 0.15;
const USER_AGENT = "GridAssetLink synthetic planning demo public transmission owner enrichment (no private data)";
const OVERPASS_REQUEST_TIMEOUT_MS = Number(process.env.OVERPASS_REQUEST_TIMEOUT_MS || 12000);

type ArcGisQueryResponse = {
  features?: unknown[];
  error?: { message?: string; details?: string[] };
};

type IngestMeta = {
  sourceName: string;
  sourceType: "public-reference";
  sourceUrl: string;
  ownerSources: Array<{
    sourceName: string;
    sourceUrl: string;
    attribution: string;
  }>;
  generatedAt: string;
  featureCount: number;
  statesIncluded: typeof ISO_NE_STATES;
  osmLineOwnerMatchMaxMiles: number;
  osmLineOwnerMatchCount: number;
  osmLineRecordsWithOwner: number;
  ownerSummary: Record<string, number>;
  ownerSourceSummary: Record<string, number>;
  ownerConfidenceSummary: Record<string, number>;
  notes: string;
  warning?: string;
};

type OverpassLineElement = {
  type: string;
  id: number;
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: Record<string, string>;
};

type OsmLineOwnerRecord = {
  osmElementId: string;
  name: string;
  operator: string;
  owner: string;
  utilityOwner: string;
  ownerSource: Extract<PublicOwnerSource, "openstreetmap_line_operator_tag" | "openstreetmap_line_owner_tag">;
  coordinates: Coordinate[];
  voltageKv: number;
  voltageClass: TransmissionVoltageClass;
  states: IsoNeState[];
};

type OsmLineOwnerMatch = OsmLineOwnerRecord & {
  distanceMiles: number;
};

async function main() {
  const sourceName = process.env.NEXT_PUBLIC_TRANSMISSION_LINES_SOURCE_NAME || "HIFLD Electric Power Transmission Lines";
  const sourceUrl = normalizeLayerUrl(process.env.TRANSMISSION_LINES_FEATURESERVER_URL || DEFAULT_HIFLD_FEATURESERVER_URL);

  await mkdir(OUTPUT_DIR, { recursive: true });

  try {
    const osmLineOwners = await readOpenStreetMapLineOwners();
    const outFields = await getSafeOutFields(sourceUrl);
    const features = await fetchAllFeatures(sourceUrl, outFields);
    const normalized = dedupeTransmissionLineFeatures(features
      .map((feature, index) => normalizeTransmissionLineFeature(feature as Parameters<typeof normalizeTransmissionLineFeature>[0], index))
      .filter((feature): feature is PublicTransmissionLineFeature => feature !== null));
    const enriched = enrichTransmissionOwnersFromOsm(normalized, osmLineOwners);
    await writeOutputs(
      { type: "FeatureCollection", features: enriched },
      {
        sourceName,
        sourceType: "public-reference",
        sourceUrl,
        ownerSources: ownerSourcesForMeta(sourceUrl),
        generatedAt: new Date().toISOString(),
        featureCount: enriched.length,
        statesIncluded: ISO_NE_STATES,
        osmLineOwnerMatchMaxMiles: MAX_OSM_LINE_OWNER_MATCH_DISTANCE_MILES,
        osmLineOwnerMatchCount: countByOwnerConfidence(enriched, "openstreetmap_spatial_match"),
        osmLineRecordsWithOwner: osmLineOwners.length,
        ownerSummary: summarizeOwners(enriched),
        ownerSourceSummary: summarizeOwnerSources(enriched),
        ownerConfidenceSummary: summarizeOwnerConfidence(enriched),
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
        ownerSources: ownerSourcesForMeta(sourceUrl),
        generatedAt: new Date().toISOString(),
        featureCount: 0,
        statesIncluded: ISO_NE_STATES,
        osmLineOwnerMatchMaxMiles: MAX_OSM_LINE_OWNER_MATCH_DISTANCE_MILES,
        osmLineOwnerMatchCount: 0,
        osmLineRecordsWithOwner: 0,
        ownerSummary: {},
        ownerSourceSummary: {},
        ownerConfidenceSummary: {},
        notes: PUBLIC_NOTICE,
        warning,
      },
    );
    console.warn(`Public transmission ingestion warning: ${warning}`);
  }
}

async function readOpenStreetMapLineOwners() {
  if (process.env.SKIP_OSM_LINE_OWNER_ENRICHMENT === "1") return [];
  const endpoints = (process.env.OVERPASS_API_URLS || DEFAULT_OVERPASS_ENDPOINTS.join(","))
    .split(",")
    .map((endpoint) => endpoint.trim())
    .filter(Boolean);

  const records = new Map<string, OsmLineOwnerRecord>();
  for (const { label, bbox } of ISO_NE_STATE_BBOXES) {
    const elements = await readOpenStreetMapLinesForBbox(label, bbox, endpoints);
    elements
      .map((element) => normalizeOsmLineOwnerRecord(element))
      .filter((record): record is OsmLineOwnerRecord => record !== null)
      .forEach((record) => records.set(record.osmElementId, record));
  }

  return [...records.values()];
}

async function readOpenStreetMapLinesForBbox(label: IsoNeState, [south, west, north, east]: [number, number, number, number], endpoints: string[]) {
  const query = `[out:json][timeout:60];
(
  way["power"~"^(line|minor_line|cable)$"]["voltage"]["operator"](${south},${west},${north},${east});
  way["power"~"^(line|minor_line|cable)$"]["voltage"]["owner"](${south},${west},${north},${east});
);
out tags geom;`;

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
        body: query,
      }, OVERPASS_REQUEST_TIMEOUT_MS);
      const text = await response.text();
      if (!response.ok || !text.trim().startsWith("{")) {
        throw new Error(`Overpass response was not JSON: ${response.status} ${response.statusText}`);
      }
      const data = JSON.parse(text) as { elements?: OverpassLineElement[] };
      return data.elements || [];
    } catch (error) {
      console.warn(`OpenStreetMap line owner enrichment skipped ${label} at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return [];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOsmLineOwnerRecord(element: OverpassLineElement): OsmLineOwnerRecord | null {
  const tags = element.tags || {};
  const coordinates = (element.geometry || [])
    .map((point): Coordinate | null => typeof point.lon === "number" && typeof point.lat === "number" ? [roundCoord(point.lon), roundCoord(point.lat)] : null)
    .filter((coordinate): coordinate is Coordinate => coordinate !== null);
  if (coordinates.length < 2 || !coordinates.some(isInIsoNeBounds)) return null;

  const voltageKv = parseOsmVoltageKv(tags.voltage || tags["voltage:primary"] || tags["voltage:secondary"]);
  if (!voltageKv || voltageKv < 69) return null;

  const operator = cleanText(tags.operator);
  const owner = cleanText(tags.owner);
  const ownerResolution = resolvePublicTransmissionOwner(owner || operator, cleanText(tags.name));
  if (ownerResolution.owner === UNKNOWN_PUBLIC_OWNER) return null;

  const states = statesForCoordinates(coordinates);
  if (!states.length) return null;

  return {
    osmElementId: `${element.type}/${element.id}`,
    name: cleanText(tags.name),
    operator,
    owner,
    utilityOwner: ownerResolution.owner,
    ownerSource: owner ? "openstreetmap_line_owner_tag" : "openstreetmap_line_operator_tag",
    coordinates,
    voltageKv,
    voltageClass: getVoltageClass(voltageKv),
    states,
  };
}

function enrichTransmissionOwnersFromOsm(features: PublicTransmissionLineFeature[], osmLineOwners: OsmLineOwnerRecord[]): PublicTransmissionLineFeature[] {
  if (!osmLineOwners.length) return features;
  return features.map((feature): PublicTransmissionLineFeature => {
    const existingSource = feature.properties.ownerSource || "unknown";
    if (existingSource === "hifld_owner_field") return feature;
    const match = bestOsmOwnerMatch(feature, osmLineOwners);
    if (!match) return feature;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        owner: match.utilityOwner,
        utilityOwner: match.utilityOwner,
        ownerSource: match.ownerSource,
        ownerConfidence: "openstreetmap_spatial_match" as const,
        osmLineElementId: match.osmElementId,
        osmLineName: match.name || null,
        osmOperator: match.operator || null,
        osmOwner: match.owner || null,
        osmMatchDistanceMiles: Number(match.distanceMiles.toFixed(4)),
      },
    };
  });
}

function bestOsmOwnerMatch(feature: PublicTransmissionLineFeature, osmLineOwners: OsmLineOwnerRecord[]): OsmLineOwnerMatch | null {
  const featureCoordinates = featureLineCoordinates(feature);
  const featureVoltageKv = normalizeKv(feature.properties.voltageKv);
  if (featureCoordinates.length < 2 || !featureVoltageKv) return null;

  let best: OsmLineOwnerMatch | null = null;
  for (const record of osmLineOwners) {
    if (!statesOverlap(feature.properties.states, record.states)) continue;
    if (!voltageCompatible(featureVoltageKv, record.voltageKv)) continue;
    const distanceMiles = minimumLineDistanceMiles(featureCoordinates, record.coordinates);
    if (distanceMiles > MAX_OSM_LINE_OWNER_MATCH_DISTANCE_MILES) continue;
    const candidate = { ...record, distanceMiles };
    if (!best || scoreOsmLineMatch(candidate, feature) > scoreOsmLineMatch(best, feature)) best = candidate;
  }
  return best;
}

async function fetchAllFeatures(sourceUrl: string, outFields: string) {
  const normalizedFeatures = [];
  const pageSize = 2000;
  let offset = 0;
  let usedOutFields = outFields;

  while (true) {
    const response = await queryArcGis(sourceUrl, offset, pageSize, usedOutFields);
    if (response.error && usedOutFields !== "*") {
      usedOutFields = "*";
      offset = 0;
      normalizedFeatures.length = 0;
      continue;
    }
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
  if (!response.ok) throw new Error(`HIFLD query failed: ${response.status} ${response.statusText}`);
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
    const wanted = ["OBJECTID", "ID", "GLOBALID", "GlobalID", "NAME", "LINE_NAME", "LINE", "LINENAME", "SUB_1", "VOLTAGE", "VOLTAGE_KV", "KV", "MAX_VOLT", "OWNER", "OWNER_1", "OWNER_NAME", "COMPANY", "STATUS", "IN_SERVICE", "NAICS_DESC"];
    const selected = wanted.filter((field) => available.has(field));
    return selected.length ? selected.join(",") : "*";
  } catch {
    return "*";
  }
}

async function writeOutputs(collection: PublicTransmissionLineCollection, metadata: IngestMeta) {
  const finalMeta = {
    ...metadata,
    featureCount: collection.features.length,
    osmLineOwnerMatchCount: countByOwnerConfidence(collection.features, "openstreetmap_spatial_match"),
    ownerSummary: summarizeOwners(collection.features),
    ownerSourceSummary: summarizeOwnerSources(collection.features),
    ownerConfidenceSummary: summarizeOwnerConfidence(collection.features),
  };
  await writeFile(OUTPUT_GEOJSON, `${JSON.stringify(collection, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_META, `${JSON.stringify(finalMeta, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${collection.features.length} public transmission-line features to ${path.relative(process.cwd(), OUTPUT_GEOJSON)}`);
}

function normalizeLayerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/\/FeatureServer$/i.test(trimmed)) return `${trimmed}/0`;
  return trimmed;
}

function ownerSourcesForMeta(sourceUrl: string): IngestMeta["ownerSources"] {
  return [
    {
      sourceName: "HIFLD Electric Power Transmission Lines",
      sourceUrl,
      attribution: "Public HIFLD transmission-line geometry and OWNER attributes.",
    },
    {
      sourceName: "OpenStreetMap power=line owner/operator tags",
      sourceUrl: DEFAULT_OVERPASS_ENDPOINTS[0],
      attribution: "OpenStreetMap contributors; used only for close public spatial matches with compatible voltage.",
    },
  ];
}

function summarizeOwners(features: PublicTransmissionLineCollection["features"]) {
  const counts: Record<string, number> = {};
  features.forEach((feature) => {
    const owner = feature.properties.utilityOwner || feature.properties.owner || UNKNOWN_PUBLIC_OWNER;
    counts[owner] = (counts[owner] || 0) + 1;
  });
  return sortRecord(counts);
}

function summarizeOwnerSources(features: PublicTransmissionLineCollection["features"]) {
  const counts: Record<string, number> = {};
  features.forEach((feature) => {
    const source = feature.properties.ownerSource || "unknown";
    counts[source] = (counts[source] || 0) + 1;
  });
  return sortRecord(counts);
}

function summarizeOwnerConfidence(features: PublicTransmissionLineCollection["features"]) {
  const counts: Record<string, number> = {};
  features.forEach((feature) => {
    const confidence = feature.properties.ownerConfidence || "unknown";
    counts[confidence] = (counts[confidence] || 0) + 1;
  });
  return sortRecord(counts);
}

function countByOwnerConfidence(features: PublicTransmissionLineCollection["features"], ownerConfidence: NonNullable<PublicTransmissionLineFeature["properties"]["ownerConfidence"]>) {
  return features.filter((feature) => feature.properties.ownerConfidence === ownerConfidence).length;
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function featureLineCoordinates(feature: PublicTransmissionLineFeature): Coordinate[] {
  return feature.geometry.type === "LineString" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
}

function minimumLineDistanceMiles(aCoordinates: Coordinate[], bCoordinates: Coordinate[]) {
  const aSample = sampleCoordinates(aCoordinates, 18);
  const bSample = sampleCoordinates(bCoordinates, 60);
  return Math.min(minPointToLineDistanceMiles(aSample, bSample), minPointToLineDistanceMiles(sampleCoordinates(bCoordinates, 18), sampleCoordinates(aCoordinates, 60)));
}

function minPointToLineDistanceMiles(points: Coordinate[], line: Coordinate[]) {
  let minDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    for (let index = 0; index < line.length - 1; index += 1) {
      minDistance = Math.min(minDistance, pointToSegmentDistanceMiles(point, line[index], line[index + 1]));
    }
  }
  return minDistance;
}

function pointToSegmentDistanceMiles(point: Coordinate, start: Coordinate, end: Coordinate) {
  const refLat = (point[1] + start[1] + end[1]) / 3;
  const p = toPlanarMiles(point, refLat);
  const a = toPlanarMiles(start, refLat);
  const b = toPlanarMiles(end, refLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - projection.x, p.y - projection.y);
}

function toPlanarMiles([longitude, latitude]: Coordinate, refLat: number) {
  return {
    x: longitude * 69.172 * Math.cos(toRad(refLat)),
    y: latitude * 69,
  };
}

function sampleCoordinates(coordinates: Coordinate[], maxSamples: number) {
  if (coordinates.length <= maxSamples) return coordinates;
  const samples: Coordinate[] = [];
  const step = (coordinates.length - 1) / (maxSamples - 1);
  for (let index = 0; index < maxSamples; index += 1) {
    samples.push(coordinates[Math.round(index * step)]);
  }
  return samples;
}

function scoreOsmLineMatch(match: OsmLineOwnerMatch, feature: PublicTransmissionLineFeature) {
  const featureName = normalizeComparableName(feature.properties.name || "");
  const osmName = normalizeComparableName(match.name);
  const nameScore = featureName && osmName && (featureName.includes(osmName) || osmName.includes(featureName)) ? 40 : 0;
  const exactVoltageScore = normalizeKv(feature.properties.voltageKv) === match.voltageKv ? 20 : 0;
  const distanceScore = Math.max(0, 100 - match.distanceMiles * 500);
  return nameScore + exactVoltageScore + distanceScore;
}

function statesOverlap(a: IsoNeState[], b: IsoNeState[]) {
  return a.some((state) => b.includes(state));
}

function voltageCompatible(aKv: number, bKv: number) {
  if (Math.abs(aKv - bKv) <= 5) return true;
  return getVoltageClass(aKv) === getVoltageClass(bKv) && Math.abs(aKv - bKv) <= 25;
}

function normalizeKv(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return value > 1000 ? Math.round(value / 1000) : Math.round(value);
}

function parseOsmVoltageKv(value: string | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return null;
  const values = matches
    .map((match) => Number(match))
    .filter((number) => Number.isFinite(number) && number > 0)
    .map((number) => number > 1000 ? number / 1000 : number);
  if (!values.length) return null;
  return Math.round(Math.max(...values));
}

function cleanText(value: unknown) {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (!text || /^not available$/i.test(text) || /^unknown$/i.test(text) || /^none$/i.test(text) || text === "-999999") return "";
  return text.replace(/\s+/g, " ");
}

function normalizeComparableName(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(transmission|line|circuit|corridor|unknown)\b/g, " ")
    .trim();
}

function roundCoord(value: number) {
  return Number(value.toFixed(6));
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

void main();
