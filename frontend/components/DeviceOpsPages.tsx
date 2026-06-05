"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardList, GitCompare, Plus, RefreshCw, Save, Send, Settings, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badges";
import { DataTable } from "@/components/DataTable";
import { apiFetch, displayValue, formatLabel } from "@/lib/api";
import type { JsonRecord } from "@/types";

type SummaryCard = { label: string; value: unknown };
type SummaryPayload = { latest_snapshot?: JsonRecord | null; cards?: SummaryCard[]; recent_proposed_changes?: JsonRecord[]; recent_work_orders?: JsonRecord[] };
type DevicePayload = {
  actual?: JsonRecord;
  planned?: JsonRecord | null;
  source_status?: string;
  ports?: JsonRecord[];
  circuits?: JsonRecord[];
  proposed_changes?: JsonRecord[];
  work_orders?: JsonRecord[];
  alarms?: JsonRecord[];
  commissioning?: JsonRecord[];
  fiber_connectivity?: JsonRecord[];
  qr_link?: string;
  diffs?: JsonRecord[];
  icon_node?: JsonRecord | null;
  engineering_profile?: JsonRecord | null;
  slots?: JsonRecord[];
  modules?: JsonRecord[];
  services?: JsonRecord[];
  proposed_services?: JsonRecord[];
  timing?: JsonRecord[];
  security_parameters?: JsonRecord;
};

const diffColumns = ["field", "actual", "planned", "proposed", "severity", "notes"];
const serviceColumns = ["service_name", "service_type", "a_end", "z_end", "circuit", "status", "latency_requirement_ms", "measured_latency_ms", "fiber_path"];
const changeColumns = ["change_number", "title", "change_type", "risk_level", "engineering_status", "approval_status", "related_work_order_id"];

export function DeviceOpsOverviewPage() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  async function load() {
    setBusy(true);
    try { setData(await apiFetch<SummaryPayload>("/api/deviceops/summary")); } finally { setBusy(false); }
  }
  async function refresh() {
    setMessage("Refreshing operational API...");
    await apiFetch("/api/operational/refresh", { method: "POST", body: JSON.stringify({}) });
    setMessage("Operational snapshot refreshed.");
    await load();
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="DeviceOps Dashboard" subtitle="Actual, planned, proposed, and as-built operational planning for network devices" actions={<><button className="button" onClick={refresh}><RefreshCw size={16} />Refresh Actual State</button><Link className="button primary" href="/deviceops/change-requests"><Plus size={16} />Propose Change</Link></>} />
      {message ? <div className="warning-list"><span className="badge active">{message}</span></div> : null}
      {busy ? <Loading label="Loading DeviceOps summary..." /> : <MetricCards cards={data?.cards || []} />}
      <div className="two-column" style={{ marginTop: 16 }}>
        <Section title="Recent Proposed Changes"><DataTable rows={data?.recent_proposed_changes || []} columns={changeColumns} detailBase="/deviceops/change-requests" /></Section>
        <Section title="Generated Work Orders"><DataTable rows={data?.recent_work_orders || []} columns={["work_order_number", "title", "work_type", "priority", "status"]} detailBase="/work-orders" /></Section>
      </div>
    </>
  );
}

export function DeviceOpsDevicesPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true);
    try { setRows(await apiFetch<JsonRecord[]>("/api/operational/devices")); } finally { setBusy(false); }
  }
  async function refresh() {
    await apiFetch("/api/operational/refresh", { method: "POST", body: JSON.stringify({}) });
    await load();
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="Operational Devices" subtitle="Planning database and operational API devices with source badges and match status" actions={<button className="icon-button" onClick={refresh} title="Refresh actual state"><RefreshCw size={16} /></button>} />
      {busy ? <Loading label="Loading devices..." /> : <DataTable rows={rows} columns={["device_name", "source", "device_type", "manufacturer", "substation_code", "firmware_version", "criticality", "operational_status", "alarm_status", "timing_status", "match_status"]} detailBase="/deviceops/devices" filterField="device_type" />}
    </>
  );
}

