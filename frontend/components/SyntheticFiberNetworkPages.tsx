"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import { buildSyntheticOpgwEngineeringModel } from "@/lib/opgw/spanModel";
import type { FiberAssignment, FiberSplice, FiberStrand, OpgwCableCollection, PatchPanel, SpliceClosureCollection, TransmissionStructureCollection } from "@/lib/types/assets";
import type { JsonRecord } from "@/types";

type SyntheticFiberData = {
  structures: TransmissionStructureCollection["features"];
  opgw: OpgwCableCollection["features"];
  closures: SpliceClosureCollection["features"];
  strands: FiberStrand[];
  splices: FiberSplice[];
  panels: PatchPanel[];
  assignments: FiberAssignment[];
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
  error: "",
};

export function TransmissionStructuresPage() {
  const data = useSyntheticFiberData();
  const rows = data.structures.map((feature) => feature.properties as unknown as JsonRecord);
  return <SyntheticPage title="Transmission Structures" subtitle="Synthetic structure points generated from public transmission line geometry." error={data.error}><DataTable rows={rows} columns={["structureNumber", "lineId", "sequenceIndex", "structureType", "voltageKv", "hasOpgw", "hasSplice", "source"]} filterField="structureType" /></SyntheticPage>;
}

export function OpgwCablesPage() {
  const data = useSyntheticFiberData();
  const sections = useMemo(() => buildSyntheticOpgwEngineeringModel({
    opgwCables: data.opgw,
    transmissionStructures: data.structures,
    spliceClosures: data.closures,
    fiberStrands: data.strands,
    fiberAssignments: data.assignments,
    patchPanels: data.panels,
    publicTransmissionLines: [],
  }).cableSections, [data]);
  const rows = sections.map((feature) => ({
    ...feature.properties,
    cableBoundary: `${feature.properties.fromSplicePointId} to ${feature.properties.toSplicePointId}`,
    structureCount: feature.properties.totalSpans + 1,
    spliceClosureCount: feature.properties.associatedSpliceClosureIds.length,
    source: "synthetic-demo",
  }) as unknown as JsonRecord);
  return <SyntheticPage title="OPGW Cables" subtitle="Synthetic OPGW cable IDs are scoped to one cable section between two splice points." error={data.error}><DataTable rows={rows} columns={["cableId", "cableBoundary", "transmissionLineId", "installStatus", "fiberCount", "routeMiles", "structureCount", "spliceClosureCount", "source"]} filterField="installStatus" /></SyntheticPage>;
}

export function FiberStrandTablePage() {
  const data = useSyntheticFiberData();
  const rows = data.strands as unknown as JsonRecord[];
  return <SyntheticPage title="Fiber Strand Table" subtitle="One synthetic strand record per generated OPGW fiber." error={data.error}><DataTable rows={rows} columns={["cableId", "strandNumber", "tubeNumber", "colorCode", "status", "assignmentId", "circuitId"]} filterField="status" /></SyntheticPage>;
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
        const [structures, opgw, closures, strands, splices, panels, assignments] = await Promise.all([
          fetchJson<TransmissionStructureCollection>("/data/iso-ne-synthetic-transmission-structures.geojson"),
          fetchJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson"),
          fetchJson<SpliceClosureCollection>("/data/iso-ne-synthetic-splice-closures.geojson"),
          fetchJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json"),
          fetchJson<FiberSplice[]>("/data/iso-ne-synthetic-fiber-splices.json"),
          fetchJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json"),
          fetchJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json"),
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return await response.json() as T;
}
