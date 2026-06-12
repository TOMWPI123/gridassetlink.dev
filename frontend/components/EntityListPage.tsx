"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { apiDownload, apiFetch, canWrite, formatLabel } from "@/lib/api";
import { loadModuleLayerData, type ModuleLayerData } from "@/lib/moduleLayerData";
import type { EntityConfig, JsonRecord } from "@/types";
import { DataTable } from "@/components/DataTable";
import { OpgwCableMenu } from "@/components/OpgwCableMenu";
import { SubstationFiberSection } from "@/components/SubstationFiberSection";

type LayerCacheResult = ModuleLayerData | null;

const moduleLayerDataCache = new Map<string, LayerCacheResult>();
const moduleLayerDataPromiseCache = new Map<string, Promise<LayerCacheResult>>();

export function EntityListPage({ config }: { config?: EntityConfig }) {
  if (!config) return <div className="panel panel-body">Unsupported entity view.</div>;
  return <ConfiguredEntityListPage config={config} />;
}

function ConfiguredEntityListPage({ config }: { config: EntityConfig }) {
  const [backendRows, setBackendRows] = useState<JsonRecord[]>([]);
  const [layerRows, setLayerRows] = useState<JsonRecord[]>([]);
  const [moduleLayerData, setModuleLayerData] = useState<ModuleLayerData | null>(null);
  const [isBackendLoading, setIsBackendLoading] = useState(true);
  const [isLayerLoading, setIsLayerLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [initialWaitExpired, setInitialWaitExpired] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showOpgwTable, setShowOpgwTable] = useState(config.key !== "opgw");
  const loadIdRef = useRef(0);
  const idleCancelRef = useRef<() => void>(() => undefined);
  const writable = canWrite() && !["users", "audit-logs"].includes(config.key);
  const rows = useMemo(() => (backendRows.length ? [...backendRows, ...layerRows] : layerRows), [backendRows, layerRows]);
  const visibleRows = useMemo(() => rows.filter((row) => matchesStaticFilter(config.key, row)), [config.key, rows]);
  const load = useCallback(async () => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    idleCancelRef.current();
    idleCancelRef.current = () => undefined;
    setError("");
    setInitialWaitExpired(false);
    setIsBackendLoading(true);
    setIsLayerLoading(true);

    const cachedLayerData = moduleLayerDataCache.has(config.key) ? moduleLayerDataCache.get(config.key) ?? null : undefined;
    if (cachedLayerData !== undefined) {
      startTransition(() => {
        setModuleLayerData(cachedLayerData);
        setLayerRows(cachedLayerData?.rows || []);
      });
      setIsLayerLoading(false);
    } else {
      startTransition(() => {
        setModuleLayerData(null);
        setLayerRows([]);
      });
      idleCancelRef.current = scheduleModuleIdleWork(() => {
        void loadCachedModuleLayerData(config.key)
          .then((layerData) => {
            if (loadId !== loadIdRef.current) return;
            startTransition(() => {
              setModuleLayerData(layerData);
              setLayerRows(layerData?.rows || []);
            });
          })
          .catch((reason) => {
            if (loadId !== loadIdRef.current) return;
            setError(reason instanceof Error ? reason.message : "Could not load layer data");
          })
          .finally(() => {
            if (loadId === loadIdRef.current) setIsLayerLoading(false);
          });
      });
    }

    try {
      const backendResult = await apiFetch<JsonRecord[]>(config.endpoint);
      if (loadId !== loadIdRef.current) return;
      const normalizedRows = normalizeBackendRows(backendResult);
      startTransition(() => setBackendRows(normalizedRows));
    } catch (reason) {
      if (loadId !== loadIdRef.current) return;
      if (!moduleLayerDataCache.get(config.key)?.rows.length) {
        setError(reason instanceof Error ? reason.message : "Could not load data");
      }
    } finally {
      if (loadId === loadIdRef.current) setIsBackendLoading(false);
    }
  }, [config.endpoint, config.key]);
  useEffect(() => {
    setShowOpgwTable(config.key !== "opgw");
  }, [config.key]);
  useEffect(() => {
    void load();
    return () => {
      loadIdRef.current += 1;
      idleCancelRef.current();
    };
  }, [load]);
  useEffect(() => {
    if (rows.length || (!isBackendLoading && !isLayerLoading)) return;
    const handle = window.setTimeout(() => setInitialWaitExpired(true), 850);
    return () => window.clearTimeout(handle);
  }, [isBackendLoading, isLayerLoading, rows.length]);
  const exportRows = () => moduleLayerData ? downloadRowsAsCsv(visibleRows, `${config.key}.csv`) : apiDownload(`/api/export/${config.endpoint.replace("/api/", "")}`, `${config.key}.csv`);
  const loadingInBackground = isBackendLoading || isLayerLoading || isPending;
  const busy = !rows.length && !initialWaitExpired && loadingInBackground;
  const refreshing = rows.length > 0 && (isBackendLoading || isLayerLoading || isPending);
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">{config.title}</h1><div className="subtle">{config.description}</div></div><div className="toolbar"><button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={16} /></button>{writable ? <button className="button primary" onClick={() => setShowCreate(!showCreate)}><Plus size={16} />Create</button> : null}</div></div>
      {showCreate && writable ? <QuickCreate config={config} onCreated={load} /> : null}
      {error ? <div className="badge red">{error}</div> : null}
      {refreshing ? <div className="module-loading-strip">Refreshing module data without clearing the current view...</div> : null}
      {!rows.length && initialWaitExpired && loadingInBackground ? <div className="module-loading-strip">Loading layer-backed records in the background. Module controls remain available.</div> : null}
      {moduleLayerData ? <ModuleLayerSummary data={moduleLayerData} backendCount={backendRows.length} totalCount={visibleRows.length} /> : null}
      {config.key === "substations" && !busy ? <SubstationFiberSection rows={visibleRows} /> : null}
      {config.key === "opgw" && !busy ? <OpgwCableMenu rows={visibleRows} /> : null}
      {busy ? <div className="panel panel-body">Loading {config.title.toLowerCase()}...</div> : config.key === "opgw" && !showOpgwTable ? <DeferredOpgwTablePrompt rows={visibleRows} onShow={() => setShowOpgwTable(true)} /> : <DataTable rows={visibleRows} columns={config.columns} detailBase={moduleLayerData?.disableDetailLinks ? undefined : detailBaseFor(config.key, config.detailBase)} filterField={config.filterField} onExport={exportRows} />}
    </>
  );
}

