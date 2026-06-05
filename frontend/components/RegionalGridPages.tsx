"use client";

import Link from "next/link";
import { Cable, CheckCircle2, Database, GitBranch, Map, Network, Plus, RefreshCw, Shield, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AssetBrowserMap } from "@/components/AssetBrowserMap";
import { Badge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";
import { apiFetch, displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";

type SummaryCard = { label: string; value: unknown };
type SummaryPayload = {
  cards?: SummaryCard[];
  states?: string[];
  owners?: JsonRecord[];
  recent_import_batches?: JsonRecord[];
  visible_work_orders?: JsonRecord[];
  safety_note?: string;
};
type MapPayload = { viewport?: JsonRecord; layers?: Record<string, JsonRecord[]>; todo?: string };
type SubstationDetailPayload = {
  regional_substation?: JsonRecord;
  public_source?: JsonRecord | null;
  import_batch?: JsonRecord | null;
  linked_internal_substation?: JsonRecord | null;
  telecom_overlays?: JsonRecord[];
  work_orders?: JsonRecord[];
  access_controls?: JsonRecord[];
};
type LineDetailPayload = {
  regional_transmission_line?: JsonRecord;
  assumed_opgw?: JsonRecord[];
  linked_internal_transmission_line?: JsonRecord | null;
  telecom_overlays?: JsonRecord[];
  proposed_circuits?: JsonRecord[];
  access_controls?: JsonRecord[];
  geometry?: unknown;
};
type SyntheticNetworkPayload = { rings?: JsonRecord[]; circuits?: JsonRecord[]; disclaimer?: string };
type MixedAccessPayload = { current_user?: JsonRecord; owners?: JsonRecord[]; agreements?: JsonRecord[]; permissions?: JsonRecord[]; visible_work_orders?: JsonRecord[]; rules?: string[] };
type OverlayPayload = { substations?: JsonRecord[]; transmission_lines?: JsonRecord[]; overlays?: JsonRecord[]; assumptions?: JsonRecord[]; map_layers?: Record<string, JsonRecord[]> };

const substationColumns = ["substation_name", "state", "owner_name", "voltage_class", "source_confidence", "confidence_score", "linked", "reference_type"];
const lineColumns = ["line_name", "state", "owner_name", "voltage_class", "route_length_miles", "status", "opgw_assumption_count", "linked"];
const assumptionColumns = ["assumption_name", "confidence_level", "status", "fiber_count_assumption", "assumed_install_type", "converted_to_fiber"];
const circuitColumns = ["circuit_id", "service_type", "a_end_site", "z_end_site", "criticality", "status", "assumed_or_verified_path", "access_group", "work_order_id"];
const workOrderColumns = ["work_order_number", "title", "work_type", "priority", "status", "assigned_field_tech_id"];

export function RegionalGridOverviewPage() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [mapData, setMapData] = useState<MapPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  async function load() {
    setBusy(true);
    try {
      const [nextSummary, nextMap] = await Promise.all([
        apiFetch<SummaryPayload>("/api/regional-grid/summary"),
        apiFetch<MapPayload>("/api/regional-grid/map"),
      ]);
      setSummary(nextSummary);
      setMapData(nextMap);
    } finally {
      setBusy(false);
    }
  }
  async function refreshImport() {
    setMessage("Importing mock OpenGridWorks public-reference data...");
    await apiFetch("/api/regional-grid/import/mock-opengridworks", { method: "POST", body: JSON.stringify({}) });
    setMessage("Public-reference import complete.");
    await load();
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader
        title="RegionalGrid Planner"
        subtitle="New England public grid references with assumed, synthetic, proposed, and verified telecom overlays"
        actions={<><button className="button" onClick={refreshImport}><RefreshCw size={16} />Refresh Public Reference</button><Link className="button primary" href="/regional-grid/import"><Upload size={16} />Import</Link></>}
      />
      <SafetyNotice text={summary?.safety_note} message={message} />
      {busy ? <Loading label="Loading RegionalGrid Planner..." /> : <MetricCards cards={summary?.cards || []} />}
      <Section title="Regional Asset Browser Map">
        <MapPanel mapData={mapData} />
      </Section>
      <div className="two-column" style={{ marginTop: 16 }}>
        <Section title="Recent Public Imports">
          <DataTable rows={summary?.recent_import_batches || []} columns={["import_batch_name", "import_time", "record_count", "imported_substation_count", "imported_line_count", "status"]} />
        </Section>
        <Section title="Visible Regional Work Orders">
          <DataTable rows={summary?.visible_work_orders || []} columns={workOrderColumns} detailBase="/work-orders" filterField="status" />
        </Section>
      </div>
    </>
  );
}

export function RegionalGridImportPage() {
  const [csvText, setCsvText] = useState("record_type,name,state,owner,voltage_kv,latitude,longitude\nsubstation,Demo Public Substation,Massachusetts,Manual public owner,115,42.1,-71.8\nline,Demo Public Line,Massachusetts,Manual public owner,115,,");
  const [result, setResult] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState("");
  async function run(path: string, body: JsonRecord = {}) {
    setBusy(path);
    try {
      setResult(await apiFetch<JsonRecord>(path, { method: "POST", body: JSON.stringify(body) }));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader title="Regional Public Data Import" subtitle="Open/public reference imports only; private telecom overlays remain synthetic or user-verified" actions={<Link className="button" href="/regional-grid/substations"><Database size={16} />Review Records</Link>} />
      <SafetyNotice text="Manual uploads preserve source attribution and flag possible duplicates for engineering review." />
      <div className="two-column">
        <Section title="Public Source Adapters">
          <div className="toolbar">
            <button className="button" onClick={() => run("/api/regional-grid/import/mock-opengridworks")} disabled={!!busy}><Upload size={16} />Mock OpenGridWorks</button>
            <button className="button" onClick={() => run("/api/regional-grid/import/mock-iso-ne")} disabled={!!busy}><Map size={16} />Mock ISO-NE</button>
            <button className="button" onClick={() => run("/api/regional-grid/import/mock-osm")} disabled={!!busy}><GitBranch size={16} />Mock OSM Power</button>
          </div>
          <RecordPanel title="Import Result" record={result || { status: busy ? "running" : "idle" }} />
        </Section>
        <Section title="CSV Import">
          <textarea className="textarea" value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="button primary" onClick={() => run("/api/regional-grid/import/csv", { csv_text: csvText, import_batch_name: "Manual RegionalGrid CSV import" })} disabled={!!busy}><CheckCircle2 size={16} />Import CSV</button>
          </div>
        </Section>
      </div>
    </>
  );
}

export function RegionalSubstationsPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [state, setState] = useState("");
  const [linked, setLinked] = useState("");
  const states = useMemo(() => Array.from(new Set(rows.map((row) => displayValue(row.state)).filter((value) => value !== "-"))).sort(), [rows]);
  async function load(nextState = state, nextLinked = linked) {
    const params = new URLSearchParams();
    if (nextState) params.set("state", nextState);
    if (nextLinked) params.set("linked", nextLinked);
    setRows(await apiFetch<JsonRecord[]>(`/api/regional-grid/substations${params.size ? `?${params}` : ""}`));
  }
  useEffect(() => { load("", ""); }, []);
  return (
    <>
      <PageHeader title="Regional Substations" subtitle="Public or imported ISO New England reference substations, separate from internal Substation records" actions={<Link className="button" href="/regional-grid/import"><Plus size={16} />Import</Link>} />
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 240 }} value={state} onChange={(event) => { setState(event.target.value); load(event.target.value, linked); }}><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select>
        <select className="select" style={{ maxWidth: 220 }} value={linked} onChange={(event) => { setLinked(event.target.value); load(state, event.target.value); }}><option value="">Linked and unlinked</option><option value="true">Linked only</option><option value="false">Unlinked only</option></select>
      </div>
      <DataTable rows={rows} columns={substationColumns} detailBase="/regional-grid/substations" filterField="state" />
    </>
  );
}

