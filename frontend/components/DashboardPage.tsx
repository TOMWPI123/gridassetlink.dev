"use client";

import Link from "next/link";
import { Cable, ClipboardList, Database, GitBranch, Map, Network, RefreshCw, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";
import { Badge, PriorityBadge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";

type Summary = { metrics: Array<{ label: string; value: string | number; prefix?: string }>; alerts: Array<{ severity: string; title: string; entity: string; detail: string }>; recent_work_orders: JsonRecord[]; circuits_by_status: JsonRecord[]; fiber_strand_utilization: JsonRecord[]; leased_service_cost_summary: JsonRecord[] };
type RegionalSummary = { cards?: Array<{ label: string; value: unknown }> };
type DeviceOpsSummary = { cards?: Array<{ label: string; value: unknown }> };

export function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [regional, setRegional] = useState<RegionalSummary | null>(null);
  const [deviceOps, setDeviceOps] = useState<DeviceOpsSummary | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const [summaryResult, regionalResult, deviceOpsResult] = await Promise.allSettled([
        apiFetch<Summary>("/api/dashboard/summary"),
        apiFetch<RegionalSummary>("/api/regional-grid/summary"),
        apiFetch<DeviceOpsSummary>("/api/deviceops/summary"),
      ]);
      if (summaryResult.status === "fulfilled") setData(summaryResult.value);
      if (regionalResult.status === "fulfilled") setRegional(regionalResult.value);
      if (deviceOpsResult.status === "fulfilled") setDeviceOps(deviceOpsResult.value);
      const firstError = [summaryResult, regionalResult, deviceOpsResult].find((result) => result.status === "rejected");
      if (firstError?.status === "rejected") setError(firstError.reason instanceof Error ? firstError.reason.message : "Some dashboard modules could not load");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    }
  }
  useEffect(() => { load(); }, []);
  const modules = moduleCards(data, regional, deviceOps);
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">Dashboard</h1><div className="subtle">Planning, operations, cost, and risk snapshot</div></div><button className="icon-button" onClick={load}><RefreshCw size={16} /></button></div>
      {error ? <div className="badge red">{error}</div> : null}
      {!data ? <div className="panel panel-body">Loading dashboard...</div> : <div style={{ display: "grid", gap: 16 }}>
        <div className="module-grid">
          {modules.map(({ href, label, value, detail, icon: Icon }) => (
            <Link className="module-card" href={href} key={href}>
              <span className="module-icon"><Icon size={18} /></span>
              <span>
                <span className="field-label">Module</span>
                <strong>{label}</strong>
                <span className="subtle">{detail}</span>
              </span>
              <span className="module-value">{displayValue(value)}</span>
            </Link>
          ))}
        </div>
        <div className="metric-grid">{data.metrics.map((metric) => <div className="metric-card" key={metric.label}><div className="subtle">{metric.label}</div><div className="metric-value">{metric.prefix || ""}{displayValue(metric.value)}</div></div>)}</div>
        <div className="panel"><div className="panel-header"><strong>Critical Issues</strong><Badge value={`${data.alerts.length} alerts`} /></div><div className="panel-body"><div className="timeline">{data.alerts.map((alert, index) => <div className="trace-step" key={`${alert.title}-${index}`}><div className="trace-index">{index + 1}</div><div><strong>{alert.title}</strong><div className="subtle">{alert.entity} / {alert.detail}</div></div><PriorityBadge value={alert.severity} /></div>)}</div></div></div>
        <DataTable rows={data.recent_work_orders} columns={["work_order_number", "title", "priority", "status"]} detailBase="/work-orders" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}><DataTable rows={data.circuits_by_status} columns={["label", "value"]} /><DataTable rows={data.fiber_strand_utilization} columns={["label", "value"]} /><DataTable rows={data.leased_service_cost_summary} columns={["provider_id", "service", "monthly_cost"]} /></div>
      </div>}
    </>
  );
}

function moduleCards(data: Summary | null, regional: RegionalSummary | null, deviceOps: DeviceOpsSummary | null) {
  const metric = (label: string) => data?.metrics.find((item) => item.label === label)?.value || 0;
  const regionalCard = (label: string) => regional?.cards?.find((item) => item.label === label)?.value || 0;
  const deviceOpsCard = (label: string) => deviceOps?.cards?.find((item) => item.label === label)?.value || 0;
  return [
    { href: "/regional-grid", label: "RegionalGrid Map", value: regionalCard("Total imported regional substations"), detail: "Browse public-reference assets and synthetic overlays", icon: Map },
    { href: "/regional-grid/sel-icon-synthetic-network", label: "Synthetic ICON", value: regionalCard("Proposed SEL ICON circuits"), detail: "Rings, circuits, owners, and assumptions", icon: Network },
    { href: "/deviceops", label: "DeviceOps", value: deviceOpsCard("Total managed devices"), detail: "Actual, planned, proposed, and as-built views", icon: Shield },
    { href: "/deviceops/icon", label: "ICON Ops", value: deviceOpsCard("SEL ICON nodes"), detail: "Operational node health and slot modules", icon: Network },
    { href: "/regional-grid/opgw-assumptions", label: "OPGW Assumptions", value: regionalCard("Assumed OPGW routes"), detail: "Explicitly labeled planning hypotheses", icon: Cable },
    { href: "/regional-grid/transmission-lines", label: "Regional Lines", value: regionalCard("Total imported transmission lines"), detail: "Filter by state, owner, and voltage", icon: GitBranch },
    { href: "/work-orders", label: "Work Orders", value: metric("Open work orders"), detail: "Regional and DeviceOps installation tasks", icon: ClipboardList },
    { href: "/sql-reports", label: "SQL Reports", value: "40+", detail: "Operational, proposed, and regional reports", icon: Database },
  ];
}
