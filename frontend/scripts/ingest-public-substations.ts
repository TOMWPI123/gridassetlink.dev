import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Coordinate, IsoNeState, PublicSubstationCollection, PublicSubstationFeature, PublicSubstationOwnerSource } from "../lib/types/assets";
import { ISO_NE_STATES, isInIsoNeBounds } from "./clip-to-iso-ne";

const DEFAULT_HIFLD_SUBSTATIONS_FEATURESERVER_URL = "https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0";
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
const PUBLIC_NOTICE = "Public substation reference data only. Not for operations. Only substation nodes with a directly supported public utility owner/operator source are included. Unknown-owner and nearest-line-only inferred records are excluded.";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_GEOJSON = path.join(OUTPUT_DIR, "iso-ne-public-substations.geojson");
const OUTPUT_META = path.join(OUTPUT_DIR, "iso-ne-public-substations.meta.json");
const MAX_OSM_OWNER_MATCH_DISTANCE_MILES = 0.2;
const USER_AGENT = "GridAssetLink synthetic planning demo public data enrichment (no private data)";

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
  ownerSources: Array<{
    sourceName: string;
    sourceUrl: string;
    attribution: string;
  }>;
  generatedAt: string;
  featureCount: number;
  rawCandidateCount: number;
  excludedUnverifiedOwnerCount: number;
  statesIncluded: typeof ISO_NE_STATES;
  osmOwnerMatchMaxMiles: number;
  osmOwnerMatchCount: number;
  osmSubstationRecordsWithOwner: number;
  ownerSummary: Record<string, number>;
  ownerSourceSummary: Record<string, number>;
  ownerConfidenceSummary: Record<string, number>;
  notes: string;
  warning?: string;
};

type OsmSubstationOwnerRecord = {
  osmElementId: string;
  name: string;
  operator: string;
  owner: string;
  utilityOwner: string;
  ownerSource: Extract<PublicSubstationOwnerSource, "openstreetmap_operator_tag" | "openstreetmap_owner_tag">;
  coordinate: Coordinate;
};

type OsmOwnerMatch = OsmSubstationOwnerRecord & {
  distanceMiles: number;
};

async function main() {
  const sourceName = process.env.NEXT_PUBLIC_SUBSTATIONS_SOURCE_NAME || "HIFLD Electric Substations";
  const sourceUrl = normalizeLayerUrl(process.env.SUBSTATIONS_FEATURESERVER_URL || DEFAULT_HIFLD_SUBSTATIONS_FEATURESERVER_URL);

  await mkdir(OUTPUT_DIR, { recursive: true });

  try {
    const osmSubstations = await readOpenStreetMapSubstationOwners();
    const outFields = await getSafeOutFields(sourceUrl);
    const features = await fetchAllFeatures(sourceUrl, outFields);
    const rawCandidateCount = features.length;
    const normalized = features
      .map((feature, index) => normalizeSubstationFeature(feature, index, osmSubstations))
      .filter((feature): feature is PublicSubstationFeature => feature !== null);
    const verified = dedupeSubstations(normalized);
    await writeOutputs(
      { type: "FeatureCollection", features: verified },
      {
        sourceName,
        sourceType: "public-reference",
        sourceUrl,
        ownerSources: ownerSourcesForMeta(sourceUrl),
        generatedAt: new Date().toISOString(),
        featureCount: verified.length,
        rawCandidateCount,
        excludedUnverifiedOwnerCount: Math.max(0, rawCandidateCount - verified.length),
        statesIncluded: ISO_NE_STATES,
        osmOwnerMatchMaxMiles: MAX_OSM_OWNER_MATCH_DISTANCE_MILES,
        osmOwnerMatchCount: countByOwnerConfidence(verified, "openstreetmap_spatial_match"),
        osmSubstationRecordsWithOwner: osmSubstations.length,
        ownerSummary: summarizeOwners(verified),
        ownerSourceSummary: summarizeOwnerSources(verified),
        ownerConfidenceSummary: summarizeOwnerConfidence(verified),
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
        rawCandidateCount: 0,
        excludedUnverifiedOwnerCount: 0,
        statesIncluded: ISO_NE_STATES,
        osmOwnerMatchMaxMiles: MAX_OSM_OWNER_MATCH_DISTANCE_MILES,
        osmOwnerMatchCount: 0,
        osmSubstationRecordsWithOwner: 0,
        ownerSummary: {},
        ownerSourceSummary: {},
        ownerConfidenceSummary: {},
        notes: PUBLIC_NOTICE,
        warning,
      },
    );
    console.warn(`Public substation ingestion warning: ${warning}`);
  }
}

