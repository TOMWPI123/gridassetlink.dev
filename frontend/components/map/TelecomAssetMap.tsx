"use client";

import { AlertTriangle, CheckCircle2, Crosshair, Info, MapPinned, MousePointer2, RefreshCw, Route, Satellite, ShieldCheck } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AssetDetailDrawer } from "@/components/map/AssetDetailDrawer";
import { LayerControlPanel, type TelecomMapLayerKey, type TelecomMapViewMode } from "@/components/map/LayerControlPanel";
import { MapKpiStrip } from "@/components/map/MapKpiStrip";
import { SearchAndFilters } from "@/components/map/SearchAndFilters";
import { flattenTelecomAssets, getAssetName, getAssetSearchText, getAssetStatus, getTelecomAssetDashboardData } from "@/lib/api/assets";
import type {
  Coordinate,
  GeoFeature,
  ProposedChangeProperties,
  ProposedRouteDraft,
  SubstationProperties,
  TelecomAssetDashboardData,
  TelecomAssetFeature,
  TelecomAssetFilters,
} from "@/lib/types/assets";

const mapWidth = 1000;
const mapHeight = 720;
const bounds = { minLon: -73.35, maxLon: -69.65, minLat: 40.75, maxLat: 44.1 };

const initialFilters: TelecomAssetFilters = {
  query: "",
  assetTypes: [],
  statuses: [],
  regions: [],
  criticalities: [],
  manufacturers: [],
  lifecycleStates: [],
  fiberTypes: [],
  circuitServiceTypes: [],
  workOrderPriorities: [],
};

const initialLayers: Record<TelecomMapLayerKey, boolean> = {
  substations: true,
  telecomNodes: true,
  fiberRoutes: true,
  telecomCircuits: true,
  microwavePaths: true,
  workOrders: true,
  proposedChanges: true,
};

const layerByKind: Record<TelecomAssetFeature["assetKind"], TelecomMapLayerKey> = {
  substation: "substations",
  telecom_node: "telecomNodes",
  fiber_route: "fiberRoutes",
  telecom_circuit: "telecomCircuits",
  microwave_path: "microwavePaths",
  work_order: "workOrders",
  proposed_change: "proposedChanges",
};

const stateLabels = [
  { label: "ME", x: 800, y: 105 },
  { label: "NH", x: 560, y: 220 },
  { label: "VT", x: 230, y: 185 },
  { label: "MA", x: 500, y: 435 },
  { label: "RI", x: 530, y: 545 },
  { label: "CT", x: 250, y: 585 },
];

const stateShapes = [
  "M684 48 L930 88 L904 242 L758 286 L690 174 Z",
  "M500 164 L650 138 L676 316 L552 342 L494 270 Z",
  "M186 86 L438 152 L428 334 L270 360 L152 266 Z",
  "M240 386 L730 392 L744 500 L560 542 L376 508 L218 466 Z",
  "M518 500 L652 512 L644 596 L526 592 Z",
  "M128 502 L480 520 L464 626 L122 634 Z",
];

