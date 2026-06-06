"use client";

import { Layers } from "lucide-react";
import type { StreetMapLayerKey } from "@/lib/types/assets";

type MapLayerControlPanelProps = {
  layers: Record<StreetMapLayerKey, boolean>;
  onLayerChange?: (layer: StreetMapLayerKey, enabled: boolean) => void;
  publicLineCount?: number;
  visiblePublicLineCount?: number;
  publicSubstationCount?: number;
  visiblePublicSubstationCount?: number;
  utilityOwnerCount?: number;
  structureCount?: number;
  spliceClosureCount?: number;
  dataWarnings?: Record<string, string>;
  transmissionLineOwnerCounts?: Array<{ owner: string; count: number }>;
  visibleTransmissionLineOwners?: Record<string, boolean>;
  substationOwnerCounts?: Array<{ owner: string; count: number }>;
  visibleSubstationOwners?: Record<string, boolean>;
  onTransmissionLineOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllTransmissionLineOwnersChange?: (enabled: boolean) => void;
  onSubstationOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllSubstationOwnersChange?: (enabled: boolean) => void;
};

const layerRows: Array<{ key: StreetMapLayerKey; label: string; note: string; badges?: string[] }> = [
  { key: "publicTransmissionLines", label: "HIFLD transmission lines", note: "Public HIFLD line geometry grouped by public OWNER field and explicit line-name owner tokens", badges: ["Public", "Owner buckets"] },
  { key: "publicSubstations", label: "Verified-owner substation nodes", note: "Open-source substation nodes grouped by public source fields or close OSM owner/operator matches", badges: ["Public", "Owner buckets"] },
  { key: "transmissionStructures", label: "Transmission structures", note: "Synthetic demo structure points sampled from public line geometry", badges: ["Synthetic", "Demo"] },
  { key: "spliceClosures", label: "Splice closures", note: "Synthetic demo splice closures mounted on synthetic structures", badges: ["Synthetic", "Demo"] },
];

export function MapLayerControlPanel({
  layers,
  onLayerChange,
  publicLineCount = 0,
  visiblePublicLineCount = publicLineCount,
  publicSubstationCount = 0,
  visiblePublicSubstationCount = publicSubstationCount,
  utilityOwnerCount = 0,
  structureCount = 0,
  spliceClosureCount = 0,
  dataWarnings,
  transmissionLineOwnerCounts = [],
  visibleTransmissionLineOwners = {},
  substationOwnerCounts = [],
  visibleSubstationOwners = {},
  onTransmissionLineOwnerChange,
  onAllTransmissionLineOwnersChange,
  onSubstationOwnerChange,
  onAllSubstationOwnersChange,
}: MapLayerControlPanelProps) {
  const counts: Partial<Record<StreetMapLayerKey, number>> = {
    publicTransmissionLines: publicLineCount,
    publicSubstations: publicSubstationCount,
    transmissionStructures: structureCount,
    spliceClosures: spliceClosureCount,
  };
  const visibleLineOwnerCount = transmissionLineOwnerCounts.filter(({ owner }) => visibleTransmissionLineOwners[owner] !== false).length;
  const visibleSubstationOwnerCount = substationOwnerCounts.filter(({ owner }) => visibleSubstationOwners[owner] !== false).length;
  return (
    <aside className="street-layer-control-panel" aria-label="Street-level layer and drawing controls">
      <div className="street-panel-title"><Layers size={16} />Street Map Layers</div>
      <div className="street-layer-grid">
        {layerRows.map((layer) => (
          <div className={`street-layer-group ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <label className={`street-layer-toggle ${layers[layer.key] ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={layers[layer.key]}
                onChange={(event) => onLayerChange?.(layer.key, event.currentTarget.checked)}
              />
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
            {layer.key === "publicTransmissionLines" && layers.publicTransmissionLines ? (
              <OwnerSublayerList
                title="Transmission owner sublayers"
                visibleCount={visiblePublicLineCount}
                totalCount={publicLineCount}
                visibleOwnerCount={visibleLineOwnerCount}
                totalOwnerCount={transmissionLineOwnerCounts.length}
                ownerCounts={transmissionLineOwnerCounts}
                visibleOwners={visibleTransmissionLineOwners}
                onOwnerChange={onTransmissionLineOwnerChange}
                onAllOwnersChange={onAllTransmissionLineOwnersChange}
              />
            ) : null}
            {layer.key === "publicSubstations" && layers.publicSubstations ? (
              <OwnerSublayerList
                title="Substation owner sublayers"
                visibleCount={visiblePublicSubstationCount}
                totalCount={publicSubstationCount}
                visibleOwnerCount={visibleSubstationOwnerCount}
                totalOwnerCount={substationOwnerCounts.length}
                ownerCounts={substationOwnerCounts}
                visibleOwners={visibleSubstationOwners}
                onOwnerChange={onSubstationOwnerChange}
                onAllOwnersChange={onAllSubstationOwnersChange}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="street-map-todo-note">
        Dashboard map is limited to public HIFLD transmission-line references, verified-owner public substation nodes, close OpenStreetMap owner/operator matches, and synthetic demo transmission structures and splice closures. Utility owner filters use {utilityOwnerCount} public owner buckets; telecom circuits, devices, work orders, OPGW cables, assignments, and patch panels are not rendered here.
      </div>
    </aside>
  );
}

function OwnerSublayerList({
  title,
  visibleCount,
  totalCount,
  visibleOwnerCount,
  totalOwnerCount,
  ownerCounts,
  visibleOwners,
  onOwnerChange,
  onAllOwnersChange,
}: {
  title: string;
  visibleCount: number;
  totalCount: number;
  visibleOwnerCount: number;
  totalOwnerCount: number;
  ownerCounts: Array<{ owner: string; count: number }>;
  visibleOwners: Record<string, boolean>;
  onOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllOwnersChange?: (enabled: boolean) => void;
}) {
  return (
    <div className="street-owner-sublayers" aria-label={title}>
      <div className="street-owner-sublayer-heading">
        <span>
          {title}
          <small>{visibleCount} of {totalCount} assets shown / {visibleOwnerCount} of {totalOwnerCount} owners</small>
        </span>
        <span className="street-owner-sublayer-actions">
          <button type="button" onClick={() => onAllOwnersChange?.(true)}>All</button>
          <button type="button" onClick={() => onAllOwnersChange?.(false)}>None</button>
        </span>
      </div>
      <div className="street-owner-sublayer-list">
        {ownerCounts.map(({ owner, count }) => (
          <label className="street-owner-sublayer-toggle" key={owner}>
            <input
              type="checkbox"
              checked={visibleOwners[owner] !== false}
              onChange={(event) => onOwnerChange?.(owner, event.currentTarget.checked)}
            />
            <span>{owner}</span>
            <em>{count}</em>
          </label>
        ))}
      </div>
    </div>
  );
}

function dataWarningForLayer(layer: StreetMapLayerKey, warnings?: Record<string, string>) {
  if (layer === "publicTransmissionLines") return warnings?.publicLines;
  if (layer === "publicSubstations") return warnings?.publicSubstations;
  if (layer === "transmissionStructures") return warnings?.structures;
  if (layer === "spliceClosures") return warnings?.spliceClosures;
  return "";
}
