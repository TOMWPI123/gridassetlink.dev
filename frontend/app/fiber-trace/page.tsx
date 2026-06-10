import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badges";
import { FiberTracePage as LegacyCircuitFiberTracePage } from "@/components/CircuitWorkflowPages";
import { buildDistributionPoleContinuityView, loadDistributionPoleNetworkData, type DistributionPoleContinuityView } from "@/lib/distribution/staticDistributionData";
import {
  buildSpliceManagerView,
  resolveContinuityTraceServices,
  resolveSelectedSplicePointIdForTrace,
  traceSyntheticService,
  type ContinuityTraceInput,
  type ContinuityTraceLayerType,
} from "@/lib/opgw/continuityEngine";
import { buildOpgwCableContinuityView } from "@/lib/opgw/cableContinuity";
import { loadSyntheticFiberContinuityData } from "@/lib/opgw/staticSyntheticData";
import type { FiberContinuityPath, SyntheticService } from "@/lib/types/assets";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const splicePointId = firstQueryValue(params?.splicePoint);
  const spliceClosureId = firstQueryValue(params?.spliceClosure);
  const serviceId = firstQueryValue(params?.service) || firstQueryValue(params?.serviceId);
  const assignmentId = firstQueryValue(params?.assignment) || firstQueryValue(params?.assignmentId);
  const strandId = firstQueryValue(params?.strand) || firstQueryValue(params?.strandId);
  const cableSectionId = firstQueryValue(params?.cableSection) || firstQueryValue(params?.cableSectionId);
  const spliceConnectionId = firstQueryValue(params?.spliceConnection) || firstQueryValue(params?.spliceConnectionId);
  const cableId = firstQueryValue(params?.cable) || firstQueryValue(params?.cableId);
  const distributionPoleId = firstQueryValue(params?.distributionPole) || firstQueryValue(params?.distributionPoleId);
  const distributionRouteId = firstQueryValue(params?.distributionRoute) || firstQueryValue(params?.distributionRouteId);
  const layerType = normalizeLayerType(firstQueryValue(params?.layer) || firstQueryValue(params?.layerType));
  const spliceTargetId = splicePointId || spliceClosureId;
  const genericTraceInput: ContinuityTraceInput = { assignmentId, strandId, cableSectionId, spliceConnectionId, layerType };

  if (!spliceTargetId && !serviceId && !assignmentId && !strandId && !cableSectionId && !spliceConnectionId && !cableId && !distributionPoleId && !distributionRouteId) return <LegacyCircuitFiberTracePage />;

  if (distributionPoleId || distributionRouteId) {
    const distributionData = await loadDistributionPoleNetworkData();
    const view = buildDistributionPoleContinuityView(
      distributionPoleId ? "distribution_pole" : "distribution_route",
      distributionPoleId || distributionRouteId || "",
      distributionData,
    );
    if (!view) notFound();
    return <DistributionPoleFiberTraceView view={view} />;
  }

  const data = await loadSyntheticFiberContinuityData();

  if (spliceTargetId) {
    const view = buildSpliceManagerView(spliceTargetId, data);
    if (!view) notFound();
    return (
      <OpgwFiberTraceView
        title={`Fiber Continuity at ${view.header.splicePointId}`}
        subtitle={`${view.header.structureNumber} / ${view.header.transmissionLineId} / ${view.header.opgwRouteId}`}
        services={view.services}
        paths={view.continuityPaths}
        warnings={view.warnings}
        contextRows={[
          ["Splice point", view.header.splicePointId],
          ["Closure", view.header.spliceClosureId || "-"],
          ["Voltage", view.header.voltageClass],
          ["Fiber capacity", `${view.header.fiberCapacity}F`],
          ["Connected sections", String(view.connectedCableSections.length)],
          ["Coordinates", `${view.header.latitude.toFixed(5)}, ${view.header.longitude.toFixed(5)}`],
        ]}
        mapHref={`/dashboard?drawer=layers&splicePoint=${encodeURIComponent(view.header.splicePointId)}`}
        managerHref={`/opgw/splices/${encodeURIComponent(view.header.splicePointId)}`}
      />
    );
  }

  if (serviceId) {
    const service = data.syntheticServices.find((item) => item.serviceId === decodeURIComponent(serviceId));
    if (!service) notFound();
    const path = traceSyntheticService(service, data);
    return (
      <OpgwFiberTraceView
        title={`Fiber Continuity for ${service.serviceId}`}
        subtitle={`${service.fromSiteName} to ${service.toSiteName}`}
        services={[service]}
        paths={[path]}
        warnings={path.warningSummary}
        contextRows={[
          ["Service type", service.serviceType],
          ["Criticality", service.criticality],
          ["Protection", service.protectionLevel],
          ["Latency", service.latencyClass],
          ["Operational status", service.operationalStatus],
          ["Layer", service.layerType],
        ]}
        mapHref={`/dashboard?drawer=layers&service=${encodeURIComponent(service.serviceId)}`}
      />
    );
  }

  if (assignmentId || strandId || cableSectionId || spliceConnectionId) {
    const services = resolveContinuityTraceServices(genericTraceInput, data);
    if (!services.length) notFound();
    const selectedSplicePointId = resolveSelectedSplicePointIdForTrace(genericTraceInput, data);
    const paths = services.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
    const targetLabel = assignmentId
      ? `assignment ${assignmentId}`
      : strandId
        ? `strand ${strandId}`
        : cableSectionId
          ? `cable section ${cableSectionId}`
          : `splice connection ${spliceConnectionId}`;
    const traceInputLabel = assignmentId ? "Assignment" : strandId ? "Strand" : cableSectionId ? "Cable section" : "Splice connection";
    const targetValue = assignmentId || strandId || cableSectionId || spliceConnectionId || "-";
    return (
      <OpgwFiberTraceView
        title={`Fiber Continuity for ${targetLabel}`}
        subtitle={`${services.length} synthetic carried service${services.length === 1 ? "" : "s"} matched this trace input`}
        services={services}
        paths={paths}
        warnings={unique(paths.flatMap((path) => path.warningSummary))}
        contextRows={[
          ["Trace input", traceInputLabel],
          ["Target", targetValue],
          ["Layer", layerType || "compare"],
          ["Matched services", String(services.length)],
          ["Path count", String(paths.length)],
          ["Synthetic source", "demo continuity resolver"],
        ]}
        mapHref={spliceConnectionId
          ? `/dashboard?drawer=layers&spliceConnection=${encodeURIComponent(spliceConnectionId)}`
          : selectedSplicePointId
          ? `/dashboard?drawer=layers&splicePoint=${encodeURIComponent(selectedSplicePointId)}`
          : cableSectionId
          ? `/dashboard?drawer=layers&cableSection=${encodeURIComponent(cableSectionId)}`
          : `/dashboard?drawer=layers&service=${encodeURIComponent(services[0].serviceId)}`}
        managerHref={selectedSplicePointId ? `/opgw/splices/${encodeURIComponent(selectedSplicePointId)}` : undefined}
      />
    );
  }

  if (cableId) {
    const view = buildOpgwCableContinuityView(cableId, data);
    if (!view) notFound();
    return (
      <OpgwFiberTraceView
        title={`Fiber Continuity for ${view.cable.properties.id}`}
        subtitle={`${view.cable.properties.cableName} / ${view.routeId}`}
        services={view.services}
        paths={view.continuityPaths}
        warnings={view.warnings}
        contextRows={[
          ["Route miles", view.totals.routeMiles.toFixed(2)],
          ["Cable sections", String(view.totals.cableSections)],
          ["Transmission spans", String(view.totals.spans)],
          ["Splice points", String(view.totals.splicePoints)],
          ["Patch panels", String(view.totals.patchPanels)],
          ["Estimated loss", `${view.totals.estimatedLossDb.toFixed(2)} dB`],
        ]}
        mapHref={`/dashboard?drawer=layers&cable=${encodeURIComponent(view.cable.properties.id)}`}
        managerHref={view.splicePoints[0] ? `/opgw/splices/${encodeURIComponent(view.splicePoints[0].properties.splicePointId)}` : undefined}
      />
    );
  }

  return <LegacyCircuitFiberTracePage />;
}

