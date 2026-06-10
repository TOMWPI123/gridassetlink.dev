import Link from "next/link";
import { Badge } from "@/components/Badges";
import { OutageImpactPage } from "@/components/UtilityPages";
import { buildDistributionPoleContinuityView, loadDistributionPoleNetworkData, type DistributionPoleContinuityView } from "@/lib/distribution/staticDistributionData";
import { buildOpgwOutageImpactView, type OpgwOutageImpactTargetType, type OpgwOutageImpactView } from "@/lib/opgw/outageImpact";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const distributionPoleId = firstValue(params?.distributionPole) || firstValue(params?.distributionPoleId);
  const distributionRouteId = firstValue(params?.distributionRoute) || firstValue(params?.distributionRouteId);
  if (distributionPoleId || distributionRouteId) {
    const distributionData = await loadDistributionPoleNetworkData();
    const view = buildDistributionPoleContinuityView(
      distributionPoleId ? "distribution_pole" : "distribution_route",
      distributionPoleId || distributionRouteId || "",
      distributionData,
    );
    if (!view) {
      return (
        <main className="splice-manager-page">
          <header className="splice-manager-hero">
            <div>
              <Link className="splice-manager-back" href="/dashboard?drawer=layers">Back to map dashboard</Link>
              <h1>Distribution Telecom Impact</h1>
              <p>{distributionPoleId ? "distribution pole" : "distribution route"} / {distributionPoleId || distributionRouteId}</p>
            </div>
            <div className="splice-manager-warning">
              <span aria-hidden="true">!</span>
              <span>No synthetic distribution continuity matched this target. This does not prove real-world service absence.</span>
            </div>
          </header>
        </main>
      );
    }
    return <DistributionTelecomImpactReport view={view} />;
  }

  const target = targetFromParams(params);
  if (!target) return <OutageImpactPage />;

  const data = await loadSyntheticFiberContinuityData();
  const view = buildOpgwOutageImpactView(target.targetType, target.targetId, data);
  if (!view) {
    return (
      <main className="splice-manager-page">
        <header className="splice-manager-hero">
          <div>
            <Link className="splice-manager-back" href="/dashboard?drawer=layers">Back to map dashboard</Link>
            <h1>OPGW Outage Impact</h1>
            <p>{target.targetType.replaceAll("_", " ")} / {target.targetId}</p>
          </div>
          <div className="splice-manager-warning">
            <span aria-hidden="true">!</span>
            <span>No synthetic carried services matched this target. This does not prove real-world service absence.</span>
          </div>
        </header>
      </main>
    );
  }

  return <OpgwOutageImpactReport view={view} />;
}