export function DeviceOpsDeviceDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<DevicePayload | null>(null);
  const [tab, setTab] = useState("Overview");
  useEffect(() => { apiFetch<DevicePayload>(`/api/operational/devices/${id}`).then(setData); }, [id]);
  if (!data) return <Loading label="Loading device operational dashboard..." />;
  const actual = data.actual || {};
  const isIcon = displayValue(actual.device_type) === "SEL_ICON";
  const tabs = ["Overview", "Operational API State", "Planned State", "Proposed Changes", "Ports", "Fiber Connectivity", "Circuits", "Work Orders", "Alarms", "Commissioning", "Attachments", "Audit Log", ...(isIcon ? ["ICON Slots", "ICON Modules", "ICON Services", "Timing", "Protection Services", "TDM / DS1 / DS0", "Ethernet / VLAN / VSN", "NMS / Security", "Commissioning Tests"] : [])];
  return (
    <>
      <DeviceHeader actual={actual} planned={data.planned} sourceStatus={data.source_status} qrLink={data.qr_link} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "Overview" ? <OverviewPanel data={data} /> : null}
      {tab === "Operational API State" ? <RecordPanel title="Actual State" record={actual} /> : null}
      {tab === "Planned State" ? <RecordPanel title="Planned State" record={data.planned || {}} /> : null}
      {tab === "Proposed Changes" ? <DataTable rows={data.proposed_changes || []} columns={changeColumns} detailBase="/deviceops/change-requests" /> : null}
      {tab === "Ports" ? <DataTable rows={data.ports || []} columns={["port_name", "port_type", "port_speed", "admin_status", "operational_status", "assigned_service", "assigned_circuit", "match_status"]} /> : null}
      {tab === "Fiber Connectivity" ? <DataTable rows={data.fiber_connectivity || []} columns={["assignment_id", "assignment_type", "assignment_status", "fiber_strand_id", "circuit_id", "device_port_id", "patch_panel_port_id"]} /> : null}
      {tab === "Circuits" ? <DataTable rows={data.circuits || []} columns={["external_circuit_id", "circuit_name", "service_type", "transport_type", "operational_status", "measured_latency_ms", "alarm_status"]} /> : null}
      {tab === "Work Orders" ? <DataTable rows={data.work_orders || []} columns={["work_order_number", "title", "priority", "status", "outage_required", "protection_impact"]} detailBase="/work-orders" /> : null}
      {tab === "Alarms" ? <DataTable rows={data.alarms || []} columns={["device_name", "severity", "alarm_type", "message", "raised_at"]} /> : null}
      {tab === "Commissioning" || tab === "Commissioning Tests" ? <ChecklistList rows={data.commissioning || []} /> : null}
      {tab === "Attachments" ? <EmptyPanel label="No DeviceOps attachment rows are linked in this MVP view." /> : null}
      {tab === "Audit Log" ? <EmptyPanel label="Audit events are recorded by backend actions and can be queried from Admin Audit Log." /> : null}
      {tab === "ICON Slots" ? <SlotLayout rows={data.slots || []} /> : null}
      {tab === "ICON Modules" ? <SlotLayout rows={data.modules || []} /> : null}
      {tab === "ICON Services" ? <DataTable rows={data.services || []} columns={serviceColumns} /> : null}
      {tab === "Timing" ? <DataTable rows={data.timing || []} columns={["device_name", "timing_status", "source"]} /> : null}
      {tab === "Protection Services" ? <DataTable rows={(data.services || []).filter((row) => ["C37.94", "87L", "DTT"].includes(displayValue(row.service_type)))} columns={serviceColumns} /> : null}
      {tab === "TDM / DS1 / DS0" ? <DataTable rows={(data.services || []).filter((row) => ["DS1", "DS0", "E1", "E0"].includes(displayValue(row.service_type)))} columns={serviceColumns} /> : null}
      {tab === "Ethernet / VLAN / VSN" ? <DataTable rows={(data.services || []).filter((row) => ["Ethernet", "Ethernet_Pipe", "VLAN", "VSN"].includes(displayValue(row.service_type)))} columns={serviceColumns} /> : null}
      {tab === "NMS / Security" ? <RecordPanel title="Security / Management Parameters" record={data.security_parameters || {}} /> : null}
    </>
  );
}

