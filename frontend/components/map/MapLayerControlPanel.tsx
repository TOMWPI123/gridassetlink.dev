"use client";

import { Crosshair, Edit3, Layers, MapPin, Pentagon, Route, Trash2 } from "lucide-react";
import type { MapDrawingTool, StreetMapLayerKey } from "@/lib/types/assets";

type MapLayerControlPanelProps = {
  layers: Record<StreetMapLayerKey, boolean>;
  activeTool: MapDrawingTool;
  publicLineCount?: number;
  syntheticSubstationCount?: number;
  structureCount?: number;
  opgwCableCount?: number;
  spliceClosureCount?: number;
  fiberAssignmentCount?: number;
  patchPanelCount?: number;
  dataWarnings?: Record<string, string>;
  onToggleLayer: (layer: StreetMapLayerKey) => void;
  onToolChange: (tool: MapDrawingTool) => void;
};

const layerRows: Array<{ key: StreetMapLayerKey; label: string; note: string; badges?: string[] }> = [
  { key: "publicTransmissionLines", label: "Public transmission lines", note: "HIFLD public reference", badges: ["Public", "Read-only"] },
  { key: "transmissionStructures", label: "Transmission structures", note: "Synthetic numbered structures", badges: ["Synthetic", "Demo"] },
  { key: "syntheticOpgwCables", label: "OPGW cables", note: "Synthetic OPGW planning routes", badges: ["Synthetic", "Demo"] },
  { key: "spliceClosures", label: "Splice closures", note: "Synthetic closure points", badges: ["Synthetic", "Demo"] },
  { key: "fiberAssignments", label: "Fiber assignments", note: "Synthetic planned/active routes", badges: ["Synthetic", "Demo"] },
  { key: "patchPanels", label: "Patch panels", note: "Synthetic terminal panels", badges: ["Synthetic", "Demo"] },
  { key: "syntheticSubstations", label: "Synthetic substations", note: "100 demo planning points", badges: ["Synthetic", "Private"] },
  { key: "telecomNodes", label: "Synthetic telecom nodes", note: "Routers, RTUs, OTN", badges: ["Synthetic", "Private"] },
  { key: "fiberRoutes", label: "Synthetic fiber routes", note: "Fiber/circuit paths", badges: ["Synthetic", "Private"] },
  { key: "circuitEndpoints", label: "Synthetic circuits", note: "Protection/SCADA endpoints", badges: ["Synthetic", "Private"] },
  { key: "workOrderLocations", label: "Synthetic work orders", note: "Field task locations", badges: ["Synthetic", "Private"] },
  { key: "proposedChanges", label: "Proposed synthetic changes", note: "Staged changes", badges: ["Synthetic", "Private"] },
  { key: "missingLocationAssets", label: "Missing-location assets", note: "Records awaiting lat/lon", badges: ["Private"] },
  { key: "transmissionLines", label: "Private transmission lines", note: "Editable planning layer", badges: ["Synthetic", "Private"] },
  { key: "substations", label: "Private substations", note: "Lat/lon point features", badges: ["Synthetic", "Private"] },
  { key: "selIconNodes", label: "SEL ICON nodes", note: "ICON provisioning points", badges: ["Synthetic", "Private"] },
  { key: "c3794Nodes", label: "C37.94 nodes", note: "Circuit endpoints", badges: ["Synthetic", "Private"] },
  { key: "opgwRoutes", label: "OPGW routes", note: "Assumed/planned OPGW", badges: ["Assumed", "Private"] },
  { key: "distributionFiberRoutes", label: "Distribution fiber", note: "Distribution and ADSS", badges: ["Synthetic", "Private"] },
  { key: "planningRegions", label: "Planning regions", note: "Polygon overlays", badges: ["Private"] },
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

export function MapLayerControlPanel({ layers, activeTool, publicLineCount = 0, syntheticSubstationCount = 0, structureCount = 0, opgwCableCount = 0, spliceClosureCount = 0, fiberAssignmentCount = 0, patchPanelCount = 0, dataWarnings, onToggleLayer, onToolChange }: MapLayerControlPanelProps) {
  const counts: Partial<Record<StreetMapLayerKey, number>> = {
    publicTransmissionLines: publicLineCount,
    syntheticSubstations: syntheticSubstationCount,
    transmissionStructures: structureCount,
    syntheticOpgwCables: opgwCableCount,
    spliceClosures: spliceClosureCount,
    fiberAssignments: fiberAssignmentCount,
    patchPanels: patchPanelCount,
  };
  return (
    <aside className="street-layer-control-panel" aria-label="Street-level layer and drawing controls">
      <div className="street-panel-title"><Layers size={16} />Street Map Layers</div>
      <div className="street-layer-grid">
        {layerRows.map((layer) => (
          <label className={`street-layer-toggle ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <input type="checkbox" checked={layers[layer.key]} onChange={() => onToggleLayer(layer.key)} />
            <span>
              <strong>
                {layer.label}
                {counts[layer.key] !== undefined ? <em>{counts[layer.key]}</em> : null}
              </strong>
              <small>{dataWarningForLayer(layer.key, dataWarnings) || layer.note}</small>
              {layer.badges?.length ? (
                <span className="street-layer-badges">
                  {layer.badges.map((badge) => <b key={badge}>{badge}</b>)}
                </span>
              ) : null}
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

function dataWarningForLayer(layer: StreetMapLayerKey, warnings?: Record<string, string>) {
  if (layer === "publicTransmissionLines") return warnings?.publicLines;
  if (layer === "syntheticSubstations") return warnings?.syntheticSubstations;
  if (layer === "transmissionStructures") return warnings?.structures;
  if (layer === "syntheticOpgwCables") return warnings?.opgw;
  if (layer === "spliceClosures") return warnings?.spliceClosures;
  if (layer === "fiberAssignments") return warnings?.assignments;
  if (layer === "patchPanels") return warnings?.patchPanels;
  return "";
}
