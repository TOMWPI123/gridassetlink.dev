import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublicTransmissionLineCollection } from "../lib/types/assets";
import { ISO_NE_STATES } from "./clip-to-iso-ne";
import { dedupeTransmissionLineFeatures, normalizeTransmissionLineFeature } from "./normalize-transmission-lines";

const DEFAULT_HIFLD_FEATURESERVER_URL = "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/ArcGIS/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0";
const PUBLIC_NOTICE = "Public reference data only. Not for operations.";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_GEOJSON = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.geojson");
const OUTPUT_META = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.meta.json");

type ArcGisQueryResponse = {
  features?: unknown[];
  error?: { message?: string; details?: string[] };
};

type IngestMeta = {
  sourceName: string;
  sourceType: "public-reference";
  sourceUrl: string;
  generatedAt: string;
  featureCount: number;
  statesIncluded: typeof ISO_NE_STATES;
  notes: string;
  warning?: string;
};

async function main() {
  const sourceName = process.env.NEXT_PUBLIC_TRANSMISSION_LINES_SOURCE_NAME || "HIFLD Electric Power Transmission Lines";
  const sourceUrl = normalizeLayerUrl(process.env.TRANSMISSION_LINES_FEATURESERVER_URL || DEFAULT_HIFLD_FEATURESERVER_URL);

  await mkdir(OUTPUT_DIR, { recursive: true });

  try {
    const outFields = await getSafeOutFields(sourceUrl);
    const features = await fetchAllFeatures(sourceUrl, outFields);
    const normalized = dedupeTransmissionLineFeatures(features
      .map((feature, index) => normalizeTransmissionLineFeature(feature as Parameters<typeof normalizeTransmissionLineFeature>[0], index))
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null));
    await writeOutputs(
      { type: "FeatureCollection", features: normalized },
      {
        sourceName,
        sourceType: "public-reference",
        sourceUrl,
        generatedAt: new Date().toISOString(),
        featureCount: normalized.length,
        statesIncluded: ISO_NE_STATES,
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
        notes: PUBLIC_NOTICE,
        warning,
      },
    );
    console.warn(`Public transmission ingestion warning: ${warning}`);
  }
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
  await writeFile(OUTPUT_GEOJSON, `${JSON.stringify(collection, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_META, `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${collection.features.length} public transmission-line features to ${path.relative(process.cwd(), OUTPUT_GEOJSON)}`);
}

function normalizeLayerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/\/FeatureServer$/i.test(trimmed)) return `${trimmed}/0`;
  return trimmed;
}

void main();