function DistributionTelecomImpactReport({ view }: { view: DistributionPoleContinuityView }) {
  const mapHref = view.targetType === "distribution_pole"
    ? `/dashboard?drawer=layers&distributionPole=${encodeURIComponent(view.targetId)}`
    : `/dashboard?drawer=layers&distributionRoute=${encodeURIComponent(view.route.properties.routeId)}`;
  const impactedServices = view.serviceTypes.map((service) => ({
    service,
    criticality: service === "SCADA" || service === "Protection Pilot" || service === "Distribution Automation" ? "critical" : "normal",
  }));
  return (
    <main className="splice-manager-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/dashboard?drawer=layers">Back to map dashboard</Link>
          <h1>Distribution Telecom Impact</h1>
          <p>{view.targetLabel} / {view.route.properties.routeName}</p>
        </div>
        <div className="splice-manager-warning">
          <span aria-hidden="true">!</span>
          <span>{view.warning}</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Synthetic distribution telecom impact summary">
        <SummaryCard label="Services affected" value={impactedServices.length.toLocaleString()} />
        <SummaryCard label="Critical services" value={view.criticalServiceCount.toLocaleString()} />
        <SummaryCard label="Display poles" value={view.route.properties.poleCount.toLocaleString()} />
        <SummaryCard label="Scale model" value={view.estimatedPoleScaleCount.toLocaleString()} />
        <SummaryCard label="Fiber count" value={`${view.route.properties.fiberCount}F`} />
        <SummaryCard label="Route miles" value={view.estimatedRouteMiles.toFixed(2)} />
        <SummaryCard label="Estimated loss" value={`${view.estimatedLossDb.toFixed(2)} dB`} />
        <SummaryCard label="Continuity" value={view.route.properties.continuityStatus.replaceAll("_", " ")} />
      </section>

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Affected Synthetic Distribution Services</strong></div>
            <div className="splice-table-wrap">
              <table className="splice-manager-table">
                <thead>
                  <tr>
                    <th>Service family</th>
                    <th>Criticality</th>
                    <th>Status</th>
                    <th>Route</th>
                    <th>Fiber</th>
                    <th>Poles</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {impactedServices.map(({ service, criticality }) => (
                    <tr key={service}>
                      <td>{service}<br /><small>Synthetic distribution telecom planning record</small></td>
                      <td><Badge value={criticality} /></td>
                      <td><Badge value={view.route.properties.status} /></td>
                      <td>{view.route.properties.routeId}</td>
                      <td>{view.route.properties.fiberCount}F</td>
                      <td>{view.route.properties.poleCount}</td>
                      <td>
                        <div className="splice-row-actions">
                          <Link href={`/fiber-trace?distributionRoute=${encodeURIComponent(view.route.properties.routeId)}`}>Trace</Link>
                          <Link href={mapHref}>Map</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Impacted Pole Continuity Sample</strong></div>
            <div className="continuity-list">
              <article className="continuity-card complete">
                <div>
                  <strong>{view.route.properties.feederId}</strong>
                  <span>{view.parentPatchPanel?.name || view.continuityRecord?.endpointAId || "Synthetic upstream node"} to {view.continuityRecord?.endpointZId || view.route.properties.lastPoleId}</span>
                </div>
                <ol>
                  {(view.samplePoles.length ? view.samplePoles : view.routePoles.slice(0, 12)).map((pole) => (
                    <li key={pole.properties.id}>
                      <span>{pole.properties.sequenceIndex}</span>
                      <strong>{pole.properties.poleNumber}</strong>
                      <em>{pole.properties.telecomRole.replaceAll("_", " ")}</em>
                    </li>
                  ))}
                </ol>
              </article>
            </div>
          </section>
        </div>

        <aside className="splice-manager-side">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Impacted Records</strong></div>
            <ImpactList title="Distribution poles" values={view.routePoles.slice(0, 24).map((pole) => pole.properties.poleNumber)} />
            <ImpactList title="Sample pole IDs" values={view.route.properties.samplePoleIds} />
            <ImpactList title="Patch panels" values={view.parentPatchPanel ? [view.parentPatchPanel.name] : []} />
          </section>
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Warnings</strong></div>
            <div className="splice-warning-list">
              <span>{view.warning}</span>
              <span>This impact view is demo planning logic only and does not represent actual service restoration or utility telecom topology.</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function OpgwOutageImpactReport({ view }: { view: OpgwOutageImpactView }) {
  return (
    <main className="splice-manager-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/dashboard?drawer=layers">Back to map dashboard</Link>
          <h1>OPGW Outage Impact</h1>
          <p>{view.targetLabel} / {view.targetType.replaceAll("_", " ")} / {view.targetId}</p>
        </div>
        <div className="splice-manager-warning">
          <span aria-hidden="true">!</span>
          <span>{view.warning}</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Synthetic outage impact summary">
        <SummaryCard label="Services affected" value={view.serviceCount.toLocaleString()} />
        <SummaryCard label="High/Critical services" value={view.criticalServiceCount.toLocaleString()} />
        <SummaryCard label="Highest criticality" value={view.highestCriticality} />
        <SummaryCard label="Transmission lines" value={view.impactedTransmissionLines.length.toLocaleString()} />
        <SummaryCard label="Cable sections" value={view.impactedCableSections.length.toLocaleString()} />
        <SummaryCard label="Span segments" value={view.impactedSpanSegments.length.toLocaleString()} />
        <SummaryCard label="Splice points" value={view.impactedSplicePoints.length.toLocaleString()} />
        <SummaryCard label="Patch panels" value={view.impactedPatchPanels.length.toLocaleString()} />
        <SummaryCard label="Route miles" value={view.estimatedRouteMiles.toFixed(2)} />
        <SummaryCard label="Estimated loss" value={`${view.estimatedLossDb.toFixed(2)} dB`} />
      </section>

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Affected Synthetic Services</strong></div>
            <div className="splice-table-wrap">
              <table className="splice-manager-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Type</th>
                    <th>Criticality</th>
                    <th>Status</th>
                    <th>Path</th>
                    <th>Lines</th>
                    <th>Sections</th>
                    <th>Spans</th>
                    <th>Splices</th>
                    <th>Loss</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {view.services.map((service) => (
                    <tr key={service.serviceId}>
                      <td>{service.serviceId}<br /><small>{service.serviceName}</small></td>
                      <td>{service.serviceType}</td>
                      <td><Badge value={service.criticality} /></td>
                      <td><Badge value={service.operationalStatus} /></td>
                      <td><Badge value={service.pathStatus} /></td>
                      <td>{service.transmissionLines}</td>
                      <td>{service.cableSections}</td>
                      <td>{service.spanSegments}</td>
                      <td>{service.splicePoints}</td>
                      <td>{service.estimatedLossDb.toFixed(2)} dB</td>
                      <td>
                        <div className="splice-row-actions">
                          <Link href={`/fiber-trace?service=${encodeURIComponent(service.serviceId)}`}>Trace</Link>
                          <Link href={`/dashboard?drawer=layers&service=${encodeURIComponent(service.serviceId)}`}>Map</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Continuity Paths</strong></div>
            <div className="continuity-list">
              {view.paths.map((path) => (
                <article className={`continuity-card ${path.pathStatus}`} key={path.continuityPathId}>
                  <div>
                    <strong>{path.serviceId}</strong>
                    <span>{path.endpointASiteId} to {path.endpointZSiteId}</span>
                  </div>
                  <dl>
                    <div><dt>Lines</dt><dd>{path.totalTransmissionLines}</dd></div>
                    <div><dt>Sections</dt><dd>{path.totalCableSections}</dd></div>
                    <div><dt>Spans</dt><dd>{path.totalSpanSegments}</dd></div>
                    <div><dt>Splices</dt><dd>{path.totalSplicePoints}</dd></div>
                    <div><dt>Loss</dt><dd>{path.totalEstimatedLossDb.toFixed(2)} dB</dd></div>
                  </dl>
                  <ol>
                    {path.segments.slice(0, 16).map((segment) => (
                      <li key={segment.pathSegmentId}>
                        <span>{segment.sequenceNumber}</span>
                        <strong>{segment.objectType.replaceAll("_", " ")}</strong>
                        <em>{segment.objectId}</em>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="splice-manager-side">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Impacted Records</strong></div>
            <ImpactList title="Transmission lines" values={view.impactedTransmissionLines} />
            <ImpactList title="Cable sections" values={view.impactedCableSections} />
            <ImpactList title="Span segments" values={view.impactedSpanSegments} />
            <ImpactList title="Splice points" values={view.impactedSplicePoints} />
            <ImpactList title="Patch panels" values={view.impactedPatchPanels} />
          </section>
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Warnings</strong></div>
            <div className="splice-warning-list">
              {view.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ImpactList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="splice-warning-list">
      <strong>{title}</strong>
      {values.slice(0, 12).map((value) => <span key={value}>{value}</span>)}
      {values.length > 12 ? <span>+{values.length - 12} more</span> : null}
    </div>
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

function targetFromParams(params?: Record<string, string | string[] | undefined>) {
  const pairs: Array<[OpgwOutageImpactTargetType, string | undefined]> = [
    ["service", firstValue(params?.service) || firstValue(params?.serviceId)],
    ["assignment", firstValue(params?.assignment) || firstValue(params?.assignmentId)],
    ["splice_point", firstValue(params?.splicePoint) || firstValue(params?.splicePointId)],
    ["splice_closure", firstValue(params?.spliceClosure) || firstValue(params?.spliceClosureId)],
    ["splice_connection", firstValue(params?.spliceConnection) || firstValue(params?.spliceConnectionId)],
    ["cable", firstValue(params?.cable) || firstValue(params?.cableId)],
    ["cable_section", firstValue(params?.cableSection) || firstValue(params?.cableSectionId)],
    ["span_segment", firstValue(params?.span) || firstValue(params?.spanSegment) || firstValue(params?.spanSegmentId)],
    ["strand", firstValue(params?.strand) || firstValue(params?.strandId)],
  ];
  const target = pairs.find(([, value]) => Boolean(value));
  return target ? { targetType: target[0], targetId: target[1] as string } : null;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
