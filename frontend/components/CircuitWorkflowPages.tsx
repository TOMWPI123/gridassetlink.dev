"use client";

import Link from "next/link";
import { GitBranch, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";
import { Badge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";

type TracePath = JsonRecord & { elements: JsonRecord[] };
type TraceResponse = { circuit: JsonRecord; paths: TracePath[] };

export function CircuitDetailPage({ id }: { id: string }) {
  const [tab, setTab] = useState("Overview");
  const [circuit, setCircuit] = useState<JsonRecord | null>(null);
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [orders, setOrders] = useState<JsonRecord[]>([]);
  const [leased, setLeased] = useState<JsonRecord[]>([]);
  useEffect(() => { Promise.all([apiFetch<JsonRecord>(`/api/circuits/${id}`), apiFetch<TraceResponse>(`/api/circuits/${id}/trace`), apiFetch<JsonRecord[]>("/api/work-orders"), apiFetch<JsonRecord[]>("/api/leased-services")]).then(([c, t, o, l]) => { setCircuit(c); setTrace(t); setOrders(o.filter((row) => String(row.circuit_id) === id)); setLeased(l.filter((row) => String(row.circuit_id) === id)); }); }, [id]);
  if (!circuit) return <div className="panel panel-body">Loading circuit...</div>;
  const tabs = ["Overview", "A-End / Z-End", "Paths", "Fiber Trace", "Provider / Leased Service", "Work Orders", "Attachments", "Audit"];
  return <><div className="page-header"><div><h1 className="eyebrowless-title">{displayValue(circuit.circuit_id)}</h1><div className="subtle">{displayValue(circuit.circuit_name)}</div></div><div className="toolbar"><Badge value={circuit.status} /><Link className="button" href={`/circuits/${id}/fiber-path`}><GitBranch size={16} />Fiber Path</Link><Link className="button" href={`/circuits/${id}/trace`}><GitBranch size={16} />Trace</Link></div></div><div className="tabs">{tabs.map((name) => <button className={`tab ${tab === name ? "active" : ""}`} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>{tab === "Paths" ? <CircuitPaths trace={trace} id={id} /> : tab === "Fiber Trace" ? <TraceViewer trace={trace} /> : tab === "Provider / Leased Service" ? <DataTable rows={leased} columns={["provider_circuit_id", "service_type", "bandwidth", "monthly_cost", "contract_end", "status"]} detailBase="/leased-services" /> : tab === "Work Orders" ? <DataTable rows={orders} columns={["work_order_number", "title", "priority", "status"]} detailBase="/work-orders" /> : <CircuitOverview circuit={circuit} />}</>;
}

export function CircuitPathsPage({ id }: { id: string }) {
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  useEffect(() => { apiFetch<TraceResponse>(`/api/circuits/${id}/trace`).then(setTrace); }, [id]);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">Circuit Paths</h1><div className="subtle">Circuit {id}</div></div></div><CircuitPaths trace={trace} id={id} /></>;
}

export function CircuitTraceDetailPage({ id }: { id: string }) {
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  useEffect(() => { apiFetch<TraceResponse>(`/api/circuits/${id}/trace`).then(setTrace); }, [id]);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">Fiber Trace</h1><div className="subtle">Circuit {id}</div></div></div><TraceViewer trace={trace} /></>;
}

export function FiberTracePage() {
  const [circuits, setCircuits] = useState<JsonRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  useEffect(() => { apiFetch<JsonRecord[]>("/api/circuits").then((data) => { setCircuits(data); if (data[0]?.id) setSelected(String(data[0].id)); }); }, []);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">Fiber Trace</h1><div className="subtle">Circuit, fiber, device, port, patch panel, splice, and provider path view</div></div><div className="toolbar"><select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>{circuits.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.circuit_id)}</option>)}</select><button className="button primary" onClick={() => selected && apiFetch<TraceResponse>(`/api/circuits/${selected}/trace`).then(setTrace)}><Play size={16} />Run</button></div></div><TraceViewer trace={trace} /></>;
}

function CircuitOverview({ circuit }: { circuit: JsonRecord }) {
  return <div className="metric-grid">{["service_type", "ownership_type", "transport_type", "bandwidth", "criticality", "status"].map((key) => <div className="metric-card" key={key}><div className="subtle">{key.replaceAll("_", " ")}</div><div className="metric-value" style={{ fontSize: 22 }}>{key === "criticality" || key === "status" ? <Badge value={circuit[key]} /> : displayValue(circuit[key])}</div></div>)}</div>;
}

function CircuitPaths({ trace, id }: { trace: TraceResponse | null; id: string }) {
  const rows = useMemo(() => trace?.paths.map((path) => ({ id: path.id, path_name: path.path_name, path_role: path.path_role, is_active: path.is_active, diversity_group: path.diversity_group, element_count: path.elements.length })) || [], [trace]);
  return <div style={{ display: "grid", gap: 14 }}><DataTable rows={rows} columns={["path_name", "path_role", "is_active", "diversity_group", "element_count"]} /><Link className="button primary" href={`/circuits/${id}/trace`} style={{ width: "fit-content" }}><GitBranch size={16} />Open Trace</Link></div>;
}

function TraceViewer({ trace }: { trace: TraceResponse | null }) {
  if (!trace) return <div className="panel panel-body">Select a circuit to view trace.</div>;
  return <div style={{ display: "grid", gap: 16 }}>{trace.paths.map((path) => <div className="panel" key={String(path.id)}><div className="panel-header"><strong>{String(path.path_name)}</strong><Badge value={path.path_role} /></div><div className="panel-body"><div className="timeline">{path.elements.map((element, index) => <div className="trace-step" key={String(element.id ?? index)}><div className="trace-index">{displayValue(element.sequence_number)}</div><div><strong>{displayValue(element.element_label)}</strong><div className="subtle">{displayValue(element.element_type)} / latency {displayValue(element.latency_ms)} ms</div></div><Badge value={element.element_type} /></div>)}</div></div></div>)}</div>;
}