export function DeviceOpsIconPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true);
    try { setRows(await apiFetch<JsonRecord[]>("/api/operational/icon")); } finally { setBusy(false); }
  }
  async function refresh() {
    await apiFetch("/api/operational/refresh", { method: "POST", body: JSON.stringify({}) });
    await load();
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="SEL ICON Dashboard" subtitle="ICON node health, timing, firmware, services, ports, alarms, and proposed changes" actions={<button className="icon-button" onClick={refresh} title="Refresh ICON state"><RefreshCw size={16} /></button>} />
      {busy ? <Loading label="Loading ICON nodes..." /> : <DataTable rows={rows} columns={["device_name", "transport_mode", "timing_status", "firmware_version", "open_alarms", "pending_proposed_changes", "service_count", "active_circuits", "port_utilization", "match_status"]} detailBase="/deviceops/icon" filterField="timing_status" />}
    </>
  );
}

export function DeviceOpsIconDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<DevicePayload | null>(null);
  const [tab, setTab] = useState("Overview");
  useEffect(() => { apiFetch<DevicePayload>(`/api/operational/icon/${id}`).then(setData); }, [id]);
  if (!data) return <Loading label="Loading ICON node..." />;
  const actual = data.actual || {};
  const tabs = ["Overview", "Slot / Module Layout", "Provisioned Services", "Proposed Changes", "Timing", "Protection Services", "TDM / DS1 / DS0", "Ethernet / VLAN / VSN", "Commissioning Checklist", "Engineering Profile", "NMS / Security"];
  return (
    <>
      <DeviceHeader actual={actual} planned={data.planned} sourceStatus={data.source_status} qrLink={data.qr_link} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "Overview" ? <IconOverview data={data} /> : null}
      {tab === "Slot / Module Layout" ? <SlotLayout rows={data.slots || []} /> : null}
      {tab === "Provisioned Services" ? <DataTable rows={data.services || []} columns={serviceColumns} /> : null}
      {tab === "Proposed Changes" ? <DataTable rows={data.proposed_changes || []} columns={changeColumns} detailBase="/deviceops/change-requests" /> : null}
      {tab === "Timing" ? <DataTable rows={data.timing || []} columns={["device_name", "timing_status", "source"]} /> : null}
      {tab === "Protection Services" ? <DataTable rows={(data.services || []).filter((row) => ["C37.94", "87L", "DTT"].includes(displayValue(row.service_type)))} columns={serviceColumns} /> : null}
      {tab === "TDM / DS1 / DS0" ? <DataTable rows={(data.services || []).filter((row) => ["DS1", "DS0", "E1", "E0"].includes(displayValue(row.service_type)))} columns={serviceColumns} /> : null}
      {tab === "Ethernet / VLAN / VSN" ? <DataTable rows={(data.services || []).filter((row) => ["Ethernet", "Ethernet_Pipe", "VLAN", "VSN"].includes(displayValue(row.service_type)))} columns={serviceColumns} /> : null}
      {tab === "Commissioning Checklist" ? <ChecklistList rows={data.commissioning || []} /> : null}
      {tab === "Engineering Profile" ? <RecordPanel title="ICON Engineering Profile" record={data.engineering_profile || {}} /> : null}
      {tab === "NMS / Security" ? <RecordPanel title="Security / Management Parameters" record={data.security_parameters || {}} /> : null}
    </>
  );
}

export function DeviceOpsIconServicesPage({ id }: { id: string }) {
  const [data, setData] = useState<DevicePayload | null>(null);
  useEffect(() => { apiFetch<DevicePayload>(`/api/operational/icon/${id}`).then(setData); }, [id]);
  if (!data) return <Loading label="Loading ICON services..." />;
  return (
    <>
      <PageHeader title="ICON Services" subtitle={displayValue(data.actual?.device_name)} />
      <Section title="Operational Services"><DataTable rows={data.services || []} columns={[...serviceColumns, "proposed_change_status", "work_order"]} /></Section>
      <Section title="Proposed New / Removal / Migration Services"><DataTable rows={data.proposed_services || []} columns={["service_name", "service_type", "validation_status", "commissioning_status", "circuit_id", "proposed_change_id"]} /></Section>
    </>
  );
}

export function DeviceOpsIconProposedChangesPage({ id }: { id: string }) {
  const [data, setData] = useState<DevicePayload | null>(null);
  useEffect(() => { apiFetch<DevicePayload>(`/api/operational/icon/${id}`).then(setData); }, [id]);
  if (!data) return <Loading label="Loading proposed ICON changes..." />;
  return (
    <>
      <PageHeader title="Proposed ICON Changes" subtitle={displayValue(data.actual?.device_name)} actions={<Link className="button primary" href="/deviceops/change-requests"><Plus size={16} />New Change</Link>} />
      <DataTable rows={data.proposed_changes || []} columns={changeColumns} detailBase="/deviceops/change-requests" />
    </>
  );
}

