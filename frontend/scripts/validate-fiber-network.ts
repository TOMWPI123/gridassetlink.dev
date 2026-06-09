import type { FiberAssignment, FiberSplice, FiberStrand, PatchPanel } from "../lib/types/assets";
import { FIBER_ASSIGNMENTS_PATH, FIBER_SPLICES_PATH, PATCH_PANELS_PATH, STRANDS_PATH, deriveSpliceBoundedCableSections, readJson, readOpgwCables, readSpliceClosures, readStructures } from "./fiber-network-utils";

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const structures = await readStructures();
  const opgw = await readOpgwCables();
  const closures = await readSpliceClosures();
  const strands = await readJson<FiberStrand[]>(STRANDS_PATH, []);
  const splices = await readJson<FiberSplice[]>(FIBER_SPLICES_PATH, []);
  const panels = await readJson<PatchPanel[]>(PATCH_PANELS_PATH, []);
  const assignments = await readJson<FiberAssignment[]>(FIBER_ASSIGNMENTS_PATH, []);
  const cableSections = deriveSpliceBoundedCableSections(opgw.features, structures.features, closures.features);

  const structureIds = new Set(structures.features.map((item) => item.properties.id));
  const routeCableIds = new Set(opgw.features.map((item) => item.properties.id));
  const sectionCableIds = new Set(cableSections.map((item) => item.id));
  const publicLineIds = new Set(opgw.features.map((item) => item.properties.lineId));
  const closureIds = new Set(closures.features.map((item) => item.properties.id));
  const spliceIds = new Set(splices.map((item) => item.id));
  const assignmentIds = new Set(assignments.map((item) => item.id));

  opgw.features.forEach((cable) => {
    if (!cable.properties.lineId) errors.push(`${cable.properties.id} missing lineId.`);
    if (!publicLineIds.has(cable.properties.lineId)) errors.push(`${cable.properties.id} references unknown line ${cable.properties.lineId}.`);
    if (!structureIds.has(cable.properties.startStructureId)) errors.push(`${cable.properties.id} invalid start structure ${cable.properties.startStructureId}.`);
    if (!structureIds.has(cable.properties.endStructureId)) errors.push(`${cable.properties.id} invalid end structure ${cable.properties.endStructureId}.`);
    cable.properties.structureIds.forEach((structureId) => {
      if (!structureIds.has(structureId)) errors.push(`${cable.properties.id} invalid route structure ${structureId}.`);
    });
  });

  strands.forEach((strand) => {
    if (!sectionCableIds.has(strand.cableId)) errors.push(`${strand.id} references invalid splice-to-splice cable ${strand.cableId}.`);
    if (routeCableIds.has(strand.cableId)) errors.push(`${strand.id} uses parent route ${strand.cableId}; strands must reference a splice-to-splice cable ID.`);
    if (strand.assignmentId && !assignmentIds.has(strand.assignmentId)) warnings.push(`${strand.id} references missing assignment ${strand.assignmentId}.`);
  });

  closures.features.forEach((closure) => {
    if (!structureIds.has(closure.properties.structureId)) errors.push(`${closure.properties.id} invalid structure ${closure.properties.structureId}.`);
    closure.properties.cableIds.forEach((cableId) => {
      if (!sectionCableIds.has(cableId)) errors.push(`${closure.properties.id} invalid splice-to-splice cable ${cableId}.`);
      if (routeCableIds.has(cableId)) errors.push(`${closure.properties.id} uses parent route ${cableId}; closure cableIds must be adjacent splice-to-splice cable IDs.`);
    });
    const structure = structures.features.find((item) => item.properties.id === closure.properties.structureId);
    if (structure && !structure.properties.hasOpgw) errors.push(`${closure.properties.id} is mounted on structure without OPGW.`);
  });

  splices.forEach((splice) => {
    if (!closureIds.has(splice.spliceClosureId)) errors.push(`${splice.id} invalid closure ${splice.spliceClosureId}.`);
    if (!sectionCableIds.has(splice.fromCableId)) errors.push(`${splice.id} invalid from splice-to-splice cable ${splice.fromCableId}.`);
    if (!sectionCableIds.has(splice.toCableId)) errors.push(`${splice.id} invalid to splice-to-splice cable ${splice.toCableId}.`);
    if (routeCableIds.has(splice.fromCableId) || routeCableIds.has(splice.toCableId)) errors.push(`${splice.id} uses a parent route cable ID; splice rows must use splice-to-splice cable IDs.`);
    if (splice.assignmentId && !assignmentIds.has(splice.assignmentId)) warnings.push(`${splice.id} references missing assignment ${splice.assignmentId}.`);
  });

  const strandUsage = new Map<string, string>();
  assignments.forEach((assignment) => {
    assignment.cableIds.forEach((cableId) => {
      if (!sectionCableIds.has(cableId)) errors.push(`${assignment.id} invalid splice-to-splice cable ${cableId}.`);
      if (routeCableIds.has(cableId)) errors.push(`${assignment.id} uses parent route ${cableId}; assignments must use splice-to-splice cable IDs.`);
    });
    [...assignment.spliceIds].forEach((spliceId) => {
      if (!spliceIds.has(spliceId)) errors.push(`${assignment.id} invalid splice ${spliceId}.`);
    });
    [assignment.aEndStructureId, assignment.zEndStructureId].filter(Boolean).forEach((structureId) => {
      if (!structureIds.has(structureId as string)) errors.push(`${assignment.id} invalid endpoint structure ${structureId}.`);
    });
    assignment.strandSegments.forEach((segment) => {
      if (!sectionCableIds.has(segment.cableId)) errors.push(`${assignment.id} invalid segment splice-to-splice cable ${segment.cableId}.`);
      segment.strandNumbers.forEach((strandNumber) => {
        const key = `${segment.cableId}:${strandNumber}`;
        const previous = strandUsage.get(key);
        if (previous) errors.push(`Strand ${key} double-booked by ${previous} and ${assignment.id}.`);
        strandUsage.set(key, assignment.id);
      });
    });
  });

  panels.forEach((panel) => {
    if (panel.locationType === "structure" && !structureIds.has(panel.locationId)) errors.push(`${panel.id} invalid structure ${panel.locationId}.`);
    panel.fiberCableIds.forEach((cableId) => {
      if (!sectionCableIds.has(cableId)) errors.push(`${panel.id} invalid splice-to-splice cable ${cableId}.`);
      if (routeCableIds.has(cableId)) errors.push(`${panel.id} uses parent route ${cableId}; patch panels must terminate splice-to-splice cable IDs.`);
    });
    panel.ports.forEach((port) => {
      if (port.cableId && !sectionCableIds.has(port.cableId)) errors.push(`${port.id} invalid splice-to-splice cable ${port.cableId}.`);
      if (port.assignmentId && !assignmentIds.has(port.assignmentId)) warnings.push(`${port.id} references missing assignment ${port.assignmentId}.`);
    });
  });

  const summary = {
    structures: structures.features.length,
    opgwRouteSources: opgw.features.length,
    spliceToSpliceCableSections: cableSections.length,
    strands: strands.length,
    spliceClosures: closures.features.length,
    splices: splices.length,
    patchPanels: panels.length,
    assignments: assignments.length,
    errors: errors.length,
    warnings: warnings.length,
  };

  console.log(JSON.stringify(summary, null, 2));
  warnings.slice(0, 20).forEach((warning) => console.warn(`warning: ${warning}`));
  errors.slice(0, 50).forEach((error) => console.error(`error: ${error}`));
  if (errors.length) throw new Error(`Fiber network validation failed with ${errors.length} errors.`);
}

void main();
