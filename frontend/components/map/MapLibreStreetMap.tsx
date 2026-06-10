"use client";

import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type MapLayerMouseEvent, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate, DistributionFiberAssignmentFeature, DistributionPoleDensityFeature, DistributionPoleFeature, DistributionPoleFiberRouteFeature, DistributionPoleSplicePointFeature, DistributionSlackLoopFeature, FccMicrowaveLinkFeature, FccUtilityTowerFeature, FiberAssignment, FiberSplice, FiberStrand, MapDrawingTool, MapNode, OpgwCableFeature, OpgwCableSectionFeature, OpgwRouteFeature, OpgwSpanSegmentFeature, OpgwSplicePointFeature, PatchPanel, PlanningRegion, PublicSubstationFeature, PublicTransmissionLineFeature, SpliceClosureFeature, StreetMapLayerKey, Substation, SyntheticService, SyntheticSubstationFeature, TransmissionLine, TransmissionMap, TransmissionStructureFeature } from "@/lib/types/assets";
import type { ContinuityHighlight, FocusRequest, MapCommand, StreetMapSelection } from "./StreetLevelAssetMap";
import { API_BASE } from "@/lib/api";
import { publicTransmissionLineOwner } from "@/lib/map/public-owner";
import { buildClosureToSplicePointId, buildSpliceNodeMetrics } from "@/lib/opgw/continuityEngine";

type MapLibreStreetMapProps = {
  activeMap: TransmissionMap;
  substations: Substation[];
  nodes: MapNode[];
  transmissionLines: TransmissionLine[];
  publicTransmissionLines: PublicTransmissionLineFeature[];
  publicSubstations: PublicSubstationFeature[];
  fccUtilityTowers: FccUtilityTowerFeature[];
  fccMicrowaveLinks: FccMicrowaveLinkFeature[];
  syntheticSubstations: SyntheticSubstationFeature[];
  transmissionStructures: TransmissionStructureFeature[];
  opgwCables: OpgwCableFeature[];
  opgwRoutes: OpgwRouteFeature[];
  opgwCableSections: OpgwCableSectionFeature[];
  opgwSpanSegments: OpgwSpanSegmentFeature[];
  opgwSplicePoints: OpgwSplicePointFeature[];
  spliceClosures: SpliceClosureFeature[];
  fiberSplices: FiberSplice[];
  fiberStrands: FiberStrand[];
  fiberAssignments: FiberAssignment[];
  syntheticServices: SyntheticService[];
  distributionPoleDensity: DistributionPoleDensityFeature[];
  distributionPoles: DistributionPoleFeature[];
  distributionPoleFiberRoutes: DistributionPoleFiberRouteFeature[];
  distributionSplicePoints: DistributionPoleSplicePointFeature[];
  distributionSlackLoops: DistributionSlackLoopFeature[];
  distributionFiberAssignments: DistributionFiberAssignmentFeature[];
  patchPanels: PatchPanel[];
  planningRegions: PlanningRegion[];
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  command: MapCommand | null;
  focusRequest: FocusRequest | null;
  continuityHighlight?: ContinuityHighlight;
  onMapClick: (coordinate: Coordinate) => void;
  onSelect: (selection: StreetMapSelection) => void;
  onStatusChange: (status: "loading" | "active" | "error", message?: string) => void;
};

type MapFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry:
    | { type: "Point"; coordinates: Coordinate }
    | { type: "LineString"; coordinates: Coordinate[] }
    | { type: "MultiLineString"; coordinates: Coordinate[][] }
    | { type: "Polygon"; coordinates: Coordinate[][] };
};

type MapFeatureCollection = {
  type: "FeatureCollection";
  features: MapFeature[];
};

const sourceIds = {
  regions: "regional-planning-regions",
  reference: "regional-iso-ne-reference",
  lines: "regional-transmission-lines",
  publicLines: "public-transmission-lines",
  publicSubstations: "public-substations",
  fccUtilityTowers: "fcc-utility-towers",
  fccMicrowaveLinks: "fcc-utility-microwave-links",
  structures: "synthetic-transmission-structures",
  opgwCables: "synthetic-opgw-cables",
  opgwRoutes: "synthetic-opgw-routes",
  opgwCableSections: "synthetic-opgw-cable-sections",
  opgwSpanSegments: "synthetic-opgw-span-segments",
  opgwSplicePoints: "synthetic-opgw-splice-points",
  spliceClosures: "synthetic-splice-closures",
  fiberAssignments: "synthetic-fiber-assignments",
  distributionPoleDensity: "synthetic-distribution-pole-density",
  distributionPoles: "synthetic-distribution-poles",
  distributionPoleFiberRoutes: "synthetic-distribution-pole-fiber-routes",
  distributionSplicePoints: "synthetic-distribution-splice-points",
  distributionSlackLoops: "synthetic-distribution-slack-loops",
  distributionFiberAssignments: "synthetic-distribution-fiber-assignments",
  patchPanels: "synthetic-patch-panels",
  substations: "regional-substations",
  syntheticSubstations: "synthetic-substations",
  nodes: "regional-map-nodes",
  workOrders: "regional-work-orders",
};

const gisVectorSourceIds = {
  territory: "gis-territory-vector",
  poles: "gis-poles-vector",
  spans: "gis-spans-vector",
  fiberRoutes: "gis-fiber-routes-vector",
  spliceCases: "gis-splice-cases-vector",
  handholes: "gis-handholes-vector",
  slackLoops: "gis-slack-loops-vector",
  muxSites: "gis-mux-sites-vector",
  circuitRoutes: "gis-circuit-routes-vector",
};

const gisVectorLayerIds = [
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

const clickableLayerIds = [
  "gis-pole-points",
  "gis-fiber-routes",
  "gis-splice-cases",
  "gis-handholes",
  "gis-slack-loops",
  "gis-mux-sites",
  "gis-circuit-routes",
  "regional-planning-regions-fill",
  "regional-reference-line",
  "public-transmission-lines",
  "public-substations",
  "fcc-utility-microwave-links",
  "fcc-utility-towers",
  "synthetic-opgw-routes",
  "synthetic-opgw-cable-sections",
  "synthetic-opgw-span-segments",
  "synthetic-opgw-splice-points-hit",
  "synthetic-opgw-splice-points",
  "synthetic-opgw-cables",
  "synthetic-opgw-capacity",
  "synthetic-opgw-outage-impact",
  "synthetic-fiber-assignments",
  "synthetic-distribution-fiber-assignments",
  "synthetic-distribution-pole-fiber-routes",
  "synthetic-distribution-pole-density",
  "synthetic-distribution-splice-points",
  "synthetic-distribution-slack-loops",
  "synthetic-distribution-poles",
  "synthetic-transmission-structures",
  "synthetic-splice-closures-hit",
  "synthetic-splice-closures",
  "synthetic-patch-panels",
  "regional-transmission-lines",
  "regional-transmission-lines-dashed",
  "regional-substations",
  "synthetic-substations-points",
  "regional-map-nodes",
  "regional-work-orders",
];

const isoNeBounds: LngLatBoundsLike = [[-74.2, 40.8], [-66.7, 47.7]];
const isoNeCenter: Coordinate = [-71.6, 43.6];

const darkRasterStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    cartoDark: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors, CARTO",
    },
  },
  layers: [{ id: "carto-dark", type: "raster", source: "cartoDark", paint: { "raster-opacity": 0.92 } }],
};

const emptyCollection: MapFeatureCollection = { type: "FeatureCollection", features: [] };

function vectorTileUrl(layer: string) {
  return `${API_BASE.replace(/\/$/, "")}/api/tiles/${layer}/{z}/{x}/{y}.mvt`;
}