export function DeviceOpsComparePage() {
  const [mode, setMode] = useState("actual-vs-planned");
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const modes = ["actual-vs-planned", "planned-vs-proposed", "actual-vs-proposed", "proposed-vs-as-built", "as-built-vs-actual"];
  useEffect(() => { apiFetch<JsonRecord[]>(`/api/compare/${mode}`).then(setRows); }, [mode]);
  return (
    <>
      <PageHeader title="DeviceOps Compare" subtitle="Difference reports between actual, planned, proposed, and as-built workflow states" actions={<Link className="button" href="/sql-reports"><GitCompare size={16} />Saved SQL Reports</Link>} />
      <Tabs tabs={modes.map(formatLabel)} active={formatLabel(mode)} onChange={(value) => setMode(value.toLowerCase().replaceAll(" ", "-"))} />
      <DataTable rows={rows} columns={diffColumns} filterField="severity" />
    </>
  );
}

export function DeviceOpsCommissioningPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [selected, setSelected] = useState<JsonRecord | null>(null);
  async function load() {
    const data = await apiFetch<JsonRecord[]>("/api/commissioning/checklists");
    setRows(data);
    setSelected(data[0] || null);
  }
  async function completeFirst() {
    const item = ((selected?.items as JsonRecord[] | undefined) || []).find((row) => displayValue(row.status) === "not_started");
    if (!selected || !item) return;
    await apiFetch(`/api/commissioning/checklists/${selected.id}/complete-item`, { method: "POST", body: JSON.stringify({ item_id: item.id, status: "pass", actual_result: "Passed from DeviceOps MVP UI" }) });
    await load();
  }
  async function attachEvidence() {
    const item = ((selected?.items as JsonRecord[] | undefined) || [])[0];
    if (!selected) return;
    await apiFetch(`/api/commissioning/checklists/${selected.id}/attach-evidence`, { method: "POST", body: JSON.stringify({ item_id: item?.id, filename: "deviceops-test-evidence.txt", file_url: "/uploads/deviceops-test-evidence.txt", attachment_type: "test_evidence", notes: "Evidence stub from DeviceOps MVP UI" }) });
    await load();
  }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="Commissioning" subtitle="Reusable checklists with expected results, actual results, evidence, and closeout status" actions={<><button className="button" onClick={completeFirst}><CheckCircle2 size={16} />Pass First Open Item</button><button className="button" onClick={attachEvidence}><Plus size={16} />Attach Evidence</button></>} />
      <div className="two-column">
        <Section title="Checklists"><DataTable rows={rows} columns={["checklist_name", "entity_type", "entity_id", "checklist_type", "status", "manual_reference"]} filterField="status" /></Section>
        <Section title="Selected Checklist">{selected ? <ChecklistDetail checklist={selected} /> : <EmptyPanel label="No commissioning checklists found." />}</Section>
      </div>
    </>
  );
}

export function DeviceOpsServiceTemplatesPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [selected, setSelected] = useState<JsonRecord | null>(null);
  useEffect(() => { apiFetch<JsonRecord[]>("/api/icon/service-templates").then((data) => { setRows(data); setSelected(data[0] || null); }); }, []);
  return (
    <>
      <PageHeader title="Service Installation Templates" subtitle="SEL ICON service templates with reference placeholders, required fields, validation checks, commissioning steps, and evidence requirements" />
      <div className="two-column">
        <Section title="Templates"><DataTable rows={rows} columns={["template_name", "service_type", "manual_reference", "created_by_user_id"]} filterField="service_type" /></Section>
        <Section title="Template Parameters">{selected ? <RecordPanel title={displayValue(selected.template_name)} record={selected} /> : <EmptyPanel label="No templates found." />}</Section>
      </div>
    </>
  );
}

