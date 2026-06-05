"use client";

import { Crosshair, Edit3, Layers, MapPin, Pentagon, Route, Trash2 } from "lucide-react";
import type { MapDrawingTool, StreetMapLayerKey } from "@/lib/types/assets";

type MapLayerControlPanelProps = {
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  onToggleLayer: (layer: StreetMapLayerKey) => void;
  onToolChange: (tool: MapDrawingTool) => void;
};

const layerRows: Array<{ key: StreetMapLayerKey; label: string; note: string }> = [
  { key: "transmissionLines", label: "Transmission lines", note: "Editable line layer" },
  { key: "substations", label: "Substations", note: "Lat/lon point features" },
  { key: "telecomNodes", label: "Telecom nodes", note: "Routers, RTUs, OTN" },
  { key: "selIconNodes", label: "SEL ICON nodes", note: "ICON provisioning points" },
  { key: "c3794Nodes", label: "C37.94 nodes", note: "Circuit endpoints" },
  { key: "fiberRoutes", label: "Fiber routes", note: "Fiber/circuit paths" },
  { key: "opgwRoutes", label: "OPGW routes", note: "Assumed/planned OPGW" },
  { key: "distributionFiberRoutes", label: "Distribution fiber", note: "Distribution and ADSS" },
  { key: "circuitEndpoints", label: "Circuit endpoints", note: "Protection/SCADA endpoints" },
  { key: "workOrderLocations", label: "Work orders", note: "Field task locations" },
  { key: "proposedChanges", label: "Proposed changes", note: "Staged changes" },
  { key: "missingLocationAssets", label: "Missing-location assets", note: "Records awaiting lat/lon" },
  { key: "planningRegions", label: "Planning regions", note: "Polygon overlays" },
  { key: "isoNeReferenceOverlays", label: "ISO-NE overlays", note: "Public reference annotations" },
];

const drawingTools: Array<{ key: MapDrawingTool; label: string; Icon: typeof MapPin; implemented: boolean }> = [
  { key: "select", label: "Select", Icon: Crosshair, implemented: true },
  { key: "add_substation", label: "Add substation point", Icon: MapPin, implemented: true },
  { key: "add_device_node", label: "Add device node point", Icon: MapPin, implemented: true },
  { key: "add_fiber_node", label: "Add fiber node point", Icon: MapPin, implemented: true },
  { key: "draw_transmission_line", label: "Draw transmission line", Icon: Route, implemented: false },
  { key: "draw_fiber_path", label: "Draw fiber/circuit path", Icon: Route, implemented: false },
  { key: "draw_planning_polygon", label: "Draw planning polygon", Icon: Pentagon, implemented: false },
  { key: "edit_geometry", label: "Edit geometry", Icon: Edit3, implemented: false },
  { key: "delete_geometry", label: "Delete geometry", Icon: Trash2, implemented: false },
];

export function MapLayerControlPanel({ layers, activeTool, onToggleLayer, onToolChange }: MapLayerControlPanelProps) {
  return (
    <aside className="street-layer-control-panel" aria-label="Street-level layer and drawing controls">
      <div className="street-panel-title"><Layers size={16} />Street Map Layers</div>
      <div className="street-layer-grid">
        {layerRows.map((layer) => (
          <label className={`street-layer-toggle ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <input type="checkbox" checked={layers[layer.key]} onChange={() => onToggleLayer(layer.key)} />
            <span>
              <strong>{layer.label}</strong>
              <small>{layer.note}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="street-panel-title map-tool-title"><Edit3 size={16} />Drawing Tools</div>
      <div className="street-tool-grid">
        {drawingTools.map(({ key, label, Icon, implemented }) => (
          <button className={activeTool === key ? "active" : ""} type="button" key={key} onClick={() => onToolChange(key)}>
            <Icon size={14} />
            <span>{label}</span>
            {!implemented ? <small>TODO</small> : null}
          </button>
        ))}
      </div>
      <div className="street-map-todo-note">
        Advanced line, polygon, snapping, and geometry editing are scoped as clean follow-up TODOs. This MVP implements click-to-add point placement first.
      </div>
    </aside>
  );
}
