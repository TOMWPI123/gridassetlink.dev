"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, Database, FileSpreadsheet, Hammer, Layers, PackageCheck, RefreshCw, Save, Search, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badges";
import { apiFetch, canWrite, displayValue, formatLabel } from "@/lib/api";
import type {
  DesignAgentTool,
  DesignAgentToolRunResult,
  DesignAssetBlueprint,
  DesignAssetGeoJsonGeometry,
  DesignAssetMapPayload,
  DesignAssetRecord,
  DesignAssetType,
  DesignBlueprintInstallResult,
  DesignMaterializationBatchResult,
  DesignModuleBlueprint,
} from "@/lib/types/assets";

type CreatorTab = "templates" | "wizard" | "import" | "bulk" | "duplicate" | "validate" | "materialize";
type ImportFormat = "csv" | "json" | "geojson";
type CreatorMessage = { tone: "success" | "warning" | "error" | "info"; text: string };
type ImportRow = { properties: Record<string, unknown>; geometry?: DesignAssetGeoJsonGeometry | null; sourceIndex: number };
type ImportPreview = { format: ImportFormat; headers: string[]; rows: ImportRow[] };
type ValidationFinding = { severity: "pass" | "warning" | "error"; message: string };

const CREATOR_NOTICE = "Creator records are synthetic/demo planning records only. Do not enter CEII, SCADA secrets, relay/protection settings, credentials, operational telecom routes, or private fiber-route data.";
const tabs: Array<{ key: CreatorTab; label: string; Icon: typeof Sparkles }> = [
  { key: "templates", label: "Templates", Icon: Sparkles },
  { key: "wizard", label: "Service Wizard", Icon: WandSparkles },
  { key: "import", label: "Import", Icon: FileSpreadsheet },
  { key: "bulk", label: "Bulk Edit", Icon: Layers },
  { key: "duplicate", label: "Duplicate", Icon: Copy },
  { key: "validate", label: "Validate", Icon: ShieldCheck },
  { key: "materialize", label: "Materialize", Icon: PackageCheck },
];

const recordStatuses: DesignAssetRecord["status"][] = ["proposed", "planned", "in_review", "active", "as_built", "archived"];
const wizardDefaults = {
  serviceId: "DESIGN-SVC-001",
  circuitId: "DESIGN-CKT-001",
  serviceName: "Design service 001",
  serviceType: "Ethernet",
  aEnd: "DESIGN-A-END",
  zEnd: "DESIGN-Z-END",
  cableId: "DESIGN-FIBER-001",
  strandNumbers: "1,2",
  spliceIds: "DESIGN-SPLICE-001-F001",
  status: "planned",
};