export function DeviceOpsChangeRequestsPage() {
  const [rows, setRows] = useState<JsonRecord[]>([]);
  async function load() { setRows(await apiFetch<JsonRecord[]>("/api/proposed-changes")); }
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="Proposed Change Requests" subtitle="Stage, validate, review, approve, convert to work order, and reconcile DeviceOps changes" />
      <ProposedChangeWizard onCreated={load} />
      <Section title="Change Requests"><DataTable rows={rows} columns={changeColumns} detailBase="/deviceops/change-requests" filterField="approval_status" /></Section>
    </>
  );
}

export function DeviceOpsChangeRequestDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<JsonRecord | null>(null);
  const [message, setMessage] = useState("");
  async function load() { setData(await apiFetch<JsonRecord>(`/api/proposed-changes/${id}`)); }
  async function action(name: string, body: JsonRecord = {}) {
    setMessage(`${formatLabel(name)}...`);
    await apiFetch(`/api/proposed-changes/${id}/${name}`, { method: "POST", body: JSON.stringify(body) });
    setMessage(`${formatLabel(name)} complete.`);
    await load();
  }
  useEffect(() => { load(); }, [id]);
  if (!data) return <Loading label="Loading proposed change..." />;
  return (
    <>
      <PageHeader title={displayValue(data.title)} subtitle={`${displayValue(data.change_number)} - ${displayValue(data.change_type)}`} actions={<button className="button" onClick={() => router.push("/deviceops/change-requests")}><ClipboardList size={16} />All Changes</button>} />
      {message ? <div className="warning-list"><span className="badge active">{message}</span></div> : null}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <button className="button" onClick={() => action("submit")}><Send size={16} />Submit</button>
        <button className="button" onClick={() => action("approve")}><CheckCircle2 size={16} />Approve</button>
        <button className="button" onClick={() => action("reject", { reason: "Rejected from DeviceOps MVP UI" })}><XCircle size={16} />Reject</button>
        <button className="button primary" onClick={() => action("convert-to-work-order")}><ClipboardList size={16} />Generate Work Order</button>
        <button className="button" onClick={() => action("reconcile")}><RefreshCw size={16} />Mark As-Built / Reconciled</button>
      </div>
      <MetricCards cards={[{ label: "Engineering status", value: data.engineering_status }, { label: "Approval status", value: data.approval_status }, { label: "Risk level", value: data.risk_level }, { label: "Work order", value: (data.work_order as JsonRecord | undefined)?.work_order_number || data.related_work_order_id || "-" }]} />
      <div className="two-column" style={{ marginTop: 16 }}>
        <RecordPanel title="Proposed Change" record={data} />
        <RecordPanel title="Proposed Parameters" record={(data.proposed_state_json as JsonRecord | undefined) || {}} />
      </div>
      <Section title="Actual / Planned / Proposed Diff"><DataTable rows={(data.diffs as JsonRecord[] | undefined) || []} columns={diffColumns} filterField="severity" /></Section>
    </>
  );
}

