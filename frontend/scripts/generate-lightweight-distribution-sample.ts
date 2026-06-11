import type { DistributionPoleCollection } from "../lib/types/assets";
import {
  DISTRIBUTION_POLES_LITE_META_PATH,
  DISTRIBUTION_POLES_LITE_PATH,
  DISTRIBUTION_POLES_META_PATH,
  DISTRIBUTION_POLES_PATH,
  readJson,
  writeJson,
} from "./fiber-network-utils";

const TARGET_LITE_POLES = Number(process.env.DISTRIBUTION_POLE_LITE_COUNT || 1600);
const SEED = "gridassetlink-distribution-poles-lite-v1";

async function main() {
  const fullCollection = await readJson<DistributionPoleCollection>(DISTRIBUTION_POLES_PATH, { type: "FeatureCollection", features: [] });
  const sourceMeta = await readJson<Record<string, unknown>>(DISTRIBUTION_POLES_META_PATH, {});
  const byRoute = new Map<string, DistributionPoleCollection["features"]>();
  for (const feature of fullCollection.features) {
    const routeId = feature.properties.connectedDistributionFiberRouteIds?.[0] || feature.properties.feederId;
    const current = byRoute.get(routeId) || [];
    current.push(feature);
    byRoute.set(routeId, current);
  }

  const selected = new Map<string, DistributionPoleCollection["features"][number]>();
  const routeGroups = [...byRoute.values()].sort((a, b) => routeKey(a).localeCompare(routeKey(b)));

  for (const route of routeGroups) {
    route.sort((a, b) => a.properties.sequenceIndex - b.properties.sequenceIndex);
    addPole(selected, route[0]);
    addPole(selected, route[route.length - 1]);
    route.filter((feature) => feature.properties.telecomRole === "riser" || feature.properties.telecomRole === "splice_pole" || feature.properties.splicePointIds?.length || feature.properties.slackLoopIds?.length)
      .forEach((feature) => addPole(selected, feature));
  }

  let stride = 2;
  while (selected.size < TARGET_LITE_POLES && stride <= 12) {
    for (const route of routeGroups) {
      if (selected.size >= TARGET_LITE_POLES) break;
      const step = Math.max(stride, Math.ceil(route.length / Math.max(3, Math.floor(TARGET_LITE_POLES / Math.max(1, routeGroups.length)))));
      for (let index = 0; index < route.length; index += step) {
        addPole(selected, route[index]);
        if (selected.size >= TARGET_LITE_POLES) break;
      }
    }
    stride += 1;
  }

  const liteFeatures = [...selected.values()]
    .sort((a, b) => a.properties.id.localeCompare(b.properties.id))
    .slice(0, TARGET_LITE_POLES)
    .map((feature) => ({
      ...feature,
      properties: {
        id: feature.properties.id,
        poleNumber: feature.properties.poleNumber,
        feederId: feature.properties.feederId,
        streetPathId: feature.properties.streetPathId,
        sequenceIndex: feature.properties.sequenceIndex,
        latitude: feature.properties.latitude,
        longitude: feature.properties.longitude,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        placementModel: feature.properties.placementModel,
        placementBasis: `${feature.properties.placementBasis} Lightweight dashboard display sample.`,
        roadSide: feature.properties.roadSide,
        poleClass: feature.properties.poleClass,
        heightFt: feature.properties.heightFt,
        spanFromPreviousFt: feature.properties.spanFromPreviousFt,
        telecomRole: feature.properties.telecomRole,
        hasTelecomFiber: feature.properties.hasTelecomFiber,
        fiberCount: feature.properties.fiberCount,
        connectedDistributionFiberRouteIds: feature.properties.connectedDistributionFiberRouteIds,
        upstreamPoleId: feature.properties.upstreamPoleId,
        downstreamPoleId: feature.properties.downstreamPoleId,
        upstreamNetworkNodeId: feature.properties.upstreamNetworkNodeId,
        upstreamPatchPanelId: feature.properties.upstreamPatchPanelId,
        continuityPathId: feature.properties.continuityPathId,
        representedPoleCount: feature.properties.representedPoleCount,
        splicePointIds: feature.properties.splicePointIds,
        slackLoopIds: feature.properties.slackLoopIds,
        assignmentIds: feature.properties.assignmentIds,
        serviceDropCount: feature.properties.serviceDropCount,
        status: feature.properties.status,
        synthetic: true as const,
        source: "synthetic-demo" as const,
        notes: "Lightweight synthetic distribution pole display sample generated from street-path demo routes. Not a real pole record.",
      },
    }));

  await writeJson(DISTRIBUTION_POLES_LITE_PATH, { type: "FeatureCollection", features: liteFeatures });
  await writeJson(DISTRIBUTION_POLES_LITE_META_PATH, {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    source: "synthetic-demo",
    sourcePoleCount: fullCollection.features.length,
    displayPoleCount: liteFeatures.length,
    targetDisplayPoleCount: TARGET_LITE_POLES,
    representedRegionalPoleScale: sourceMeta.estimatedRegionalPoleScale,
    selectionStrategy: "route endpoints, risers, splice/slack poles, then evenly sampled street-path poles",
    optimizationNote: "Dashboard uses this lightweight display sample for individual distribution pole dots. Full pole inventories should be served by GIS vector tiles or backend paginated APIs.",
    disclaimer: "Synthetic distribution poles only. Placement follows generated street-path demo geometry and does not represent real pole locations.",
  });

  console.log(`Generated ${liteFeatures.length} lightweight distribution pole display records.`);
}

function addPole(selected: Map<string, DistributionPoleCollection["features"][number]>, feature?: DistributionPoleCollection["features"][number]) {
  if (feature) selected.set(feature.properties.id, feature);
}

function routeKey(route: DistributionPoleCollection["features"]) {
  return route[0]?.properties.connectedDistributionFiberRouteIds?.[0] || route[0]?.properties.feederId || "";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
