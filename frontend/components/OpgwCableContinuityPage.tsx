import Link from "next/link";
import { AlertTriangle, Cable, GitCompareArrows, Network, Route, ShieldAlert, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import type { OpgwCableContinuityView } from "@/lib/opgw/cableContinuity";
import { OpgwCableModuleSearch, type OpgwCableModuleSearchItem } from "@/components/OpgwCableModuleSearch";

type ClosureSpliceGroup = {
  closure?: OpgwCableContinuityView["spliceClosures"][number];
  point?: OpgwCableContinuityView["splicePoints"][number];
  rows: OpgwCableContinuityView["fiberSplices"];
  closureId: string;
  openId: string;
  structureNumber: string;
  closureType: string;
  status: string;
};

const spanAttributeColumns = [
  "spanSegmentId",
  "cableSectionId",
  "opgwRouteId",
  "transmissionLineId",
  "fromStructureId",
  "toStructureId",
  "fromStructureNumber",
  "toStructureNumber",
  "spanLengthFt",
  "fiberCount",
  "cableStatus",
  "spanStatus",
  "hasMidspanIssue",
  "sagClearanceNote",
  "inspectionStatus",
  "outageRiskScore",
  "openWorkOrderCount",
  "synthetic",
  "notes",
  "geometryType",
  "geometryCoordinates",
] as const;

type SpanAttributeColumn = typeof spanAttributeColumns[number];
type SpanAttributeRow = Record<SpanAttributeColumn, string>;

export function OpgwCableContinuityPage({ view, cableModules }: { view: OpgwCableContinuityView; cableModules: OpgwCableModuleSearchItem[] }) {
  const cable = view.cable.properties;
  const spliceClosureGroups = buildClosureSpliceGroups(view);
  const spanAttributeRows = buildSpanAttributeRows(view);
  return (
    <main className="splice-manager-page opgw-cable-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/opgw">Back to OPGW Fiber Planner</Link>
          <h1>{cable.cableName}</h1>
          <p>{cable.id} / {view.routeId} / {cable.lineName || cable.lineId}</p>
        </div>
        <div className="splice-manager-warning">
          <AlertTriangle size={18} />
          <span>Synthetic OPGW planning data only. This cable view is not proof of real OPGW, fiber availability, SCADA, relay, protection, or private telecom routing.</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Cable continuity summary">
        <SummaryCard label="Fiber Count" value={`${cable.fiberCount}F`} />
        <SummaryCard label="Route Miles" value={view.totals.routeMiles.toFixed(2)} />
        <SummaryCard label="Structures" value={view.totals.structures.toLocaleString()} />
        <SummaryCard label="Cable Sections" value={view.totals.cableSections.toLocaleString()} />
        <SummaryCard label="Span Segments" value={view.totals.spans.toLocaleString()} />
        <SummaryCard label="Splice Closures" value={view.totals.spliceClosures.toLocaleString()} />
        <SummaryCard label="Services Carried" value={view.totals.services.toLocaleString()} />
        <SummaryCard label="Strands" value={view.totals.totalStrands.toLocaleString()} />
        <SummaryCard label="Estimated Loss" value={`${view.totals.estimatedLossDb.toFixed(2)} dB`} />
      </section>

      <OpgwCableModuleSearch modules={cableModules} currentCableId={cable.id} />

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <Panel title="Cable Details" icon={<Cable size={17} />}>
            <div className="opgw-cable-detail-grid">
              <DetailItem label="Cable ID" value={cable.id} />
              <DetailItem label="Route ID" value={view.routeId} />
              <DetailItem label="Transmission line" value={cable.lineName || cable.lineId} />
              <DetailItem label="Status" value={cable.status.replaceAll("_", " ")} />
              <DetailItem label="Fiber type" value={cable.fiberType} />
              <DetailItem label="Manufacturer" value={cable.manufacturer || "synthetic demo"} />
              <DetailItem label="Cable spec" value={cable.cableSpec || "synthetic planning profile"} />
              <DetailItem label="Buffer tubes" value={String(cable.bufferTubeCount || "-")} />
              <DetailItem label="Fibers per tube" value={String(cable.fibersPerTube || "-")} />
              <DetailItem label="Start structure" value={cable.startStructureId} />
              <DetailItem label="End structure" value={cable.endStructureId} />
              <DetailItem label="Source" value={cable.source} />
            </div>
            <p className="splice-side-note">{cable.notes || "Synthetic cable record. Use this module for planning review of strand, splice, structure, and service continuity only."}</p>
          </Panel>

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
                    <th>Section</th>
                    <th>From</th>
                    <th>To</th>
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
                      <td>{section.properties.cableSectionId}</td>
                      <td>{section.properties.fromStructureNumber}</td>
                      <td>{section.properties.toStructureNumber}</td>
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

          <Panel title="Linked Cable Spans" icon={<Workflow size={17} />}>
            <div className="opgw-span-attribute-summary">
              <DetailItem label="Linked span records" value={spanAttributeRows.length.toLocaleString()} />
              <DetailItem label="Total span feet" value={spanAttributeRows.reduce((sum, row) => sum + Number(row.spanLengthFt || 0), 0).toLocaleString()} />
              <DetailItem label="Inspection issues" value={spanAttributeRows.filter((row) => row.hasMidspanIssue === "true" || row.inspectionStatus === "issue_found").length.toLocaleString()} />
              <DetailItem label="Open work orders" value={spanAttributeRows.reduce((sum, row) => sum + Number(row.openWorkOrderCount || 0), 0).toLocaleString()} />
            </div>
            <div className="splice-table-wrap tall">
              <table className="splice-manager-table span-attributes">
                <thead>
                  <tr>
                    {spanAttributeColumns.map((column) => <th key={column}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {spanAttributeRows.map((row) => (
                    <tr key={row.spanSegmentId}>
                      {spanAttributeColumns.map((column) => <td key={`${row.spanSegmentId}-${column}`}>{row[column] || "-"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="splice-side-note">Every row is a synthetic structure-to-structure span linked to this OPGW cable through its cable section. Geometry is shown as the span endpoint coordinates for quick GIS review.</p>
          </Panel>

          <Panel title="Transmission Structures on Cable" icon={<Workflow size={17} />}>
            <div className="splice-table-wrap tall">
              <table className="splice-manager-table">
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Structure</th>
                    <th>Type</th>
                    <th>Voltage</th>
                    <th>OPGW</th>
                    <th>Splice</th>
                    <th>Closures</th>
                    <th>Coordinates</th>
                  </tr>
                </thead>
                <tbody>
                  {view.structures.slice(0, 420).map((structure) => (
                    <tr key={structure.properties.id}>
                      <td>{structure.properties.sequenceIndex}</td>
                      <td>{structure.properties.structureNumber}<br /><small>{structure.properties.id}</small></td>
                      <td>{structure.properties.structureType}</td>
                      <td>{structure.properties.voltageKv ? `${structure.properties.voltageKv} kV` : "-"}</td>
                      <td><StatusPill value={structure.properties.hasOpgw ? "has OPGW" : "no OPGW"} /></td>
                      <td><StatusPill value={structure.properties.hasSplice ? "splice" : "pass through"} /></td>
                      <td>{structure.properties.spliceClosureIds.join(", ") || "-"}</td>
                      <td>{structure.properties.latitude.toFixed(5)}, {structure.properties.longitude.toFixed(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="splice-side-note">Showing {Math.min(view.structures.length, 420).toLocaleString()} of {view.structures.length.toLocaleString()} synthetic structures associated with this cable route.</p>
          </Panel>

          <Panel title="Fiber Strand Inventory" icon={<Cable size={17} />}>
            {view.fiberStrands.length ? (
              <div className="splice-table-wrap tall">
                <table className="splice-manager-table">
                  <thead>
                    <tr>
                      <th>Strand</th>
                      <th>Tube</th>
                      <th>Color</th>
                      <th>Status</th>
                      <th>Assignment</th>
                      <th>Circuit</th>
                      <th>Trace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.fiberStrands.map((strand) => (
                      <tr key={strand.id}>
                        <td>{strand.strandNumber}<br /><small>{strand.id}</small></td>
                        <td>{strand.tubeNumber || "-"}</td>
                        <td>{strand.colorCode || "-"}</td>
                        <td><StatusPill value={strand.status} /></td>
                        <td>{strand.assignmentId || "-"}</td>
                        <td>{strand.circuitId || "-"}</td>
                        <td><Link className="table-view-link route" href={`/fiber-trace?strand=${encodeURIComponent(strand.id)}`}>View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="splice-side-note">No strand rows are generated for this cable. Capacity is inferred from cable sections.</div>}
          </Panel>

          <Panel title="Splicing and Closures" icon={<GitCompareArrows size={17} />}>
            <div className="opgw-closure-table-stack">
              {spliceClosureGroups.length ? spliceClosureGroups.map((group) => (
                <article className="opgw-closure-splice-table" key={group.closureId}>
                  <div className="opgw-closure-splice-header">
                    <div>
                      <strong>{group.closure?.properties.name || group.closureId}</strong>
                      <span>{group.closureId} / {group.structureNumber}</span>
                    </div>
                    <dl>
                      <div><dt>Type</dt><dd>{group.closureType}</dd></div>
                      <div><dt>Rows</dt><dd>{group.rows.length.toLocaleString()}</dd></div>
                      <div><dt>Status</dt><dd><StatusPill value={group.status} /></dd></div>
                      <div><dt>Point</dt><dd>{group.point?.properties.splicePointId || "unmapped"}</dd></div>
                    </dl>
                    <div className="opgw-inline-actions">
                      <Link href={`/opgw/splices/${encodeURIComponent(group.openId)}`}>Open Splice Manager</Link>
                      <Link href={`/opgw/splices/${encodeURIComponent(group.openId)}/diagram`}>Interactive Diagram</Link>
                    </div>
                  </div>
                  {group.rows.length ? (
                    <div className="splice-table-wrap closure-table">
                      <table className="splice-manager-table matrix">
                        <thead>
                          <tr>
                            <th>Row</th>
                            <th>Incoming</th>
                            <th>Outgoing</th>
                            <th>Splice Type</th>
                            <th>Loss</th>
                            <th>Status</th>
                            <th>Assignment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.slice(0, 160).map((splice) => (
                            <tr key={splice.id}>
                              <td>{splice.id}</td>
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
                      {group.rows.length > 160 ? <p className="splice-side-note">Showing 160 of {group.rows.length.toLocaleString()} splice rows for this closure.</p> : null}
                    </div>
                  ) : (
                    <p className="splice-side-note">No splice matrix rows are currently linked to this closure.</p>
                  )}
                </article>
              )) : <div className="splice-side-note">No splice closures are linked to this cable.</div>}
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
                      <div><dt>Circuit</dt><dd>{service.circuitId || service.serviceId}</dd></div>
                      <div><dt>Status</dt><dd><StatusPill value={service.operationalStatus} /></dd></div>
                      <div><dt>Criticality</dt><dd><StatusPill value={service.criticality} /></dd></div>
                      <div><dt>A/Z Panels</dt><dd>{service.endpointAPatchPanelId || "-"} / {service.endpointZPatchPanelId || "-"}</dd></div>
                      <div><dt>Bandwidth</dt><dd>{service.bandwidthProfile || "-"}</dd></div>
                      <div><dt>Loss</dt><dd>{path ? `${path.totalEstimatedLossDb.toFixed(2)} dB` : "-"}</dd></div>
                      <div><dt>Spans</dt><dd>{path?.totalSpanSegments ?? "-"}</dd></div>
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
              <Link href={`/fiber-trace?cable=${encodeURIComponent(cable.id)}`}>Open Fiber Trace</Link>
              <Link href={`/outage-impact?cable=${encodeURIComponent(cable.id)}`}>Analyze Outage Impact</Link>
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return <span className={`splice-status-pill ${value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
}

function buildSpanAttributeRows(view: OpgwCableContinuityView): SpanAttributeRow[] {
  return view.spanSegments.map((span) => {
    const properties = span.properties;
    return {
      spanSegmentId: formatAttributeValue(properties.spanSegmentId),
      cableSectionId: formatAttributeValue(properties.cableSectionId),
      opgwRouteId: formatAttributeValue(properties.opgwRouteId),
      transmissionLineId: formatAttributeValue(properties.transmissionLineId),
      fromStructureId: formatAttributeValue(properties.fromStructureId),
      toStructureId: formatAttributeValue(properties.toStructureId),
      fromStructureNumber: formatAttributeValue(properties.fromStructureNumber),
      toStructureNumber: formatAttributeValue(properties.toStructureNumber),
      spanLengthFt: formatAttributeValue(properties.spanLengthFt),
      fiberCount: formatAttributeValue(properties.fiberCount),
      cableStatus: formatAttributeValue(properties.cableStatus),
      spanStatus: formatAttributeValue(properties.spanStatus),
      hasMidspanIssue: formatAttributeValue(properties.hasMidspanIssue),
      sagClearanceNote: formatAttributeValue(properties.sagClearanceNote),
      inspectionStatus: formatAttributeValue(properties.inspectionStatus),
      outageRiskScore: formatAttributeValue(properties.outageRiskScore),
      openWorkOrderCount: formatAttributeValue(properties.openWorkOrderCount),
      synthetic: formatAttributeValue(properties.synthetic),
      notes: formatAttributeValue(properties.notes),
      geometryType: span.geometry.type,
      geometryCoordinates: span.geometry.coordinates.map((coordinate) => coordinate.map((value) => Number(value).toFixed(6)).join(", ")).join(" -> "),
    };
  });
}

function formatAttributeValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function buildClosureSpliceGroups(view: OpgwCableContinuityView) {
  const rowsByClosureId = new Map<string, OpgwCableContinuityView["fiberSplices"]>();
  view.fiberSplices.forEach((splice) => {
    const closureId = splice.spliceClosureId || "UNMAPPED-CLOSURE";
    const rows = rowsByClosureId.get(closureId) || [];
    rows.push(splice);
    rowsByClosureId.set(closureId, rows);
  });

  const groups: ClosureSpliceGroup[] = view.spliceClosures.map((closure) => {
    const point = view.splicePoints.find((item) => item.properties.closureId === closure.properties.id);
    const rows = rowsByClosureId.get(closure.properties.id) || [];
    rowsByClosureId.delete(closure.properties.id);
    return {
      closure,
      point,
      rows,
      closureId: closure.properties.id,
      openId: point?.properties.splicePointId || closure.properties.id,
      structureNumber: closure.properties.structureNumber,
      closureType: closure.properties.closureType.replaceAll("_", " "),
      status: closure.properties.status,
    };
  });

  rowsByClosureId.forEach((rows, closureId) => {
    groups.push({
      closure: undefined,
      point: view.splicePoints.find((item) => item.properties.closureId === closureId),
      rows,
      closureId,
      openId: closureId,
      structureNumber: "unmapped structure",
      closureType: "unmapped closure reference",
      status: rows.some((row) => row.status === "proposed") ? "proposed" : "existing",
    });
  });

  return groups;
}
