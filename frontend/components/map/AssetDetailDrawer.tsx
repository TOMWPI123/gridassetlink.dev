"use client";

import Link from "next/link";
import { ArrowRight, Cable, ClipboardList, Cpu, ExternalLink, FileText, GitCompare, Network, ShieldCheck, X } from "lucide-react";
import { getAssetName, getAssetStatus, getAssetSite } from "@/lib/api/assets";
import type { TelecomAssetDashboardData, TelecomAssetFeature } from "@/lib/types/assets";

type AssetDetailDrawerProps = {
  asset: TelecomAssetFeature | null;
  data: TelecomAssetDashboardData | null;
  onClose: () => void;
};

const detailFieldLimit = 18;

export function AssetDetailDrawer({ asset, data, onClose }: AssetDetailDrawerProps) {
  if (!asset) return null;

  const related = data ? getRelatedAssets(asset, data) : [];
  const deepLinks = getDeepLinks(asset);
  const sourceState = getSourceState(asset);

  return (
    <aside className="telecom-asset-drawer" aria-label="Asset detail drawer">
      <div className="telecom-drawer-header">
        <div>
          <span className="telecom-drawer-kind">{asset.assetKind.replaceAll("_", " ")}</span>
          <h2>{getAssetName(asset)}</h2>
          <div className="telecom-drawer-subtitle">{getAssetSite(asset)} / {getAssetStatus(asset)}</div>
        </div>
        <button className="telecom-map-icon-button" type="button" onClick={onClose} title="Close detail drawer"><X size={16} /></button>
      </div>

      <div className="telecom-state-badge-row">
        {sourceState.map((state) => <span className={`telecom-state-badge ${state.toLowerCase().replaceAll(" ", "-")}`} key={state}>{state}</span>)}
      </div>

      <div className="telecom-drawer-actions">
        {deepLinks.map(({ href, label, Icon }) => (
          <Link className="telecom-map-button" href={href} key={href}><Icon size={15} />{label}</Link>
        ))}
      </div>

      <section className="telecom-drawer-section">
        <div className="telecom-filter-title"><FileText size={14} />Asset Fields</div>
        <div className="telecom-drawer-field-grid">
          {Object.entries(asset.properties as Record<string, unknown>).slice(0, detailFieldLimit).map(([key, value]) => (
            <div className="telecom-drawer-field" key={key}>
              <span>{formatFieldLabel(key)}</span>
              <strong>{formatValue(value)}</strong>
            </div>
          ))}
        </div>
      </section>

      {asset.assetKind === "telecom_node" ? <SelIconProvisioningBlock asset={asset} /> : null}

      <section className="telecom-drawer-section">
        <div className="telecom-filter-title"><GitCompare size={14} />Related Planning Records</div>
        <div className="telecom-related-list">
          {related.length ? related.map((item) => (
            <div className="telecom-related-row" key={`${item.kind}-${item.name}`}>
              <span>{item.kind}</span>
              <strong>{item.name}</strong>
              <small>{item.summary}</small>
            </div>
          )) : <p className="telecom-empty-note">No related synthetic records found for this asset.</p>}
        </div>
      </section>

      <section className="telecom-drawer-section">
        <div className="telecom-filter-title"><ShieldCheck size={14} />Operational Boundary</div>
        <p className="telecom-empty-note">
          This MVP is read-only for operational state. Proposed route and service changes are staged for engineering review and work order creation only.
        </p>
      </section>
    </aside>
  );
}