export function RegionalSubstationDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<SubstationDetailPayload | null>(null);
  useEffect(() => { apiFetch<SubstationDetailPayload>(`/api/regional-grid/substations/${id}`).then(setData); }, [id]);
  if (!data) return <Loading label="Loading regional substation..." />;
  const substation = data.regional_substation || {};
  return (
    <>
      <RegionalEntityHeader title={displayValue(substation.substation_name)} subtitle={`${displayValue(substation.state)} public reference`} status={substation.source_confidence} />
      <div className="two-column">
        <Section title="Public Source"><RecordPanel title="Regional Substation" record={substation} /></Section>
        <Section title="Linked Internal Asset"><RecordPanel title="Internal Substation" record={data.linked_internal_substation || { status: "unlinked" }} /></Section>
      </div>
      <Section title="SEL ICON / Telecom Overlay"><DataTable rows={data.telecom_overlays || []} columns={["overlay_name", "overlay_type", "confidence_level", "status", "icon_node_id", "fiber_cable_id"]} /></Section>
      <div className="two-column">
        <Section title="Work Orders"><DataTable rows={data.work_orders || []} columns={workOrderColumns} detailBase="/work-orders" /></Section>
        <Section title="Access Controls"><DataTable rows={data.access_controls || []} columns={["entity_type", "utility_owner_id", "user_id", "role_id", "access_level", "expires_at"]} /></Section>
      </div>
    </>
  );
}

export function RegionalTransmissionLinesPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [voltage, setVoltage] = useState("");
  const [state, setState] = useState("");
  const voltages = useMemo(() => Array.from(new Set(rows.map((row) => displayValue(row.voltage_class)).filter((value) => value !== "-"))).sort(), [rows]);
  const states = useMemo(() => Array.from(new Set(rows.map((row) => displayValue(row.state)).filter((value) => value !== "-"))).sort(), [rows]);
  async function load(nextState = state, nextVoltage = voltage) {
    const params = new URLSearchParams();
    if (nextState) params.set("state", nextState);
    if (nextVoltage) params.set("voltage_class_filter", nextVoltage);
    setRows(await apiFetch<JsonRecord[]>(`/api/regional-grid/transmission-lines${params.size ? `?${params}` : ""}`));
  }
  useEffect(() => { load("", ""); }, []);
  return (
    <>
      <PageHeader title="Regional Transmission Lines" subtitle="Public regional line references with OPGW assumptions explicitly separated from active fiber" actions={<Link className="button" href="/regional-grid/opgw-assumptions"><Cable size={16} />OPGW Assumptions</Link>} />
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 220 }} value={state} onChange={(event) => { setState(event.target.value); load(event.target.value, voltage); }}><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select>
        <select className="select" style={{ maxWidth: 220 }} value={voltage} onChange={(event) => { setVoltage(event.target.value); load(state, event.target.value); }}><option value="">All voltages</option>{voltages.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      <DataTable rows={rows} columns={lineColumns} detailBase="/regional-grid/transmission-lines" filterField="voltage_class" />
    </>
  );
}

