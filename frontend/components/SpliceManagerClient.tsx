"use client";

import Link from "next/link";
import { AlertTriangle, Cable, ClipboardList, GitCompareArrows, History, Network, Plus, Route, ShieldAlert, Trash2, Workflow } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { FiberSplice } from "@/lib/types/assets";
import type { SpliceManagerViewModel } from "@/lib/opgw/continuityEngine";

type SpliceManagerClientProps = {
  view: SpliceManagerViewModel;
};

type MatrixLayerFilter = "all" | "existing" | "proposed";

const fiberColors = ["Blue", "Orange", "Green", "Brown", "Slate", "White", "Red", "Black", "Yellow", "Violet", "Rose", "Aqua"];

export function SpliceManagerClient({ view }: SpliceManagerClientProps) {
  const [query, setQuery] = useState("");
  const [layerFilter, setLayerFilter] = useState<MatrixLayerFilter>("all");
  const [spliceRows, setSpliceRows] = useState<FiberSplice[]>(() => [...view.existingSplices, ...view.proposedSplices]);
  const selectedPointId = view.splicePoint.properties.splicePointId;
  const closure = view.closure?.properties;
  const derivedFiberCapacity = Math.max(matrixFiberCapacity(spliceRows), ...view.connectedCableSections.map((section) => section.fiberCount), 24);
  const rows = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return spliceRows
      .filter((splice) => {
        if (layerFilter === "existing" && splice.status !== "existing") return false;
        if (layerFilter === "proposed" && splice.status === "existing") return false;
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
  }, [layerFilter, query, spliceRows, view]);
  const totalLoss = rows.reduce((sum, splice) => sum + (splice.lossDb || 0), 0);
  const assignedRows = rows.filter((splice) => splice.assignmentId).length;

  function addProposedSplice() {
    const firstSection = view.connectedCableSections[0];
    const secondSection = view.connectedCableSections[1] || firstSection;
    const nextStrand = Math.max(1, (spliceRows.length % Math.max(12, derivedFiberCapacity || 48)) + 1);
    const fromCable = firstSection?.cableId || closure?.cableIds[0] || "DEMO-CABLE-A";
    const toCable = secondSection?.cableId || closure?.cableIds[1] || fromCable;
    setSpliceRows((current) => [
      {
        id: `PROP-${selectedPointId}-${Date.now().toString(36).toUpperCase()}`,
        spliceClosureId: closure?.id || view.splicePoint.properties.closureId || selectedPointId,
        fromCableId: fromCable,
        fromStrandNumber: nextStrand,
        toCableId: toCable,
        toStrandNumber: nextStrand,
        spliceType: fromCable === toCable ? "express" : "straight_through",
        lossDb: 0.06,
        status: "proposed",
        notes: "Local demo proposed splice. It does not change existing continuity until committed in a future workflow.",
      },
      ...current,
    ]);
    setLayerFilter("proposed");
  }

  function deleteProposedSplice(spliceId: string) {
    setSpliceRows((current) => current.filter((splice) => splice.id !== spliceId || splice.status === "existing"));
  }

  return (
    <main className="splice-manager-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/dashboard?drawer=splices">Back to map dashboard</Link>
          <h1>Splice Manager</h1>
          <p>{selectedPointId} / {closure?.id || "No closure assigned"} / {view.splicePoint.properties.structureNumber}</p>
        </div>
        <div className="splice-manager-warning">
          <AlertTriangle size={18} />
          <span>Synthetic demo data only. Do not use for operations, protection, SCADA, dispatch, CEII, or private utility telecom routing.</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Splice manager header summary">
        <SummaryCard label="Closure Type" value={closure?.closureType || view.splicePoint.properties.spliceType} />
        <SummaryCard label="Fiber Capacity" value={`${derivedFiberCapacity}F`} />
        <SummaryCard label="Tray Count" value={String(Math.max(1, Math.ceil(derivedFiberCapacity / 24)))} />
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
                    <tr key={section.cableId}>
                      <td>{section.cableId}</td>
                      <td>{section.transmissionLineId}</td>
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
              <button type="button" onClick={addProposedSplice}><Plus size={15} />Add proposed splice</button>
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
                    <th>Incoming</th>
                    <th>Outgoing</th>
                    <th>Splice Type</th>
                    <th>Service</th>
                    <th>Layer</th>
                    <th>Loss</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((splice) => (
                    <tr className={splice.status !== "existing" ? "proposed-row" : ""} key={splice.id}>
                      <td>{Math.max(1, Math.ceil(splice.fromStrandNumber / 24))}</td>
                      <td>{tubeNumber(splice.fromStrandNumber)} / {fiberColors[(splice.fromStrandNumber - 1) % fiberColors.length]}</td>
                      <td>{splice.fromCableId} / strand {splice.fromStrandNumber}</td>
                      <td>{splice.toCableId} / strand {splice.toStrandNumber}</td>
                      <td>{splice.spliceType}</td>
                      <td>{serviceNameForAssignment(splice.assignmentId, view) || splice.assignmentId || "-"}</td>
                      <td><StatusPill value={splice.status === "existing" ? "existing" : "proposed"} /></td>
                      <td>{(splice.lossDb || 0).toFixed(2)} dB</td>
                      <td>
                        {splice.status === "existing"
                          ? <span className="splice-readonly">read-only</span>
                          : <button className="splice-icon-button" type="button" onClick={() => deleteProposedSplice(splice.id)} aria-label={`Delete ${splice.id}`}><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <div><dt>Splices</dt><dd>{path.totalSplicePoints}</dd></div>
                    <div><dt>Loss</dt><dd>{path.totalEstimatedLossDb.toFixed(2)} dB</dd></div>
                  </dl>
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
                  <div>
                    <StatusPill value={service.criticality} />
                    <StatusPill value={service.layerType} />
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Proposed Splice Editor" icon={<Workflow size={17} />}>
            <div className="splice-action-stack">
              <button type="button" onClick={addProposedSplice}><Plus size={15} />Create one-to-one proposed splice</button>
              <button type="button">Validate proposed matrix</button>
              <button type="button">Approve proposed matrix</button>
              <button type="button">Commit proposed matrix</button>
            </div>
            <p className="splice-side-note">Existing splice rows remain read-only in this no-account demo. Proposed edits are local UI state until a future backend commit workflow is added.</p>
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
  if (!assignmentId) return "";
  return view.services.find((service) => service.primaryPathAssignmentId === assignmentId || service.backupPathAssignmentId === assignmentId)?.serviceName || "";
}

function matrixFiberCapacity(rows: FiberSplice[]) {
  return Math.max(24, ...rows.map((row) => Math.max(row.fromStrandNumber, row.toStrandNumber)));
}

function tubeNumber(strandNumber: number) {
  return Math.max(1, Math.ceil(strandNumber / 12));
}
