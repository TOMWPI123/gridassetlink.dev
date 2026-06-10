"use client";

import { Link2, X } from "lucide-react";
import type { StreetMapSelection } from "@/components/map/StreetLevelAssetMap";

type LinkedAssetDetailPanelProps = {
  selection: StreetMapSelection | null;
  onClose?: () => void;
};

export function LinkedAssetDetailPanel({ selection, onClose }: LinkedAssetDetailPanelProps) {
  if (!selection) {
    return (
      <section className="linked-asset-detail-panel" aria-label="Linked asset detail panel">
        <div className="street-panel-title"><span className="linked-asset-title-text"><Link2 size={16} />Asset Detail Panel</span></div>
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
      <div className="street-panel-title">
        <span className="linked-asset-title-text"><Link2 size={16} />Asset Detail Panel</span>
        <button className="linked-asset-close-button" type="button" onClick={onClose} aria-label={`Close details for ${selection.label}`}>
          <X size={15} />
        </button>
      </div>
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
      {selection.kind === "opgw_cable" || selection.kind === "opgw_route" || selection.kind === "opgw_cable_section" ? (
        <div className="linked-asset-actions">
          <a href={`/fiber-trace?cable=${encodeURIComponent(selection.id)}`}>Open Fiber Trace</a>
          <a href={`/outage-impact?cable=${encodeURIComponent(selection.id)}`}>Open Outage Impact</a>
          {selection.kind === "opgw_cable_section" ? <button type="button">Add splice point</button> : null}
          {selection.kind === "opgw_cable_section" ? <button type="button">Split cable section</button> : null}
          {selection.kind === "opgw_cable_section" ? <button type="button">View strand assignments</button> : null}
          <button type="button">Convert assumption to planned fiber</button>
          <button type="button">Create work order</button>
        </div>
      ) : null}
      {selection.kind === "opgw_span_segment" ? (
        <div className="linked-asset-actions">
          <a href={`/outage-impact?span=${encodeURIComponent(selection.id)}`}>Analyze span outage</a>
          <button type="button">Create inspection record</button>
          <button type="button">Create work order</button>
          <button type="button">Mark issue resolved</button>
        </div>
      ) : null}
      {selection.kind === "opgw_splice_point" ? (
        <div className="linked-asset-actions">
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}/diagram`}>Interactive Splicing Diagram</a>
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}`}>Open Splice Manager</a>
          <a href={`/fiber-trace?splicePoint=${encodeURIComponent(selection.id)}`}>Open Fiber Trace</a>
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}?layer=existing`}>View existing splices</a>
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}?layer=proposed`}>View proposed splices</a>
          <a href={`/outage-impact?splicePoint=${encodeURIComponent(selection.id)}`}>Analyze outage impact</a>
          <a href={`/work-orders/new?splicePoint=${encodeURIComponent(selection.id)}`}>Create work order</a>
        </div>
      ) : null}
      {selection.kind === "distribution_pole" ? (
        <div className="linked-asset-actions">
          <a href={`/fiber-trace?distributionPole=${encodeURIComponent(selection.id)}`}>Open Pole Continuity</a>
          <a href={`/outage-impact?distributionPole=${encodeURIComponent(selection.id)}`}>Analyze Telecom Impact</a>
          <button type="button">Reserve telecom fiber</button>
          <button type="button">Create field verification work order</button>
        </div>
      ) : null}
      {selection.kind === "distribution_pole_fiber" ? (
        <div className="linked-asset-actions">
          <a href={`/fiber-trace?distributionRoute=${encodeURIComponent(selection.id)}`}>Open Feeder Continuity</a>
          <a href={`/outage-impact?distributionRoute=${encodeURIComponent(selection.id)}`}>Analyze Route Impact</a>
          <button type="button">Open pole list sample</button>
          <button type="button">Create telecom construction work order</button>
        </div>
      ) : null}
      {selection.kind === "splice_closure" ? (
        <div className="linked-asset-actions">
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}/diagram`}>Interactive Splicing Diagram</a>
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}`}>Open Splice Manager</a>
          <a href={`/fiber-trace?spliceClosure=${encodeURIComponent(selection.id)}`}>Open Fiber Trace</a>
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}?layer=existing`}>View existing splices</a>
          <a href={`/opgw/splices/${encodeURIComponent(selection.id)}?layer=proposed`}>View proposed splices</a>
          <a href={`/outage-impact?spliceClosure=${encodeURIComponent(selection.id)}`}>Analyze outage impact</a>
          <a href={`/work-orders/new?spliceClosure=${encodeURIComponent(selection.id)}`}>Create work order</a>
        </div>
      ) : null}
      {selection.kind === "synthetic_substation" || selection.kind === "transmission_structure" ? (
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
  if (selection.kind === "opgw_cable") {
    return {
      routeName: selection.record.properties.cableName,
      routeId: selection.record.properties.id,
      fromSubstation: selection.record.properties.startStructureId,
      toSubstation: selection.record.properties.endStructureId,
      transmissionLineCorridor: selection.record.properties.lineName || selection.record.properties.lineId,
      routeMiles: selection.record.properties.routeMiles,
      fiberCount: selection.record.properties.fiberCount,
      cableId: selection.record.properties.id,
      status: opgwPlanningStatus(selection.record.properties.status),
      sourceStatus: selection.record.properties.status,
      confidenceLevel: opgwConfidenceLevel(selection.record.properties.id, selection.record.properties.status),
      availableStrands: "See Available Strand Capacity layer / Fiber Strand Table",
      assignedStrands: "See Fiber Strand Table",
      criticalCircuits: "See Critical Riding Circuits layer",
      spliceClosures: selection.record.properties.connectedSpliceClosureIds.length,
      patchPanels: "See Patch Panels layer",
      conversionWorkflow: "synthetic assumption -> planned OPGW -> designed -> work order -> as-built verified",
      synthetic: true,
      source: selection.record.properties.source,
      warning: "Synthetic planning assumption only. Not active fiber. Requires engineer/as-built verification.",
      geometryType: selection.record.geometry.type,
    };
  }
  if (selection.kind === "opgw_route") {
    return {
      ...selection.record.properties,
      drawerTabs: "Summary / Engineering details / Fiber and strand / Work orders / Outage impact / Audit history",
      conversionWorkflow: "synthetic assumption -> planned OPGW -> designed -> work order -> as-built verified",
      geometryType: selection.record.geometry.type,
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "opgw_cable_section") {
    return {
      ...selection.record.properties,
      fiberTraceHierarchy: "Patch panel -> cable section -> span segments -> splice point/closure -> next cable section",
      splitWorkflow: "Add splice point -> preview split -> supersede old section -> create two new sections -> reassign spans -> preserve strand continuity",
      drawerTabs: "Summary / Engineering details / Fiber and strand / Work orders / Outage impact / Audit history",
      geometryType: selection.record.geometry.type,
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "opgw_span_segment") {
    return {
      ...selection.record.properties,
      spanRecord: "Structure-to-structure OPGW span segment",
      drawerTabs: "Summary / Engineering details / Work orders / Outage impact / Audit history",
      geometryType: selection.record.geometry.type,
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "opgw_splice_point") {
    return {
      ...selection.record.properties,
      strandContinuity: "Continuity is preserved through associated splice closure matrix in the demo workflow.",
      drawerTabs: "Summary / Engineering details / Fiber and strand / Work orders / Outage impact / Audit history",
      geometryType: selection.record.geometry.type,
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "transmission_structure" || selection.kind === "splice_closure") {
    return {
      ...selection.record.properties,
      geometryType: selection.record.geometry.type,
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "fiber_assignment" || selection.kind === "patch_panel") {
    return selection.record as unknown as Record<string, unknown>;
  }
  if (selection.kind === "distribution_pole") {
    return {
      ...selection.record.properties,
      geometryType: selection.record.geometry.type,
      viewerOptimization: "Rendered as clustered MapLibre GeoJSON. Individual poles are shown only at close zoom for smooth browsing.",
      scaleModel: "One displayed synthetic pole can represent many regional-scale planning poles in million-pole exports.",
    } as unknown as Record<string, unknown>;
  }
  if (selection.kind === "distribution_pole_fiber") {
    return {
      ...selection.record.properties,
      geometryType: selection.record.geometry.type,
      continuityModel: "Synthetic feeder continuity links endpoint patch panels to ordered distribution pole samples.",
      viewerOptimization: "Rendered as route linework; individual poles are clustered in a separate layer.",
    } as unknown as Record<string, unknown>;
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
  if (selection.kind === "opgw_route") return ["Synthetic OPGW route", "Demo"];
  if (selection.kind === "opgw_cable_section") return ["Cable section", "Splice-to-splice"];
  if (selection.kind === "opgw_span_segment") return ["Span segment", "Structure-to-structure"];
  if (selection.kind === "opgw_splice_point") return ["Splice point", "Synthetic"];
  if (selection.kind === "splice_closure") return ["Synthetic splice", "Demo"];
  if (selection.kind === "fiber_assignment") return ["Synthetic assignment", "Demo"];
  if (selection.kind === "distribution_pole") return ["Synthetic pole", "Telecom", "Clustered"];
  if (selection.kind === "distribution_pole_fiber") return ["Synthetic feeder", "Telecom continuity"];
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
  if (selection.kind === "opgw_cable") return "Synthetic planning assumption only. Not active fiber. Requires engineer/as-built verification.";
  if (selection.kind === "opgw_route") return "Synthetic OPGW route planning assumption only. Public transmission lines are not proof of actual OPGW.";
  if (selection.kind === "opgw_cable_section") return "Synthetic cable section from splice point to splice point. It is not active fiber unless explicitly imported or marked verified.";
  if (selection.kind === "opgw_span_segment") return "Synthetic OPGW span segment between adjacent structures. Use for planning inspections, issues, work orders, and outage impact only.";
  if (selection.kind === "opgw_splice_point") return "Synthetic splice point. Splice points define cable-section boundaries and do not prove real field splices.";
  if (selection.kind === "splice_closure") return "Synthetic splice closure at a synthetic structure point. It is for demo splicing workflows only.";
  if (selection.kind === "fiber_assignment") return "Synthetic fiber assignment for planning demonstration. It is not an actual circuit path.";
  if (selection.kind === "distribution_pole") return "Synthetic distribution telecom pole placed along generated street paths. This is not a real pole, utility attachment, or private telecom route.";
  if (selection.kind === "distribution_pole_fiber") return "Synthetic distribution telecom feeder route. It follows generated street-like paths and links into demo patch-panel continuity only.";
  if (selection.kind === "patch_panel") return "Synthetic patch panel and termination ports for demo planning.";
  return "";
}

function opgwPlanningStatus(status: string) {
  if (status === "planned") return "planned";
  if (status === "proposed") return "design";
  return "synthetic_assumption";
}

function opgwConfidenceLevel(id: string, status: string) {
  if (status === "planned") return "high";
  if (status === "proposed") return "medium";
  return Number(id.replace(/\D/g, "").slice(-4) || 0) % 5 === 0 ? "medium" : "low";
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
