"use client";

import dynamic from "next/dynamic";
import { Crosshair, MapPinned } from "lucide-react";
import type { Coordinate, DesignAssetRecord, DistributionFiberAssignmentFeature, DistributionPoleDensityFeature, DistributionPoleFeature, DistributionPoleFiberRouteFeature, DistributionPoleSplicePointFeature, DistributionSlackLoopFeature, FccMicrowaveLinkFeature, FccUtilityTowerFeature, FiberAssignment, FiberSplice, FiberStrand, MapDrawingTool, MapNode, OpgwCableFeature, OpgwCableSectionFeature, OpgwRouteFeature, OpgwSpanSegmentFeature, OpgwSplicePointFeature, PatchPanel, PlanningRegion, PublicSubstationFeature, PublicTransmissionLineFeature, SpliceClosureFeature, StreetMapLayerKey, Substation, SyntheticService, SyntheticSubstationFeature, TransmissionLine, TransmissionMap, TransmissionStructureFeature } from "@/lib/types/assets";

export type GisVectorAssetRecord = Record<string, unknown>;

export type StreetMapSelection =
  | { kind: "substation"; id: string; label: string; record: Substation }
  | { kind: "node"; id: string; label: string; record: MapNode }
  | { kind: "transmission_line"; id: string; label: string; record: TransmissionLine }
  | { kind: "public_transmission_line"; id: string; label: string; record: PublicTransmissionLineFeature }
  | { kind: "public_substation"; id: string; label: string; record: PublicSubstationFeature }
  | { kind: "fcc_utility_tower"; id: string; label: string; record: FccUtilityTowerFeature }
  | { kind: "fcc_microwave_link"; id: string; label: string; record: FccMicrowaveLinkFeature }
  | { kind: "synthetic_substation"; id: string; label: string; record: SyntheticSubstationFeature }
  | { kind: "transmission_structure"; id: string; label: string; record: TransmissionStructureFeature }
  | { kind: "opgw_cable"; id: string; label: string; record: OpgwCableFeature }
  | { kind: "opgw_route"; id: string; label: string; record: OpgwRouteFeature }
  | { kind: "opgw_cable_section"; id: string; label: string; record: OpgwCableSectionFeature }
  | { kind: "opgw_span_segment"; id: string; label: string; record: OpgwSpanSegmentFeature }
  | { kind: "opgw_splice_point"; id: string; label: string; record: OpgwSplicePointFeature }
  | { kind: "splice_closure"; id: string; label: string; record: SpliceClosureFeature }
  | { kind: "fiber_assignment"; id: string; label: string; record: FiberAssignment }
  | { kind: "distribution_pole_density"; id: string; label: string; record: DistributionPoleDensityFeature }
  | { kind: "distribution_pole"; id: string; label: string; record: DistributionPoleFeature }
  | { kind: "distribution_pole_fiber"; id: string; label: string; record: DistributionPoleFiberRouteFeature }
  | { kind: "distribution_splice_point"; id: string; label: string; record: DistributionPoleSplicePointFeature }
  | { kind: "distribution_slack_loop"; id: string; label: string; record: DistributionSlackLoopFeature }
  | { kind: "distribution_fiber_assignment"; id: string; label: string; record: DistributionFiberAssignmentFeature }
  | { kind: "gis_pole"; id: string; label: string; record: GisVectorAssetRecord }
  | { kind: "gis_vector_asset"; id: string; label: string; record: GisVectorAssetRecord }
  | { kind: "design_asset_record"; id: string; label: string; record: DesignAssetRecord }
  | { kind: "patch_panel"; id: string; label: string; record: PatchPanel }
  | { kind: "planning_region"; id: string; label: string; record: PlanningRegion }
  | { kind: "work_order"; id: string; label: string; record: MapNode };

export type MapCommand =
  | { type: "zoomIn" | "zoomOut" | "resetIsoNe" | "fitActiveMap" | "resize"; sequence: number }
  | { type: "pan"; x: number; y: number; sequence: number };

export type FocusRequest = { selection: StreetMapSelection; sequence: number };

export type ContinuityHighlight = {
  label: string;
  serviceId?: string;
  assignmentIds: string[];
  cableIds: string[];
  routeIds?: string[];
  sectionIds?: string[];
  splicePointIds: string[];
};

type StreetLevelAssetMapProps = {
  activeMap: TransmissionMap;
  substations: Substation[];
  nodes: MapNode[];
  transmissionLines: TransmissionLine[];
  publicTransmissionLines: PublicTransmissionLineFeature[];
  publicSubstations: PublicSubstationFeature[];
  fccUtilityTowers: FccUtilityTowerFeature[];
  fccMicrowaveLinks: FccMicrowaveLinkFeature[];
  syntheticSubstations: SyntheticSubstationFeature[];
  transmissionStructures: TransmissionStructureFeature[];
  opgwCables: OpgwCableFeature[];
  opgwRoutes: OpgwRouteFeature[];
  opgwCableSections: OpgwCableSectionFeature[];
  opgwSpanSegments: OpgwSpanSegmentFeature[];
  opgwSplicePoints: OpgwSplicePointFeature[];
  spliceClosures: SpliceClosureFeature[];
  fiberSplices: FiberSplice[];
  fiberStrands: FiberStrand[];
  fiberAssignments: FiberAssignment[];
  syntheticServices: SyntheticService[];
  distributionPoleDensity: DistributionPoleDensityFeature[];
  distributionPoles: DistributionPoleFeature[];
  distributionPoleFiberRoutes: DistributionPoleFiberRouteFeature[];
  distributionSplicePoints: DistributionPoleSplicePointFeature[];
  distributionSlackLoops: DistributionSlackLoopFeature[];
  distributionFiberAssignments: DistributionFiberAssignmentFeature[];
  patchPanels: PatchPanel[];
  designAssetRecords: DesignAssetRecord[];
  planningRegions: PlanningRegion[];
  layers: Record<StreetMapLayerKey, boolean>;
  gisApiBase: string;
  activeTool: MapDrawingTool;
  placementHint?: string;
  command: MapCommand | null;
  focusRequest: FocusRequest | null;
  continuityHighlight?: ContinuityHighlight;
  onMapClick: (coordinate: Coordinate) => void;
  onSelect: (selection: StreetMapSelection) => void;
  onStatusChange: (status: "loading" | "active" | "error", message?: string) => void;
};