function loadCachedModuleLayerData(key: string): Promise<LayerCacheResult> {
  if (moduleLayerDataCache.has(key)) return Promise.resolve(moduleLayerDataCache.get(key) ?? null);
  const pending = moduleLayerDataPromiseCache.get(key);
  if (pending) return pending;
  const promise = loadModuleLayerData(key)
    .then((data) => {
      moduleLayerDataCache.set(key, data);
      moduleLayerDataPromiseCache.delete(key);
      return data;
    })
    .catch((reason) => {
      moduleLayerDataPromiseCache.delete(key);
      throw reason;
    });
  moduleLayerDataPromiseCache.set(key, promise);
  return promise;
}

function scheduleModuleIdleWork(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const win = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (win.requestIdleCallback && win.cancelIdleCallback) {
    const handle = win.requestIdleCallback(callback, { timeout: 500 });
    return () => win.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 80);
  return () => window.clearTimeout(handle);
}

function DeferredOpgwTablePrompt({ rows, onShow }: { rows: JsonRecord[]; onShow: () => void }) {
  return (
    <section className="panel deferred-opgw-table">
      <div className="panel-header">
        <div>
          <strong>OPGW Inventory Table</strong>
          <div className="subtle">The continuity controls are ready. Open the full searchable table only when you need row-level inventory.</div>
        </div>
        <span className="badge planned">{rows.length.toLocaleString()} rows available</span>
      </div>
      <div className="panel-body">
        <button className="button" type="button" onClick={onShow}>Show OPGW Inventory Table</button>
      </div>
    </section>
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
            <span>Synced backend rows</span>
            <strong>{backendCount.toLocaleString()}</strong>
            <small>Planning/API rows remain searchable beside layer-backed synthetic records.</small>
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
