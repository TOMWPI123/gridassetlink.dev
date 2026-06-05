import type { Coordinate, PublicTransmissionLineFeature } from "../lib/types/assets";
import { getVoltageClass, parseVoltageKv } from "../lib/map/voltage";
import { clipLineStringToIsoNe, flattenLineCoordinates, statesForCoordinates } from "./clip-to-iso-ne";

type ArcGisFeature = {
  type?: string;
  properties?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown; paths?: number[][][] };
};

export function normalizeTransmissionLineFeature(feature: ArcGisFeature, fallbackIndex: number): PublicTransmissionLineFeature | null {
  const rawProperties = feature.properties || feature.attributes || {};
  const geometry = toGeoJsonGeometry(feature.geometry);
  if (!geometry) return null;

  const clippedParts = geometry.coordinates
    .map((line) => clipLineStringToIsoNe(line))
    .filter((line) => line.length >= 2);
  if (!clippedParts.length) return null;

  const coordinatesForState = clippedParts.flat();
  const states = statesForCoordinates(coordinatesForState);
  if (!states.length) return null;

  const voltageKv = parseVoltageKv(firstDefined(rawProperties, ["VOLTAGE", "VOLTAGE_KV", "KV", "MAX_VOLT", "MAXVOLT", "kV"]));
  const sourceId = stringify(firstDefined(rawProperties, ["ID", "OBJECTID", "FID", "GLOBALID", "GlobalID"])) || `HIFLD-ISO-NE-${fallbackIndex + 1}`;
  const name = cleanPublicText(firstDefined(rawProperties, ["NAME", "LINE_NAME", "LINE", "LINENAME", "SUB_1"]));
  const owner = cleanPublicText(firstDefined(rawProperties, ["OWNER", "OWNER_1", "OWNER_NAME", "COMPANY", "NAICS_DESC"]));
  const status = normalizeStatus(firstDefined(rawProperties, ["STATUS", "STATUS_1", "IN_SERVICE"]));

  return {
    type: "Feature",
    properties: {
      id: sourceId.startsWith("HIFLD-") ? sourceId : `HIFLD-${sourceId}`,
      name: name || `Public transmission line ${sourceId}`,
      voltageKv,
      voltageClass: getVoltageClass(voltageKv),
      status,
      owner: owner || null,
      source: "HIFLD",
      sourceType: "public-reference",
      readOnly: true,
      synthetic: false,
      states,
      isoNe: true,
      publicDataNotice: "Public reference transmission-line geometry. Not for operations.",
    },
    geometry: clippedParts.length === 1
      ? { type: "LineString", coordinates: clippedParts[0] }
      : { type: "MultiLineString", coordinates: clippedParts },
  };
}

export function dedupeTransmissionLineFeatures(features: PublicTransmissionLineFeature[]) {
  const seen = new Set<string>();
  return features.filter((feature) => {
    const key = JSON.stringify(feature.geometry.coordinates).slice(0, 2400);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toGeoJsonGeometry(geometry: ArcGisFeature["geometry"]): { type: "LineString" | "MultiLineString"; coordinates: Coordinate[][] } | null {
  if (!geometry) return null;
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return { type: "LineString", coordinates: [(geometry.coordinates as Coordinate[]).filter(isCoordinatePair)] };
  }
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return { type: "MultiLineString", coordinates: (geometry.coordinates as Coordinate[][]).map((line) => line.filter(isCoordinatePair)) };
  }
  if (Array.isArray(geometry.paths)) {
    return { type: geometry.paths.length === 1 ? "LineString" : "MultiLineString", coordinates: geometry.paths.map((path) => path.filter(isCoordinatePair)) };
  }
  const flattened = flattenLineCoordinates({ type: geometry.type || "", coordinates: geometry.coordinates });
  return flattened.length >= 2 ? { type: "LineString", coordinates: [flattened] } : null;
}

function normalizeStatus(value: unknown): "existing" | "planned" | "proposed" | "unknown" {
  const normalized = stringify(value).toLowerCase();
  if (normalized.includes("proposed")) return "proposed";
  if (normalized.includes("planned") || normalized.includes("future")) return "planned";
  if (normalized.includes("existing") || normalized.includes("operat") || normalized.includes("in service")) return "existing";
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

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function cleanPublicText(value: unknown) {
  const text = stringify(value);
  if (!text || /^not available$/i.test(text) || /^unknown$/i.test(text) || text === "-999999") return "";
  return text;
}

function isCoordinatePair(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}
