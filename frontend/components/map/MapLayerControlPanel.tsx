"use client";

import { Layers } from "lucide-react";
import type { StreetMapLayerKey } from "@/lib/types/assets";

type MapLayerControlPanelProps = {
  layers: Record<StreetMapLayerKey, boolean>;
  publicLineCount?: number;
  dataWarnings?: Record<string, string>;
};

const layerRows: Array<{ key: StreetMapLayerKey; label: string; note: string; badges?: string[] }> = [
  { key: "publicTransmissionLines", label: "HIFLD transmission lines", note: "Public HIFLD reference geometry only", badges: ["Public", "Read-only"] },
];

export function MapLayerControlPanel({ layers, publicLineCount = 0, dataWarnings }: MapLayerControlPanelProps) {
  const counts: Partial<Record<StreetMapLayerKey, number>> = {
    publicTransmissionLines: publicLineCount,
  };
  return (
    <aside className="street-layer-control-panel" aria-label="Street-level layer and drawing controls">
      <div className="street-panel-title"><Layers size={16} />Street Map Layers</div>
      <div className="street-layer-grid">
        {layerRows.map((layer) => (
          <label className={`street-layer-toggle ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <input type="checkbox" checked={layers[layer.key]} readOnly />
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
      <div className="street-map-todo-note">
        Dashboard map is locked to public HIFLD transmission-line geometry. Synthetic OPGW, splicing, circuits, devices, work orders, and planning overlays are not rendered here.
      </div>
    </aside>
  );
}

function dataWarningForLayer(layer: StreetMapLayerKey, warnings?: Record<string, string>) {
  if (layer === "publicTransmissionLines") return warnings?.publicLines;
  return "";
}