function SelIconProvisioningBlock({ asset }: { asset: TelecomAssetFeature }) {
  const props = asset.properties as Record<string, unknown>;
  const isIcon = String(props.role || "").includes("ICON") || String(props.manufacturer || "") === "SEL";
  if (!isIcon) return null;

  const parameters = [
    ["Transport mode", "Mixed Ethernet/SONET"],
    ["Timing source", props.name === "MA-AUB-ICON-01" ? "IRIG-B backup alarm" : "GPS primary / SONET backup"],
    ["Protection services", props.name === "MA-WBS-ICON-01" ? "C37.94, 87L, DTT" : "C37.94, SCADA, Ethernet pipe"],
    ["Slot profile", "2 line modules / 4 tributary modules"],
    ["Firmware", String(props.firmware || "-")],
    ["Manual reference", "SEL ICON guide ref placeholder / rev TBD"],
  ];

  return (
    <section className="telecom-drawer-section icon-provisioning-summary">
      <div className="telecom-filter-title"><Cpu size={14} />SEL ICON Provisioning Parameters</div>
      <div className="telecom-drawer-field-grid">
        {parameters.map(([label, value]) => (
          <div className="telecom-drawer-field" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Link className="telecom-map-button primary drawer-wide-link" href="/deviceops/icon/provisioning">
        Open provisioning module <ArrowRight size={15} />
      </Link>
    </section>
  );
}

function getRelatedAssets(asset: TelecomAssetFeature, data: TelecomAssetDashboardData) {
  const assetName = getAssetName(asset);
  const assetSite = getAssetSite(asset);
  const candidateText = [assetName, assetSite, getAssetId(asset)].join(" ").toLowerCase();

  return [
    ...data.fiberRoutes.features
      .filter((route) => matchRelated(candidateText, [route.properties.routeName, route.properties.fromSite, route.properties.toSite]))
      .slice(0, 3)
      .map((route) => ({ kind: "Fiber", name: route.properties.routeName, summary: `${route.properties.fiberType} / ${route.properties.lengthMiles} mi` })),
    ...data.telecomCircuits.features
      .filter((circuit) => matchRelated(candidateText, [circuit.properties.circuitId, circuit.properties.aEnd, circuit.properties.zEnd, circuit.properties.primaryRoute]))
      .slice(0, 4)
      .map((circuit) => ({ kind: "Circuit", name: circuit.properties.circuitId, summary: `${circuit.properties.serviceType} / ${circuit.properties.protectionClass}` })),
    ...data.workOrders.features
      .filter((workOrder) => matchRelated(candidateText, [workOrder.properties.woId, workOrder.properties.relatedAssetId, workOrder.properties.site]))
      .slice(0, 3)
      .map((workOrder) => ({ kind: "Work Order", name: workOrder.properties.woId, summary: `${workOrder.properties.status} / ${workOrder.properties.priority}` })),
    ...data.proposedChanges.features
      .filter((change) => matchRelated(candidateText, [change.properties.id, change.properties.relatedAssetId || "", change.properties.fromSite || "", change.properties.toSite || ""]))
      .slice(0, 3)
      .map((change) => ({ kind: "Proposed", name: change.properties.id, summary: `${change.properties.changeType} / ${change.properties.status}` })),
  ];
}

function matchRelated(candidateText: string, values: string[]) {
  return values.some((value) => {
    const lowered = value.toLowerCase();
    if (!lowered || lowered === "-") return false;
    return candidateText.includes(lowered) || lowered.split("-").some((part) => part.length >= 3 && candidateText.includes(part));
  });
}

function getDeepLinks(asset: TelecomAssetFeature) {
  const props = asset.properties as Record<string, unknown>;
  if (asset.assetKind === "telecom_node") {
    const nodeId = String(props.id || "").toLowerCase();
    return [
      { href: "/deviceops/icon", label: "ICON dashboard", Icon: Cpu },
      { href: `/devices/${nodeId || "ma-wbs-icon-01"}`, label: "Device", Icon: Network },
      { href: "/deviceops/icon/provisioning", label: "Provisioning", Icon: ShieldCheck },
    ];
  }
  if (asset.assetKind === "telecom_circuit") return [{ href: "/circuits", label: "Circuits", Icon: Cable }, { href: "/deviceops/compare", label: "Compare", Icon: GitCompare }];
  if (asset.assetKind === "work_order") return [{ href: "/work-orders", label: "Work orders", Icon: ClipboardList }];
  if (asset.assetKind === "proposed_change") return [{ href: "/deviceops/change-requests", label: "Change requests", Icon: FileText }];
  if (asset.assetKind === "fiber_route") return [{ href: "/fiber-cables", label: "Fiber cables", Icon: Cable }];
  return [{ href: "/regional-grid", label: "Regional grid", Icon: ExternalLink }];
}

function getSourceState(asset: TelecomAssetFeature) {
  if (asset.assetKind === "proposed_change") return ["Proposed"];
  if (asset.assetKind === "work_order") return ["Planned", "Proposed"];
  if (asset.assetKind === "fiber_route" && getAssetStatus(asset) === "proposed") return ["Assumed", "Proposed"];
  if (asset.assetKind === "telecom_circuit" && getAssetStatus(asset) === "planned") return ["Planned"];
  return ["Actual", "Planned"];
}

function getAssetId(asset: TelecomAssetFeature): string {
  const props = asset.properties as Record<string, unknown>;
  return String(props.id || props.circuitId || props.pathId || props.woId || props.routeName || "");
}

function formatFieldLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "-");
}
