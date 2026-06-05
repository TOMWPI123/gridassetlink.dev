"use client";

import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, displayValue, formatLabel } from "@/lib/api";
import type { JsonRecord } from "@/types";
import { Badge, PriorityBadge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";

const fields = ["work_order_number", "title", "description", "work_type", "priority", "status", "substation_id", "circuit_id", "device_id", "fiber_cable_id", "provider_id", "assigned_field_tech_id"];

export function WorkOrderNewPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<Record<string, string>>({ work_order_number: `WO-2026-${Math.floor(Math.random() * 8000 + 1000)}`, title: "", description: "", work_type: "circuit_turnup", priority: "normal", status: "draft", substation_id: "", circuit_id: "", device_id: "", fiber_cable_id: "", provider_id: "", assigned_field_tech_id: "" });
  async function submit(event: React.FormEvent) { event.preventDefault(); const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "").map(([key, value]) => [key, coerce(value)])); const created = await apiFetch<JsonRecord>("/api/work-orders", { method: "POST", body: JSON.stringify(body) }); router.push(`/work-orders/${created.id}`); }
  return <><div className="page-header"><div><h1 className="eyebrowless-title">New Work Order</h1><div className="subtle">Engineer assignment, task planning, materials, outage impact, and field closeout</div></div></div><form className="panel" onSubmit={submit}><div className="panel-header"><strong>Work order</strong></div><div className="panel-body"><div className="form-grid">{fields.map((field) => <label key={field}><span className="field-label">{formatLabel(field)}</span>{field === "description" ? <textarea className="textarea" value={payload[field]} onChange={(e) => setPayload({ ...payload, [field]: e.target.value })} /> : <input className="input" value={payload[field]} onChange={(e) => setPayload({ ...payload, [field]: e.target.value })} />}</label>)}</div><button className="button primary" style={{ marginTop: 14 }}><Plus size={16} />Create</button></div></form></>;
}

export function WorkOrderDetailPage({ id }: { id: string }) {
  const [order, setOrder] = useState<JsonRecord | null>(null);
  const [tasks, setTasks] = useState<JsonRecord[]>([]);
  const [tab, setTab] = useState("Overview");
  useEffect(() => { Promise.all([apiFetch<JsonRecord>(`/api/work-orders/${id}`), apiFetch<JsonRecord[]>("/api/work-order-tasks")]).then(([o, t]) => { setOrder(o); setTasks(t.filter((row) => String(row.work_order_id) === id)); }); }, [id]);
  if (!order) return <div className="panel panel-body">Loading work order...</div>;
  const tabs = ["Overview", "Tasks", "Materials", "Circuit/Fiber/Device links", "Updates", "Attachments", "Closeout", "Audit"];
  return <><div className="page-header"><div><h1 className="eyebrowless-title">{displayValue(order.work_order_number)}</h1><div className="subtle">{displayValue(order.title)}</div></div><div className="toolbar"><Link className="button" href={`/work-orders/${id}/fiber-tasks`}>Fiber Tasks</Link><PriorityBadge value={order.priority} /><Badge value={order.status} /></div></div><div className="tabs">{tabs.map((name) => <button className={`tab ${tab === name ? "active" : ""}`} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>{tab === "Tasks" ? <DataTable rows={tasks} columns={["task_number", "task_title", "assigned_to_user_id", "status", "completed_at"]} /> : tab === "Closeout" ? <FieldCloseoutPage id={id} compact /> : <Overview row={order} />}</>;
}

export function MyWorkOrdersPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  useEffect(() => { apiFetch<JsonRecord[]>("/api/work-orders/my").then(setRows); }, []);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">My Work Orders</h1><div className="subtle">Assigned field and engineering work</div></div></div><DataTable rows={rows} columns={["work_order_number", "title", "work_type", "priority", "status"]} detailBase="/work-orders" /></>;
}

export function FieldCloseoutPage({ id, compact = false }: { id: string; compact?: boolean }) {
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("field_complete");
  const [result, setResult] = useState<JsonRecord | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); setResult(await apiFetch<JsonRecord>(`/api/work-orders/${id}/closeout`, { method: "POST", body: JSON.stringify({ status, closeout_summary: summary, attachments: [{ filename: "field-photo.jpg", file_url: "/uploads/field-photo.jpg", attachment_type: "photo" }] }) })); }
  return <>{!compact ? <div className="page-header"><div><h1 className="eyebrowless-title">Field Closeout</h1><div className="subtle">Work order {id}</div></div></div> : null}<form className="panel" onSubmit={submit}><div className="panel-header"><strong>Closeout</strong>{result ? <Badge value={result.status} /> : null}</div><div className="panel-body"><label><span className="field-label">Status</span><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="field_complete">field_complete</option><option value="engineering_review">engineering_review</option><option value="closed">closed</option></select></label><div style={{ marginTop: 12 }}><label><span className="field-label">Closeout summary</span><textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} /></label></div><button className="button primary" style={{ marginTop: 14 }}><Upload size={16} />Submit</button></div></form></>;
}

function Overview({ row }: { row: JsonRecord }) { return <div className="panel"><div className="panel-body detail-grid">{Object.entries(row).map(([key, value]) => <div className="field" key={key}><div className="field-label">{formatLabel(key)}</div><div className="field-value">{key === "priority" ? <PriorityBadge value={value} /> : key === "status" ? <Badge value={value} /> : displayValue(value)}</div></div>)}</div></div>; }
function coerce(value: string): string | number | boolean { if (value === "true") return true; if (value === "false") return false; if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value); return value; }
