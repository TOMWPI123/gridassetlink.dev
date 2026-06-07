"use client";

import { Download, ExternalLink, Play, QrCode, Shield, TableProperties, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { apiDownload, apiFetch, displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";
import { Badge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";
import { dataSourceRecords, dataSourceSafetyNotes } from "@/data/dataSources";

export function SQLReportsPage() {
  const [reports, setReports] = useState<JsonRecord[]>([]);
  const [sql, setSql] = useState("select circuit_id, circuit_name, status from circuits");
  const [result, setResult] = useState<{ columns: string[]; rows: JsonRecord[] } | null>(null);
  useEffect(() => { apiFetch<JsonRecord[]>("/api/reports/saved").then((data) => { setReports(data); if (data[0]) setSql(String(data[0].sql_text)); }); }, []);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">SQL Reports</h1><div className="subtle">Saved reports and SELECT-only explorer</div></div><button className="button primary" onClick={() => apiFetch<{ columns: string[]; rows: JsonRecord[] }>("/api/sql/select", { method: "POST", body: JSON.stringify({ sql, limit: 100 }) }).then(setResult)}><Play size={16} />Run</button></div><div style={{ display: "grid", gridTemplateColumns: "minmax(260px,.75fr) minmax(0,1.25fr)", gap: 16 }}><div className="panel"><div className="panel-header"><strong>Saved Reports</strong></div><div className="panel-body timeline">{reports.map((report) => <button className="trace-step" key={String(report.id)} onClick={() => setSql(String(report.sql_text))}><div className="trace-index">SQL</div><div style={{ textAlign: "left" }}><strong>{String(report.report_name)}</strong><div className="subtle">{String(report.description || "")}</div></div><Badge value="saved" /></button>)}</div></div><div className="panel"><div className="panel-header"><strong>Explorer</strong></div><div className="panel-body"><textarea className="textarea" style={{ minHeight: 180, fontFamily: "var(--font-geist-mono)" }} value={sql} onChange={(e) => setSql(e.target.value)} />{result ? <DataTable rows={result.rows} columns={result.columns} /> : null}</div></div></div></>;
}

export function OutageImpactPage() {
  const [target, setTarget] = useState("fiber-cables");
  const [id, setId] = useState("1");
  const [result, setResult] = useState<JsonRecord | null>(null);
  const circuits = Array.isArray(result?.affected_circuits) ? result.affected_circuits as JsonRecord[] : [];
  const orders = Array.isArray(result?.affected_work_orders) ? result.affected_work_orders as JsonRecord[] : [];
  return <><div className="page-header"><div><h1 className="eyebrowless-title">Outage Impact</h1><div className="subtle">Fiber cable and splice closure impact analysis</div></div><div className="toolbar"><select className="select" value={target} onChange={(e) => setTarget(e.target.value)}><option value="fiber-cables">fiber cable</option><option value="splice-closures">splice closure</option></select><input className="input" style={{ width: 120 }} value={id} onChange={(e) => setId(e.target.value)} /><button className="button primary" onClick={() => apiFetch<JsonRecord>(target === "splice-closures" ? `/api/splice-closures/${id}/impact` : `/api/fiber-cables/${id}/impact`).then(setResult)}><Shield size={16} />Analyze</button></div></div><div style={{ display: "grid", gap: 16 }}><DataTable rows={circuits} columns={["circuit_id", "circuit_name", "service_type", "criticality", "status"]} detailBase="/circuits" /><DataTable rows={orders} columns={["work_order_number", "title", "priority", "status"]} detailBase="/work-orders" /></div></>;
}

export function QRLabelsPage() {
  const [entityType, setEntityType] = useState("devices");
  const [entityId, setEntityId] = useState("WBS-ICON-01");
  const [created, setCreated] = useState<JsonRecord | null>(null);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">QR Labels</h1><div className="subtle">Permanent cloud links for field assets</div></div><button className="button primary" onClick={() => apiFetch<JsonRecord>("/api/qr/generate", { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_id: entityId, label_text: entityId }) }).then(setCreated)}><QrCode size={16} />Generate</button></div><div className="panel"><div className="panel-body form-grid"><label><span className="field-label">Entity type</span><input className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)} /></label><label><span className="field-label">Entity id</span><input className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)} /></label></div></div>{created ? <div className="panel" style={{ marginTop: 16 }}><div className="panel-header"><strong>{displayValue(created.label_text)}</strong><Badge value="stubbed" /></div><div className="panel-body"><div style={{ width: 180, height: 180, border: "12px solid #14202d", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 28 }}>QR</div><div className="subtle" style={{ marginTop: 12 }}>{displayValue(created.permanent_url)}</div></div></div> : null}</>;
}

export function ImportExportPage() {
  const [entity, setEntity] = useState("substations");
  const [result, setResult] = useState<JsonRecord | null>(null);
  return <><div className="page-header"><div><h1 className="eyebrowless-title">Import / Export</h1><div className="subtle">CSV templates, validation preview, and table exports</div></div><div className="toolbar"><button className="button" onClick={() => apiFetch<JsonRecord>("/api/import/csv", { method: "POST", body: JSON.stringify({ entity, rows: [{ substation_code: "DEMO", name: "Demo Substation" }] }) }).then(setResult)}><Upload size={16} />Validate</button><button className="button primary" onClick={() => apiDownload(`/api/export/${entity}`, `${entity}.csv`)}><Download size={16} />Export</button></div></div><div className="panel"><div className="panel-body"><select className="select" value={entity} onChange={(e) => setEntity(e.target.value)}>{["substations", "devices", "device-ports", "icon-nodes", "fiber-cables", "fiber-strands", "patch-panels", "patch-panel-ports", "splice-closures", "circuits", "leased-services", "work-orders"].map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>{result ? <DataTable rows={[result]} columns={["entity", "row_count", "valid", "commit_supported"]} /> : null}</>;
}

export function DataSourcesPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="eyebrowless-title">Data Sources</h1>
          <div className="subtle">Public references, OpenStreetMap attribution, and synthetic planning-data boundaries</div>
        </div>
        <div className="toolbar">
          <button className="button" type="button" onClick={() => openDemoSafetyModal("disclaimer")}>
            <Shield size={16} />
            Demo Disclaimer
          </button>
          <button className="button primary" type="button" onClick={() => openDemoSafetyModal("sources")}>
            <TableProperties size={16} />
            Open Sources Modal
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <strong>Operating boundary</strong>
          <Badge value="no sensitive data" />
        </div>
        <div className="panel-body data-source-note-list">
          {dataSourceSafetyNotes.map((note) => <p key={note}>{note}</p>)}
        </div>
      </div>
      <div className="data-source-page-grid">
        {dataSourceRecords.map((source) => (
          <article className="panel data-source-page-card" key={source.name}>
            <div className="panel-header">
              <div>
                <strong>{source.name}</strong>
                <div className="subtle">{source.category}</div>
              </div>
              {source.url ? (
                <a className="button" href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  Source
                </a>
              ) : <TableProperties size={16} />}
            </div>
            <div className="panel-body">
              <p>{source.role}</p>
              <div className="subtle">{source.handling}</div>
              <dl className="data-source-page-meta">
                <div><dt>Source ID</dt><dd>{source.id}</dd></div>
                <div><dt>Dataset type</dt><dd>{source.type}</dd></div>
                <div><dt>Last reviewed</dt><dd>{source.lastReviewed}</dd></div>
                <div><dt>Notes</dt><dd>{source.notes}</dd></div>
              </dl>
              {source.generatedFiles?.length ? (
                <div className="data-source-files">
                  {source.generatedFiles.map((file) => <code key={file}>{file}</code>)}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function openDemoSafetyModal(view: "disclaimer" | "sources") {
  window.dispatchEvent(new Event(view === "sources" ? "gridassetlink:open-data-sources" : "gridassetlink:open-demo-disclaimer"));
}

export function AdminSettingsPage() {
  return <><div className="page-header"><div><h1 className="eyebrowless-title">Settings</h1><div className="subtle">Security, imports, QR links, and deployment configuration</div></div></div><div className="metric-grid">{["JWT authentication", "Role-based API permissions", "SELECT-only SQL analyst access", "CSV validation preview", "QR permanent links", "PostGIS-ready schema"].map((item) => <div className="metric-card" key={item}><div className="subtle">Enabled</div><div className="metric-value" style={{ fontSize: 20 }}>{item}</div></div>)}</div></>;
}