function ProposedChangeWizard({ onCreated }: { onCreated: () => void }) {
  const [templates, setTemplates] = useState<JsonRecord[]>([]);
  const [nodes, setNodes] = useState<JsonRecord[]>([]);
  const [form, setForm] = useState<Record<string, string>>({
    service_template_id: "",
    service_type: "C37.94",
    service_name: "87L-WBS-AUB-002",
    circuit_id: "87L-WBS-AUB-002",
    a_end_node_id: "",
    z_end_node_id: "",
    risk_level: "high",
    latency_requirement_ms: "8",
    relay_a: "WBS-SEL411L-01",
    relay_b: "AUB-SEL411L-01",
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiFetch<JsonRecord[]>("/api/icon/service-templates").then((data) => {
      setTemplates(data);
      const c3794 = data.find((row) => displayValue(row.service_type) === "C37.94") || data[0];
      if (c3794) setForm((current) => ({ ...current, service_template_id: String(c3794.id || ""), service_type: displayValue(c3794.service_type) }));
    });
    apiFetch<JsonRecord[]>("/api/icon-nodes").then((data) => {
      setNodes(data);
      setForm((current) => ({ ...current, a_end_node_id: String(data[0]?.id || ""), z_end_node_id: String(data[1]?.id || data[0]?.id || "") }));
    });
  }, []);
  const selectedTemplate = useMemo(() => templates.find((row) => String(row.id) === form.service_template_id), [form.service_template_id, templates]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const serviceType = form.service_type || displayValue(selectedTemplate?.service_type);
    const proposedState = {
      service_template_id: numberOrString(form.service_template_id),
      service_name: form.service_name,
      service_type: serviceType,
      a_end_node_id: numberOrString(form.a_end_node_id),
      z_end_node_id: numberOrString(form.z_end_node_id),
      circuit_id: form.circuit_id,
      relay_a: form.relay_a,
      relay_b: form.relay_b,
      latency_requirement_ms: Number(form.latency_requirement_ms || 0),
      protection_class: serviceType === "C37.94" ? "87L" : serviceType,
      diversity_required: true,
      manual_reference: "SEL manual section placeholder",
      engineering_standard_reference: "TelecomNE internal engineering standard placeholder",
    };
    await apiFetch("/api/proposed-changes", {
      method: "POST",
      body: JSON.stringify({
        title: `Add ${serviceType} service for ${form.circuit_id}`,
        description: "Created from DeviceOps proposed change wizard.",
        change_type: "add_icon_service",
        target_entity_type: "icon_node",
        target_entity_id: numberOrString(form.a_end_node_id),
        risk_level: form.risk_level,
        proposed_state_json: proposedState,
      }),
    });
    setMessage("Proposed change created as a staged, read-only network change.");
    onCreated();
  }
  return (
    <form className="panel" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="panel-header"><strong>Proposed Change Wizard</strong><span className="subtle">Target, template, parameters, validate, review, submit, generate work order</span></div>
      <div className="panel-body">
        {message ? <div className="warning-list"><span className="badge active">{message}</span></div> : null}
        <div className="wizard-steps">
          {["Select target device", "Select change type", "Select service template", "Enter engineering parameters", "Validate conflicts", "Review diff", "Submit for approval", "Generate work order"].map((step, index) => <div className="wizard-step" key={step}><strong>{index + 1}</strong><span>{step}</span></div>)}
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label><span className="field-label">Service Template</span><select className="select" value={form.service_template_id} onChange={(event) => setForm({ ...form, service_template_id: event.target.value, service_type: displayValue(templates.find((row) => String(row.id) === event.target.value)?.service_type || form.service_type) })}>{templates.map((row) => <option value={String(row.id)} key={String(row.id)}>{displayValue(row.template_name)}</option>)}</select></label>
          <label><span className="field-label">Service Type</span><input className="input" value={form.service_type} onChange={(event) => setForm({ ...form, service_type: event.target.value })} /></label>
          <label><span className="field-label">A-End ICON Node</span><select className="select" value={form.a_end_node_id} onChange={(event) => setForm({ ...form, a_end_node_id: event.target.value })}>{nodes.map((row) => <option value={String(row.id)} key={String(row.id)}>{displayValue(row.node_name)}</option>)}</select></label>
          <label><span className="field-label">Z-End ICON Node</span><select className="select" value={form.z_end_node_id} onChange={(event) => setForm({ ...form, z_end_node_id: event.target.value })}>{nodes.map((row) => <option value={String(row.id)} key={String(row.id)}>{displayValue(row.node_name)}</option>)}</select></label>
          <label><span className="field-label">Circuit ID</span><input className="input" value={form.circuit_id} onChange={(event) => setForm({ ...form, circuit_id: event.target.value, service_name: event.target.value })} /></label>
          <label><span className="field-label">Latency Requirement MS</span><input className="input" value={form.latency_requirement_ms} onChange={(event) => setForm({ ...form, latency_requirement_ms: event.target.value })} /></label>
          <label><span className="field-label">Relay A</span><input className="input" value={form.relay_a} onChange={(event) => setForm({ ...form, relay_a: event.target.value })} /></label>
          <label><span className="field-label">Relay B</span><input className="input" value={form.relay_b} onChange={(event) => setForm({ ...form, relay_b: event.target.value })} /></label>
        </div>
        <button className="button primary" style={{ marginTop: 14 }}><Save size={16} />Create Staged Change</button>
      </div>
    </form>
  );
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><h1 className="eyebrowless-title">{title}</h1><div className="subtle">{subtitle}</div></div>{actions ? <div className="toolbar">{actions}</div> : null}</div>;
}

