import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Coordinate, IsoNeState, PublicTransmissionLineCollection, SyntheticSubstationCollection, SyntheticSubstationFeature, SyntheticSubstationProperties } from "../lib/types/assets";
import { ISO_NE_STATES, STATE_BOUNDS, isInIsoNeBounds } from "./clip-to-iso-ne";

const SEED = "gridassetlink-iso-ne-synthetic-substations-v1";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_GEOJSON = path.join(OUTPUT_DIR, "iso-ne-synthetic-substations.geojson");
const OUTPUT_META = path.join(OUTPUT_DIR, "iso-ne-synthetic-substations.meta.json");
const PUBLIC_LINE_INPUT = path.join(OUTPUT_DIR, "iso-ne-public-transmission-lines.geojson");
const DISCLAIMER = "Synthetic demo/planning substation. Not a real utility asset.";
const CONNECTION_NOTE = "Synthetic planning association to nearest public transmission corridor. Not a verified physical connection.";

const STATE_COUNTS: Record<IsoNeState, number> = {
  MA: 28,
  CT: 18,
  ME: 18,
  NH: 14,
  VT: 12,
  RI: 10,
};

const STATE_CENTERS: Record<IsoNeState, Array<{ region: string; longitude: number; latitude: number }>> = {
  MA: [
    { region: "Central MA", longitude: -71.82, latitude: 42.22 },
    { region: "Worcester", longitude: -71.78, latitude: 42.28 },
    { region: "Lowell", longitude: -71.33, latitude: 42.62 },
    { region: "Springfield", longitude: -72.62, latitude: 42.13 },
    { region: "Cape", longitude: -70.55, latitude: 41.78 },
    { region: "Auburn", longitude: -71.84, latitude: 42.2 },
  ],
  CT: [
    { region: "Hartford", longitude: -72.68, latitude: 41.76 },
    { region: "Western CT", longitude: -73.22, latitude: 41.38 },
    { region: "New Haven", longitude: -72.91, latitude: 41.32 },
    { region: "Eastern CT", longitude: -72.05, latitude: 41.55 },
  ],
  RI: [
    { region: "Providence", longitude: -71.42, latitude: 41.82 },
    { region: "Bristol", longitude: -71.27, latitude: 41.68 },
    { region: "Southern RI", longitude: -71.58, latitude: 41.5 },
  ],
  NH: [
    { region: "Merrimack", longitude: -71.45, latitude: 42.98 },
    { region: "Nashua", longitude: -71.47, latitude: 42.76 },
    { region: "Seacoast", longitude: -70.85, latitude: 43.08 },
    { region: "White Mountain", longitude: -71.55, latitude: 44.05 },
  ],
  VT: [
    { region: "Green Mountain", longitude: -72.75, latitude: 43.75 },
    { region: "Champlain", longitude: -73.2, latitude: 44.35 },
    { region: "Rutland", longitude: -72.98, latitude: 43.61 },
    { region: "Northeast VT", longitude: -72.0, latitude: 44.55 },
  ],
  ME: [
    { region: "Portland", longitude: -70.28, latitude: 43.66 },
    { region: "Augusta", longitude: -69.78, latitude: 44.31 },
    { region: "Bangor", longitude: -68.78, latitude: 44.8 },
    { region: "Northern ME", longitude: -68.15, latitude: 46.68 },
    { region: "Southern ME", longitude: -70.65, latitude: 43.45 },
  ],
};

const NAME_SUFFIXES = ["Junction", "Telecom Hub", "Switching Node", "Fiber Terminal", "Ring Station", "Planning Yard", "Intertie Node"];
const ROLE_VOLTAGES: Record<SyntheticSubstationProperties["planningRole"], number[]> = {
  bulk_transmission_hub: [345, 230],
  regional_switching_station: [230, 115],
  telecom_hub: [115],
  fiber_aggregation_site: [115, 69],
  distribution_interface: [69, 13.8],
  renewables_collection: [115, 34.5],
  load_center: [230, 115],
  intertie_planning_node: [345, 230],
};

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const rng = createSeededRandom(SEED);
  const publicLines = await readPublicLines();
  const features: SyntheticSubstationFeature[] = [];

  ISO_NE_STATES.forEach((state) => {
    for (let index = 0; index < STATE_COUNTS[state]; index += 1) {
      const coordinate = createSyntheticCoordinate(state, index, features, rng);
      const role = choosePlanningRole(state, index, rng);
      const status = chooseByDistribution(index + features.length, ["existing", "planned", "proposed"], [0.45, 0.35, 0.2]) as SyntheticSubstationProperties["status"];
      const criticality = chooseByDistribution(index + features.length + 13, ["low", "medium", "high", "critical"], [0.2, 0.45, 0.25, 0.1]) as SyntheticSubstationProperties["criticality"];
      const lineId = findNearestPublicLineId(coordinate, publicLines);
      const center = STATE_CENTERS[state][index % STATE_CENTERS[state].length];
      const suffix = NAME_SUFFIXES[(index + Math.floor(rng() * NAME_SUFFIXES.length)) % NAME_SUFFIXES.length];
      const id = `SYN-SUB-${state}-${String(index + 1).padStart(3, "0")}`;
      features.push({
        type: "Feature",
        properties: {
          id,
          name: `Synthetic ${center.region} ${String(index + 1).padStart(2, "0")} ${suffix}`,
          synthetic: true,
          labelType: "synthetic",
          source: "synthetic-demo",
          sourceType: "synthetic-planning",
          visibility: index % 5 === 0 ? "team" : "private",
          public: false,
          state,
          county: undefined,
          cityHint: center.region,
          latitude: coordinate[1],
          longitude: coordinate[0],
          voltageClasses: ROLE_VOLTAGES[role],
          status,
          planningRole: role,
          criticality,
          connectedTransmissionLineIds: lineId ? [lineId] : [],
          connectedDeviceIds: syntheticIds("DEV", state, index, index % 3),
          connectedCircuitIds: syntheticIds("CIR", state, index, index % 2),
          connectedFiberIds: syntheticIds("FIB", state, index, index % 4 === 0 ? 1 : 0),
          notes: "Synthetic ISO-NE demo planning point generated from a deterministic seed. Not an actual substation or verified asset.",
          disclaimer: DISCLAIMER,
          connectionNote: CONNECTION_NOTE,
        },
        geometry: { type: "Point", coordinates: coordinate },
      });
    }
  });

  const collection: SyntheticSubstationCollection = { type: "FeatureCollection", features };
  await writeFile(OUTPUT_GEOJSON, `${JSON.stringify(collection, null, 2)}\n`, "utf-8");
  await writeFile(OUTPUT_META, `${JSON.stringify({
    sourceName: "GridAssetLink synthetic ISO-NE substations",
    sourceType: "synthetic-planning",
    generatedAt: new Date().toISOString(),
    seed: SEED,
    featureCount: features.length,
    stateCounts: STATE_COUNTS,
    statesIncluded: ISO_NE_STATES,
    notes: "Synthetic demo/planning substations only. Not real utility assets.",
    publicLineAssociations: publicLines.features.length ? "Nearest public corridor IDs are synthetic planning associations only." : "No public transmission-line file was available; connectedTransmissionLineIds are empty.",
  }, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${features.length} synthetic substations to ${path.relative(process.cwd(), OUTPUT_GEOJSON)}`);
}

