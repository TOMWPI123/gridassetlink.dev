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

  const record = detailRecordForSelection(selection);
  const entries = Object.entries(record).filter(([key]) => !["nodeParameters", "geometry"].includes(key)).slice(0, 22);
  const nodeParameters = "nodeParameters" in record ? record.nodeParameters as Record<string, unknown> | undefined : undefined;
  const badges = detailBadgesForSelection(selection);
  const notice = detailNoticeForSelection(selection);

  return (
    <section className="linked-asset-detail-panel" aria-label="Linked asset detail panel">
      <div className="street-panel-title"><Link2 size={16} />Asset Detail Panel</div>
      <div className="linked-asset-heading">
        <span>{selection.kind.replaceAll("_", " ")}</span>
        <strong>{selection.label}</strong>
        {badges.length ? (
          <div className="linked-asset-badges">
            {badges.map((badge) => <b key={badge}>{badge}</b>)}
          </div>
        ) : null}
      </div>
      {notice ? <p className="linked-asset-notice">{notice}</p> : null}
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
      {selection.kind === "synthetic_substation" ? (
        <div className="linked-asset-actions">
          <button type="button">Create synthetic telecom node</button>
          <button type="button">Create synthetic fiber route</button>
          <button type="button">Create circuit endpoint</button>
          <button type="button">Create work order</button>
        </div>
      ) : null}
    </section>
  );
}

function detailRecordForSelection(selection: StreetMapSelection): Record<string, unknown> {
  if (selection.kind === "public_transmission_line") {
    return {
      ...selection.record.properties,
      geometryType: selection.record.geometry.type,
    };
  }
  if (selection.kind === "synthetic_substation") {
    return selection.record.properties as unknown as Record<string, unknown>;
  }
  return selection.record as Record<string, unknown>;
}

function detailBadgesForSelection(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return ["Public", "Read-only"];
  if (selection.kind === "synthetic_substation") return ["Synthetic", "Demo", "Private"];
  return [];
}

function detailNoticeForSelection(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return "Public transmission line reference geometry. Read-only and not for operations.";
  if (selection.kind === "synthetic_substation") return "Synthetic demo/planning substation. Not a real utility asset.";
  return "";
}

function formatLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "-");
}
