"use client";

import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type MapLayerMouseEvent, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate, FiberAssignment, MapDrawingTool, MapNode, OpgwCableFeature, PatchPanel, PlanningRegion, PublicTransmissionLineFeature, SpliceClosureFeature, StreetMapLayerKey, Substation, SyntheticSubstationFeature, TransmissionLine, TransmissionMap, TransmissionStructureFeature } from "@/lib/types/assets";
import type { FocusRequest, MapCommand, StreetMapSelection } from "./StreetLevelAssetMap";

type MapLibreStreetMapProps = {
  activeMap: TransmissionMap;
  substations: Substation[];
  nodes: MapNode[];
  transmissionLines: TransmissionLine[];
  publicTransmissionLines: PublicTransmissionLineFeature[];
  syntheticSubstations: SyntheticSubstationFeature[];
  transmissionStructures: TransmissionStructureFeature[];
  opgwCables: OpgwCableFeature[];
  spliceClosures: SpliceClosureFeature[];
  fiberAssignments: FiberAssignment[];
  patchPanels: PatchPanel[];
  planningRegions: PlanningRegion[];
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  command: MapCommand | null;
  focusRequest: FocusRequest | null;
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
  structures: "synthetic-transmission-structures",
  opgwCables: "synthetic-opgw-cables",
  spliceClosures: "synthetic-splice-closures",
  fiberAssignments: "synthetic-fiber-assignments",
  patchPanels: "synthetic-patch-panels",
  substations: "regional-substations",
  syntheticSubstations: "synthetic-substations",
  nodes: "regional-map-nodes",
  workOrders: "regional-work-orders",
};