async function readPublicLines(): Promise<PublicTransmissionLineCollection> {
  try {
    const content = await readFile(PUBLIC_LINE_INPUT, "utf-8");
    const parsed = JSON.parse(content) as PublicTransmissionLineCollection;
    return parsed.type === "FeatureCollection" && Array.isArray(parsed.features) ? parsed : { type: "FeatureCollection", features: [] };
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}

function createSyntheticCoordinate(state: IsoNeState, index: number, existing: SyntheticSubstationFeature[], rng: () => number): Coordinate {
  const bounds = STATE_BOUNDS[state];
  const centers = STATE_CENTERS[state];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const center = centers[(index + attempt) % centers.length];
    const longitude = clamp(center.longitude + (rng() - 0.5) * (bounds.east - bounds.west) * 0.42, bounds.west, bounds.east);
    const latitude = clamp(center.latitude + (rng() - 0.5) * (bounds.north - bounds.south) * 0.34, bounds.south, bounds.north);
    const coordinate: Coordinate = [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
    if (!isInIsoNeBounds(coordinate)) continue;
    if (existing.every((feature) => distanceDegrees(coordinate, feature.geometry.coordinates) > 0.055)) return coordinate;
  }
  return [
    Number((bounds.west + (bounds.east - bounds.west) * rng()).toFixed(6)),
    Number((bounds.south + (bounds.north - bounds.south) * rng()).toFixed(6)),
  ];
}

function choosePlanningRole(state: IsoNeState, index: number, rng: () => number): SyntheticSubstationProperties["planningRole"] {
  const southernRoles: SyntheticSubstationProperties["planningRole"][] = ["load_center", "telecom_hub", "fiber_aggregation_site", "regional_switching_station", "distribution_interface"];
  const northernRoles: SyntheticSubstationProperties["planningRole"][] = ["renewables_collection", "regional_switching_station", "intertie_planning_node", "fiber_aggregation_site", "telecom_hub"];
  const roles = ["ME", "NH", "VT"].includes(state) ? northernRoles : southernRoles;
  return roles[(index + Math.floor(rng() * roles.length)) % roles.length];
}

function chooseByDistribution(index: number, values: string[], weights: number[]) {
  const cycle = 100;
  const bucket = ((index * 37) % cycle) / cycle;
  let threshold = 0;
  for (let i = 0; i < values.length; i += 1) {
    threshold += weights[i];
    if (bucket < threshold) return values[i];
  }
  return values[values.length - 1];
}

function findNearestPublicLineId(coordinate: Coordinate, collection: PublicTransmissionLineCollection) {
  let bestId = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  collection.features.forEach((feature) => {
    const lineParts = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    lineParts.forEach((line) => {
      for (let index = 0; index < line.length - 1; index += 1) {
        const distance = pointToSegmentDistanceDegrees(coordinate, line[index], line[index + 1]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = feature.properties.id;
        }
      }
    });
  });
  return bestDistance <= 0.45 ? bestId : "";
}

function pointToSegmentDistanceDegrees(point: Coordinate, start: Coordinate, end: Coordinate) {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return distanceDegrees(point, start);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return distanceDegrees(point, [x1 + t * dx, y1 + t * dy]);
}

function distanceDegrees(a: Coordinate, b: Coordinate) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function syntheticIds(prefix: string, state: IsoNeState, index: number, count: number) {
  return Array.from({ length: count }, (_, childIndex) => `${prefix}-SYN-${state}-${String(index + 1).padStart(3, "0")}-${childIndex + 1}`);
}

function createSeededRandom(seed: string) {
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

void main();