async function readOpenStreetMapSubstationOwners() {
  if (process.env.SKIP_OSM_SUBSTATION_OWNER_ENRICHMENT === "1") return [];
  const endpoints = (process.env.OVERPASS_API_URLS || DEFAULT_OVERPASS_ENDPOINTS.join(","))
    .split(",")
    .map((endpoint) => endpoint.trim())
    .filter(Boolean);

  const records = new Map<string, OsmSubstationOwnerRecord>();
  for (const { label, bbox } of ISO_NE_STATE_BBOXES) {
    const elements = await readOpenStreetMapSubstationsForBbox(label, bbox, endpoints);
    elements
      .map((element) => normalizeOsmOwnerRecord(element))
      .filter((record): record is OsmSubstationOwnerRecord => record !== null)
      .forEach((record) => records.set(record.osmElementId, record));
  }

  return [...records.values()];
}

async function readOpenStreetMapSubstationsForBbox(label: IsoNeState, [south, west, north, east]: [number, number, number, number], endpoints: string[]) {
  const query = `[out:json][timeout:60];
(
  node["power"="substation"](${south},${west},${north},${east});
  way["power"="substation"](${south},${west},${north},${east});
  relation["power"="substation"](${south},${west},${north},${east});
);
out tags center;`;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
        body: query,
      });
      const text = await response.text();
      if (!response.ok || !text.trim().startsWith("{")) {
        throw new Error(`Overpass response was not JSON: ${response.status} ${response.statusText}`);
      }
      const data = JSON.parse(text) as { elements?: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }> };
      return data.elements || [];
    } catch (error) {
      console.warn(`OpenStreetMap owner enrichment skipped ${label} at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return [];
}

function normalizeOsmOwnerRecord(element: { type: string; id: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }): OsmSubstationOwnerRecord | null {
  const longitude = element.lon ?? element.center?.lon;
  const latitude = element.lat ?? element.center?.lat;
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  const coordinate: Coordinate = [roundCoord(longitude), roundCoord(latitude)];
  if (!isInIsoNeBounds(coordinate)) return null;
  const tags = element.tags || {};
  const operator = cleanText(tags.operator);
  const owner = cleanText(tags.owner);
  const utilityOwner = operator || owner;
  if (!utilityOwner) return null;
  return {
    osmElementId: `${element.type}/${element.id}`,
    name: cleanText(tags.name),
    operator,
    owner,
    utilityOwner,
    ownerSource: operator ? "openstreetmap_operator_tag" : "openstreetmap_owner_tag",
    coordinate,
  };
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

function normalizeSubstationFeature(feature: ArcGisFeature, fallbackIndex: number, osmSubstations: OsmSubstationOwnerRecord[]): PublicSubstationFeature | null {
  const raw = feature.properties || feature.attributes || {};
  const coordinates = pointCoordinates(feature);
  if (!coordinates || !isInIsoNeBounds(coordinates)) return null;
  const state = cleanText(firstDefined(raw, ["STATE", "state"])).toUpperCase();
  if (!isIsoNeState(state)) return null;

  const sourceId = cleanText(firstDefined(raw, ["ID", "OBJECTID", "OBJECTID_1", "FID"])) || `HIFLD-SUB-${fallbackIndex + 1}`;
  const name = cleanText(firstDefined(raw, ["NAME", "name"])) || `Public substation ${sourceId}`;
  const rawOwner = cleanText(firstDefined(raw, ["OWNER", "OWNER_NAME", "OPERATOR", "UTILITY"]));
  const osmMatch = rawOwner ? null : nearestOsmOwner(coordinates, name, osmSubstations);
  if (!rawOwner && !osmMatch) return null;
  const owner = ownerFrom(rawOwner, osmMatch);
  const ownerSource = ownerSourceFrom(rawOwner, osmMatch);
  const ownerConfidence = rawOwner
    ? "public_record"
    : osmMatch
      ? "openstreetmap_spatial_match"
      : "unknown";

  return {
    type: "Feature",
    properties: {
      id: sourceId.startsWith("HIFLD-SUB-") ? sourceId : `HIFLD-SUB-${sourceId}`,
      name,
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
      osmElementId: osmMatch?.osmElementId || null,
      osmSubstationName: osmMatch?.name || null,
      osmOperator: osmMatch?.operator || null,
      osmOwner: osmMatch?.owner || null,
      osmMatchDistanceMiles: osmMatch ? Number(osmMatch.distanceMiles.toFixed(3)) : null,
      nearestPublicLineId: null,
      nearestPublicLineDistanceMiles: null,
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

function nearestOsmOwner(coordinate: Coordinate, hifldName: string, osmSubstations: OsmSubstationOwnerRecord[]): OsmOwnerMatch | null {
  let best: OsmOwnerMatch | null = null;
  for (const osmSubstation of osmSubstations) {
    const distanceMiles = haversineMiles(coordinate, osmSubstation.coordinate);
    if (distanceMiles > MAX_OSM_OWNER_MATCH_DISTANCE_MILES) continue;
    const candidate = { ...osmSubstation, distanceMiles };
    if (!best || scoreOsmMatch(candidate, hifldName) > scoreOsmMatch(best, hifldName)) best = candidate;
  }
  return best;
}

function scoreOsmMatch(match: OsmOwnerMatch, hifldName: string) {
  const normalizedHifldName = normalizeComparableName(hifldName);
  const normalizedOsmName = normalizeComparableName(match.name);
  const nameScore = normalizedHifldName && normalizedOsmName && normalizedHifldName === normalizedOsmName ? 100 : 0;
  return nameScore + Math.max(0, 10 - match.distanceMiles * 10);
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

function haversineMiles([lon1, lat1]: Coordinate, [lon2, lat2]: Coordinate) {
  const radiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ownerFrom(rawOwner: string, osmMatch: OsmOwnerMatch | null) {
  if (rawOwner) return rawOwner;
  if (osmMatch?.utilityOwner) return osmMatch.utilityOwner;
  return "Unknown public owner";
}

function ownerSourceFrom(rawOwner: string, osmMatch: OsmOwnerMatch | null): PublicSubstationOwnerSource {
  if (rawOwner) return "public_substation_owner_field";
  if (osmMatch?.ownerSource) return osmMatch.ownerSource;
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

function summarizeOwnerSources(features: PublicSubstationFeature[]) {
  return features.reduce<Record<string, number>>((summary, feature) => {
    summary[feature.properties.ownerSource] = (summary[feature.properties.ownerSource] || 0) + 1;
    return summary;
  }, {});
}

function summarizeOwnerConfidence(features: PublicSubstationFeature[]) {
  return features.reduce<Record<string, number>>((summary, feature) => {
    summary[feature.properties.ownerConfidence] = (summary[feature.properties.ownerConfidence] || 0) + 1;
    return summary;
  }, {});
}

function countByOwnerConfidence(features: PublicSubstationFeature[], ownerConfidence: PublicSubstationFeature["properties"]["ownerConfidence"]) {
  return features.filter((feature) => feature.properties.ownerConfidence === ownerConfidence).length;
}

async function writeOutputs(collection: PublicSubstationCollection, metadata: IngestMeta) {
  const finalMeta = {
    ...metadata,
    featureCount: collection.features.length,
    ownerSummary: summarizeOwners(collection.features),
    ownerSourceSummary: summarizeOwnerSources(collection.features),
    ownerConfidenceSummary: summarizeOwnerConfidence(collection.features),
    osmOwnerMatchCount: countByOwnerConfidence(collection.features, "openstreetmap_spatial_match"),
  };
  await writeFile(OUTPUT_GEOJSON, `${JSON.stringify(collection, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_META, `${JSON.stringify(finalMeta, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${collection.features.length} public substation features to ${path.relative(process.cwd(), OUTPUT_GEOJSON)}`);
}

function ownerSourcesForMeta(sourceUrl: string): IngestMeta["ownerSources"] {
  return [
    {
      sourceName: "HIFLD Electric Substations",
      sourceUrl,
      attribution: "Public HIFLD substation reference attributes.",
    },
    {
      sourceName: "OpenStreetMap power=substation operator/owner tags",
      sourceUrl: DEFAULT_OVERPASS_ENDPOINTS[0],
      attribution: "OpenStreetMap contributors; used only for close public spatial matches.",
    },
  ];
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

function normalizeComparableName(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(substation|station|switching|switchyard|unknown)\b/g, " ")
    .trim();
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
