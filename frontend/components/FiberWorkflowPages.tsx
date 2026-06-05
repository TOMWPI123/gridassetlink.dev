"use client";

import Link from "next/link";
import { Plus, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, displayValue, formatLabel } from "@/lib/api";
import type { JsonRecord } from "@/types";
import { Badge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";

type StrandAssignments = {
  fiber_cable: JsonRecord;
  strands: JsonRecord[];
  assignments: JsonRecord[];
  summary: Record<string, number>;
  validation_warnings: string[];
};

type SpliceMap = {
  fiber_cable?: JsonRecord;
  splice_closure?: JsonRecord;
  patch_panel?: JsonRecord;
  device?: JsonRecord;
  work_order?: JsonRecord;
  circuit?: JsonRecord;
  splices?: JsonRecord[];
  fiber_splices?: JsonRecord[];
  splice_trays?: JsonRecord[];
  splice_closures?: JsonRecord[];
  circuits?: JsonRecord[];
  ports?: JsonRecord[];
  device_ports?: JsonRecord[];
  fiber_assignments?: JsonRecord[];
  assignments?: JsonRecord[];
  fiber_strands?: JsonRecord[];
  fiber_tasks?: JsonRecord[];
  paths?: (JsonRecord & { elements?: JsonRecord[] })[];
  validation_warnings?: string[];
};

const assignmentFields = ["assignment_id", "fiber_strand_id", "circuit_id", "device_id", "device_port_id", "patch_panel_port_id", "work_order_id", "assignment_type", "assignment_status", "notes"];

export function FiberAssignmentsPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true);
    try { setRows(await apiFetch<JsonRecord[]>("/api/fiber-assignments")); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <div className="page-header">
        <div><h1 className="eyebrowless-title">Fiber Assignments</h1><div className="subtle">Circuit, device, port, patch panel, work order, and strand assignments</div></div>
        <div className="toolbar"><button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={16} /></button><Link className="button primary" href="/fiber-assignments/new"><Plus size={16} />New</Link></div>
      </div>
      {busy ? <div className="panel panel-body">Loading fiber assignments...</div> : <DataTable rows={rows} columns={["assignment_id", "assignment_type", "assignment_status", "fiber_strand_id", "circuit_id", "device_port_id", "work_order_id"]} filterField="assignment_status" />}
    </>
  );
}

