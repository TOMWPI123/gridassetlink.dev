"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch, canWrite, formatLabel } from "@/lib/api";
import type { EntityConfig, JsonRecord } from "@/types";
import { DataTable } from "@/components/DataTable";

export function EntityListPage({ config }: { config?: EntityConfig }) {
  if (!config) return <div className="panel panel-body">Unsupported entity view.</div>;
  return <ConfiguredEntityListPage config={config} />;
}

function ConfiguredEntityListPage({ config }: { config: EntityConfig }) {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const writable = canWrite() && !["users", "audit-logs"].includes(config.key);
  const visibleRows = useMemo(() => rows.filter((row) => matchesStaticFilter(config.key, row)), [config.key, rows]);
  async function load() { setBusy(true); setError(""); try { setRows(await apiFetch<JsonRecord[]>(config.endpoint)); } catch (err) { setError(err instanceof Error ? err.message : "Could not load data"); } finally { setBusy(false); } }
  useEffect(() => { load(); }, [config.endpoint]);
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">{config.title}</h1><div className="subtle">{config.description}</div></div><div className="toolbar"><button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={16} /></button>{writable ? <button className="button primary" onClick={() => setShowCreate(!showCreate)}><Plus size={16} />Create</button> : null}</div></div>
      {showCreate && writable ? <QuickCreate config={config} onCreated={load} /> : null}
      {error ? <div className="badge red">{error}</div> : null}
      {busy ? <div className="panel panel-body">Loading {config.title.toLowerCase()}...</div> : <DataTable rows={visibleRows} columns={config.columns} detailBase={detailBaseFor(config.key, config.detailBase)} filterField={config.filterField} onExport={() => apiDownload(`/api/export/${config.endpoint.replace("/api/", "")}`, `${config.key}.csv`)} />}
    </>
  );
}

function QuickCreate({ config, onCreated }: { config: EntityConfig; onCreated: () => Promise<void> }) {
  const fields = config.createFields || config.columns;
  const [payload, setPayload] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field, ""])));
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "").map(([key, value]) => [key, coerce(value)]));
    try { await apiFetch(config.endpoint, { method: "POST", body: JSON.stringify(body) }); await onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "Create failed"); }
  }
  return <form className="panel" onSubmit={submit} style={{ marginBottom: 16 }}><div className="panel-header"><strong>Create {config.title}</strong>{error ? <span className="badge red">{error}</span> : null}</div><div className="panel-body"><div className="form-grid">{fields.map((field) => <label key={field}><span className="field-label">{formatLabel(field)}</span><input className="input" value={payload[field]} onChange={(event) => setPayload({ ...payload, [field]: event.target.value })} /></label>)}</div><button className="button primary" style={{ marginTop: 14 }}><Plus size={16} />Save</button></div></form>;
}

function coerce(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function matchesStaticFilter(key: string, row: JsonRecord): boolean {
  if (key === "opgw") return row.cable_type === "OPGW";
  if (key === "distribution-fiber") return String(row.cable_type || "").includes("distribution");
  return true;
}

function detailBaseFor(key: string, detailBase: string): string | undefined {
  if (["audit-logs", "device-ports", "fiber-strands", "icon-slots", "users"].includes(key)) return undefined;
  return detailBase;
}
