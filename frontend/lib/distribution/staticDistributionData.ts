import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  DistributionFiberAssignmentCollection,
  DistributionFiberAssignmentFeature,
  DistributionPoleCollection,
  DistributionPoleContinuityRecord,
  DistributionPoleDensityCollection,
  DistributionPoleDensityFeature,
  DistributionPoleFeature,
  DistributionPoleFiberRouteCollection,
  DistributionPoleFiberRouteFeature,
  DistributionPoleSplicePointCollection,
  DistributionPoleSplicePointFeature,
  DistributionSlackLoopCollection,
  DistributionSlackLoopFeature,
  PatchPanel,
} from "@/lib/types/assets";

const DATA_DIR = path.join(process.cwd(), "public", "data");

export type DistributionPoleNetworkData = {
  poles: DistributionPoleFeature[];
  poleDensity: DistributionPoleDensityFeature[];
  fiberRoutes: DistributionPoleFiberRouteFeature[];
  splicePoints: DistributionPoleSplicePointFeature[];
  slackLoops: DistributionSlackLoopFeature[];
  fiberAssignments: DistributionFiberAssignmentFeature[];
  continuityRecords: DistributionPoleContinuityRecord[];
  patchPanels: PatchPanel[];
  meta: DistributionPoleNetworkMeta;
};

export type DistributionPoleNetworkMeta = {
  generatedAt?: string;
  seed?: string;
  source?: string;
  displayPoleCount?: number;
  fiberRouteCount?: number;
  densityCellCount?: number;
  distributionSplicePointCount?: number;
  distributionSlackLoopCount?: number;
  distributionFiberAssignmentCount?: number;
  continuityRecordCount?: number;
  estimatedRegionalPoleScale?: number;
  estimatedPolesRepresentedPerDisplayPole?: number;
  coveredStates?: string[];
  coveredPublicSubstationAnchors?: number;
  optimizationNote?: string;
  disclaimer?: string;
};

export type DistributionPoleContinuityView = {
  targetType: "distribution_pole" | "distribution_route";
  targetId: string;
  targetLabel: string;
  route: DistributionPoleFiberRouteFeature;
  continuityRecord?: DistributionPoleContinuityRecord;
  selectedPole?: DistributionPoleFeature;
  routePoles: DistributionPoleFeature[];
  samplePoles: DistributionPoleFeature[];
  splicePoints: DistributionPoleSplicePointFeature[];
  slackLoops: DistributionSlackLoopFeature[];
  fiberAssignments: DistributionFiberAssignmentFeature[];
  parentPatchPanel?: PatchPanel;
  serviceTypes: string[];
  estimatedRouteMiles: number;
  estimatedLossDb: number;
  estimatedPoleScaleCount: number;
  totalSlackFeet: number;
  criticalServiceCount: number;
  warning: string;
};