export function MapLibreStreetMap({
  activeMap,
  substations,
  nodes,
  transmissionLines,
  publicTransmissionLines,
  publicSubstations,
  fccUtilityTowers,
  fccMicrowaveLinks,
  syntheticSubstations,
  transmissionStructures,
  opgwCables,
  opgwRoutes,
  opgwCableSections,
  opgwSpanSegments,
  opgwSplicePoints,
  spliceClosures,
  fiberSplices,
  fiberStrands,
  fiberAssignments,
  syntheticServices,
  distributionPoleDensity,
  distributionPoles,
  distributionPoleFiberRoutes,
  distributionSplicePoints,
  distributionSlackLoops,
  distributionFiberAssignments,
  patchPanels,
  planningRegions,
  layers,
  activeTool,
  command,
  focusRequest,
  continuityHighlight,
  onMapClick,
  onSelect,
  onStatusChange,
}: MapLibreStreetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const loadedRef = useRef(false);
  const lastFeatureClickRef = useRef(0);
  const onMapClickRef = useRef(onMapClick);
  const onSelectRef = useRef(onSelect);
  const activeToolRef = useRef(activeTool);
  const lookupRef = useRef<Record<string, StreetMapSelection>>({});
  const [styleReady, setStyleReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const datasets = useMemo(
    () => buildDatasets(substations, nodes, transmissionLines, publicTransmissionLines, publicSubstations, fccUtilityTowers, fccMicrowaveLinks, syntheticSubstations, transmissionStructures, opgwCables, opgwRoutes, opgwCableSections, opgwSpanSegments, opgwSplicePoints, spliceClosures, fiberSplices, fiberStrands, fiberAssignments, syntheticServices, distributionPoleDensity, distributionPoles, distributionPoleFiberRoutes, distributionSplicePoints, distributionSlackLoops, distributionFiberAssignments, patchPanels, planningRegions, layers, continuityHighlight),
    [substations, nodes, transmissionLines, publicTransmissionLines, publicSubstations, fccUtilityTowers, fccMicrowaveLinks, syntheticSubstations, transmissionStructures, opgwCables, opgwRoutes, opgwCableSections, opgwSpanSegments, opgwSplicePoints, spliceClosures, fiberSplices, fiberStrands, fiberAssignments, syntheticServices, distributionPoleDensity, distributionPoles, distributionPoleFiberRoutes, distributionSplicePoints, distributionSlackLoops, distributionFiberAssignments, patchPanels, planningRegions, layers, continuityHighlight],
  );
  const lookup = useMemo(
    () => buildSelectionLookup(substations, nodes, transmissionLines, publicTransmissionLines, publicSubstations, fccUtilityTowers, fccMicrowaveLinks, syntheticSubstations, transmissionStructures, opgwCables, opgwRoutes, opgwCableSections, opgwSpanSegments, opgwSplicePoints, spliceClosures, fiberAssignments, distributionPoleDensity, distributionPoles, distributionPoleFiberRoutes, distributionSplicePoints, distributionSlackLoops, distributionFiberAssignments, patchPanels, planningRegions),
    [substations, nodes, transmissionLines, publicTransmissionLines, publicSubstations, fccUtilityTowers, fccMicrowaveLinks, syntheticSubstations, transmissionStructures, opgwCables, opgwRoutes, opgwCableSections, opgwSpanSegments, opgwSplicePoints, spliceClosures, fiberAssignments, distributionPoleDensity, distributionPoles, distributionPoleFiberRoutes, distributionSplicePoints, distributionSlackLoops, distributionFiberAssignments, patchPanels, planningRegions],
  );

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onSelectRef.current = onSelect;
    activeToolRef.current = activeTool;
    lookupRef.current = lookup;
  }, [activeTool, lookup, onMapClick, onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    onStatusChange("loading");
    let resizeObserver: ResizeObserver | null = null;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: darkRasterStyle,
        center: isoNeCenter,
        zoom: 6,
        minZoom: 5.4,
        maxZoom: 18,
        maxBounds: [[-75.4, 39.9], [-65.5, 48.6]],
        attributionControl: false,
      });

      mapRef.current = map;
      popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 14 });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      const initializeMap = () => {
        if (loadedRef.current) return;
        if (!mapRef.current) return;
        try {
          addPlanningSourcesAndLayers(map);
        } catch {
          window.setTimeout(initializeMap, 500);
          return;
        }
        clickableLayerIds.forEach((layerId) => {
          map.on("click", layerId, handleFeatureClick);
          map.on("mouseenter", layerId, () => setCursor(map, "pointer"));
          map.on("mouseleave", layerId, () => setCursor(map, activeToolRef.current === "select" ? "" : "crosshair"));
        });
        map.on("mousemove", "synthetic-transmission-structures", handleStructureHover);
        map.on("mouseleave", "synthetic-transmission-structures", () => popupRef.current?.remove());
        loadedRef.current = true;
        setStyleReady(true);
        setErrorMessage("");
        onStatusChange("active");
        map.fitBounds(isoNeBounds, { padding: 28, duration: 0 });
        window.setTimeout(() => map.resize(), 80);
      };

      map.on("style.load", initializeMap);
      map.on("styledata", initializeMap);
      map.on("load", initializeMap);
      window.setTimeout(initializeMap, 1400);

      map.on("error", (event) => {
        if (loadedRef.current) return;
        const message = event.error?.message || "MapLibre failed before the map loaded.";
        setErrorMessage(message);
        onStatusChange("error", message);
      });

      const handleMapClick = (event: MapMouseEvent) => {
        if (Date.now() - lastFeatureClickRef.current < 120) return;
        onMapClickRef.current([Number(event.lngLat.lng.toFixed(6)), Number(event.lngLat.lat.toFixed(6))]);
      };

      map.on("click", handleMapClick);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MapLibre initialization failed.";
      setErrorMessage(message);
      onStatusChange("error", message);
    }

    return () => {
      resizeObserver?.disconnect();
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      popupRef.current = null;
      loadedRef.current = false;
    };
  }, [onStatusChange]);

  useEffect(() => {
    if (!styleReady || !mapRef.current) return;
    updateSource(mapRef.current, sourceIds.regions, datasets.regions);
    updateSource(mapRef.current, sourceIds.reference, datasets.reference);
    updateSource(mapRef.current, sourceIds.lines, datasets.lines);
    updateSource(mapRef.current, sourceIds.publicLines, datasets.publicLines);
    updateSource(mapRef.current, sourceIds.publicSubstations, datasets.publicSubstations);
    updateSource(mapRef.current, sourceIds.fccMicrowaveLinks, datasets.fccMicrowaveLinks);
    updateSource(mapRef.current, sourceIds.fccUtilityTowers, datasets.fccUtilityTowers);
    updateSource(mapRef.current, sourceIds.structures, datasets.structures);
    updateSource(mapRef.current, sourceIds.opgwCables, datasets.opgwCables);
    updateSource(mapRef.current, sourceIds.opgwRoutes, datasets.opgwRoutes);
    updateSource(mapRef.current, sourceIds.opgwCableSections, datasets.opgwCableSections);
    updateSource(mapRef.current, sourceIds.opgwSpanSegments, datasets.opgwSpanSegments);
    updateSource(mapRef.current, sourceIds.opgwSplicePoints, datasets.opgwSplicePoints);
    updateSource(mapRef.current, sourceIds.spliceClosures, datasets.spliceClosures);
    updateSource(mapRef.current, sourceIds.fiberAssignments, datasets.fiberAssignments);
    updateSource(mapRef.current, sourceIds.distributionPoleDensity, datasets.distributionPoleDensity);
    updateSource(mapRef.current, sourceIds.distributionPoleFiberRoutes, datasets.distributionPoleFiberRoutes);
    updateSource(mapRef.current, sourceIds.distributionFiberAssignments, datasets.distributionFiberAssignments);
    updateSource(mapRef.current, sourceIds.distributionSplicePoints, datasets.distributionSplicePoints);
    updateSource(mapRef.current, sourceIds.distributionSlackLoops, datasets.distributionSlackLoops);
    updateSource(mapRef.current, sourceIds.distributionPoles, datasets.distributionPoles);
    updateSource(mapRef.current, sourceIds.patchPanels, datasets.patchPanels);
    updateSource(mapRef.current, sourceIds.substations, datasets.substations);
    updateSource(mapRef.current, sourceIds.syntheticSubstations, datasets.syntheticSubstations);
    updateSource(mapRef.current, sourceIds.nodes, datasets.nodes);
    updateSource(mapRef.current, sourceIds.workOrders, datasets.workOrders);
  }, [datasets, styleReady]);

  useEffect(() => {
    if (!styleReady || !mapRef.current) return;
    syncGisVectorLayerVisibility(mapRef.current, layers);
  }, [layers, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setCursor(map, activeTool === "select" ? "" : "crosshair");
    window.setTimeout(() => map.resize(), 80);
  }, [activeTool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !command) return;
    if (command.type === "zoomIn") map.zoomIn({ duration: 260 });
    if (command.type === "zoomOut") map.zoomOut({ duration: 260 });
    if (command.type === "resetIsoNe") map.fitBounds(isoNeBounds, { padding: 36, duration: 420 });
    if (command.type === "fitActiveMap") fitActiveMap(map, activeMap, substations, nodes, transmissionLines);
    if (command.type === "pan") map.panBy([command.x, command.y], { duration: 260 });
    if (command.type === "resize") map.resize();
  }, [activeMap, command, nodes, substations, transmissionLines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) return;
    const coordinates = selectionCoordinates(focusRequest.selection);
    if (coordinates.length === 1) {
      map.flyTo({ center: coordinates[0], zoom: Math.max(map.getZoom(), 11), duration: 520 });
      return;
    }
    if (coordinates.length > 1) map.fitBounds(boundsFromCoordinates(coordinates), { padding: 62, duration: 520 });
  }, [focusRequest]);

  function handleFeatureClick(event: MapLayerMouseEvent) {
    lastFeatureClickRef.current = Date.now();
    const feature = event.features?.[0];
    if (!feature?.properties || "point_count" in feature.properties) return;
    const layerId = feature.layer?.id || "";
    if (layerId.startsWith("gis-")) {
      void handleGisVectorFeatureClick(event, layerId, feature.properties);
      return;
    }
    const id = String(feature.properties.id || "");
    const kind = String(feature.properties.kind || "");
    const selection = lookupRef.current[`${kind}:${id}`];
    if (!selection) return;
    onSelectRef.current(selection);
    const popupHtml = kind === "opgw_splice_point" || kind === "splice_closure"
      ? renderSplicePopupHtml(feature.properties)
      : renderPopupHtml(feature.properties.label || selection.label, kind, feature.properties.status || "synthetic", feature.properties.warning);
    popupRef.current
      ?.setLngLat(event.lngLat)
      .setHTML(popupHtml)
      .addTo(event.target);
  }

  async function handleGisVectorFeatureClick(event: MapLayerMouseEvent, layerId: string, properties: Record<string, unknown>) {
    const id = String(properties.id || "");
    if (!id) return;
    const assetType = String(properties.asset_type || properties.display_class || layerId.replace("gis-", ""));
    const baseRecord: Record<string, unknown> = {
      ...properties,
      id,
      tileLayer: layerId,
      source: "PostGIS vector tile",
      levelOfDetail: layerId.includes("density") ? "density" : layerId.includes("cluster") ? "cluster" : "detail",
      warning: "Synthetic telecom planning feature loaded from a vector tile. Full details are fetched only after selection.",
    };
    if (layerId === "gis-pole-points") {
      const record = await fetchPoleDetailForSelection(id, baseRecord);
      onSelectRef.current({ kind: "gis_pole", id, label: id, record });
      popupRef.current
        ?.setLngLat(event.lngLat)
        .setHTML(renderPopupHtml(id, "GIS pole", record.asset_status || record.status || "synthetic", record.warning))
        .addTo(event.target);
      return;
    }
    const detailType = gisDetailTypeForLayer(layerId);
    const record = detailType ? await fetchGisAssetDetailForSelection(detailType, id, baseRecord) : baseRecord;
    onSelectRef.current({ kind: "gis_vector_asset", id, label: id, record });
    popupRef.current
      ?.setLngLat(event.lngLat)
      .setHTML(renderPopupHtml(id, assetType, record.asset_status || record.status || "synthetic", record.warning))
      .addTo(event.target);
  }

  function handleStructureHover(event: MapLayerMouseEvent) {
    const feature = event.features?.[0];
    if (!feature?.properties || "point_count" in feature.properties) return;
    popupRef.current
      ?.setLngLat(event.lngLat)
      .setHTML(renderPopupHtml(feature.properties.structureNumber || feature.properties.label, "synthetic structure", feature.properties.structureType || "structure"))
      .addTo(event.target);
  }

  return (
    <div className="maplibre-street-map" data-testid="street-level-map">
      <div className="maplibre-map-root" ref={containerRef} aria-label={`${activeMap.name} MapLibre street-level planning map`} />
      <div className="maplibre-legend" aria-hidden="true">
        <div className="maplibre-legend-title">Active Map Layers</div>
        <div className="maplibre-legend-list">
          {layers.publicTransmissionLines ? <span><i className="legend-line" />HIFLD transmission lines</span> : null}
          {layers.publicSubstations ? <span><i className="legend-substation" />Public substations by owner</span> : null}
          {layers.fccUtilityTowers ? <span><i className="legend-node" />FCC utility towers</span> : null}
          {layers.fccMicrowaveLinks ? <span><i className="legend-line" />FCC microwave links</span> : null}
          {layers.assumedOpgwRoutes || layers.plannedOpgwFiber || layers.verifiedOpgwFiber || layers.opgwCableSections || layers.syntheticOpgwCables ? <span><i className="legend-opgw" />Synthetic OPGW planning</span> : null}
          {layers.opgwSpanSegments ? <span><i className="legend-opgw-span" />OPGW spans</span> : null}
          {layers.opgwSplicePoints ? <span><i className="legend-splice-point" />Splice points</span> : null}
          {layers.existingFiberSplices ? <span><i className="legend-existing-splice" />Existing fiber splices</span> : null}
          {layers.proposedFiberSplices ? <span><i className="legend-proposed-splice" />Proposed fiber splices</span> : null}
          {layers.availableStrandCapacity ? <span><i className="legend-opgw-capacity" />Available strands</span> : null}
          {layers.criticalRidingCircuits ? <span><i className="legend-critical-route" />Critical riding circuits</span> : null}
          {layers.distributionPoleDensity ? <span><i className="legend-node" />Distribution pole density</span> : null}
          {layers.distributionPoles ? <span><i className="legend-node" />Distribution telecom poles</span> : null}
          {layers.distributionFiberRoutes ? <span><i className="legend-line" />Distribution pole fiber</span> : null}
          {layers.distributionSplicePoints ? <span><i className="legend-splice-point" />Distribution splice points</span> : null}
          {layers.distributionSlackLoops ? <span><i className="legend-node" />Distribution slack loops</span> : null}
          {layers.distributionFiberAssignments ? <span><i className="legend-line" />Distribution assignments</span> : null}
          {layers.transmissionStructures || layers.spliceClosures ? <span><i className="legend-structure" />Synthetic structures/splices</span> : null}
          {layers.syntheticSubstations ? <span><i className="legend-substation" />Synthetic substations</span> : null}
          {layers.substations ? <span><i className="legend-substation" />Substations</span> : null}
          {layers.selIconNodes || layers.telecomNodes || layers.circuitEndpoints ? <span><i className="legend-node" />SEL ICON / telecom</span> : null}
          {layers.workOrderLocations ? <span><i className="legend-work-order" />Work orders</span> : null}
        </div>
      </div>
      {errorMessage ? (
        <div className="maplibre-map-error-state">
          <strong>MapLibre failed to load</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </div>
  );
}

function addPlanningSourcesAndLayers(map: MapLibreMap) {
  map.addSource(sourceIds.regions, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.reference, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.lines, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.publicLines, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.fccMicrowaveLinks, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.opgwCables, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.opgwRoutes, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.opgwCableSections, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.opgwSpanSegments, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.fiberAssignments, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.distributionPoleFiberRoutes, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.distributionFiberAssignments, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  [sourceIds.publicSubstations, sourceIds.fccUtilityTowers, sourceIds.substations, sourceIds.syntheticSubstations, sourceIds.structures, sourceIds.opgwSplicePoints, sourceIds.spliceClosures, sourceIds.distributionPoleDensity, sourceIds.distributionPoles, sourceIds.distributionSplicePoints, sourceIds.distributionSlackLoops, sourceIds.patchPanels, sourceIds.nodes, sourceIds.workOrders].forEach((sourceId) => {
    map.addSource(sourceId, {
      type: "geojson",
      data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0],
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 8,
    });
  });
  addGisVectorSourcesAndLayers(map);

  map.addLayer({
    id: "regional-planning-regions-fill",
    type: "fill",
    source: sourceIds.regions,
    paint: { "fill-color": "#efc95f", "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "regional-planning-regions-outline",
    type: "line",
    source: sourceIds.regions,
    paint: { "line-color": "#efc95f", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": 0.82 },
  });
  map.addLayer({
    id: "regional-reference-line",
    type: "line",
    source: sourceIds.reference,
    paint: { "line-color": "#4bd7ff", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.42 },
  });
  map.addLayer({
    id: "regional-transmission-lines-casing",
    type: "line",
    source: sourceIds.lines,
    paint: { "line-color": "#020708", "line-width": 9, "line-opacity": 0.78 },
  });
  map.addLayer({
    id: "public-transmission-lines-casing",
    type: "line",
    source: sourceIds.publicLines,
    paint: { "line-color": "#020708", "line-width": ["match", ["get", "voltageClass"], "735+", 5, "500-734", 4.6, "345-499", 4.2, "230-344", 3.8, "115-229", 3.3, 3], "line-opacity": 0.62 },
  });
  map.addLayer({
    id: "public-transmission-lines",
    type: "line",
    source: sourceIds.publicLines,
    paint: {
      "line-color": "#8f9aa0",
      "line-width": ["match", ["get", "voltageClass"], "735+", 2.6, "500-734", 2.4, "345-499", 2.2, "230-344", 2, "115-229", 1.7, 1.4],
      "line-opacity": ["match", ["get", "voltageClass"], "unknown", 0.46, 0.68],
      "line-dasharray": ["literal", [1, 0]],
    },
  });
  map.addLayer({
    id: "public-transmission-lines-labels",
    type: "symbol",
    source: sourceIds.publicLines,
    minzoom: 9.2,
    layout: { "text-field": ["coalesce", ["get", "name"], ["get", "id"]], "text-size": 10, "symbol-placement": "line", "text-rotation-alignment": "map" },
    paint: { "text-color": "#d7f4ff", "text-halo-color": "#061012", "text-halo-width": 1.4 },
  });
  addClusterLayers(map, sourceIds.publicSubstations, "public-substations", "#7dd3fc", "public substation");
  map.addLayer({
    id: "public-substations",
    type: "circle",
    source: sourceIds.publicSubstations,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.6, 9, 6.2, 12, 8.6],
      "circle-color": publicSubstationOwnerColorExpression() as never,
      "circle-opacity": 0.9,
      "circle-stroke-color": "#f5fdff",
      "circle-stroke-width": 1.2,
    },
  });
  map.addLayer({
    id: "public-substation-labels",
    type: "symbol",
    source: sourceIds.publicSubstations,
    filter: ["!", ["has", "point_count"]],
    minzoom: 9.8,
    layout: { "text-field": ["coalesce", ["get", "label"], ["get", "id"]], "text-size": 10, "text-offset": [0, 1.1], "text-anchor": "top" },
    paint: { "text-color": "#e8fbff", "text-halo-color": "#061012", "text-halo-width": 1.45 },
  });
  map.addLayer({
    id: "fcc-utility-microwave-links-casing",
    type: "line",
    source: sourceIds.fccMicrowaveLinks,
    paint: { "line-color": "#03080a", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4.2, 10, 7], "line-opacity": 0.76 },
  });
  map.addLayer({
    id: "fcc-utility-microwave-links",
    type: "line",
    source: sourceIds.fccMicrowaveLinks,
    paint: {
      "line-color": fccFrequencyBandColorExpression() as never,
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.8, 10, 4.2],
      "line-opacity": 0.82,
      "line-dasharray": ["literal", [1.2, 0.7]],
    },
  });
  map.addLayer({
    id: "fcc-utility-microwave-link-labels",
    type: "symbol",
    source: sourceIds.fccMicrowaveLinks,
    minzoom: 9.4,
    layout: { "text-field": ["concat", ["get", "callSign"], " P", ["to-string", ["get", "pathNumber"]]], "text-size": 9, "symbol-placement": "line", "text-rotation-alignment": "map" },
    paint: { "text-color": "#ffe8bd", "text-halo-color": "#061012", "text-halo-width": 1.3 },
  });
  addClusterLayers(map, sourceIds.fccUtilityTowers, "fcc-utility-towers", "#f5a524", "FCC");
  map.addLayer({
    id: "fcc-utility-towers",
    type: "circle",
    source: sourceIds.fccUtilityTowers,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.2, 10, 7.8, 13, 10],
      "circle-color": fccOwnerColorExpression() as never,
      "circle-opacity": 0.92,
      "circle-stroke-color": "#fff4d6",
      "circle-stroke-width": 1.3,
    },
  });
  map.addLayer({
    id: "fcc-utility-tower-labels",
    type: "symbol",
    source: sourceIds.fccUtilityTowers,
    filter: ["!", ["has", "point_count"]],
    minzoom: 10,
    layout: { "text-field": ["get", "callSign"], "text-size": 10, "text-offset": [0, 1.1], "text-anchor": "top" },
    paint: { "text-color": "#fff4d6", "text-halo-color": "#061012", "text-halo-width": 1.45 },
  });
  map.addLayer({
    id: "synthetic-opgw-routes",
    type: "line",
    source: sourceIds.opgwRoutes,
    paint: {
      "line-color": opgwStatusColorExpression() as never,
      "line-width": ["+", opgwFiberCountWidthExpression() as never, 1],
      "line-opacity": 0.44,
      "line-dasharray": opgwStatusDashExpression() as never,
    },
  });
  map.addLayer({
    id: "synthetic-opgw-cable-sections-casing",
    type: "line",
    source: sourceIds.opgwCableSections,
    paint: {
      "line-color": ["case", ["get", "isContinuityHighlight"], "#e9feff", "#041012"],
      "line-width": ["case", ["get", "isContinuityHighlight"], ["+", opgwFiberCountWidthExpression() as never, 6], ["+", opgwFiberCountWidthExpression() as never, 3.2]],
      "line-opacity": ["case", ["get", "isContinuityHighlight"], 0.96, 0.7],
    },
  });
  map.addLayer({
    id: "synthetic-opgw-cable-sections",
    type: "line",
    source: sourceIds.opgwCableSections,
    paint: {
      "line-color": ["case", ["get", "isContinuityHighlight"], "#28f3ff", opgwCableSectionColorExpression() as never],
      "line-width": ["case", ["get", "isContinuityHighlight"], ["+", opgwFiberCountWidthExpression() as never, 3.2], opgwFiberCountWidthExpression() as never],
      "line-opacity": ["case", ["get", "isContinuityHighlight"], 1, 0.95],
      "line-dasharray": opgwCableSectionDashExpression() as never,
    },
  });
  map.addLayer({
    id: "synthetic-opgw-span-segments",
    type: "line",
    source: sourceIds.opgwSpanSegments,
    paint: {
      "line-color": opgwSpanStatusColorExpression() as never,
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.4, 10, 3.5, 13, 5.2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.18, 9, 0.72, 13, 0.96],
      "line-dasharray": ["literal", [1.1, 0.45]],
    },
  });
  addClusterLayers(map, sourceIds.opgwSplicePoints, "synthetic-opgw-splice-points", "#7c7cff", "splice point");
  map.addLayer({
    id: "synthetic-opgw-splice-points",
    type: "circle",
    source: sourceIds.opgwSplicePoints,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["case", ["get", "isContinuityHighlight"], 10.8, ["match", ["get", "spliceType"], "substation_deadend", 7.6, "tap", 6.8, 5.8]],
      "circle-color": ["case", ["get", "isContinuityHighlight"], "#28f3ff", ["match", ["get", "spliceType"], "substation_deadend", "#2f8cff", "tap", "#f5a524", "#9b7cff"]],
      "circle-stroke-color": ["case", ["get", "isContinuityHighlight"], "#ffffff", "#f7f3ff"],
      "circle-stroke-width": ["case", ["get", "isContinuityHighlight"], 3, 1.4],
    },
  });
  map.addLayer({
    id: "synthetic-opgw-splice-points-hit",
    type: "circle",
    source: sourceIds.opgwSplicePoints,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 14, 10, 18, 13, 22],
      "circle-color": "rgba(255, 255, 255, 0.01)",
      "circle-stroke-opacity": 0,
    },
  });
  map.addLayer({
    id: "synthetic-opgw-splice-point-labels",
    type: "symbol",
    source: sourceIds.opgwSplicePoints,
    filter: ["!", ["has", "point_count"]],
    minzoom: 10.8,
    layout: { "text-field": ["get", "structureNumber"], "text-size": 9, "text-offset": [0, 1.05], "text-anchor": "top" },
    paint: { "text-color": "#f2efff", "text-halo-color": "#061012", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "synthetic-opgw-cables-casing",
    type: "line",
    source: sourceIds.opgwCables,
    paint: {
      "line-color": ["case", ["get", "isContinuityHighlight"], "#e9feff", "#031012"],
      "line-width": ["case", ["get", "isContinuityHighlight"], 11.2, 7.2],
      "line-opacity": ["case", ["get", "isContinuityHighlight"], 0.92, 0.72],
    },
  });
  map.addLayer({
    id: "synthetic-opgw-cables",
    type: "line",
    source: sourceIds.opgwCables,
    paint: {
      "line-color": ["case", ["get", "isContinuityHighlight"], "#28f3ff", opgwStatusColorExpression() as never],
      "line-width": ["case", ["get", "isContinuityHighlight"], ["+", opgwFiberCountWidthExpression() as never, 3.2], opgwFiberCountWidthExpression() as never],
      "line-opacity": ["case", ["get", "isContinuityHighlight"], 1, 0.88],
      "line-dasharray": opgwStatusDashExpression() as never,
    },
  });
  map.addLayer({
    id: "synthetic-opgw-capacity",
    type: "line",
    source: sourceIds.opgwCables,
    filter: ["==", ["get", "showCapacity"], true],
    paint: {
      "line-color": [
        "case",
        ["<=", ["to-number", ["get", "availableStrands"]], 2], "#ff6b6b",
        ["<=", ["to-number", ["get", "availableStrands"]], 12], "#efc95f",
        "#6ee7b7",
      ],
      "line-width": ["+", opgwFiberCountWidthExpression() as never, 2],
      "line-opacity": 0.58,
    },
  });
  map.addLayer({
    id: "synthetic-opgw-outage-impact",
    type: "line",
    source: sourceIds.opgwCables,
    filter: ["==", ["get", "showOutageImpact"], true],
    paint: {
      "line-color": "#ff5b5b",
      "line-width": ["+", opgwFiberCountWidthExpression() as never, 3.4],
      "line-opacity": 0.7,
      "line-dasharray": ["literal", [1, 0.8]],
    },
  });
  map.addLayer({
    id: "synthetic-fiber-assignments",
    type: "line",
    source: sourceIds.fiberAssignments,
    paint: {
      "line-color": ["case", ["get", "isContinuityHighlight"], "#ffffff", ["get", "isCritical"], "#ff5b5b", ["match", ["get", "status"], "active", "#6effff", "reserved", "#efc95f", "planned", "#ffd85f", "proposed", "#ff4fd8", "#9bd6ff"]],
      "line-width": ["case", ["get", "isContinuityHighlight"], ["interpolate", ["linear"], ["zoom"], 5, 7.5, 10, 12], ["get", "isCritical"], ["interpolate", ["linear"], ["zoom"], 5, 5.5, 10, 9.5], ["interpolate", ["linear"], ["zoom"], 5, 3.4, 10, 7]],
      "line-opacity": ["case", ["get", "isContinuityHighlight"], 0.96, ["get", "isCritical"], 0.86, ["match", ["get", "status"], "reserved", 0.82, 0.68]],
      "line-dasharray": ["case", ["get", "isCritical"], ["literal", [1.4, 0.8]], ["literal", [1, 0]]],
    },
  });
  addClusterLayers(map, sourceIds.distributionPoleDensity, "synthetic-distribution-pole-density", "#7dd3fc", "density cells");
  map.addLayer({
    id: "synthetic-distribution-pole-density",
    type: "circle",
    source: sourceIds.distributionPoleDensity,
    filter: ["!", ["has", "point_count"]],
    maxzoom: 10.8,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["to-number", ["get", "representedPoleCount"]], 1, 8, 8000, 14, 25000, 22],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "needs_field_verification", "#ff9f43", "#44d7ff"],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.38, 9, 0.72, 10.8, 0.2],
      "circle-stroke-color": "#dff9ff",
      "circle-stroke-width": 1.1,
    },
  });
  map.addLayer({
    id: "synthetic-distribution-pole-density-labels",
    type: "symbol",
    source: sourceIds.distributionPoleDensity,
    filter: ["!", ["has", "point_count"]],
    maxzoom: 10.2,
    layout: { "text-field": ["concat", ["to-string", ["get", "representedPoleCount"]], " poles"], "text-size": 10, "text-offset": [0, 1.45], "text-anchor": "top" },
    paint: { "text-color": "#e8fbff", "text-halo-color": "#061012", "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "synthetic-distribution-pole-fiber-routes",
    type: "line",
    source: sourceIds.distributionPoleFiberRoutes,
    paint: {
      "line-color": ["match", ["get", "continuityStatus"], "broken_demo", "#ff4d4f", "proposed", "#ff4fd8", "planned", "#efc95f", "#52f2c8"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.1, 10, 3.2, 14, 5.8],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.24, 10, 0.66, 14, 0.9],
      "line-dasharray": ["case", ["==", ["get", "status"], "in_service_synthetic"], ["literal", [1, 0]], ["literal", [1.4, 0.85]]],
    },
  });
  map.addLayer({
    id: "synthetic-distribution-fiber-assignments",
    type: "line",
    source: sourceIds.distributionFiberAssignments,
    paint: {
      "line-color": ["match", ["get", "criticality"], "critical", "#ff5b5b", "high", "#ffb84d", "low", "#8ab4f8", "#a8fff2"],
      "line-width": ["case", ["==", ["get", "criticality"], "critical"], ["interpolate", ["linear"], ["zoom"], 6, 2.2, 12, 6.8], ["interpolate", ["linear"], ["zoom"], 6, 1.4, 12, 4.8]],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.28, 10, 0.68, 13, 0.92],
      "line-dasharray": ["case", ["==", ["get", "status"], "active_synthetic"], ["literal", [1, 0]], ["literal", [1.1, 0.75]]],
    },
  });
  addClusterLayers(map, sourceIds.distributionPoles, "synthetic-distribution-poles", "#52f2c8", "poles");
  map.addLayer({
    id: "synthetic-distribution-poles",
    type: "circle",
    source: sourceIds.distributionPoles,
    filter: ["!", ["has", "point_count"]],
    minzoom: 10.2,
    paint: {
      "circle-radius": ["match", ["get", "telecomRole"], "splice_pole", 5.8, "riser", 5.4, "wireless_backhaul", 5.2, 3.8],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "needs_field_verification", "#ff9f43", "#52f2c8"],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.54, 13, 0.92],
      "circle-stroke-color": "#061012",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "synthetic-distribution-pole-labels",
    type: "symbol",
    source: sourceIds.distributionPoles,
    filter: ["!", ["has", "point_count"]],
    minzoom: 14.6,
    layout: { "text-field": ["get", "poleNumber"], "text-size": 9, "text-offset": [0, 1.05], "text-anchor": "top" },
    paint: { "text-color": "#dffdf8", "text-halo-color": "#061012", "text-halo-width": 1.3 },
  });
  addClusterLayers(map, sourceIds.distributionSplicePoints, "synthetic-distribution-splice-points", "#ffb84d", "distribution splices");
  map.addLayer({
    id: "synthetic-distribution-splice-points",
    type: "circle",
    source: sourceIds.distributionSplicePoints,
    filter: ["!", ["has", "point_count"]],
    minzoom: 9.2,
    paint: {
      "circle-radius": ["match", ["get", "spliceType"], "riser_terminal", 6.8, "branch_splice", 6.2, "tap_splice", 5.8, 4.8],
      "circle-color": ["match", ["get", "spliceType"], "riser_terminal", "#efc95f", "branch_splice", "#ff8a3d", "tap_splice", "#ff4fd8", "#ffb84d"],
      "circle-opacity": 0.92,
      "circle-stroke-color": "#fff7d8",
      "circle-stroke-width": 1.3,
    },
  });
  addClusterLayers(map, sourceIds.distributionSlackLoops, "synthetic-distribution-slack-loops", "#b390ff", "slack");
  map.addLayer({
    id: "synthetic-distribution-slack-loops",
    type: "circle",
    source: sourceIds.distributionSlackLoops,
    filter: ["!", ["has", "point_count"]],
    minzoom: 9.8,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["to-number", ["get", "slackFeet"]], 50, 3.8, 350, 7.2, 700, 9.5],
      "circle-color": ["match", ["get", "slackType"], "splice_slack", "#b390ff", "riser_storage", "#7dd3fc", "snowshoe_loop", "#efc95f", "#c4b5fd"],
      "circle-opacity": 0.88,
      "circle-stroke-color": "#f3e8ff",
      "circle-stroke-width": 1.1,
    },
  });
  map.addLayer({
    id: "regional-transmission-lines",
    type: "line",
    source: sourceIds.lines,
    paint: {
      "line-color": voltageColorExpression() as never,
      "line-width": ["match", ["get", "voltageKv"], 345, 6, 230, 5, 115, 4, 3],
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "regional-transmission-lines-dashed",
    type: "line",
    source: sourceIds.lines,
    filter: ["==", ["get", "isDashed"], true],
    paint: { "line-color": "#64d88a", "line-width": 4.5, "line-opacity": 0.92, "line-dasharray": [1.4, 1.2] },
  });

  addClusterLayers(map, sourceIds.substations, "regional-substations", "#69d7e4", "substation");
  addClusterLayers(map, sourceIds.syntheticSubstations, "synthetic-substations", "#ffb84d", "synthetic");
  addClusterLayers(map, sourceIds.structures, "synthetic-transmission-structures", "#c9d4d8", "structure");
  addClusterLayers(map, sourceIds.spliceClosures, "synthetic-splice-closures", "#ffb84d", "splice");
  addClusterLayers(map, sourceIds.patchPanels, "synthetic-patch-panels", "#d5f3ff", "panel");
  addClusterLayers(map, sourceIds.nodes, "regional-map-nodes", "#28c7a9", "node");
  addClusterLayers(map, sourceIds.workOrders, "regional-work-orders", "#efc95f", "work_order");

  map.addLayer({
    id: "regional-substations",
    type: "circle",
    source: sourceIds.substations,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 8.5],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#21a67a", "out_of_service", "#ff6b6b", "#69d7e4"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.4,
      "circle-blur": 0.05,
    },
  });
  map.addLayer({
    id: "regional-substation-labels",
    type: "symbol",
    source: sourceIds.substations,
    filter: ["!", ["has", "point_count"]],
    minzoom: 8.4,
    layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" },
    paint: { "text-color": "#f4fbfa", "text-halo-color": "#071012", "text-halo-width": 1.6 },
  });
  map.addLayer({
    id: "synthetic-substations-halo",
    type: "circle",
    source: sourceIds.syntheticSubstations,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["match", ["get", "criticality"], "critical", 18, "high", 15, "medium", 12, 10],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "#41d6c6"],
      "circle-opacity": 0.16,
      "circle-blur": 0.55,
    },
  });
  map.addLayer({
    id: "synthetic-substations-points",
    type: "circle",
    source: sourceIds.syntheticSubstations,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["match", ["get", "criticality"], "critical", 8.5, "high", 7.5, "medium", 6.5, 5.5],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "#41d6c6"],
      "circle-stroke-color": "#fff7d8",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "synthetic-substations-labels",
    type: "symbol",
    source: sourceIds.syntheticSubstations,
    filter: ["!", ["has", "point_count"]],
    minzoom: 8.8,
    layout: { "text-field": ["concat", "Synthetic ", ["get", "state"], " / ", ["get", "planningRole"]], "text-size": 10, "text-offset": [0, 1.15], "text-anchor": "top" },
    paint: { "text-color": "#fff7d8", "text-halo-color": "#071012", "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "synthetic-transmission-structures",
    type: "circle",
    source: sourceIds.structures,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["case", ["get", "hasSplice"], 5.8, ["get", "hasOpgw"], 4.4, 2.8],
      "circle-color": ["case", ["get", "hasSplice"], "#ffb84d", ["get", "hasOpgw"], "#39e7d2", "#d5dde2"],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.46, 9, 0.86],
      "circle-stroke-color": "#061012",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "synthetic-transmission-structure-labels",
    type: "symbol",
    source: sourceIds.structures,
    filter: ["!", ["has", "point_count"]],
    minzoom: 11.2,
    layout: { "text-field": ["get", "structureNumber"], "text-size": 9, "text-offset": [0, 1], "text-anchor": "top" },
    paint: { "text-color": "#efffff", "text-halo-color": "#061012", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "synthetic-splice-closures",
    type: "circle",
    source: sourceIds.spliceClosures,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["case", ["get", "isContinuityHighlight"], 11.2, ["interpolate", ["linear"], ["zoom"], 5, 5.5, 10, 8.5]],
      "circle-color": ["case", ["get", "isContinuityHighlight"], "#28f3ff", ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "#ffb84d"]],
      "circle-stroke-color": ["case", ["get", "isContinuityHighlight"], "#ffffff", "#fff6d4"],
      "circle-stroke-width": ["case", ["get", "isContinuityHighlight"], 3, 1.4],
    },
  });
  map.addLayer({
    id: "synthetic-splice-closures-hit",
    type: "circle",
    source: sourceIds.spliceClosures,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 15, 10, 20, 13, 24],
      "circle-color": "rgba(255, 255, 255, 0.01)",
      "circle-stroke-opacity": 0,
    },
  });
  map.addLayer({
    id: "synthetic-patch-panels",
    type: "circle",
    source: sourceIds.patchPanels,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 4.8,
      "circle-color": "#d5f3ff",
      "circle-stroke-color": "#12343a",
      "circle-stroke-width": 1.2,
      "circle-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "regional-map-nodes",
    type: "circle",
    source: sourceIds.nodes,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, ["match", ["get", "nodeType"], "sel_icon_node", 8, "fiber_node", 6.5, "circuit_endpoint", 6.5, 6]],
      "circle-color": ["match", ["get", "nodeType"], "sel_icon_node", "#69d7e4", "fiber_node", "#28c7a9", "circuit_endpoint", "#b390ff", "proposed_node", "#ff4fd8", "#7dd3fc"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.4,
    },
  });
  map.addLayer({
    id: "regional-node-labels",
    type: "symbol",
    source: sourceIds.nodes,
    filter: ["!", ["has", "point_count"]],
    minzoom: 9.2,
    layout: { "text-field": ["get", "label"], "text-size": 10, "text-offset": [0.9, 0.25], "text-anchor": "left" },
    paint: { "text-color": "#f4fbfa", "text-halo-color": "#071012", "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "regional-work-orders",
    type: "circle",
    source: sourceIds.workOrders,
    filter: ["!", ["has", "point_count"]],
    paint: { "circle-radius": 6.5, "circle-color": "#efc95f", "circle-stroke-color": "#1b1305", "circle-stroke-width": 1.5 },
  });
}

