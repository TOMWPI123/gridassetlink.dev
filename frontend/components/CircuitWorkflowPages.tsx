"use client";

import Link from "next/link";
import { GitBranch, Play } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiFetch, displayValue } from "@/lib/api";
import { loadModuleLayerData } from "@/lib/moduleLayerData";
import type { JsonRecord } from "@/types";
import { Badge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";

type TracePath = JsonRecord & { elements: JsonRecord[] };
type TraceResponse = { circuit: JsonRecord; paths: TracePath[] };
type CircuitTraceMode = "backend" | "synthetic" | "assignment" | "context";
type CircuitTraceCandidate = JsonRecord & {
  display_id: string;
  display_name: string;
  source_label: string;
  trace_href?: string;
  trace_key: string;
  trace_mode: CircuitTraceMode;
};

const MAX_FIBER_TRACE_CHOICES = 36;

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
  const [circuits, setCircuits] = useState<CircuitTraceCandidate[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [context, setContext] = useState<CircuitTraceCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    let cancelled = false;
    async function loadCircuits() {
      setIsLoading(true);
      setError("");
      const [backendResult, moduleResult] = await Promise.allSettled([
        apiFetch<JsonRecord[]>("/api/circuits"),
        loadModuleLayerData("circuits"),
      ]);
      if (cancelled) return;
      const backendRows = backendResult.status === "fulfilled"
        ? backendResult.value.map((row) => ({ ...row, layer: row.layer || "Backend planning database" }))
        : [];
      const moduleRows = moduleResult.status === "fulfilled" && moduleResult.value ? moduleResult.value.rows : [];
      const candidates = uniqueCircuitTraceCandidates([...backendRows, ...moduleRows].map(buildCircuitTraceCandidate));
      setCircuits(candidates);
      setSelectedKey(candidates[0]?.trace_key || "");
      if (backendResult.status === "rejected" && moduleResult.status === "rejected") setError("Circuit sources did not load. Check the backend and static layer files.");
      else if (backendResult.status === "rejected") setError("Backend circuit traces are unavailable, but synthetic layer circuits loaded.");
      else if (moduleResult.status === "rejected") setError("Layer-backed synthetic circuits are unavailable, but backend circuits loaded.");
      setIsLoading(false);
    }
    void loadCircuits();
    return () => { cancelled = true; };
  }, []);
  const filteredCircuits = useMemo(() => filterCircuitTraceCandidates(circuits, deferredQuery), [circuits, deferredQuery]);
  const visibleCircuits = filteredCircuits.slice(0, MAX_FIBER_TRACE_CHOICES);
  const selectedCircuit = filteredCircuits.find((candidate) => candidate.trace_key === selectedKey) || visibleCircuits[0] || circuits[0];
  const traceableCount = circuits.filter((candidate) => candidate.trace_mode !== "context").length;
  async function runSelectedTrace() {
    if (!selectedCircuit) return;
    setTrace(null);
    setContext(null);
    setError("");
    if (selectedCircuit.trace_href) {
      window.location.href = selectedCircuit.trace_href;
      return;
    }
    if (selectedCircuit.trace_mode === "backend") {
      const backendId = String(selectedCircuit.id || selectedCircuit.circuit_id || selectedCircuit.display_id);
      try {
        const nextTrace = await apiFetch<TraceResponse>(`/api/circuits/${encodeURIComponent(backendId)}/trace`);
        setTrace(nextTrace);
      } catch {
        setError("This circuit is listed, but the backend trace endpoint did not return a path. Showing circuit context instead.");
        setContext(selectedCircuit);
      }
      return;
    }
    setContext(selectedCircuit);
  }
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="eyebrowless-title">Fiber Trace</h1>
          <div className="subtle">All backend and layer-backed circuits, synthetic services, fiber assignments, and provider/reference rows in one searchable trace launcher</div>
        </div>
        <div className="toolbar">
          {selectedCircuit?.trace_href ? (
            <button className="button primary" onClick={runSelectedTrace} disabled={isLoading}><GitBranch size={16} />Open Trace</button>
          ) : (
            <button className="button primary" onClick={runSelectedTrace} disabled={!selectedCircuit || isLoading}><Play size={16} />Run</button>
          )}
        </div>
      </div>
      <section className="fiber-trace-picker panel">
        <div className="fiber-trace-picker-header">
          <div>
            <strong>Circuit Trace Catalog</strong>
            <span>{circuits.length.toLocaleString()} circuit rows / {traceableCount.toLocaleString()} trace-enabled rows</span>
          </div>
          <input
            className="input fiber-trace-search"
            placeholder="Search circuit, service, route, layer, owner, endpoint..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {error ? <div className="fiber-trace-warning">{error}</div> : null}
        <div className="fiber-trace-result-grid" aria-label="Fiber trace circuit choices">
          {visibleCircuits.map((candidate) => (
            <button
              type="button"
              className={`fiber-trace-result ${candidate.trace_key === selectedCircuit?.trace_key ? "active" : ""}`}
              key={candidate.trace_key}
              onClick={() => {
                setSelectedKey(candidate.trace_key);
                setTrace(null);
                setContext(null);
              }}
            >
              <strong>{candidate.display_id}</strong>
              <span>{candidate.display_name}</span>
              <small>{candidate.source_label}</small>
              <div>
                <Badge value={candidate.trace_mode === "context" ? "context only" : "trace ready"} />
                <Badge value={candidate.status || candidate.operational_status || candidate.service_status || "synthetic"} />
              </div>
            </button>
          ))}
        </div>
        <div className="subtle">
          Showing {visibleCircuits.length.toLocaleString()} of {filteredCircuits.length.toLocaleString()} matches. Public/reference rows are displayed as context unless a synthetic fiber continuity path exists.
        </div>
      </section>
      {context ? <CircuitTraceContextPanel circuit={context} /> : <TraceViewer trace={trace} />}
    </>
  );
}

