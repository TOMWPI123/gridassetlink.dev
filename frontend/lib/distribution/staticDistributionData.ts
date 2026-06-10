import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  DistributionPoleCollection,
  DistributionPoleContinuityRecord,
  DistributionPoleFeature,
  DistributionPoleFiberRouteCollection,
  DistributionPoleFiberRouteFeature,
  PatchPanel,
} from "@/lib/types/assets";

const DATA_DIR = path.join(process.cwd(), "public", "data");

export type DistributionPoleNetworkData = {
  poles: DistributionPoleFeature[];
  fiberRoutes: DistributionPoleFiberRouteFeature[];
  continuityRecords: DistributionPoleContinuityRecord[];
  patchPanels: PatchPanel[];
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
  parentPatchPanel?: PatchPanel;
  serviceTypes: string[];
  estimatedRouteMiles: number;
  estimatedLossDb: number;
  estimatedPoleScaleCount: number;
  criticalServiceCount: number;
  warning: string;
};

export async function loadDistributionPoleNetworkData(): Promise<DistributionPoleNetworkData> {
  const [poles, fiberRoutes, continuityRecords, patchPanels] = await Promise.all([
    readData<DistributionPoleCollection>("iso-ne-synthetic-distribution-poles.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionPoleFiberRouteCollection>("iso-ne-synthetic-distribution-pole-fiber.geojson", { type: "FeatureCollection", features: [] }),
    readData<DistributionPoleContinuityRecord[]>("iso-ne-synthetic-distribution-continuity.json", []),
    readData<PatchPanel[]>("iso-ne-synthetic-patch-panels.json", []),
  ]);

  return {
    poles: poles.features,
    fiberRoutes: fiberRoutes.features,
    continuityRecords,
    patchPanels,
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

  return {
    targetType,
    targetId: decodedTarget,
    targetLabel: selectedPole?.properties.poleNumber || route.properties.routeName,
    route,
    continuityRecord,
    selectedPole,
    routePoles,
    samplePoles,
    parentPatchPanel,
    serviceTypes,
    estimatedRouteMiles: route.properties.routeMiles,
    estimatedLossDb: estimateDistributionLoss(route.properties.routeMiles, route.properties.poleCount),
    estimatedPoleScaleCount: route.properties.estimatedPoleScaleCount,
    criticalServiceCount: serviceTypes.filter((service) => service === "SCADA" || service === "Protection Pilot" || service === "Distribution Automation").length,
    warning: continuityRecord?.warning || "Synthetic distribution telecom continuity only. Do not use for operations, dispatch, restoration, SCADA, protection, or CEII analysis.",
  };
}

function estimateDistributionLoss(routeMiles: number, poleCount: number) {
  const fiberLoss = routeMiles * 0.25;
  const connectorLoss = 1.0;
  const estimatedTapLoss = Math.min(2.4, Math.max(0.1, poleCount / 42) * 0.08);
  return Number((fiberLoss + connectorLoss + estimatedTapLoss).toFixed(2));
}

async function readData<T>(filename: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, filename), "utf-8")) as T;
  } catch {
    return fallback;
  }
}
