"use client";

import { Link2 } from "lucide-react";
import type { StreetMapSelection } from "@/components/map/StreetLevelAssetMap";

type LinkedAssetDetailPanelProps = {
  selection: StreetMapSelection | null;
};

export function LinkedAssetDetailPanel({ selection }: LinkedAssetDetailPanelProps) {
  if (!selection) {
    return (
      <section className="linked-asset-detail-panel" aria-label="Linked asset detail panel">
        <div className="street-panel-title"><Link2 size={16} />Asset Detail Panel</div>
        <p>Select a street-level asset, diagram annotation, transmission line, substation, node, or work order marker to inspect linked planning fields.</p>
      </section>
    );
  }

  const record = selection.record as Record<string, unknown>;
  const entries = Object.entries(record).filter(([key]) => !["nodeParameters", "geometry"].includes(key)).slice(0, 14);
  const nodeParameters = "nodeParameters" in record ? record.nodeParameters as Record<string, unknown> | undefined : undefined;

  return (
    <section className="linked-asset-detail-panel" aria-label="Linked asset detail panel">
      <div className="street-panel-title"><Link2 size={16} />Asset Detail Panel</div>
      <div className="linked-asset-heading">
        <span>{selection.kind.replaceAll("_", " ")}</span>
        <strong>{selection.label}</strong>
      </div>
      <div className="linked-asset-fields">
        {entries.map(([key, value]) => (
          <div key={key}>
            <span>{formatLabel(key)}</span>
            <strong>{formatValue(value)}</strong>
          </div>
        ))}
      </div>
      {nodeParameters ? (
        <details className="node-parameter-json">
          <summary>Node parameters</summary>
          <pre>{JSON.stringify(nodeParameters, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}

function formatLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "-");
}
