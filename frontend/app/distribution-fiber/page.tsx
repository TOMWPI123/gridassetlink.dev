import Link from "next/link";
import { Badge } from "@/components/Badges";
import { loadDistributionPoleNetworkData, type DistributionPoleNetworkData } from "@/lib/distribution/staticDistributionData";
import type { DistributionFiberAssignmentFeature, DistributionPoleFeature, DistributionPoleFiberRouteFeature, DistributionPoleSplicePointFeature, DistributionSlackLoopFeature } from "@/lib/types/assets";

export default async function Page() {
  const data = await loadDistributionPoleNetworkData();
  const stats = buildDistributionPlannerStats(data);
  const moduleLayer = buildCombinedLayerRow(data, stats);
  const ownerRows = buildOwnerRows(data);
  const stateRows = buildStateRows(data);
  const routeRows = data.fiberRoutes
    .slice()
    .sort((a, b) => b.properties.estimatedPoleScaleCount - a.properties.estimatedPoleScaleCount);
  const poleRows = data.poles.slice(0, 180);
  const spliceRows = data.splicePoints.slice(0, 80);
  const slackRows = data.slackLoops.slice(0, 80);
  const assignmentRows = data.fiberAssignments.slice(0, 120);

  return (
    <main>
      <div className="page-header distribution-planner-header">
        <div>
          <h1 className="eyebrowless-title">Distribution Network</h1>
          <div className="subtle">Synthetic street-path distribution poles, density layers, fiber routes, splices, slack loops, assignments, continuity, and patch panel handoffs.</div>
        </div>
        <div className="toolbar">
          <Link className="button primary" href="/dashboard?drawer=layers">Open map layers</Link>
          <Link className="button" href="/fiber-trace">Open fiber trace</Link>
        </div>
      </div>

      <section className="panel distribution-planner-safety">
        <div className="panel-body">
          <strong>Synthetic distribution planning layer</strong>
          <span>{data.meta.disclaimer || "Distribution poles, street paths, telecom fiber routes, and continuity records are synthetic demo/planning records. They do not represent real utility poles or private telecom routes."}</span>
          <small>{data.meta.optimizationNote || "Large pole models should be browsed through density, clustered, or vector-tile layers rather than full point payloads."}</small>
        </div>
      </section>

      <section className="metric-grid distribution-planner-metrics" aria-label="Distribution fiber planner metrics">
        <Metric label="Estimated pole model" value={formatCount(stats.estimatedPoleScale)} detail="Represented by density/display layers" />
        <Metric label="Display pole records" value={formatCount(data.poles.length)} detail="Bounded synthetic pole sample" />
        <Metric label="Pole density cells" value={formatCount(data.poleDensity.length)} detail="Full-territory browsing layer" />
        <Metric label="Fiber routes" value={formatCount(data.fiberRoutes.length)} detail={`${formatMiles(stats.routeMiles)} street-path fiber`} />
        <Metric label="Splice points" value={formatCount(data.splicePoints.length)} detail="Synthetic route splice nodes" />
        <Metric label="Slack loops" value={formatCount(data.slackLoops.length)} detail={`${formatCount(stats.totalSlackFeet)} ft storage`} />
        <Metric label="Assignments" value={formatCount(data.fiberAssignments.length)} detail="Synthetic services carried" />
        <Metric label="Patch panels" value={formatCount(stats.distributionPatchPanels)} detail="Route parent handoffs" />
      </section>

      <section className="panel distribution-planner-section">
        <div className="panel-header">
          <div>
            <strong>Distribution Network Module</strong>
            <div className="subtle">One dashboard layer feeds this module: density, poles, routes, splices, slack, assignments, continuity, and patch panel handoffs.</div>
          </div>
          <span className="badge planned">1 layer</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Layer</th>
                <th>Records</th>
                <th>Includes</th>
                <th>Map key</th>
                <th>Status</th>
                <th>Safety boundary</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>{moduleLayer.layer}</strong><br /><small>{moduleLayer.source}</small></td>
                <td>{moduleLayer.records}</td>
                <td>{moduleLayer.includes}</td>
                <td><code>{moduleLayer.mapKey}</code></td>
                <td><Badge value={moduleLayer.status} /></td>
                <td>{moduleLayer.boundary}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="distribution-planner-grid">
        <SummaryTable title="By Utility Owner" rows={ownerRows} />
        <SummaryTable title="By State" rows={stateRows} />
      </section>

      <section className="panel distribution-planner-section">
        <div className="panel-header">
          <div>
            <strong>Fiber Route Planner</strong>
            <div className="subtle">All synthetic distribution fiber route records, with linked pole, splice, slack, assignment, continuity, map, and trace actions.</div>
          </div>
          <span className="badge active">{formatCount(routeRows.length)} routes</span>
        </div>
        <div className="table-wrap distribution-planner-table-tall">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>Owner / State</th>
                <th>Fiber</th>
                <th>Poles</th>
                <th>Splices / Slack</th>
                <th>Assignments</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {routeRows.map((route) => <RouteRow route={route} key={route.properties.routeId} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="distribution-planner-grid">
        <section className="panel distribution-planner-section">
          <div className="panel-header">
            <div>
              <strong>Distribution Pole Sample Layer</strong>
              <div className="subtle">Showing a bounded sample for page performance; all {formatCount(data.poles.length)} display poles are counted and browsable on the map.</div>
            </div>
            <span className="badge planned">{formatCount(data.poles.length)} poles</span>
          </div>
          <PoleList rows={poleRows} />
        </section>

        <section className="panel distribution-planner-section">
          <div className="panel-header">
            <div>
              <strong>Fiber Assignments</strong>
              <div className="subtle">Synthetic services riding distribution pole fiber routes.</div>
            </div>
            <span className="badge active">{formatCount(data.fiberAssignments.length)} assignments</span>
          </div>
          <AssignmentList rows={assignmentRows} />
        </section>
      </section>

      <section className="distribution-planner-grid">
        <section className="panel distribution-planner-section">
          <div className="panel-header">
            <div>
              <strong>Splice Points</strong>
              <div className="subtle">Synthetic splice nodes tied to distribution poles and route assignments.</div>
            </div>
            <span className="badge high">{formatCount(data.splicePoints.length)} splices</span>
          </div>
          <SpliceList rows={spliceRows} />
        </section>

        <section className="panel distribution-planner-section">
          <div className="panel-header">
            <div>
              <strong>Slack Loops</strong>
              <div className="subtle">Slack storage records on the same distribution pole routes.</div>
            </div>
            <span className="badge planned">{formatCount(data.slackLoops.length)} loops</span>
          </div>
          <SlackList rows={slackRows} />
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span className="subtle">{label}</span>
      <div className="metric-value">{value}</div>
      <div className="subtle">{detail}</div>
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: PlannerSummaryRow[] }) {
  return (
    <section className="panel distribution-planner-section">
      <div className="panel-header">
        <strong>{title}</strong>
        <span className="badge normal">{formatCount(rows.length)} groups</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Routes</th>
              <th>Represented poles</th>
              <th>Miles</th>
              <th>Assignments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{formatCount(row.routes)}</td>
                <td>{formatCount(row.representedPoles)}</td>
                <td>{formatMiles(row.miles)}</td>
                <td>{formatCount(row.assignments)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RouteRow({ route }: { route: DistributionPoleFiberRouteFeature }) {
  const properties = route.properties;
  return (
    <tr>
      <td>
        <strong>{properties.routeName}</strong><br />
        <small>{properties.routeId} / {properties.feederId}</small>
      </td>
      <td>{properties.utilityOwner}<br /><small>{properties.state}</small></td>
      <td>{properties.fiberCount}F<br /><small>{formatMiles(properties.routeMiles)}</small></td>
      <td>{formatCount(properties.poleCount)} display<br /><small>{formatCount(properties.estimatedPoleScaleCount)} represented</small></td>
      <td>{formatCount(properties.splicePointIds?.length || 0)} splices<br /><small>{formatCount(properties.totalSlackFeet || 0)} ft slack</small></td>
      <td>{formatCount(properties.assignmentIds?.length || 0)}<br /><small>{properties.serviceTypesCarried.join(", ")}</small></td>
      <td><Badge value={properties.status} /></td>
      <td>
        <div className="distribution-planner-actions">
          <Link href={`/dashboard?drawer=layers&distributionRoute=${encodeURIComponent(properties.routeId)}`}>Map</Link>
          <Link href={`/fiber-trace?distributionRoute=${encodeURIComponent(properties.routeId)}`}>Trace</Link>
          <Link href={`/outage-impact?distributionRoute=${encodeURIComponent(properties.routeId)}`}>Impact</Link>
        </div>
      </td>
    </tr>
  );
}

function PoleList({ rows }: { rows: DistributionPoleFeature[] }) {
  return (
    <div className="distribution-planner-list">
      {rows.map((pole) => (
        <article key={pole.properties.id}>
          <strong>{pole.properties.poleNumber}</strong>
          <span>{pole.properties.utilityOwner} / {pole.properties.state} / {pole.properties.telecomRole.replaceAll("_", " ")}</span>
          <small>{pole.properties.connectedDistributionFiberRouteIds.join(", ")} / {pole.properties.fiberCount}F / sequence {pole.properties.sequenceIndex}</small>
          <div className="distribution-planner-actions">
            <Link href={`/dashboard?drawer=layers&distributionPole=${encodeURIComponent(pole.properties.id)}`}>Map</Link>
            <Link href={`/fiber-trace?distributionPole=${encodeURIComponent(pole.properties.id)}`}>Trace</Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function AssignmentList({ rows }: { rows: DistributionFiberAssignmentFeature[] }) {
  return (
    <div className="distribution-planner-list">
      {rows.map((assignment) => (
        <article key={assignment.properties.id}>
          <strong>{assignment.properties.assignmentName}</strong>
          <span>{assignment.properties.serviceType} / {assignment.properties.routeId}</span>
          <small>{assignment.properties.strandNumbers.join(", ")} strands / {formatMiles(assignment.properties.routeMiles)} / {assignment.properties.estimatedLossDb.toFixed(2)} dB</small>
          <div>
            <Badge value={assignment.properties.criticality} />
            <Badge value={assignment.properties.status} />
          </div>
        </article>
      ))}
    </div>
  );
}

function SpliceList({ rows }: { rows: DistributionPoleSplicePointFeature[] }) {
  return (
    <div className="distribution-planner-list compact">
      {rows.map((splice) => (
        <article key={splice.properties.id}>
          <strong>{splice.properties.spliceName}</strong>
          <span>{splice.properties.poleNumber} / {splice.properties.spliceType.replaceAll("_", " ")}</span>
          <small>{splice.properties.routeId} / {splice.properties.spliceCount} splices / {splice.properties.slackLoopFeet} ft slack</small>
        </article>
      ))}
    </div>
  );
}

function SlackList({ rows }: { rows: DistributionSlackLoopFeature[] }) {
  return (
    <div className="distribution-planner-list compact">
      {rows.map((slack) => (
        <article key={slack.properties.id}>
          <strong>{slack.properties.slackName}</strong>
          <span>{slack.properties.poleNumber} / {slack.properties.slackType.replaceAll("_", " ")}</span>
          <small>{slack.properties.routeId} / {slack.properties.slackFeet} ft</small>
        </article>
      ))}
    </div>
  );
}

type PlannerSummaryRow = {
  label: string;
  routes: number;
  representedPoles: number;
  miles: number;
  assignments: number;
};

function buildDistributionPlannerStats(data: DistributionPoleNetworkData) {
  return {
    estimatedPoleScale: data.meta.estimatedRegionalPoleScale || sum(data.fiberRoutes.map((route) => route.properties.estimatedPoleScaleCount)),
    routeMiles: sum(data.fiberRoutes.map((route) => route.properties.routeMiles)),
    totalSlackFeet: sum(data.slackLoops.map((loop) => loop.properties.slackFeet)),
    distributionPatchPanels: new Set(data.fiberRoutes.map((route) => route.properties.parentPatchPanelId).filter(Boolean)).size,
  };
}

function buildCombinedLayerRow(data: DistributionPoleNetworkData, stats: ReturnType<typeof buildDistributionPlannerStats>) {
  const browsableRecords = data.poleDensity.length
    + data.poles.length
    + data.fiberRoutes.length
    + data.splicePoints.length
    + data.slackLoops.length
    + data.fiberAssignments.length
    + data.continuityRecords.length
    + stats.distributionPatchPanels;
  return {
    layer: "Distribution Network",
    records: `${formatCount(browsableRecords)} browsable records / ${formatCount(stats.estimatedPoleScale)} represented poles`,
    includes: `${formatCount(data.poleDensity.length)} density cells, ${formatCount(data.poles.length)} display poles, ${formatCount(data.fiberRoutes.length)} routes, ${formatCount(data.splicePoints.length)} splice points, ${formatCount(data.slackLoops.length)} slack loops, ${formatCount(data.fiberAssignments.length)} assignments, ${formatCount(data.continuityRecords.length)} continuity records, and ${formatCount(stats.distributionPatchPanels)} patch panel handoffs.`,
    mapKey: "distributionNetwork",
    status: "planned",
    boundary: "Synthetic distribution planning records only; not real pole, splice, fiber, assignment, or service inventory.",
    source: "one synthetic-demo module layer",
  };
}

function buildOwnerRows(data: DistributionPoleNetworkData): PlannerSummaryRow[] {
  return buildGroupedRows(data, (route) => route.properties.utilityOwner);
}

function buildStateRows(data: DistributionPoleNetworkData): PlannerSummaryRow[] {
  return buildGroupedRows(data, (route) => route.properties.state);
}

function buildGroupedRows(data: DistributionPoleNetworkData, keyFn: (route: DistributionPoleFiberRouteFeature) => string): PlannerSummaryRow[] {
  const assignmentCounts = new Map<string, number>();
  for (const assignment of data.fiberAssignments) assignmentCounts.set(assignment.properties.routeId, (assignmentCounts.get(assignment.properties.routeId) || 0) + 1);
  const groups = new Map<string, PlannerSummaryRow>();
  for (const route of data.fiberRoutes) {
    const label = keyFn(route) || "Unknown";
    const current = groups.get(label) || { label, routes: 0, representedPoles: 0, miles: 0, assignments: 0 };
    current.routes += 1;
    current.representedPoles += route.properties.estimatedPoleScaleCount;
    current.miles += route.properties.routeMiles;
    current.assignments += assignmentCounts.get(route.properties.routeId) || 0;
    groups.set(label, current);
  }
  return Array.from(groups.values()).sort((a, b) => b.representedPoles - a.representedPoles);
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatMiles(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
