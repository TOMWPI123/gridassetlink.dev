import Link from "next/link";
import { AlertTriangle, Cable, GitCompareArrows, Network, Route, ShieldAlert, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import type { OpgwCableContinuityView } from "@/lib/opgw/cableContinuity";

export function OpgwCableContinuityPage({ view }: { view: OpgwCableContinuityView }) {
  const cable = view.cable.properties;
  const selectedSection = view.selectedCableSection?.properties;
  const pageTitle = selectedSection?.cableId || cable.cableName;
  const continuityCableId = selectedSection?.cableId || cable.id;
  const pageSubtitle = selectedSection
    ? `${selectedSection.fromSplicePointId} to ${selectedSection.toSplicePointId} / ${view.routeId} / ${cable.lineName || cable.lineId}`
    : `${cable.id} / ${view.routeId} / ${cable.lineName || cable.lineId}`;
  return (
    <main className="splice-manager-page opgw-cable-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/opgw">Back to OPGW Fiber Planner</Link>
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>
        <div className="splice-manager-warning">
          <AlertTriangle size={18} />
          <span>Synthetic OPGW planning data only. This cable view is not proof of real OPGW, fiber availability, SCADA, relay, protection, or private telecom routing.</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Cable continuity summary">
        <SummaryCard label="Fiber Count" value={`${cable.fiberCount}F`} />
        <SummaryCard label="Route Miles" value={view.totals.routeMiles.toFixed(2)} />
        <SummaryCard label="Cable Sections" value={view.totals.cableSections.toLocaleString()} />
        <SummaryCard label="Splice Closures" value={view.totals.spliceClosures.toLocaleString()} />
        <SummaryCard label="Services Carried" value={view.totals.services.toLocaleString()} />
        <SummaryCard label="Estimated Loss" value={`${view.totals.estimatedLossDb.toFixed(2)} dB`} />
      </section>

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <Panel title="Full Cable Continuity" icon={<Route size={17} />}>
            <div className="opgw-continuity-strip">
              {view.splicePoints.map((point, index) => (
                <div className="opgw-continuity-node" key={point.properties.splicePointId}>
                  <span>{index + 1}</span>
                  <strong>{point.properties.structureNumber}</strong>
                  <small>{point.properties.spliceType.replaceAll("_", " ")}</small>
                  <em>{point.properties.closureId || "no closure"}</em>
                  <Link href={`/opgw/splices/${encodeURIComponent(point.properties.splicePointId)}`}>Open splice</Link>
                </div>
              ))}
            </div>
            <div className="splice-table-wrap">
              <table className="splice-manager-table">
                <thead>
                  <tr>
                    <th>Cable ID</th>
                    <th>From</th>
                    <th>To</th>
                    <th>A Splice</th>
                    <th>Z Splice</th>
                    <th>Miles</th>
                    <th>Spans</th>
                    <th>Available</th>
                    <th>Assigned</th>
                    <th>Reserved</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.cableSections.map((section) => (
                    <tr key={section.properties.cableSectionId}>
                      <td>{section.properties.cableId}</td>
                      <td>{section.properties.fromStructureNumber}</td>
                      <td>{section.properties.toStructureNumber}</td>
                      <td>{section.properties.fromSplicePointId}</td>
                      <td>{section.properties.toSplicePointId}</td>
                      <td>{section.properties.routeMiles.toFixed(2)}</td>
                      <td>{section.properties.totalSpans}</td>
                      <td>{section.properties.availableStrands}</td>
                      <td>{section.properties.assignedStrands}</td>
                      <td>{section.properties.reservedStrands}</td>
                      <td><StatusPill value={section.properties.installStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Splicing and Closures" icon={<GitCompareArrows size={17} />}>
            <div className="opgw-closure-grid">
              {view.spliceClosures.map((closure) => {
                const point = view.splicePoints.find((item) => item.properties.closureId === closure.properties.id);
                const openId = point?.properties.splicePointId || closure.properties.id;
                return (
                  <article key={closure.properties.id}>
                    <strong>{closure.properties.name}</strong>
                    <span>{closure.properties.id} / {closure.properties.structureNumber}</span>
                    <dl>
                      <div><dt>Type</dt><dd>{closure.properties.closureType.replaceAll("_", " ")}</dd></div>
                      <div><dt>Rows</dt><dd>{view.fiberSplices.filter((splice) => splice.spliceClosureId === closure.properties.id).length}</dd></div>
                      <div><dt>Status</dt><dd><StatusPill value={closure.properties.status} /></dd></div>
                    </dl>
                    <div className="opgw-inline-actions">
                      <Link href={`/opgw/splices/${encodeURIComponent(openId)}`}>Open Splice Manager</Link>
                      <Link href={`/opgw/splices/${encodeURIComponent(openId)}/diagram`}>Interactive Diagram</Link>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="splice-table-wrap tall">
              <table className="splice-manager-table matrix">
                <thead>
                  <tr>
                    <th>Closure</th>
                    <th>Incoming</th>
                    <th>Outgoing</th>
                    <th>Splice Type</th>
                    <th>Loss</th>
                    <th>Status</th>
                    <th>Assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {view.fiberSplices.slice(0, 360).map((splice) => (
                    <tr key={splice.id}>
                      <td>{splice.spliceClosureId}</td>
                      <td>{splice.fromCableId} / {splice.fromStrandNumber}</td>
                      <td>{splice.toCableId} / {splice.toStrandNumber}</td>
                      <td>{splice.spliceType}</td>
                      <td>{(splice.lossDb || 0).toFixed(2)} dB</td>
                      <td><StatusPill value={splice.status} /></td>
                      <td>{splice.assignmentId || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Services Carried and Continuity Traces" icon={<Network size={17} />}>
            <div className="continuity-list">
              {view.services.length ? view.services.map((service) => {
                const path = view.continuityPaths.find((item) => item.serviceId === service.serviceId);
                return (
                  <article className={`continuity-card ${path?.pathStatus || ""}`} key={service.serviceId}>
                    <div>
                      <strong>{service.serviceName}</strong>
                      <span>{service.serviceId} / {service.fromSiteName} to {service.toSiteName}</span>
                    </div>
                    <dl>
                      <div><dt>Type</dt><dd>{service.serviceType}</dd></div>
                      <div><dt>Status</dt><dd><StatusPill value={service.operationalStatus} /></dd></div>
                      <div><dt>Criticality</dt><dd><StatusPill value={service.criticality} /></dd></div>
                      <div><dt>Loss</dt><dd>{path ? `${path.totalEstimatedLossDb.toFixed(2)} dB` : "-"}</dd></div>
                      <div><dt>Splices</dt><dd>{path?.totalSplicePoints ?? "-"}</dd></div>
                    </dl>
                    {path ? (
                      <ol>
                        {path.segments.slice(0, 10).map((segment) => (
                          <li key={segment.pathSegmentId}>
                            <span>{segment.sequenceNumber}</span>
                            <strong>{segment.objectType.replaceAll("_", " ")}</strong>
                            <em>{segment.objectId}</em>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </article>
                );
              }) : <div className="splice-side-note">No synthetic services are currently assigned to this cable.</div>}
            </div>
          </Panel>
        </div>

        <aside className="splice-manager-side">
          <Panel title="Cable Menu" icon={<Cable size={17} />}>
            <div className="splice-action-stack">
              <Link href="/opgw">Open OPGW Fiber Planner</Link>
              <Link href={`/fiber-trace?cable=${encodeURIComponent(continuityCableId)}`}>Open Fiber Trace</Link>
              <Link href={`/outage-impact?cable=${encodeURIComponent(continuityCableId)}`}>Analyze Outage Impact</Link>
              <Link href={`/work-orders/new?cable=${encodeURIComponent(cable.id)}`}>Create Work Order</Link>
            </div>
          </Panel>

          <Panel title="Strand Utilization" icon={<Workflow size={17} />}>
            <div className="opgw-side-stat-grid">
              <div><span>Total</span><strong>{view.totals.totalStrands}</strong></div>
              <div><span>Available</span><strong>{view.totals.availableStrands}</strong></div>
              <div><span>Assigned</span><strong>{view.totals.assignedStrands}</strong></div>
              <div><span>Reserved</span><strong>{view.totals.reservedStrands}</strong></div>
            </div>
          </Panel>

          <Panel title="Assignments" icon={<Network size={17} />}>
            <div className="service-carried-list">
              {view.fiberAssignments.slice(0, 24).map((assignment) => (
                <article key={assignment.id}>
                  <strong>{assignment.assignmentName}</strong>
                  <span>{assignment.serviceType} / {assignment.status}</span>
                  <div>
                    <StatusPill value={assignment.status} />
                    <StatusPill value={`${assignment.strandSegments.reduce((count, segment) => count + segment.strandNumbers.length, 0)} strands`} />
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Patch Panels" icon={<Cable size={17} />}>
            <div className="service-carried-list">
              {view.patchPanels.map((panel) => (
                <article key={panel.id}>
                  <strong>{panel.name}</strong>
                  <span>{panel.locationType} / {panel.locationId}</span>
                  <div>
                    <StatusPill value={`${panel.portCount} ports`} />
                    <StatusPill value={panel.connectorType} />
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Warnings" icon={<ShieldAlert size={17} />}>
            <div className="splice-warning-list vertical">
              {view.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          </Panel>
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