function addGisVectorSourcesAndLayers(map: MapLibreMap) {
  map.addSource(gisVectorSourceIds.territory, { type: "vector", tiles: [vectorTileUrl("territory")], minzoom: 0, maxzoom: 24 });
  map.addSource(gisVectorSourceIds.poles, { type: "vector", tiles: [vectorTileUrl("poles")], minzoom: 8, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.spans, { type: "vector", tiles: [vectorTileUrl("spans")], minzoom: 10, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.fiberRoutes, { type: "vector", tiles: [vectorTileUrl("fiber_routes")], minzoom: 8, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.spliceCases, { type: "vector", tiles: [vectorTileUrl("splice_cases")], minzoom: 16, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.handholes, { type: "vector", tiles: [vectorTileUrl("handholes")], minzoom: 16, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.slackLoops, { type: "vector", tiles: [vectorTileUrl("slack_loops")], minzoom: 16, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.muxSites, { type: "vector", tiles: [vectorTileUrl("mux_sites")], minzoom: 14, maxzoom: 24, promoteId: "id" });
  map.addSource(gisVectorSourceIds.circuitRoutes, { type: "vector", tiles: [vectorTileUrl("circuit_routes")], minzoom: 10, maxzoom: 24, promoteId: "id" });

  map.addLayer({
    id: "gis-territory-boundary",
    type: "line",
    source: gisVectorSourceIds.territory,
    "source-layer": "territory",
    paint: { "line-color": "#f6e27f", "line-width": 2.4, "line-dasharray": [3, 1.5], "line-opacity": 0.86 },
  });
  map.addLayer({
    id: "gis-pole-density",
    type: "circle",
    source: gisVectorSourceIds.poles,
    "source-layer": "poles",
    minzoom: 8,
    maxzoom: 11,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["to-number", ["get", "feature_count"]], 1, 6, 500, 11, 5000, 22],
      "circle-color": "#38bdf8",
      "circle-opacity": 0.54,
      "circle-stroke-color": "#dff9ff",
      "circle-stroke-width": 0.9,
    },
  });
  map.addLayer({
    id: "gis-pole-clusters",
    type: "circle",
    source: gisVectorSourceIds.poles,
    "source-layer": "poles",
    minzoom: 11,
    maxzoom: 16,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["to-number", ["get", "feature_count"]], 1, 6, 80, 13, 600, 24],
      "circle-color": "#52f2c8",
      "circle-opacity": 0.66,
      "circle-stroke-color": "#eafffb",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "gis-pole-points",
    type: "circle",
    source: gisVectorSourceIds.poles,
    "source-layer": "poles",
    minzoom: 16,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 3.1, 20, 6.5],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "faulted", "#ff5b5b", "#52f2c8"],
      "circle-opacity": 0.92,
      "circle-stroke-color": "#061012",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "gis-span-lines",
    type: "line",
    source: gisVectorSourceIds.spans,
    "source-layer": "spans",
    minzoom: 11,
    paint: {
      "line-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "faulted", "#ff5b5b", "#a8fff2"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2.1, 20, 4.2],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.24, 16, 0.78],
    },
  });
  map.addLayer({
    id: "gis-fiber-routes",
    type: "line",
    source: gisVectorSourceIds.fiberRoutes,
    "source-layer": "fiber_routes",
    minzoom: 8,
    paint: {
      "line-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "active_synthetic", "#52f2c8", "#38bdf8"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.4, 13, 3.4, 17, 5.8],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.34, 14, 0.86],
      "line-dasharray": ["case", ["==", ["get", "status"], "active_synthetic"], ["literal", [1, 0]], ["literal", [1.4, 0.75]]],
    },
  });
  map.addLayer({
    id: "gis-splice-cases",
    type: "circle",
    source: gisVectorSourceIds.spliceCases,
    "source-layer": "splice_cases",
    minzoom: 16,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 5.2, 20, 9.2],
      "circle-color": "#ffb84d",
      "circle-opacity": 0.92,
      "circle-stroke-color": "#fff6d4",
      "circle-stroke-width": 1.2,
    },
  });
  map.addLayer({
    id: "gis-handholes",
    type: "circle",
    source: gisVectorSourceIds.handholes,
    "source-layer": "handholes",
    minzoom: 16,
    paint: { "circle-radius": 4.8, "circle-color": "#a8fff2", "circle-opacity": 0.86, "circle-stroke-color": "#061012", "circle-stroke-width": 1 },
  });
  map.addLayer({
    id: "gis-slack-loops",
    type: "circle",
    source: gisVectorSourceIds.slackLoops,
    "source-layer": "slack_loops",
    minzoom: 16,
    paint: { "circle-radius": 5.4, "circle-color": "#b390ff", "circle-opacity": 0.88, "circle-stroke-color": "#f3e8ff", "circle-stroke-width": 1 },
  });
  map.addLayer({
    id: "gis-mux-sites",
    type: "circle",
    source: gisVectorSourceIds.muxSites,
    "source-layer": "mux_sites",
    minzoom: 14,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 5.6, 18, 9.8], "circle-color": "#69d7e4", "circle-opacity": 0.9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2 },
  });
  map.addLayer({
    id: "gis-circuit-routes",
    type: "line",
    source: gisVectorSourceIds.circuitRoutes,
    "source-layer": "circuit_routes",
    minzoom: 10,
    paint: {
      "line-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "#ff5b5b"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 16, 4.8],
      "line-opacity": 0.72,
      "line-dasharray": ["literal", [1.1, 0.65]],
    },
  });
}

