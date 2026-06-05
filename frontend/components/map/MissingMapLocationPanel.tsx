"use client";

import { LocateFixed } from "lucide-react";
import type { MapNode, Substation } from "@/lib/types/assets";

type MissingMapLocation =
  | { type: "substation"; id: string; label: string; record: Substation }
  | { type: "node"; id: string; label: string; record: MapNode };

type MissingMapLocationPanelProps = {
  substations: Substation[];
  nodes: MapNode[];
  placementTargetId?: string;
  onPlaceMissing: (item: MissingMapLocation) => void;
};

export function MissingMapLocationPanel({ substations, nodes, placementTargetId, onPlaceMissing }: MissingMapLocationPanelProps) {
  const missing: MissingMapLocation[] = [
    ...substations
      .filter((substation) => substation.latitude === undefined || substation.longitude === undefined)
      .map((substation) => ({ type: "substation" as const, id: substation.id, label: substation.name, record: substation })),
    ...nodes
      .filter((node) => node.latitude === undefined || node.longitude === undefined)
      .map((node) => ({ type: "node" as const, id: node.id, label: node.name, record: node })),
  ];

  return (
    <section className="missing-location-panel" aria-label="Missing map location panel">
      <div className="street-panel-title"><LocateFixed size={16} />Missing map location <span>{missing.length}</span></div>
      {missing.length ? (
        <div className="missing-location-list">
          {missing.map((item) => (
            <button className={placementTargetId === item.id ? "active" : ""} type="button" key={`${item.type}-${item.id}`} onClick={() => onPlaceMissing(item)}>
              <strong>{item.label}</strong>
              <span>{item.type} / click, then choose a street-level point</span>
            </button>
          ))}
        </div>
      ) : <p>All editable substations and nodes have lat/lon coordinates.</p>}
    </section>
  );
}

export type { MissingMapLocation };
