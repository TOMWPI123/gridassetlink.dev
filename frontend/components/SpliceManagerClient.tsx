"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Cable, ClipboardList, GitCompareArrows, History, Network, Plus, Route, ShieldAlert, Trash2, Workflow } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FiberSplice } from "@/lib/types/assets";
import type { SpliceManagerViewModel } from "@/lib/opgw/continuityEngine";

type SpliceManagerClientProps = {
  view: SpliceManagerViewModel;
};

type MatrixLayerFilter = "all" | "existing" | "proposed";
type MatrixAction = "create" | "validate" | "approve" | "commit";
type ProposedSpliceType = FiberSplice["spliceType"];
type MatrixActionStatus = {
  action: MatrixAction;
  state: "idle" | "running" | "complete" | "error";
  message: string;
  details?: Record<string, unknown>;
};

const fiberColors = ["Blue", "Orange", "Green", "Brown", "Slate", "White", "Red", "Black", "Yellow", "Violet", "Rose", "Aqua"];
const proposedSpliceTypeOptions: ProposedSpliceType[] = ["straight_through", "express", "branch", "patch", "open", "reserved", "termination", "spare"];

export function SpliceManagerClient({ view }: SpliceManagerClientProps) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [layerFilter, setLayerFilter] = useState<MatrixLayerFilter>("all");
  const [cableFilter, setCableFilter] = useState("all");
  const [spliceTypeFilter, setSpliceTypeFilter] = useState("all");
  const [criticalityFilter, setCriticalityFilter] = useState("all");
  const [spliceRows, setSpliceRows] = useState<FiberSplice[]>(() => [...view.existingSplices, ...view.proposedSplices]);
  const [editorFromSection, setEditorFromSection] = useState(() => view.connectedCableSections[0]?.cableSectionId || "");
  const [editorToSection, setEditorToSection] = useState(() => view.connectedCableSections[1]?.cableSectionId || view.connectedCableSections[0]?.cableSectionId || "");
  const [editorStartStrand, setEditorStartStrand] = useState(1);
  const [editorStrandCount, setEditorStrandCount] = useState(1);
  const [editorSpliceType, setEditorSpliceType] = useState<ProposedSpliceType>("straight_through");
  const [matrixActionStatus, setMatrixActionStatus] = useState<MatrixActionStatus | null>(null);
  const selectedPointId = view.splicePoint.properties.splicePointId;
  const closure = view.closure?.properties;
  const header = view.header;
  const derivedFiberCapacity = Math.max(header.fiberCapacity, matrixFiberCapacity(spliceRows), ...view.connectedCableSections.map((section) => section.fiberCount), 24);
  const rows = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return spliceRows
      .filter((splice) => {
        if (layerFilter === "existing" && splice.status !== "existing") return false;
        if (layerFilter === "proposed" && splice.status === "existing") return false;
        if (cableFilter !== "all" && splice.fromCableId !== cableFilter && splice.toCableId !== cableFilter) return false;
        if (spliceTypeFilter !== "all" && splice.spliceType !== spliceTypeFilter) return false;
        if (criticalityFilter !== "all" && serviceCriticalityForAssignment(splice.assignmentId, view) !== criticalityFilter) return false;
        if (!lowered) return true;
        return [
          splice.id,
          splice.fromCableId,
          splice.toCableId,
          splice.fromStrandNumber,
          splice.toStrandNumber,
          splice.spliceType,
          splice.assignmentId,
          serviceNameForAssignment(splice.assignmentId, view),
        ].join(" ").toLowerCase().includes(lowered);
      })
      .slice(0, 260);
  }, [cableFilter, criticalityFilter, layerFilter, query, spliceRows, spliceTypeFilter, view]);
  const cableSectionOptions = useMemo(() => [...new Set(view.connectedCableSections.map((section) => section.cableSectionId))].sort(), [view.connectedCableSections]);
  const spliceTypeOptions = useMemo(() => [...new Set(spliceRows.map((splice) => splice.spliceType))].sort(), [spliceRows]);
  const existingRows = useMemo(() => spliceRows.filter((splice) => splice.status === "existing"), [spliceRows]);
  const proposedRows = useMemo(() => spliceRows.filter((splice) => splice.status !== "existing"), [spliceRows]);
  const matrixCompare = useMemo(() => compareLocalMatrices(existingRows, proposedRows), [existingRows, proposedRows]);
  const totalLoss = rows.reduce((sum, splice) => sum + (splice.lossDb || 0), 0);
  const assignedRows = rows.filter((splice) => splice.assignmentId).length;

  useEffect(() => {
    const requestedLayer = searchParams.get("layer");
    if (requestedLayer === "existing" || requestedLayer === "proposed") setLayerFilter(requestedLayer);
  }, [searchParams]);

  function buildProposedSplice(values?: Partial<Pick<FiberSplice, "fromCableId" | "toCableId" | "fromStrandNumber" | "toStrandNumber" | "spliceType" | "status" | "notes">>) {
    const nextStrand = Math.max(1, (spliceRows.length % Math.max(12, derivedFiberCapacity || 48)) + 1);
    const fromCable = values?.fromCableId || editorFromSection || closure?.cableIds[0] || "DEMO-CABLE-A";
    const toCable = values?.toCableId || editorToSection || closure?.cableIds[1] || fromCable;
    const fromStrandNumber = clampStrand(values?.fromStrandNumber || nextStrand, derivedFiberCapacity);
    const toStrandNumber = clampStrand(values?.toStrandNumber || fromStrandNumber, derivedFiberCapacity);
    const spliceType = values?.spliceType || (fromCable === toCable ? "express" : "straight_through");
    return {
      id: `PROP-${selectedPointId}-${Date.now().toString(36).toUpperCase()}-${fromStrandNumber}`,
      spliceClosureId: closure?.id || view.splicePoint.properties.closureId || selectedPointId,
      fromCableId: fromCable,
      fromStrandNumber,
      toCableId: toCable,
      toStrandNumber,
      spliceType,
      lossDb: 0.06,
      status: values?.status || "proposed",
      notes: values?.notes || "Local demo proposed splice. It does not change existing continuity until committed in a future workflow.",
    } satisfies FiberSplice;
  }

  function addProposedSplice() {
    const nextSplice = buildProposedSplice();
    setSpliceRows((current) => [
      nextSplice,
      ...current,
    ]);
    setLayerFilter("proposed");
    return nextSplice;
  }

  function buildProposedRange(status: FiberSplice["status"] = "proposed", spliceType: ProposedSpliceType = editorSpliceType) {
    const start = clampStrand(editorStartStrand, derivedFiberCapacity);
    const count = Math.max(1, Math.min(editorStrandCount, Math.max(1, derivedFiberCapacity - start + 1), 24));
    return Array.from({ length: count }, (_, index) => {
      const strand = start + index;
      return buildProposedSplice({
        fromCableId: editorFromSection,
        toCableId: editorToSection,
        fromStrandNumber: strand,
        toStrandNumber: strand,
        spliceType,
        status,
        notes: status === "faulted"
          ? "Local demo proposed damaged/open strand marker. It does not change existing continuity until committed in a future workflow."
          : `Local demo ${spliceType.replaceAll("_", " ")} splice range. It does not change existing continuity until committed in a future workflow.`,
      });
    });
  }

  async function createProposedRange(spliceType: ProposedSpliceType = editorSpliceType, status: FiberSplice["status"] = "proposed") {
    const nextRows = buildProposedRange(status, spliceType);
    setSpliceRows((current) => [...nextRows, ...current]);
    setLayerFilter("proposed");
    await runMatrixAction("create", [...nextRows, ...proposedRows]);
  }

  async function createIndividualSplice(spliceType: ProposedSpliceType = editorSpliceType, notes?: string) {
    const nextSplice = buildProposedSplice({
      fromCableId: editorFromSection,
      toCableId: editorToSection,
      fromStrandNumber: editorStartStrand,
      toStrandNumber: editorStartStrand,
      spliceType,
      notes: notes || `Local demo ${spliceType.replaceAll("_", " ")} strand splice. It does not change existing continuity until committed in a future workflow.`,
    });
    setSpliceRows((current) => [nextSplice, ...current]);
    setLayerFilter("proposed");
    await runMatrixAction("create", [nextSplice, ...proposedRows]);
  }

  async function createPatchPanelTermination() {
    await createIndividualSplice("termination", "Local demo patch-panel termination marker. Review patch-panel port assignment before committing to existing continuity.");
  }

  async function markStrandSpare() {
    const nextSplice = buildProposedSplice({
      fromCableId: editorFromSection,
      toCableId: editorFromSection,
      fromStrandNumber: editorStartStrand,
      toStrandNumber: editorStartStrand,
      spliceType: "spare",
      notes: "Local demo spare strand marker. It is not active continuity and does not change existing rows until committed.",
    });
    setSpliceRows((current) => [nextSplice, ...current]);
    setLayerFilter("proposed");
    await runMatrixAction("create", [nextSplice, ...proposedRows]);
  }

  function deleteProposedSplice(spliceId: string) {
    setSpliceRows((current) => current.filter((splice) => splice.id !== spliceId || splice.status === "existing"));
  }

  async function runMatrixAction(action: MatrixAction, proposedOverride?: FiberSplice[]) {
    const endpointByAction: Record<MatrixAction, string> = {
      create: "create-proposed-matrix",
      validate: "validate-proposed-matrix",
      approve: "approve-proposed-matrix",
      commit: "commit-proposed-matrix",
    };
    const proposedConnections = proposedOverride || proposedRows;
    setMatrixActionStatus({ action, state: "running", message: `${matrixActionLabel(action)} running...` });
    try {
      const response = await fetch(`/api/opgw/splice-points/${encodeURIComponent(selectedPointId)}/${endpointByAction[action]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splicePointId: selectedPointId,
          spliceClosureId: header.spliceClosureId,
          proposedConnections,
          existingConnectionCount: existingRows.length,
          demoOnly: true,
        }),
      });
      const details = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof details?.error === "string" ? details.error : `${matrixActionLabel(action)} failed`);
      setMatrixActionStatus({
        action,
        state: "complete",
        message: matrixActionMessage(action, details),
        details: details as Record<string, unknown>,
      });
    } catch (error) {
      setMatrixActionStatus({
        action,
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function createProposedSpliceAndMatrix() {
    const nextSplice = addProposedSplice();
    await runMatrixAction("create", [nextSplice, ...proposedRows]);
  }

  return (
    <main className="splice-manager-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/dashboard?drawer=splices">Back to map dashboard</Link>
          <h1>Splice Manager</h1>
          <p>{selectedPointId} / {header.spliceClosureId || "No closure assigned"} / {header.structureNumber}</p>
        </div>
        <div className="splice-manager-warning">
          <AlertTriangle size={18} />
          <span>Synthetic demo data only. Do not use for operations, protection, SCADA, dispatch, CEII, or private utility telecom routing.</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Splice manager header summary">
        <SummaryCard label="Splice Point" value={header.splicePointId} />
        <SummaryCard label="Closure" value={header.spliceClosureId || "-"} />
        <SummaryCard label="Structure" value={header.structureNumber} />
        <SummaryCard label="Line / Route" value={`${header.transmissionLineId} / ${header.opgwRouteId}`} />
        <SummaryCard label="Region" value={header.region} />
        <SummaryCard label="Voltage" value={header.voltageClass} />
        <SummaryCard label="Coordinates" value={`${header.latitude.toFixed(5)}, ${header.longitude.toFixed(5)}`} />
        <SummaryCard label="Closure Type" value={header.closureType} />
        <SummaryCard label="Fiber Capacity" value={`${derivedFiberCapacity}F`} />
        <SummaryCard label="Tray Count" value={String(header.trayCount)} />
        <SummaryCard label="Splice Capacity" value={String(header.spliceCapacity)} />
        <SummaryCard label="Status / Source" value={`${header.existingProposedStatus} / ${header.sourceLabel}`} />
        <SummaryCard label="Splice Rows" value={rows.length.toLocaleString()} />
        <SummaryCard label="Services Crossing" value={view.services.length.toLocaleString()} />
        <SummaryCard label="Estimated Loss" value={`${totalLoss.toFixed(2)} dB`} />
      </section>

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <Panel title="Connected Cable Sections" icon={<Cable size={17} />}>
            <div className="splice-table-wrap">
              <table className="splice-manager-table">
                <thead>
                  <tr>
                    <th>Cable Section</th>
                    <th>Line</th>
                    <th>Route</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Direction</th>
                    <th>Fiber</th>
                    <th>Available</th>
                    <th>Assigned</th>
                    <th>Reserved</th>
                    <th>Layer</th>
                  </tr>
                </thead>
                <tbody>
                  {view.connectedCableSections.map((section) => (
                    <tr key={section.cableSectionId}>
                      <td>{section.cableSectionId}</td>
                      <td>{section.transmissionLineId}</td>
                      <td>{section.opgwRouteId}</td>
                      <td>{section.fromStructure}</td>
                      <td>{section.toStructure}</td>
                      <td><StatusPill value={section.direction} /></td>
                      <td>{section.fiberCount}F</td>
                      <td>{section.availableStrands}</td>
                      <td>{section.assignedStrands}</td>
                      <td>{section.reservedStrands}</td>
                      <td><StatusPill value={section.layer} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Fiber Splice Matrix" icon={<GitCompareArrows size={17} />}>
            <div className="splice-manager-toolbar">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search strand, cable section, service, assignment" />
              <select value={layerFilter} onChange={(event) => setLayerFilter(event.target.value as MatrixLayerFilter)}>
                <option value="all">Existing + proposed</option>
                <option value="existing">Existing Fiber Splices</option>
                <option value="proposed">Proposed Fiber Splices</option>
              </select>
              <select value={cableFilter} onChange={(event) => setCableFilter(event.target.value)}>
                <option value="all">All cable sections</option>
                {cableSectionOptions.map((sectionId) => <option value={sectionId} key={sectionId}>{sectionId}</option>)}
              </select>
              <select value={spliceTypeFilter} onChange={(event) => setSpliceTypeFilter(event.target.value)}>
                <option value="all">All splice types</option>
                {spliceTypeOptions.map((spliceType) => <option value={spliceType} key={spliceType}>{spliceType}</option>)}
              </select>
              <select value={criticalityFilter} onChange={(event) => setCriticalityFilter(event.target.value)}>
                <option value="all">All criticalities</option>
                <option value="low">Low criticality</option>
                <option value="medium">Medium criticality</option>
                <option value="high">High criticality</option>
                <option value="critical">Critical</option>
              </select>
              <button type="button" onClick={createProposedSpliceAndMatrix}><Plus size={15} />Add proposed splice</button>
            </div>
            <div className="splice-matrix-stats">
              <span>{rows.length} visible rows</span>
              <span>{assignedRows} assigned to synthetic services</span>
              <span>{totalLoss.toFixed(2)} dB selected loss</span>
            </div>
            <div className="splice-table-wrap tall">
              <table className="splice-manager-table matrix">
                <thead>
                  <tr>
                    <th>Tray</th>
                    <th>Tube</th>
                    <th>Tube Color</th>
                    <th>Incoming</th>
                    <th>Incoming Color</th>
                    <th>Outgoing</th>
                    <th>Outgoing Color</th>
                    <th>Splice Type</th>
                    <th>Service</th>
                    <th>Assignment</th>
                    <th>Layer</th>
                    <th>Connection</th>
                    <th>Loss</th>
                    <th>Test Result</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((splice) => {
                    const incomingColor = fiberColors[(splice.fromStrandNumber - 1) % fiberColors.length];
                    const outgoingColor = fiberColors[(splice.toStrandNumber - 1) % fiberColors.length];
                    const layer = splice.status === "existing" ? "existing" : "proposed";
                    const connectionStatus = splice.status === "faulted" ? "faulted" : splice.spliceType === "open" ? "open" : splice.spliceType === "termination" ? "terminated" : splice.spliceType === "spare" ? "spare" : "connected";
                    const carriedService = serviceForAssignment(splice.assignmentId, view);
                    const hasAssignedService = Boolean(carriedService);
                    return (
                      <tr className={`${splice.status !== "existing" ? "proposed-row" : ""} ${connectionStatus === "faulted" || connectionStatus === "open" ? "broken-row" : ""} ${hasAssignedService ? "assigned-row" : ""}`} key={splice.id}>
                        <td>{Math.max(1, Math.ceil(splice.fromStrandNumber / 24))}</td>
                        <td>{tubeNumber(splice.fromStrandNumber)}</td>
                        <td>{incomingColor}</td>
                        <td>{splice.fromCableId} / strand {splice.fromStrandNumber}</td>
                        <td>{incomingColor}</td>
                        <td>{splice.toCableId} / strand {splice.toStrandNumber}</td>
                        <td>{outgoingColor}</td>
                        <td>{splice.spliceType}</td>
                        <td>{carriedService?.serviceName || "-"}</td>
                        <td>{splice.assignmentId || "-"}</td>
                        <td><StatusPill value={layer} /></td>
                        <td><StatusPill value={connectionStatus} /></td>
                        <td>{(splice.lossDb || 0).toFixed(2)} dB</td>
                        <td>{splice.status === "faulted" ? "fail" : "demo pass"}</td>
                        <td>{splice.notes || "Synthetic splice row."}</td>
                        <td>
                          <div className="splice-row-actions">
                            {carriedService
                              ? <Link href={`/fiber-trace?service=${encodeURIComponent(carriedService.serviceId)}`}>Trace</Link>
                              : <Link href={`/fiber-trace?splicePoint=${encodeURIComponent(selectedPointId)}`}>Trace point</Link>}
                            {splice.status === "existing"
                              ? <span className="splice-readonly">read-only</span>
                              : <button className="splice-icon-button" type="button" onClick={() => deleteProposedSplice(splice.id)} aria-label={`Delete ${splice.id}`}><Trash2 size={14} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Compare Existing vs Proposed" icon={<GitCompareArrows size={17} />}>
            <div className="splice-compare-grid">
              <SummaryCard label="Existing rows" value={String(matrixCompare.existingCount)} />
              <SummaryCard label="Proposed rows" value={String(matrixCompare.proposedCount)} />
              <SummaryCard label="Added in proposed" value={String(matrixCompare.addedCount)} />
              <SummaryCard label="Unchanged rows" value={String(matrixCompare.unchangedCount)} />
              <SummaryCard label="Existing without match" value={String(matrixCompare.removedCount)} />
              <SummaryCard label="Affected services" value={String(view.services.length)} />
            </div>
            <div className="splice-warning-list">
              <span>Compare view is synthetic and does not alter existing splice records.</span>
              {matrixCompare.addedPreview.map((row) => <span key={row.id}>Proposed: {row.fromCableId}:{row.fromStrandNumber} to {row.toCableId}:{row.toStrandNumber}</span>)}
            </div>
          </Panel>

          <Panel title="Fiber Continuity View" icon={<Route size={17} />}>
            <div className="continuity-list">
              {view.continuityPaths.map((path) => (
                <article className={`continuity-card ${path.pathStatus}`} key={path.continuityPathId}>
                  <div>
                    <strong>{path.serviceId}</strong>
                    <span>{path.endpointASiteId} to {path.endpointZSiteId}</span>
                  </div>
                  <dl>
                    <div><dt>Status</dt><dd><StatusPill value={path.pathStatus} /></dd></div>
                    <div><dt>Lines</dt><dd>{path.totalTransmissionLines}</dd></div>
                    <div><dt>Sections</dt><dd>{path.totalCableSections}</dd></div>
                    <div><dt>Spans</dt><dd>{path.totalSpanSegments}</dd></div>
                    <div><dt>Splices</dt><dd>{path.totalSplicePoints}</dd></div>
                    <div><dt>Loss</dt><dd>{path.totalEstimatedLossDb.toFixed(2)} dB</dd></div>
                  </dl>
                  <div className="splice-inline-links">
                    <Link href={`/fiber-trace?service=${encodeURIComponent(path.serviceId)}`}>Open full trace</Link>
                    <Link href={`/dashboard?drawer=layers&service=${encodeURIComponent(path.serviceId)}`}>Highlight on map</Link>
                  </div>
                  <ol>
                    {path.segments.slice(0, 12).map((segment) => (
                      <li key={segment.pathSegmentId}>
                        <span>{segment.sequenceNumber}</span>
                        <strong>{segment.objectType.replaceAll("_", " ")}</strong>
                        <em>{segment.objectId}</em>
                      </li>
                    ))}
                  </ol>
                  {path.warningSummary.length ? (
                    <div className="splice-warning-list">
                      {path.warningSummary.map((warning) => <span key={warning}>{warning}</span>)}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="splice-manager-side">
          <Panel title="Services Carried" icon={<Network size={17} />}>
            <div className="service-carried-list">
              {view.services.map((service) => (
                <article key={service.serviceId}>
                  <strong>{service.serviceId}</strong>
                  <span>{service.serviceName}</span>
                  <small>{service.serviceType}</small>
                  <div>
                    <StatusPill value={service.criticality} />
                    <StatusPill value={service.protectionLevel} />
                    <StatusPill value={service.latencyClass} />
                    <StatusPill value={service.operationalStatus} />
                    <StatusPill value={service.layerType} />
                  </div>
                  <div className="splice-inline-links">
                    <Link href={`/fiber-trace?service=${encodeURIComponent(service.serviceId)}`}>View continuity</Link>
                    <Link href={`/dashboard?drawer=layers&service=${encodeURIComponent(service.serviceId)}`}>Highlight map</Link>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Proposed Splice Editor" icon={<Workflow size={17} />}>
            <div className="splice-editor-grid">
              <label>
                <span>Incoming cable section</span>
                <select value={editorFromSection} onChange={(event) => setEditorFromSection(event.target.value)}>
                  {cableSectionOptions.map((sectionId) => <option value={sectionId} key={sectionId}>{sectionId}</option>)}
                </select>
              </label>
              <label>
                <span>Outgoing cable section</span>
                <select value={editorToSection} onChange={(event) => setEditorToSection(event.target.value)}>
                  {cableSectionOptions.map((sectionId) => <option value={sectionId} key={sectionId}>{sectionId}</option>)}
                </select>
              </label>
              <label>
                <span>Splice type</span>
                <select value={editorSpliceType} onChange={(event) => setEditorSpliceType(event.target.value as ProposedSpliceType)}>
                  {proposedSpliceTypeOptions.map((spliceType) => <option value={spliceType} key={spliceType}>{spliceType.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label>
                <span>Start strand</span>
                <input type="number" min={1} max={derivedFiberCapacity} value={editorStartStrand} onChange={(event) => setEditorStartStrand(Number(event.target.value))} />
              </label>
              <label>
                <span>Strand count</span>
                <input type="number" min={1} max={24} value={editorStrandCount} onChange={(event) => setEditorStrandCount(Number(event.target.value))} />
              </label>
            </div>
            <div className="splice-action-stack">
              <button type="button" onClick={() => createIndividualSplice()}><Plus size={15} />Create individual strand splice</button>
              <button type="button" onClick={() => createProposedRange()}><Plus size={15} />Create splice range</button>
              <button type="button" onClick={() => createIndividualSplice("branch")}>Create branch splice</button>
              <button type="button" onClick={() => createIndividualSplice("termination", "Local demo termination marker. Review field termination and patch panel documentation before commit.")}>Create termination</button>
              <button type="button" onClick={createPatchPanelTermination}>Create patch panel termination</button>
              <button type="button" onClick={() => createProposedRange("reserved")}>Mark range reserved</button>
              <button type="button" onClick={markStrandSpare}>Mark strand spare</button>
              <button type="button" onClick={() => createProposedRange("open", "faulted")}>Mark range damaged/open</button>
              <button type="button" onClick={createProposedSpliceAndMatrix}><Plus size={15} />Auto add one splice</button>
              <button type="button" onClick={() => runMatrixAction("create")}>Save proposed matrix</button>
              <button type="button" onClick={() => runMatrixAction("validate")}>Validate proposed matrix</button>
              <button type="button" onClick={() => runMatrixAction("approve")}>Approve proposed matrix</button>
              <button type="button" onClick={() => runMatrixAction("commit")}>Commit proposed matrix</button>
            </div>
            <p className="splice-side-note">Existing splice rows remain read-only in this no-account demo. Proposed edits are local UI state until a future backend commit workflow is added.</p>
            {matrixActionStatus ? (
              <div className={`splice-action-result ${matrixActionStatus.state}`}>
                <strong>{matrixActionLabel(matrixActionStatus.action)}</strong>
                <span>{matrixActionStatus.message}</span>
                {matrixActionStatus.details ? <small>{matrixActionDetails(matrixActionStatus.details)}</small> : null}
              </div>
            ) : null}
          </Panel>

          <Panel title="Outage Impact" icon={<ShieldAlert size={17} />}>
            <div className="splice-impact-list">
              {view.outageImpact.map((impact) => (
                <article key={impact.serviceId}>
                  <strong>{impact.serviceId}</strong>
                  <span>{impact.criticality}</span>
                  <p>{impact.impact}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Work Orders" icon={<ClipboardList size={17} />}>
            <div className="splice-action-stack">
              <Link href={`/opgw/splices/${encodeURIComponent(selectedPointId)}/diagram`}>Open interactive splicing diagram</Link>
              <Link href={`/work-orders/new?splicePoint=${encodeURIComponent(selectedPointId)}`}>Create work order</Link>
              <Link href={`/outage-impact?splicePoint=${encodeURIComponent(selectedPointId)}`}>Analyze outage impact</Link>
              <Link href={`/fiber-trace?splicePoint=${encodeURIComponent(selectedPointId)}`}>Open fiber trace</Link>
            </div>
          </Panel>

          <Panel title="Audit History" icon={<History size={17} />}>
            <div className="splice-audit-list">
              {view.auditHistory.map((event) => (
                <article key={event.eventId}>
                  <strong>{event.eventType}</strong>
                  <span>{event.timestamp}</span>
                  <p>{event.notes}</p>
                </article>
              ))}
            </div>
          </Panel>

          <div className="splice-manager-warning compact">
            <AlertTriangle size={16} />
            <span>{view.warnings.join(" ")}</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="splice-manager-panel">
      <div className="splice-manager-panel-title">{icon}<strong>{title}</strong></div>
      {children}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="splice-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return <span className={`splice-status-pill ${value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
}

function serviceNameForAssignment(assignmentId: string | undefined, view: SpliceManagerViewModel) {
  return serviceForAssignment(assignmentId, view)?.serviceName || "";
}

function serviceCriticalityForAssignment(assignmentId: string | undefined, view: SpliceManagerViewModel) {
  return serviceForAssignment(assignmentId, view)?.criticality || "";
}

function serviceForAssignment(assignmentId: string | undefined, view: SpliceManagerViewModel) {
  if (!assignmentId) return undefined;
  return view.services.find((service) => service.primaryPathAssignmentId === assignmentId || service.backupPathAssignmentId === assignmentId);
}

function compareLocalMatrices(existingRows: FiberSplice[], proposedRows: FiberSplice[]) {
  const existingKeys = new Set(existingRows.map(spliceConnectionKey));
  const proposedKeys = new Set(proposedRows.map(spliceConnectionKey));
  const addedPreview = proposedRows.filter((row) => !existingKeys.has(spliceConnectionKey(row))).slice(0, 5);
  return {
    existingCount: existingRows.length,
    proposedCount: proposedRows.length,
    addedCount: proposedRows.filter((row) => !existingKeys.has(spliceConnectionKey(row))).length,
    unchangedCount: proposedRows.filter((row) => existingKeys.has(spliceConnectionKey(row))).length,
    removedCount: existingRows.filter((row) => !proposedKeys.has(spliceConnectionKey(row))).length,
    addedPreview,
  };
}

function spliceConnectionKey(row: FiberSplice) {
  return `${row.fromCableId}:${row.fromStrandNumber}->${row.toCableId}:${row.toStrandNumber}:${row.spliceType}`;
}

function matrixActionLabel(action: MatrixAction) {
  if (action === "create") return "Create proposed matrix";
  if (action === "validate") return "Validate proposed matrix";
  if (action === "approve") return "Approve proposed matrix";
  return "Commit proposed matrix";
}

function matrixActionMessage(action: MatrixAction, details: unknown) {
  const record = details && typeof details === "object" ? details as Record<string, unknown> : {};
  if (typeof record.message === "string") return record.message;
  if (typeof record.warning === "string") return record.warning;
  if (action === "validate" && typeof record.validForDemoPreview === "boolean") {
    return record.validForDemoPreview ? "Synthetic proposed matrix passed demo validation." : "Synthetic proposed matrix has demo validation warnings.";
  }
  return `${matrixActionLabel(action)} completed as a synthetic preview.`;
}

function matrixActionDetails(details: Record<string, unknown>) {
  const payload = details.payload && typeof details.payload === "object" ? details.payload as Record<string, unknown> : {};
  const proposedRowsFromPayload = Array.isArray(payload.proposedConnections) ? payload.proposedConnections.length : undefined;
  const parts = [
    typeof details.proposedConnectionCount === "number" ? `${details.proposedConnectionCount} proposed rows` : proposedRowsFromPayload !== undefined ? `${proposedRowsFromPayload} proposed rows` : undefined,
    typeof details.existingConnectionCount === "number" ? `${details.existingConnectionCount} existing rows` : typeof payload.existingConnectionCount === "number" ? `${payload.existingConnectionCount} existing rows` : undefined,
    typeof details.persisted === "boolean" ? `persisted: ${details.persisted ? "yes" : "no"}` : undefined,
    Array.isArray(details.validationIssues) && details.validationIssues.length ? `${details.validationIssues.length} validation issues` : undefined,
    Array.isArray(details.duplicateActiveStrandWarnings) && details.duplicateActiveStrandWarnings.length ? `${details.duplicateActiveStrandWarnings.length} duplicate-strand warnings` : undefined,
    Array.isArray(details.continuityWarnings) && details.continuityWarnings.length ? `${details.continuityWarnings.length} continuity warnings` : undefined,
  ].filter(Boolean);
  return parts.join(" / ") || "Synthetic preview response received.";
}

function matrixFiberCapacity(rows: FiberSplice[]) {
  return Math.max(24, ...rows.map((row) => Math.max(row.fromStrandNumber, row.toStrandNumber)));
}

function clampStrand(value: number, fiberCapacity: number) {
  const normalized = Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(normalized, Math.max(1, fiberCapacity)));
}

function tubeNumber(strandNumber: number) {
  return Math.max(1, Math.ceil(strandNumber / 12));
}