export function TelecomAssetMap() {
  const [data, setData] = useState<TelecomAssetDashboardData | null>(null);
  const [error, setError] = useState("");
  const [layers, setLayers] = useState(initialLayers);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedAsset, setSelectedAsset] = useState<TelecomAssetFeature | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [markerScale, setMarkerScale] = useState(1);
  const [viewMode, setViewMode] = useState<TelecomMapViewMode>("current");
  const [planningMode, setPlanningMode] = useState(false);
  const [draftSites, setDraftSites] = useState<string[]>([]);
  const [draftRoutes, setDraftRoutes] = useState<ProposedRouteDraft[]>([]);
  const [viewBox, setViewBox] = useState(`0 0 ${mapWidth} ${mapHeight}`);
  const [toast, setToast] = useState("");

  async function loadData() {
    setError("");
    try {
      const dashboardData = await getTelecomAssetDashboardData();
      setData(dashboardData);
      setSelectedAsset(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load telecom asset map data");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const draftAssets = useMemo(() => draftRoutes.map(routeDraftToAsset), [draftRoutes]);

  const allAssets = useMemo(() => {
    if (!data) return draftAssets;
    return [...flattenTelecomAssets(data), ...draftAssets];
  }, [data, draftAssets]);

  const filterOptions = useMemo(() => buildFilterOptions(allAssets), [allAssets]);

  const visibleAssets = useMemo(() => {
    return allAssets.filter((asset) => isVisibleAsset(asset, filters, layers, viewMode, data));
  }, [allAssets, filters, layers, viewMode, data]);

  const visibleLines = visibleAssets.filter(isLineAsset);
  const visiblePoints = visibleAssets.filter(isPointAsset).sort((a, b) => pointDrawRank(a.assetKind) - pointDrawRank(b.assetKind));

  const draftSiteNames = useMemo(() => {
    if (!data) return draftSites;
    const namesById = new Map(data.substations.features.map((substation) => [substation.properties.id, substation.properties.name]));
    return draftSites.map((siteId) => namesById.get(siteId) || siteId);
  }, [data, draftSites]);

  function handleAssetSelect(asset: TelecomAssetFeature) {
    setSelectedAsset(asset);
    if (!planningMode || asset.assetKind !== "substation") return;
    const substationId = asset.properties.id;
    setDraftSites((current) => {
      if (current.includes(substationId)) return current.filter((siteId) => siteId !== substationId);
      return [...current.slice(-1), substationId];
    });
  }

  function handleCreateDraftRoute() {
    if (!data || draftSites.length < 2) return;
    const substations = new Map(data.substations.features.map((substation) => [substation.properties.id, substation]));
    const aEnd = substations.get(draftSites[0]);
    const zEnd = substations.get(draftSites[1]);
    if (!aEnd || !zEnd) return;
    const draft: ProposedRouteDraft = {
      id: `PC-DRAFT-${Date.now().toString(36).toUpperCase()}`,
      aSite: aEnd.properties.id,
      zSite: zEnd.properties.id,
      routeType: "fiber",
      status: "draft",
      coordinates: [aEnd.geometry.coordinates, midpointOffset(aEnd.geometry.coordinates, zEnd.geometry.coordinates), zEnd.geometry.coordinates],
    };
    setDraftRoutes((current) => [draft, ...current]);
    setSelectedAsset(routeDraftToAsset(draft));
    setToast(`Draft proposed route staged between ${aEnd.properties.name} and ${zEnd.properties.name}.`);
    setDraftSites([]);
    window.setTimeout(() => setToast(""), 4200);
  }

  if (!data && !error) {
    return (
      <div className="telecom-map-dashboard loading">
        <div className="telecom-loading-panel">
          <RefreshCw size={24} />
          <strong>Loading telecom asset map</strong>
          <span>Preparing synthetic New England utility telecom layers.</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="telecom-map-dashboard loading">
        <div className="telecom-loading-panel error">
          <AlertTriangle size={24} />
          <strong>Map data did not load</strong>
          <span>{error || "Unknown map error"}</span>
          <button className="telecom-map-button primary" type="button" onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <main className={`telecom-map-dashboard ${viewMode}-mode`}>
      <header className="telecom-map-topbar">
        <div>
          <h1>Telecom Asset Map</h1>
          <p>Interactive New England utility telecom planning map with synthetic substations, SEL ICON nodes, fiber routes, circuits, work orders, and proposed changes.</p>
        </div>
        <div className="telecom-map-status-row" aria-label="Map status badges">
          <span className="telecom-state-badge actual">Actual</span>
          <span className="telecom-state-badge planned">Planned</span>
          <span className="telecom-state-badge proposed">Proposed</span>
          <span className="telecom-state-badge as-built">As-built</span>
        </div>
      </header>

      <div className="telecom-map-workspace">
        <SearchAndFilters
          collapsed={sidebarCollapsed}
          filters={filters}
          filterOptions={filterOptions}
          results={visibleAssets}
          planningMode={planningMode}
          selectedDraftSites={draftSiteNames}
          onFiltersChange={setFilters}
          onSelectAsset={handleAssetSelect}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          onTogglePlanningMode={() => setPlanningMode((current) => !current)}
          onCreateDraftRoute={handleCreateDraftRoute}
          onClearDraftSites={() => setDraftSites([])}
        />

        <section className="telecom-map-stage" aria-label="New England telecom asset map">
          <div className="telecom-map-stage-header">
            <div>
              <strong>ISO-NE Territory Planning Layer</strong>
              <span>Fictional telecom overlay on public-reference geography</span>
            </div>
            <div className="telecom-map-stage-tools">
              <span><MousePointer2 size={14} />Click assets for module details</span>
              {planningMode ? <span className="active"><Route size={14} />Planning mode</span> : null}
            </div>
          </div>

          <div className="telecom-map-canvas-shell">
            <svg className="telecom-map-svg" viewBox={viewBox} role="img" aria-label="Synthetic New England telecom asset map">
              <defs>
                <radialGradient id="telecomMapGlow" cx="50%" cy="42%" r="68%">
                  <stop offset="0%" stopColor="#163337" stopOpacity="0.94" />
                  <stop offset="52%" stopColor="#0b171a" stopOpacity="1" />
                  <stop offset="100%" stopColor="#071012" stopOpacity="1" />
                </radialGradient>
                <filter id="telecomMarkerShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity="0.42" />
                </filter>
              </defs>
              <rect width={mapWidth} height={mapHeight} fill="url(#telecomMapGlow)" />
              <MapGrid />
              {stateShapes.map((shape, index) => <path className="telecom-state-shape" d={shape} key={shape} style={{ animationDelay: `${index * 80}ms` }} />)}
              {stateLabels.map((label) => <text className="telecom-state-label" x={label.x} y={label.y} key={label.label}>{label.label}</text>)}
              <text className="telecom-watermark" x="34" y="682">Synthetic planning overlay / public-reference geography only</text>

              <g aria-label="Line assets">
                {visibleLines.map((asset) => <LineAsset key={assetKey(asset)} asset={asset} selected={selectedAsset ? assetKey(asset) === assetKey(selectedAsset) : false} onSelect={handleAssetSelect} />)}
              </g>

              <g aria-label="Point assets">
                {visiblePoints.map((asset) => (
                  <PointAsset
                    key={assetKey(asset)}
                    asset={asset}
                    markerScale={markerScale}
                    selected={selectedAsset ? assetKey(asset) === assetKey(selectedAsset) : false}
                    draftSelected={asset.assetKind === "substation" && draftSites.includes(asset.properties.id)}
                    planningMode={planningMode}
                    onSelect={handleAssetSelect}
                  />
                ))}
              </g>
            </svg>

            <div className="telecom-map-floating-legend">
              <span><Satellite size={14} />Dark map mode</span>
              <span><Crosshair size={14} />{visibleAssets.length} visible assets</span>
              <span><ShieldCheck size={14} />Read-only operational boundary</span>
            </div>

            {toast ? <div className="telecom-map-toast"><CheckCircle2 size={16} />{toast}</div> : null}
          </div>
        </section>

        <LayerControlPanel
          layers={layers}
          markerScale={markerScale}
          viewMode={viewMode}
          onLayerToggle={(layer) => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}
          onMarkerScaleChange={setMarkerScale}
          onViewModeChange={setViewMode}
          onResetView={() => setViewBox(`0 0 ${mapWidth} ${mapHeight}`)}
        />
      </div>

      <MapKpiStrip data={data} visibleAssets={visibleAssets} />
      <AssetDetailDrawer asset={selectedAsset} data={data} onClose={() => setSelectedAsset(null)} />

      <div className="telecom-map-production-note">
        <Info size={15} />
        <span>Production note: replace local GeoJSON with authenticated API data, server-side filtering, audit logging, RBAC, and redaction of sensitive operational topology.</span>
      </div>
    </main>
  );
}

function MapGrid() {
  const vertical = Array.from({ length: 9 }, (_, index) => 80 + index * 105);
  const horizontal = Array.from({ length: 7 }, (_, index) => 70 + index * 92);
  return (
    <g className="telecom-map-grid" aria-hidden="true">
      {vertical.map((x) => <line x1={x} x2={x} y1="40" y2="680" key={`v-${x}`} />)}
      {horizontal.map((y) => <line x1="40" x2="960" y1={y} y2={y} key={`h-${y}`} />)}
    </g>
  );
}

function LineAsset({ asset, selected, onSelect }: { asset: TelecomAssetFeature; selected: boolean; onSelect: (asset: TelecomAssetFeature) => void }) {
  if (!isLineAsset(asset)) return null;
  const path = coordinatesToPath(asset.geometry.coordinates);
  const midpoint = getLineMidpoint(asset.geometry.coordinates);
  const status = getAssetStatus(asset).toLowerCase().replaceAll(" ", "-");
  return (
    <g
      className={`telecom-map-line-asset ${asset.assetKind} ${status} ${selected ? "selected" : ""}`}
      data-testid={`map-line-${assetKey(asset)}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset)}
      onKeyDown={(event) => handleKeyboardSelect(event, () => onSelect(asset))}
      aria-label={`Select ${getAssetName(asset)}`}
    >
      <title>{getAssetName(asset)}</title>
      <path className="telecom-line-hit" d={path} />
      <path className="telecom-line-visible" d={path} />
      <circle className="telecom-line-pulse" cx={midpoint.x} cy={midpoint.y} r="4" />
      {selected ? <text className="telecom-map-inline-label" x={midpoint.x + 10} y={midpoint.y - 10}>{getAssetName(asset)}</text> : null}
    </g>
  );
}

function PointAsset({
  asset,
  markerScale,
  selected,
  draftSelected,
  planningMode,
  onSelect,
}: {
  asset: TelecomAssetFeature;
  markerScale: number;
  selected: boolean;
  draftSelected: boolean;
  planningMode: boolean;
  onSelect: (asset: TelecomAssetFeature) => void;
}) {
  if (!isPointAsset(asset)) return null;
  const point = project(asset.geometry.coordinates);
  const offset = getPointOffset(asset.assetKind);
  const status = getAssetStatus(asset).toLowerCase().replaceAll(" ", "-");
  const label = getAssetName(asset);
  const isPlanningCandidate = planningMode && asset.assetKind === "substation";
  const markerClass = `telecom-map-point-asset ${asset.assetKind} ${status} ${selected ? "selected" : ""} ${draftSelected ? "draft-selected" : ""} ${isPlanningCandidate ? "planning-candidate" : ""}`;
  const symbol = getPointSymbol(asset);

  return (
    <g
      className={markerClass}
      transform={`translate(${point.x + offset.x} ${point.y + offset.y}) scale(${markerScale})`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(asset)}
      onKeyDown={(event) => handleKeyboardSelect(event, () => onSelect(asset))}
      aria-label={`Select ${label}`}
    >
      <title>{label}</title>
      <circle className="telecom-point-hit" r="32" data-testid={`map-point-${assetKey(asset)}`} />
      {symbol}
      <text x="14" y="-13">{shortLabel(label)}</text>
    </g>
  );
}

function getPointOffset(assetKind: TelecomAssetFeature["assetKind"]) {
  if (assetKind === "telecom_node") return { x: 24, y: -32 };
  if (assetKind === "work_order") return { x: -34, y: 34 };
  if (assetKind === "substation") return { x: 0, y: 0 };
  return { x: 0, y: 0 };
}

function pointDrawRank(assetKind: TelecomAssetFeature["assetKind"]) {
  if (assetKind === "substation") return 1;
  if (assetKind === "work_order") return 2;
  if (assetKind === "telecom_node") return 3;
  return 4;
}

function getPointSymbol(asset: TelecomAssetFeature) {
  if (asset.assetKind === "substation") {
    return <path className="telecom-marker-symbol" d="M0 -12 L12 0 L0 12 L-12 0 Z" />;
  }
  if (asset.assetKind === "work_order") {
    return <rect className="telecom-marker-symbol" x="-10" y="-10" width="20" height="20" rx="4" />;
  }
  return (
    <>
      <circle className="telecom-marker-halo" r="18" />
      <circle className="telecom-marker-symbol" r="10" />
    </>
  );
}

function routeDraftToAsset(draft: ProposedRouteDraft): GeoFeature<ProposedChangeProperties, "LineString"> & { assetKind: "proposed_change" } {
  return {
    type: "Feature",
    assetKind: "proposed_change",
    properties: {
      id: draft.id,
      title: `Draft proposed fiber route ${draft.aSite} to ${draft.zSite}`,
      changeType: "fiber_route",
      status: "draft",
      fromSite: draft.aSite,
      toSite: draft.zSite,
      notes: "Synthetic staged planning route created in dashboard planning mode.",
    },
    geometry: { type: "LineString", coordinates: draft.coordinates },
  };
}

function isVisibleAsset(
  asset: TelecomAssetFeature,
  filters: TelecomAssetFilters,
  layers: Record<TelecomMapLayerKey, boolean>,
  viewMode: TelecomMapViewMode,
  data: TelecomAssetDashboardData | null,
) {
  if (!layers[layerByKind[asset.assetKind]]) return false;
  const status = getAssetStatus(asset);
  if (viewMode === "proposed" && !["proposed", "planned", "draft", "engineering_review", "field_ready"].includes(status)) return false;
  if (viewMode === "difference" && asset.assetKind === "microwave_path") return false;
  if (filters.query && !getAssetSearchText(asset).includes(filters.query.toLowerCase())) return false;
  if (filters.assetTypes.length && !filters.assetTypes.includes(asset.assetKind)) return false;
  if (filters.statuses.length && !filters.statuses.includes(status)) return false;

  const props = asset.properties as Record<string, unknown>;
  if (filters.regions.length && !filters.regions.includes(getAssetRegion(asset, data))) return false;
  if (filters.criticalities.length && !filters.criticalities.includes(String(props.criticality || ""))) return false;
  if (filters.manufacturers.length && !filters.manufacturers.includes(String(props.manufacturer || ""))) return false;
  if (filters.lifecycleStates.length && !filters.lifecycleStates.includes(String(props.lifecycleState || ""))) return false;
  if (filters.fiberTypes.length && !filters.fiberTypes.includes(String(props.fiberType || ""))) return false;
  if (filters.circuitServiceTypes.length && !filters.circuitServiceTypes.includes(String(props.serviceType || ""))) return false;
  if (filters.workOrderPriorities.length && !filters.workOrderPriorities.includes(String(props.priority || ""))) return false;
  return true;
}

function buildFilterOptions(assets: TelecomAssetFeature[]) {
  return {
    statuses: unique(assets.map(getAssetStatus)),
    regions: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).region || ""))),
    criticalities: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).criticality || ""))),
    manufacturers: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).manufacturer || ""))),
    lifecycleStates: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).lifecycleState || ""))),
    fiberTypes: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).fiberType || ""))),
    circuitServiceTypes: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).serviceType || ""))),
    workOrderPriorities: unique(assets.map((asset) => String((asset.properties as Record<string, unknown>).priority || ""))),
  };
}

function getAssetRegion(asset: TelecomAssetFeature, data: TelecomAssetDashboardData | null) {
  const props = asset.properties as Record<string, unknown>;
  if (props.region) return String(props.region);
  const siteId = String(props.site || props.fromSite || props.toSite || "");
  const substation = data?.substations.features.find((feature) => feature.properties.id === siteId);
  return substation?.properties.region || "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function isLineAsset(asset: TelecomAssetFeature): asset is Extract<TelecomAssetFeature, { geometry: { type: "LineString" } }> {
  return asset.geometry.type === "LineString";
}

function isPointAsset(asset: TelecomAssetFeature): asset is Extract<TelecomAssetFeature, { geometry: { type: "Point" } }> {
  return asset.geometry.type === "Point";
}

function project([lon, lat]: Coordinate) {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * mapWidth;
  const y = mapHeight - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * mapHeight;
  return { x, y };
}

function coordinatesToPath(coordinates: Coordinate[]) {
  return coordinates.map((coordinate, index) => {
    const point = project(coordinate);
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ");
}

function getLineMidpoint(coordinates: Coordinate[]) {
  return project(coordinates[Math.floor(coordinates.length / 2)] || coordinates[0]);
}

function midpointOffset(a: Coordinate, z: Coordinate): Coordinate {
  return [(a[0] + z[0]) / 2 + 0.08, (a[1] + z[1]) / 2 + 0.08];
}

function assetKey(asset: TelecomAssetFeature) {
  const props = asset.properties as Record<string, unknown>;
  return `${asset.assetKind}-${String(props.id || props.circuitId || props.pathId || props.woId || props.routeName || props.name)}`;
}

function shortLabel(label: string) {
  return label.replace("SUB-", "").replace("-ICON-01", "").replace("-OTN-01", "").replace("-RTR-01", "").replace("-XTRAN-01", "").replace("-MW-01", "");
}

function handleKeyboardSelect(event: KeyboardEvent<SVGGElement>, onSelect: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect();
}