function addClusterLayers(map: MapLibreMap, sourceId: string, layerPrefix: string, color: string, label: string) {
  map.addLayer({
    id: `${layerPrefix}-clusters`,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": color,
      "circle-radius": ["step", ["get", "point_count"], 14, 4, 18, 10, 24],
      "circle-opacity": 0.85,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.2,
    },
  });
  map.addLayer({
    id: `${layerPrefix}-cluster-count`,
    type: "symbol",
    source: sourceId,
    filter: ["has", "point_count"],
    layout: { "text-field": ["concat", ["get", "point_count_abbreviated"], ` ${label}`], "text-size": 10 },
    paint: { "text-color": "#071012", "text-halo-color": "rgba(255,255,255,.72)", "text-halo-width": 1 },
  });
}

function voltageColorExpression() {
  return [
    "case",
    ["==", ["get", "status"], "out_of_service"], "#ff6b6b",
    ["==", ["get", "status"], "proposed"], "#ff4fd8",
    [">=", ["to-number", ["get", "voltageKv"]], 345], "#1edcff",
    [">=", ["to-number", ["get", "voltageKv"]], 230], "#3fa7ff",
    [">=", ["to-number", ["get", "voltageKv"]], 115], "#b390ff",
    "#707985",
  ];
}

function voltageClassColorExpression() {
  return [
    "match",
    ["get", "voltageClass"],
    "735+", "#f4ffff",
    "500-734", "#34f5ff",
    "345-499", "#19d2ff",
    "230-344", "#4f93ff",
    "115-229", "#b390ff",
    "69-114", "#78aaa5",
    "below-69", "#6f7d83",
    "#8c959b",
  ];
}

function voltageClassWidthExpression() {
  return [
    "match",
    ["get", "voltageClass"],
    "735+", 6.8,
    "500-734", 6,
    "345-499", 5.2,
    "230-344", 4.5,
    "115-229", 3.7,
    "69-114", 3.1,
    "below-69", 2.4,
    2.2,
  ];
}

function opgwStatusColorExpression() {
  return [
    "match",
    ["get", "opgwStatus"],
    "synthetic_assumption", "#7c7cff",
    "engineer_reviewed", "#9b7cff",
    "proposed", "#f5a524",
    "planned", "#2f8cff",
    "design", "#f5a524",
    "work_order_issued", "#38bdf8",
    "in_service_synthetic", "#28e6c0",
    "as_built_verified", "#28c76f",
    "retired", "#ff4d4f",
    "#8fd8ff",
  ];
}

function opgwStatusDashExpression() {
  return [
    "match",
    ["get", "opgwStatus"],
    "synthetic_assumption", ["literal", [1.6, 1.2]],
    "engineer_reviewed", ["literal", [2.4, 1.2]],
    "proposed", ["literal", [1.1, 0.95]],
    "design", ["literal", [1.1, 0.95]],
    "retired", ["literal", [1, 0.9]],
    ["literal", [1, 0]],
  ];
}

function opgwFiberCountWidthExpression() {
  return [
    "interpolate",
    ["linear"],
    ["to-number", ["get", "fiberCount"]],
    24, 2.2,
    48, 2.9,
    72, 3.6,
    96, 4.4,
    144, 5.5,
  ];
}

function opgwCableSectionColorExpression() {
  return [
    "match",
    ["get", "installStatus"],
    "assumed", "#7c7cff",
    "proposed", "#f5a524",
    "planned", "#2f8cff",
    "installed_synthetic", "#28e6c0",
    "verified", "#28c76f",
    "faulted", "#ff4d4f",
    "retired", "#8f9aa0",
    "superseded", "#8f9aa0",
    "#8fd8ff",
  ];
}

function opgwCableSectionDashExpression() {
  return [
    "match",
    ["get", "installStatus"],
    "assumed", ["literal", [1.6, 1.2]],
    "proposed", ["literal", [1.1, 0.95]],
    "faulted", ["literal", [1, 0.85]],
    "retired", ["literal", [2, 1.3]],
    "superseded", ["literal", [2, 1.3]],
    ["literal", [1, 0]],
  ];
}

function opgwSpanStatusColorExpression() {
  return [
    "match",
    ["get", "spanStatus"],
    "normal", "#bff7ff",
    "inspection_due", "#f5a524",
    "issue_found", "#ff7b43",
    "work_order_open", "#efc95f",
    "faulted", "#ff4d4f",
    "resolved", "#6ee7b7",
    "retired", "#8f9aa0",
    "#bff7ff",
  ];
}

function publicSubstationOwnerColorExpression() {
  return [
    "match",
    ["get", "utilityOwner"],
    "PUBLIC SERVICE CO OF NH", "#69d7e4",
    "Eversource", "#69d7e4",
    "CENTRAL MAINE POWER CO", "#41d6c6",
    "Central Maine Power Company", "#41d6c6",
    "VERMONT ELECTRIC POWER CO", "#b390ff",
    "Vermont Electric Power Company", "#b390ff",
    "Green Mountain Power", "#8ee68e",
    "CONNECTICUT LIGHT & POWER CO", "#efc95f",
    "National Grid", "#4f93ff",
    "Rhode Island Energy", "#ffb84d",
    "United Illuminating Company", "#ff8ecf",
    "Unitil", "#f6d365",
    "Versant Power", "#36d0a8",
    "WESTERN MASSACHUSETTS ELEC CO", "#a7f3d0",
    "NSTAR ELECTRIC COMPANY", "#ff8ecf",
    "CITIZENS UTILITIES CO", "#ffb84d",
    "Unknown public owner", "#d5dde2",
    "#8bd7ff",
  ];
}

function fccOwnerColorExpression() {
  return [
    "match",
    ["get", "utilityOwner"],
    "Eversource Energy", "#ff8ecf",
    "National Grid", "#4f93ff",
    "Central Maine Power", "#41d6c6",
    "Versant Power", "#36d0a8",
    "Vermont Electric Power Company", "#b390ff",
    "Green Mountain Power", "#8ee68e",
    "New York Power Authority", "#7dd3fc",
    "New York State Electric & Gas", "#efc95f",
    "Consolidated Edison", "#f5a524",
    "Unitil", "#f6d365",
    "Municipal utility", "#d5dde2",
    "#f5a524",
  ];
}