function DeviceHeader({ actual, planned, sourceStatus, qrLink }: { actual: JsonRecord; planned?: JsonRecord | null; sourceStatus?: string; qrLink?: string }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="eyebrowless-title">{displayValue(actual.device_name)}</h1>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <Badge value={actual.device_type} /><Badge value={actual.operational_status} /><Badge value={sourceStatus || actual.match_status} />
          <SourceBadge value={displayValue(sourceStatus) === "unmatched_planned_only" ? "Planned" : "Actual"} />
          {displayValue(sourceStatus).includes("proposed") ? <SourceBadge value="Proposed" /> : null}
          <span className="subtle">Substation {displayValue(actual.substation_code)}</span>
          <span className="subtle">Firmware {displayValue(actual.firmware_version || planned?.firmware_version)}</span>
        </div>
      </div>
      <div className="toolbar">{qrLink ? <Link className="button" href={qrLink}>QR Link</Link> : null}<Link className="button" href="/deviceops/compare"><GitCompare size={16} />Compare</Link></div>
    </div>
  );
}

function OverviewPanel({ data }: { data: DevicePayload }) {
  return (
    <>
      <MetricCards cards={[
        { label: "Ports", value: data.ports?.length || 0 },
        { label: "Circuits", value: data.circuits?.length || 0 },
        { label: "Proposed changes", value: data.proposed_changes?.length || 0 },
        { label: "Open work orders", value: data.work_orders?.length || 0 },
        { label: "Alarms", value: data.alarms?.length || 0 },
        { label: "Diffs", value: data.diffs?.length || 0 },
      ]} />
      <Section title="Diff Table"><DataTable rows={data.diffs || []} columns={diffColumns} filterField="severity" /></Section>
    </>
  );
}

function IconOverview({ data }: { data: DevicePayload }) {
  return (
    <>
      <MetricCards cards={[
        { label: "Slots", value: data.slots?.length || 0 },
        { label: "Operational services", value: data.services?.length || 0 },
        { label: "Proposed services", value: data.proposed_services?.length || 0 },
        { label: "Timing alarms", value: (data.timing || []).filter((row) => displayValue(row.timing_status) !== "normal").length },
      ]} />
      <div className="two-column" style={{ marginTop: 16 }}>
        <Section title="Slot Layout"><SlotLayout rows={data.slots || []} /></Section>
        <Section title="Services"><DataTable rows={data.services || []} columns={serviceColumns} /></Section>
      </div>
    </>
  );
}

function MetricCards({ cards }: { cards: SummaryCard[] }) {
  return <div className="metric-grid">{cards.map((card) => <div className="metric-card" key={card.label}><div className="subtle">{card.label}</div><div className="metric-value">{displayValue(card.value)}</div></div>)}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 16 }}><div className="section-title">{title}</div>{children}</div>;
}

function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return <div className="tabs">{tabs.map((tab) => <button className={`tab ${active === tab ? "active" : ""}`} key={tab} onClick={() => onChange(tab)}>{tab}</button>)}</div>;
}

function RecordPanel({ title, record }: { title: string; record: JsonRecord }) {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && typeof value !== "object");
  const jsonEntries = Object.entries(record).filter(([, value]) => value && typeof value === "object");
  return (
    <div className="panel">
      <div className="panel-header"><strong>{title}</strong><Settings size={16} /></div>
      <div className="panel-body detail-grid">
        {entries.map(([key, value]) => <div className="field" key={key}><div className="field-label">{formatLabel(key)}</div><div className="field-value">{displayValue(value)}</div></div>)}
        {jsonEntries.map(([key, value]) => <div className="field" style={{ gridColumn: "1 / -1" }} key={key}><div className="field-label">{formatLabel(key)}</div><pre className="json-block">{JSON.stringify(value, null, 2)}</pre></div>)}
      </div>
    </div>
  );
}

