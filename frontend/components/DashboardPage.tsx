"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";
import { Badge, PriorityBadge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";

type Summary = { metrics: Array<{ label: string; value: string | number; prefix?: string }>; alerts: Array<{ severity: string; title: string; entity: string; detail: string }>; recent_work_orders: JsonRecord[]; circuits_by_status: JsonRecord[]; fiber_strand_utilization: JsonRecord[]; leased_service_cost_summary: JsonRecord[] };

export function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  async function load() { setError(""); try { setData(await apiFetch<Summary>("/api/dashboard/summary")); } catch (err) { setError(err instanceof Error ? err.message : "Could not load dashboard"); } }
  useEffect(() => { load(); }, []);
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">Dashboard</h1><div className="subtle">Planning, operations, cost, and risk snapshot</div></div><button className="icon-button" onClick={load}><RefreshCw size={16} /></button></div>
      {error ? <div className="badge red">{error}</div> : null}
      {!data ? <div className="panel panel-body">Loading dashboard...</div> : <div style={{ display: "grid", gap: 16 }}><div className="metric-grid">{data.metrics.map((metric) => <div className="metric-card" key={metric.label}><div className="subtle">{metric.label}</div><div className="metric-value">{metric.prefix || ""}{displayValue(metric.value)}</div></div>)}</div><div className="panel"><div className="panel-header"><strong>Critical Issues</strong><Badge value={`${data.alerts.length} alerts`} /></div><div className="panel-body"><div className="timeline">{data.alerts.map((alert, index) => <div className="trace-step" key={`${alert.title}-${index}`}><div className="trace-index">{index + 1}</div><div><strong>{alert.title}</strong><div className="subtle">{alert.entity} / {alert.detail}</div></div><PriorityBadge value={alert.severity} /></div>)}</div></div></div><DataTable rows={data.recent_work_orders} columns={["work_order_number", "title", "priority", "status"]} detailBase="/work-orders" /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}><DataTable rows={data.circuits_by_status} columns={["label", "value"]} /><DataTable rows={data.fiber_strand_utilization} columns={["label", "value"]} /><DataTable rows={data.leased_service_cost_summary} columns={["provider_id", "service", "monthly_cost"]} /></div></div>}
    </>
  );
}
