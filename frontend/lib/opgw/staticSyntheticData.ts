import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  FiberAssignment,
  FiberSplice,
  FiberStrand,
  OpgwCableCollection,
  PatchPanel,
  PublicTransmissionLineCollection,
  SpliceClosureCollection,
  SyntheticService,
  TransmissionStructureCollection,
} from "@/lib/types/assets";
import { buildSyntheticOpgwEngineeringModel } from "@/lib/opgw/spanModel";
import type { FiberContinuityData } from "@/lib/opgw/continuityEngine";

const DATA_DIR = path.join(process.cwd(), "public", "data");

export async function loadSyntheticFiberContinuityData(): Promise<FiberContinuityData> {
  const [
    publicLines,
    structures,
    opgwCables,
    spliceClosures,
    fiberStrands,
    fiberSplices,
    fiberAssignments,
    patchPanels,
    syntheticServices,
  ] = await Promise.all([
    readData<PublicTransmissionLineCollection>("iso-ne-public-transmission-lines.geojson", { type: "FeatureCollection", features: [] }),
    readData<TransmissionStructureCollection>("iso-ne-synthetic-transmission-structures.geojson", { type: "FeatureCollection", features: [] }),
    readData<OpgwCableCollection>("iso-ne-synthetic-opgw-cables.geojson", { type: "FeatureCollection", features: [] }),
    readData<SpliceClosureCollection>("iso-ne-synthetic-splice-closures.geojson", { type: "FeatureCollection", features: [] }),
    readData<FiberStrand[]>("iso-ne-synthetic-fiber-strands.json", []),
    readData<FiberSplice[]>("iso-ne-synthetic-fiber-splices.json", []),
    readData<FiberAssignment[]>("iso-ne-synthetic-fiber-assignments.json", []),
    readData<PatchPanel[]>("iso-ne-synthetic-patch-panels.json", []),
    readData<SyntheticService[]>("iso-ne-synthetic-services.json", []),
  ]);

  const engineeringModel = buildSyntheticOpgwEngineeringModel({
    opgwCables: opgwCables.features,
    transmissionStructures: structures.features,
    spliceClosures: spliceClosures.features,
    fiberStrands,
    fiberAssignments,
    patchPanels,
    publicTransmissionLines: publicLines.features,
  });

  return {
    opgwCables: opgwCables.features,
    opgwCableSections: engineeringModel.cableSections,
    opgwSpanSegments: engineeringModel.spanSegments,
    opgwSplicePoints: engineeringModel.splicePoints,
    spliceClosures: spliceClosures.features,
    fiberSplices,
    fiberAssignments,
    patchPanels,
    syntheticServices,
    transmissionStructures: structures.features,
  };
}

async function readData<T>(filename: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, filename), "utf-8")) as T;
  } catch {
    return fallback;
  }
}