const MapLibreStreetMap = dynamic(() => import("./MapLibreStreetMap").then((module) => module.MapLibreStreetMap), {
  ssr: false,
  loading: () => <div className="maplibre-loading">Loading MapLibre planning map...</div>,
});

export function StreetLevelAssetMap({
  activeMap,
  substations,
  nodes,
  transmissionLines,
  publicTransmissionLines,
  publicSubstations,
  fccUtilityTowers,
  fccMicrowaveLinks,
  syntheticSubstations,
  transmissionStructures,
  opgwCables,
  opgwRoutes,
  opgwCableSections,
  opgwSpanSegments,
  opgwSplicePoints,
  spliceClosures,
  fiberSplices,
  fiberStrands,
  fiberAssignments,
  syntheticServices,
  distributionPoleDensity,
  distributionPoles,
  distributionPoleFiberRoutes,
  distributionSplicePoints,
  distributionSlackLoops,
  distributionFiberAssignments,
  patchPanels,
  designAssetRecords,
  planningRegions,
  layers,
  gisApiBase,
  activeTool,
  placementHint,
  command,
  focusRequest,
  continuityHighlight,
  onMapClick,
  onSelect,
  onStatusChange,
}: StreetLevelAssetMapProps) {
  return (
    <section className="street-map-panel street-map-panel-fullscreen" aria-label="Street-level asset map">
      <div className={`street-map-canvas-shell tool-${activeTool}`}>
        <MapLibreStreetMap
          key={gisApiBase}
          activeMap={activeMap}
          substations={substations}
          nodes={nodes}
          transmissionLines={transmissionLines}
          publicTransmissionLines={publicTransmissionLines}
          publicSubstations={publicSubstations}
          fccUtilityTowers={fccUtilityTowers}
          fccMicrowaveLinks={fccMicrowaveLinks}
          syntheticSubstations={syntheticSubstations}
          transmissionStructures={transmissionStructures}
          opgwCables={opgwCables}
          opgwRoutes={opgwRoutes}
          opgwCableSections={opgwCableSections}
          opgwSpanSegments={opgwSpanSegments}
          opgwSplicePoints={opgwSplicePoints}
          spliceClosures={spliceClosures}
          fiberSplices={fiberSplices}
          fiberStrands={fiberStrands}
          fiberAssignments={fiberAssignments}
          syntheticServices={syntheticServices}
          distributionPoleDensity={distributionPoleDensity}
          distributionPoles={distributionPoles}
          distributionPoleFiberRoutes={distributionPoleFiberRoutes}
          distributionSplicePoints={distributionSplicePoints}
          distributionSlackLoops={distributionSlackLoops}
          distributionFiberAssignments={distributionFiberAssignments}
          patchPanels={patchPanels}
          designAssetRecords={designAssetRecords}
          planningRegions={planningRegions}
          layers={layers}
          gisApiBase={gisApiBase}
          activeTool={activeTool}
          command={command}
          focusRequest={focusRequest}
          continuityHighlight={continuityHighlight}
          onMapClick={onMapClick}
          onSelect={onSelect}
          onStatusChange={onStatusChange}
        />
        {activeTool !== "select" ? <div className="street-map-crosshair"><Crosshair size={18} /></div> : null}
        <div className="street-map-placement-hint">
          <MapPinned size={15} />
          <span>{placementHint || toolHint(activeTool)}</span>
        </div>
      </div>
    </section>
  );
}

function toolHint(activeTool: MapDrawingTool) {
  if (activeTool === "add_substation") return "Click the MapLibre street map to add a substation point.";
  if (activeTool === "add_device_node") return "Click the map to add the selected asset type.";
  if (activeTool === "add_fiber_node") return "Click the map to add a fiber node point.";
  if (activeTool === "place_missing") return "Click the map to place the selected missing-location asset.";
  if (activeTool === "draw_design_point") return "Click the map to place a schema-backed editable point record.";
  if (activeTool === "draw_design_line") return "Click the map to add line vertices, then finish and save in Design/Edit.";
  if (activeTool === "draw_design_polygon") return "Click the map to add polygon vertices, then finish and save in Design/Edit.";
  if (activeTool.startsWith("draw_") || activeTool.includes("geometry")) return "Click the map to stage geometry, then save it from the editor.";
  return "Pan, zoom, search, or click assets to inspect linked records.";
}
