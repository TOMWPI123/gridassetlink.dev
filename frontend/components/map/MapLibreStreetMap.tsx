"use client";

import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, type MapLayerMouseEvent, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Coordinate, MapDrawingTool, MapNode, PlanningRegion, StreetMapLayerKey, Substation, TransmissionLine, TransmissionMap } from "@/lib/types/assets";
import type { StreetMapSelection } from "./StreetLevelAssetMap";

type MapCommand =
  | { type: "zoomIn" | "zoomOut" | "fitAll"; sequence: number }
  | { type: "pan"; x: number; y: number; sequence: number };

type FocusRequest = { selection: StreetMapSelection; sequence: number };

type MapLibreStreetMapProps = {
  activeMap: TransmissionMap;
  substations: Substation[];
  nodes: MapNode[];
  transmissionLines: TransmissionLine[];
  planningRegions: PlanningRegion[];
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  command: MapCommand | null;
  focusRequest: FocusRequest | null;
  onMapClick: (coordinate: Coordinate) => void;
  onSelect: (selection: StreetMapSelection) => void;
};

type MapFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry:
    | { type: "Point"; coordinates: Coordinate }
    | { type: "LineString"; coordinates: Coordinate[] }
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
  substations: "regional-substations",
  nodes: "regional-map-nodes",
  workOrders: "regional-work-orders",
};

const clickableLayerIds = [
  "regional-planning-regions-fill",
  "regional-reference-line",
  "regional-transmission-lines",
  "regional-substations",
  "regional-map-nodes",
  "regional-work-orders",
];

const newEnglandBounds: LngLatBoundsLike = [[-73.8, 40.68], [-66.7, 47.55]];

const osmRasterStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const emptyCollection: MapFeatureCollection = { type: "FeatureCollection", features: [] };

export function MapLibreStreetMap({
  activeMap,
  substations,
  nodes,
  transmissionLines,
  planningRegions,
  layers,
  activeTool,
  command,
  focusRequest,
  onMapClick,
  onSelect,
}: MapLibreStreetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const lastFeatureClickRef = useRef(0);
  const onMapClickRef = useRef(onMapClick);
  const onSelectRef = useRef(onSelect);
  const activeToolRef = useRef(activeTool);
  const lookupRef = useRef<Record<string, StreetMapSelection>>({});
  const [styleReady, setStyleReady] = useState(false);

  const datasets = useMemo(
    () => buildDatasets(substations, nodes, transmissionLines, planningRegions, layers),
    [substations, nodes, transmissionLines, planningRegions, layers],
  );
  const lookup = useMemo(() => buildSelectionLookup(substations, nodes, transmissionLines, planningRegions), [substations, nodes, transmissionLines, planningRegions]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onSelectRef.current = onSelect;
    activeToolRef.current = activeTool;
    lookupRef.current = lookup;
  }, [activeTool, lookup, onMapClick, onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: osmRasterStyle,
      center: [-71.6, 42.45],
      zoom: 7.1,
      minZoom: 5.8,
      maxZoom: 18,
      attributionControl: false,
    });

    mapRef.current = map;
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      addPlanningSourcesAndLayers(map);
      setStyleReady(true);
      map.fitBounds(newEnglandBounds, { padding: 34, duration: 0 });
    });

    const handleMapClick = (event: MapMouseEvent) => {
      if (Date.now() - lastFeatureClickRef.current < 120) return;
      onMapClickRef.current([Number(event.lngLat.lng.toFixed(6)), Number(event.lngLat.lat.toFixed(6))]);
    };

    map.on("click", handleMapClick);
    clickableLayerIds.forEach((layerId) => {
      map.on("click", layerId, handleFeatureClick);
      map.on("mouseenter", layerId, () => setCursor(map, "pointer"));
      map.on("mouseleave", layerId, () => setCursor(map, activeToolRef.current === "select" ? "" : "crosshair"));
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!styleReady || !mapRef.current) return;
    updateSource(mapRef.current, sourceIds.regions, datasets.regions);
    updateSource(mapRef.current, sourceIds.reference, datasets.reference);
    updateSource(mapRef.current, sourceIds.lines, datasets.lines);
    updateSource(mapRef.current, sourceIds.substations, datasets.substations);
    updateSource(mapRef.current, sourceIds.nodes, datasets.nodes);
    updateSource(mapRef.current, sourceIds.workOrders, datasets.workOrders);
  }, [datasets, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setCursor(map, activeTool === "select" ? "" : "crosshair");
  }, [activeTool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !command) return;
    if (command.type === "zoomIn") map.zoomIn({ duration: 260 });
    if (command.type === "zoomOut") map.zoomOut({ duration: 260 });
    if (command.type === "fitAll") map.fitBounds(newEnglandBounds, { padding: 46, duration: 420 });
    if (command.type === "pan") map.panBy([command.x, command.y], { duration: 260 });
  }, [command]);

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
    if (!feature?.properties) return;
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

  return (
    <div className="maplibre-street-map" data-testid="street-level-map">
      <div className="maplibre-map-root" ref={containerRef} aria-label={`${activeMap.name} MapLibre street-level planning map`} />
      <div className="maplibre-legend" aria-hidden="true">
        <span><i className="legend-line" />Transmission / fiber paths</span>
        <span><i className="legend-substation" />Substations</span>
        <span><i className="legend-node" />SEL ICON / telecom nodes</span>
        <span><i className="legend-work-order" />Work orders</span>
      </div>
    </div>
  );
}

