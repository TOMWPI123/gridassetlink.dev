"use client";

import { Activity, AlertTriangle, Cable, ClipboardList, GitBranch, Network, RadioTower, Server } from "lucide-react";
import type { TelecomAssetDashboardData, TelecomAssetFeature } from "@/lib/types/assets";

type MapKpiStripProps = {
  data: TelecomAssetDashboardData;
  visibleAssets: TelecomAssetFeature[];
};

const staleLifecycleYear = 2021;

export function MapKpiStrip({ data, visibleAssets }: MapKpiStripProps) {
  const telecomNodes = data.telecomNodes.features;
  const visibleIds = new Set(visibleAssets.map((asset) => getFeatureId(asset)));
  const staleNodes = telecomNodes.filter((node) => {
    const installYear = Number(node.properties.installDate.slice(0, 4));
    return Number.isFinite(installYear) && installYear < staleLifecycleYear;
  });

  const kpis = [
    {
      label: "Substations",
      value: data.substations.features.length,
      note: "public reference sites",
      tone: "cyan",
      Icon: Server,
    },
    {
      label: "Telecom Nodes",
      value: telecomNodes.length,
      note: `${telecomNodes.filter((node) => node.properties.status === "online" || node.properties.status === "active").length} active`,
      tone: "green",
      Icon: Network,
    },
    {
      label: "Fiber Miles",
      value: data.fiberRoutes.features.reduce((total, route) => total + route.properties.lengthMiles, 0).toFixed(1),
      note: "synthetic route miles",
      tone: "teal",
      Icon: Cable,
    },
    {
      label: "Circuits",
      value: data.telecomCircuits.features.length,
      note: `${data.telecomCircuits.features.filter((circuit) => circuit.properties.backupRoute === "None").length} without backup`,
      tone: "violet",
      Icon: GitBranch,
    },
    {
      label: "Microwave",
      value: data.microwavePaths.features.length,
      note: "planning paths",
      tone: "blue",
      Icon: RadioTower,
    },
    {
      label: "Open Work Orders",
      value: data.workOrders.features.filter((workOrder) => !["complete", "closed"].includes(workOrder.properties.status)).length,
      note: "field-visible tasks",
      tone: "amber",
      Icon: ClipboardList,
    },
    {
      label: "Critical Assets",
      value: visibleAssets.filter((asset) => "criticality" in asset.properties && asset.properties.criticality === "critical").length,
      note: "in current view",
      tone: "red",
      Icon: AlertTriangle,
    },
    {
      label: "Lifecycle Watch",
      value: staleNodes.length,
      note: `installed before ${staleLifecycleYear}`,
      tone: "gray",
      Icon: Activity,
    },
    {
      label: "Visible Layers",
      value: visibleIds.size,
      note: "filtered map assets",
      tone: "cyan",
      Icon: Activity,
    },
  ];

  return (
    <section className="telecom-map-kpi-strip" aria-label="Map key performance indicators">
      {kpis.map(({ label, value, note, tone, Icon }) => (
        <div className={`telecom-map-kpi ${tone}`} key={label}>
          <span className="telecom-map-kpi-icon" aria-hidden="true"><Icon size={16} /></span>
          <div>
            <div className="telecom-map-kpi-label">{label}</div>
            <div className="telecom-map-kpi-value">{value}</div>
            <div className="telecom-map-kpi-note">{note}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

function getFeatureId(asset: TelecomAssetFeature): string {
  const props = asset.properties as Record<string, unknown>;
  return String(props.id || props.circuitId || props.pathId || props.woId || props.routeName || asset.assetKind);
}
