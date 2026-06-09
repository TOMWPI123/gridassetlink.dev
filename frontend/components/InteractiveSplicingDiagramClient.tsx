"use client";

import Link from "next/link";
import { AlertTriangle, Cable, GitCompareArrows, Plus, Trash2, Workflow, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { FiberSplice } from "@/lib/types/assets";
import type { SpliceManagerViewModel } from "@/lib/opgw/continuityEngine";

type InteractiveSplicingDiagramClientProps = {
  view: SpliceManagerViewModel;
};

type DiagramLayer = "all" | "existing" | "proposed";

const strandColors = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#7c2d12",
  "#64748b",
  "#f8fafc",
  "#dc2626",
  "#111827",
  "#eab308",
  "#7c3aed",
  "#ec4899",
  "#06b6d4",
];

const strandColorNames = ["Blue", "Orange", "Green", "Brown", "Slate", "White", "Red", "Black", "Yellow", "Violet", "Rose", "Aqua"];

export function InteractiveSplicingDiagramClient({ view }: InteractiveSplicingDiagramClientProps) {
  const selectedPointId = view.splicePoint.properties.splicePointId;
  const closureId = view.closure?.properties.id || view.splicePoint.properties.closureId || selectedPointId;
  const [layer, setLayer] = useState<DiagramLayer>("all");
  const [query, setQuery] = useState("");
  const [spliceRows, setSpliceRows] = useState<FiberSplice[]>(() => [...view.existingSplices, ...view.proposedSplices]);
  const [selectedSpliceId, setSelectedSpliceId] = useState(spliceRows[0]?.id || "");
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState("Click a splice connection to inspect strand continuity.");

  const incomingSections = view.connectedCableSections.filter((section) => section.direction === "incoming");
  const outgoingSections = view.connectedCableSections.filter((section) => section.direction === "outgoing");
  const firstIncoming = incomingSections[0] || view.connectedCableSections[0];
  const firstOutgoing = outgoingSections[0] || view.connectedCableSections[1] || firstIncoming;

  const visibleRows = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return spliceRows
      .filter((splice) => {
        if (layer === "existing" && splice.status !== "existing") return false;
        if (layer === "proposed" && splice.status === "existing") return false;
        if (!lowered) return true;
        return [
          splice.id,
          splice.fromCableId,
          splice.toCableId,
          splice.fromStrandNumber,
          splice.toStrandNumber,
          splice.spliceType,
          splice.assignmentId,
          serviceLabel(splice.assignmentId, view),
        ].join(" ").toLowerCase().includes(lowered);
      })
      .slice(0, 80);
  }, [layer, query, spliceRows, view]);

  const selectedSplice = visibleRows.find((splice) => splice.id === selectedSpliceId) || visibleRows[0] || spliceRows[0];
  const svgHeight = Math.max(360, 112 + visibleRows.length * 26);
  const existingCount = spliceRows.filter((splice) => splice.status === "existing").length;
  const proposedCount = spliceRows.filter((splice) => splice.status !== "existing").length;
  const assignedCount = spliceRows.filter((splice) => splice.assignmentId).length;

  function addProposedConnection() {
    const maxStrand = Math.max(24, ...spliceRows.map((splice) => Math.max(splice.fromStrandNumber, splice.toStrandNumber)));
    const nextStrand = ((spliceRows.length + proposedCount) % maxStrand) + 1;
    const proposed: FiberSplice = {
      id: `PROP-DIAGRAM-${selectedPointId}-${Date.now().toString(36).toUpperCase()}`,
      spliceClosureId: closureId,
      fromCableId: firstIncoming?.cableId || view.closure?.properties.cableIds[0] || "DEMO-INCOMING-CABLE",
      fromStrandNumber: nextStrand,
      toCableId: firstOutgoing?.cableId || view.closure?.properties.cableIds[1] || firstIncoming?.cableId || "DEMO-OUTGOING-CABLE",
      toStrandNumber: nextStrand,
      spliceType: "straight_through",
      lossDb: 0.06,
      status: "proposed",
      notes: "Local proposed splice created from the interactive diagram. It is not committed to existing continuity.",
    };
    setSpliceRows((current) => [proposed, ...current]);
    setSelectedSpliceId(proposed.id);
    setLayer("all");
    setValidationMessage("Proposed splice added to the diagram preview. Existing splice records remain unchanged.");
  }

  function deleteSelectedProposed() {
    if (!selectedSplice || selectedSplice.status === "existing") return;
    setSpliceRows((current) => current.filter((splice) => splice.id !== selectedSplice.id));
    setSelectedSpliceId("");
    setValidationMessage("Proposed splice removed from the local diagram preview.");
  }

  function validateDiagram() {
    const strandKeys = new Set<string>();
    const duplicates: string[] = [];
    spliceRows.forEach((splice) => {
      const key = `${splice.fromCableId}:${splice.fromStrandNumber}`;
      if (strandKeys.has(key) && splice.spliceType !== "branch") duplicates.push(key);
      strandKeys.add(key);
    });
    setValidationMessage(
      duplicates.length
        ? `Validation warning: ${duplicates.length} duplicate non-branch strand connection(s) in this synthetic preview.`
        : "Validation passed for the synthetic preview. No duplicate non-branch strand connections were found.",
    );
  }

  function selectSpliceNode(splice: FiberSplice) {
    setSelectedSpliceId(splice.id);
    setNodeMenuOpen(true);
    setValidationMessage(`${splice.id} selected for inspection.`);
  }

  return (
    <main className="splicing-diagram-page">
      <header className="splicing-diagram-hero">
        <div>
          <Link className="splice-manager-back" href={`/opgw/splices/${encodeURIComponent(selectedPointId)}`}>Back to Splice Manager</Link>
          <h1>Interactive Splicing Diagram</h1>
          <p>{selectedPointId} / {closureId} / {view.splicePoint.properties.structureNumber}</p>
        </div>
        <div className="splice-manager-warning">
          <AlertTriangle size={18} />
          <span>Synthetic demo splicing only. Do not use for operations, protection, SCADA, dispatch, CEII, or private utility telecom routing.</span>
        </div>
      </header>

      <section className="splicing-diagram-metrics" aria-label="Splicing diagram metrics">
        <Metric label="Existing Splices" value={existingCount.toLocaleString()} />
        <Metric label="Proposed Splices" value={proposedCount.toLocaleString()} />
        <Metric label="Synthetic Services" value={view.services.length.toLocaleString()} />
        <Metric label="Assigned Rows" value={assignedCount.toLocaleString()} />
        <Metric label="Visible Rows" value={visibleRows.length.toLocaleString()} />
      </section>

      <section className="splicing-diagram-shell">
        <div className="splicing-diagram-main">
          <div className="splicing-diagram-toolbar">
            <label>
              <span>Layer</span>
              <select value={layer} onChange={(event) => setLayer(event.target.value as DiagramLayer)}>
                <option value="all">Existing + proposed</option>
                <option value="existing">Existing splices</option>
                <option value="proposed">Proposed splices</option>
              </select>
            </label>
            <label>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Strand, cable, service, assignment" />
            </label>
            <button type="button" onClick={addProposedConnection}><Plus size={15} />Add proposed splice</button>
            <button type="button" onClick={validateDiagram}><GitCompareArrows size={15} />Validate</button>
          </div>

          <div className="splicing-diagram-canvas-wrap">
            <svg className="splicing-diagram-canvas" viewBox={`0 0 860 ${svgHeight}`} role="img" aria-label="Interactive fiber splicing diagram">
              <defs>
                <filter id="diagramShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.16" />
                </filter>
              </defs>
              <rect className="diagram-board" x="12" y="12" width="836" height={svgHeight - 24} rx="12" />
              <text className="diagram-title" x="38" y="44">Incoming cable sections</text>
              <text className="diagram-title right" x="822" y="44">Outgoing cable sections</text>
              <line className="diagram-bus" x1="180" y1="62" x2="180" y2={svgHeight - 38} />
              <line className="diagram-bus" x1="680" y1="62" x2="680" y2={svgHeight - 38} />

              {visibleRows.length ? visibleRows.map((splice, index) => {
                const y = 82 + index * 26;
                const isSelected = selectedSplice?.id === splice.id;
                const stroke = splice.status === "existing" ? "#0f766e" : splice.status === "faulted" ? "#dc2626" : "#f97316";
                const fromColor = strandColors[(splice.fromStrandNumber - 1) % strandColors.length];
                const toColor = strandColors[(splice.toStrandNumber - 1) % strandColors.length];
                return (
                  <g
                    className={`diagram-row ${isSelected ? "selected" : ""} ${splice.status}`}
                    key={splice.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select splice ${splice.id}`}
                    onClick={() => selectSpliceNode(splice)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectSpliceNode(splice);
                      }
                    }}
                  >
                    <text className="diagram-strand-label" x="38" y={y + 4}>{splice.fromCableId}</text>
                    <text className="diagram-strand-label right" x="822" y={y + 4}>{splice.toCableId}</text>
                    <circle cx="180" cy={y} r="7" fill={fromColor} stroke="#0f172a" strokeWidth="1.2" />
                    <circle cx="680" cy={y} r="7" fill={toColor} stroke="#0f172a" strokeWidth="1.2" />
                    <text className="diagram-strand-number" x="196" y={y + 4}>S{splice.fromStrandNumber}</text>
                    <text className="diagram-strand-number right" x="664" y={y + 4}>S{splice.toStrandNumber}</text>
                    <path
                      className="diagram-connection"
                      d={`M 198 ${y} C 310 ${y - 18}, 548 ${y + 18}, 662 ${y}`}
                      stroke={stroke}
                      strokeDasharray={splice.status === "existing" ? "0" : "8 7"}
                    />
                    <text className="diagram-service-label" x="430" y={y - 7}>{serviceLabel(splice.assignmentId, view) || splice.spliceType}</text>
                  </g>
                );
              }) : (
                <text className="diagram-empty" x="430" y="180">No splice rows match this layer and search.</text>
              )}
            </svg>
          </div>

          {nodeMenuOpen && selectedSplice ? (
            <section className="splicing-node-menu" aria-label="Splice node action menu">
              <button className="splicing-node-menu-close" type="button" onClick={() => setNodeMenuOpen(false)} aria-label="Close splice node menu">
                <X size={16} />
              </button>
              <strong>{view.splicePoint.properties.structureNumber} {view.closure?.properties.closureType?.replaceAll("_", " ") || "splice node"}</strong>
              <span>Splice Closure / {selectedSplice.status === "existing" ? "Existing" : "Proposed"}</span>
              <dl>
                <div><dt>Splice Point</dt><dd>{selectedPointId}</dd></div>
                <div><dt>Closure</dt><dd>{closureId}</dd></div>
                <div><dt>Structure</dt><dd>{view.splicePoint.properties.structureId}</dd></div>
                <div><dt>Line</dt><dd>{view.splicePoint.properties.transmissionLineId}</dd></div>
                <div><dt>Route</dt><dd>{view.splicePoint.properties.opgwRouteId}</dd></div>
                <div><dt>Location</dt><dd>{view.splicePoint.properties.spliceType.replaceAll("_", " ")}</dd></div>
                <div><dt>Fiber Count</dt><dd>{Math.max(24, ...view.connectedCableSections.map((section) => section.fiberCount))}</dd></div>
                <div><dt>Incoming</dt><dd>{incomingSections.length}</dd></div>
                <div><dt>Outgoing</dt><dd>{outgoingSections.length}</dd></div>
                <div><dt>Active Services</dt><dd>{view.services.filter((service) => service.layerType === "existing").length}</dd></div>
                <div><dt>Proposed Services</dt><dd>{view.services.filter((service) => service.layerType === "proposed").length}</dd></div>
              </dl>
              <small>Synthetic splice closure only. Existing/proposed rows are demo planning records.</small>
              <nav aria-label="Splice node menu actions">
                <Link className="primary" href={`/opgw/splices/${encodeURIComponent(selectedPointId)}/diagram`}>Interactive Splicing Diagram</Link>
                <Link href={`/opgw/splices/${encodeURIComponent(selectedPointId)}`}>Open Splice Manager</Link>
                <Link href={`/fiber-trace?splicePoint=${encodeURIComponent(selectedPointId)}`}>View Fiber Continuity</Link>
                <Link href={`/opgw/splices/${encodeURIComponent(selectedPointId)}?layer=existing`}>View Existing Splices</Link>
                <Link href={`/opgw/splices/${encodeURIComponent(selectedPointId)}?layer=proposed`}>View Proposed Splices</Link>
                <Link href={`/outage-impact?splicePoint=${encodeURIComponent(selectedPointId)}`}>Analyze Outage Impact</Link>
                <Link href={`/work-orders/new?splicePoint=${encodeURIComponent(selectedPointId)}`}>Create Work Order</Link>
              </nav>
            </section>
          ) : null}
        </div>

        <aside className="splicing-diagram-side">
          <section className="splicing-diagram-card selected">
            <div className="splicing-diagram-card-title"><Zap size={17} /><strong>Selected Connection</strong></div>
            {selectedSplice ? (
              <>
                <dl className="splicing-diagram-detail-list">
                  <div><dt>Splice ID</dt><dd>{selectedSplice.id}</dd></div>
                  <div><dt>Layer</dt><dd><span className={`splice-status-pill ${selectedSplice.status}`}>{selectedSplice.status}</span></dd></div>
                  <div><dt>Incoming</dt><dd>{selectedSplice.fromCableId} strand {selectedSplice.fromStrandNumber}</dd></div>
                  <div><dt>Outgoing</dt><dd>{selectedSplice.toCableId} strand {selectedSplice.toStrandNumber}</dd></div>
                  <div><dt>Tube / Color</dt><dd>Tube {tubeNumber(selectedSplice.fromStrandNumber)} / {strandColorNames[(selectedSplice.fromStrandNumber - 1) % strandColorNames.length]}</dd></div>
                  <div><dt>Service</dt><dd>{serviceLabel(selectedSplice.assignmentId, view) || selectedSplice.assignmentId || "Unassigned demo fiber"}</dd></div>
                  <div><dt>Loss</dt><dd>{(selectedSplice.lossDb || 0).toFixed(2)} dB</dd></div>
                </dl>
                <div className="splicing-diagram-actions">
                  <button type="button" onClick={validateDiagram}>Validate continuity</button>
                  <button type="button" onClick={deleteSelectedProposed} disabled={selectedSplice.status === "existing"}><Trash2 size={14} />Delete proposed</button>
                  <button type="button" onClick={() => setNodeMenuOpen(true)}>Open node menu</button>
                </div>
              </>
            ) : (
              <p>No splice connection is selected.</p>
            )}
          </section>

          <section className="splicing-diagram-card">
            <div className="splicing-diagram-card-title"><Cable size={17} /><strong>Cable Sections</strong></div>
            <div className="splicing-diagram-section-list">
              {view.connectedCableSections.map((section) => (
                <article key={section.cableId}>
                  <strong>{section.cableId}</strong>
                  <span>{section.direction} / {section.fiberCount}F / {section.layer}</span>
                  <small>{section.fromStructure} to {section.toStructure}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="splicing-diagram-card">
            <div className="splicing-diagram-card-title"><Workflow size={17} /><strong>Diagram State</strong></div>
            <p>{validationMessage}</p>
            <p className="splice-side-note">Existing splice lines are read-only. Orange dashed lines are proposed local edits in this no-account synthetic demo.</p>
            <div className="splice-action-stack">
              <Link href={`/opgw/splices/${encodeURIComponent(selectedPointId)}?layer=existing`}>Open existing matrix</Link>
              <Link href={`/opgw/splices/${encodeURIComponent(selectedPointId)}?layer=proposed`}>Open proposed matrix</Link>
              <Link href={`/fiber-trace?splicePoint=${encodeURIComponent(selectedPointId)}`}>Open fiber trace</Link>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="splicing-diagram-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function serviceLabel(assignmentId: string | undefined, view: SpliceManagerViewModel) {
  if (!assignmentId) return "";
  return view.services.find((service) => service.primaryPathAssignmentId === assignmentId || service.backupPathAssignmentId === assignmentId)?.serviceName || "";
}

function tubeNumber(strandNumber: number) {
  return Math.max(1, Math.ceil(strandNumber / 12));
}
