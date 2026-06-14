"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import { findStrandContinuityRecord, strandContinuityDashboardHref } from "@/lib/opgw/strandContinuity";
import type { FiberAssignment, FiberSplice, FiberStrand, OpgwCableCollection, PatchPanel, SpliceClosureCollection, StrandContinuityRecord, SyntheticService, TransmissionStructureCollection } from "@/lib/types/assets";
import type { JsonRecord } from "@/types";

type SyntheticFiberData = {
  structures: TransmissionStructureCollection["features"];
  opgw: OpgwCableCollection["features"];
  closures: SpliceClosureCollection["features"];
  strands: FiberStrand[];
  splices: FiberSplice[];
  panels: PatchPanel[];
  assignments: FiberAssignment[];
  strandContinuity: StrandContinuityRecord[];
  error: string;
};

type SyntheticOpgwCableData = {
  opgw: OpgwCableCollection["features"];
  error: string;
  loading: boolean;
};

type SyntheticTelecomHardware = {
  nodes?: Array<{
    nodeId: string;
    nodeName: string;
    deviceRole?: string;
    model?: string;
    serviceIds?: string[];
  }>;
};

type OpgwCableLinkedAssets = {
  spans: number;
  strands: number;
  availableStrands: number;
  assignedStrands: number;
  reservedStrands: number;
  spliceRows: number;
  spliceClosures: number;
  patchPanels: number;
  assignments: number;
  services: number;
  devices: number;
  strandSample: string[];
  spliceSample: string[];
  patchPanelSample: string[];
  assignmentSample: string[];
  serviceSample: string[];
  deviceSample: string[];
  deviceRoleSample: string[];
};

type OpgwCableLinkedAssetData = {
  summaries: Map<string, OpgwCableLinkedAssets>;
  loading: boolean;
  error: string;
};

const emptyData: SyntheticFiberData = {
  structures: [],
  opgw: [],
  closures: [],
  strands: [],
  splices: [],
  panels: [],
  assignments: [],
  strandContinuity: [],
  error: "",
};

const emptyOpgwCableData: SyntheticOpgwCableData = {
  opgw: [],
  error: "",
  loading: true,
};

const emptyLinkedAssetSummary: OpgwCableLinkedAssets = {
  spans: 0,
  strands: 0,
  availableStrands: 0,
  assignedStrands: 0,
  reservedStrands: 0,
  spliceRows: 0,
  spliceClosures: 0,
  patchPanels: 0,
  assignments: 0,
  services: 0,
  devices: 0,
  strandSample: [],
  spliceSample: [],
  patchPanelSample: [],
  assignmentSample: [],
  serviceSample: [],
  deviceSample: [],
  deviceRoleSample: [],
};

function createEmptyLinkedAssetSummary(): OpgwCableLinkedAssets {
  return {
    spans: 0,
    strands: 0,
    availableStrands: 0,
    assignedStrands: 0,
    reservedStrands: 0,
    spliceRows: 0,
    spliceClosures: 0,
    patchPanels: 0,
    assignments: 0,
    services: 0,
    devices: 0,
    strandSample: [],
    spliceSample: [],
    patchPanelSample: [],
    assignmentSample: [],
    serviceSample: [],
    deviceSample: [],
    deviceRoleSample: [],
  };
}

export function TransmissionStructuresPage() {
  const data = useSyntheticFiberData();
  const rows = data.structures.map((feature) => feature.properties as unknown as JsonRecord);
  return <SyntheticPage title="Transmission Structures" subtitle="Synthetic structure points generated from public transmission line geometry." error={data.error}><DataTable rows={rows} columns={["structureNumber", "lineId", "sequenceIndex", "structureType", "voltageKv", "hasOpgw", "hasSplice", "source"]} filterField="structureType" /></SyntheticPage>;
}

