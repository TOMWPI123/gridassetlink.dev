import type {
  FiberRouteProperties,
  GeoFeatureCollection,
  MicrowavePathProperties,
  ProposedChangeProperties,
  TelecomAssetDashboardData,
  TelecomAssetFeature,
  TelecomCircuitProperties,
  TelecomNodeProperties,
  WorkOrderProperties,
  SubstationProperties,
} from "@/lib/types/assets";

// Production boundary:
// Replace this static mock loader with authenticated API calls, role-based access
// control, audit logging, and server-side filtering. Do not ship sensitive
// utility telecom topology or protection/service path data as public static files.
export async function getTelecomAssetDashboardData(): Promise<TelecomAssetDashboardData> {
  const [substations, telecomNodes, fiberRoutes, telecomCircuits, microwavePaths, workOrders, proposedChanges] = await Promise.all([
    loadGeoJson<SubstationProperties, "Point">("/data/substations.geojson"),
    loadGeoJson<TelecomNodeProperties, "Point">("/data/telecomNodes.geojson"),
    loadGeoJson<FiberRouteProperties, "LineString">("/data/fiberRoutes.geojson"),
    loadGeoJson<TelecomCircuitProperties, "LineString">("/data/telecomCircuits.geojson"),
    loadGeoJson<MicrowavePathProperties, "LineString">("/data/microwavePaths.geojson"),
    loadGeoJson<WorkOrderProperties, "Point">("/data/workOrders.geojson"),
    loadGeoJson<ProposedChangeProperties, "LineString">("/data/proposedChanges.geojson"),
  ]);

  return {
    substations,
    telecomNodes,
    fiberRoutes,
    telecomCircuits,
    microwavePaths,
    workOrders,
    proposedChanges,
  };
}

async function loadGeoJson<TProperties, TGeometry extends "Point" | "LineString">(url: string): Promise<GeoFeatureCollection<TProperties, TGeometry>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return await response.json() as GeoFeatureCollection<TProperties, TGeometry>;
}

export function flattenTelecomAssets(data: TelecomAssetDashboardData): TelecomAssetFeature[] {
  return [
    ...data.substations.features.map((feature) => ({ ...feature, assetKind: "substation" as const })),
    ...data.telecomNodes.features.map((feature) => ({ ...feature, assetKind: "telecom_node" as const })),
    ...data.fiberRoutes.features.map((feature) => ({ ...feature, assetKind: "fiber_route" as const })),
    ...data.telecomCircuits.features.map((feature) => ({ ...feature, assetKind: "telecom_circuit" as const })),
    ...data.microwavePaths.features.map((feature) => ({ ...feature, assetKind: "microwave_path" as const })),
    ...data.workOrders.features.map((feature) => ({ ...feature, assetKind: "work_order" as const })),
    ...data.proposedChanges.features.map((feature) => ({ ...feature, assetKind: "proposed_change" as const })),
  ];
}

export function getAssetName(asset: TelecomAssetFeature): string {
  const props = asset.properties as Record<string, unknown>;
  return String(props.name || props.routeName || props.circuitId || props.pathId || props.woId || props.title || props.id || "Asset");
}

export function getAssetStatus(asset: TelecomAssetFeature): string {
  return String((asset.properties as Record<string, unknown>).status || "unknown");
}

export function getAssetSite(asset: TelecomAssetFeature): string {
  const props = asset.properties as Record<string, unknown>;
  return String(props.site || props.fromSite || props.aSite || props.aEnd || props.relatedAssetId || "-");
}

export function getAssetSearchText(asset: TelecomAssetFeature): string {
  return Object.values(asset.properties as Record<string, unknown>).join(" ").toLowerCase();
}
