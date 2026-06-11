"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import { findStrandContinuityRecord, strandContinuityDashboardHref } from "@/lib/opgw/strandContinuity";
import type { FiberAssignment, FiberSplice, FiberStrand, OpgwCableCollection, PatchPanel, SpliceClosureCollection, StrandContinuityRecord, TransmissionStructureCollection } from "@/lib/types/assets";
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

export function TransmissionStructuresPage() {
  const data = useSyntheticFiberData();
  const rows = data.structures.map((feature) => feature.properties as unknown as JsonRecord);
  return <SyntheticPage title="Transmission Structures" subtitle="Synthetic structure points generated from public transmission line geometry." error={data.error}><DataTable rows={rows} columns={["structureNumber", "lineId", "sequenceIndex", "structureType", "voltageKv", "hasOpgw", "hasSplice", "source"]} filterField="structureType" /></SyntheticPage>;
}

export function OpgwCablesPage() {
  const data = useSyntheticFiberData();
  const rows = data.opgw.map((feature) => ({ ...feature.properties, structureCount: feature.properties.structureIds.length, spliceClosureCount: feature.properties.connectedSpliceClosureIds.length }) as unknown as JsonRecord);
  return <SyntheticPage title="OPGW Cables" subtitle="Synthetic OPGW planning cables randomly assigned to public transmission lines." error={data.error}><DataTable rows={rows} columns={["cableName", "lineId", "status", "fiberCount", "routeMiles", "structureCount", "spliceClosureCount", "source"]} filterField="status" /></SyntheticPage>;
}

export function FiberStrandTablePage() {
  const data = useSyntheticFiberData();
  const rows = data.strands.map((strand) => {
    const continuityRecord = findStrandContinuityRecord(strand, data.strandContinuity);
    return {
      ...strand,
      continuity_id: continuityRecord?.strandContinuityId || "-",
      continuity_view: continuityRecord ? strandContinuityDashboardHref(continuityRecord) : "No continuity record",
    } as unknown as JsonRecord;
  });
  return <SyntheticPage title="Fiber Strand Table" subtitle="One synthetic strand record per generated OPGW fiber. Use View to isolate its splice, cable, patch-panel, and assignment continuity on the dashboard without device layers." error={data.error}><DataTable rows={rows} columns={["cableId", "strandNumber", "tubeNumber", "colorCode", "status", "assignmentId", "circuitId", "continuity_id", "continuity_view"]} filterField="status" /></SyntheticPage>;
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
    <SyntheticPage title="Strand Continuity" subtitle="Synthetic end-to-end strand paths from substation patch panels through splices and fiber assets. Dashboard strand views hide device layers by default." error={data.error}>
      <section className="metric-grid" aria-label="Strand continuity metrics">
        <Metric label="Continuity paths" value={data.strandContinuity.length.toLocaleString()} detail="Generated strand-level demos" />
        <Metric label="Patch panels" value={panelIds.size.toLocaleString()} detail="A/Z panel terminations" />
        <Metric label="Splice records" value={data.strandContinuity.reduce((sum, record) => sum + record.fiberSpliceIds.length, 0).toLocaleString()} detail="Synthetic strand continuity records" />
        <Metric label="Splice references" value={data.strandContinuity.reduce((sum, record) => sum + record.spliceClosureIds.length, 0).toLocaleString()} detail="Diverse splice path hops" />
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <strong>Map Strand View</strong>
          <span className="badge active">isolated layer mode</span>
        </div>
        <div className="panel-body">
          <p className="subtle">Open any row on the map to turn off unrelated layers, highlight the strand assignment, and show the cable, splice, patch-panel, and fiber asset path without device overlays.</p>
          <div className="strand-continuity-card-grid">
            {data.strandContinuity.slice(0, 12).map((record) => (
              <article className="strand-continuity-card" key={record.id}>
                <strong>{record.continuityName}</strong>
                <span>{record.serviceType} / {record.strandNumbers.join(", ")} strands / {record.estimatedLossDb.toFixed(2)} dB</span>
                <small>{record.aEndPatchPanelId || "A-end panel"} to {record.zEndPatchPanelId || "Z-end panel"}</small>
                <Link href={strandContinuityDashboardHref(record)}>Open Strand View</Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <DataTable rows={rows} columns={["strandContinuityId", "continuityName", "serviceType", "status", "strand_set", "aEndPatchPanelId", "zEndPatchPanelId", "cable_count", "splice_closure_count", "segment_count", "routeMiles", "estimatedLossDb", "map_view"]} filterField="serviceType" />
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
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return await response.json() as T;
}
