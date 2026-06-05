"use client";

import dynamic from "next/dynamic";
import { Crosshair, MapPinned } from "lucide-react";
import type { Coordinate, MapDrawingTool, MapNode, PlanningRegion, StreetMapLayerKey, Substation, TransmissionLine, TransmissionMap } from "@/lib/types/assets";

export type StreetMapSelection =
  | { kind: "substation"; id: string; label: string; record: Substation }
  | { kind: "node"; id: string; label: string; record: MapNode }
  | { kind: "transmission_line"; id: string; label: string; record: TransmissionLine }
  | { kind: "planning_region"; id: string; label: string; record: PlanningRegion }
  | { kind: "work_order"; id: string; label: string; record: MapNode };

export type MapCommand =
  | { type: "zoomIn" | "zoomOut" | "resetIsoNe" | "fitActiveMap" | "resize"; sequence: number }
  | { type: "pan"; x: number; y: number; sequence: number };

export type FocusRequest = { selection: StreetMapSelection; sequence: number };

type StreetLevelAssetMapProps = {
  activeMap: TransmissionMap;
  substations: Substation[];
  nodes: MapNode[];
  transmissionLines: TransmissionLine[];
  planningRegions: PlanningRegion[];
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  placementHint?: string;
  command: MapCommand | null;
  focusRequest: FocusRequest | null;
  onMapClick: (coordinate: Coordinate) => void;
  onSelect: (selection: StreetMapSelection) => void;
  onStatusChange: (status: "loading" | "active" | "error", message?: string) => void;
};

const MapLibreStreetMap = dynamic(() => import("./MapLibreStreetMap").then((module) => module.MapLibreStreetMap), {
  ssr: false,
  loading: () => <div className="maplibre-loading">Loading MapLibre planning map...</div>,
});

export function StreetLevelAssetMap({
  activeMap,
  substations,
  nodes,
  transmissionLines,
  planningRegions,
  layers,
  activeTool,
  placementHint,
  command,
  focusRequest,
  onMapClick,
  onSelect,
  onStatusChange,
}: StreetLevelAssetMapProps) {
  return (
    <section className="street-map-panel street-map-panel-fullscreen" aria-label="Street-level asset map">
      <div className={`street-map-canvas-shell tool-${activeTool}`}>
        <MapLibreStreetMap
          activeMap={activeMap}
          substations={substations}
          nodes={nodes}
          transmissionLines={transmissionLines}
          planningRegions={planningRegions}
          layers={layers}
          activeTool={activeTool}
          command={command}
          focusRequest={focusRequest}
          onMapClick={onMapClick}
          onSelect={onSelect}
          onStatusChange={onStatusChange}
        />
        {activeTool !== "select" ? <div className="street-map-crosshair"><Crosshair size={18} /></div> : null}
        <div className="street-map-placement-hint">
          <MapPinned size={15} />
          <span>{placementHint || toolHint(activeTool)}</span>
        </div>
      </div>
    </section>
  );
}

function toolHint(activeTool: MapDrawingTool) {
  if (activeTool === "add_substation") return "Click the MapLibre street map to add a substation point.";
  if (activeTool === "add_device_node") return "Click the map to add the selected asset type.";
  if (activeTool === "add_fiber_node") return "Click the map to add a fiber node point.";
  if (activeTool === "place_missing") return "Click the map to place the selected missing-location asset.";
  if (activeTool.startsWith("draw_") || activeTool.includes("geometry")) return "Line and polygon drawing are staged for the next implementation pass.";
  return "Pan, zoom, search, or click assets to inspect linked records.";
}
