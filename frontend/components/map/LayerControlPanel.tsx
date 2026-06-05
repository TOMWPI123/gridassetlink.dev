"use client";

import { Compass, Layers, LocateFixed, Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

export type TelecomMapLayerKey =
  | "substations"
  | "telecomNodes"
  | "fiberRoutes"
  | "telecomCircuits"
  | "microwavePaths"
  | "workOrders"
  | "proposedChanges";

export type TelecomMapViewMode = "current" | "proposed" | "difference";

type LayerControlPanelProps = {
  layers: Record<TelecomMapLayerKey, boolean>;
  markerScale: number;
  viewMode: TelecomMapViewMode;
  onLayerToggle: (layer: TelecomMapLayerKey) => void;
  onMarkerScaleChange: (scale: number) => void;
  onViewModeChange: (mode: TelecomMapViewMode) => void;
  onResetView: () => void;
};

const layerLabels: Array<{ key: TelecomMapLayerKey; label: string; swatch: string; description: string }> = [
  { key: "substations", label: "Substations", swatch: "cyan", description: "Public planning reference sites" },
  { key: "telecomNodes", label: "Telecom Nodes", swatch: "green", description: "SEL ICON, routers, OTN, RTU, power" },
  { key: "fiberRoutes", label: "Fiber Routes", swatch: "teal", description: "OPGW, ADSS, leased, distribution" },
  { key: "telecomCircuits", label: "Circuits", swatch: "violet", description: "Protection, SCADA, Ethernet, timing" },
  { key: "microwavePaths", label: "Microwave", swatch: "blue", description: "Licensed path placeholders" },
  { key: "workOrders", label: "Work Orders", swatch: "red", description: "Field and commissioning tasks" },
  { key: "proposedChanges", label: "Proposed", swatch: "amber", description: "Staged engineering changes" },
];

const viewModes: Array<{ key: TelecomMapViewMode; label: string }> = [
  { key: "current", label: "Current" },
  { key: "proposed", label: "Proposed" },
  { key: "difference", label: "Diff" },
];

export function LayerControlPanel({
  layers,
  markerScale,
  viewMode,
  onLayerToggle,
  onMarkerScaleChange,
  onViewModeChange,
  onResetView,
}: LayerControlPanelProps) {
  return (
    <aside className="telecom-layer-panel" aria-label="Layer controls">
      <div className="telecom-panel-heading compact">
        <div>
          <strong>Layer Controls</strong>
          <span>Actual / planned / proposed</span>
        </div>
        <Layers size={18} />
      </div>

      <div className="telecom-view-mode" role="group" aria-label="Map view mode">
        {viewModes.map((mode) => (
          <button className={viewMode === mode.key ? "active" : ""} type="button" key={mode.key} onClick={() => onViewModeChange(mode.key)}>
            {mode.label}
          </button>
        ))}
      </div>

      <div className="telecom-layer-list">
        {layerLabels.map((layer) => (
          <label className={`telecom-layer-row ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <input type="checkbox" checked={layers[layer.key]} onChange={() => onLayerToggle(layer.key)} />
            <span className={`telecom-layer-swatch ${layer.swatch}`} aria-hidden="true" />
            <span>
              <strong>{layer.label}</strong>
              <small>{layer.description}</small>
            </span>
          </label>
        ))}
      </div>

      <div className="telecom-scale-control">
        <div className="telecom-filter-title"><SlidersHorizontal size={14} />Marker Scale</div>
        <div className="telecom-scale-buttons">
          <button className="telecom-map-icon-button" type="button" onClick={() => onMarkerScaleChange(Math.max(0.72, markerScale - 0.08))} title="Decrease marker size"><Minus size={14} /></button>
          <input
            type="range"
            min="0.72"
            max="1.52"
            step="0.04"
            value={markerScale}
            onChange={(event) => onMarkerScaleChange(Number(event.target.value))}
            aria-label="Marker scale"
          />
          <button className="telecom-map-icon-button" type="button" onClick={() => onMarkerScaleChange(Math.min(1.52, markerScale + 0.08))} title="Increase marker size"><Plus size={14} /></button>
        </div>
      </div>

      <div className="telecom-layer-actions">
        <button className="telecom-map-button" type="button" onClick={onResetView}><LocateFixed size={15} />Zoom NE</button>
        <button className="telecom-map-button" type="button" onClick={() => onMarkerScaleChange(1)}><RotateCcw size={15} />Reset</button>
      </div>

      <div className="telecom-map-note">
        <Compass size={15} />
        <span>All telecom topology in this demo is synthetic, assumed, proposed, or user-verifiable planning data.</span>
      </div>
    </aside>
  );
}