export function FiberAssignmentNewPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<Record<string, string>>(() => Object.fromEntries(assignmentFields.map((field) => [field, field === "assignment_status" ? "planned" : field === "assignment_type" ? "circuit_transport" : ""])));
  const [allowConflict, setAllowConflict] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "").map(([key, value]) => [key, coerce(value)]));
    try {
      const result = await apiFetch<{ assignment: JsonRecord }>("/api/fiber-assignments", { method: "POST", body: JSON.stringify({ ...body, allow_conflict: allowConflict }) });
      router.push(`/fiber-assignments?created=${String(result.assignment.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create assignment");
    }
  }
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">New Fiber Assignment</h1><div className="subtle">Reserve or activate a strand against a circuit, port, device, panel, and work order</div></div></div>
      <form className="panel" onSubmit={submit}>
        <div className="panel-header"><strong>Assignment</strong>{error ? <span className="badge red">{error}</span> : null}</div>
        <div className="panel-body">
          <div className="form-grid">{assignmentFields.map((field) => <label key={field}><span className="field-label">{formatLabel(field)}</span><input className="input" value={payload[field]} onChange={(event) => setPayload({ ...payload, [field]: event.target.value })} /></label>)}</div>
          <label className="checkbox-row"><input type="checkbox" checked={allowConflict} onChange={(event) => setAllowConflict(event.target.checked)} />Allow active strand conflict as admin override</label>
          <button className="button primary" style={{ marginTop: 14 }}><Save size={16} />Save</button>
        </div>
      </form>
    </>
  );
}

export function FiberCableStrandAssignmentsPage({ id }: { id: string }) {
  const [data, setData] = useState<StrandAssignments | null>(null);
  useEffect(() => { apiFetch<StrandAssignments>(`/api/fiber-cables/${id}/strand-assignments`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading strand assignments...</div>;
  return (
    <>
      <WorkflowHeader title="Strand Assignment Grid" subtitle={displayValue(data.fiber_cable.cable_id)} warnings={data.validation_warnings} />
      <SummaryStrip summary={data.summary} />
      <StrandGrid strands={data.strands} />
      <Section title="Assignments"><DataTable rows={data.assignments} columns={["assignment_id", "assignment_type", "assignment_status", "circuit_id", "device_port_id", "work_order_id"]} /></Section>
    </>
  );
}

export function FiberCableSpliceMapPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/fiber-cables/${id}/splice-map`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading splice map...</div>;
  return (
    <>
      <WorkflowHeader title="Cable Splice Map" subtitle={displayValue(data.fiber_cable?.cable_id)} warnings={data.validation_warnings} />
      <Section title="Splices"><DataTable rows={data.splices || []} columns={["splice_closure_id", "splice_tray_id", "tray_position", "incoming_strand_number", "outgoing_strand_number", "splice_type", "loss_db", "status"]} /></Section>
      <Section title="Closures"><DataTable rows={data.splice_closures || []} columns={["closure_id", "closure_type", "location_name", "structure_number", "status"]} detailBase="/splice-closures" /></Section>
    </>
  );
}

export function SpliceClosureTraysPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/splice-closures/${id}/trays`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading trays...</div>;
  return <><WorkflowHeader title="Splice Trays" subtitle={displayValue(data.splice_closure?.closure_id)} warnings={data.validation_warnings} /><DataTable rows={data.splice_trays || []} columns={["tray_number", "tray_type", "capacity", "notes"]} /></>;
}

export function SpliceClosureSplicesPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/splice-closures/${id}/splices`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading closure splices...</div>;
  return (
    <>
      <WorkflowHeader title="Closure Splice Positions" subtitle={displayValue(data.splice_closure?.closure_id)} warnings={data.validation_warnings} />
      <Section title="Tray Layout"><TrayLayout rows={data.splices || []} /></Section>
      <Section title="Splice Records"><DataTable rows={data.splices || []} columns={["splice_tray_id", "tray_position", "incoming_strand_number", "outgoing_strand_number", "splice_type", "loss_db", "test_date", "status"]} /></Section>
      <Section title="Circuits Passing Through"><DataTable rows={data.circuits || []} columns={["circuit_id", "service_type", "criticality", "status"]} detailBase="/circuits" /></Section>
    </>
  );
}

export function PatchPanelPortMapPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/patch-panels/${id}/port-map`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading port map...</div>;
  return (
    <>
      <WorkflowHeader title="Patch Panel Port Map" subtitle={displayValue(data.patch_panel?.panel_id)} warnings={data.validation_warnings} />
      <PortGrid ports={data.ports || []} />
      <Section title="Assignments"><DataTable rows={data.assignments || []} columns={["assignment_id", "assignment_type", "assignment_status", "fiber_strand_id", "device_port_id", "circuit_id"]} /></Section>
    </>
  );
}

export function DeviceFiberConnectivityPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/devices/${id}/fiber-connectivity`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading device fiber connectivity...</div>;
  return (
    <>
      <WorkflowHeader title="Device Fiber Connectivity" subtitle={displayValue(data.device?.device_name)} warnings={data.validation_warnings} />
      <Section title="Device Ports"><DataTable rows={data.device_ports || []} columns={["port_name", "port_type", "port_role", "physical_label", "connected_patch_panel_port_id", "connected_fiber_strand_id", "connected_circuit_id", "status"]} /></Section>
      <Section title="Fiber Assignments"><DataTable rows={data.fiber_assignments || []} columns={["assignment_id", "assignment_type", "assignment_status", "fiber_strand_id", "circuit_id", "patch_panel_port_id"]} /></Section>
    </>
  );
}