export async function loadDistributionPoleNetworkData(): Promise<DistributionPoleNetworkData> {
  const [poles, poleDensity, fiberRoutes, splicePoints, slackLoops, fiberAssignments, continuityRecords, patchPanels, meta] = await Promise.all([
    readData<DistributionPoleCollection>("iso-ne-synthetic-distribution-poles.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionPoleDensityCollection>("iso-ne-synthetic-distribution-pole-density.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionPoleFiberRouteCollection>("iso-ne-synthetic-distribution-pole-fiber.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionPoleSplicePointCollection>("iso-ne-synthetic-distribution-splice-points.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionSlackLoopCollection>("iso-ne-synthetic-distribution-slack-loops.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionFiberAssignmentCollection>("iso-ne-synthetic-distribution-fiber-assignments.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionPoleContinuityRecord[]>("iso-ne-synthetic-distribution-continuity.json", []),
    readData<PatchPanel[]>("iso-ne-synthetic-patch-panels.json", []),
    readData<DistributionPoleNetworkMeta>("iso-ne-synthetic-distribution-poles.meta.json", {}),
  ]);

  return {
    poles: poles.features,
    poleDensity: poleDensity.features,
    fiberRoutes: fiberRoutes.features,
    splicePoints: splicePoints.features,
    slackLoops: slackLoops.features,
    fiberAssignments: fiberAssignments.features,
    continuityRecords,
    patchPanels,
    meta,
  };
}

export function buildDistributionPoleContinuityView(
  targetType: "distribution_pole" | "distribution_route",
  targetId: string,
  data: DistributionPoleNetworkData,
): DistributionPoleContinuityView | null {
  const decodedTarget = decodeURIComponent(targetId);
  const selectedPole = targetType === "distribution_pole"
    ? data.poles.find((pole) => pole.properties.id === decodedTarget || pole.properties.poleNumber === decodedTarget)
    : undefined;
  const routeId = targetType === "distribution_route"
    ? decodedTarget
    : selectedPole?.properties.connectedDistributionFiberRouteIds[0];
  if (!routeId) return null;
  const route = data.fiberRoutes.find((feature) => feature.properties.routeId === routeId || feature.properties.routeName === routeId);
  if (!route) return null;

  const continuityRecord = data.continuityRecords.find((record) => record.routeId === route.properties.routeId || record.continuityId === `DIST-CONT-${route.properties.routeId}`);
  const routePoles = data.poles
    .filter((pole) => pole.properties.connectedDistributionFiberRouteIds.includes(route.properties.routeId))
    .sort((a, b) => a.properties.sequenceIndex - b.properties.sequenceIndex);
  const sampleIds = continuityRecord?.samplePoleIds.length ? continuityRecord.samplePoleIds : route.properties.samplePoleIds;
  const samplePoles = sampleIds
    .map((poleId) => routePoles.find((pole) => pole.properties.id === poleId))
    .filter((pole): pole is DistributionPoleFeature => Boolean(pole));
  const parentPatchPanel = route.properties.parentPatchPanelId
    ? data.patchPanels.find((panel) => panel.id === route.properties.parentPatchPanelId)
    : undefined;
  const serviceTypes = [...new Set([...(continuityRecord?.serviceTypesCarried || []), ...route.properties.serviceTypesCarried])];
  const routeSpliceIds = new Set(continuityRecord?.splicePointIds || route.properties.splicePointIds || []);
  const routeSlackIds = new Set(continuityRecord?.slackLoopIds || route.properties.slackLoopIds || []);
  const routeAssignmentIds = new Set(continuityRecord?.assignmentIds || route.properties.assignmentIds || []);
  const splicePoints = data.splicePoints.filter((splice) => splice.properties.routeId === route.properties.routeId || routeSpliceIds.has(splice.properties.id));
  const slackLoops = data.slackLoops.filter((slack) => slack.properties.routeId === route.properties.routeId || routeSlackIds.has(slack.properties.id));
  const fiberAssignments = data.fiberAssignments.filter((assignment) => assignment.properties.routeId === route.properties.routeId || routeAssignmentIds.has(assignment.properties.id));
  const totalSlackFeet = continuityRecord?.totalSlackFeet || route.properties.totalSlackFeet || slackLoops.reduce((sum, slack) => sum + slack.properties.slackFeet, 0);

  return {
    targetType,
    targetId: decodedTarget,
    targetLabel: selectedPole?.properties.poleNumber || route.properties.routeName,
    route,
    continuityRecord,
    selectedPole,
    routePoles,
    samplePoles,
    splicePoints,
    slackLoops,
    fiberAssignments,
    parentPatchPanel,
    serviceTypes,
    estimatedRouteMiles: route.properties.routeMiles,
    estimatedLossDb: estimateDistributionLoss(route.properties.routeMiles, route.properties.poleCount, splicePoints.length, totalSlackFeet),
    estimatedPoleScaleCount: route.properties.estimatedPoleScaleCount,
    totalSlackFeet,
    criticalServiceCount: serviceTypes.filter((service) => service === "SCADA" || service === "Protection Pilot" || service === "Distribution Automation").length,
    warning: continuityRecord?.warning || "Synthetic distribution telecom continuity only. Do not use for operations, dispatch, restoration, SCADA, protection, or CEII analysis.",
  };
}

function estimateDistributionLoss(routeMiles: number, poleCount: number, splicePointCount = 0, totalSlackFeet = 0) {
  const fiberLoss = routeMiles * 0.25;
  const connectorLoss = 1.0;
  const estimatedTapLoss = Math.min(2.4, Math.max(0.1, poleCount / 42) * 0.08);
  const spliceLoss = splicePointCount * 0.05;
  const slackLoss = totalSlackFeet / 5280 * 0.25;
  return Number((fiberLoss + connectorLoss + estimatedTapLoss + spliceLoss + slackLoss).toFixed(2));
}

async function readData<T>(filename: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, filename), "utf-8")) as T;
  } catch {
    return fallback;
  }
}
