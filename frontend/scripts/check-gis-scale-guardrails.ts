import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dashboardPath = join(root, "components", "DashboardPage.tsx");
const mapPath = join(root, "components", "map", "MapLibreStreetMap.tsx");
const poleSamplePath = join(root, "public", "data", "iso-ne-synthetic-distribution-poles.geojson");

const dashboard = readFileSync(dashboardPath, "utf8");
const map = readFileSync(mapPath, "utf8");
const errors: string[] = [];

const requiredVectorTileLayers = [
  "territory",
  "poles",
  "spans",
  "fiber_routes",
  "splice_cases",
  "handholes",
  "slack_loops",
  "mux_sites",
  "circuit_routes",
];

const requiredMapLayerIds = [
  "gis-territory-boundary",
  "gis-pole-density",
  "gis-pole-clusters",
  "gis-pole-points",
  "gis-span-lines",
  "gis-fiber-routes",
  "gis-splice-cases",
  "gis-handholes",
  "gis-slack-loops",
  "gis-mux-sites",
  "gis-circuit-routes",
];

if (!map.includes("/api/tiles/") || !map.includes("gis-pole-density") || !map.includes("gis-pole-points")) {
  errors.push("MapLibreStreetMap must use PostGIS vector tile sources for GIS-scale poles.");
}

for (const layer of requiredVectorTileLayers) {
  if (!map.includes(`vectorTileUrl("${layer}"`)) {
    errors.push(`MapLibreStreetMap must source ${layer} from /api/tiles/${layer}/{z}/{x}/{y}.mvt.`);
  }
}

for (const layerId of requiredMapLayerIds) {
  if (!map.includes(`id: "${layerId}"`) && !map.includes(`"${layerId}"`)) {
    errors.push(`MapLibreStreetMap must define GIS vector style layer ${layerId}.`);
  }
}

for (const sourceLayer of requiredVectorTileLayers) {
  const expectedSourceLayer = sourceLayer === "territory" ? "territory" : sourceLayer;
  if (!map.includes(`"source-layer": "${expectedSourceLayer}"`)) {
    errors.push(`MapLibreStreetMap must render source-layer ${expectedSourceLayer}.`);
  }
}

if (!dashboard.includes("NEXT_PUBLIC_LOAD_STATIC_DISTRIBUTION_POLE_SAMPLE") || !dashboard.includes("Static pole point sample disabled")) {
  errors.push("Dashboard must keep the static distribution pole point sample behind an explicit opt-in flag.");
}

if (!dashboard.includes("/api/search?type=") || !dashboard.includes("AbortController")) {
  errors.push("Dashboard search must include cancellable server-side GIS search.");
}

if (!dashboard.includes("GisScaleControlPanel") || !dashboard.includes('rightMode === "scale"')) {
  errors.push("Dashboard must expose a GIS-scale control panel for territory import, road import, preflight, and generation.");
}

for (const endpoint of [
  "/api/service-territories/import-geojson",
  "/api/road-centerlines/import-geojson",
  "/generation-preflight?",
  "/generate-synthetic-assets",
  "/api/generation-jobs/",
]) {
  if (!dashboard.includes(endpoint)) {
    errors.push(`GIS-scale control panel must call ${endpoint}.`);
  }
}

if (dashboard.includes("setDistributionPoles(payload") || dashboard.includes("setDistributionPoles(await")) {
  errors.push("Dashboard must not hydrate production pole layers from raw API payloads.");
}

try {
  const poleSampleBytes = statSync(poleSamplePath).size;
  const maxSampleBytes = 25 * 1024 * 1024;
  if (poleSampleBytes > maxSampleBytes) {
    errors.push(`Static distribution pole sample is ${(poleSampleBytes / 1024 / 1024).toFixed(1)} MB; keep browser fallback samples below 25 MB.`);
  }
} catch {
  errors.push("Static pole sample metadata check failed; expected public/data/iso-ne-synthetic-distribution-poles.geojson.");
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("GIS scale guardrails passed: vector tiles, server search, scale controls, and static sample opt-in are present.");