export function RegionalTransmissionLineDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<LineDetailPayload | null>(null);
  const [message, setMessage] = useState("");
  async function load() {
    setData(await apiFetch<LineDetailPayload>(`/api/regional-grid/transmission-lines/${id}`));
  }
  async function assumeOpgw() {
    const created = await apiFetch<JsonRecord>(`/api/regional-grid/transmission-lines/${id}/assume-opgw`, { method: "POST", body: JSON.stringify({ confidence_level: "medium" }) });
    setMessage(`Created ${displayValue(created.assumption_name)}`);
    await load();
  }
  useEffect(() => { load(); }, [id]);
  if (!data) return <Loading label="Loading regional transmission line..." />;
  const line = data.regional_transmission_line || {};
  return (
    <>
      <RegionalEntityHeader title={displayValue(line.line_name)} subtitle={`${displayValue(line.voltage_class)} ${displayValue(line.state)} public reference`} status={line.status} actions={<button className="button primary" onClick={assumeOpgw}><Plus size={16} />Create Assumed OPGW</button>} />
      <SafetyNotice text="OPGW records on this page are planning assumptions unless user-verified or engineering-record verified." message={message} />
      <div className="two-column">
        <Section title="Public Line"><RecordPanel title="Transmission Line" record={line} /></Section>
        <Section title="Map Geometry"><MapMini geometry={data.geometry} /></Section>
      </div>
      <Section title="Assumed OPGW"><DataTable rows={data.assumed_opgw || []} columns={["assumption_name", "confidence_level", "status", "fiber_count_assumption", "linked_fiber_cable_id", "notes"]} /></Section>
      <Section title="Proposed / Synthetic Circuits"><DataTable rows={data.proposed_circuits || []} columns={circuitColumns} /></Section>
      <div className="two-column">
        <Section title="Telecom Overlay"><DataTable rows={data.telecom_overlays || []} columns={["overlay_name", "overlay_type", "confidence_level", "status", "fiber_cable_id"]} /></Section>
        <Section title="Access Controls"><DataTable rows={data.access_controls || []} columns={["entity_type", "utility_owner_id", "user_id", "role_id", "access_level"]} /></Section>
      </div>
    </>
  );
}

export function RegionalOpgwAssumptionsPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [message, setMessage] = useState("");
  async function load() { setRows(await apiFetch<JsonRecord[]>("/api/regional-grid/opgw-assumptions")); }
  async function convert(row: JsonRecord) {
    const result = await apiFetch<JsonRecord>(`/api/regional-grid/opgw-assumptions/${row.id}/convert-to-fiber`, { method: "POST", body: JSON.stringify({ engineer_approved: true }) });
    const cable = (result.fiber_cable || {}) as JsonRecord;
    setMessage(`Converted to planned fiber ${displayValue(cable.cable_id)}; still not active or verified.`);
    await load();
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="Assumed OPGW Routes" subtitle="Planning hypotheses created from public transmission references" actions={<Link className="button" href="/regional-grid/transmission-lines"><GitBranch size={16} />Regional Lines</Link>} />
      <SafetyNotice text="Assumed OPGW cannot become active fiber here; conversion creates planned fiber that still requires as-built verification." message={message} />
      <DataTable rows={rows} columns={assumptionColumns} filterField="confidence_level" />
      <Section title="Engineer Conversion Queue">
        <div className="toolbar">
          {rows.filter((row) => !row.converted_to_fiber).slice(0, 5).map((row) => <button key={String(row.id)} className="button" onClick={() => convert(row)}><CheckCircle2 size={16} />Approve Planned Fiber {displayValue(row.id)}</button>)}
        </div>
      </Section>
    </>
  );
}

export function RegionalMixedAccessPage() {
  const [data, setData] = useState<MixedAccessPayload | null>(null);
  useEffect(() => { apiFetch<MixedAccessPayload>("/api/regional-grid/mixed-access").then(setData); }, []);
  if (!data) return <Loading label="Loading mixed access..." />;
  return (
    <>
      <PageHeader title="Mixed Utility Access" subtitle="Owner, tenant, provider, contractor, and public-reference visibility controls" actions={<Link className="button" href="/regional-grid/telecom-overlay"><Shield size={16} />Visible Overlay</Link>} />
      <div className="two-column">
        <Section title="Utility Owners"><DataTable rows={data.owners || []} columns={["owner_name", "owner_type", "iso_region", "state", "service_area_description"]} filterField="owner_type" /></Section>
        <Section title="Access Agreements"><DataTable rows={data.agreements || []} columns={["agreement_name", "owning_utility", "accessing_utility", "access_type", "asset_scope", "status"]} filterField="access_type" /></Section>
      </div>
      <Section title="Object Permissions"><DataTable rows={data.permissions || []} columns={["entity_type", "entity_id", "utility_owner_id", "user_id", "role_id", "access_level", "expires_at"]} filterField="access_level" /></Section>
      <Section title="Visible Work Orders"><DataTable rows={data.visible_work_orders || []} columns={workOrderColumns} detailBase="/work-orders" /></Section>
    </>
  );
}