function fccFrequencyBandColorExpression() {
  return [
    "match",
    ["get", "frequencyBand"],
    "below 2 GHz", "#d5dde2",
    "2 GHz", "#7dd3fc",
    "6-10 GHz", "#41d6c6",
    "11-15 GHz", "#efc95f",
    "18 GHz", "#ff8ecf",
    "23 GHz+", "#b390ff",
    "#f5a524",
  ];
}

function fccFrequencyBandLabel(frequencyMhz?: number | null) {
  if (!frequencyMhz) return "unknown";
  if (frequencyMhz >= 21000) return "23 GHz+";
  if (frequencyMhz >= 17000) return "18 GHz";
  if (frequencyMhz >= 10000) return "11-15 GHz";
  if (frequencyMhz >= 5800) return "6-10 GHz";
  if (frequencyMhz >= 1900) return "2 GHz";
  return "below 2 GHz";
}

type OpgwPlanningStatus =
  | "public_reference_line"
  | "synthetic_assumption"
  | "engineer_reviewed"
  | "proposed"
  | "planned"
  | "design"
  | "work_order_issued"
  | "in_service_synthetic"
  | "as_built_verified"
  | "retired"
  | "faulted"
  | "abandoned"
  | "superseded";

type CableStrandStats = {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
  dark: number;
  spare: number;
  faulted: number;
};

type CableAssignmentStats = {
  assignments: number;
  criticalCircuits: number;
  openWorkOrders: number;
};

type ContinuityHighlightSets = {
  routeIds: Set<string>;
  cableIds: Set<string>;
  sectionIds: Set<string>;
  splicePointIds: Set<string>;
  assignmentIds: Set<string>;
};

function opgwPlanningStatus(feature: OpgwCableFeature): OpgwPlanningStatus {
  if (feature.properties.status === "planned") return "planned";
  if (feature.properties.status === "proposed") return "design";
  return "synthetic_assumption";
}

function isAssumedOpgwStatus(status: OpgwPlanningStatus) {
  return status === "synthetic_assumption" || status === "engineer_reviewed";
}

function isPlannedOpgwStatus(status: OpgwPlanningStatus) {
  return status === "proposed" || status === "planned" || status === "design" || status === "work_order_issued" || status === "in_service_synthetic";
}

function isVerifiedOpgwStatus(status: OpgwPlanningStatus) {
  return status === "as_built_verified";
}

function opgwConfidenceLevel(feature: OpgwCableFeature) {
  if (feature.properties.status === "planned") return "high";
  if (feature.properties.status === "proposed") return "medium";
  const score = deterministicScore(feature.properties.id);
  if (score > 0.76) return "medium";
  return "low";
}