function buildCircuitTraceCandidate(row: JsonRecord): CircuitTraceCandidate {
  const layer = displayValue(row.layer || row.source_layer || row.source || "Planning database");
  const id = displayValue(row.id || row.service_id || row.serviceId || row.circuit_id || row.provider_circuit_id || row.route_id || row.name);
  const circuitId = displayValue(row.circuit_id || row.circuitId || row.provider_circuit_id || id);
  const serviceId = displayValue(row.service_id || row.serviceId || row.id || circuitId);
  const displayId = circuitId !== "-" ? circuitId : serviceId;
  const displayName = displayValue(row.circuit_name || row.service_name || row.assignmentName || row.assignment_name || row.name || row.description || row.service_type);
  const traceHref = syntheticTraceHref(row, layer, serviceId, circuitId);
  const traceMode = traceHref
    ? layer.includes("fiber assignments") ? "assignment" : "synthetic"
    : layer === "Backend planning database" ? "backend" : "context";
  return {
    ...row,
    display_id: displayId,
    display_name: displayName,
    source_label: layer,
    trace_href: traceHref,
    trace_key: `${layer}:${id}:${circuitId}`,
    trace_mode: traceMode,
  };
}

function syntheticTraceHref(row: JsonRecord, layer: string, serviceId: string, circuitId: string) {
  const encodedServiceId = encodeURIComponent(serviceId);
  const encodedCircuitId = encodeURIComponent(circuitId);
  if (layer === "Merged synthetic telecom services") return `/fiber-trace?circuit=${encodedCircuitId}`;
  if (layer === "Synthetic distribution fiber services" && serviceId !== "-") return `/fiber-trace?service=${encodedServiceId}`;
  if (layer === "Synthetic fiber assignments as circuits" && serviceId !== "-") return `/fiber-trace?assignment=${encodedServiceId}`;
  if (layer === "Verizon leased service overlay" && row.backup_for_service_id) return `/fiber-trace?service=${encodeURIComponent(String(row.backup_for_service_id))}`;
  return "";
}

function uniqueCircuitTraceCandidates(candidates: CircuitTraceCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.display_id || candidate.display_id === "-") return false;
    const key = candidate.trace_key.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterCircuitTraceCandidates(candidates: CircuitTraceCandidate[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return candidates;
  return candidates.filter((candidate) => {
    const values = [
      candidate.display_id,
      candidate.display_name,
      candidate.source_label,
      candidate.service_type,
      candidate.ownership_type,
      candidate.owner,
      candidate.utility_owner,
      candidate.a_end_site,
      candidate.z_end_site,
      candidate.a_end_icon_node,
      candidate.z_end_icon_node,
      candidate.primary_path,
      candidate.backup_path,
      candidate.status,
      candidate.operational_status,
    ];
    return values.some((value) => displayValue(value).toLowerCase().includes(normalized));
  });
}

function CircuitTraceContextPanel({ circuit }: { circuit: CircuitTraceCandidate }) {
  const rows: Array<[string, unknown]> = [
    ["Circuit", circuit.display_id],
    ["Name", circuit.display_name],
    ["Layer", circuit.source_label],
    ["Service type", circuit.service_type],
    ["Status", circuit.status || circuit.operational_status || circuit.service_status],
    ["A-end", circuit.a_end_site || circuit.a_end || circuit.from_site || circuit.fromSiteName],
    ["Z-end", circuit.z_end_site || circuit.z_end || circuit.to_site || circuit.toSiteName],
    ["Primary path", circuit.primary_path],
    ["Backup path", circuit.backup_path],
    ["Owner", circuit.owner || circuit.utility_owner || circuit.ownership_type],
  ];
  return (
    <section className="panel panel-body">
      <div className="fiber-trace-context-title">
        <strong>{circuit.display_id}</strong>
        <Badge value="context only" />
      </div>
      <p className="subtle">This row is included in the fiber trace catalog, but it does not currently have a generated continuity path. Public/reference rows do not imply private fiber, OPGW, relay, SCADA, or protection routing.</p>
      <div className="fiber-trace-context-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{displayValue(value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
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