const clickableLayerIds = [
  "regional-planning-regions-fill",
  "regional-reference-line",
  "public-transmission-lines",
  "synthetic-opgw-cables",
  "synthetic-fiber-assignments",
  "synthetic-transmission-structures",
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

export function MapLibreStreetMap({
  activeMap,
  substations,
  nodes,
  transmissionLines,
  publicTransmissionLines,
  syntheticSubstations,
  transmissionStructures,
  opgwCables,
  spliceClosures,
  fiberAssignments,
  patchPanels,
  planningRegions,
  layers,
  activeTool,
  command,
  focusRequest,
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
    () => buildDatasets(substations, nodes, transmissionLines, publicTransmissionLines, syntheticSubstations, transmissionStructures, opgwCables, spliceClosures, fiberAssignments, patchPanels, planningRegions, layers),
    [substations, nodes, transmissionLines, publicTransmissionLines, syntheticSubstations, transmissionStructures, opgwCables, spliceClosures, fiberAssignments, patchPanels, planningRegions, layers],
  );
  const lookup = useMemo(
    () => buildSelectionLookup(substations, nodes, transmissionLines, publicTransmissionLines, syntheticSubstations, transmissionStructures, opgwCables, spliceClosures, fiberAssignments, patchPanels, planningRegions),
    [substations, nodes, transmissionLines, publicTransmissionLines, syntheticSubstations, transmissionStructures, opgwCables, spliceClosures, fiberAssignments, patchPanels, planningRegions],
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
      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
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
    updateSource(mapRef.current, sourceIds.structures, datasets.structures);
    updateSource(mapRef.current, sourceIds.opgwCables, datasets.opgwCables);
    updateSource(mapRef.current, sourceIds.spliceClosures, datasets.spliceClosures);
    updateSource(mapRef.current, sourceIds.fiberAssignments, datasets.fiberAssignments);
    updateSource(mapRef.current, sourceIds.patchPanels, datasets.patchPanels);
    updateSource(mapRef.current, sourceIds.substations, datasets.substations);
    updateSource(mapRef.current, sourceIds.syntheticSubstations, datasets.syntheticSubstations);
    updateSource(mapRef.current, sourceIds.nodes, datasets.nodes);
    updateSource(mapRef.current, sourceIds.workOrders, datasets.workOrders);
  }, [datasets, styleReady]);

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
    const id = String(feature.properties.id || "");
    const kind = String(feature.properties.kind || "");
    const selection = lookupRef.current[`${kind}:${id}`];
    if (!selection) return;
    onSelectRef.current(selection);
    popupRef.current
      ?.setLngLat(event.lngLat)
      .setHTML(renderPopupHtml(feature.properties.label || selection.label, kind, feature.properties.status || "synthetic"))
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
        <span><i className="legend-line" />Public transmission lines</span>
        <span><i className="legend-opgw" />Synthetic OPGW</span>
        <span><i className="legend-structure" />Synthetic structures/splices</span>
        <span><i className="legend-substation" />Synthetic substations</span>
        <span><i className="legend-substation" />Substations</span>
        <span><i className="legend-node" />SEL ICON / telecom</span>
        <span><i className="legend-work-order" />Work orders</span>
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
  map.addSource(sourceIds.opgwCables, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  map.addSource(sourceIds.fiberAssignments, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  [sourceIds.substations, sourceIds.syntheticSubstations, sourceIds.structures, sourceIds.spliceClosures, sourceIds.patchPanels, sourceIds.nodes, sourceIds.workOrders].forEach((sourceId) => {
    map.addSource(sourceId, {
      type: "geojson",
      data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0],
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 8,
    });
  });

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
    paint: { "line-color": "#020708", "line-width": ["match", ["get", "voltageClass"], "735+", 9, "500-734", 8, "345-499", 7, "230-344", 6, "115-229", 5, 4], "line-opacity": 0.72 },
  });
  map.addLayer({
    id: "public-transmission-lines",
    type: "line",
    source: sourceIds.publicLines,
    paint: {
      "line-color": voltageClassColorExpression() as never,
      "line-width": voltageClassWidthExpression() as never,
      "line-opacity": ["match", ["get", "voltageClass"], "unknown", 0.56, 0.84],
      "line-dasharray": ["match", ["get", "voltageClass"], "unknown", ["literal", [2, 2]], ["literal", [1, 0]]],
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
  map.addLayer({
    id: "synthetic-opgw-cables-casing",
    type: "line",
    source: sourceIds.opgwCables,
    paint: { "line-color": "#031012", "line-width": 7.2, "line-opacity": 0.72 },
  });
  map.addLayer({
    id: "synthetic-opgw-cables",
    type: "line",
    source: sourceIds.opgwCables,
    paint: {
      "line-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "#28e6c0"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.2, 10, 4.8],
      "line-opacity": 0.9,
      "line-dasharray": ["literal", [1.6, 1.2]],
    },
  });
  map.addLayer({
    id: "synthetic-fiber-assignments",
    type: "line",
    source: sourceIds.fiberAssignments,
    paint: {
      "line-color": ["match", ["get", "status"], "active", "#6effff", "reserved", "#efc95f", "planned", "#ffd85f", "proposed", "#ff4fd8", "#9bd6ff"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 8],
      "line-opacity": ["match", ["get", "status"], "reserved", 0.82, 0.72],
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5.5, 10, 8.5],
      "circle-color": ["match", ["get", "status"], "proposed", "#ff4fd8", "planned", "#efc95f", "#ffb84d"],
      "circle-stroke-color": "#fff6d4",
      "circle-stroke-width": 1.4,
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

function buildDatasets(
  substations: Substation[],
  nodes: MapNode[],
  transmissionLines: TransmissionLine[],
  publicTransmissionLines: PublicTransmissionLineFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  transmissionStructures: TransmissionStructureFeature[],
  opgwCables: OpgwCableFeature[],
  spliceClosures: SpliceClosureFeature[],
  fiberAssignments: FiberAssignment[],
  patchPanels: PatchPanel[],
  planningRegions: PlanningRegion[],
  layers: Record<StreetMapLayerKey, boolean>,
) {
  const structureById = new Map(transmissionStructures.map((feature) => [feature.properties.id, feature]));
  const cableById = new Map(opgwCables.map((feature) => [feature.properties.id, feature]));
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
        sourceType: feature.properties.sourceType,
        readOnly: true,
        synthetic: false,
        states: feature.properties.states.join(", "),
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
    opgwCables: layers.syntheticOpgwCables ? collection(opgwCables.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "opgw_cable",
        id: feature.properties.id,
        label: feature.properties.cableName,
        status: feature.properties.status,
        fiberCount: feature.properties.fiberCount,
        routeMiles: feature.properties.routeMiles,
        synthetic: true,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    spliceClosures: layers.spliceClosures ? collection(spliceClosures.map((feature) => ({
      type: "Feature",
      properties: {
        kind: "splice_closure",
        id: feature.properties.id,
        label: feature.properties.name,
        status: feature.properties.status,
        closureType: feature.properties.closureType,
        structureNumber: feature.properties.structureNumber,
        spliceCount: feature.properties.spliceCount,
        synthetic: true,
      },
      geometry: feature.geometry,
    }))) : emptyCollection,
    fiberAssignments: layers.fiberAssignments ? collection(fiberAssignments.flatMap((assignment) => {
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
          estimatedLossDb: assignment.estimatedLossDb || 0,
          synthetic: true,
        },
        geometry: coordinates.length === 1
          ? { type: "LineString" as const, coordinates: coordinates[0] }
          : { type: "MultiLineString" as const, coordinates },
      }];
    })) : emptyCollection,
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
  syntheticSubstations: SyntheticSubstationFeature[],
  transmissionStructures: TransmissionStructureFeature[],
  opgwCables: OpgwCableFeature[],
  spliceClosures: SpliceClosureFeature[],
  fiberAssignments: FiberAssignment[],
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
  if (selection.kind === "synthetic_substation") return [selection.record.geometry.coordinates];
  if (selection.kind === "transmission_structure") return [selection.record.geometry.coordinates];
  if (selection.kind === "opgw_cable") return selection.record.geometry.type === "LineString" ? selection.record.geometry.coordinates : selection.record.geometry.coordinates.flat();
  if (selection.kind === "splice_closure") return [selection.record.geometry.coordinates];
  if (selection.kind === "planning_region") return selection.record.geometry.coordinates[0];
  if ("latitude" in selection.record && selection.record.latitude !== undefined && selection.record.longitude !== undefined) {
    return [[selection.record.longitude, selection.record.latitude]];
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

function renderPopupHtml(label: unknown, kind: string, status: unknown) {
  return `<div class="maplibre-popup-card"><strong>${escapeHtml(String(label))}</strong><span>${escapeHtml(kind.replaceAll("_", " "))} / ${escapeHtml(String(status))}</span></div>`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