function DistributionPoleFiberTraceView({ view }: { view: DistributionPoleContinuityView }) {
  const mapHref = view.targetType === "distribution_pole"
    ? `/dashboard?drawer=layers&distributionPole=${encodeURIComponent(view.targetId)}`
    : `/dashboard?drawer=layers&distributionRoute=${encodeURIComponent(view.route.properties.routeId)}`;
  return (
    <main className="splice-manager-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/dashboard?drawer=layers">Back to map dashboard</Link>
          <h1>Distribution Pole Fiber Continuity</h1>
          <p>{view.targetLabel} / {view.route.properties.routeName}</p>
        </div>
        <div className="splice-manager-warning">
          <span aria-hidden="true">!</span>
          <span>{view.warning}</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Distribution pole continuity summary">
        <SummaryCard label="Utility owner" value={view.route.properties.utilityOwner} />
        <SummaryCard label="State" value={view.route.properties.state} />
        <SummaryCard label="Fiber route" value={view.route.properties.routeId} />
        <SummaryCard label="Fiber count" value={`${view.route.properties.fiberCount}F`} />
        <SummaryCard label="Display poles" value={view.route.properties.poleCount.toLocaleString()} />
        <SummaryCard label="Scale model" value={view.estimatedPoleScaleCount.toLocaleString()} />
        <SummaryCard label="Route miles" value={view.estimatedRouteMiles.toFixed(2)} />
        <SummaryCard label="Estimated loss" value={`${view.estimatedLossDb.toFixed(2)} dB`} />
        <SummaryCard label="Continuity" value={view.route.properties.continuityStatus.replaceAll("_", " ")} />
        <SummaryCard label="Status" value={view.route.properties.status.replaceAll("_", " ")} />
      </section>

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Street-Path Continuity</strong></div>
            <div className="continuity-list">
              <article className="continuity-card complete">
                <div>
                  <strong>{view.route.properties.feederId}</strong>
                  <span>{view.parentPatchPanel?.name || view.continuityRecord?.endpointAId || "Synthetic upstream node"} to {view.continuityRecord?.endpointZId || view.route.properties.lastPoleId}</span>
                </div>
                <dl>
                  <div><dt>Route</dt><dd>{view.route.properties.routeId}</dd></div>
                  <div><dt>Street path</dt><dd>{view.route.properties.streetPathId}</dd></div>
                  <div><dt>Fiber</dt><dd>{view.route.properties.fiberCount}F</dd></div>
                  <div><dt>Poles</dt><dd>{view.routePoles.length.toLocaleString()}</dd></div>
                  <div><dt>Scale</dt><dd>{view.estimatedPoleScaleCount.toLocaleString()}</dd></div>
                  <div><dt>Loss</dt><dd>{view.estimatedLossDb.toFixed(2)} dB</dd></div>
                </dl>
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

          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Services Carried</strong></div>
            <div className="service-carried-list">
              {view.serviceTypes.map((service) => (
                <article key={service}>
                  <strong>{service}</strong>
                  <span>Synthetic distribution telecom service family</span>
                  <small>{view.route.properties.continuityStatus.replaceAll("_", " ")}</small>
                  <div>
                    <Badge value={service.includes("Protection") || service === "SCADA" ? "critical" : "normal"} />
                    <Badge value="synthetic" />
                    <Badge value={view.route.properties.status} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="splice-manager-side">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Map and Workflow</strong></div>
            <div className="splice-action-stack">
              <Link href={mapHref}>Open highlighted map context</Link>
              <Link href={`/outage-impact?distributionRoute=${encodeURIComponent(view.route.properties.routeId)}`}>Analyze telecom impact</Link>
              {view.parentPatchPanel ? <Link href={`/patch-panels?panel=${encodeURIComponent(view.parentPatchPanel.id)}`}>View parent patch panel</Link> : null}
            </div>
          </section>
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Planning Boundary</strong></div>
            <div className="splice-warning-list">
              <span>Poles, routes, services, and continuity are synthetic demo/planning records.</span>
              <span>Display samples are clustered for smooth browsing and represent a larger full-territory pole model.</span>
              <span>Do not use this for operations, dispatch, protection, SCADA, restoration, or CEII-restricted analysis.</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function OpgwFiberTraceView({
  title,
  subtitle,
  services,
  paths,
  warnings,
  contextRows,
  mapHref,
  managerHref,
}: {
  title: string;
  subtitle: string;
  services: SyntheticService[];
  paths: FiberContinuityPath[];
  warnings: string[];
  contextRows: Array<[string, string]>;
  mapHref: string;
  managerHref?: string;
}) {
  const firstPath = paths[0];
  return (
    <main className="splice-manager-page">
      <header className="splice-manager-hero">
        <div>
          <Link className="splice-manager-back" href="/dashboard?drawer=layers">Back to map dashboard</Link>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="splice-manager-warning">
          <span aria-hidden="true">!</span>
          <span>Synthetic demo continuity only. Do not use for operations, protection, SCADA, relay, restoration, CEII, or private utility telecom routing.</span>
        </div>
      </header>

      <section className="splice-manager-summary-grid" aria-label="Fiber continuity summary">
        {contextRows.map(([label, value]) => <SummaryCard label={label} value={value} key={label} />)}
        <SummaryCard label="Path status" value={firstPath?.pathStatus || "no path"} />
        <SummaryCard label="Transmission lines" value={String(firstPath?.totalTransmissionLines || 0)} />
        <SummaryCard label="Cable sections" value={String(firstPath?.totalCableSections || 0)} />
        <SummaryCard label="Span segments" value={String(firstPath?.totalSpanSegments || 0)} />
        <SummaryCard label="Splice points" value={String(firstPath?.totalSplicePoints || 0)} />
        <SummaryCard label="Patch panels" value={String(firstPath?.totalPatchPanels || 0)} />
        <SummaryCard label="Optical loss" value={firstPath ? `${firstPath.totalEstimatedLossDb.toFixed(2)} dB` : "-"} />
      </section>

      <section className="splice-manager-grid">
        <div className="splice-manager-main">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Ordered Continuity Paths</strong></div>
            <div className="continuity-list">
              {paths.length ? paths.map((path) => <ContinuityPathCard path={path} key={path.continuityPathId} />) : <p className="subtle">No synthetic continuity paths are associated with this selection.</p>}
            </div>
          </section>

          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Services Carried</strong></div>
            <div className="service-carried-list">
              {services.map((service) => (
                <article key={service.serviceId}>
                  <strong>{service.serviceId}</strong>
                  <span>{service.serviceName}</span>
                  <small>{service.serviceType}</small>
                  <div>
                    <Badge value={service.criticality} />
                    <Badge value={service.protectionLevel} />
                    <Badge value={service.layerType} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="splice-manager-side">
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Map and Workflow</strong></div>
            <div className="splice-action-stack">
              <Link href={mapHref}>Open highlighted map context</Link>
              {managerHref ? <Link href={managerHref}>Open Splice Manager</Link> : null}
              {services[0] ? <Link href={`/api/opgw/services/${encodeURIComponent(services[0].serviceId)}/continuity`}>Open continuity API</Link> : null}
            </div>
          </section>
          <section className="splice-manager-panel">
            <div className="splice-manager-panel-title"><strong>Warning Summary</strong></div>
            <div className="splice-warning-list">
              {warnings.length ? warnings.map((warning) => <span key={warning}>{warning}</span>) : <span>No warnings generated for this synthetic trace.</span>}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ContinuityPathCard({ path }: { path: FiberContinuityPath }) {
  return (
    <article className={`continuity-card ${path.pathStatus}`}>
      <div>
        <strong>{path.serviceId}</strong>
        <span>{path.endpointASiteId} to {path.endpointZSiteId}</span>
      </div>
      <dl>
        <div><dt>Status</dt><dd><Badge value={path.pathStatus} /></dd></div>
        <div><dt>Lines</dt><dd>{path.totalTransmissionLines}</dd></div>
        <div><dt>Sections</dt><dd>{path.totalCableSections}</dd></div>
        <div><dt>Spans</dt><dd>{path.totalSpanSegments}</dd></div>
        <div><dt>Splices</dt><dd>{path.totalSplicePoints}</dd></div>
        <div><dt>Loss</dt><dd>{path.totalEstimatedLossDb.toFixed(2)} dB</dd></div>
      </dl>
      <ol>
        {path.segments.map((segment) => (
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

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeLayerType(value: string | undefined): ContinuityTraceLayerType | undefined {
  if (value === "existing" || value === "proposed" || value === "compare") return value;
  return undefined;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
