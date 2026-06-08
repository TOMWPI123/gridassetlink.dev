"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDownload, apiFetch, canWrite, formatLabel } from "@/lib/api";
import { loadModuleLayerData, type ModuleLayerData } from "@/lib/moduleLayerData";
import type { EntityConfig, JsonRecord } from "@/types";
import { DataTable } from "@/components/DataTable";
import { OpgwCableMenu } from "@/components/OpgwCableMenu";

export function EntityListPage({ config }: { config?: EntityConfig }) {
  if (!config) return <div className="panel panel-body">Unsupported entity view.</div>;
  return <ConfiguredEntityListPage config={config} />;
}

function ConfiguredEntityListPage({ config }: { config: EntityConfig }) {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [moduleLayerData, setModuleLayerData] = useState<ModuleLayerData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const writable = canWrite() && !["users", "audit-logs"].includes(config.key);
  const visibleRows = useMemo(() => rows.filter((row) => matchesStaticFilter(config.key, row)), [config.key, rows]);
  async function load() {
    setBusy(true);
    setError("");
    setModuleLayerData(null);
    try {
      const [backendResult, layerResult] = await Promise.allSettled([
        apiFetch<JsonRecord[]>(config.endpoint),
        loadModuleLayerData(config.key),
      ]);
      const backendRows = backendResult.status === "fulfilled" ? normalizeBackendRows(backendResult.value) : [];
      const layerData = layerResult.status === "fulfilled" ? layerResult.value : null;
      setModuleLayerData(layerData);
      setRows([...backendRows, ...(layerData?.rows || [])]);
      if (backendResult.status === "rejected" && !layerData?.rows.length) {
        setError(backendResult.reason instanceof Error ? backendResult.reason.message : "Could not load data");
      } else if (layerResult.status === "rejected") {
        setError(layerResult.reason instanceof Error ? layerResult.reason.message : "Could not load layer data");
      }
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, [config.endpoint, config.key]);
  const exportRows = () => moduleLayerData ? downloadRowsAsCsv(visibleRows, `${config.key}.csv`) : apiDownload(`/api/export/${config.endpoint.replace("/api/", "")}`, `${config.key}.csv`);
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">{config.title}</h1><div className="subtle">{config.description}</div></div><div className="toolbar"><button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={16} /></button>{writable ? <button className="button primary" onClick={() => setShowCreate(!showCreate)}><Plus size={16} />Create</button> : null}</div></div>
      {showCreate && writable ? <QuickCreate config={config} onCreated={load} /> : null}
      {error ? <div className="badge red">{error}</div> : null}
      {moduleLayerData ? <ModuleLayerSummary data={moduleLayerData} backendCount={rows.length - moduleLayerData.rows.length} totalCount={visibleRows.length} /> : null}
      {config.key === "opgw" && !busy ? <OpgwCableMenu rows={visibleRows} /> : null}
      {busy ? <div className="panel panel-body">Loading {config.title.toLowerCase()}...</div> : <DataTable rows={visibleRows} columns={config.columns} detailBase={moduleLayerData?.disableDetailLinks ? undefined : detailBaseFor(config.key, config.detailBase)} filterField={config.filterField} onExport={exportRows} />}
    </>
  );
}

function ModuleLayerSummary({ data, backendCount, totalCount }: { data: ModuleLayerData; backendCount: number; totalCount: number }) {
  return (
    <section className="panel module-layer-panel">
      <div className="panel-header">
        <div>
          <strong>{data.title}</strong>
          <div className="subtle">{data.notice}</div>
        </div>
        <span className="badge active">{totalCount.toLocaleString()} module rows</span>
      </div>
      <div className="panel-body module-layer-body">
        <div className="module-layer-note">{data.notice}</div>
        <div className="module-layer-grid">
          <div className="module-layer-card">
            <span>Backend demo rows</span>
            <strong>{backendCount.toLocaleString()}</strong>
            <small>Original planning database rows remain searchable beside layer records.</small>
          </div>
          {data.metrics.map((metric) => (
            <div className="module-layer-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</strong>
              <small>{metric.detail}</small>
              <em>{metric.source} / {metric.safety}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
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

function normalizeBackendRows(rows: JsonRecord[]): JsonRecord[] {
  return rows.map((row) => ({
    ...row,
    layer: row.layer || "Backend planning database",
    source: row.source || "local-demo-api",
    source_type: row.source_type || "demo-planning",
  }));
}

function downloadRowsAsCsv(rows: JsonRecord[], filename: string) {
  const fields = Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key));
    return keys;
  }, new Set<string>()));
  const csv = [
    fields.join(","),
    ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const text = value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