function SlotLayout({ rows }: { rows: JsonRecord[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (!rows.length) return <EmptyPanel label="No slot/module records found." />;
  const selected = rows[Math.min(selectedIndex, rows.length - 1)] || rows[0];
  const detail = moduleDetail(selected);
  return (
    <div className="module-browser">
      <div className="panel">
        <div className="panel-header"><strong>ICON Slot Layout</strong><span className="subtle">{rows.length} slots/modules</span></div>
        <div className="panel-body slot-grid">
          {rows.map((row, index) => (
            <button className={`slot-card interactive ${index === selectedIndex ? "selected" : ""}`} key={String(row.slot_number || index)} onClick={() => setSelectedIndex(index)}>
              <div className="slot-number">Slot {displayValue(row.slot_number)}</div>
              <strong>{displayValue(row.module_type)}</strong>
              <span>{displayValue(row.port_count)} ports</span>
              <span>Active services {displayValue(row.active_services)}</span>
              <span>Proposed {displayValue(row.proposed_services)}</span>
              <div className="toolbar"><Badge value={Number(row.alarms || 0) > 0 ? "alarm" : "normal"} /><Badge value={`${displayValue(row.work_orders)} WO`} /></div>
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header"><strong>{displayValue(detail.module_name)}</strong><Badge value={detail.status} /></div>
        <div className="panel-body detail-grid">
          {Object.entries(detail).map(([key, value]) => (
            <div className="field" key={key}>
              <div className="field-label">{formatLabel(key)}</div>
              <div className="field-value">{Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? <pre className="json-block">{JSON.stringify(value, null, 2)}</pre> : displayValue(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function moduleDetail(row: JsonRecord): JsonRecord {
  const moduleType = displayValue(row.module_type);
  const portCount = Number(row.port_count || 4);
  const serviceRole = moduleType.toLowerCase().includes("ethernet") ? "Ethernet/VSN service aggregation" : moduleType.toLowerCase().includes("ds1") ? "TDM tributary grooming" : moduleType.toLowerCase().includes("c37") ? "Protection relay channel interface" : "Transport line module";
  return {
    module_name: `Synthetic ${moduleType} module`,
    slot_number: row.slot_number,
    module_type: moduleType,
    status: Number(row.alarms || 0) > 0 ? "needs_review" : "synthetic_planning",
    module_serial_number: `SYN-${displayValue(row.slot_number)}-${moduleType.replaceAll("_", "-")}`,
    port_inventory: Array.from({ length: Math.max(portCount, 1) }, (_, index) => `${moduleType}-P${index + 1}`),
    service_role: serviceRole,
    active_services: row.active_services,
    proposed_services: row.proposed_services,
    work_orders: row.work_orders,
    engineering_parameters: {
      transport_mode: moduleType.includes("SONET") ? "SONET/mixed transport placeholder" : "Ethernet/TDM service placeholder",
      timing_dependency: moduleType.includes("SONET") ? "SONET timing source placeholder" : "Node timing profile placeholder",
      validation: "Ports, fiber strands, patch panels, circuit IDs, latency, and diversity are checked before work order conversion.",
    },
    commissioning_template: "SEL ICON module add checklist placeholder",
    manual_reference: "SEL manual section placeholder",
    internal_standard_reference: "TelecomNE ICON module engineering standard placeholder",
  };
}

function ChecklistList({ rows }: { rows: JsonRecord[] }) {
  if (!rows.length) return <EmptyPanel label="No commissioning checklists found." />;
  return <div style={{ display: "grid", gap: 14 }}>{rows.map((row) => <ChecklistDetail checklist={row} key={String(row.id)} />)}</div>;
}

function ChecklistDetail({ checklist }: { checklist: JsonRecord }) {
  return (
    <div className="panel">
      <div className="panel-header"><strong>{displayValue(checklist.checklist_name)}</strong><Badge value={checklist.status} /></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Expected Result</th><th>Actual Result</th><th>Status</th><th>Evidence</th><th>Notes</th></tr></thead>
          <tbody>{(((checklist.items as JsonRecord[] | undefined) || [])).map((item) => <tr key={String(item.id)}><td>{displayValue(item.item_number)}. {displayValue(item.task_text)}</td><td>{displayValue(item.expected_result)}</td><td>{displayValue(item.actual_result)}</td><td><Badge value={item.status} /></td><td>{displayValue(item.evidence_attachment_id)}</td><td>{displayValue(item.notes)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function SourceBadge({ value }: { value: "Actual" | "Planned" | "Proposed" | "As-built" | string }) {
  return <span className={`source-badge ${value.toLowerCase().replaceAll(" ", "-")}`}>{value}</span>;
}

function EmptyPanel({ label }: { label: string }) {
  return <div className="panel panel-body">{label}</div>;
}

function Loading({ label }: { label: string }) {
  return <div className="panel panel-body">{label}</div>;
}

function numberOrString(value: string): number | string | undefined {
  if (!value) return undefined;
  return /^-?\d+$/.test(value) ? Number(value) : value;
}