export function CreatorPage() {
  const writable = canWrite();
  const [activeTab, setActiveTab] = useState<CreatorTab>("templates");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<CreatorMessage | null>(null);
  const [mapPayload, setMapPayload] = useState<DesignAssetMapPayload | null>(null);
  const [tools, setTools] = useState<DesignAgentTool[]>([]);
  const [blueprints, setBlueprints] = useState<DesignModuleBlueprint[]>([]);
  const [selectedToolKey, setSelectedToolKey] = useState("");
  const selectedTool = tools.find((tool) => tool.tool_key === selectedToolKey) || tools[0];
  const [toolProperties, setToolProperties] = useState<Record<string, unknown>>({});
  const [toolMaterialize, setToolMaterialize] = useState(false);
  const [wizard, setWizard] = useState(wizardDefaults);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<ImportFormat>("csv");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importSlug, setImportSlug] = useState("creator-import-object");
  const [importName, setImportName] = useState("Creator imported objects");
  const [importGeometryType, setImportGeometryType] = useState<DesignAssetType["geometry_type"]>("table_only");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<DesignAssetRecord["status"]>("planned");
  const [bulkVisibility, setBulkVisibility] = useState("synthetic-demo");
  const [bulkNotes, setBulkNotes] = useState("");
  const [duplicateQuery, setDuplicateQuery] = useState("");
  const [duplicateSourceId, setDuplicateSourceId] = useState<number | null>(null);
  const [materializeMode, setMaterializeMode] = useState<"upsert" | "skip_existing">("upsert");
  const [lastResult, setLastResult] = useState<unknown>(null);

  const records = mapPayload?.records || [];
  const assetTypes = mapPayload?.asset_types || [];
  const filteredRecords = useMemo(() => {
    const q = duplicateQuery.trim().toLowerCase();
    return records
      .filter((record) => !q || [record.record_key, record.display_label, record.asset_type_slug, JSON.stringify(record.properties || {})].join(" ").toLowerCase().includes(q))
      .slice(0, 80);
  }, [duplicateQuery, records]);
  const selectedRecords = useMemo(() => records.filter((record) => selectedRecordIds.includes(record.id)), [records, selectedRecordIds]);
  const validationFindings = useMemo(
    () => buildValidationFindings({ tool: selectedTool, toolProperties, importPreview, selectedRecords, records }),
    [importPreview, records, selectedRecords, selectedTool, toolProperties],
  );

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const workflow = typeof window !== "undefined" ? window.location.search : "";
    const tab = new URLSearchParams(workflow).get("workflow");
    if (isCreatorTab(tab)) setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (!selectedTool) return;
    setSelectedToolKey(selectedTool.tool_key);
    setToolProperties({ ...(selectedTool.example_properties || {}) });
    setToolMaterialize(false);
  }, [selectedTool?.tool_key]);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      const [payload, agentTools, moduleBlueprints] = await Promise.all([
        apiFetch<DesignAssetMapPayload>("/api/design-assets/map-records"),
        apiFetch<DesignAgentTool[]>("/api/design-assets/agent-tools"),
        apiFetch<DesignModuleBlueprint[]>("/api/design-assets/module-blueprints"),
      ]);
      setMapPayload(payload);
      setTools(agentTools);
      setBlueprints(moduleBlueprints);
      if (!selectedToolKey && agentTools[0]) {
        setSelectedToolKey(agentTools[0].tool_key);
        setToolProperties({ ...(agentTools[0].example_properties || {}) });
      }
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    } finally {
      setLoading(false);
    }
  }

  async function runSelectedTool() {
    if (!selectedTool) return;
    try {
      const payload = {
        properties: toolProperties,
        geometry: selectedTool.geometry_type === "table_only" ? null : selectedTool.example_geometry || null,
        materialize: toolMaterialize,
        materialize_mode: "upsert",
      };
      const result = await apiFetch<DesignAgentToolRunResult>(selectedTool.endpoint, { method: selectedTool.method, body: JSON.stringify(payload) });
      setLastResult(result);
      setMessage({ tone: "success", text: `${result.record_action === "created" ? "Created" : "Updated"} ${result.record.display_label}.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  async function runServiceWizard() {
    try {
      const circuitTool = tools.find((tool) => tool.tool_key === "create-circuit");
      const assignmentTool = tools.find((tool) => tool.tool_key === "create-fiber-assignment");
      if (!circuitTool || !assignmentTool) throw new Error("Creator service tools are not installed yet.");
      const strands = wizard.strandNumbers.split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
      const spliceIds = wizard.spliceIds.split(",").map((value) => value.trim()).filter(Boolean);
      const circuitResult = await apiFetch<DesignAgentToolRunResult>(circuitTool.endpoint, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            circuit_id: wizard.circuitId,
            circuit_name: wizard.serviceName,
            service_type: wizard.serviceType,
            a_end: wizard.aEnd,
            z_end: wizard.zEnd,
            status: wizard.status,
            source: "creator_wizard",
          },
          materialize: false,
        }),
      });
      const assignmentResult = await apiFetch<DesignAgentToolRunResult>(assignmentTool.endpoint, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            assignment_id: `${wizard.serviceId}-ASSIGN`,
            assignment_name: `${wizard.serviceName} fiber assignment`,
            service_id: wizard.serviceId,
            circuit_id: wizard.circuitId,
            service_type: wizard.serviceType,
            cable_ids: [wizard.cableId],
            strand_numbers: strands,
            splice_ids: spliceIds,
            a_end: wizard.aEnd,
            z_end: wizard.zEnd,
            status: wizard.status,
          },
          materialize: false,
        }),
      });
      setLastResult({ circuit: circuitResult, assignment: assignmentResult });
      setMessage({ tone: "success", text: `Created ${wizard.circuitId} and its fiber assignment draft.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  function parseImport() {
    try {
      const preview = parseImportText(importText, importFormat);
      setImportPreview(preview);
      setFieldMap(Object.fromEntries(preview.headers.map((header) => [header, slugifyField(header)])));
      setMessage({ tone: "success", text: `Parsed ${preview.rows.length} rows. Review the mapping before importing.` });
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  async function importBlueprint() {
    if (!importPreview) return;
    try {
      const blueprint = buildImportBlueprint(importPreview, fieldMap, importSlug, importName, importGeometryType);
      const result = await apiFetch<DesignBlueprintInstallResult>("/api/design-assets/blueprint/import", { method: "POST", body: JSON.stringify(blueprint) });
      setLastResult(result);
      setMessage({ tone: "success", text: `Imported ${result.created_records + result.updated_records} records into ${importName}.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  async function applyBulkEdit() {
    if (!selectedRecords.length) return;
    try {
      const updates = await Promise.all(selectedRecords.map((record) =>
        apiFetch<DesignAssetRecord>(`/api/design-assets/records/${record.id}`, {
          method: "PUT",
          body: JSON.stringify({
            status: bulkStatus,
            visibility: bulkVisibility,
            notes: bulkNotes || record.notes || "Updated through Creator bulk edit.",
          }),
        })
      ));
      setLastResult(updates);
      setMessage({ tone: "success", text: `Updated ${updates.length} selected records.` });
      setSelectedRecordIds([]);
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  async function duplicateRecord() {
    const source = records.find((record) => record.id === duplicateSourceId);
    if (!source) return;
    try {
      const suffix = new Date().toISOString().replace(/\D/g, "").slice(4, 14);
      const result = await apiFetch<DesignAssetRecord>("/api/design-assets/records", {
        method: "POST",
        body: JSON.stringify({
          asset_type_slug: source.asset_type_slug,
          asset_type_id: source.asset_type_id,
          record_key: `${source.record_key}-copy-${suffix}`,
          display_label: `${source.display_label} copy`,
          geometry: source.geometry || source.geometry_json || null,
          properties: { ...(source.properties || source.properties_json || {}), duplicated_from_record_key: source.record_key },
          status: "proposed",
          source: "creator_duplicate",
          visibility: "synthetic-demo",
          notes: "Duplicated through Creator as a synthetic/demo starting point.",
        }),
      });
      setLastResult(result);
      setMessage({ tone: "success", text: `Duplicated ${source.display_label}.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  async function materializeSelectedRecords() {
    if (!selectedRecordIds.length) return;
    try {
      const result = await apiFetch<DesignMaterializationBatchResult>("/api/design-assets/materialize", {
        method: "POST",
        body: JSON.stringify({ record_ids: selectedRecordIds, mode: materializeMode }),
      });
      setLastResult(result);
      setMessage({ tone: result.error_count ? "warning" : "success", text: `Materialized ${result.materialized_count}; ${result.error_count} errors.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  async function installBlueprint(key: string) {
    try {
      const result = await apiFetch<DesignBlueprintInstallResult>(`/api/design-assets/module-blueprints/${key}/install`, { method: "POST", body: JSON.stringify({}) });
      setLastResult(result);
      setMessage({ tone: "success", text: `Installed ${result.installed_asset_type_slugs.length} Creator schemas.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: readableError(error) });
    }
  }

  function toggleRecord(id: number, checked: boolean) {
    setSelectedRecordIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((recordId) => recordId !== id));
  }

  return (
    <div className="creator-page">
      <section className="creator-header panel">
        <div>
          <span className="eyebrow"><WandSparkles size={14} />Creator</span>
          <h1>Build database records without writing SQL</h1>
          <p>Create assets, circuits, fiber assignments, imports, and editable design records through guided synthetic/demo workflows.</p>
        </div>
        <div className="creator-header-actions">
          <button className="button" type="button" onClick={refresh}><RefreshCw size={14} />Refresh</button>
          <Link className="button secondary" href="/admin/database"><Database size={14} />Advanced Admin</Link>
        </div>
      </section>

      <section className="panel creator-safety">
        <AlertTriangle size={18} />
        <div>
          <strong>Synthetic/demo boundary</strong>
          <span>{CREATOR_NOTICE}</span>
        </div>
      </section>

      {message ? <div className={`creator-message ${message.tone}`}>{message.text}</div> : null}
      {!writable ? <div className="creator-message warning">Current mode is read-only. Creator actions need demo engineer/editor access.</div> : null}

      <div className="creator-shell">
        <aside className="creator-workflows panel">
          <div className="creator-workflow-title">
            <strong>Workflows</strong>
            <span>{loading ? "Loading..." : `${records.length.toLocaleString()} records`}</span>
          </div>
          {tabs.map(({ key, label, Icon }) => (
            <a
              key={key}
              data-testid={`creator-tab-${key}`}
              aria-pressed={activeTab === key}
              href={`/creator?workflow=${key}`}
              className={activeTab === key ? "active" : ""}
            >
              <Icon size={15} />
              <span>{label}</span>
            </a>
          ))}
        </aside>

        <main className="creator-main">
          {activeTab === "templates" ? (
            <CreatorSection title="Create From Template" icon={<Sparkles size={18} />} description="Pick an object template, edit the minimum fields, then save a living design record. Materialize only after review.">
              <div className="creator-template-layout">
                <div className="creator-template-list">
                  {tools.map((tool) => (
                    <button key={tool.tool_key} type="button" className={selectedTool?.tool_key === tool.tool_key ? "active" : ""} onClick={() => {
                      setSelectedToolKey(tool.tool_key);
                      setToolProperties({ ...(tool.example_properties || {}) });
                      setToolMaterialize(false);
                    }}>
                      <strong>{tool.label}</strong>
                      <span>{tool.backend_entity || "design record only"} / {tool.geometry_type}</span>
                    </button>
                  ))}
                </div>
                <div className="creator-card">
                  {selectedTool ? (
                    <>
                      <h3>{selectedTool.label}</h3>
                      <p>{selectedTool.description}</p>
                      <DynamicPropertyForm properties={toolProperties} required={selectedTool.required_properties} onChange={setToolProperties} />
                      <label className="creator-check">
                        <input type="checkbox" checked={toolMaterialize} disabled={!selectedTool.supports_materialize} onChange={(event) => setToolMaterialize(event.currentTarget.checked)} />
                        <span>Materialize into {selectedTool.backend_entity || "module table"} after save</span>
                      </label>
                      <button className="button" type="button" disabled={!writable} onClick={runSelectedTool}><Save size={14} />Create Record</button>
                    </>
                  ) : <p>No templates loaded.</p>}
                </div>
              </div>
            </CreatorSection>
          ) : null}

          {activeTab === "wizard" ? (
            <CreatorSection title="Service / Circuit / Fiber Assignment Wizard" icon={<WandSparkles size={18} />} description="Create a circuit draft plus a linked fiber-assignment draft with devices, cable, strands, and splices captured as fields.">
              <div className="creator-form-grid">
                {Object.entries(wizard).map(([key, value]) => (
                  <label key={key}>
                    <span>{formatLabel(key)}</span>
                    <input value={value} onChange={(event) => setWizard((current) => ({ ...current, [key]: event.currentTarget.value }))} />
                  </label>
                ))}
              </div>
              <div className="creator-action-row">
                <button className="button" type="button" disabled={!writable} onClick={runServiceWizard}><Hammer size={14} />Create Circuit + Assignment</button>
                <span>Captures service ID, circuit ID, endpoints, cable ID, strand numbers, splice IDs, and status.</span>
              </div>
            </CreatorSection>
          ) : null}

          {activeTab === "import" ? (
            <CreatorSection title="Import With Mapping Preview" icon={<FileSpreadsheet size={18} />} description="Paste CSV, JSON, or GeoJSON; map fields; preview rows; then import as a design blueprint.">
              <div className="creator-import-controls">
                <label><span>Format</span><select value={importFormat} onChange={(event) => setImportFormat(event.currentTarget.value as ImportFormat)}><option value="csv">CSV</option><option value="json">JSON</option><option value="geojson">GeoJSON</option></select></label>
                <label><span>Asset type slug</span><input value={importSlug} onChange={(event) => setImportSlug(slugifyField(event.currentTarget.value))} /></label>
                <label><span>Display name</span><input value={importName} onChange={(event) => setImportName(event.currentTarget.value)} /></label>
                <label><span>Geometry</span><select value={importGeometryType} onChange={(event) => setImportGeometryType(event.currentTarget.value as DesignAssetType["geometry_type"])}><option value="table_only">Table only</option><option value="point">Point</option><option value="line">Line</option><option value="polygon">Polygon</option></select></label>
              </div>
              <textarea className="creator-import-textarea" value={importText} onChange={(event) => setImportText(event.currentTarget.value)} placeholder="Paste CSV rows, JSON array, or GeoJSON FeatureCollection..." />
              <div className="creator-action-row">
                <button className="button secondary" type="button" onClick={parseImport}>Preview Import</button>
                <button className="button" type="button" disabled={!writable || !importPreview} onClick={importBlueprint}>Import Design Records</button>
              </div>
              {importPreview ? <ImportPreviewPanel preview={importPreview} fieldMap={fieldMap} onFieldMapChange={setFieldMap} /> : null}
            </CreatorSection>
          ) : null}

          {activeTab === "bulk" ? (
            <CreatorSection title="Bulk Edit Selected Records" icon={<Layers size={18} />} description="Safely update status, visibility, or notes on selected design records without touching public reference data.">
              <BulkControls bulkStatus={bulkStatus} setBulkStatus={setBulkStatus} bulkVisibility={bulkVisibility} setBulkVisibility={setBulkVisibility} bulkNotes={bulkNotes} setBulkNotes={setBulkNotes} onApply={applyBulkEdit} disabled={!writable || !selectedRecordIds.length} />
              <RecordPicker records={records.slice(0, 120)} selectedIds={selectedRecordIds} onToggle={toggleRecord} />
            </CreatorSection>
          ) : null}

          {activeTab === "duplicate" ? (
            <CreatorSection title="Search And Duplicate" icon={<Copy size={18} />} description="Find an existing design record and duplicate it as a proposed starting point.">
              <div className="creator-search-row">
                <Search size={15} />
                <input value={duplicateQuery} onChange={(event) => setDuplicateQuery(event.currentTarget.value)} placeholder="Search record key, label, type, or properties" />
                <button className="button" type="button" disabled={!writable || !duplicateSourceId} onClick={duplicateRecord}>Duplicate Selected</button>
              </div>
              <div className="creator-record-list">
                {filteredRecords.map((record) => (
                  <button key={record.id} type="button" className={duplicateSourceId === record.id ? "active" : ""} onClick={() => setDuplicateSourceId(record.id)}>
                    <strong>{record.display_label}</strong>
                    <span>{record.record_key} / {record.asset_type_display_name || record.asset_type_slug}</span>
                    <Badge value={record.status} />
                  </button>
                ))}
              </div>
            </CreatorSection>
          ) : null}

          {activeTab === "validate" ? (
            <CreatorSection title="Validate Drafts Before Saving" icon={<ShieldCheck size={18} />} description="Check required fields, synthetic-data boundary, import shape, duplicate keys, and selected record readiness.">
              <div className="creator-validation-list">
                {validationFindings.map((finding, index) => (
                  <div key={`${finding.severity}-${index}`} className={finding.severity}>
                    {finding.severity === "pass" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{finding.message}</span>
                  </div>
                ))}
              </div>
            </CreatorSection>
          ) : null}

          {activeTab === "materialize" ? (
            <CreatorSection title="Materialize Reviewed Records" icon={<PackageCheck size={18} />} description="Convert supported design records into module tables only after review. This does not make synthetic assumptions real.">
              <div className="creator-blueprint-grid">
                {blueprints.map((blueprint) => (
                  <article key={blueprint.key}>
                    <strong>{blueprint.display_name}</strong>
                    <span>{blueprint.description}</span>
                    <small>{blueprint.asset_type_count} schemas / {blueprint.record_count} seed records</small>
                    <button className="button secondary" type="button" disabled={!writable} onClick={() => installBlueprint(blueprint.key)}>Install Schema</button>
                  </article>
                ))}
              </div>
              <div className="creator-action-row">
                <select value={materializeMode} onChange={(event) => setMaterializeMode(event.currentTarget.value as "upsert" | "skip_existing")}><option value="upsert">Upsert</option><option value="skip_existing">Skip existing</option></select>
                <button className="button" type="button" disabled={!writable || !selectedRecordIds.length} onClick={materializeSelectedRecords}>Materialize Selected</button>
                <span>{selectedRecordIds.length} selected</span>
              </div>
              <RecordPicker records={records.slice(0, 120)} selectedIds={selectedRecordIds} onToggle={toggleRecord} />
            </CreatorSection>
          ) : null}

          {lastResult ? (
            <section className="panel creator-result">
              <div className="panel-header"><strong>Last Result</strong></div>
              <pre>{JSON.stringify(lastResult, null, 2)}</pre>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function CreatorSection({ title, icon, description, children }: { title: string; icon: React.ReactNode; description: string; children: React.ReactNode }) {
  return (
    <section className="panel creator-section">
      <div className="creator-section-heading">
        <div>{icon}<strong>{title}</strong></div>
        <span>{description}</span>
      </div>
      {children}
    </section>
  );
}

function DynamicPropertyForm({ properties, required, onChange }: { properties: Record<string, unknown>; required: string[]; onChange: (next: Record<string, unknown>) => void }) {
  const keys = Object.keys(properties);
  return (
    <div className="creator-form-grid">
      {keys.map((key) => (
        <label key={key}>
          <span>{formatLabel(key)} {required.includes(key) ? <b>*</b> : null}</span>
          <input value={stringifyInput(properties[key])} onChange={(event) => onChange({ ...properties, [key]: parseInput(event.currentTarget.value, properties[key]) })} />
        </label>
      ))}
    </div>
  );
}

function ImportPreviewPanel({ preview, fieldMap, onFieldMapChange }: { preview: ImportPreview; fieldMap: Record<string, string>; onFieldMapChange: (next: Record<string, string>) => void }) {
  return (
    <div className="creator-import-preview">
      <h3>Mapping Preview</h3>
      <div className="creator-mapping-grid">
        {preview.headers.map((header) => (
          <label key={header}>
            <span>{header}</span>
            <input value={fieldMap[header] || ""} onChange={(event) => onFieldMapChange({ ...fieldMap, [header]: slugifyField(event.currentTarget.value) })} />
          </label>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{preview.headers.slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {preview.rows.slice(0, 6).map((row) => (
              <tr key={row.sourceIndex}>{preview.headers.slice(0, 8).map((header) => <td key={header}>{displayValue(row.properties[header])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BulkControls(props: {
  bulkStatus: DesignAssetRecord["status"];
  setBulkStatus: (value: DesignAssetRecord["status"]) => void;
  bulkVisibility: string;
  setBulkVisibility: (value: string) => void;
  bulkNotes: string;
  setBulkNotes: (value: string) => void;
  onApply: () => void;
  disabled: boolean;
}) {
  return (
    <div className="creator-bulk-controls">
      <select value={props.bulkStatus} onChange={(event) => props.setBulkStatus(event.currentTarget.value as DesignAssetRecord["status"])}>
        {recordStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
      </select>
      <input value={props.bulkVisibility} onChange={(event) => props.setBulkVisibility(event.currentTarget.value)} />
      <input value={props.bulkNotes} onChange={(event) => props.setBulkNotes(event.currentTarget.value)} placeholder="Optional notes" />
      <button className="button" type="button" disabled={props.disabled} onClick={props.onApply}>Apply Bulk Edit</button>
    </div>
  );
}

function RecordPicker({ records, selectedIds, onToggle }: { records: DesignAssetRecord[]; selectedIds: number[]; onToggle: (id: number, checked: boolean) => void }) {
  return (
    <div className="creator-picker">
      {records.map((record) => (
        <label key={record.id} className={selectedIds.includes(record.id) ? "active" : ""}>
          <input type="checkbox" checked={selectedIds.includes(record.id)} onChange={(event) => onToggle(record.id, event.currentTarget.checked)} />
          <span>
            <strong>{record.display_label}</strong>
            <small>{record.record_key} / {record.asset_type_display_name || record.asset_type_slug}</small>
          </span>
          <Badge value={record.status} />
        </label>
      ))}
    </div>
  );
}

function parseImportText(text: string, format: ImportFormat): ImportPreview {
  if (!text.trim()) throw new Error("Paste import data first.");
  if (format === "csv") return parseCsv(text);
  const parsed = JSON.parse(text) as unknown;
  if (format === "geojson") return parseGeoJson(parsed);
  if (!Array.isArray(parsed)) throw new Error("JSON imports must be an array of objects.");
  const rows = parsed.map((item, index) => ({ properties: isRecord(item) ? item : { value: item }, geometry: null, sourceIndex: index + 1 }));
  return { format, headers: headersForRows(rows), rows };
}

function parseCsv(text: string): ImportPreview {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV imports need a header row and at least one data row.");
  const headers = splitCsvLine(lines[0]).map((header) => header.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    return { sourceIndex: index + 1, geometry: null, properties: Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])) };
  });
  return { format: "csv", headers, rows };
}

function parseGeoJson(parsed: unknown): ImportPreview {
  if (!isRecord(parsed) || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) throw new Error("GeoJSON import must be a FeatureCollection.");
  const rows = parsed.features.map((feature, index) => {
    const record = isRecord(feature) ? feature : {};
    return {
      sourceIndex: index + 1,
      properties: isRecord(record.properties) ? record.properties : {},
      geometry: isDesignGeometry(record.geometry) ? record.geometry : null,
    };
  });
  return { format: "geojson", headers: headersForRows(rows), rows };
}

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
}

function buildImportBlueprint(preview: ImportPreview, fieldMap: Record<string, string>, slug: string, displayName: string, geometryType: DesignAssetType["geometry_type"]): DesignAssetBlueprint {
  const mappedHeaders = preview.headers.map((header) => ({ source: header, target: fieldMap[header] || slugifyField(header) }));
  return {
    blueprint_version: "gridassetlink-creator-import-v1",
    synthetic_data_notice: CREATOR_NOTICE,
    mode: "upsert",
    asset_types: [{
      id: 0,
      slug,
      display_name: displayName,
      description: "Imported through Creator. Synthetic/demo planning data only.",
      geometry_type: geometryType,
      fields_json: mappedHeaders.map(({ target }) => ({ name: target, label: formatLabel(target), type: "string" })),
      fields: mappedHeaders.map(({ target }) => ({ name: target, label: formatLabel(target), type: "string" })),
      searchable_fields_json: mappedHeaders.map(({ target }) => target).slice(0, 8),
      searchable_fields: mappedHeaders.map(({ target }) => target).slice(0, 8),
      status: "active",
      version: 1,
    }],
    records: preview.rows.map((row) => {
      const properties = Object.fromEntries(mappedHeaders.map(({ source, target }) => [target, row.properties[source]]));
      const keySource = Object.values(properties).find((value) => String(value || "").trim()) || row.sourceIndex;
      return {
        id: 0,
        asset_type_id: 0,
        asset_type_slug: slug,
        asset_type_display_name: displayName,
        record_key: `${slug}-${slugifyField(String(keySource)).slice(0, 48)}-${row.sourceIndex}`,
        display_label: String(keySource),
        geometry_type: geometryType,
        geometry: row.geometry || null,
        geometry_json: row.geometry || null,
        properties,
        properties_json: properties,
        status: "proposed",
        source: "creator_import",
        visibility: "synthetic-demo",
        version: 1,
        notes: "Imported through Creator as synthetic/demo planning data.",
      };
    }),
  };
}

function buildValidationFindings(input: {
  tool?: DesignAgentTool;
  toolProperties: Record<string, unknown>;
  importPreview: ImportPreview | null;
  selectedRecords: DesignAssetRecord[];
  records: DesignAssetRecord[];
}): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (input.tool) {
    const missing = input.tool.required_properties.filter((field) => input.toolProperties[field] === undefined || input.toolProperties[field] === "");
    findings.push(missing.length ? { severity: "error", message: `Template is missing required fields: ${missing.join(", ")}.` } : { severity: "pass", message: "Selected template has all required fields filled." });
  }
  const combinedText = JSON.stringify({ properties: input.toolProperties, importRows: input.importPreview?.rows.slice(0, 20), selected: input.selectedRecords.map((record) => record.properties) }).toLowerCase();
  const forbidden = ["password", "credential", "ceii", "relay setting", "protection setting", "scada secret", "private route"];
  const hits = forbidden.filter((term) => combinedText.includes(term));
  findings.push(hits.length ? { severity: "error", message: `Potential sensitive-data terms found: ${hits.join(", ")}.` } : { severity: "pass", message: "No obvious sensitive-data terms found in the current draft context." });
  if (input.importPreview) {
    findings.push(input.importPreview.rows.length ? { severity: "pass", message: `Import preview has ${input.importPreview.rows.length} rows.` } : { severity: "error", message: "Import preview has no rows." });
  } else {
    findings.push({ severity: "warning", message: "No import preview is currently staged." });
  }
  const selectedDuplicateKeys = new Set<string>();
  const duplicates = input.selectedRecords.filter((record) => {
    if (selectedDuplicateKeys.has(record.record_key)) return true;
    selectedDuplicateKeys.add(record.record_key);
    return false;
  });
  findings.push(duplicates.length ? { severity: "warning", message: `Selected records include duplicate keys: ${duplicates.map((record) => record.record_key).join(", ")}.` } : { severity: "pass", message: "Selected records have unique keys." });
  findings.push(input.records.length ? { severity: "pass", message: `${input.records.length} living design records are available for duplicate, bulk, and materialize workflows.` } : { severity: "warning", message: "No design records are loaded yet. Start with Templates or Import." });
  return findings;
}

function headersForRows(rows: ImportRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row.properties)))).slice(0, 80);
}

function stringifyInput(value: unknown) {
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value ?? "");
}

function parseInput(value: string, previous: unknown) {
  if (typeof previous === "number") return Number(value);
  if (typeof previous === "boolean") return value === "true";
  if (typeof previous === "object" && previous !== null) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function slugifyField(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDesignGeometry(value: unknown): value is DesignAssetGeoJsonGeometry {
  return isRecord(value) && typeof value.type === "string" && "coordinates" in value;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isCreatorTab(value: string | null): value is CreatorTab {
  return tabs.some((tab) => tab.key === value);
}