export function OpgwCablesPage() {
  const data = useOpgwCableData();
  const linkedAssetData = useOpgwCableLinkedAssetData(data.opgw);
  const rows = useMemo(() => data.opgw.map((feature) => {
    const linked = linkedAssetData.summaries.get(feature.properties.id) || emptyLinkedAssetSummary;
    const linkedAssetFingerprint = [
      feature.properties.id,
      feature.properties.cableName,
      `${linked.spans} spans`,
      `${linked.strands} strands`,
      `${linked.spliceRows} splice rows`,
      `${linked.patchPanels} patch panels`,
      `${linked.assignments} assignments`,
      `${linked.services} services`,
      `${linked.devices} devices`,
      ...linked.deviceSample,
      ...linked.serviceSample,
    ].filter(Boolean).join(" | ");
    return {
      ...feature.properties,
      structureCount: feature.properties.structureIds.length,
      spanCount: linked.spans,
      strandCount: linked.strands,
      assignedStrands: linked.assignedStrands,
      availableStrands: linked.availableStrands,
      reservedStrands: linked.reservedStrands,
      spliceClosureCount: linked.spliceClosures || feature.properties.connectedSpliceClosureIds.length,
      spliceRowCount: linked.spliceRows,
      patchPanelCount: linked.patchPanels,
      assignmentCount: linked.assignments,
      serviceCount: linked.services,
      linkedDeviceCount: linked.devices,
      linkedDevices: linked.deviceSample.join(", ") || "-",
      linkedDeviceRoles: linked.deviceRoleSample.join(", ") || "-",
      linkedAssetFingerprint,
      cable_module_view: `/opgw/cables/${encodeURIComponent(feature.properties.id)}`,
      continuity_view: `/fiber-trace?cable=${encodeURIComponent(feature.properties.id)}`,
      fiber_trace_view: `/fiber-trace?cable=${encodeURIComponent(feature.properties.id)}`,
      map_view: `/dashboard?drawer=layers&cable=${encodeURIComponent(feature.properties.id)}`,
      open_href: `/opgw/cables/${encodeURIComponent(feature.properties.id)}`,
      open_label: "Open full cable module",
    } as unknown as JsonRecord;
  }), [data.opgw, linkedAssetData.summaries]);
  return (
    <SyntheticPage title="OPGW Cables" subtitle="Synthetic OPGW planning cables randomly assigned to public transmission lines." error={data.error}>
      {data.loading ? <div className="panel panel-body">Loading OPGW cable index...</div> : (
        <>
          <OpgwCableModuleSection rows={rows} linkedLoading={linkedAssetData.loading} linkedError={linkedAssetData.error} />
          <DataTable rows={rows} columns={["cableName", "id", "lineId", "status", "fiberCount", "routeMiles", "structureCount", "spanCount", "strandCount", "linkedDeviceCount", "linkedAssetFingerprint", "cable_module_view", "continuity_view", "map_view", "source"]} filterField="status" />
        </>
      )}
    </SyntheticPage>
  );
}