function deterministicScore(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildCableStrandStats(cables: OpgwCableFeature[], strands: FiberStrand[]) {
  const stats = new Map<string, CableStrandStats>();
  cables.forEach((feature) => {
    stats.set(feature.properties.id, fallbackStrandStats(feature.properties.fiberCount));
  });
  if (!strands.length) return stats;
  stats.clear();
  strands.forEach((strand) => {
    const current = stats.get(strand.cableId) || fallbackStrandStats(0);
    current.total += 1;
    if (strand.status === "available") current.available += 1;
    if (strand.status === "assigned") current.assigned += 1;
    if (strand.status === "reserved") current.reserved += 1;
    if (strand.status === "dark") current.dark += 1;
    if (strand.status === "spare") current.spare += 1;
    if (strand.status === "faulted" || strand.status === "retired") current.faulted += 1;
    stats.set(strand.cableId, current);
  });
  cables.forEach((feature) => {
    if (!stats.has(feature.properties.id)) stats.set(feature.properties.id, fallbackStrandStats(feature.properties.fiberCount));
  });
  return stats;
}

function fallbackStrandStats(fiberCount: number): CableStrandStats {
  return { total: fiberCount, available: fiberCount, assigned: 0, reserved: 0, dark: 0, spare: 0, faulted: 0 };
}

function buildCableAssignmentStats(assignments: FiberAssignment[]) {
  const stats = new Map<string, CableAssignmentStats>();
  assignments.forEach((assignment) => {
    const cableIds = new Set(assignment.cableIds);
    cableIds.forEach((cableId) => {
      const current = stats.get(cableId) || emptyAssignmentStats();
      current.assignments += 1;
      if (isCriticalFiberAssignment(assignment)) current.criticalCircuits += 1;
      if (assignment.status === "planned" || assignment.status === "proposed" || assignment.status === "reserved") current.openWorkOrders += 1;
      stats.set(cableId, current);
    });
  });
  return stats;
}

function emptyAssignmentStats(): CableAssignmentStats {
  return { assignments: 0, criticalCircuits: 0, openWorkOrders: 0 };
}

function buildCableSpliceClosureCounts(closures: SpliceClosureFeature[]) {
  const counts = new Map<string, number>();
  closures.forEach((closure) => {
    closure.properties.cableIds.forEach((cableId) => counts.set(cableId, (counts.get(cableId) || 0) + 1));
  });
  return counts;
}

function buildCablePatchPanelCounts(panels: PatchPanel[]) {
  const counts = new Map<string, number>();
  panels.forEach((panel) => {
    panel.fiberCableIds.forEach((cableId) => counts.set(cableId, (counts.get(cableId) || 0) + 1));
  });
  return counts;
}

function isCriticalFiberAssignment(assignment: FiberAssignment) {
  return assignment.serviceType === "SEL_ICON"
    || assignment.serviceType === "C37_94"
    || assignment.serviceType === "Protection"
    || assignment.serviceType === "DTT"
    || assignment.serviceType === "SCADA";
}

function buildContinuityHighlightSets(
  continuityHighlight: ContinuityHighlight | undefined,
  opgwCables: OpgwCableFeature[],
  opgwCableSections: OpgwCableSectionFeature[],
) {
  const routeIds = new Set(continuityHighlight?.routeIds || []);
  const cableIds = new Set(continuityHighlight?.cableIds || []);
  const sectionIds = new Set(continuityHighlight?.sectionIds || []);
  const splicePointIds = new Set(continuityHighlight?.splicePointIds || []);
  const assignmentIds = new Set(continuityHighlight?.assignmentIds || []);

  opgwCables.forEach((cable) => {
    if (cableIds.has(cable.properties.id)) routeIds.add(opgwRouteIdForCable(cable));
  });
  opgwCableSections.forEach((section) => {
    if (sectionIds.has(section.properties.cableSectionId)) {
      routeIds.add(section.properties.opgwRouteId);
      splicePointIds.add(section.properties.fromSplicePointId);
      splicePointIds.add(section.properties.toSplicePointId);
    }
    if (routeIds.has(section.properties.opgwRouteId)) {
      sectionIds.add(section.properties.cableSectionId);
      splicePointIds.add(section.properties.fromSplicePointId);
      splicePointIds.add(section.properties.toSplicePointId);
    }
  });

  return { routeIds, cableIds, sectionIds, splicePointIds, assignmentIds };
}

function opgwRouteIdForCable(cable: OpgwCableFeature) {
  return `OPGW-${cable.properties.lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO"}`;
}

function buildDatasets(
  substations: Substation[],
  nodes: MapNode[],
  transmissionLines: TransmissionLine[],
  publicTransmissionLines: PublicTransmissionLineFeature[],
  publicSubstations: PublicSubstationFeature[],
  fccUtilityTowers: FccUtilityTowerFeature[],
  fccMicrowaveLinks: FccMicrowaveLinkFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  transmissionStructures: TransmissionStructureFeature[],
  opgwCables: OpgwCableFeature[],
  opgwRoutes: OpgwRouteFeature[],
  opgwCableSections: OpgwCableSectionFeature[],
  opgwSpanSegments: OpgwSpanSegmentFeature[],
  opgwSplicePoints: OpgwSplicePointFeature[],
  spliceClosures: SpliceClosureFeature[],
  fiberSplices: FiberSplice[],
  fiberStrands: FiberStrand[],
  fiberAssignments: FiberAssignment[],
  syntheticServices: SyntheticService[],
  distributionPoleDensity: DistributionPoleDensityFeature[],
  distributionPoles: DistributionPoleFeature[],
  distributionPoleFiberRoutes: DistributionPoleFiberRouteFeature[],
  distributionSplicePoints: DistributionPoleSplicePointFeature[],
  distributionSlackLoops: DistributionSlackLoopFeature[],
  distributionFiberAssignments: DistributionFiberAssignmentFeature[],
  patchPanels: PatchPanel[],
  planningRegions: PlanningRegion[],
  layers: Record<StreetMapLayerKey, boolean>,
  continuityHighlight?: ContinuityHighlight,
) {
  const structureById = new Map(transmissionStructures.map((feature) => [feature.properties.id, feature]));
  const cableById = new Map(opgwCables.map((feature) => [feature.properties.id, feature]));
  const publicLineById = new Map(publicTransmissionLines.map((feature) => [feature.properties.id, feature]));
  const continuitySets = buildContinuityHighlightSets(continuityHighlight, opgwCables, opgwCableSections);
  const strandStatsByCable = buildCableStrandStats(opgwCables, fiberStrands);
  const assignmentStatsByCable = buildCableAssignmentStats(fiberAssignments);
  const spliceClosureCountByCable = buildCableSpliceClosureCounts(spliceClosures);
  const patchPanelCountByCable = buildCablePatchPanelCounts(patchPanels);
  const spliceMetricsByPoint = buildSpliceNodeMetrics({
    opgwCables,
    opgwCableSections,
    opgwSpanSegments,
    opgwSplicePoints,
    spliceClosures,
    fiberSplices,
    fiberAssignments,
    syntheticServices,
    patchPanels,
  });
  const closureToSplicePointId = buildClosureToSplicePointId(opgwSplicePoints);
  return {
    regions: layers.planningRegions ? collection(planningRegions.map((region) => ({
      type: "Feature",
      properties: { kind: "planning_region", id: region.id, label: region.name, status: region.status, visibility: region.visibility },
      geometry: region.geometry,
    }))) : emptyCollection,
    reference: layers.isoNeReferenceOverlays ? collection([{
      type: "Feature",
      properties: { kind: "reference", id: "iso-ne-public-context", label: "ISO-NE public reference context", status: "public_reference" },
      geometry: { type: "LineString", coordinates: [[-73.4, 41.05], [-72.45, 41.85], [-71.6, 43.05], [-70.65, 44.35], [-68.2, 46.6]] },
    }]) : emptyCollection,
    lines: collection(transmissionLines.filter((line) => lineVisibleForLayers(line, layers)).map((line) => ({
      type: "Feature",
      properties: {
        kind: "transmission_line",
        id: line.id,
        label: line.name,
        status: line.status,
        voltageKv: line.voltageKv || 0,
        circuitId: line.circuitId || "",
        isDashed: Boolean(line.nodeParameters?.planningUse) || line.status === "proposed",
      },
      geometry: line.geometry,
    }))),
    publicLines: layers.publicTransmissionLines ? collection(publicTransmissionLines.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "public_transmission_line",
        id: feature.properties.id,
        label: feature.properties.name ? `${feature.properties.name} (${feature.properties.id})` : feature.properties.id,
        status: feature.properties.status || "unknown",
        voltageKv: feature.properties.voltageKv ?? 0,
        voltageClass: feature.properties.voltageClass || "unknown",
        utilityOwner: publicTransmissionLineOwner(feature.properties),
        rawOwner: feature.properties.rawOwner || null,
        ownerSource: feature.properties.ownerSource || "unknown",
        ownerConfidence: feature.properties.ownerConfidence || "unknown",
        osmLineElementId: feature.properties.osmLineElementId || null,
        osmLineName: feature.properties.osmLineName || null,
        osmOperator: feature.properties.osmOperator || null,
        osmOwner: feature.properties.osmOwner || null,
        osmMatchDistanceMiles: feature.properties.osmMatchDistanceMiles ?? null,
        sourceType: feature.properties.sourceType,
        readOnly: true,
        synthetic: false,
        states: feature.properties.states.join(", "),
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    publicSubstations: layers.publicSubstations ? collection(publicSubstations.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "public_substation",
        id: feature.properties.id,
        label: feature.properties.name,
        status: feature.properties.status || "unknown",
        state: feature.properties.state,
        utilityOwner: feature.properties.utilityOwner,
        ownerSource: feature.properties.ownerSource,
        ownerConfidence: feature.properties.ownerConfidence,
        osmElementId: feature.properties.osmElementId || null,
        osmSubstationName: feature.properties.osmSubstationName || null,
        osmOperator: feature.properties.osmOperator || null,
        osmOwner: feature.properties.osmOwner || null,
        osmMatchDistanceMiles: feature.properties.osmMatchDistanceMiles ?? null,
        nearestPublicLineId: feature.properties.nearestPublicLineId || null,
        nearestPublicLineDistanceMiles: feature.properties.nearestPublicLineDistanceMiles ?? null,
        maxVoltageKv: feature.properties.maxVoltageKv ?? null,
        minVoltageKv: feature.properties.minVoltageKv ?? null,
        sourceType: feature.properties.sourceType,
        readOnly: true,
        synthetic: false,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    fccMicrowaveLinks: layers.fccMicrowaveLinks ? collection(fccMicrowaveLinks.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "fcc_microwave_link",
        id: feature.properties.id,
        label: feature.properties.linkName,
        status: feature.properties.pathStatus || "active",
        callSign: feature.properties.callSign,
        utilityOwner: feature.properties.utilityOwner,
        rawLicenseeName: feature.properties.rawLicenseeName,
        pathNumber: feature.properties.pathNumber,
        pathTypeDesc: feature.properties.pathTypeDesc || null,
        frequencyBand: fccFrequencyBandLabel(feature.properties.frequencyAssignedMhz),
        frequencyAssignedMhz: feature.properties.frequencyAssignedMhz ?? null,
        frequencyUpperBandMhz: feature.properties.frequencyUpperBandMhz ?? null,
        eirp: feature.properties.eirp ?? null,
        pathDistanceMiles: feature.properties.pathDistanceMiles ?? null,
        sourceType: feature.properties.sourceType,
        readOnly: true,
        synthetic: false,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    fccUtilityTowers: layers.fccUtilityTowers ? collection(fccUtilityTowers.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "fcc_utility_tower",
        id: feature.properties.id,
        label: feature.properties.nodeName,
        status: feature.properties.licenseStatus || "active",
        callSign: feature.properties.callSign,
        utilityOwner: feature.properties.utilityOwner,
        rawLicenseeName: feature.properties.rawLicenseeName,
        state: feature.properties.state,
        locationNumber: feature.properties.locationNumber,
        locationName: feature.properties.locationName || null,
        towerRegistrationNumber: feature.properties.towerRegistrationNumber || null,
        linkedPathCount: feature.properties.linkedPathIds.length,
        frequencyBandsMhz: feature.properties.frequencyBandsMhz.join(", "),
        sourceType: feature.properties.sourceType,
        readOnly: true,
        synthetic: false,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    structures: layers.transmissionStructures ? collection(transmissionStructures.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "transmission_structure",
        id: feature.properties.id,
        label: feature.properties.structureNumber,
        structureNumber: feature.properties.structureNumber,
        status: feature.properties.hasSplice ? "splice" : feature.properties.hasOpgw ? "opgw" : "synthetic",
        structureType: feature.properties.structureType,
        hasOpgw: feature.properties.hasOpgw,
        hasSplice: feature.properties.hasSplice,
        lineId: feature.properties.lineId,
        synthetic: true,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    opgwRoutes: layers.assumedOpgwRoutes || layers.opgwRoutes || layers.opgwOutageImpact ? collection(opgwRoutes.flatMap((feature) => {
      const isContinuityHighlight = continuitySets.routeIds.has(feature.properties.opgwRouteId);
      const visible =
        (layers.assumedOpgwRoutes && isAssumedOpgwStatus(feature.properties.routeStatus))
        || (layers.plannedOpgwFiber && isPlannedOpgwStatus(feature.properties.routeStatus))
        || (layers.verifiedOpgwFiber && isVerifiedOpgwStatus(feature.properties.routeStatus))
        || layers.opgwRoutes
        || (layers.opgwOutageImpact && feature.properties.outageImpactCount > 0)
        || isContinuityHighlight;
      if (!visible) return [];
      return [{
        type: "Feature" as const,
        properties: {
          kind: "opgw_route",
          id: feature.properties.opgwRouteId,
          label: feature.properties.routeName,
          status: feature.properties.routeStatus,
          opgwStatus: feature.properties.routeStatus,
          transmissionLineId: feature.properties.transmissionLineId,
          routeMiles: feature.properties.routeMiles,
          fiberCount: feature.properties.totalFiberCount,
          totalStructures: feature.properties.totalStructures,
          totalSpans: feature.properties.totalSpans,
          totalCableSections: feature.properties.totalCableSections,
          totalSplicePoints: feature.properties.totalSplicePoints,
          availableStrands: feature.properties.availableStrands,
          assignedStrands: feature.properties.assignedStrands,
          criticalCircuits: feature.properties.criticalRidingCircuits,
          synthetic: true,
          warning: feature.properties.warning,
          isContinuityHighlight,
          continuityLabel: continuityHighlight?.label || null,
        },
        geometry: feature.geometry,
      }];
    })) : emptyCollection,
    opgwCableSections: layers.opgwCableSections || layers.assumedOpgwRoutes || layers.plannedOpgwFiber || layers.verifiedOpgwFiber || layers.availableStrandCapacity || layers.opgwOutageImpact ? collection(opgwCableSections.flatMap((feature) => {
      const isContinuityHighlight = continuitySets.sectionIds.has(feature.properties.cableSectionId) || continuitySets.routeIds.has(feature.properties.opgwRouteId);
      const statusVisible =
        layers.opgwCableSections
        || (layers.assumedOpgwRoutes && feature.properties.installStatus === "assumed")
        || (layers.plannedOpgwFiber && ["proposed", "planned", "installed_synthetic"].includes(feature.properties.installStatus))
        || (layers.verifiedOpgwFiber && feature.properties.installStatus === "verified")
        || (layers.availableStrandCapacity && feature.properties.availableStrands <= 12)
        || (layers.opgwOutageImpact && feature.properties.assignedServices > 0 && feature.properties.availableStrands <= 12)
        || isContinuityHighlight;
      if (!statusVisible) return [];
      return [{
        type: "Feature" as const,
        properties: {
          kind: "opgw_cable_section",
          id: feature.properties.cableSectionId,
          label: feature.properties.cableSectionId,
          status: feature.properties.installStatus,
          installStatus: feature.properties.installStatus,
          opgwRouteId: feature.properties.opgwRouteId,
          transmissionLineId: feature.properties.transmissionLineId,
          fromSplicePointId: feature.properties.fromSplicePointId,
          toSplicePointId: feature.properties.toSplicePointId,
          fromStructureNumber: feature.properties.fromStructureNumber,
          toStructureNumber: feature.properties.toStructureNumber,
          routeMiles: feature.properties.routeMiles,
          totalSpans: feature.properties.totalSpans,
          fiberCount: feature.properties.fiberCount,
          availableStrands: feature.properties.availableStrands,
          assignedStrands: feature.properties.assignedStrands,
          reservedStrands: feature.properties.reservedStrands,
          assignedServices: feature.properties.assignedServices,
          synthetic: true,
          warning: feature.properties.warning,
          isContinuityHighlight,
          continuityLabel: continuityHighlight?.label || null,
        },
        geometry: feature.geometry,
      }];
    })) : emptyCollection,
    opgwSpanSegments: layers.opgwSpanSegments || layers.opgwOpenWorkOrders || layers.opgwSpanInspectionIssues || layers.opgwOutageImpact ? collection(opgwSpanSegments.flatMap((feature) => {
      const visible =
        layers.opgwSpanSegments
        || (layers.opgwOpenWorkOrders && feature.properties.openWorkOrderCount > 0)
        || (layers.opgwSpanInspectionIssues && feature.properties.hasMidspanIssue)
        || (layers.opgwOutageImpact && feature.properties.outageRiskScore >= 70);
      if (!visible) return [];
      return [{
        type: "Feature" as const,
        properties: {
          kind: "opgw_span_segment",
          id: feature.properties.spanSegmentId,
          label: `${feature.properties.fromStructureNumber} to ${feature.properties.toStructureNumber}`,
          status: feature.properties.spanStatus,
          spanStatus: feature.properties.spanStatus,
          cableSectionId: feature.properties.cableSectionId,
          opgwRouteId: feature.properties.opgwRouteId,
          transmissionLineId: feature.properties.transmissionLineId,
          spanLengthFt: feature.properties.spanLengthFt,
          fiberCount: feature.properties.fiberCount,
          inspectionStatus: feature.properties.inspectionStatus,
          outageRiskScore: feature.properties.outageRiskScore,
          openWorkOrderCount: feature.properties.openWorkOrderCount,
          hasMidspanIssue: feature.properties.hasMidspanIssue,
          synthetic: true,
        },
        geometry: feature.geometry,
      }];
    })) : emptyCollection,
    opgwSplicePoints: layers.opgwSplicePoints || layers.existingFiberSplices || layers.proposedFiberSplices || layers.compareSpliceLayers ? collection(opgwSplicePoints.flatMap((feature) => {
      const metrics = spliceMetricsByPoint.get(feature.properties.splicePointId);
      const isContinuityHighlight = continuitySets.splicePointIds.has(feature.properties.splicePointId);
      const hasExisting = (metrics?.activeSyntheticServices || 0) > 0 || feature.properties.status === "synthetic_assumption" || feature.properties.status === "verified";
      const hasProposed = (metrics?.proposedSyntheticServices || 0) > 0 || feature.properties.status === "planned";
      if (layers.existingFiberSplices && !layers.opgwSplicePoints && !layers.compareSpliceLayers && !hasExisting) return [];
      if (layers.proposedFiberSplices && !layers.opgwSplicePoints && !layers.compareSpliceLayers && !hasProposed) return [];
      return [{
      type: "Feature",
      properties: {
        kind: "opgw_splice_point",
        id: feature.properties.splicePointId,
        label: feature.properties.splicePointId,
        status: spliceMetricsByPoint.get(feature.properties.splicePointId)?.status || feature.properties.status,
        spliceType: feature.properties.spliceType,
        locationType: spliceMetricsByPoint.get(feature.properties.splicePointId)?.locationType || feature.properties.spliceType,
        structureId: feature.properties.structureId,
        structureNumber: feature.properties.structureNumber,
        closureId: feature.properties.closureId || null,
        splicePointId: feature.properties.splicePointId,
        transmissionLineId: feature.properties.transmissionLineId,
        opgwRouteId: feature.properties.opgwRouteId,
        fiberCount: spliceMetricsByPoint.get(feature.properties.splicePointId)?.fiberCount || 0,
        incomingCableSections: spliceMetricsByPoint.get(feature.properties.splicePointId)?.incomingCableSections || 0,
        outgoingCableSections: spliceMetricsByPoint.get(feature.properties.splicePointId)?.outgoingCableSections || 0,
        activeSyntheticServices: spliceMetricsByPoint.get(feature.properties.splicePointId)?.activeSyntheticServices || 0,
        proposedSyntheticServices: spliceMetricsByPoint.get(feature.properties.splicePointId)?.proposedSyntheticServices || 0,
        associatedCableSections: feature.properties.associatedCableSectionIds.length,
        warning: "Synthetic splice point only. Not proof of real OPGW, SCADA, relay, protection, or private telecom routing.",
        synthetic: true,
        isContinuityHighlight,
        continuityLabel: continuityHighlight?.label || null,
      },
      geometry: feature.geometry,
      }];
    })) : emptyCollection,
    opgwCables: collection(opgwCables.flatMap((feature) => {
      const status = opgwPlanningStatus(feature);
      const featureRouteId = opgwRouteIdForCable(feature);
      const isContinuityHighlight = continuitySets.cableIds.has(feature.properties.id) || continuitySets.routeIds.has(featureRouteId);
      const confidenceLevel = opgwConfidenceLevel(feature);
      const strandStats = strandStatsByCable.get(feature.properties.id) || fallbackStrandStats(feature.properties.fiberCount);
      const assignmentStats = assignmentStatsByCable.get(feature.properties.id) || emptyAssignmentStats();
      const spliceClosureCount = feature.properties.connectedSpliceClosureIds.length || spliceClosureCountByCable.get(feature.properties.id) || 0;
      const patchPanelCount = patchPanelCountByCable.get(feature.properties.id) || 0;
      const hasOutageImpact = assignmentStats.criticalCircuits > 0 && (confidenceLevel === "low" || strandStats.available <= Math.max(2, Math.floor(feature.properties.fiberCount * 0.12)));
      const routeLayerVisible =
        layers.syntheticOpgwCables
        || (layers.assumedOpgwRoutes && isAssumedOpgwStatus(status) && !layers.opgwRoutes)
        || (layers.plannedOpgwFiber && isPlannedOpgwStatus(status))
        || (layers.verifiedOpgwFiber && isVerifiedOpgwStatus(status));
      const capacityLayerVisible = layers.availableStrandCapacity;
      const outageLayerVisible = layers.opgwOutageImpact && hasOutageImpact;
      if (!routeLayerVisible && !capacityLayerVisible && !outageLayerVisible && !isContinuityHighlight) return [];
      const startStructure = structureById.get(feature.properties.startStructureId)?.properties;
      const endStructure = structureById.get(feature.properties.endStructureId)?.properties;
      const line = publicLineById.get(feature.properties.lineId)?.properties;
      return [{
        type: "Feature" as const,
        properties: {
          kind: "opgw_cable",
          id: feature.properties.id,
          label: feature.properties.cableName,
          routeName: feature.properties.cableName,
          routeId: feature.properties.id,
          status,
          opgwStatus: status,
          sourceStatus: feature.properties.status,
          fromSubstation: startStructure?.structureNumber || feature.properties.startStructureId,
          toSubstation: endStructure?.structureNumber || feature.properties.endStructureId,
          transmissionLine: feature.properties.lineName || feature.properties.lineId,
          corridor: feature.properties.lineName || feature.properties.lineId,
          voltageClass: line?.voltageClass || "unknown",
          routeMiles: feature.properties.routeMiles,
          fiberCount: feature.properties.fiberCount,
          cableId: feature.properties.id,
          confidenceLevel,
          availableStrands: strandStats.available,
          assignedStrands: strandStats.assigned,
          reservedStrands: strandStats.reserved,
          totalStrands: strandStats.total,
          criticalCircuits: assignmentStats.criticalCircuits,
          spliceClosures: spliceClosureCount,
          patchPanels: patchPanelCount,
          hasOpenWorkOrder: assignmentStats.openWorkOrders > 0 || status === "work_order_issued",
          hasOutageImpact,
          showCapacity: capacityLayerVisible,
          showOutageImpact: outageLayerVisible,
          synthetic: true,
          warning: "Synthetic planning assumption only. Not active fiber. Requires engineer/as-built verification.",
          isContinuityHighlight,
          continuityLabel: continuityHighlight?.label || null,
        },
        geometry: feature.geometry,
      }];
    })),
    spliceClosures: layers.spliceClosures || layers.existingFiberSplices || layers.proposedFiberSplices || layers.compareSpliceLayers ? collection(spliceClosures.flatMap((feature) => {
      const pointId = closureToSplicePointId.get(feature.properties.id) || "";
      const isContinuityHighlight = continuitySets.splicePointIds.has(pointId);
      const metrics = spliceMetricsByPoint.get(pointId);
      const hasExisting = feature.properties.status === "existing" || (metrics?.activeSyntheticServices || 0) > 0;
      const hasProposed = feature.properties.status === "planned" || feature.properties.status === "proposed" || (metrics?.proposedSyntheticServices || 0) > 0;
      if (layers.existingFiberSplices && !layers.spliceClosures && !layers.compareSpliceLayers && !hasExisting) return [];
      if (layers.proposedFiberSplices && !layers.spliceClosures && !layers.compareSpliceLayers && !hasProposed) return [];
      return [{
      type: "Feature",
      properties: {
        kind: "splice_closure",
        id: feature.properties.id,
        label: feature.properties.name,
        status: feature.properties.status === "existing" ? "synthetic_existing" : feature.properties.status,
        splicePointId: closureToSplicePointId.get(feature.properties.id) || feature.properties.id,
        closureId: feature.properties.id,
        structureId: feature.properties.structureId,
        locationType: feature.properties.installType === "terminal" ? "patch panel entrance" : "transmission structure",
        transmissionLineId: opgwSplicePoints.find((point) => point.properties.closureId === feature.properties.id)?.properties.transmissionLineId || null,
        opgwRouteId: opgwSplicePoints.find((point) => point.properties.closureId === feature.properties.id)?.properties.opgwRouteId || null,
        fiberCount: Math.max(...feature.properties.cableIds.map((cableId) => cableById.get(cableId)?.properties.fiberCount || 0), 0),
        incomingCableSections: spliceMetricsByPoint.get(closureToSplicePointId.get(feature.properties.id) || "")?.incomingCableSections || 0,
        outgoingCableSections: spliceMetricsByPoint.get(closureToSplicePointId.get(feature.properties.id) || "")?.outgoingCableSections || 0,
        activeSyntheticServices: spliceMetricsByPoint.get(closureToSplicePointId.get(feature.properties.id) || "")?.activeSyntheticServices || 0,
        proposedSyntheticServices: spliceMetricsByPoint.get(closureToSplicePointId.get(feature.properties.id) || "")?.proposedSyntheticServices || 0,
        closureType: feature.properties.closureType,
        structureNumber: feature.properties.structureNumber,
        spliceCount: feature.properties.spliceCount,
        warning: "Synthetic splice closure only. Existing/proposed rows are demo planning records.",
        synthetic: true,
        isContinuityHighlight,
        continuityLabel: continuityHighlight?.label || null,
      },
      geometry: feature.geometry,
      }];
    })) : emptyCollection,
    fiberAssignments: layers.fiberAssignments || layers.criticalRidingCircuits ? collection(fiberAssignments.flatMap((assignment) => {
      const isContinuityHighlight = continuitySets.assignmentIds.has(assignment.id);
      if (layers.criticalRidingCircuits && !layers.fiberAssignments && !isCriticalFiberAssignment(assignment) && !isContinuityHighlight) return [];
      const coordinates = assignment.cableIds
        .map((cableId) => cableById.get(cableId))
        .filter(Boolean)
        .map((feature) => feature!.geometry.type === "LineString" ? feature!.geometry.coordinates : feature!.geometry.coordinates.flat());
      if (!coordinates.length) return [];
      return [{
        type: "Feature" as const,
        properties: {
          kind: "fiber_assignment",
          id: assignment.id,
          label: assignment.assignmentName,
          status: assignment.status,
          serviceType: assignment.serviceType,
          isCritical: isCriticalFiberAssignment(assignment),
          estimatedLossDb: assignment.estimatedLossDb || 0,
          synthetic: true,
          isContinuityHighlight,
          continuityLabel: continuityHighlight?.label || null,
        },
        geometry: coordinates.length === 1
          ? { type: "LineString" as const, coordinates: coordinates[0] }
          : { type: "MultiLineString" as const, coordinates },
      }];
    })) : emptyCollection,
    distributionPoleDensity: layers.distributionPoleDensity ? collection(distributionPoleDensity.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "distribution_pole_density",
        id: feature.properties.id,
        label: feature.properties.densityCellName,
        status: feature.properties.statusSummary,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        displayPoleCount: feature.properties.displayPoleCount,
        representedPoleCount: feature.properties.representedPoleCount,
        feederRouteCount: feature.properties.feederRouteCount,
        fiberRouteMiles: feature.properties.fiberRouteMiles,
        splicePointCount: feature.properties.splicePointCount,
        slackLoopCount: feature.properties.slackLoopCount,
        assignmentCount: feature.properties.assignmentCount,
        fiberCount: feature.properties.maxFiberCount,
        synthetic: true,
        warning: "Synthetic density rollup only. It represents generated demo poles and does not prove real utility pole locations.",
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    distributionPoleFiberRoutes: layers.distributionFiberRoutes ? collection(distributionPoleFiberRoutes.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "distribution_pole_fiber",
        id: feature.properties.routeId,
        label: feature.properties.routeName,
        status: feature.properties.status,
        continuityStatus: feature.properties.continuityStatus,
        feederId: feature.properties.feederId,
        streetPathId: feature.properties.streetPathId,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        poleCount: feature.properties.poleCount,
        representedPoleCount: feature.properties.representedPoleCount || feature.properties.estimatedPoleScaleCount,
        splicePointCount: feature.properties.splicePointIds?.length || 0,
        slackLoopCount: feature.properties.slackLoopIds?.length || 0,
        assignmentCount: feature.properties.assignmentIds?.length || 0,
        totalSlackFeet: feature.properties.totalSlackFeet || 0,
        fiberCount: feature.properties.fiberCount,
        routeMiles: feature.properties.routeMiles,
        parentPatchPanelId: feature.properties.parentPatchPanelId || null,
        parentOpgwRouteId: feature.properties.parentOpgwRouteId || null,
        estimatedPoleScaleCount: feature.properties.estimatedPoleScaleCount,
        synthetic: true,
        warning: "Synthetic street-following distribution telecom fiber route. Not real utility fiber.",
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    distributionFiberAssignments: layers.distributionFiberAssignments ? collection(distributionFiberAssignments.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "distribution_fiber_assignment",
        id: feature.properties.id,
        label: feature.properties.assignmentName,
        status: feature.properties.status,
        serviceType: feature.properties.serviceType,
        criticality: feature.properties.criticality,
        routeId: feature.properties.routeId,
        feederId: feature.properties.feederId,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        strandNumbers: feature.properties.strandNumbers.join(", "),
        splicePointCount: feature.properties.splicePointIds.length,
        slackLoopCount: feature.properties.slackLoopIds.length,
        routeMiles: feature.properties.routeMiles,
        estimatedLossDb: feature.properties.estimatedLossDb,
        fiberCount: feature.properties.fiberCount,
        synthetic: true,
        warning: "Synthetic distribution assignment only. Not an actual telecom service route.",
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    distributionPoles: layers.distributionPoles ? collection(distributionPoles.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "distribution_pole",
        id: feature.properties.id,
        label: feature.properties.poleNumber,
        status: feature.properties.status,
        poleNumber: feature.properties.poleNumber,
        feederId: feature.properties.feederId,
        streetPathId: feature.properties.streetPathId,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        telecomRole: feature.properties.telecomRole,
        fiberCount: feature.properties.fiberCount,
        continuityPathId: feature.properties.continuityPathId || null,
        upstreamPatchPanelId: feature.properties.upstreamPatchPanelId || null,
        upstreamPoleId: feature.properties.upstreamPoleId || null,
        downstreamPoleId: feature.properties.downstreamPoleId || null,
        serviceDropCount: feature.properties.serviceDropCount,
        representedPoleCount: feature.properties.representedPoleCount || 1,
        splicePointCount: feature.properties.splicePointIds?.length || 0,
        slackLoopCount: feature.properties.slackLoopIds?.length || 0,
        assignmentCount: feature.properties.assignmentIds?.length || 0,
        synthetic: true,
        warning: "Synthetic distribution pole placement following generated street paths. Not a real pole record.",
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    distributionSplicePoints: layers.distributionSplicePoints ? collection(distributionSplicePoints.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "distribution_splice_point",
        id: feature.properties.id,
        label: feature.properties.spliceName,
        status: feature.properties.status,
        routeId: feature.properties.routeId,
        feederId: feature.properties.feederId,
        streetPathId: feature.properties.streetPathId,
        poleId: feature.properties.poleId,
        poleNumber: feature.properties.poleNumber,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        spliceType: feature.properties.spliceType,
        spliceCount: feature.properties.spliceCount,
        slackLoopFeet: feature.properties.slackLoopFeet,
        connectedAssignmentCount: feature.properties.connectedAssignmentIds.length,
        synthetic: true,
        warning: "Synthetic distribution splice point only. Not a real field splice.",
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    distributionSlackLoops: layers.distributionSlackLoops ? collection(distributionSlackLoops.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "distribution_slack_loop",
        id: feature.properties.id,
        label: feature.properties.slackName,
        status: feature.properties.status,
        routeId: feature.properties.routeId,
        feederId: feature.properties.feederId,
        poleId: feature.properties.poleId,
        poleNumber: feature.properties.poleNumber,
        utilityOwner: feature.properties.utilityOwner,
        state: feature.properties.state,
        slackType: feature.properties.slackType,
        slackFeet: feature.properties.slackFeet,
        relatedSplicePointId: feature.properties.relatedSplicePointId || null,
        synthetic: true,
        warning: "Synthetic distribution slack loop only. Not a real slack-storage record.",
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    patchPanels: layers.patchPanels ? collection(patchPanels.flatMap((panel) => {
      if (panel.locationType !== "structure") return [];
      const structure = structureById.get(panel.locationId);
      if (!structure) return [];
      return [{
        type: "Feature" as const,
        properties: {
          kind: "patch_panel",
          id: panel.id,
          label: panel.name,
          status: panel.ports.some((port) => port.status === "assigned") ? "assigned" : "available",
          portCount: panel.portCount,
          connectorType: panel.connectorType,
          synthetic: true,
        },
        geometry: { type: "Point" as const, coordinates: structure.geometry.coordinates },
      }];
    })) : emptyCollection,
    substations: collection(substations.filter((substation) => layers.substations && hasCoordinates(substation)).map((substation) => ({
      type: "Feature",
      properties: { kind: "substation", id: substation.id, label: substation.abbreviation || substation.name, status: substation.status, visibility: substation.visibility, voltageKv: substation.voltageKv?.[0] || 0 },
      geometry: { type: "Point", coordinates: [substation.longitude as number, substation.latitude as number] },
    }))),
    syntheticSubstations: layers.syntheticSubstations ? collection(syntheticSubstations.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "synthetic_substation",
        id: feature.properties.id,
        label: feature.properties.name,
        status: feature.properties.status,
        state: feature.properties.state,
        planningRole: feature.properties.planningRole,
        criticality: feature.properties.criticality,
        visibility: feature.properties.visibility,
        sourceType: feature.properties.sourceType,
        synthetic: true,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    nodes: collection(nodes.filter((node) => hasCoordinates(node) && nodeVisibleForLayers(node, layers)).map((node) => ({
      type: "Feature",
      properties: { kind: "node", id: node.id, label: node.name, status: node.status, nodeType: node.nodeType, visibility: node.visibility },
      geometry: { type: "Point", coordinates: [node.longitude as number, node.latitude as number] },
    }))),
    workOrders: layers.workOrderLocations ? collection(nodes.filter(hasCoordinates).flatMap((node, nodeIndex) => node.linkedWorkOrderIds.map((workOrderId, workOrderIndex) => ({
      type: "Feature" as const,
      properties: { kind: "work_order", id: workOrderId, label: workOrderId, status: "open", nodeId: node.id },
      geometry: {
        type: "Point" as const,
        coordinates: [
          Number(((node.longitude as number) + 0.012 + workOrderIndex * 0.006).toFixed(6)),
          Number(((node.latitude as number) - 0.008 - nodeIndex * 0.001).toFixed(6)),
        ] as Coordinate,
      },
    })))) : emptyCollection,
  };
}

function fitActiveMap(map: MapLibreMap, activeMap: TransmissionMap, substations: Substation[], nodes: MapNode[], transmissionLines: TransmissionLine[]) {
  const activeNodeCoordinates = nodes
    .filter((node) => node.transmissionMapId === activeMap.id && hasCoordinates(node))
    .map((node) => [node.longitude as number, node.latitude as number] as Coordinate);
  const activeSubstationIds = new Set(nodes.filter((node) => node.transmissionMapId === activeMap.id).map((node) => node.parentSubstationId).filter(Boolean));
  const activeSubstationCoordinates = substations
    .filter((substation) => activeSubstationIds.has(substation.id) && hasCoordinates(substation))
    .map((substation) => [substation.longitude as number, substation.latitude as number] as Coordinate);
  const activeLineCoordinates = transmissionLines.flatMap((line) => {
    const matchesSubstation = activeSubstationIds.has(line.fromSubstationId || "") || activeSubstationIds.has(line.toSubstationId || "");
    return matchesSubstation ? line.geometry.coordinates : [];
  });
  const coordinates = [...activeNodeCoordinates, ...activeSubstationCoordinates, ...activeLineCoordinates];
  if (!coordinates.length) {
    map.fitBounds(isoNeBounds, { padding: 36, duration: 420 });
    return;
  }
  map.fitBounds(boundsFromCoordinates(coordinates), { padding: 68, duration: 520 });
}

function buildSelectionLookup(
  substations: Substation[],
  nodes: MapNode[],
  transmissionLines: TransmissionLine[],
  publicTransmissionLines: PublicTransmissionLineFeature[],
  publicSubstations: PublicSubstationFeature[],
  fccUtilityTowers: FccUtilityTowerFeature[],
  fccMicrowaveLinks: FccMicrowaveLinkFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  transmissionStructures: TransmissionStructureFeature[],
  opgwCables: OpgwCableFeature[],
  opgwRoutes: OpgwRouteFeature[],
  opgwCableSections: OpgwCableSectionFeature[],
  opgwSpanSegments: OpgwSpanSegmentFeature[],
  opgwSplicePoints: OpgwSplicePointFeature[],
  spliceClosures: SpliceClosureFeature[],
  fiberAssignments: FiberAssignment[],
  distributionPoleDensity: DistributionPoleDensityFeature[],
  distributionPoles: DistributionPoleFeature[],
  distributionPoleFiberRoutes: DistributionPoleFiberRouteFeature[],
  distributionSplicePoints: DistributionPoleSplicePointFeature[],
  distributionSlackLoops: DistributionSlackLoopFeature[],
  distributionFiberAssignments: DistributionFiberAssignmentFeature[],
  patchPanels: PatchPanel[],
  planningRegions: PlanningRegion[],
) {
  const lookup: Record<string, StreetMapSelection> = {};
  substations.forEach((record) => {
    lookup[`substation:${record.id}`] = { kind: "substation", id: record.id, label: record.name, record };
  });
  nodes.forEach((record) => {
    lookup[`node:${record.id}`] = { kind: "node", id: record.id, label: record.name, record };
    record.linkedWorkOrderIds.forEach((workOrderId) => {
      lookup[`work_order:${workOrderId}`] = { kind: "work_order", id: workOrderId, label: workOrderId, record };
    });
  });
  transmissionLines.forEach((record) => {
    lookup[`transmission_line:${record.id}`] = { kind: "transmission_line", id: record.id, label: record.name, record };
  });
  publicTransmissionLines.forEach((record) => {
    lookup[`public_transmission_line:${record.properties.id}`] = {
      kind: "public_transmission_line",
      id: record.properties.id,
      label: record.properties.name ? `${record.properties.name} (${record.properties.id})` : record.properties.id,
      record,
    };
  });
  publicSubstations.forEach((record) => {
    lookup[`public_substation:${record.properties.id}`] = {
      kind: "public_substation",
      id: record.properties.id,
      label: `${record.properties.name} / ${record.properties.utilityOwner}`,
      record,
    };
  });
  fccUtilityTowers.forEach((record) => {
    lookup[`fcc_utility_tower:${record.properties.id}`] = {
      kind: "fcc_utility_tower",
      id: record.properties.id,
      label: `${record.properties.callSign} loc ${record.properties.locationNumber} / ${record.properties.utilityOwner}`,
      record,
    };
  });
  fccMicrowaveLinks.forEach((record) => {
    lookup[`fcc_microwave_link:${record.properties.id}`] = {
      kind: "fcc_microwave_link",
      id: record.properties.id,
      label: `${record.properties.callSign} path ${record.properties.pathNumber} / ${record.properties.utilityOwner}`,
      record,
    };
  });
  syntheticSubstations.forEach((record) => {
    lookup[`synthetic_substation:${record.properties.id}`] = {
      kind: "synthetic_substation",
      id: record.properties.id,
      label: record.properties.name,
      record,
    };
  });
  transmissionStructures.forEach((record) => {
    lookup[`transmission_structure:${record.properties.id}`] = {
      kind: "transmission_structure",
      id: record.properties.id,
      label: record.properties.structureNumber,
      record,
    };
  });
  opgwCables.forEach((record) => {
    lookup[`opgw_cable:${record.properties.id}`] = {
      kind: "opgw_cable",
      id: record.properties.id,
      label: record.properties.cableName,
      record,
    };
  });
  opgwRoutes.forEach((record) => {
    lookup[`opgw_route:${record.properties.opgwRouteId}`] = {
      kind: "opgw_route",
      id: record.properties.opgwRouteId,
      label: record.properties.routeName,
      record,
    };
  });
  opgwCableSections.forEach((record) => {
    lookup[`opgw_cable_section:${record.properties.cableSectionId}`] = {
      kind: "opgw_cable_section",
      id: record.properties.cableSectionId,
      label: record.properties.cableSectionId,
      record,
    };
  });
  opgwSpanSegments.forEach((record) => {
    lookup[`opgw_span_segment:${record.properties.spanSegmentId}`] = {
      kind: "opgw_span_segment",
      id: record.properties.spanSegmentId,
      label: `${record.properties.fromStructureNumber} to ${record.properties.toStructureNumber}`,
      record,
    };
  });
  opgwSplicePoints.forEach((record) => {
    lookup[`opgw_splice_point:${record.properties.splicePointId}`] = {
      kind: "opgw_splice_point",
      id: record.properties.splicePointId,
      label: record.properties.splicePointId,
      record,
    };
  });
  spliceClosures.forEach((record) => {
    lookup[`splice_closure:${record.properties.id}`] = {
      kind: "splice_closure",
      id: record.properties.id,
      label: record.properties.name,
      record,
    };
  });
  fiberAssignments.forEach((record) => {
    lookup[`fiber_assignment:${record.id}`] = {
      kind: "fiber_assignment",
      id: record.id,
      label: record.assignmentName,
      record,
    };
  });
  distributionPoleDensity.forEach((record) => {
    lookup[`distribution_pole_density:${record.properties.id}`] = {
      kind: "distribution_pole_density",
      id: record.properties.id,
      label: record.properties.densityCellName,
      record,
    };
  });
  distributionPoles.forEach((record) => {
    lookup[`distribution_pole:${record.properties.id}`] = {
      kind: "distribution_pole",
      id: record.properties.id,
      label: record.properties.poleNumber,
      record,
    };
  });
  distributionSplicePoints.forEach((record) => {
    lookup[`distribution_splice_point:${record.properties.id}`] = {
      kind: "distribution_splice_point",
      id: record.properties.id,
      label: record.properties.spliceName,
      record,
    };
  });
  distributionSlackLoops.forEach((record) => {
    lookup[`distribution_slack_loop:${record.properties.id}`] = {
      kind: "distribution_slack_loop",
      id: record.properties.id,
      label: record.properties.slackName,
      record,
    };
  });
  distributionFiberAssignments.forEach((record) => {
    lookup[`distribution_fiber_assignment:${record.properties.id}`] = {
      kind: "distribution_fiber_assignment",
      id: record.properties.id,
      label: record.properties.assignmentName,
      record,
    };
  });
  distributionPoleFiberRoutes.forEach((record) => {
    lookup[`distribution_pole_fiber:${record.properties.routeId}`] = {
      kind: "distribution_pole_fiber",
      id: record.properties.routeId,
      label: record.properties.routeName,
      record,
    };
  });
  patchPanels.forEach((record) => {
    lookup[`patch_panel:${record.id}`] = {
      kind: "patch_panel",
      id: record.id,
      label: record.name,
      record,
    };
  });
  planningRegions.forEach((record) => {
    lookup[`planning_region:${record.id}`] = { kind: "planning_region", id: record.id, label: record.name, record };
  });
  return lookup;
}

function syncGisVectorLayerVisibility(map: MapLibreMap, layers: Record<StreetMapLayerKey, boolean>) {
  const distributionAny = layers.distributionPoleDensity || layers.distributionPoles || layers.distributionFiberRoutes || layers.distributionSplicePoints || layers.distributionSlackLoops || layers.distributionFiberAssignments;
  const visibility: Record<string, boolean> = {
    "gis-territory-boundary": distributionAny,
    "gis-pole-density": layers.distributionPoleDensity,
    "gis-pole-clusters": layers.distributionPoles,
    "gis-pole-points": layers.distributionPoles,
    "gis-span-lines": layers.distributionPoles || layers.distributionFiberRoutes,
    "gis-fiber-routes": layers.distributionFiberRoutes || layers.distributionFiberAssignments,
    "gis-splice-cases": layers.distributionSplicePoints,
    "gis-handholes": layers.distributionSplicePoints,
    "gis-slack-loops": layers.distributionSlackLoops,
    "gis-mux-sites": layers.distributionFiberRoutes,
    "gis-circuit-routes": layers.distributionFiberAssignments,
  };
  gisVectorLayerIds.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visibility[layerId] ? "visible" : "none");
  });
}

async function fetchPoleDetailForSelection(poleId: string, fallback: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, "")}/api/assets/pole/${encodeURIComponent(poleId)}`, { cache: "no-store" });
    if (!response.ok) {
      return { ...fallback, detailStatus: `${response.status} ${response.statusText}` };
    }
    const payload = await response.json() as { pole?: Record<string, unknown>; connected_spans?: unknown[] };
    return {
      ...fallback,
      ...(payload.pole || {}),
      connected_spans: payload.connected_spans || [],
      detailStatus: "loaded",
    };
  } catch (error) {
    return {
      ...fallback,
      detailStatus: error instanceof Error ? error.message : String(error),
    };
  }
}

function gisDetailTypeForLayer(layerId: string) {
  const types: Record<string, string> = {
    "gis-span-lines": "span",
    "gis-fiber-routes": "fiber_route",
    "gis-splice-cases": "splice_case",
    "gis-handholes": "handhole",
    "gis-slack-loops": "slack_loop",
    "gis-mux-sites": "mux_site",
    "gis-circuit-routes": "circuit_route",
  };
  return types[layerId];
}

async function fetchGisAssetDetailForSelection(assetType: string, assetId: string, fallback: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, "")}/api/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!response.ok) {
      return { ...fallback, detailStatus: `${response.status} ${response.statusText}`, detailType: assetType };
    }
    const payload = await response.json() as {
      asset?: Record<string, unknown>;
      related?: Record<string, unknown>;
      detail_strategy?: string;
      payload_note?: string;
    };
    return {
      ...fallback,
      ...(payload.asset || {}),
      related: payload.related || {},
      detailStrategy: payload.detail_strategy || "click_to_load_server_detail",
      detailNote: payload.payload_note,
      detailType: assetType,
      detailStatus: "loaded",
    };
  } catch (error) {
    return {
      ...fallback,
      detailType: assetType,
      detailStatus: error instanceof Error ? error.message : String(error),
    };
  }
}

function updateSource(map: MapLibreMap, sourceId: string, data: MapFeatureCollection) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data as Parameters<GeoJSONSource["setData"]>[0]);
}

function collection(features: MapFeature[]): MapFeatureCollection {
  return { type: "FeatureCollection", features };
}

function nodeVisibleForLayers(node: MapNode, layers: Record<StreetMapLayerKey, boolean>) {
  if (node.nodeType === "sel_icon_node") return layers.selIconNodes || layers.telecomNodes;
  if (node.nodeType === "circuit_endpoint") return layers.circuitEndpoints || layers.c3794Nodes;
  if (node.nodeType === "fiber_node") return layers.fiberRoutes || layers.distributionFiberRoutes || layers.opgwRoutes;
  if (node.status === "proposed" || node.nodeType === "proposed_node") return layers.proposedChanges;
  return layers.telecomNodes;
}

function lineVisibleForLayers(line: TransmissionLine, layers: Record<StreetMapLayerKey, boolean>) {
  if (line.status === "proposed" && !layers.proposedChanges) return false;
  if (line.nodeParameters?.planningUse === "Assumed OPGW corridor candidate") return layers.transmissionLines || layers.opgwRoutes;
  return layers.transmissionLines || layers.fiberRoutes;
}

function selectionCoordinates(selection: StreetMapSelection): Coordinate[] {
  if (selection.kind === "transmission_line") return selection.record.geometry.coordinates;
  if (selection.kind === "public_transmission_line") {
    return selection.record.geometry.type === "LineString" ? selection.record.geometry.coordinates : selection.record.geometry.coordinates.flat();
  }
  if (selection.kind === "public_substation") return [selection.record.geometry.coordinates];
  if (selection.kind === "fcc_utility_tower") return [selection.record.geometry.coordinates];
  if (selection.kind === "fcc_microwave_link") return selection.record.geometry.coordinates;
  if (selection.kind === "synthetic_substation") return [selection.record.geometry.coordinates];
  if (selection.kind === "transmission_structure") return [selection.record.geometry.coordinates];
  if (selection.kind === "opgw_cable") return selection.record.geometry.type === "LineString" ? selection.record.geometry.coordinates : selection.record.geometry.coordinates.flat();
  if (selection.kind === "opgw_route") return selection.record.geometry.type === "LineString" ? selection.record.geometry.coordinates : selection.record.geometry.coordinates.flat();
  if (selection.kind === "opgw_cable_section") return selection.record.geometry.coordinates;
  if (selection.kind === "opgw_span_segment") return selection.record.geometry.coordinates;
  if (selection.kind === "opgw_splice_point") return [selection.record.geometry.coordinates];
  if (selection.kind === "splice_closure") return [selection.record.geometry.coordinates];
  if (selection.kind === "distribution_pole_density") return [selection.record.geometry.coordinates];
  if (selection.kind === "distribution_pole") return [selection.record.geometry.coordinates];
  if (selection.kind === "distribution_pole_fiber") return selection.record.geometry.coordinates;
  if (selection.kind === "distribution_splice_point") return [selection.record.geometry.coordinates];
  if (selection.kind === "distribution_slack_loop") return [selection.record.geometry.coordinates];
  if (selection.kind === "distribution_fiber_assignment") return selection.record.geometry.coordinates;
  if (selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") {
    const longitude = Number(selection.record.longitude);
    const latitude = Number(selection.record.latitude);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [[longitude, latitude]];
  }
  if (selection.kind === "planning_region") return selection.record.geometry.coordinates[0];
  if ("latitude" in selection.record && selection.record.latitude !== undefined && selection.record.longitude !== undefined) {
    const longitude = Number(selection.record.longitude);
    const latitude = Number(selection.record.latitude);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [[longitude, latitude]];
  }
  return [];
}

function boundsFromCoordinates(coordinates: Coordinate[]): LngLatBoundsLike {
  const lons = coordinates.map(([lon]) => lon);
  const lats = coordinates.map(([, lat]) => lat);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

function hasCoordinates(asset: { latitude?: number; longitude?: number }) {
  return typeof asset.latitude === "number" && typeof asset.longitude === "number";
}

function setCursor(map: MapLibreMap, cursor: string) {
  map.getCanvas().style.cursor = cursor;
}

function renderPopupHtml(label: unknown, kind: string, status: unknown, warning?: unknown) {
  const warningHtml = warning ? `<small>${escapeHtml(String(warning))}</small>` : "";
  return `<div class="maplibre-popup-card"><strong>${escapeHtml(String(label))}</strong><span>${escapeHtml(kind.replaceAll("_", " "))} / ${escapeHtml(String(status))}</span>${warningHtml}</div>`;
}

function renderSplicePopupHtml(properties: Record<string, unknown>) {
  const kind = String(properties.kind || "");
  const recordId = String(properties.id || "");
  const splicePointId = String(properties.splicePointId || (kind === "opgw_splice_point" ? recordId : ""));
  const closureId = String(properties.closureId || (kind === "splice_closure" ? recordId : ""));
  const targetId = splicePointId || closureId || recordId;
  const continuityHref = splicePointId
    ? `/fiber-trace?splicePoint=${encodeURIComponent(splicePointId)}`
    : `/fiber-trace?spliceClosure=${encodeURIComponent(closureId)}`;
  const outageHref = splicePointId
    ? `/outage-impact?splicePoint=${encodeURIComponent(splicePointId)}`
    : `/outage-impact?spliceClosure=${encodeURIComponent(closureId)}`;
  const workOrderHref = splicePointId
    ? `/work-orders/new?splicePoint=${encodeURIComponent(splicePointId)}`
    : `/work-orders/new?spliceClosure=${encodeURIComponent(closureId)}`;
  const managerHref = `/opgw/splices/${encodeURIComponent(targetId)}`;
  const diagramHref = `${managerHref}/diagram`;
  const existingHref = `${managerHref}?layer=existing`;
  const proposedHref = `${managerHref}?layer=proposed`;
  return `
    <div class="maplibre-popup-card splice-popup-card">
      <strong>${escapeHtml(String(properties.label || targetId))}</strong>
      <span>${escapeHtml(String(properties.kind || "splice node").replaceAll("_", " "))} / ${escapeHtml(String(properties.status || "synthetic_existing"))}</span>
      <dl>
        <div><dt>Splice point</dt><dd>${escapeHtml(splicePointId || "resolved by closure")}</dd></div>
        <div><dt>Closure</dt><dd>${escapeHtml(closureId || "-")}</dd></div>
        <div><dt>Structure</dt><dd>${escapeHtml(String(properties.structureId || properties.structureNumber || "-"))}</dd></div>
        <div><dt>Line</dt><dd>${escapeHtml(String(properties.transmissionLineId || "-"))}</dd></div>
        <div><dt>Route</dt><dd>${escapeHtml(String(properties.opgwRouteId || "-"))}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(String(properties.locationType || "transmission structure"))}</dd></div>
        <div><dt>Fiber count</dt><dd>${escapeHtml(String(properties.fiberCount || 0))}</dd></div>
        <div><dt>Incoming</dt><dd>${escapeHtml(String(properties.incomingCableSections || 0))}</dd></div>
        <div><dt>Outgoing</dt><dd>${escapeHtml(String(properties.outgoingCableSections || 0))}</dd></div>
        <div><dt>Active services</dt><dd>${escapeHtml(String(properties.activeSyntheticServices || 0))}</dd></div>
        <div><dt>Proposed services</dt><dd>${escapeHtml(String(properties.proposedSyntheticServices || 0))}</dd></div>
      </dl>
      <small>${escapeHtml(String(properties.warning || "Synthetic demo splice data only."))}</small>
      <nav aria-label="Splice node actions">
        <a href="${diagramHref}">Interactive Splicing Diagram</a>
        <a href="${managerHref}">Open Splice Manager</a>
        <a href="${continuityHref}">View Fiber Continuity</a>
        <a href="${existingHref}">View Existing Splices</a>
        <a href="${proposedHref}">View Proposed Splices</a>
        <a href="${outageHref}">Analyze Outage Impact</a>
        <a href="${workOrderHref}">Create Work Order</a>
      </nav>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
