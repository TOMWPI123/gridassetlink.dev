"use client";

import dynamic from "next/dynamic";
import { Crosshair, LocateFixed, MapPinned, Minus, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Coordinate, MapDrawingTool, MapNode, PlanningRegion, StreetMapLayerKey, Substation, TransmissionLine, TransmissionMap } from "@/lib/types/assets";

export type StreetMapSelection =
  | { kind: "substation"; id: string; label: string; record: Substation }
  | { kind: "node"; id: string; label: string; record: MapNode }
  | { kind: "transmission_line"; id: string; label: string; record: TransmissionLine }
  | { kind: "planning_region"; id: string; label: string; record: PlanningRegion }
  | { kind: "work_order"; id: string; label: string; record: MapNode };

type MapCommand =
  | { type: "zoomIn" | "zoomOut" | "fitAll"; sequence: number }
  | { type: "pan"; x: number; y: number; sequence: number };

type FocusRequest = { selection: StreetMapSelection; sequence: number };

type StreetLevelAssetMapProps = {
  activeMap: TransmissionMap;
  substations: Substation[];
  nodes: MapNode[];
  transmissionLines: TransmissionLine[];
  planningRegions: PlanningRegion[];
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  placementHint?: string;
  onMapClick: (coordinate: Coordinate) => void;
  onSelect: (selection: StreetMapSelection) => void;
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
  onMapClick,
  onSelect,
}: StreetLevelAssetMapProps) {
  const [search, setSearch] = useState("");
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const selectableAssets = useMemo(() => buildSearchResults(substations, nodes, transmissionLines, search), [substations, nodes, transmissionLines, search]);

  function zoom(type: "zoomIn" | "zoomOut") {
    setMapCommand({ type, sequence: Date.now() });
  }

  function pan(x: number, y: number) {
    setMapCommand({ type: "pan", x, y, sequence: Date.now() });
  }

  function fitAll() {
    setMapCommand({ type: "fitAll", sequence: Date.now() });
  }

  function fitSelection(selection: StreetMapSelection) {
    setFocusRequest({ selection, sequence: Date.now() });
    onSelect(selection);
  }

  return (
    <section className="street-map-panel" aria-label="Street-level asset map">
      <div className="street-map-header">
        <div>
          <strong>Street-Level Asset Map</strong>
          <span>{activeMap.name} / {activeMap.region} / {activeMap.visibility} / MapLibre</span>
        </div>
        <div className="street-map-actions">
          <button className="telecom-map-icon-button" type="button" onClick={() => zoom("zoomIn")} title="Zoom in"><Plus size={15} /></button>
          <button className="telecom-map-icon-button" type="button" onClick={() => zoom("zoomOut")} title="Zoom out"><Minus size={15} /></button>
          <button className="telecom-map-button" type="button" onClick={fitAll}><LocateFixed size={15} />New England</button>
        </div>
      </div>

      <div className="street-map-search-row">
        <label className="street-map-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, ID, substation, node, circuit, or device" />
        </label>
        {search ? (
          <div className="street-map-search-results">
            {selectableAssets.slice(0, 7).map((asset) => (
              <button type="button" key={`${asset.kind}-${asset.id}`} onClick={() => fitSelection(asset)}>
                <strong>{asset.label}</strong>
                <span>{asset.kind}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`street-map-canvas-shell tool-${activeTool}`}>
        <MapLibreStreetMap
          activeMap={activeMap}
          substations={substations}
          nodes={nodes}
          transmissionLines={transmissionLines}
          planningRegions={planningRegions}
          layers={layers}
          activeTool={activeTool}
          command={mapCommand}
          focusRequest={focusRequest}
          onMapClick={onMapClick}
          onSelect={onSelect}
        />
        <div className="street-map-crosshair"><Crosshair size={18} /></div>
        <div className="street-map-placement-hint">
          <MapPinned size={15} />
          <span>{placementHint || toolHint(activeTool)}</span>
        </div>
        <div className="street-map-pan-pad" aria-label="Pan controls">
          <button type="button" onClick={() => pan(0, -90)}>N</button>
          <button type="button" onClick={() => pan(-90, 0)}>W</button>
          <button type="button" onClick={() => pan(90, 0)}>E</button>
          <button type="button" onClick={() => pan(0, 90)}>S</button>
        </div>
      </div>
    </section>
  );
}

function buildSearchResults(substations: Substation[], nodes: MapNode[], lines: TransmissionLine[], query: string): StreetMapSelection[] {
  const all: StreetMapSelection[] = [
    ...substations.map((record) => ({ kind: "substation" as const, id: record.id, label: record.name, record })),
    ...nodes.map((record) => ({ kind: "node" as const, id: record.id, label: record.name, record })),
    ...lines.map((record) => ({ kind: "transmission_line" as const, id: record.id, label: record.name, record })),
  ];
  const lowered = query.trim().toLowerCase();
  if (!lowered) return all;
  return all.filter((asset) => JSON.stringify(asset.record).toLowerCase().includes(lowered));
}

function toolHint(activeTool: MapDrawingTool) {
  if (activeTool === "add_substation") return "Click the MapLibre street map to add a substation point.";
  if (activeTool === "add_device_node") return "Click the map to add a device node point.";
  if (activeTool === "add_fiber_node") return "Click the map to add a fiber node point.";
  if (activeTool === "place_missing") return "Click the map to place the selected missing-location asset.";
  if (activeTool.startsWith("draw_") || activeTool.includes("geometry")) return "This drawing tool is staged for a follow-up implementation.";
  return "Pan, zoom, search, or click assets to inspect linked records.";
}
