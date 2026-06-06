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
      {selection.kind === "synthetic_substation" || selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "splice_closure" ? (
        <div className="linked-asset-actions">
          <button type="button">Add splice closure</button>
          <button type="button">Add patch panel</button>
          <button type="button">Start fiber assignment</button>
          <button type="button">Add proposed change</button>
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
  if (selection.kind === "public_substation") {
    return {
      ...selection.record.properties,
      longitude: selection.record.geometry.coordinates[0],
      latitude: selection.record.geometry.coordinates[1],
      geometryType: selection.record.geometry.type,
    };
  }
  if (selection.kind === "fcc_utility_tower") {
    return {
      ...selection.record.properties,
      longitude: selection.record.geometry.coordinates[0],
      latitude: selection.record.geometry.coordinates[1],
      geometryType: selection.record.geometry.type,
    };
  }
  if (selection.kind === "fcc_microwave_link") {
    return {
      ...selection.record.properties,
      pathFrequencyBand: fccFrequencyBandLabel(selection.record.properties.frequencyAssignedMhz),
      geometryType: selection.record.geometry.type,
    };
  }
  if (selection.kind === "synthetic_substation") {
    return selection.record.properties as unknown as Record<string, unknown>;
  }
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "splice_closure") {
    return {
      ...selection.record.properties,
      geometryType: selection.record.geometry.type,
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "fiber_assignment" || selection.kind === "patch_panel") {
    return selection.record as unknown as Record<string, unknown>;
  }
  return selection.record as Record<string, unknown>;
}

function detailBadgesForSelection(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return ["Public", "Read-only"];
  if (selection.kind === "public_substation") return ["Public", "Read-only", "Owner bucket"];
  if (selection.kind === "fcc_utility_tower") return ["Public FCC", "Utility licensee", "Read-only"];
  if (selection.kind === "fcc_microwave_link") return ["Public FCC", "Microwave path", "Read-only"];
  if (selection.kind === "synthetic_substation") return ["Synthetic", "Demo", "Private"];
  if (selection.kind === "transmission_structure") return ["Synthetic structure", "Demo"];
  if (selection.kind === "opgw_cable") return ["Synthetic OPGW", "Demo"];
  if (selection.kind === "splice_closure") return ["Synthetic splice", "Demo"];
  if (selection.kind === "fiber_assignment") return ["Synthetic assignment", "Demo"];
  if (selection.kind === "patch_panel") return ["Synthetic panel", "Demo"];
  return [];
}

function detailNoticeForSelection(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return "Public transmission line reference geometry. Owner bucket is based on the public HIFLD OWNER field when present, then a close OpenStreetMap power-line owner/operator tag match with compatible voltage, then explicit utility owner tokens in the public line name. Unsupported records stay Unknown public owner. Read-only and not for operations.";
  if (selection.kind === "public_substation") return "Public substation reference point. Utility owner is from an open public field when available, then a close OpenStreetMap operator/owner tag match. Unknown-owner records are excluded from the displayed public substation layer.";
  if (selection.kind === "fcc_utility_tower") return "Public FCC ULS microwave site/tower reference. Included only when the public licensee name matches a utility-owner pattern and the coordinates are inside the ISO New England map bounds. Not an operational telecom inventory.";
  if (selection.kind === "fcc_microwave_link") return "Public FCC ULS microwave path reference. Endpoint, frequency, EIRP, path, and owner fields come from public FCC license tables only. Do not treat this as private utility routing or an operational circuit.";
  if (selection.kind === "synthetic_substation") return "Synthetic demo/planning substation. Not a real utility asset.";
  if (selection.kind === "transmission_structure") return "Synthetic transmission structure point generated from public line geometry. It is not a real pole, tower, or utility structure location.";
  if (selection.kind === "opgw_cable") return "Synthetic OPGW planning route. Do not treat this as verified fiber or an operational telecom path.";
  if (selection.kind === "splice_closure") return "Synthetic splice closure at a synthetic structure point. It is for demo splicing workflows only.";
  if (selection.kind === "fiber_assignment") return "Synthetic fiber assignment for planning demonstration. It is not an actual circuit path.";
  if (selection.kind === "patch_panel") return "Synthetic patch panel and termination ports for demo planning.";
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

function fccFrequencyBandLabel(frequencyMhz?: number | null) {
  if (!frequencyMhz) return "unknown";
  if (frequencyMhz >= 21000) return "23 GHz+";
  if (frequencyMhz >= 17000) return "18 GHz";
  if (frequencyMhz >= 10000) return "11-15 GHz";
  if (frequencyMhz >= 5800) return "6-10 GHz";
  if (frequencyMhz >= 1900) return "2 GHz";
  return "below 2 GHz";
}