function addPlanningSourcesAndLayers(map: MapLibreMap) {
  Object.values(sourceIds).forEach((sourceId) => {
    map.addSource(sourceId, { type: "geojson", data: emptyCollection as Parameters<GeoJSONSource["setData"]>[0] });
  });

  map.addLayer({
    id: "regional-planning-regions-fill",
    type: "fill",
    source: sourceIds.regions,
    paint: { "fill-color": "#efc95f", "fill-opacity": 0.16 },
  });
  map.addLayer({
    id: "regional-planning-regions-outline",
    type: "line",
    source: sourceIds.regions,
    paint: { "line-color": "#efc95f", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "regional-reference-line",
    type: "line",
    source: sourceIds.reference,
    paint: { "line-color": "#69d7e4", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.5 },
  });
  map.addLayer({
    id: "regional-transmission-lines-casing",
    type: "line",
    source: sourceIds.lines,
    paint: { "line-color": "#071012", "line-width": 8, "line-opacity": 0.72 },
  });
  map.addLayer({
    id: "regional-transmission-lines",
    type: "line",
    source: sourceIds.lines,
    paint: {
      "line-color": ["match", ["get", "status"], "proposed", "#efc95f", "planned", "#efc95f", "#69d7e4"],
      "line-width": ["match", ["get", "voltageKv"], 345, 5.5, 230, 4.75, 115, 3.75, 3.25],
      "line-opacity": 0.88,
    },
  });
  map.addLayer({
    id: "regional-substations",
    type: "circle",
    source: sourceIds.substations,
    paint: {
      "circle-radius": ["match", ["get", "status"], "proposed", 9, "planned", 8, 8],
      "circle-color": ["match", ["get", "status"], "proposed", "#efc95f", "planned", "#21a67a", "#69d7e4"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "regional-substation-labels",
    type: "symbol",
    source: sourceIds.substations,
    layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" },
    paint: { "text-color": "#f4fbfa", "text-halo-color": "#071012", "text-halo-width": 1.6 },
  });
  map.addLayer({
    id: "regional-map-nodes",
    type: "circle",
    source: sourceIds.nodes,
    paint: {
      "circle-radius": ["match", ["get", "nodeType"], "sel_icon_node", 7.5, "fiber_node", 6.5, "circuit_endpoint", 6, 6],
      "circle-color": ["match", ["get", "nodeType"], "sel_icon_node", "#8b6cf6", "fiber_node", "#21a67a", "circuit_endpoint", "#efc95f", "#7dd3fc"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.6,
    },
  });
  map.addLayer({
    id: "regional-node-labels",
    type: "symbol",
    source: sourceIds.nodes,
    layout: { "text-field": ["get", "label"], "text-size": 10, "text-offset": [0.9, 0.25], "text-anchor": "left" },
    paint: { "text-color": "#f4fbfa", "text-halo-color": "#071012", "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "regional-work-orders",
    type: "circle",
    source: sourceIds.workOrders,
    paint: { "circle-radius": 6, "circle-color": "#f36f63", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.6 },
  });
}

function buildDatasets(
  substations: Substation[],
  nodes: MapNode[],
  transmissionLines: TransmissionLine[],
  planningRegions: PlanningRegion[],
  layers: Record<StreetMapLayerKey, boolean>,
) {
  return {
    regions: layers.planningRegions ? collection(planningRegions.map((region) => ({
      type: "Feature",
      properties: { kind: "planning_region", id: region.id, label: region.name, status: region.status, visibility: region.visibility },
      geometry: region.geometry,
    }))) : emptyCollection,
    reference: layers.isoNeReferenceOverlays ? collection([{
      type: "Feature",
      properties: { kind: "reference", id: "iso-ne-public-context", label: "ISO-NE public reference context", status: "public_reference" },
      geometry: { type: "LineString", coordinates: [[-73.2, 41.1], [-72.55, 42.25], [-71.6, 43.05], [-70.9, 43.8], [-69.7, 44.4]] },
    }]) : emptyCollection,
    lines: collection(transmissionLines.filter((line) => lineVisibleForLayers(line, layers)).map((line) => ({
      type: "Feature",
      properties: { kind: "transmission_line", id: line.id, label: line.name, status: line.status, voltageKv: line.voltageKv || 0, circuitId: line.circuitId || "" },
      geometry: line.geometry,
    }))),
    substations: collection(substations.filter((substation) => layers.substations && hasCoordinates(substation)).map((substation) => ({
      type: "Feature",
      properties: { kind: "substation", id: substation.id, label: substation.abbreviation || substation.name, status: substation.status, visibility: substation.visibility, voltageKv: substation.voltageKv?.[0] || 0 },
      geometry: { type: "Point", coordinates: [substation.longitude as number, substation.latitude as number] },
    }))),
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

function buildSelectionLookup(substations: Substation[], nodes: MapNode[], transmissionLines: TransmissionLine[], planningRegions: PlanningRegion[]) {
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
  if (node.status === "proposed") return layers.proposedChanges;
  return layers.telecomNodes;
}

function lineVisibleForLayers(line: TransmissionLine, layers: Record<StreetMapLayerKey, boolean>) {
  if (line.status === "proposed" && !layers.proposedChanges) return false;
  if (line.nodeParameters?.planningUse === "Assumed OPGW corridor candidate") return layers.transmissionLines || layers.opgwRoutes;
  return layers.transmissionLines || layers.fiberRoutes;
}

function selectionCoordinates(selection: StreetMapSelection): Coordinate[] {
  if (selection.kind === "transmission_line") return selection.record.geometry.coordinates;
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