function OpgwCableModuleSection({ rows, linkedLoading, linkedError }: { rows: JsonRecord[]; linkedLoading: boolean; linkedError: string }) {
  const featured = rows
    .slice()
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true }))
    .slice(0, 8);
  const totalMiles = rows.reduce((sum, row) => sum + Number(row.routeMiles || 0), 0);
  const totalFibers = rows.reduce((sum, row) => sum + Number(row.fiberCount || 0), 0);
  const totalStrands = rows.reduce((sum, row) => sum + Number(row.strandCount || 0), 0);
  const totalSpans = rows.reduce((sum, row) => sum + Number(row.spanCount || 0), 0);
  const totalDevices = rows.reduce((sum, row) => sum + Number(row.linkedDeviceCount || 0), 0);
  return (
    <section className="panel opgw-cable-module-section">
      <div className="panel-header">
        <div>
          <strong>OPGW Cable Detail Modules</strong>
          <div className="subtle">Open a cable module to review cable metadata plus linked spans, strands, splice rows, patch panels, assignments, services, and endpoint devices derived from the cable ID/name.</div>
        </div>
      </div>
      {linkedLoading ? <div className="panel-body subtle">Loading linked asset identifiers for strands, splices, services, and devices...</div> : null}
      {linkedError ? <div className="badge red">{linkedError}</div> : null}
      <div className="opgw-cable-module-metrics">
        <Metric label="Cable modules" value={rows.length.toLocaleString()} detail="Full detail views available" />
        <Metric label="Synthetic route miles" value={totalMiles.toFixed(1)} detail="Planning/demo OPGW mileage" />
        <Metric label="Fiber capacity sum" value={totalFibers.toLocaleString()} detail="Aggregate synthetic fiber count" />
        <Metric label="Linked strands" value={totalStrands.toLocaleString()} detail="Existing strand rows keyed by cable ID" />
        <Metric label="Structure spans" value={totalSpans.toLocaleString()} detail="Synthetic span count from cable structures" />
        <Metric label="Linked devices" value={totalDevices.toLocaleString()} detail="Device nodes matched through carried services" />
      </div>
      <div className="opgw-cable-module-grid">
        {featured.map((row) => (
          <article key={String(row.id)} className="opgw-cable-module-card">
            <strong>{String(row.cableName || row.id)}</strong>
            <span>{String(row.lineId || "line")} / {String(row.status || "synthetic")}</span>
            <dl>
              <div><dt>Fiber</dt><dd>{String(row.fiberCount)}F</dd></div>
              <div><dt>Miles</dt><dd>{Number(row.routeMiles || 0).toFixed(2)}</dd></div>
              <div><dt>Structures</dt><dd>{String(row.structureCount || 0)}</dd></div>
              <div><dt>Spans</dt><dd>{String(row.spanCount || 0)}</dd></div>
              <div><dt>Strands</dt><dd>{String(row.strandCount || 0)}</dd></div>
              <div><dt>Splices</dt><dd>{String(row.spliceRowCount || row.spliceClosureCount || 0)}</dd></div>
              <div><dt>Devices</dt><dd>{String(row.linkedDeviceCount || 0)}</dd></div>
            </dl>
            <div className="subtle">
              <strong>Linked assets:</strong> {String(row.linkedAssetFingerprint || row.id)}
            </div>
            <div className="subtle">
              <strong>Device IDs:</strong> {String(row.linkedDevices || "-")}
            </div>
            <div className="opgw-cable-module-actions">
              <Link href={String(row.cable_module_view)}>Open Full Details</Link>
              <Link href={String(row.continuity_view || row.fiber_trace_view)}>Full Continuity</Link>
              <Link href={String(row.map_view)}>Map View</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FiberStrandTablePage() {
  const data = useSyntheticFiberData();
  const rows = data.strands.map((strand) => {
    const continuityRecord = findStrandContinuityRecord(strand, data.strandContinuity);
    return {
      ...strand,
      continuity_source: continuityRecord ? "Derived from linked cable, splice, assignment, and service data" : "No linked assignment/splice path",
      derived_continuity_view: continuityRecord ? strandContinuityDashboardHref(continuityRecord) : "No linked path",
    } as unknown as JsonRecord;
  });
  return <SyntheticPage title="Fiber Strand Table" subtitle="One synthetic strand record per generated OPGW fiber. Use the derived continuity view to isolate its existing cable, structures, splices, patch panels, assignment, service, and end-device links on the dashboard." error={data.error}><DataTable rows={rows} columns={["cableId", "strandNumber", "tubeNumber", "colorCode", "status", "assignmentId", "circuitId", "continuity_source", "derived_continuity_view"]} filterField="status" /></SyntheticPage>;
}

export function SplicePointsPage() {
  const data = useSyntheticFiberData();
  const rows = data.closures.map((feature) => feature.properties as unknown as JsonRecord);
  return <SyntheticPage title="Splice Points" subtitle="Synthetic splice closures placed on synthetic OPGW structures." error={data.error}><DataTable rows={rows} columns={["name", "structureNumber", "closureType", "spliceCount", "status", "installType", "source"]} filterField="closureType" /></SyntheticPage>;
}

export function SpliceMatrixPage() {
  const data = useSyntheticFiberData();
  const closureNameById = useMemo(() => new Map(data.closures.map((closure) => [closure.properties.id, closure.properties.name])), [data.closures]);
  const rows = data.splices.map((splice) => ({ ...splice, closureName: closureNameById.get(splice.spliceClosureId) || splice.spliceClosureId }) as unknown as JsonRecord);
  return <SyntheticPage title="Splice Matrix" subtitle="Synthetic straight-through, express, and planned splice matrix records." error={data.error}><DataTable rows={rows} columns={["closureName", "fromCableId", "fromStrandNumber", "toCableId", "toStrandNumber", "spliceType", "lossDb", "status", "assignmentId"]} filterField="spliceType" /></SyntheticPage>;
}

export function FiberAssignmentPlannerPage() {
  const data = useSyntheticFiberData();
  const rows = data.assignments.map((assignment) => ({ ...assignment, cableCount: assignment.cableIds.length, strandSet: assignment.strandSegments.map((segment) => `${segment.cableId}:${segment.strandNumbers.join("/")}`).join("; ") }) as unknown as JsonRecord);
  return <SyntheticPage title="Fiber Assignment Planner" subtitle="Synthetic planned, reserved, and active fiber assignments. Use the dashboard Assign tab for interactive local reservations." error={data.error}><DataTable rows={rows} columns={["assignmentName", "serviceType", "status", "cableCount", "strandSet", "estimatedDistanceMiles", "estimatedLossDb"]} filterField="serviceType" /></SyntheticPage>;
}

export function StrandContinuityPage() {
  const data = useSyntheticFiberData();
  const rows = data.strandContinuity.map((record) => ({
    ...record,
    cable_count: record.cableIds.length,
    strand_set: record.strandNumbers.join(", "),
    splice_closure_count: record.spliceClosureIds.length,
    segment_count: record.continuitySegments.length,
    map_view: strandContinuityDashboardHref(record),
  }) as unknown as JsonRecord);
  const panelIds = new Set(data.strandContinuity.flatMap((record) => [record.aEndPatchPanelId, record.zEndPatchPanelId].filter(Boolean)));
  return (
    <SyntheticPage title="Derived Strand Continuity" subtitle="Read-only strand views assembled from existing fiber strands, OPGW cables, splice closures, fiber splices, patch panels, assignments, services, and endpoint references. This does not create a separate continuity database object." error={data.error}>
      <section className="metric-grid" aria-label="Strand continuity metrics">
        <Metric label="Derived views" value={data.strandContinuity.length.toLocaleString()} detail="Resolved from linked strand data" />
        <Metric label="Patch panels" value={panelIds.size.toLocaleString()} detail="A/Z panel terminations" />
        <Metric label="Fiber splices" value={data.strandContinuity.reduce((sum, record) => sum + record.fiberSpliceIds.length, 0).toLocaleString()} detail="Existing linked splice rows" />
        <Metric label="Splice closures" value={data.strandContinuity.reduce((sum, record) => sum + record.spliceClosureIds.length, 0).toLocaleString()} detail="Linked splice path hops" />
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <strong>Map Strand View</strong>
          <span className="badge active">isolated layer mode</span>
        </div>
        <div className="panel-body">
          <p className="subtle">Open any row on the map to turn off unrelated layers, highlight the selected strand assignment, and show the cable, structure, splice, patch-panel, service, and end-device links that already exist in the database.</p>
          <div className="strand-continuity-card-grid">
            {data.strandContinuity.slice(0, 12).map((record) => (
              <article className="strand-continuity-card" key={record.id}>
                <strong>{record.continuityName}</strong>
                <span>{record.serviceType} / {record.strandNumbers.join(", ")} strands / {record.estimatedLossDb.toFixed(2)} dB</span>
                <small>{record.aEndPatchPanelId || "A-end panel"} to {record.zEndPatchPanelId || "Z-end panel"}</small>
                <Link href={strandContinuityDashboardHref(record)}>Open Derived Strand View</Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <DataTable rows={rows} columns={["continuityName", "assignmentId", "serviceId", "circuitId", "serviceType", "status", "strand_set", "aEndPatchPanelId", "zEndPatchPanelId", "cable_count", "splice_closure_count", "segment_count", "routeMiles", "estimatedLossDb", "map_view"]} filterField="serviceType" />
    </SyntheticPage>
  );
}

function SyntheticPage({ title, subtitle, error, children }: { title: string; subtitle: string; error: string; children: ReactNode }) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="eyebrowless-title">{title}</h1>
          <div className="subtle">{subtitle}</div>
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body">
          <strong>Synthetic planning data only.</strong>
          <p className="subtle">Transmission structures, OPGW cables, splices, fiber assignments, patch panels, and telecom planning records generated by this project are synthetic demo/planning records. They do not represent real utility assets.</p>
        </div>
      </div>
      {error ? <div className="badge red">{error}</div> : children}
    </>
  );
}

function useSyntheticFiberData() {
  const [data, setData] = useState<SyntheticFiberData>(emptyData);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [structures, opgw, closures, strands, splices, panels, assignments, strandContinuity] = await Promise.all([
          fetchJson<TransmissionStructureCollection>("/data/iso-ne-synthetic-transmission-structures.geojson"),
          fetchJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson"),
          fetchJson<SpliceClosureCollection>("/data/iso-ne-synthetic-splice-closures.geojson"),
          fetchJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json"),
          fetchJson<FiberSplice[]>("/data/iso-ne-synthetic-fiber-splices.json"),
          fetchJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json"),
          fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
          fetchJson<StrandContinuityRecord[]>("/data/iso-ne-synthetic-strand-continuity.json").catch(() => []),
        ]);
        if (cancelled) return;
        setData({
          structures: structures.features || [],
          opgw: opgw.features || [],
          closures: closures.features || [],
          strands,
          splices,
          panels,
          assignments,
          strandContinuity,
          error: "",
        });
      } catch (error) {
        if (!cancelled) setData({ ...emptyData, error: error instanceof Error ? error.message : "Could not load synthetic fiber data." });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

function useOpgwCableData() {
  const [data, setData] = useState<SyntheticOpgwCableData>(emptyOpgwCableData);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const opgw = await fetchJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson");
        if (!cancelled) setData({ opgw: opgw.features || [], error: "", loading: false });
      } catch (error) {
        if (!cancelled) {
          setData({
            opgw: [],
            error: error instanceof Error ? error.message : "Could not load synthetic OPGW cable data.",
            loading: false,
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

function useOpgwCableLinkedAssetData(opgw: OpgwCableCollection["features"]): OpgwCableLinkedAssetData {
  const [data, setData] = useState<OpgwCableLinkedAssetData>({ summaries: new Map(), loading: false, error: "" });
  useEffect(() => {
    if (!opgw.length) {
      setData({ summaries: new Map(), loading: false, error: "" });
      return;
    }
    let cancelled = false;
    async function load() {
      setData((current) => ({ ...current, loading: true, error: "" }));
      try {
        const [strands, splices, assignments, panels, services, hardware] = await Promise.all([
          fetchJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json"),
          fetchJson<FiberSplice[]>("/data/iso-ne-synthetic-fiber-splices.json"),
          fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
          fetchJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json"),
          fetchJson<SyntheticService[]>("/data/iso-ne-synthetic-services.json"),
          fetchJson<SyntheticTelecomHardware>("/data/iso-ne-synthetic-telecom-hardware.json").catch(() => ({ nodes: [] })),
        ]);
        if (cancelled) return;
        setData({ summaries: buildOpgwCableLinkedAssetSummaries(opgw, { strands, splices, assignments, panels, services, hardware }), loading: false, error: "" });
      } catch (error) {
        if (!cancelled) setData({ summaries: new Map(), loading: false, error: error instanceof Error ? error.message : "Could not load linked cable assets." });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [opgw]);
  return data;
}

function buildOpgwCableLinkedAssetSummaries(
  opgw: OpgwCableCollection["features"],
  data: {
    strands: FiberStrand[];
    splices: FiberSplice[];
    assignments: FiberAssignment[];
    panels: PatchPanel[];
    services: SyntheticService[];
    hardware: SyntheticTelecomHardware;
  },
) {
  const summaries = new Map<string, OpgwCableLinkedAssets>();
  const closureToCableIds = new Map<string, Set<string>>();
  opgw.forEach((feature) => {
    const cableId = feature.properties.id;
    summaries.set(cableId, {
      ...createEmptyLinkedAssetSummary(),
      spans: Math.max(0, feature.properties.structureIds.length - 1),
      spliceClosures: feature.properties.connectedSpliceClosureIds.length,
      spliceSample: feature.properties.connectedSpliceClosureIds.slice(0, 3),
    });
    feature.properties.connectedSpliceClosureIds.forEach((closureId) => addSetValue(closureToCableIds, closureId, cableId));
  });

  data.strands.forEach((strand) => {
    const summary = summaries.get(strand.cableId);
    if (!summary) return;
    summary.strands += 1;
    if (strand.status === "assigned") summary.assignedStrands += 1;
    if (strand.status === "reserved") summary.reservedStrands += 1;
    if (strand.status === "available" || strand.status === "dark" || strand.status === "spare") summary.availableStrands += 1;
    pushSample(summary.strandSample, strand.id);
  });

  data.splices.forEach((splice) => {
    const cableIds = new Set<string>([splice.fromCableId, splice.toCableId]);
    closureToCableIds.get(splice.spliceClosureId)?.forEach((cableId) => cableIds.add(cableId));
    cableIds.forEach((cableId) => {
      const summary = summaries.get(cableId);
      if (!summary) return;
      summary.spliceRows += 1;
      pushSample(summary.spliceSample, splice.id);
    });
  });

  data.panels.forEach((panel) => {
    panel.fiberCableIds.forEach((cableId) => {
      const summary = summaries.get(cableId);
      if (!summary) return;
      summary.patchPanels += 1;
      pushSample(summary.patchPanelSample, panel.id);
    });
  });

  data.assignments.forEach((assignment) => {
    const cableIds = new Set<string>([
      ...assignment.cableIds,
      ...assignment.strandSegments.map((segment) => segment.cableId),
    ]);
    cableIds.forEach((cableId) => {
      const summary = summaries.get(cableId);
      if (!summary) return;
      summary.assignments += 1;
      pushSample(summary.assignmentSample, assignment.id);
    });
  });

  const serviceIdsByCable = new Map<string, Set<string>>();
  const serviceToCableIds = new Map<string, Set<string>>();
  data.services.forEach((service) => {
    const cableIds = new Set((service.continuityCableIds || []).filter((cableId) => summaries.has(cableId)));
    cableIds.forEach((cableId) => {
      const summary = summaries.get(cableId);
      if (!summary) return;
      summary.services += 1;
      pushSample(summary.serviceSample, service.serviceId);
      addSetValue(serviceIdsByCable, cableId, service.serviceId);
      addSetValue(serviceToCableIds, service.serviceId, cableId);
    });
    service.telecomNodeIds?.forEach((nodeId) => {
      cableIds.forEach((cableId) => addDeviceToSummary(summaries.get(cableId), nodeId));
    });
  });

  (data.hardware.nodes || []).forEach((node) => {
    const cableIds = new Set<string>();
    node.serviceIds?.forEach((serviceId) => serviceToCableIds.get(serviceId)?.forEach((cableId) => cableIds.add(cableId)));
    cableIds.forEach((cableId) => {
      const summary = summaries.get(cableId);
      addDeviceToSummary(summary, node.nodeId, node.deviceRole);
    });
  });

  serviceIdsByCable.forEach((serviceIds, cableId) => {
    const summary = summaries.get(cableId);
    if (!summary) return;
    summary.services = serviceIds.size;
  });

  return summaries;
}

function addDeviceToSummary(summary: OpgwCableLinkedAssets | undefined, nodeId: string | undefined, role?: string) {
  if (!summary || !nodeId || summary.deviceSample.includes(nodeId)) return;
  summary.devices += 1;
  pushSample(summary.deviceSample, nodeId);
  if (role) pushSample(summary.deviceRoleSample, role);
}

function addSetValue<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  let current = map.get(key);
  if (!current) {
    current = new Set<V>();
    map.set(key, current);
  }
  current.add(value);
}

function pushSample(values: string[], value: string | undefined, maxItems = 4) {
  if (!value || values.includes(value) || values.length >= maxItems) return;
  values.push(value);
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return await response.json() as T;
}