export function RegionalTelecomOverlayPage() {
  const [data, setData] = useState<OverlayPayload | null>(null);
  useEffect(() => { apiFetch<OverlayPayload>("/api/regional-grid/telecom-overlay").then(setData); }, []);
  if (!data) return <Loading label="Loading telecom overlay..." />;
  return (
    <>
      <PageHeader title="Regional Telecom Overlay" subtitle="Public grid reference layers with internal synthetic and assumed telecom planning overlays" actions={<Link className="button" href="/regional-grid/sel-icon-synthetic-network"><Network size={16} />Synthetic ICON</Link>} />
      <SafetyNotice text="Public grid references are visible broadly; internal telecom details follow utility-owner permissions." />
      <Section title="Browse Map-Ready Layers"><MapPanel mapData={{ layers: data.map_layers || {} }} /></Section>
      <div className="two-column">
        <Section title="Telecom Overlays"><DataTable rows={data.overlays || []} columns={["overlay_name", "overlay_type", "confidence_level", "status", "regional_substation_id", "regional_transmission_line_id", "fiber_cable_id", "icon_node_id"]} filterField="overlay_type" /></Section>
        <Section title="Assumed Routes"><DataTable rows={data.assumptions || []} columns={["assumption_name", "confidence_level", "status", "fiber_count_assumption", "linked_fiber_cable_id"]} filterField="status" /></Section>
      </div>
    </>
  );
}

export function RegionalSyntheticNetworkPage() {
  const [data, setData] = useState<SyntheticNetworkPayload | null>(null);
  const [selectedRingId, setSelectedRingId] = useState<string | null>(null);
  useEffect(() => { apiFetch<SyntheticNetworkPayload>("/api/regional-grid/sel-icon-synthetic-network").then(setData); }, []);
  if (!data) return <Loading label="Loading synthetic SEL ICON network..." />;
  const rings = data.rings || [];
  const selectedRing = rings.find((row) => String(row.id) === selectedRingId) || rings[0];
  const selectedRingCircuits = ((selectedRing?.circuits as JsonRecord[] | undefined) || []).length ? (selectedRing?.circuits as JsonRecord[]) : (data.circuits || []).filter((row) => String(row.ring_id) === String(selectedRing?.id));
  return (
    <>
      <PageHeader title="Synthetic SEL ICON Network" subtitle="Fictional New England-scale planning model with rings, assumed paths, access controls, and circuit examples" actions={<Link className="button" href="/regional-grid/mixed-access"><Shield size={16} />Access Matrix</Link>} />
      <SafetyNotice text={data.disclaimer || "Synthetic planning model only."} />
      <Section title="Synthetic ICON Rings"><RingGrid rows={rings} selectedId={String(selectedRing?.id || "")} onSelect={(row) => setSelectedRingId(String(row.id || ""))} /></Section>
      <Section title={`Selected Ring: ${displayValue(selectedRing?.ring_name)}`}>
        <div className="two-column">
          <RecordPanel title="Ring Engineering Summary" record={selectedRing || {}} />
          <DataTable rows={selectedRingCircuits} columns={circuitColumns} filterField="service_type" />
        </div>
      </Section>
      <Section title="Synthetic SEL ICON Circuits"><DataTable rows={data.circuits || []} columns={circuitColumns} filterField="service_type" /></Section>
    </>
  );
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><h1 className="eyebrowless-title">{title}</h1>{subtitle ? <div className="subtle" style={{ marginTop: 6 }}>{subtitle}</div> : null}</div>{actions ? <div className="toolbar">{actions}</div> : null}</div>;
}

