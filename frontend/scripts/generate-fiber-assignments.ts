import type { FiberAssignment, FiberSplice, FiberStrand, PatchPanel } from "../lib/types/assets";
import { FIBER_ASSIGNMENTS_PATH, FIBER_SPLICES_PATH, PATCH_PANELS_PATH, STRANDS_PATH, chooseWeighted, createSeededRandom, deriveSpliceBoundedCableSections, readJson, readOpgwCables, readSpliceClosures, readStructures, round, writeJson } from "./fiber-network-utils";

const SEED = "gridassetlink-fiber-assignments-v1";
const SERVICE_TYPES: FiberAssignment["serviceType"][] = ["SEL_ICON", "C37_94", "Ethernet", "MPLS_TP", "OTN", "SCADA", "Protection", "DTT", "Leased", "Spare", "Other"];

async function main() {
  const rng = createSeededRandom(SEED);
  const cables = await readOpgwCables();
  const structures = await readStructures();
  const closures = await readSpliceClosures();
  const cableSections = deriveSpliceBoundedCableSections(cables.features, structures.features, closures.features);
  const strands = await readJson<FiberStrand[]>(STRANDS_PATH, []);
  const splices = await readJson<FiberSplice[]>(FIBER_SPLICES_PATH, []);
  const patchPanels = await readJson<PatchPanel[]>(PATCH_PANELS_PATH, []);
  const strandsByCable = groupBy(strands, (strand) => strand.cableId);
  const spliceByCable = new Map<string, FiberSplice[]>();
  splices.forEach((splice) => {
    [splice.fromCableId, splice.toCableId].forEach((cableId) => {
      const current = spliceByCable.get(cableId) || [];
      current.push(splice);
      spliceByCable.set(cableId, current);
    });
  });

  const assignments: FiberAssignment[] = [];
  cableSections.forEach((cable, cableIndex) => {
    const assignmentCount = cable.fiberCount >= 72 ? 3 : 2;
    const strandWidth = cable.fiberCount >= 144 ? 8 : cable.fiberCount >= 96 ? 6 : cable.fiberCount >= 48 ? 4 : 2;
    for (let attempt = 0; attempt < assignmentCount; attempt += 1) {
      const available = (strandsByCable.get(cable.id) || []).filter((strand) => !strand.assignmentId && !["assigned", "reserved", "faulted", "retired"].includes(strand.status));
      if (available.length < strandWidth) continue;
      const startIndex = Math.max(0, Math.min(available.length - strandWidth, Math.floor(rng() * available.length)));
      const selected = available.slice(startIndex, startIndex + strandWidth);
      const assignmentStatus = chooseWeighted(rng, ["active", "planned", "proposed", "reserved"] as const, [0.3, 0.34, 0.2, 0.16]);
      const assignmentId = `SYN-ASSIGN-${String(assignments.length + 1).padStart(5, "0")}`;
      const spliceIds = chooseSplices(spliceByCable.get(cable.id) || [], selected.map((strand) => strand.strandNumber));
      const spliceLoss = splices.filter((splice) => spliceIds.includes(splice.id)).reduce((sum, splice) => sum + (splice.lossDb || 0), 0);
      const serviceType = chooseWeighted(rng, SERVICE_TYPES, [0.12, 0.1, 0.14, 0.08, 0.07, 0.12, 0.12, 0.08, 0.08, 0.06, 0.03]);
      const assignment: FiberAssignment = {
        id: assignmentId,
        assignmentName: `${serviceType}-${cable.id}-${String(attempt + 1).padStart(2, "0")}`,
        synthetic: true,
        serviceType,
        status: assignmentStatus,
        aEndStructureId: cable.startStructureId,
        zEndStructureId: cable.endStructureId,
        cableIds: [cable.id],
        strandSegments: [{
          cableId: cable.id,
          strandNumbers: selected.map((strand) => strand.strandNumber),
          fromStructureId: cable.startStructureId,
          toStructureId: cable.endStructureId,
        }],
        spliceIds,
        estimatedDistanceMiles: cable.routeMiles,
        estimatedLossDb: round(cable.routeMiles * 0.25 + spliceLoss + 1, 3),
        notes: "Synthetic fiber assignment for no-auth planning demo. Do not use for operations or real routing.",
      };
      assignments.push(assignment);
      selected.forEach((strand) => {
        strand.assignmentId = assignmentId;
        strand.circuitId = `${serviceType}-SYN-${String(cableIndex + 1).padStart(4, "0")}-${String(attempt + 1).padStart(2, "0")}`;
        strand.status = assignmentStatus === "active" ? "assigned" : "reserved";
        strand.notes = "Reserved or assigned by synthetic demo fiber assignment.";
      });
      splices.filter((splice) => spliceIds.includes(splice.id)).forEach((splice) => {
        splice.assignmentId = assignmentId;
        if (assignmentStatus !== "active") splice.status = "planned";
      });
      patchPanels.forEach((panel) => {
        if (!panel.fiberCableIds.includes(cable.id)) return;
        panel.ports.forEach((port) => {
          if (selected.some((strand) => strand.strandNumber === port.strandNumber)) {
            port.assignmentId = assignmentId;
            port.status = assignmentStatus === "active" ? "assigned" : "reserved";
          }
        });
      });
    }
  });

  await writeJson(FIBER_ASSIGNMENTS_PATH, assignments);
  await writeJson(STRANDS_PATH, strands);
  await writeJson(FIBER_SPLICES_PATH, splices);
  await writeJson(PATCH_PANELS_PATH, patchPanels);
  console.log(`Wrote ${assignments.length} synthetic fiber assignments across ${structures.features.length} structures and ${closures.features.length} splice closures.`);
}

function chooseSplices(splices: FiberSplice[], strandNumbers: number[]) {
  const strandSet = new Set(strandNumbers);
  return splices
    .filter((splice) => strandSet.has(splice.fromStrandNumber) || strandSet.has(splice.toStrandNumber))
    .slice(0, 12)
    .map((splice) => splice.id);
}

function groupBy<T>(values: T[], getKey: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  values.forEach((value) => {
    const key = getKey(value);
    const current = grouped.get(key) || [];
    current.push(value);
    grouped.set(key, current);
  });
  return grouped;
}

void main();