export function CircuitFiberPathPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/circuits/${id}/fiber-path`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading circuit fiber path...</div>;
  return (
    <>
      <WorkflowHeader title="Circuit Fiber Path" subtitle={displayValue(data.circuit?.circuit_id)} warnings={data.validation_warnings} />
      <TraceBlocks paths={data.paths || []} />
      <Section title="Fiber Assignments"><DataTable rows={data.fiber_assignments || []} columns={["assignment_id", "assignment_type", "assignment_status", "fiber_strand_id", "device_port_id", "patch_panel_port_id"]} /></Section>
      <Section title="Splice Points"><DataTable rows={data.fiber_splices || []} columns={["splice_closure_id", "splice_tray_id", "tray_position", "incoming_strand_number", "outgoing_strand_number", "splice_type", "loss_db", "status"]} /></Section>
    </>
  );
}

export function WorkOrderFiberTasksPage({ id }: { id: string }) {
  const [data, setData] = useState<SpliceMap | null>(null);
  useEffect(() => { apiFetch<SpliceMap>(`/api/work-orders/${id}/fiber-tasks`).then(setData); }, [id]);
  if (!data) return <div className="panel panel-body">Loading work order fiber tasks...</div>;
  return (
    <>
      <WorkflowHeader title="Work Order Fiber Tasks" subtitle={displayValue(data.work_order?.work_order_number)} warnings={data.validation_warnings} />
      <Section title="Task Checklist"><DataTable rows={data.fiber_tasks || []} columns={["task_number", "task_title", "fiber_assignment_id", "fiber_strand_id", "fiber_splice_id", "patch_panel_port_id", "test_uploaded", "status"]} /></Section>
      <Section title="Assignments"><DataTable rows={data.fiber_assignments || []} columns={["assignment_id", "assignment_type", "assignment_status", "fiber_strand_id", "circuit_id", "device_port_id"]} /></Section>
    </>
  );
}

function WorkflowHeader({ title, subtitle, warnings = [] }: { title: string; subtitle: string; warnings?: string[] }) {
  return (
    <>
      <div className="page-header"><div><h1 className="eyebrowless-title">{title}</h1><div className="subtle">{subtitle}</div></div></div>
      {warnings.length ? <div className="warning-list">{warnings.map((warning) => <span className="badge high" key={warning}>{warning}</span>)}</div> : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 16 }}><div className="section-title">{title}</div>{children}</div>;
}

function SummaryStrip({ summary }: { summary: Record<string, number> }) {
  return <div className="metric-grid">{Object.entries(summary).map(([key, value]) => <div className="metric-card" key={key}><div className="subtle">{formatLabel(key)}</div><div className="metric-value">{value}</div></div>)}</div>;
}

function StrandGrid({ strands }: { strands: JsonRecord[] }) {
  return <div className="panel" style={{ marginTop: 16 }}><div className="panel-header"><strong>Strands</strong><span className="subtle">{strands.length} fibers</span></div><div className="panel-body strand-grid">{strands.map((strand) => <div className={`strand-cell ${displayValue(strand.status).toLowerCase()}`} key={String(strand.id)}><div className="strand-number">{displayValue(strand.strand_number)}</div><div>{displayValue(strand.strand_color || strand.color)}</div><Badge value={strand.status} /></div>)}</div></div>;
}

function PortGrid({ ports }: { ports: JsonRecord[] }) {
  return <div className="panel"><div className="panel-header"><strong>Ports</strong><span className="subtle">{ports.length} mapped ports</span></div><div className="panel-body port-grid">{ports.map((port) => <div className={`port-cell ${displayValue(port.status).toLowerCase()}`} key={String(port.id)}><strong>{displayValue(port.port_number)}</strong><span>{displayValue(port.port_label)}</span><Badge value={port.status} /><small>fiber {displayValue(port.connected_fiber_strand_id || port.fiber_strand_id)}</small><small>device port {displayValue(port.connected_device_port_id)}</small></div>)}</div></div>;
}

function TrayLayout({ rows }: { rows: JsonRecord[] }) {
  return <div className="panel"><div className="panel-body tray-grid">{rows.map((row) => <div className="tray-cell" key={String(row.id)}><strong>Pos {displayValue(row.tray_position)}</strong><span>{displayValue(row.splice_type)}</span><span>{displayValue(row.incoming_strand_number)} to {displayValue(row.outgoing_strand_number)}</span><Badge value={row.status} /></div>)}</div></div>;
}

function TraceBlocks({ paths }: { paths: (JsonRecord & { elements?: JsonRecord[] })[] }) {
  if (!paths.length) return <div className="panel panel-body">No circuit path records found.</div>;
  return <div style={{ display: "grid", gap: 14 }}>{paths.map((path) => <div className="panel" key={String(path.id)}><div className="panel-header"><strong>{displayValue(path.path_name)}</strong><Badge value={path.path_role} /></div><div className="panel-body timeline">{(path.elements || []).map((element, index) => <div className="trace-step" key={String(element.id ?? index)}><div className="trace-index">{displayValue(element.sequence_number)}</div><div><strong>{displayValue(element.element_label)}</strong><div className="subtle">{displayValue(element.element_type)}</div></div><Badge value={element.element_type} /></div>)}</div></div>)}</div>;
}

function coerce(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