function RegionalEntityHeader({ title, subtitle, status, actions }: { title: string; subtitle?: string; status?: unknown; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="eyebrowless-title">{title}</h1>
        <div className="toolbar" style={{ marginTop: 8 }}><span className="source-badge actual">Public Reference</span><span className="source-badge proposed">Assumed / Synthetic Overlay</span>{status ? <Badge value={status} /> : null}</div>
        {subtitle ? <div className="subtle" style={{ marginTop: 8 }}>{subtitle}</div> : null}
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </div>
  );
}

function SafetyNotice({ text, message }: { text?: string; message?: string }) {
  if (!text && !message) return null;
  return <div className="warning-list">{text ? <span className="source-badge actual" style={{ whiteSpace: "normal" }}>{text}</span> : null}{message ? <span className="source-badge proposed" style={{ whiteSpace: "normal" }}>{message}</span> : null}</div>;
}

function Loading({ label }: { label: string }) {
  return <div className="panel"><div className="panel-body subtle">{label}</div></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 16 }}><h2 className="section-title">{title}</h2>{children}</div>;
}

function MetricCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="metric-grid">
      {cards.map((card) => <div className="metric-card" key={card.label}><div className="subtle">{card.label}</div><div className="metric-value">{displayValue(card.value)}</div></div>)}
    </div>
  );
}

function RecordPanel({ title, record }: { title: string; record: JsonRecord }) {
  return (
    <div className="panel">
      <div className="panel-header"><strong>{title}</strong></div>
      <div className="panel-body detail-grid">
        {Object.entries(record).length ? Object.entries(record).map(([key, value]) => <div className="field" key={key}><div className="field-label">{key.replaceAll("_", " ")}</div><div className="field-value">{typeof value === "object" && value !== null ? <pre className="json-block">{JSON.stringify(value, null, 2)}</pre> : displayValue(value)}</div></div>) : <div className="subtle">No record linked.</div>}
      </div>
    </div>
  );
}

function MapPanel({ mapData }: { mapData: MapPayload | null }) {
  const layers = mapData?.layers || {};
  const layerRows = Object.entries(layers).map(([layer, values]) => ({ id: layer, layer, feature_count: values.length }));
  return (
    <>
      <AssetBrowserMap mapData={mapData} />
      <DataTable rows={layerRows} columns={["layer", "feature_count"]} />
    </>
  );
}

function MapMini({ geometry }: { geometry: unknown }) {
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="map-ready"><Map size={30} /> Public line geometry</div>
        <pre className="json-block">{JSON.stringify(geometry || {}, null, 2)}</pre>
      </div>
    </div>
  );
}

function RingGrid({ rows, selectedId, onSelect }: { rows: JsonRecord[]; selectedId?: string; onSelect: (row: JsonRecord) => void }) {
  return (
    <div className="slot-grid">
      {rows.map((row) => {
        const nodes = ((row.nodes_json as JsonRecord | undefined)?.nodes as unknown[] | undefined) || [];
        return (
          <button className={`slot-card interactive ${String(row.id) === selectedId ? "selected" : ""}`} key={String(row.id)} onClick={() => onSelect(row)}>
            <div className="slot-number">{displayValue(row.ring_name)}</div>
            <div className="subtle">{displayValue(row.owner_name)}</div>
            <div><Badge value={row.status} /></div>
            <div className="field-label">Nodes</div>
            <div className="field-value">{nodes.map(displayValue).join(", ")}</div>
            <div className="field-label">Circuits</div>
            <div className="field-value">{displayValue(row.circuit_count)}</div>
          </button>
        );
      })}
    </div>
  );
}
