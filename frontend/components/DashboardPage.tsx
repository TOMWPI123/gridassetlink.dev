"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, BookOpen, Cable, Database, ExternalLink, Filter, Gauge, Layers, LocateFixed, MapPin, Maximize2, Network, PanelRightClose, PanelRightOpen, PencilRuler, Plus, RadioTower, Route, Search, SlidersHorizontal, TableProperties, Upload, Workflow, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { appNavGroups } from "@/components/navigation";
import { dataSourceRecords, dataSourceSafetyNotes } from "@/data/dataSources";
import { seedMapNodes } from "@/data/nodeParameters";
import { seedEditableSubstations } from "@/data/substations";
import { seedPlanningRegions, seedTransmissionLines } from "@/data/transmissionLines";
import { seedTransmissionMaps } from "@/data/transmissionMaps";
import { traceSyntheticService } from "@/lib/opgw/continuityEngine";
import { findStrandContinuityRecord } from "@/lib/opgw/strandContinuity";
import { API_BASE, LOCAL_GIS_API_BASE, clearStoredGisApiBase, fetchFromApiBase, getStoredGisApiBase, normalizeApiBase, saveGisApiBase } from "@/lib/api";
import { buildSyntheticOpgwEngineeringModel } from "@/lib/opgw/spanModel";
import { publicTransmissionLineOwner } from "@/lib/map/public-owner";
import { LinkedAssetDetailPanel } from "@/components/map/LinkedAssetDetailPanel";
import { MapLayerControlPanel } from "@/components/map/MapLayerControlPanel";
import { MissingMapLocationPanel, type MissingMapLocation } from "@/components/map/MissingMapLocationPanel";
import { NodeParameterEditor } from "@/components/map/NodeParameterEditor";
import { StreetLevelAssetMap, type ContinuityHighlight, type FocusRequest, type MapCommand, type StreetMapSelection } from "@/components/map/StreetLevelAssetMap";
import { SubstationEditor } from "@/components/map/SubstationEditor";
import { TransmissionMapEditor } from "@/components/map/TransmissionMapEditor";
import type { Coordinate, DashboardMapMode, DesignAgentTool, DesignAgentToolRunResult, DesignAssetBlueprint, DesignAssetField, DesignAssetFieldType, DesignAssetGeoJsonGeometry, DesignAssetGeometryType, DesignAssetMapPayload, DesignAssetRecord, DesignAssetType, DesignBlueprintInstallResult, DesignIssuedWorkOrderResult, DesignMaterializationBatchResult, DesignMaterializationResult, DesignModuleBlueprint, DesignModuleEntity, DesignModuleSnapshotMaterializeResult, DesignModuleSnapshotResult, DesignRebuildAudit, DesignRebuildPackage, DesignRebuildPackageImportResult, DistributionFiberAssignmentCollection, DistributionFiberAssignmentFeature, DistributionPoleCollection, DistributionPoleDensityCollection, DistributionPoleDensityFeature, DistributionPoleFeature, DistributionPoleFiberRouteCollection, DistributionPoleFiberRouteFeature, DistributionPoleSplicePointCollection, DistributionPoleSplicePointFeature, DistributionSlackLoopCollection, DistributionSlackLoopFeature, FccMicrowaveLinkCollection, FccMicrowaveLinkFeature, FccUtilityTowerCollection, FccUtilityTowerFeature, FiberAssignment, FiberContinuityPath, FiberSplice, FiberStrand, GeoFeature, GeoFeatureCollection, MapDrawingTool, MapNode, NodeParameters, OpgwCableCollection, OpgwCableFeature, OpgwCableSectionFeature, OpgwRouteFeature, OpgwSpanSegmentFeature, OpgwSplicePointFeature, PatchPanel, PublicSubstationCollection, PublicSubstationFeature, PublicTransmissionLineCollection, PublicTransmissionLineFeature, SpliceClosureCollection, SpliceClosureFeature, StrandContinuityRecord, StreetMapLayerKey, Substation, SyntheticService, SyntheticSubstationFeature, TelecomCircuitProperties, TransmissionLine, TransmissionMap, TransmissionStructureCollection, TransmissionStructureFeature } from "@/lib/types/assets";

const MAP_EDITING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MAP_EDITING === "true";
const designFieldTypeOptions: DesignAssetFieldType[] = ["string", "textarea", "number", "integer", "boolean", "date", "enum", "json"];
const designGeometryTypeOptions: DesignAssetGeometryType[] = ["table_only", "point", "line", "polygon"];

const initialStreetLayers: Record<StreetMapLayerKey, boolean> = {
  publicTransmissionLines: true,
  publicSubstations: true,
  fccUtilityTowers: false,
  fccMicrowaveLinks: false,
  syntheticSubstations: false,
  transmissionStructures: false,
  syntheticOpgwCables: false,
  assumedOpgwRoutes: false,
  plannedOpgwFiber: false,
  verifiedOpgwFiber: false,
  opgwCableSections: false,
  opgwSpanSegments: false,
  opgwSplicePoints: false,
  existingFiberSplices: false,
  proposedFiberSplices: false,
  compareSpliceLayers: false,
  fiberStrandsLayer: false,
  spliceClosures: false,
  fiberAssignments: false,
  strandContinuity: false,
  patchPanels: false,
  availableStrandCapacity: false,
  criticalRidingCircuits: false,
  opgwOutageImpact: false,
  opgwOpenWorkOrders: false,
  opgwSpanInspectionIssues: false,
  transmissionLines: false,
  substations: false,
  telecomNodes: false,
  selIconNodes: false,
  c3794Nodes: false,
  fiberRoutes: false,
  opgwRoutes: false,
  distributionPoleDensity: false,
  distributionPoles: false,
  distributionFiberRoutes: false,
  distributionSplicePoints: false,
  distributionSlackLoops: false,
  distributionFiberAssignments: false,
  circuitEndpoints: false,
  workOrderLocations: false,
  proposedChanges: false,
  designAssets: false,
  missingLocationAssets: false,
  planningRegions: false,
  isoNeReferenceOverlays: false,
};

const LOAD_STATIC_DISTRIBUTION_POLE_SAMPLE = process.env.NEXT_PUBLIC_LOAD_STATIC_DISTRIBUTION_POLE_SAMPLE === "true";
const MAX_BROWSER_GEOJSON_PREVIEW_BYTES = 2 * 1024 * 1024;

const dashboardStreetLayers: Record<StreetMapLayerKey, boolean> = {
  ...initialStreetLayers,
  publicTransmissionLines: true,
  publicSubstations: true,
  fccUtilityTowers: false,
  fccMicrowaveLinks: false,
  transmissionStructures: false,
  assumedOpgwRoutes: false,
  plannedOpgwFiber: false,
  opgwCableSections: false,
  opgwSpanSegments: false,
  opgwSplicePoints: false,
  distributionPoleDensity: true,
  distributionPoles: true,
  distributionFiberRoutes: true,
  distributionSplicePoints: false,
  distributionSlackLoops: false,
  distributionFiberAssignments: false,
  existingFiberSplices: false,
  proposedFiberSplices: false,
  compareSpliceLayers: false,
  spliceClosures: false,
  strandContinuity: false,
  availableStrandCapacity: false,
  designAssets: MAP_EDITING_ENABLED,
};

const distributionNetworkLayerKeys: StreetMapLayerKey[] = [
  "distributionPoleDensity",
  "distributionPoles",
  "distributionFiberRoutes",
  "distributionSplicePoints",
  "distributionSlackLoops",
  "distributionFiberAssignments",
];

type MapStatus = "loading" | "active" | "error";
type RightDrawerMode = "modules" | "summary" | "filters" | "layers" | "scale" | "sources" | "details" | "strands" | "splices" | "assignments" | "editor" | "design" | "guide";
type AddAssetKind = "substation" | "transmission_line" | "telecom_node" | "sel_icon_node" | "fiber_node" | "circuit_endpoint" | "work_order" | "proposed_change";
type DashboardOperatingMode = "in_service" | "planned";
type DashboardLayerSummary = {
  key: StreetMapLayerKey;
  label: string;
  category: "Public reference" | "Synthetic OPGW Fiber" | "Planning assets" | "Analysis overlays";
  source: string;
  total: number;
  visible: number;
  enabled: boolean;
  moduleHref: string;
  safety: string;
};
type DashboardContinuitySummary = {
  label: string;
  filterLabel: string;
  serviceIds: string[];
  primaryServiceName: string;
  endpointA: string;
  endpointZ: string;
  pathStatus: FiberContinuityPath["pathStatus"] | "no_service";
  totalTransmissionLines: number;
  totalCableSections: number;
  totalSpanSegments: number;
  totalSplicePoints: number;
  totalPatchPanels: number;
  estimatedLossDb: number;
  criticality: string;
  protectionLevel: string;
  layerType: string;
  servicesCarried: number;
  warningSummary: string[];
  traceHref: string;
};
type StrandContinuityFocusOptions = {
  includeDevices?: boolean;
};
type CircuitRouteTarget = {
  service?: SyntheticService;
  assignments: FiberAssignment[];
  distributionAssignment?: DistributionFiberAssignmentFeature;
  legacyCircuit?: GeoFeature<TelecomCircuitProperties, "LineString">;
};
type DashboardMapDataGroup =
  | "publicReference"
  | "fccReference"
  | "syntheticServices"
  | "legacyTelecomCircuits"
  | "opgwTopology"
  | "fiberAssignments"
  | "fiberDetails"
  | "patchPanels"
  | "spliceContinuity"
  | "distributionFiberRoutes"
  | "distributionRouteDetails"
  | "distributionFiberAssignments"
  | "distributionPoleSample";

const availableDeviceIds = ["NODE-WBS-ICON", "NODE-AUB-ICON", "NODE-BOS-OTN", "NODE-RI-RTR", "NODE-NH-MW"];
const availableCircuitIds = ["87L-MA-WBS-AUB-001", "87L-MA-WBS-AUB-002", "DTT-MA-AUB-MIL-001", "SCADA-MA-BOS-RI-001", "DWDM-ME-BOS-001"];
const availableWorkOrderIds = ["WO-NE-2601", "WO-NE-2603", "WO-NE-2606", "WO-NE-2611"];
const newEnglandStates = new Set(["CT", "ME", "MA", "NH", "RI", "VT"]);

const addAssetOptions: Array<{ kind: AddAssetKind; label: string; note: string }> = [
  { kind: "substation", label: "Substation", note: "Point with electrical parameters" },
  { kind: "transmission_line", label: "Transmission line", note: "Line drawing staged for next pass" },
  { kind: "telecom_node", label: "Telecom node", note: "Router, switch, RTU, OTN shelf" },
  { kind: "sel_icon_node", label: "SEL ICON node", note: "ICON provisioning point" },
  { kind: "fiber_node", label: "Fiber node", note: "Splice, patch, OPGW, handhole" },
  { kind: "circuit_endpoint", label: "Circuit endpoint", note: "Protection or SCADA endpoint" },
  { kind: "work_order", label: "Work order", note: "Field task map marker" },
  { kind: "proposed_change", label: "Proposed change", note: "Private staged planning marker" },
];

type DatabaseGuideAssetType = {
  slug: string;
  display_name: string;
  description: string;
  geometry_type: DesignAssetGeometryType;
  fields: DesignAssetField[];
  searchable_fields: string[];
  map_style: Record<string, unknown>;
};

type DatabaseGuideRecord = {
  asset_type_slug: string;
  record_key: string;
  display_label: string;
  status: DesignAssetRecord["status"];
  properties: Record<string, unknown>;
  geometry?: DesignAssetGeoJsonGeometry | null;
  source: "synthetic_demo";
  visibility: "synthetic-demo";
  notes: string;
};

type DatabaseGuideWorkflow = {
  key: string;
  title: string;
  summary: string;
  steps: string[];
  edits: string[];
  records: DatabaseGuideRecord[];
};

type DatabaseGuideCoverageArea = {
  title: string;
  summary: string;
  moduleHref: string;
  recordTypes: string[];
  workflowKeys: string[];
  checks: string[];
};

const databaseGuideCoverageAreas: DatabaseGuideCoverageArea[] = [
  {
    title: "Substations, LIUs, and patch panels",
    summary: "Start every end-to-end design with the site, rack, LIU, patch panel, and termination records that anchor all fiber and device work.",
    moduleHref: "/substations",
    recordTypes: ["guide-substation-site", "guide-liu-patch-panel", "guide-device-endpoint"],
    workflowKeys: ["substation-device-inventory", "liu-to-liu-service"],
    checks: ["site ID exists", "LIU ports captured", "device endpoint linked", "synthetic/demo boundary noted"],
  },
  {
    title: "Distribution poles and spans",
    summary: "Use point records for poles/supports and line records for cable spans; track slack, entering cable IDs, and the span endpoints.",
    moduleHref: "/distribution-fiber",
    recordTypes: ["guide-distribution-pole", "guide-fiber-span"],
    workflowKeys: ["pole-fiber-attachment", "span-fiber-route"],
    checks: ["pole has cable IDs", "span has A/Z structure IDs", "fiber count populated", "slack loop noted"],
  },
  {
    title: "Strands, services, and continuity",
    summary: "Reserve or assign strand rows, link services to devices and LIUs, then validate continuity before issuing field work.",
    moduleHref: "/fiber-strand-table",
    recordTypes: ["guide-fiber-strand", "guide-service-assignment"],
    workflowKeys: ["strand-reservation", "liu-to-liu-service"],
    checks: ["strand status not available when reserved", "assignment links cable IDs", "splice IDs attached", "loss estimate captured"],
  },
  {
    title: "Splicing and resplicing",
    summary: "Keep existing splice rows and proposed splice rows side by side so planned resplicing never overwrites existing continuity.",
    moduleHref: "/splice-matrix",
    recordTypes: ["guide-splice-work", "guide-service-assignment"],
    workflowKeys: ["resplice-service", "liu-to-liu-service"],
    checks: ["existing rows preserved", "proposed rows separated", "affected service IDs linked", "work order required"],
  },
  {
    title: "Work orders, evidence, and closeout",
    summary: "Turn design records into field work, track tasks and required evidence, and only mark records as as-built after engineering review.",
    moduleHref: "/work-orders",
    recordTypes: ["guide-work-package"],
    workflowKeys: ["work-package-closeout"],
    checks: ["linked record keys listed", "tasks defined", "evidence required", "closeout gate documented"],
  },
  {
    title: "Import, rebuild, and materialization",
    summary: "Use Design Mode blueprints to import/edit records, capture module snapshots, replay to a blank instance, and materialize reviewed demo records.",
    moduleHref: "/import-export",
    recordTypes: ["guide-import-package"],
    workflowKeys: ["import-rebuild-materialize"],
    checks: ["source recorded", "validation status captured", "materialize mode chosen", "sensitive-data warning retained"],
  },
];

const databaseGuideAssetTypes: DatabaseGuideAssetType[] = [
  {
    slug: "guide-substation-site",
    display_name: "Guide substation site",
    description: "Synthetic substation/site anchor record for tying LIUs, patch panels, endpoint devices, and services together.",
    geometry_type: "point",
    searchable_fields: ["substation_id", "substation_name", "state", "owner"],
    map_style: { color: "#60a5fa", radius: 9, fillOpacity: 0.26 },
    fields: [
      { name: "substation_id", label: "Substation ID", type: "string", required: true },
      { name: "substation_name", label: "Substation name", type: "string", required: true },
      { name: "state", label: "State", type: "enum", enum_options: ["CT", "ME", "MA", "NH", "RI", "VT"], required: true },
      { name: "owner", label: "Owner", type: "string" },
      { name: "liu_ids", label: "LIU IDs", type: "json" },
      { name: "device_ids", label: "Device IDs", type: "json" },
      { name: "patch_panel_ids", label: "Patch panel IDs", type: "json" },
      { name: "status", label: "Status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-distribution-pole",
    display_name: "Guide distribution pole",
    description: "Synthetic design guide record for adding fiber attachments to a distribution pole.",
    geometry_type: "point",
    searchable_fields: ["pole_id", "pole_number", "road_name", "attachment_status"],
    map_style: { color: "#38bdf8", radius: 8, fillOpacity: 0.32 },
    fields: [
      { name: "pole_id", label: "Pole ID", type: "string", required: true },
      { name: "pole_number", label: "Pole number", type: "string", required: true },
      { name: "owner", label: "Owner", type: "string" },
      { name: "road_name", label: "Road name", type: "string" },
      { name: "attachment_status", label: "Attachment status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
      { name: "fiber_cable_ids", label: "Fiber cable IDs", type: "json" },
      { name: "span_ids", label: "Span IDs", type: "json" },
      { name: "slack_loop_ft", label: "Slack loop feet", type: "number" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-fiber-span",
    display_name: "Guide fiber span",
    description: "Synthetic line record for adding aerial, underground, ADSS, or OPGW fiber spans.",
    geometry_type: "line",
    searchable_fields: ["span_id", "cable_id", "from_structure_id", "to_structure_id"],
    map_style: { color: "#22c55e", lineWidth: 4, dashArray: [2, 2] },
    fields: [
      { name: "span_id", label: "Span ID", type: "string", required: true },
      { name: "cable_id", label: "Cable ID", type: "string", required: true },
      { name: "from_structure_id", label: "From structure ID", type: "string", required: true },
      { name: "to_structure_id", label: "To structure ID", type: "string", required: true },
      { name: "fiber_count", label: "Fiber count", type: "integer", required: true },
      { name: "cable_type", label: "Cable type", type: "enum", enum_options: ["ADSS", "OPGW", "underground", "building_lateral"], required: true },
      { name: "strand_range", label: "Strand range", type: "string" },
      { name: "construction_status", label: "Construction status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
      { name: "slack_loop_ids", label: "Slack loop IDs", type: "json" },
      { name: "splice_ids", label: "Splice IDs", type: "json" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-splice-work",
    display_name: "Guide splice work",
    description: "Synthetic splice or resplice work record with existing and proposed splice matrix rows.",
    geometry_type: "point",
    searchable_fields: ["splice_id", "work_type", "closure_type", "status"],
    map_style: { color: "#f59e0b", radius: 9, fillOpacity: 0.36 },
    fields: [
      { name: "splice_id", label: "Splice ID", type: "string", required: true },
      { name: "closure_type", label: "Closure type", type: "enum", enum_options: ["aerial", "handhole", "patch_panel_terminal", "liu_terminal", "resplice"], required: true },
      { name: "work_type", label: "Work type", type: "enum", enum_options: ["new_splice", "resplice", "express", "branch", "repair"], required: true },
      { name: "existing_rows", label: "Existing splice rows", type: "json" },
      { name: "proposed_rows", label: "Proposed splice rows", type: "json" },
      { name: "affected_service_ids", label: "Affected service IDs", type: "json" },
      { name: "status", label: "Status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-liu-patch-panel",
    display_name: "Guide LIU or patch panel",
    description: "Synthetic LIU/patch-panel record for substation terminations and port assignments.",
    geometry_type: "table_only",
    searchable_fields: ["liu_id", "substation_id", "panel_name", "rack"],
    map_style: {},
    fields: [
      { name: "liu_id", label: "LIU ID", type: "string", required: true },
      { name: "substation_id", label: "Substation ID", type: "string", required: true },
      { name: "rack", label: "Rack", type: "string" },
      { name: "panel_name", label: "Panel name", type: "string", required: true },
      { name: "port_count", label: "Port count", type: "integer", required: true },
      { name: "connector_type", label: "Connector type", type: "enum", enum_options: ["LC", "SC", "ST", "FC", "Unknown"], required: true },
      { name: "cable_ids", label: "Cable IDs", type: "json" },
      { name: "port_assignments", label: "Port assignments", type: "json" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-device-endpoint",
    display_name: "Guide device endpoint",
    description: "Synthetic device endpoint record for service assignment at a substation.",
    geometry_type: "table_only",
    searchable_fields: ["device_id", "device_name", "device_type", "substation_id"],
    map_style: {},
    fields: [
      { name: "device_id", label: "Device ID", type: "string", required: true },
      { name: "device_name", label: "Device name", type: "string", required: true },
      { name: "device_type", label: "Device type", type: "enum", enum_options: ["SEL_ICON", "relay", "RTU", "router", "switch", "NID", "other"], required: true },
      { name: "substation_id", label: "Substation ID", type: "string", required: true },
      { name: "rack", label: "Rack", type: "string" },
      { name: "service_ports", label: "Service ports", type: "json" },
      { name: "connected_liu_id", label: "Connected LIU ID", type: "string" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-service-assignment",
    display_name: "Guide service assignment",
    description: "Synthetic circuit/service assignment record tying devices, LIUs, strands, and splices together.",
    geometry_type: "table_only",
    searchable_fields: ["service_id", "service_type", "a_end_device", "z_end_device", "status"],
    map_style: {},
    fields: [
      { name: "service_id", label: "Service ID", type: "string", required: true },
      { name: "service_type", label: "Service type", type: "enum", enum_options: ["SEL_ICON", "C37_94", "Ethernet", "SCADA", "Protection", "DTT", "Leased", "Spare", "Other"], required: true },
      { name: "a_end_device", label: "A-end device", type: "string" },
      { name: "z_end_device", label: "Z-end device", type: "string" },
      { name: "a_end_port", label: "A-end port", type: "string" },
      { name: "z_end_port", label: "Z-end port", type: "string" },
      { name: "a_end_liu", label: "A-end LIU", type: "string" },
      { name: "z_end_liu", label: "Z-end LIU", type: "string" },
      { name: "cable_ids", label: "Cable IDs", type: "json" },
      { name: "strand_numbers", label: "Strand numbers", type: "json" },
      { name: "splice_ids", label: "Splice IDs", type: "json" },
      { name: "status", label: "Status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
      { name: "continuity_summary", label: "Continuity summary", type: "textarea" },
      { name: "loss_estimate_db", label: "Loss estimate dB", type: "number" },
    ],
  },
  {
    slug: "guide-fiber-strand",
    display_name: "Guide fiber strand",
    description: "Synthetic individual strand row used to reserve, assign, retire, or validate continuity on a cable.",
    geometry_type: "table_only",
    searchable_fields: ["strand_key", "cable_id", "status", "assignment_id"],
    map_style: {},
    fields: [
      { name: "strand_key", label: "Strand key", type: "string", required: true },
      { name: "cable_id", label: "Cable ID", type: "string", required: true },
      { name: "strand_number", label: "Strand number", type: "integer", required: true },
      { name: "tube_number", label: "Tube number", type: "integer" },
      { name: "color", label: "Color", type: "string" },
      { name: "status", label: "Status", type: "enum", enum_options: ["available", "reserved", "assigned", "spare", "faulted", "retired"], required: true },
      { name: "assignment_id", label: "Assignment ID", type: "string" },
      { name: "a_end_termination", label: "A-end termination", type: "string" },
      { name: "z_end_termination", label: "Z-end termination", type: "string" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-work-package",
    display_name: "Guide work package",
    description: "Synthetic work package record for planning field tasks, evidence, closeout, and engineering review.",
    geometry_type: "table_only",
    searchable_fields: ["work_order_key", "work_type", "status"],
    map_style: {},
    fields: [
      { name: "work_order_key", label: "Work order key", type: "string", required: true },
      { name: "work_type", label: "Work type", type: "enum", enum_options: ["fiber_install", "splice_work", "device_install", "field_verify", "closeout_review"], required: true },
      { name: "linked_records", label: "Linked records", type: "json" },
      { name: "required_tasks", label: "Required tasks", type: "json" },
      { name: "evidence_requirements", label: "Evidence requirements", type: "json" },
      { name: "status", label: "Status", type: "enum", enum_options: ["planned", "issued", "field_complete", "engineering_review", "as_built"], required: true },
      { name: "closeout_notes", label: "Closeout notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-import-package",
    display_name: "Guide import package",
    description: "Synthetic import/rebuild planning record for tracking source, validation, blueprint, and materialization actions.",
    geometry_type: "table_only",
    searchable_fields: ["import_id", "source_type", "validation_status", "materialize_mode"],
    map_style: {},
    fields: [
      { name: "import_id", label: "Import ID", type: "string", required: true },
      { name: "source_type", label: "Source type", type: "enum", enum_options: ["manual_CSV", "GeoJSON", "Shapefile", "Design_Mode_blueprint", "module_snapshot", "other"], required: true },
      { name: "source_name", label: "Source name", type: "string" },
      { name: "record_counts", label: "Record counts", type: "json" },
      { name: "validation_status", label: "Validation status", type: "enum", enum_options: ["not_validated", "valid", "warning", "invalid"], required: true },
      { name: "materialize_mode", label: "Materialize mode", type: "enum", enum_options: ["design_only", "upsert", "skip_existing"], required: true },
      { name: "review_notes", label: "Review notes", type: "textarea" },
    ],
  },
];

const databaseGuideWorkflows: DatabaseGuideWorkflow[] = [
  {
    key: "pole-fiber-attachment",
    title: "Add fiber to a pole",
    summary: "Creates a pole attachment record, the entering fiber span, and a reserved spare-fiber assignment that can become a service later.",
    steps: [
      "Create or select the pole/support structure.",
      "Attach the cable ID and span IDs to the pole record.",
      "Create the line span geometry into the pole.",
      "Reserve strand numbers or a spare buffer for future service.",
      "Issue a work order if field make-ready, slack, or tagging is needed.",
    ],
    edits: [
      "Upsert guide-distribution-pole record GUIDE-POLE-FIBER-P001.",
      "Upsert guide-fiber-span record GUIDE-SPAN-FIBER-P000-P001.",
      "Upsert guide-service-assignment record GUIDE-SPARE-POLE-P001.",
    ],
    records: [
      {
        asset_type_slug: "guide-distribution-pole",
        record_key: "GUIDE-POLE-FIBER-P001",
        display_label: "Guide pole fiber attachment P001",
        status: "planned",
        geometry: { type: "Point", coordinates: [-71.8028, 42.2637] },
        properties: {
          pole_id: "P001",
          pole_number: "P-001",
          owner: "Synthetic Demo Utility",
          road_name: "Guide Road",
          attachment_status: "planned",
          fiber_cable_ids: ["GUIDE-ADSS-24F-001"],
          span_ids: ["GUIDE-SPAN-FIBER-P000-P001"],
          slack_loop_ft: 100,
          notes: "Synthetic guide edit: add ADSS fiber and slack to this pole.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-fiber-span",
        record_key: "GUIDE-SPAN-FIBER-P000-P001",
        display_label: "Guide ADSS span into pole P001",
        status: "planned",
        geometry: { type: "LineString", coordinates: [[-71.8065, 42.2625], [-71.8028, 42.2637]] },
        properties: {
          span_id: "GUIDE-SPAN-FIBER-P000-P001",
          cable_id: "GUIDE-ADSS-24F-001",
          from_structure_id: "P000",
          to_structure_id: "P001",
          fiber_count: 24,
          cable_type: "ADSS",
          strand_range: "1-24",
          construction_status: "planned",
          slack_loop_ids: ["GUIDE-SLACK-P001"],
          splice_ids: [],
          notes: "Synthetic span feeding a pole attachment guide example.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-service-assignment",
        record_key: "GUIDE-SPARE-POLE-P001",
        display_label: "Guide reserved spare strands at pole P001",
        status: "planned",
        geometry: null,
        properties: {
          service_id: "SPARE-GUIDE-P001",
          service_type: "Spare",
          a_end_device: "",
          z_end_device: "",
          a_end_port: "",
          z_end_port: "",
          a_end_liu: "",
          z_end_liu: "",
          cable_ids: ["GUIDE-ADSS-24F-001"],
          strand_numbers: [1, 2],
          splice_ids: [],
          status: "planned",
          continuity_summary: "Reserved spare pair staged at pole P001 for future service.",
          loss_estimate_db: 0.9,
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "span-fiber-route",
    title: "Add fiber to a span",
    summary: "Creates both support structures, a span line, and the cable/strand details needed for route planning.",
    steps: [
      "Create or select the A-end and Z-end poles or structures.",
      "Create a fiber span line between the structures.",
      "Set cable type, fiber count, strand range, and status.",
      "Add slack-loop and splice references if either end terminates or branches.",
      "Validate that planned strands are not double-booked before materializing.",
    ],
    edits: [
      "Upsert guide-distribution-pole records GUIDE-POLE-SPAN-A and GUIDE-POLE-SPAN-Z.",
      "Upsert guide-fiber-span record GUIDE-SPAN-P010-P011.",
      "Upsert guide-service-assignment record GUIDE-RESERVE-SPAN-P010-P011.",
    ],
    records: [
      {
        asset_type_slug: "guide-distribution-pole",
        record_key: "GUIDE-POLE-SPAN-A",
        display_label: "Guide span A-end pole P010",
        status: "planned",
        geometry: { type: "Point", coordinates: [-71.8152, 42.2724] },
        properties: {
          pole_id: "P010",
          pole_number: "P-010",
          owner: "Synthetic Demo Utility",
          road_name: "Span Road",
          attachment_status: "planned",
          fiber_cable_ids: ["GUIDE-ADSS-48F-010"],
          span_ids: ["GUIDE-SPAN-P010-P011"],
          slack_loop_ft: 50,
          notes: "A-end support for span guide example.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-distribution-pole",
        record_key: "GUIDE-POLE-SPAN-Z",
        display_label: "Guide span Z-end pole P011",
        status: "planned",
        geometry: { type: "Point", coordinates: [-71.8104, 42.2749] },
        properties: {
          pole_id: "P011",
          pole_number: "P-011",
          owner: "Synthetic Demo Utility",
          road_name: "Span Road",
          attachment_status: "planned",
          fiber_cable_ids: ["GUIDE-ADSS-48F-010"],
          span_ids: ["GUIDE-SPAN-P010-P011"],
          slack_loop_ft: 50,
          notes: "Z-end support for span guide example.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-fiber-span",
        record_key: "GUIDE-SPAN-P010-P011",
        display_label: "Guide 48F ADSS span P010 to P011",
        status: "planned",
        geometry: { type: "LineString", coordinates: [[-71.8152, 42.2724], [-71.8127, 42.2739], [-71.8104, 42.2749]] },
        properties: {
          span_id: "GUIDE-SPAN-P010-P011",
          cable_id: "GUIDE-ADSS-48F-010",
          from_structure_id: "P010",
          to_structure_id: "P011",
          fiber_count: 48,
          cable_type: "ADSS",
          strand_range: "1-48",
          construction_status: "planned",
          slack_loop_ids: ["GUIDE-SLACK-P010", "GUIDE-SLACK-P011"],
          splice_ids: ["GUIDE-SPLICE-P011"],
          notes: "Synthetic guide span with slack at both ends and a planned splice at P011.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-service-assignment",
        record_key: "GUIDE-RESERVE-SPAN-P010-P011",
        display_label: "Guide reserved pair on span P010 to P011",
        status: "planned",
        geometry: null,
        properties: {
          service_id: "RESERVE-GUIDE-P010-P011",
          service_type: "Spare",
          a_end_device: "",
          z_end_device: "",
          a_end_port: "",
          z_end_port: "",
          a_end_liu: "",
          z_end_liu: "",
          cable_ids: ["GUIDE-ADSS-48F-010"],
          strand_numbers: [7, 8],
          splice_ids: ["GUIDE-SPLICE-P011"],
          status: "planned",
          continuity_summary: "Reserved pair on the newly designed 48F span.",
          loss_estimate_db: 1.2,
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "resplice-service",
    title: "Resplice an existing service",
    summary: "Creates a resplice work point and proposed splice matrix edits that move a service from one strand pair to another.",
    steps: [
      "Select the splice closure or LIU where the change happens.",
      "Capture existing splice rows before editing.",
      "Create proposed splice rows with from-cable, from-strand, to-cable, and to-strand.",
      "Link affected services and strands to the resplice work record.",
      "Issue a work order and keep the proposed rows separate until closeout.",
    ],
    edits: [
      "Upsert guide-splice-work record GUIDE-RESPLICE-SC-014.",
      "Upsert guide-service-assignment record GUIDE-SCADA-RESPLICE-014.",
    ],
    records: [
      {
        asset_type_slug: "guide-splice-work",
        record_key: "GUIDE-RESPLICE-SC-014",
        display_label: "Guide resplice SC-014",
        status: "in_review",
        geometry: { type: "Point", coordinates: [-71.7951, 42.2766] },
        properties: {
          splice_id: "GUIDE-SC-014",
          closure_type: "resplice",
          work_type: "resplice",
          existing_rows: [
            { from_cable: "GUIDE-ADSS-48F-010", from_strand: 7, to_cable: "GUIDE-ADSS-48F-011", to_strand: 7, splice_type: "straight_through" },
            { from_cable: "GUIDE-ADSS-48F-010", from_strand: 8, to_cable: "GUIDE-ADSS-48F-011", to_strand: 8, splice_type: "straight_through" },
          ],
          proposed_rows: [
            { from_cable: "GUIDE-ADSS-48F-010", from_strand: 9, to_cable: "GUIDE-ADSS-48F-011", to_strand: 9, splice_type: "straight_through" },
            { from_cable: "GUIDE-ADSS-48F-010", from_strand: 10, to_cable: "GUIDE-ADSS-48F-011", to_strand: 10, splice_type: "straight_through" },
          ],
          affected_service_ids: ["SCADA-GUIDE-014"],
          status: "in_review",
          notes: "Synthetic guide resplice: move SCADA service from strands 7-8 to 9-10.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-service-assignment",
        record_key: "GUIDE-SCADA-RESPLICE-014",
        display_label: "Guide SCADA service proposed resplice",
        status: "in_review",
        geometry: null,
        properties: {
          service_id: "SCADA-GUIDE-014",
          service_type: "SCADA",
          a_end_device: "WOR-RTU-GUIDE-01",
          z_end_device: "FRA-SW-GUIDE-01",
          a_end_port: "Eth1",
          z_end_port: "Gi0/12",
          a_end_liu: "WOR-LIU-GUIDE-01",
          z_end_liu: "FRA-LIU-GUIDE-01",
          cable_ids: ["GUIDE-ADSS-48F-010", "GUIDE-ADSS-48F-011"],
          strand_numbers: [9, 10],
          splice_ids: ["GUIDE-SC-014"],
          status: "in_review",
          continuity_summary: "Proposed resplice preserves SCADA service continuity on replacement strands 9-10.",
          loss_estimate_db: 1.7,
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "liu-to-liu-service",
    title: "Assign service from LIU to LIU",
    summary: "Creates endpoint devices, LIU panels, terminal splice records, and a complete service assignment between substations.",
    steps: [
      "Create LIU records at both substations with panel, port count, and cable IDs.",
      "Create endpoint devices and record their service ports.",
      "Add terminal splice records at both LIUs.",
      "Create the service assignment with devices, ports, LIUs, cable IDs, strand numbers, and splice IDs.",
      "Validate continuity and estimated loss, then issue work for field verification.",
    ],
    edits: [
      "Upsert guide-liu-patch-panel records GUIDE-WBS-LIU-01 and GUIDE-AUB-LIU-01.",
      "Upsert guide-device-endpoint records GUIDE-WBS-ICON-01 and GUIDE-AUB-SEL411L-01.",
      "Upsert guide-splice-work terminal records GUIDE-WBS-LIU-SPLICE and GUIDE-AUB-LIU-SPLICE.",
      "Upsert guide-service-assignment record GUIDE-87L-WBS-AUB-101.",
    ],
    records: [
      {
        asset_type_slug: "guide-liu-patch-panel",
        record_key: "GUIDE-WBS-LIU-01",
        display_label: "Guide Webster LIU 01",
        status: "planned",
        geometry: null,
        properties: {
          liu_id: "WBS-LIU-GUIDE-01",
          substation_id: "MA-WBS",
          rack: "TELCO-R1",
          panel_name: "WBS LIU Panel 01",
          port_count: 48,
          connector_type: "LC",
          cable_ids: ["GUIDE-OPGW-WBS-AUB-48F"],
          port_assignments: [{ ports: "1-2", service_id: "87L-GUIDE-WBS-AUB-101", strands: [1, 2] }],
          notes: "Synthetic LIU endpoint for guide service assignment.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-liu-patch-panel",
        record_key: "GUIDE-AUB-LIU-01",
        display_label: "Guide Auburn LIU 01",
        status: "planned",
        geometry: null,
        properties: {
          liu_id: "AUB-LIU-GUIDE-01",
          substation_id: "MA-AUB",
          rack: "TELCO-R2",
          panel_name: "AUB LIU Panel 01",
          port_count: 48,
          connector_type: "LC",
          cable_ids: ["GUIDE-OPGW-WBS-AUB-48F"],
          port_assignments: [{ ports: "1-2", service_id: "87L-GUIDE-WBS-AUB-101", strands: [1, 2] }],
          notes: "Synthetic LIU endpoint for guide service assignment.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-device-endpoint",
        record_key: "GUIDE-WBS-ICON-01",
        display_label: "Guide WBS ICON endpoint",
        status: "planned",
        geometry: null,
        properties: {
          device_id: "WBS-ICON-GUIDE-01",
          device_name: "WBS ICON Guide 01",
          device_type: "SEL_ICON",
          substation_id: "MA-WBS",
          rack: "TELCO-R1",
          service_ports: [{ port: "C37.94-1", liu_port: "WBS-LIU-GUIDE-01/1-2", service_id: "87L-GUIDE-WBS-AUB-101" }],
          connected_liu_id: "WBS-LIU-GUIDE-01",
          notes: "Synthetic endpoint device for guide 87L service.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-device-endpoint",
        record_key: "GUIDE-AUB-SEL411L-01",
        display_label: "Guide AUB SEL-411L endpoint",
        status: "planned",
        geometry: null,
        properties: {
          device_id: "AUB-SEL411L-GUIDE-01",
          device_name: "AUB SEL-411L Guide 01",
          device_type: "relay",
          substation_id: "MA-AUB",
          rack: "PROT-R1",
          service_ports: [{ port: "C37.94-1", liu_port: "AUB-LIU-GUIDE-01/1-2", service_id: "87L-GUIDE-WBS-AUB-101" }],
          connected_liu_id: "AUB-LIU-GUIDE-01",
          notes: "Synthetic relay endpoint for guide 87L service.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-splice-work",
        record_key: "GUIDE-WBS-LIU-SPLICE",
        display_label: "Guide WBS terminal LIU splice",
        status: "planned",
        geometry: { type: "Point", coordinates: [-71.8215, 42.2595] },
        properties: {
          splice_id: "GUIDE-WBS-LIU-SPLICE",
          closure_type: "liu_terminal",
          work_type: "new_splice",
          existing_rows: [],
          proposed_rows: [
            { from_cable: "GUIDE-OPGW-WBS-AUB-48F", from_strand: 1, to_cable: "WBS-LIU-GUIDE-01", to_strand: 1, splice_type: "terminal" },
            { from_cable: "GUIDE-OPGW-WBS-AUB-48F", from_strand: 2, to_cable: "WBS-LIU-GUIDE-01", to_strand: 2, splice_type: "terminal" },
          ],
          affected_service_ids: ["87L-GUIDE-WBS-AUB-101"],
          status: "planned",
          notes: "Synthetic terminal splice at WBS LIU.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-splice-work",
        record_key: "GUIDE-AUB-LIU-SPLICE",
        display_label: "Guide AUB terminal LIU splice",
        status: "planned",
        geometry: { type: "Point", coordinates: [-71.8391, 42.2479] },
        properties: {
          splice_id: "GUIDE-AUB-LIU-SPLICE",
          closure_type: "liu_terminal",
          work_type: "new_splice",
          existing_rows: [],
          proposed_rows: [
            { from_cable: "GUIDE-OPGW-WBS-AUB-48F", from_strand: 1, to_cable: "AUB-LIU-GUIDE-01", to_strand: 1, splice_type: "terminal" },
            { from_cable: "GUIDE-OPGW-WBS-AUB-48F", from_strand: 2, to_cable: "AUB-LIU-GUIDE-01", to_strand: 2, splice_type: "terminal" },
          ],
          affected_service_ids: ["87L-GUIDE-WBS-AUB-101"],
          status: "planned",
          notes: "Synthetic terminal splice at AUB LIU.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-service-assignment",
        record_key: "GUIDE-87L-WBS-AUB-101",
        display_label: "Guide 87L WBS to AUB fiber assignment",
        status: "planned",
        geometry: null,
        properties: {
          service_id: "87L-GUIDE-WBS-AUB-101",
          service_type: "C37_94",
          a_end_device: "WBS-ICON-GUIDE-01",
          z_end_device: "AUB-SEL411L-GUIDE-01",
          a_end_port: "C37.94-1",
          z_end_port: "C37.94-1",
          a_end_liu: "WBS-LIU-GUIDE-01/1-2",
          z_end_liu: "AUB-LIU-GUIDE-01/1-2",
          cable_ids: ["GUIDE-OPGW-WBS-AUB-48F"],
          strand_numbers: [1, 2],
          splice_ids: ["GUIDE-WBS-LIU-SPLICE", "GUIDE-AUB-LIU-SPLICE"],
          status: "planned",
          continuity_summary: "Synthetic 87L service from WBS LIU to AUB LIU with devices on both ends.",
          loss_estimate_db: 2.1,
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "substation-device-inventory",
    title: "Build substation and device inventory",
    summary: "Creates a synthetic substation anchor, LIU, endpoint device, and device-to-LIU port relationship before fiber is assigned.",
    steps: [
      "Create the substation/site anchor record with owner, state, LIU IDs, and device IDs.",
      "Create or update the LIU/patch panel record for the site.",
      "Create the endpoint device record and list device service ports.",
      "Link the device port to the LIU port where the jumper terminates.",
      "Use this inventory as the A-end or Z-end for future circuit/service assignments.",
    ],
    edits: [
      "Upsert guide-substation-site record GUIDE-SUB-WBS-01.",
      "Upsert guide-liu-patch-panel record GUIDE-WBS-LIU-INVENTORY-01.",
      "Upsert guide-device-endpoint record GUIDE-WBS-SW-INVENTORY-01.",
    ],
    records: [
      {
        asset_type_slug: "guide-substation-site",
        record_key: "GUIDE-SUB-WBS-01",
        display_label: "Guide Webster substation inventory",
        status: "planned",
        geometry: { type: "Point", coordinates: [-71.8215, 42.2595] },
        properties: {
          substation_id: "MA-WBS-GUIDE",
          substation_name: "Webster Guide Substation",
          state: "MA",
          owner: "Synthetic Demo Utility",
          liu_ids: ["WBS-LIU-INVENTORY-01"],
          device_ids: ["WBS-SW-INVENTORY-01"],
          patch_panel_ids: ["WBS-LIU-INVENTORY-01"],
          status: "planned",
          notes: "Synthetic site anchor for guide inventory examples.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-liu-patch-panel",
        record_key: "GUIDE-WBS-LIU-INVENTORY-01",
        display_label: "Guide Webster inventory LIU",
        status: "planned",
        geometry: null,
        properties: {
          liu_id: "WBS-LIU-INVENTORY-01",
          substation_id: "MA-WBS-GUIDE",
          rack: "TELCO-R3",
          panel_name: "Guide LIU Inventory Panel",
          port_count: 24,
          connector_type: "LC",
          cable_ids: ["GUIDE-ADSS-24F-INVENTORY"],
          port_assignments: [{ ports: "3-4", device_id: "WBS-SW-INVENTORY-01", device_port: "Gi0/24", status: "planned" }],
          notes: "Synthetic LIU record connected to an endpoint device.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
      {
        asset_type_slug: "guide-device-endpoint",
        record_key: "GUIDE-WBS-SW-INVENTORY-01",
        display_label: "Guide Webster switch inventory endpoint",
        status: "planned",
        geometry: null,
        properties: {
          device_id: "WBS-SW-INVENTORY-01",
          device_name: "WBS Guide Switch 01",
          device_type: "switch",
          substation_id: "MA-WBS-GUIDE",
          rack: "TELCO-R3",
          service_ports: [{ port: "Gi0/24", liu_port: "WBS-LIU-INVENTORY-01/3-4", service_id: "future" }],
          connected_liu_id: "WBS-LIU-INVENTORY-01",
          notes: "Synthetic endpoint device for guide inventory.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "strand-reservation",
    title: "Reserve strands and patch-panel ports",
    summary: "Creates individual strand rows, marks a pair reserved, and links the reservation to LIU terminations and a future service assignment.",
    steps: [
      "Create individual strand records for the cable section or LIU-fed cable.",
      "Set reserved or assigned status before using the strands in a service.",
      "Capture A-end and Z-end terminations for each strand.",
      "Create a service assignment that references the reserved strand numbers.",
      "Release or update the strand rows if the design changes before field work.",
    ],
    edits: [
      "Upsert guide-fiber-strand records GUIDE-STRAND-001 through GUIDE-STRAND-004.",
      "Upsert guide-service-assignment record GUIDE-FUTURE-ETH-STRANDS-001.",
    ],
    records: [
      ...[1, 2, 3, 4].map((strandNumber): DatabaseGuideRecord => ({
        asset_type_slug: "guide-fiber-strand",
        record_key: `GUIDE-STRAND-${String(strandNumber).padStart(3, "0")}`,
        display_label: `Guide reserved strand ${strandNumber}`,
        status: "planned",
        geometry: null,
        properties: {
          strand_key: `GUIDE-STRAND-${String(strandNumber).padStart(3, "0")}`,
          cable_id: "GUIDE-ADSS-24F-INVENTORY",
          strand_number: strandNumber,
          tube_number: 1,
          color: ["Blue", "Orange", "Green", "Brown"][strandNumber - 1],
          status: strandNumber <= 2 ? "reserved" : "available",
          assignment_id: strandNumber <= 2 ? "ETH-GUIDE-FUTURE-001" : "",
          a_end_termination: strandNumber <= 2 ? `WBS-LIU-INVENTORY-01/${strandNumber}` : "",
          z_end_termination: strandNumber <= 2 ? `AUB-LIU-INVENTORY-01/${strandNumber}` : "",
          notes: strandNumber <= 2 ? "Synthetic reserved strand for future Ethernet service." : "Synthetic available spare strand.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      })),
      {
        asset_type_slug: "guide-service-assignment",
        record_key: "GUIDE-FUTURE-ETH-STRANDS-001",
        display_label: "Guide future Ethernet strand reservation",
        status: "planned",
        geometry: null,
        properties: {
          service_id: "ETH-GUIDE-FUTURE-001",
          service_type: "Ethernet",
          a_end_device: "WBS-SW-INVENTORY-01",
          z_end_device: "AUB-SW-INVENTORY-01",
          a_end_port: "Gi0/24",
          z_end_port: "Gi0/24",
          a_end_liu: "WBS-LIU-INVENTORY-01/1-2",
          z_end_liu: "AUB-LIU-INVENTORY-01/1-2",
          cable_ids: ["GUIDE-ADSS-24F-INVENTORY"],
          strand_numbers: [1, 2],
          splice_ids: [],
          status: "planned",
          continuity_summary: "Synthetic reserved strand pair for a future Ethernet service.",
          loss_estimate_db: 1.1,
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "work-package-closeout",
    title: "Create work package and closeout checklist",
    summary: "Creates a synthetic work package that links design records to tasks, evidence requirements, and engineering closeout gates.",
    steps: [
      "Select the design records that require field verification or installation.",
      "Create a work package with linked record keys.",
      "List field tasks such as verify cable tags, patch LIU ports, splice strands, and upload evidence.",
      "Attach required evidence types before field closeout.",
      "Move linked records to as-built only after engineering review accepts closeout evidence.",
    ],
    edits: [
      "Upsert guide-work-package record GUIDE-WO-FIBER-CLOSEOUT-001.",
    ],
    records: [
      {
        asset_type_slug: "guide-work-package",
        record_key: "GUIDE-WO-FIBER-CLOSEOUT-001",
        display_label: "Guide fiber installation closeout package",
        status: "in_review",
        geometry: null,
        properties: {
          work_order_key: "GUIDE-WO-FIBER-CLOSEOUT-001",
          work_type: "fiber_install",
          linked_records: ["GUIDE-POLE-FIBER-P001", "GUIDE-SPAN-FIBER-P000-P001", "GUIDE-SPARE-POLE-P001"],
          required_tasks: [
            "Verify pole and cable tag labels",
            "Install slack loop and record measured slack",
            "Patch LIU ports and confirm strand color",
            "Upload splice sheet, OTDR, photos, and as-built notes",
          ],
          evidence_requirements: ["as-built photos", "OTDR trace", "splice sheet", "LIU port photo", "engineer closeout approval"],
          status: "engineering_review",
          closeout_notes: "Synthetic guide package: do not mark as-built until evidence is reviewed.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
  {
    key: "import-rebuild-materialize",
    title: "Import, rebuild, and materialize records",
    summary: "Creates an import/rebuild planning record showing how users track uploaded data, validation, blueprint imports, and materialization decisions.",
    steps: [
      "Import or paste a Design Mode blueprint, CSV-derived rows, or module snapshot package.",
      "Validate records and preserve source attribution before writing records.",
      "Use Design Mode records as the staging database while editing.",
      "Materialize supported reviewed records with upsert or skip-existing mode.",
      "Export the rebuild package so the design database can be replayed into a blank instance.",
    ],
    edits: [
      "Upsert guide-import-package record GUIDE-IMPORT-REBUILD-001.",
    ],
    records: [
      {
        asset_type_slug: "guide-import-package",
        record_key: "GUIDE-IMPORT-REBUILD-001",
        display_label: "Guide import rebuild package",
        status: "planned",
        geometry: null,
        properties: {
          import_id: "GUIDE-IMPORT-REBUILD-001",
          source_type: "Design_Mode_blueprint",
          source_name: "Synthetic guide database rebuild package",
          record_counts: {
            asset_types: databaseGuideAssetTypes.length,
            example_workflows: 8,
            materialized_by_default: 0,
          },
          validation_status: "valid",
          materialize_mode: "design_only",
          review_notes: "Synthetic guide import package. Review before changing materialize_mode to upsert.",
        },
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Created by the dashboard guide. Synthetic/demo data only.",
      },
    ],
  },
];

type DashboardSearchLayer =
  | "all"
  | "publicTransmissionLines"
  | "publicSubstations"
  | "fccUtilityTowers"
  | "fccMicrowaveLinks"
  | "transmissionStructures"
  | "spliceClosures"
  | "syntheticOpgwCables"
  | "opgwRoutes"
  | "opgwCableSections"
  | "opgwSpanSegments"
  | "opgwSplicePoints"
  | "fiberAssignments"
  | "strandContinuity"
  | "distributionPoleDensity"
  | "distributionPoles"
  | "distributionFiberRoutes"
  | "distributionSplicePoints"
  | "distributionSlackLoops"
  | "distributionFiberAssignments"
  | "patchPanels"
  | "syntheticSubstations"
  | "designAssets"
  | "editablePlanning";

const searchLayerOptions: Array<{ value: DashboardSearchLayer; label: string; kinds: StreetMapSelection["kind"][] }> = [
  { value: "all", label: "All searchable layers", kinds: [] },
  { value: "publicTransmissionLines", label: "HIFLD transmission lines", kinds: ["public_transmission_line"] },
  { value: "publicSubstations", label: "Verified-owner substations", kinds: ["public_substation"] },
  { value: "fccUtilityTowers", label: "FCC tower nodes", kinds: ["fcc_utility_tower"] },
  { value: "fccMicrowaveLinks", label: "FCC microwave links", kinds: ["fcc_microwave_link"] },
  { value: "transmissionStructures", label: "Transmission structures", kinds: ["transmission_structure"] },
  { value: "spliceClosures", label: "Splice closures", kinds: ["splice_closure"] },
  { value: "syntheticOpgwCables", label: "Synthetic OPGW cables", kinds: ["opgw_cable"] },
  { value: "opgwRoutes", label: "OPGW routes", kinds: ["opgw_route"] },
  { value: "opgwCableSections", label: "OPGW cable sections", kinds: ["opgw_cable_section"] },
  { value: "opgwSpanSegments", label: "OPGW span segments", kinds: ["opgw_span_segment"] },
  { value: "opgwSplicePoints", label: "OPGW splice points", kinds: ["opgw_splice_point"] },
  { value: "fiberAssignments", label: "Fiber assignments", kinds: ["fiber_assignment"] },
  { value: "strandContinuity", label: "Strand Continuity", kinds: ["fiber_assignment"] },
  { value: "distributionFiberRoutes", label: "Distribution Network", kinds: ["distribution_pole_density", "distribution_pole", "distribution_pole_fiber", "distribution_splice_point", "distribution_slack_loop", "distribution_fiber_assignment"] },
  { value: "patchPanels", label: "Patch panels", kinds: ["patch_panel"] },
  { value: "syntheticSubstations", label: "Synthetic substations", kinds: ["synthetic_substation"] },
  { value: "designAssets", label: "Editable planning assets", kinds: ["design_asset_record"] },
  { value: "editablePlanning", label: "Editable planning assets", kinds: ["substation", "node", "transmission_line", "work_order"] },
];

const moduleLayerCoverage: Record<string, StreetMapLayerKey[]> = {
  "/dashboard": ["publicTransmissionLines", "publicSubstations", "transmissionStructures", "assumedOpgwRoutes", "spliceClosures"],
  "/regional-grid": ["publicTransmissionLines", "publicSubstations", "fccUtilityTowers", "fccMicrowaveLinks"],
  "/substations": ["publicSubstations", "syntheticSubstations"],
  "/devices": ["telecomNodes", "selIconNodes", "fccUtilityTowers"],
  "/device-ports": ["selIconNodes", "patchPanels", "fiberAssignments"],
  "/circuits": ["criticalRidingCircuits", "fiberAssignments", "fccMicrowaveLinks"],
  "/work-orders": ["opgwOpenWorkOrders", "workOrderLocations", "opgwSpanInspectionIssues"],
  "/transmission-lines": ["publicTransmissionLines", "assumedOpgwRoutes", "plannedOpgwFiber"],
  "/transmission-structures": ["transmissionStructures", "opgwSpanSegments", "spliceClosures"],
  "/opgw": ["assumedOpgwRoutes", "plannedOpgwFiber", "verifiedOpgwFiber"],
  "/opgw-cables": ["syntheticOpgwCables", "opgwCableSections", "availableStrandCapacity"],
  "/distribution-fiber": distributionNetworkLayerKeys,
  "/fiber-cables": ["syntheticOpgwCables", "opgwCableSections"],
  "/fiber-strands": ["fiberStrandsLayer", "availableStrandCapacity"],
  "/fiber-assignments": ["fiberAssignments", "criticalRidingCircuits", "availableStrandCapacity"],
  "/strand-continuity": ["strandContinuity", "fiberAssignments", "patchPanels", "spliceClosures"],
  "/splice-closures": ["spliceClosures", "existingFiberSplices", "proposedFiberSplices"],
  "/splice-points": ["opgwSplicePoints", "existingFiberSplices", "proposedFiberSplices"],
  "/patch-panels": ["patchPanels", "spliceClosures"],
  "/deviceops/change-requests": ["proposedChanges", "plannedOpgwFiber", "opgwOpenWorkOrders"],
  "/fiber-trace": ["fiberAssignments", "opgwCableSections", "opgwSpanSegments"],
  "/outage-impact": ["opgwOutageImpact", "criticalRidingCircuits", "opgwSpanInspectionIssues"],
  "/splice-matrix": ["existingFiberSplices", "proposedFiberSplices", "compareSpliceLayers"],
  "/fiber-strand-table": ["fiberStrandsLayer", "availableStrandCapacity"],
  "/fiber-assignment-planner": ["fiberAssignments", "availableStrandCapacity", "criticalRidingCircuits"],
  "/guide": ["designAssets", "distributionFiberRoutes", "fiberAssignments", "spliceClosures"],
  "/import-export": ["publicTransmissionLines", "publicSubstations", "syntheticOpgwCables"],
  "/data-sources": ["publicTransmissionLines", "publicSubstations", "fccUtilityTowers", "fccMicrowaveLinks"],
  "/sql-reports": ["publicTransmissionLines", "publicSubstations", "opgwOutageImpact", "availableStrandCapacity"],
};

export function DashboardPage() {
  const pathname = usePathname();
  const [mode, setMode] = useState<DashboardMapMode>("street-level");
  const [operatingMode, setOperatingMode] = useState<DashboardOperatingMode>("planned");
  const [transmissionMaps, setTransmissionMaps] = useState(seedTransmissionMaps);
  const [activeMapId, setActiveMapId] = useState(seedTransmissionMaps[0].id);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [substations, setSubstations] = useState(seedEditableSubstations);
  const [nodes, setNodes] = useState(seedMapNodes);
  const [transmissionLines] = useState(seedTransmissionLines);
  const [planningRegions] = useState(seedPlanningRegions);
  const [activeTool, setActiveTool] = useState<MapDrawingTool>("select");
  const [designModeEnabled, setDesignModeEnabled] = useState(MAP_EDITING_ENABLED);
  const [selectedAsset, setSelectedAsset] = useState<StreetMapSelection | null>(null);
  const [mapWindowClosed, setMapWindowClosed] = useState(false);
  const [draftSubstation, setDraftSubstation] = useState<Substation | null>(null);
  const [draftNode, setDraftNode] = useState<MapNode | null>(null);
  const [placementTarget, setPlacementTarget] = useState<MissingMapLocation | null>(null);
  const [addAssetKind, setAddAssetKind] = useState<AddAssetKind | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [searchLayerFilter, setSearchLayerFilter] = useState<DashboardSearchLayer>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [rightMode, setRightMode] = useState<RightDrawerMode>("modules");
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [continuityHighlight, setContinuityHighlight] = useState<ContinuityHighlight | undefined>();
  const deepLinkFocusApplied = useRef(false);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapStatusMessage, setMapStatusMessage] = useState("");
  const [streetLayers, setStreetLayers] = useState<Record<StreetMapLayerKey, boolean>>(dashboardStreetLayers);
  const [isolatedOpgwRouteId, setIsolatedOpgwRouteId] = useState<string | null>(null);
  const [isolatedOpgwSectionId, setIsolatedOpgwSectionId] = useState<string | null>(null);
  const [isolatedOpgwSplicePointId, setIsolatedOpgwSplicePointId] = useState<string | null>(null);
  const [isolatedCircuitId, setIsolatedCircuitId] = useState<string | null>(null);
  const [visibleTransmissionLineOwners, setVisibleTransmissionLineOwners] = useState<Record<string, boolean>>({});
  const [visibleSubstationOwners, setVisibleSubstationOwners] = useState<Record<string, boolean>>({});
  const [visibleFccTowerOwners, setVisibleFccTowerOwners] = useState<Record<string, boolean>>({});
  const [visibleFccLinkOwners, setVisibleFccLinkOwners] = useState<Record<string, boolean>>({});
  const [visibleFccFrequencyBands, setVisibleFccFrequencyBands] = useState<Record<string, boolean>>({});
  const [publicTransmissionLines, setPublicTransmissionLines] = useState<PublicTransmissionLineFeature[]>([]);
  const [publicSubstations, setPublicSubstations] = useState<PublicSubstationFeature[]>([]);
  const [fccUtilityTowers, setFccUtilityTowers] = useState<FccUtilityTowerFeature[]>([]);
  const [fccMicrowaveLinks, setFccMicrowaveLinks] = useState<FccMicrowaveLinkFeature[]>([]);
  const [legacyTelecomCircuits, setLegacyTelecomCircuits] = useState<Array<GeoFeature<TelecomCircuitProperties, "LineString">>>([]);
  const [syntheticSubstations, setSyntheticSubstations] = useState<SyntheticSubstationFeature[]>([]);
  const [transmissionStructures, setTransmissionStructures] = useState<TransmissionStructureFeature[]>([]);
  const [opgwCables, setOpgwCables] = useState<OpgwCableFeature[]>([]);
  const [spliceClosures, setSpliceClosures] = useState<SpliceClosureFeature[]>([]);
  const [fiberStrands, setFiberStrands] = useState<FiberStrand[]>([]);
  const [fiberSplices, setFiberSplices] = useState<FiberSplice[]>([]);
  const [patchPanels, setPatchPanels] = useState<PatchPanel[]>([]);
  const [fiberAssignments, setFiberAssignments] = useState<FiberAssignment[]>([]);
  const [syntheticServices, setSyntheticServices] = useState<SyntheticService[]>([]);
  const [strandContinuityRecords, setStrandContinuityRecords] = useState<StrandContinuityRecord[]>([]);
  const [distributionPoleDensity, setDistributionPoleDensity] = useState<DistributionPoleDensityFeature[]>([]);
  const [distributionPoles, setDistributionPoles] = useState<DistributionPoleFeature[]>([]);
  const [distributionPoleFiberRoutes, setDistributionPoleFiberRoutes] = useState<DistributionPoleFiberRouteFeature[]>([]);
  const [distributionSplicePoints, setDistributionSplicePoints] = useState<DistributionPoleSplicePointFeature[]>([]);
  const [distributionSlackLoops, setDistributionSlackLoops] = useState<DistributionSlackLoopFeature[]>([]);
  const [distributionFiberAssignments, setDistributionFiberAssignments] = useState<DistributionFiberAssignmentFeature[]>([]);
  const [mapDataWarnings, setMapDataWarnings] = useState<Record<string, string>>({});
  const [serverGisSearchResults, setServerGisSearchResults] = useState<StreetMapSelection[]>([]);
  const [designAssetTypes, setDesignAssetTypes] = useState<DesignAssetType[]>([]);
  const [designAssetRecords, setDesignAssetRecords] = useState<DesignAssetRecord[]>([]);
  const [selectedDesignAssetTypeSlug, setSelectedDesignAssetTypeSlug] = useState("");
  const [pendingDesignGeometry, setPendingDesignGeometry] = useState<DesignAssetGeoJsonGeometry | null>(null);
  const [designDrawingCoordinates, setDesignDrawingCoordinates] = useState<Coordinate[]>([]);
  const [designAssetMessage, setDesignAssetMessage] = useState("");
  const [guideBusy, setGuideBusy] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const [gisApiBase, setGisApiBase] = useState(API_BASE);
  const designFeaturesEnabled = MAP_EDITING_ENABLED || designModeEnabled;
  const mountedRef = useRef(false);
  const loadedMapDataGroupsRef = useRef<Set<DashboardMapDataGroup>>(new Set());
  const loadingMapDataGroupsRef = useRef<Set<DashboardMapDataGroup>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedGisSource = params.get("gisApiBase") || params.get("gisSource");
    if (requestedGisSource) {
      setGisApiBase(saveGisApiBase(requestedGisSource.toLowerCase() === "local" ? LOCAL_GIS_API_BASE : requestedGisSource));
      return;
    }
    setGisApiBase(getStoredGisApiBase());
  }, []);

  const loadMapDataGroups = useCallback(async (requestedGroups: DashboardMapDataGroup[]) => {
    const groups = requestedGroups.filter((group, index) => requestedGroups.indexOf(group) === index);
    const pendingGroups = groups.filter((group) => !loadedMapDataGroupsRef.current.has(group) && !loadingMapDataGroupsRef.current.has(group));
    if (!pendingGroups.length) return;
    pendingGroups.forEach((group) => loadingMapDataGroupsRef.current.add(group));

    await Promise.all(pendingGroups.map(async (group) => {
      const warnings: Record<string, string> = {};
      try {
        if (group === "publicReference") {
          const [publicLines, publicSubstationRecords, distributionDensityRecords] = await Promise.all([
            fetchGeoJson<PublicTransmissionLineCollection>("/data/iso-ne-public-transmission-lines.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.publicLines = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as PublicTransmissionLineFeature[];
              }),
            fetchGeoJson<PublicSubstationCollection>("/data/iso-ne-public-substations.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.publicSubstations = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as PublicSubstationFeature[];
              }),
            fetchGeoJson<DistributionPoleDensityCollection>("/data/iso-ne-synthetic-distribution-pole-density.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.distributionPoleDensity = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as DistributionPoleDensityFeature[];
              }),
          ]);
          if (!mountedRef.current) return;
          setPublicTransmissionLines(publicLines);
          setPublicSubstations(publicSubstationRecords);
          setDistributionPoleDensity(distributionDensityRecords);
          if (!LOAD_STATIC_DISTRIBUTION_POLE_SAMPLE) {
            warnings.distributionPoles = "Static pole point sample disabled. Production-scale poles are served through PostGIS vector tiles at street zoom.";
          }
        }

        if (group === "fccReference") {
          const [fccTowers, fccLinks] = await Promise.all([
            fetchGeoJson<FccUtilityTowerCollection>("/data/fcc-uls-utility-towers.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.fccUtilityTowers = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as FccUtilityTowerFeature[];
              }),
            fetchGeoJson<FccMicrowaveLinkCollection>("/data/fcc-uls-utility-microwave-links.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.fccMicrowaveLinks = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as FccMicrowaveLinkFeature[];
              }),
          ]);
          if (!mountedRef.current) return;
          setFccUtilityTowers(fccTowers);
          setFccMicrowaveLinks(fccLinks);
        }

        if (group === "syntheticServices") {
          const services = await fetchGeoJson<SyntheticService[]>("/data/iso-ne-synthetic-services.json").catch((error) => {
            warnings.syntheticServices = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
            return [] as SyntheticService[];
          });
          if (!mountedRef.current) return;
          setSyntheticServices(services);
        }

        if (group === "legacyTelecomCircuits") {
          const circuits = await fetchGeoJson<GeoFeatureCollection<TelecomCircuitProperties, "LineString">>("/data/telecomCircuits.geojson")
            .then((collection) => collection.features || [])
            .catch((error) => {
              warnings.legacyTelecomCircuits = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as Array<GeoFeature<TelecomCircuitProperties, "LineString">>;
            });
          if (!mountedRef.current) return;
          setLegacyTelecomCircuits(circuits);
        }

        if (group === "opgwTopology") {
          const [structures, closures, cables] = await Promise.all([
            fetchGeoJson<TransmissionStructureCollection>("/data/iso-ne-synthetic-transmission-structures.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.structures = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as TransmissionStructureFeature[];
              }),
            fetchGeoJson<SpliceClosureCollection>("/data/iso-ne-synthetic-splice-closures.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.spliceClosures = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as SpliceClosureFeature[];
              }),
            fetchGeoJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.opgwCables = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as OpgwCableFeature[];
              }),
          ]);
          if (!mountedRef.current) return;
          setTransmissionStructures(structures);
          setSpliceClosures(closures);
          setOpgwCables(cables);
        }

        if (group === "fiberDetails") {
          const [strands, assignments] = await Promise.all([
            fetchGeoJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json").catch((error) => {
              warnings.fiberStrands = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as FiberStrand[];
            }),
            fetchGeoJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json").catch((error) => {
              warnings.fiberAssignments = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as FiberAssignment[];
            }),
          ]);
          if (!mountedRef.current) return;
          setFiberStrands(strands);
          setFiberAssignments(assignments);
        }

        if (group === "fiberAssignments") {
          const assignments = await fetchGeoJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json").catch((error) => {
            warnings.fiberAssignments = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
            return [] as FiberAssignment[];
          });
          if (!mountedRef.current) return;
          setFiberAssignments(assignments);
        }

        if (group === "patchPanels") {
          const panels = await fetchGeoJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json").catch((error) => {
            warnings.patchPanels = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
            return [] as PatchPanel[];
          });
          if (!mountedRef.current) return;
          setPatchPanels(panels);
        }

        if (group === "spliceContinuity") {
          const [splices, services, strandContinuity] = await Promise.all([
            fetchGeoJson<FiberSplice[]>("/data/iso-ne-synthetic-fiber-splices.json").catch((error) => {
              warnings.splices = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as FiberSplice[];
            }),
            fetchGeoJson<SyntheticService[]>("/data/iso-ne-synthetic-services.json").catch((error) => {
              warnings.syntheticServices = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as SyntheticService[];
            }),
            fetchGeoJson<StrandContinuityRecord[]>("/data/iso-ne-synthetic-strand-continuity.json").catch((error) => {
              warnings.strandContinuity = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as StrandContinuityRecord[];
            }),
          ]);
          if (!mountedRef.current) return;
          setFiberSplices(splices);
          setSyntheticServices(services);
          setStrandContinuityRecords(strandContinuity);
        }

        if (group === "distributionFiberRoutes") {
          const distributionFiberRoutes = await fetchGeoJson<DistributionPoleFiberRouteCollection>("/data/iso-ne-synthetic-distribution-pole-fiber.geojson")
            .then((collection) => collection.features || [])
            .catch((error) => {
              warnings.distributionPoleFiberRoutes = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as DistributionPoleFiberRouteFeature[];
            });
          if (!mountedRef.current) return;
          setDistributionPoleFiberRoutes(distributionFiberRoutes);
        }

        if (group === "distributionRouteDetails") {
          const [distributionSpliceRecords, distributionSlackRecords] = await Promise.all([
            fetchGeoJson<DistributionPoleSplicePointCollection>("/data/iso-ne-synthetic-distribution-splice-points.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.distributionSplicePoints = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as DistributionPoleSplicePointFeature[];
              }),
            fetchGeoJson<DistributionSlackLoopCollection>("/data/iso-ne-synthetic-distribution-slack-loops.geojson")
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.distributionSlackLoops = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as DistributionSlackLoopFeature[];
              }),
          ]);
          if (!mountedRef.current) return;
          setDistributionSplicePoints(distributionSpliceRecords);
          setDistributionSlackLoops(distributionSlackRecords);
        }

        if (group === "distributionFiberAssignments") {
          const distributionFiberAssignmentRecords = await fetchGeoJson<DistributionFiberAssignmentCollection>("/data/iso-ne-synthetic-distribution-fiber-assignments.geojson")
            .then((collection) => collection.features || [])
            .catch((error) => {
              warnings.distributionFiberAssignments = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
              return [] as DistributionFiberAssignmentFeature[];
            });
          if (!mountedRef.current) return;
          setDistributionFiberAssignments(distributionFiberAssignmentRecords);
        }

        if (group === "distributionPoleSample") {
          const distributionPoleRecords = await fetchGeoJson<DistributionPoleCollection>(
            LOAD_STATIC_DISTRIBUTION_POLE_SAMPLE
              ? "/data/iso-ne-synthetic-distribution-poles.geojson"
              : "/data/iso-ne-synthetic-distribution-poles-lite.geojson",
          )
              .then((collection) => collection.features || [])
              .catch((error) => {
                warnings.distributionPoles = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
                return [] as DistributionPoleFeature[];
              });
          if (!LOAD_STATIC_DISTRIBUTION_POLE_SAMPLE) {
            warnings.distributionPoles = "Using lightweight street-path pole display sample. Full-scale pole inventories should be served through PostGIS vector tiles at street zoom.";
          }
          if (!mountedRef.current) return;
          setDistributionPoles(distributionPoleRecords);
        }

        loadedMapDataGroupsRef.current.add(group);
      } finally {
        loadingMapDataGroupsRef.current.delete(group);
        if (mountedRef.current && Object.keys(warnings).length) {
          setMapDataWarnings((current) => ({ ...current, ...warnings }));
        }
      }
    }));
  }, []);

  useEffect(() => {
    void loadMapDataGroups(["publicReference"]);
  }, [loadMapDataGroups]);

  useEffect(() => {
    const groups: DashboardMapDataGroup[] = [];
    const hasCircuitRouteFocus = Boolean(isolatedCircuitId);
    if (streetLayers.fccUtilityTowers || streetLayers.fccMicrowaveLinks || searchLayerFilter === "fccUtilityTowers" || searchLayerFilter === "fccMicrowaveLinks") groups.push("fccReference");

    const needsOpgwTopology = streetLayers.transmissionStructures
      || streetLayers.syntheticOpgwCables
      || streetLayers.assumedOpgwRoutes
      || streetLayers.plannedOpgwFiber
      || streetLayers.verifiedOpgwFiber
      || streetLayers.opgwRoutes
      || streetLayers.opgwCableSections
      || streetLayers.opgwSpanSegments
      || streetLayers.opgwSplicePoints
      || streetLayers.spliceClosures
      || streetLayers.existingFiberSplices
      || streetLayers.proposedFiberSplices
      || streetLayers.compareSpliceLayers
      || streetLayers.patchPanels
      || streetLayers.availableStrandCapacity
      || streetLayers.criticalRidingCircuits
      || streetLayers.opgwOutageImpact
      || streetLayers.opgwOpenWorkOrders
      || streetLayers.opgwSpanInspectionIssues
      || streetLayers.strandContinuity
      || rightMode === "splices"
      || rightMode === "strands"
      || rightMode === "assignments"
      || Boolean(continuityHighlight);
    if (needsOpgwTopology) groups.push("opgwTopology");

    if (hasCircuitRouteFocus) {
      groups.push("fiberAssignments");
    } else if (streetLayers.availableStrandCapacity || streetLayers.fiberAssignments || streetLayers.criticalRidingCircuits || streetLayers.strandContinuity || rightMode === "strands" || rightMode === "assignments" || Boolean(continuityHighlight)) {
      groups.push("fiberDetails");
    }
    if (streetLayers.patchPanels || streetLayers.strandContinuity || rightMode === "strands" || Boolean(continuityHighlight)) {
      groups.push("patchPanels");
    }
    if (hasCircuitRouteFocus || continuityHighlight?.serviceId) {
      groups.push("syntheticServices");
    }
    if (streetLayers.existingFiberSplices || streetLayers.proposedFiberSplices || streetLayers.compareSpliceLayers || (streetLayers.strandContinuity && !hasCircuitRouteFocus) || rightMode === "splices" || (Boolean(continuityHighlight) && !hasCircuitRouteFocus)) {
      groups.push("spliceContinuity");
    }
    if (streetLayers.distributionFiberRoutes || streetLayers.distributionSplicePoints || streetLayers.distributionSlackLoops || streetLayers.distributionFiberAssignments || searchLayerFilter === "distributionFiberRoutes") {
      groups.push("distributionFiberRoutes");
    }
    if (streetLayers.distributionSplicePoints || streetLayers.distributionSlackLoops) {
      groups.push("distributionRouteDetails");
    }
    if (streetLayers.distributionFiberAssignments) {
      groups.push("distributionFiberAssignments");
    }
    if (streetLayers.distributionPoles) groups.push("distributionPoleSample");
    if (groups.length) void loadMapDataGroups(groups);
  }, [continuityHighlight, isolatedCircuitId, loadMapDataGroups, rightMode, searchLayerFilter, streetLayers]);

  const loadDesignAssets = useCallback(async (force = false) => {
    if (!force && !designFeaturesEnabled) return;
    try {
      const payload = await fetchFromApiBase<DesignAssetMapPayload>(API_BASE, "/api/design-assets/map-records");
      setDesignAssetTypes(payload.asset_types || []);
      setDesignAssetRecords(payload.records || []);
      setSelectedDesignAssetTypeSlug((current) => current || payload.asset_types?.[0]?.slug || "");
      setDesignAssetMessage(payload.synthetic_data_notice || "Design/Edit mode uses synthetic/demo planning records only.");
    } catch (error) {
      setDesignAssetMessage(error instanceof Error ? error.message : String(error));
    }
  }, [designFeaturesEnabled]);

  useEffect(() => {
    void loadDesignAssets();
  }, [loadDesignAssets]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setServerGisSearchResults([]);
      return;
    }
    const searchTypes = gisSearchTypesForLayer(searchLayerFilter);
    if (!searchTypes.length) {
      setServerGisSearchResults([]);
      return;
    }
    const controller = new AbortController();
    async function loadServerSearch() {
      try {
        const responses = await Promise.all(searchTypes.map(async (type) => {
          const url = `${normalizeApiBase(gisApiBase).replace(/\/$/, "")}/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}&limit=8`;
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          if (!response.ok) return [];
          const payload = await response.json() as { results?: Array<Record<string, unknown>>; postgis_configured?: boolean };
          if (!payload.postgis_configured) return [];
          return (payload.results || []).map((record) => serverSearchRecordToSelection(type, record));
        }));
        setServerGisSearchResults(responses.flat());
      } catch (error) {
        if (!controller.signal.aborted) setServerGisSearchResults([]);
      }
    }
    void loadServerSearch();
    return () => controller.abort();
  }, [gisApiBase, search, searchLayerFilter]);

  useEffect(() => {
    const drawer = new URLSearchParams(window.location.search).get("drawer");
    const allowedDrawers: RightDrawerMode[] = ["modules", "summary", "filters", "layers", "scale", "sources", "details", "strands", "splices", "assignments", "editor", "design"];
    if (drawer && allowedDrawers.includes(drawer as RightDrawerMode)) {
      setRightMode(drawer as RightDrawerMode);
      setRightCollapsed(false);
      if (drawer === "design") {
        setDesignModeEnabled(true);
        setStreetLayers((current) => ({ ...current, designAssets: true }));
        void loadDesignAssets(true);
      }
    }
  }, [loadDesignAssets]);

  const publicOnly = true;
  const visibleTransmissionMaps = useMemo(
    () => transmissionMaps.filter((map) => map.mapType === "public_reference" || map.visibility === "public"),
    [transmissionMaps],
  );
  const activeMap = visibleTransmissionMaps.find((map) => map.id === activeMapId) || visibleTransmissionMaps[0] || transmissionMaps[0];

  const visibleSubstations = useMemo(
    () => publicOnly ? [] : filterSubstationsForScope(substations, publicOnly),
    [publicOnly, substations],
  );
  const visibleNodes = useMemo(
    () => publicOnly ? [] : filterNodesForScope(nodes, publicOnly),
    [nodes, publicOnly],
  );
  const visibleTransmissionLines = useMemo(
    () => publicOnly ? [] : transmissionLines.filter(isLineInIsoNeScope),
    [publicOnly, transmissionLines],
  );
  const visiblePublicTransmissionLines = useMemo(
    () => publicTransmissionLines.filter((feature) => feature.properties.isoNe),
    [publicTransmissionLines],
  );
  const transmissionLineOwnerCounts = useMemo(
    () => ownerCountsFor([], visiblePublicTransmissionLines),
    [visiblePublicTransmissionLines],
  );
  useEffect(() => {
    setVisibleTransmissionLineOwners((current) => mergeVisibleOwnerState(current, transmissionLineOwnerCounts));
  }, [transmissionLineOwnerCounts]);
  const visiblePublicSubstations = useMemo(
    () => publicSubstations.filter((feature) => feature.properties.isoNe),
    [publicSubstations],
  );
  const substationOwnerCounts = useMemo(
    () => ownerCountsFor(visiblePublicSubstations, []),
    [visiblePublicSubstations],
  );
  useEffect(() => {
    setVisibleSubstationOwners((current) => mergeVisibleOwnerState(current, substationOwnerCounts));
  }, [substationOwnerCounts]);
  const visibleFccUtilityTowers = useMemo(
    () => fccUtilityTowers.filter((feature) => feature.properties.isoNe),
    [fccUtilityTowers],
  );
  const visibleFccMicrowaveLinks = useMemo(
    () => fccMicrowaveLinks.filter((feature) => feature.properties.isoNe),
    [fccMicrowaveLinks],
  );
  const fccTowerOwnerCounts = useMemo(
    () => fccOwnerCountsFor(visibleFccUtilityTowers, []),
    [visibleFccUtilityTowers],
  );
  useEffect(() => {
    setVisibleFccTowerOwners((current) => mergeVisibleOwnerState(current, fccTowerOwnerCounts));
  }, [fccTowerOwnerCounts]);
  const fccLinkOwnerCounts = useMemo(
    () => fccOwnerCountsFor([], visibleFccMicrowaveLinks),
    [visibleFccMicrowaveLinks],
  );
  useEffect(() => {
    setVisibleFccLinkOwners((current) => mergeVisibleOwnerState(current, fccLinkOwnerCounts));
  }, [fccLinkOwnerCounts]);
  const fccFrequencyBandCounts = useMemo(
    () => fccFrequencyBandCountsFor(visibleFccMicrowaveLinks),
    [visibleFccMicrowaveLinks],
  );
  useEffect(() => {
    setVisibleFccFrequencyBands((current) => mergeVisibleFrequencyBandState(current, fccFrequencyBandCounts));
  }, [fccFrequencyBandCounts]);
  const visibleSyntheticSubstations = useMemo(
    () => syntheticSubstations.filter((feature) => feature.properties.synthetic && feature.properties.public === false),
    [syntheticSubstations],
  );
  const visibleTransmissionStructures = useMemo(
    () => transmissionStructures.filter((feature) => feature.properties.synthetic),
    [transmissionStructures],
  );
  const visibleOpgwCables = useMemo(
    () => opgwCables.filter((feature) => feature.properties.synthetic),
    [opgwCables],
  );
  const visibleSpliceClosures = useMemo(
    () => spliceClosures.filter((feature) => feature.properties.synthetic),
    [spliceClosures],
  );
  const visiblePatchPanels = useMemo(
    () => patchPanels.filter((panel) => panel.synthetic),
    [patchPanels],
  );
  const visibleDesignAssetRecords = useMemo(
    () => designFeaturesEnabled ? designAssetRecords.filter((record) => record.status !== "archived") : [],
    [designAssetRecords, designFeaturesEnabled],
  );
  const activeDesignAssetType = useMemo(
    () => designAssetTypes.find((item) => item.slug === selectedDesignAssetTypeSlug) || designAssetTypes[0],
    [designAssetTypes, selectedDesignAssetTypeSlug],
  );
  const visibleDesignAssetMapRecords = useMemo(() => {
    if (!designFeaturesEnabled || !pendingDesignGeometry || !activeDesignAssetType || !geometryTypeMatchesDesignGeometry(activeDesignAssetType.geometry_type, pendingDesignGeometry)) {
      return visibleDesignAssetRecords;
    }
    const draftRecord: DesignAssetRecord = {
      id: -1,
      asset_type_id: activeDesignAssetType.id,
      asset_type_slug: activeDesignAssetType.slug,
      asset_type_display_name: activeDesignAssetType.display_name,
      record_key: "unsaved-design-draft",
      display_label: `Unsaved ${activeDesignAssetType.display_name}`,
      geometry_type: activeDesignAssetType.geometry_type,
      geometry: pendingDesignGeometry,
      geometry_json: pendingDesignGeometry,
      properties: { owner: "Synthetic planning owner", draft: true },
      properties_json: { owner: "Synthetic planning owner", draft: true },
      map_style: activeDesignAssetType.map_style || activeDesignAssetType.map_style_json || { color: "#f5c451", lineWidth: 4, radius: 9, fillOpacity: 0.16 },
      status: "proposed",
      source: "synthetic_demo_draft",
      visibility: "synthetic-demo",
      version: 0,
      notes: "Unsaved Design/Edit geometry preview.",
    };
    return [draftRecord, ...visibleDesignAssetRecords];
  }, [activeDesignAssetType, designFeaturesEnabled, pendingDesignGeometry, visibleDesignAssetRecords]);
  const selectedDesignAssetRecord = selectedAsset?.kind === "design_asset_record" ? selectedAsset.record : null;
  const syntheticFiberAssignments = useMemo(
    () => fiberAssignments.filter((assignment) => assignment.synthetic),
    [fiberAssignments],
  );
  const visibleFiberAssignments = useMemo(
    () => {
      if (!isolatedCircuitId) return syntheticFiberAssignments;
      const target = circuitRouteTargetForQuery(
        isolatedCircuitId,
        syntheticServices,
        syntheticFiberAssignments,
        distributionFiberAssignments.filter((feature) => feature.properties.synthetic),
        legacyTelecomCircuits,
      );
      return target?.assignments || [];
    },
    [distributionFiberAssignments, isolatedCircuitId, legacyTelecomCircuits, syntheticFiberAssignments, syntheticServices],
  );
  const visibleDistributionPoles = useMemo(
    () => distributionPoles.filter((feature) => feature.properties.synthetic),
    [distributionPoles],
  );
  const visibleDistributionPoleFiberRoutes = useMemo(
    () => distributionPoleFiberRoutes.filter((feature) => feature.properties.synthetic),
    [distributionPoleFiberRoutes],
  );
  const visibleDistributionPoleDensity = useMemo(
    () => distributionPoleDensity.filter((feature) => feature.properties.synthetic),
    [distributionPoleDensity],
  );
  const visibleDistributionSplicePoints = useMemo(
    () => distributionSplicePoints.filter((feature) => feature.properties.synthetic),
    [distributionSplicePoints],
  );
  const visibleDistributionSlackLoops = useMemo(
    () => distributionSlackLoops.filter((feature) => feature.properties.synthetic),
    [distributionSlackLoops],
  );
  const visibleDistributionFiberAssignments = useMemo(
    () => distributionFiberAssignments.filter((feature) => feature.properties.synthetic),
    [distributionFiberAssignments],
  );
  const visiblePlanningRegions = useMemo(
    () => publicOnly ? [] : planningRegions,
    [planningRegions, publicOnly],
  );
  const opgwEngineeringModel = useMemo(
    () => buildSyntheticOpgwEngineeringModel({
      opgwCables: visibleOpgwCables,
      transmissionStructures: visibleTransmissionStructures,
      spliceClosures: visibleSpliceClosures,
      fiberStrands,
      fiberAssignments: visibleFiberAssignments,
      patchPanels: visiblePatchPanels,
      publicTransmissionLines: visiblePublicTransmissionLines,
    }),
    [fiberStrands, visibleFiberAssignments, visibleOpgwCables, visiblePatchPanels, visiblePublicTransmissionLines, visibleSpliceClosures, visibleTransmissionStructures],
  );
  const visibleOpgwRoutes = opgwEngineeringModel.routes;
  const visibleOpgwCableSections = opgwEngineeringModel.cableSections;
  const visibleOpgwSpanSegments = opgwEngineeringModel.spanSegments;
  const visibleOpgwSplicePoints = opgwEngineeringModel.splicePoints;
  const isolatedOpgwSection = useMemo(
    () => isolatedOpgwSectionId ? visibleOpgwCableSections.find((section) => section.properties.cableSectionId === isolatedOpgwSectionId) : undefined,
    [isolatedOpgwSectionId, visibleOpgwCableSections],
  );
  const isolatedOpgwSplicePoint = useMemo(
    () => isolatedOpgwSplicePointId ? visibleOpgwSplicePoints.find((splicePoint) => splicePoint.properties.splicePointId === isolatedOpgwSplicePointId) : undefined,
    [isolatedOpgwSplicePointId, visibleOpgwSplicePoints],
  );
  const activeIsolatedOpgwRouteId = isolatedOpgwSplicePoint?.properties.opgwRouteId || isolatedOpgwSection?.properties.opgwRouteId || isolatedOpgwRouteId || "";
  const mapOpgwRoutes = useMemo(
    () => activeIsolatedOpgwRouteId ? visibleOpgwRoutes.filter((route) => route.properties.opgwRouteId === activeIsolatedOpgwRouteId) : visibleOpgwRoutes,
    [activeIsolatedOpgwRouteId, visibleOpgwRoutes],
  );
  const mapOpgwCableSections = useMemo(
    () => {
      if (isolatedOpgwSectionId) return visibleOpgwCableSections.filter((section) => section.properties.cableSectionId === isolatedOpgwSectionId);
      if (isolatedOpgwSplicePointId) return visibleOpgwCableSections.filter((section) => section.properties.fromSplicePointId === isolatedOpgwSplicePointId || section.properties.toSplicePointId === isolatedOpgwSplicePointId);
      if (isolatedOpgwRouteId) return visibleOpgwCableSections.filter((section) => section.properties.opgwRouteId === isolatedOpgwRouteId);
      return visibleOpgwCableSections;
    },
    [isolatedOpgwRouteId, isolatedOpgwSectionId, isolatedOpgwSplicePointId, visibleOpgwCableSections],
  );
  const mapOpgwSplicePoints = useMemo(
    () => {
      if (isolatedOpgwSection) {
        const endpointIds = new Set([isolatedOpgwSection.properties.fromSplicePointId, isolatedOpgwSection.properties.toSplicePointId]);
        return visibleOpgwSplicePoints.filter((splicePoint) => endpointIds.has(splicePoint.properties.splicePointId));
      }
      if (isolatedOpgwSplicePointId) return visibleOpgwSplicePoints.filter((splicePoint) => splicePoint.properties.splicePointId === isolatedOpgwSplicePointId);
      if (activeIsolatedOpgwRouteId) return visibleOpgwSplicePoints.filter((splicePoint) => splicePoint.properties.opgwRouteId === activeIsolatedOpgwRouteId);
      return visibleOpgwSplicePoints;
    },
    [activeIsolatedOpgwRouteId, isolatedOpgwSection, isolatedOpgwSplicePointId, visibleOpgwSplicePoints],
  );
  const opgwPlanningMetrics = useMemo(
    () => buildOpgwPlanningMetrics(visibleOpgwCables, fiberStrands, visibleFiberAssignments, visibleOpgwCableSections, visibleOpgwSpanSegments, visibleOpgwSplicePoints),
    [fiberStrands, visibleFiberAssignments, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwSpanSegments, visibleOpgwSplicePoints],
  );
  const hasSubstationOwnerLayerState = Object.keys(visibleSubstationOwners).length > 0;
  const hasTransmissionLineOwnerLayerState = Object.keys(visibleTransmissionLineOwners).length > 0;
  const hasFccTowerOwnerLayerState = Object.keys(visibleFccTowerOwners).length > 0;
  const hasFccLinkOwnerLayerState = Object.keys(visibleFccLinkOwners).length > 0;
  const hasFccFrequencyBandLayerState = Object.keys(visibleFccFrequencyBands).length > 0;
  const visibleTransmissionLineOwnerSet = useMemo(
    () => new Set(Object.entries(visibleTransmissionLineOwners).filter(([, enabled]) => enabled).map(([owner]) => owner)),
    [visibleTransmissionLineOwners],
  );
  const visibleSubstationOwnerSet = useMemo(
    () => new Set(Object.entries(visibleSubstationOwners).filter(([, enabled]) => enabled).map(([owner]) => owner)),
    [visibleSubstationOwners],
  );
  const visibleFccTowerOwnerSet = useMemo(
    () => new Set(Object.entries(visibleFccTowerOwners).filter(([, enabled]) => enabled).map(([owner]) => owner)),
    [visibleFccTowerOwners],
  );
  const visibleFccLinkOwnerSet = useMemo(
    () => new Set(Object.entries(visibleFccLinkOwners).filter(([, enabled]) => enabled).map(([owner]) => owner)),
    [visibleFccLinkOwners],
  );
  const visibleFccFrequencyBandSet = useMemo(
    () => new Set(Object.entries(visibleFccFrequencyBands).filter(([, enabled]) => enabled).map(([band]) => band)),
    [visibleFccFrequencyBands],
  );
  const layerFilteredPublicTransmissionLines = useMemo(
    () => {
      if (!streetLayers.publicTransmissionLines) return [];
      if (!hasTransmissionLineOwnerLayerState) return visiblePublicTransmissionLines;
      return visiblePublicTransmissionLines.filter((feature) => visibleTransmissionLineOwnerSet.has(publicTransmissionLineOwner(feature.properties)));
    },
    [hasTransmissionLineOwnerLayerState, streetLayers.publicTransmissionLines, visiblePublicTransmissionLines, visibleTransmissionLineOwnerSet],
  );
  const layerFilteredPublicSubstations = useMemo(
    () => {
      if (!streetLayers.publicSubstations) return [];
      if (!hasSubstationOwnerLayerState) return visiblePublicSubstations;
      return visiblePublicSubstations.filter((feature) => visibleSubstationOwnerSet.has(feature.properties.utilityOwner));
    },
    [hasSubstationOwnerLayerState, streetLayers.publicSubstations, visiblePublicSubstations, visibleSubstationOwnerSet],
  );
  const layerFilteredFccUtilityTowers = useMemo(
    () => {
      if (!streetLayers.fccUtilityTowers) return [];
      if (!hasFccTowerOwnerLayerState) return visibleFccUtilityTowers;
      return visibleFccUtilityTowers.filter((feature) => visibleFccTowerOwnerSet.has(feature.properties.utilityOwner));
    },
    [hasFccTowerOwnerLayerState, streetLayers.fccUtilityTowers, visibleFccTowerOwnerSet, visibleFccUtilityTowers],
  );
  const layerFilteredFccMicrowaveLinks = useMemo(
    () => {
      if (!streetLayers.fccMicrowaveLinks) return [];
      return visibleFccMicrowaveLinks.filter((feature) => {
        const ownerVisible = !hasFccLinkOwnerLayerState || visibleFccLinkOwnerSet.has(feature.properties.utilityOwner);
        const frequencyVisible = !hasFccFrequencyBandLayerState || visibleFccFrequencyBandSet.has(fccFrequencyBandLabel(feature.properties.frequencyAssignedMhz));
        return ownerVisible && frequencyVisible;
      });
    },
    [hasFccFrequencyBandLayerState, hasFccLinkOwnerLayerState, streetLayers.fccMicrowaveLinks, visibleFccFrequencyBandSet, visibleFccLinkOwnerSet, visibleFccMicrowaveLinks],
  );
  const layerFilteredTransmissionStructures = useMemo(
    () => streetLayers.transmissionStructures ? visibleTransmissionStructures : [],
    [streetLayers.transmissionStructures, visibleTransmissionStructures],
  );
  const layerFilteredSpliceClosures = useMemo(
    () => streetLayers.spliceClosures || streetLayers.existingFiberSplices || streetLayers.proposedFiberSplices || streetLayers.compareSpliceLayers ? visibleSpliceClosures : [],
    [streetLayers.compareSpliceLayers, streetLayers.existingFiberSplices, streetLayers.proposedFiberSplices, streetLayers.spliceClosures, visibleSpliceClosures],
  );
  const layerFilteredDistributionPoleDensity = useMemo(
    () => streetLayers.distributionPoleDensity ? visibleDistributionPoleDensity : [],
    [streetLayers.distributionPoleDensity, visibleDistributionPoleDensity],
  );
  const layerFilteredDistributionPoles = useMemo(
    () => streetLayers.distributionPoles ? visibleDistributionPoles : [],
    [streetLayers.distributionPoles, visibleDistributionPoles],
  );
  const layerFilteredDistributionFiberRoutes = useMemo(
    () => streetLayers.distributionFiberRoutes ? visibleDistributionPoleFiberRoutes : [],
    [streetLayers.distributionFiberRoutes, visibleDistributionPoleFiberRoutes],
  );
  const layerFilteredDistributionSplicePoints = useMemo(
    () => streetLayers.distributionSplicePoints ? visibleDistributionSplicePoints : [],
    [streetLayers.distributionSplicePoints, visibleDistributionSplicePoints],
  );
  const layerFilteredDistributionSlackLoops = useMemo(
    () => streetLayers.distributionSlackLoops ? visibleDistributionSlackLoops : [],
    [streetLayers.distributionSlackLoops, visibleDistributionSlackLoops],
  );
  const layerFilteredDistributionFiberAssignments = useMemo(
    () => streetLayers.distributionFiberAssignments ? visibleDistributionFiberAssignments : [],
    [streetLayers.distributionFiberAssignments, visibleDistributionFiberAssignments],
  );
  const estimatedDistributionPoleScale = useMemo(
    () => visibleDistributionPoleDensity.reduce((sum, feature) => sum + feature.properties.representedPoleCount, 0)
      || visibleDistributionPoleFiberRoutes.reduce((sum, feature) => sum + (feature.properties.representedPoleCount || feature.properties.estimatedPoleScaleCount || feature.properties.poleCount), 0),
    [visibleDistributionPoleDensity, visibleDistributionPoleFiberRoutes],
  );
  const dashboardLayerSummaries = useMemo(
    () => buildDashboardLayerSummaries({
      layers: streetLayers,
      publicLineCount: visiblePublicTransmissionLines.length,
      visiblePublicLineCount: layerFilteredPublicTransmissionLines.length,
      publicSubstationCount: visiblePublicSubstations.length,
      visiblePublicSubstationCount: layerFilteredPublicSubstations.length,
      fccTowerCount: visibleFccUtilityTowers.length,
      visibleFccTowerCount: layerFilteredFccUtilityTowers.length,
      fccLinkCount: visibleFccMicrowaveLinks.length,
      visibleFccLinkCount: layerFilteredFccMicrowaveLinks.length,
      syntheticSubstationCount: visibleSyntheticSubstations.length,
      structureCount: visibleTransmissionStructures.length,
      visibleStructureCount: layerFilteredTransmissionStructures.length,
      opgwCableCount: visibleOpgwCables.length,
      opgwRouteCount: visibleOpgwRoutes.length,
      assumedOpgwRouteCount: opgwPlanningMetrics.assumedRouteCount,
      plannedOpgwRouteCount: opgwPlanningMetrics.plannedRouteCount,
      verifiedOpgwRouteCount: opgwPlanningMetrics.verifiedRouteCount,
      opgwCableSectionCount: visibleOpgwCableSections.length,
      opgwSpanSegmentCount: visibleOpgwSpanSegments.length,
      opgwSplicePointCount: visibleOpgwSplicePoints.length,
      spliceClosureCount: visibleSpliceClosures.length,
      visibleSpliceClosureCount: layerFilteredSpliceClosures.length,
      patchPanelCount: visiblePatchPanels.length,
      distributionPoleCount: visibleDistributionPoles.length,
      distributionPoleFiberRouteCount: visibleDistributionPoleFiberRoutes.length,
      distributionPoleDensityCount: visibleDistributionPoleDensity.length,
      distributionSplicePointCount: visibleDistributionSplicePoints.length,
      distributionSlackLoopCount: visibleDistributionSlackLoops.length,
      distributionFiberAssignmentCount: visibleDistributionFiberAssignments.length,
      estimatedDistributionPoleScale,
      fiberStrandCount: fiberStrands.length,
      availableStrandCount: opgwPlanningMetrics.availableStrands,
      fiberAssignmentCount: visibleFiberAssignments.length,
      strandContinuityCount: strandContinuityRecords.length,
      criticalRidingCircuitCount: opgwPlanningMetrics.criticalRidingCircuits,
      outageImpactCount: opgwPlanningMetrics.outageImpactCount,
      openOpgwWorkOrderCount: opgwPlanningMetrics.openWorkOrders,
      spanInspectionIssueCount: opgwPlanningMetrics.spanInspectionIssues,
      nodeCount: visibleNodes.length,
      transmissionLineCount: visibleTransmissionLines.length,
      workOrderLocationCount: availableWorkOrderIds.length,
      designAssetRecordCount: visibleDesignAssetRecords.length,
    }),
    [estimatedDistributionPoleScale, fiberStrands.length, layerFilteredFccMicrowaveLinks.length, layerFilteredFccUtilityTowers.length, layerFilteredPublicSubstations.length, layerFilteredPublicTransmissionLines.length, layerFilteredSpliceClosures.length, layerFilteredTransmissionStructures.length, opgwPlanningMetrics.assumedRouteCount, opgwPlanningMetrics.availableStrands, opgwPlanningMetrics.criticalRidingCircuits, opgwPlanningMetrics.openWorkOrders, opgwPlanningMetrics.outageImpactCount, opgwPlanningMetrics.plannedRouteCount, opgwPlanningMetrics.spanInspectionIssues, opgwPlanningMetrics.verifiedRouteCount, strandContinuityRecords.length, streetLayers, visibleDesignAssetRecords.length, visibleDistributionFiberAssignments.length, visibleDistributionPoleDensity.length, visibleDistributionPoleFiberRoutes.length, visibleDistributionPoles.length, visibleDistributionSlackLoops.length, visibleDistributionSplicePoints.length, visibleFccMicrowaveLinks.length, visibleFccUtilityTowers.length, visibleFiberAssignments.length, visibleNodes.length, visibleOpgwCableSections.length, visibleOpgwCables.length, visibleOpgwRoutes.length, visibleOpgwSpanSegments.length, visibleOpgwSplicePoints.length, visiblePatchPanels.length, visiblePublicSubstations.length, visiblePublicTransmissionLines.length, visibleSpliceClosures.length, visibleSyntheticSubstations.length, visibleTransmissionLines.length, visibleTransmissionStructures.length],
  );
  const summaryCards = useMemo(
    () => buildSummaryCards(visibleTransmissionMaps, visibleSubstations, visibleNodes, visibleTransmissionLines, visiblePublicTransmissionLines, visiblePublicSubstations, visibleFccUtilityTowers, visibleFccMicrowaveLinks, visibleSyntheticSubstations, visibleTransmissionStructures, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwCableSections, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visibleSpliceClosures, visibleFiberAssignments, visibleDistributionPoles, visibleDistributionPoleFiberRoutes, visibleDistributionPoleDensity, visibleDistributionSplicePoints, visibleDistributionSlackLoops, visibleDistributionFiberAssignments, estimatedDistributionPoleScale, visiblePatchPanels),
    [estimatedDistributionPoleScale, visibleDistributionFiberAssignments, visibleDistributionPoleDensity, visibleDistributionPoleFiberRoutes, visibleDistributionPoles, visibleDistributionSlackLoops, visibleDistributionSplicePoints, visibleFccMicrowaveLinks, visibleFccUtilityTowers, visibleFiberAssignments, visibleNodes, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visiblePatchPanels, visiblePublicSubstations, visiblePublicTransmissionLines, visibleSpliceClosures, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines, visibleTransmissionMaps, visibleTransmissionStructures],
  );
  const continuitySummary = useMemo(
    () => buildDashboardContinuitySummary({
      continuityHighlight,
      syntheticServices,
      opgwCables: visibleOpgwCables,
      opgwCableSections: visibleOpgwCableSections,
      opgwSpanSegments: visibleOpgwSpanSegments,
      opgwSplicePoints: visibleOpgwSplicePoints,
      spliceClosures: visibleSpliceClosures,
      fiberSplices,
      fiberAssignments: visibleFiberAssignments,
      patchPanels: visiblePatchPanels,
      filterContext: { searchLayerFilter },
    }),
    [continuityHighlight, fiberSplices, searchLayerFilter, syntheticServices, visibleFiberAssignments, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visiblePatchPanels, visibleSpliceClosures],
  );
  const ownerOptions = useMemo(
    () => buildOwnerOptions(visiblePublicSubstations, visiblePublicTransmissionLines, visibleFccUtilityTowers, visibleFccMicrowaveLinks),
    [visibleFccMicrowaveLinks, visibleFccUtilityTowers, visiblePublicSubstations, visiblePublicTransmissionLines],
  );
  const rawSearchResults = useMemo(
    () => buildSearchResults(visibleSubstations, visibleNodes, visibleTransmissionLines, layerFilteredPublicTransmissionLines, layerFilteredPublicSubstations, layerFilteredFccUtilityTowers, layerFilteredFccMicrowaveLinks, visibleSyntheticSubstations, layerFilteredTransmissionStructures, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwCableSections, visibleOpgwSpanSegments, visibleOpgwSplicePoints, layerFilteredSpliceClosures, visibleFiberAssignments, layerFilteredDistributionPoleDensity, layerFilteredDistributionPoles, layerFilteredDistributionFiberRoutes, layerFilteredDistributionSplicePoints, layerFilteredDistributionSlackLoops, layerFilteredDistributionFiberAssignments, visiblePatchPanels, visibleDesignAssetRecords, search),
    [layerFilteredDistributionFiberAssignments, layerFilteredDistributionFiberRoutes, layerFilteredDistributionPoleDensity, layerFilteredDistributionPoles, layerFilteredDistributionSlackLoops, layerFilteredDistributionSplicePoints, layerFilteredFccMicrowaveLinks, layerFilteredFccUtilityTowers, layerFilteredPublicSubstations, layerFilteredPublicTransmissionLines, layerFilteredSpliceClosures, layerFilteredTransmissionStructures, search, visibleDesignAssetRecords, visibleFiberAssignments, visibleNodes, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visiblePatchPanels, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines],
  );
  const layerScopedSearchResults = useMemo(
    () => rawSearchResults.filter((selection) => matchesSearchLayer(selection, searchLayerFilter)),
    [rawSearchResults, searchLayerFilter],
  );
  const combinedLayerScopedSearchResults = useMemo(
    () => [...serverGisSearchResults, ...layerScopedSearchResults],
    [layerScopedSearchResults, serverGisSearchResults],
  );
  const mapSearchResults = useMemo(
    () => search.trim() ? combinedLayerScopedSearchResults.filter(isDashboardMapSearchResult).slice(0, 8) : [],
    [combinedLayerScopedSearchResults, search],
  );
  const searchResults = useMemo(
    () => combinedLayerScopedSearchResults
      .filter((selection) => matchesDashboardFilters(selection, assetTypeFilter, statusFilter, regionFilter, visibilityFilter, ownerFilter))
      .slice(0, 12),
    [assetTypeFilter, combinedLayerScopedSearchResults, ownerFilter, regionFilter, statusFilter, visibilityFilter],
  );

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [search, searchLayerFilter]);

  const handleMapStatusChange = useCallback((status: MapStatus, message?: string) => {
    setMapStatus(status);
    setMapStatusMessage(message || "");
  }, []);

  function handleCreateMap(map: TransmissionMap) {
    setTransmissionMaps((current) => [map, ...current.filter((item) => item.id !== map.id)]);
    setActiveMapId(map.id);
    setShowMapEditor(false);
    setRightMode("summary");
    issueMapCommand("resize");
    showToast(`Created private transmission map "${map.name}".`);
  }

  function beginDesignDrawing(geometryType: DesignAssetGeometryType) {
    if (!designFeaturesEnabled) {
      setDesignModeEnabled(true);
      setStreetLayers((current) => ({ ...current, designAssets: true }));
      setRightMode("design");
      setRightCollapsed(false);
      showToast("Design Mode enabled. Choose a schema type, then draw on the map.");
      return;
    }
    if (geometryType === "table_only") {
      showToast("Table-only design assets do not have map geometry.");
      return;
    }
    const currentType = designAssetTypes.find((item) => item.slug === selectedDesignAssetTypeSlug);
    const compatibleType = currentType?.geometry_type === geometryType
      ? currentType
      : designAssetTypes.find((item) => item.geometry_type === geometryType && item.status === "active");
    if (!compatibleType) {
      setRightMode("design");
      setRightCollapsed(false);
      showToast(`Create or select a ${geometryType} asset type before drawing.`);
      return;
    }
    setSelectedDesignAssetTypeSlug(compatibleType.slug);
    setPendingDesignGeometry(null);
    setDesignDrawingCoordinates([]);
    setStreetLayers((current) => ({ ...current, designAssets: true }));
    setRightMode("design");
    setRightCollapsed(false);
    setActiveTool(designToolForGeometryType(geometryType));
    showToast(geometryType === "point" ? "Click the map to place or move this editable point." : `Click the map to add ${geometryType} vertices, then finish drawing in the Design drawer.`);
  }

  function cancelDesignDraft() {
    setPendingDesignGeometry(null);
    setDesignDrawingCoordinates([]);
    if (isDesignDrawingTool(activeTool)) setActiveTool("select");
    showToast("Canceled unsaved Design/Edit geometry.");
  }

  function finishDesignDrawing() {
    if (!pendingDesignGeometry) {
      showToast("No Design/Edit geometry is staged yet.");
      return;
    }
    setActiveTool("select");
    setDesignAssetMessage("Geometry staged. Review attributes and save the record.");
    showToast("Design/Edit geometry staged. Review attributes and save.");
  }

  function startNewDesignRecord() {
    setSelectedAsset((current) => current?.kind === "design_asset_record" ? null : current);
    setPendingDesignGeometry(null);
    setDesignDrawingCoordinates([]);
    if (isDesignDrawingTool(activeTool)) setActiveTool("select");
    setRightMode("design");
    setRightCollapsed(false);
    showToast("Started a new editable planning asset.");
  }

  function selectDesignAssetRecord(record: DesignAssetRecord) {
    const selection: StreetMapSelection = { kind: "design_asset_record", id: String(record.id), label: record.display_label || record.record_key, record };
    setSelectedAsset(selection);
    setStreetLayers((current) => ({ ...current, designAssets: true }));
    if (record.geometry || record.geometry_json) {
      setFocusRequest({ selection, sequence: Date.now() });
    }
    setRightMode("design");
    setRightCollapsed(false);
  }

  function stageDesignVertex(coordinate: Coordinate, geometryType: "line" | "polygon") {
    const activeType = designAssetTypes.find((item) => item.slug === selectedDesignAssetTypeSlug) || designAssetTypes.find((item) => item.geometry_type === geometryType);
    if (!activeType || activeType.geometry_type !== geometryType) {
      setRightMode("design");
      setRightCollapsed(false);
      showToast(`Choose a ${geometryType} asset type in Design/Edit before drawing.`);
      return;
    }
    const nextCoordinates = [...designDrawingCoordinates, coordinate];
    setSelectedDesignAssetTypeSlug(activeType.slug);
    setDesignDrawingCoordinates(nextCoordinates);
    setStreetLayers((current) => ({ ...current, designAssets: true }));
    setRightMode("design");
    setRightCollapsed(false);
    if (geometryType === "line") {
      if (nextCoordinates.length >= 2) setPendingDesignGeometry({ type: "LineString", coordinates: nextCoordinates });
      showToast(nextCoordinates.length >= 2 ? `${nextCoordinates.length} line vertices staged. Finish drawing when ready.` : "First line vertex staged. Click at least one more point.");
      return;
    }
    if (nextCoordinates.length >= 3) setPendingDesignGeometry({ type: "Polygon", coordinates: [closedCoordinateRing(nextCoordinates)] });
    showToast(nextCoordinates.length >= 3 ? `${nextCoordinates.length} polygon vertices staged. Finish drawing when ready.` : `Polygon vertex ${nextCoordinates.length} staged. Add at least ${3 - nextCoordinates.length} more.`);
  }

  function handleMapClick(coordinate: Coordinate) {
    if (activeTool === "add_substation") {
      setDraftSubstation(createSubstationDraft(coordinate));
      openEditorDrawer();
      showToast("Substation point staged. Complete the right-side editor.");
      return;
    }
    if (activeTool === "add_device_node" || activeTool === "add_fiber_node") {
      setDraftNode(createNodeDraft(coordinate, activeMap.id, addAssetKind));
      openEditorDrawer();
      showToast(`${addAssetLabel(addAssetKind)} point staged. Complete node parameters.`);
      return;
    }
    if (activeTool === "place_missing" && placementTarget) {
      placeMissingAsset(coordinate);
      return;
    }
    if (activeTool === "draw_design_point") {
      const activeType = designAssetTypes.find((item) => item.slug === selectedDesignAssetTypeSlug) || designAssetTypes.find((item) => item.geometry_type === "point");
      if (!activeType || activeType.geometry_type !== "point") {
        setRightMode("design");
        setRightCollapsed(false);
        showToast("Choose a point asset type in Design/Edit before placing a point.");
        return;
      }
      setSelectedDesignAssetTypeSlug(activeType.slug);
      setPendingDesignGeometry({ type: "Point", coordinates: coordinate });
      setStreetLayers((current) => ({ ...current, designAssets: true }));
      setRightMode("design");
      setRightCollapsed(false);
      setActiveTool("select");
      showToast("Point geometry staged. Complete the schema-generated form.");
      return;
    }
    if (activeTool === "draw_design_line") {
      stageDesignVertex(coordinate, "line");
      return;
    }
    if (activeTool === "draw_design_polygon") {
      stageDesignVertex(coordinate, "polygon");
      return;
    }
    if (activeTool.startsWith("draw_") || activeTool.includes("geometry")) {
      openEditorDrawer();
      showToast("Line, fiber path, and polygon drawing are staged as the next implementation pass.");
    }
  }

  function placeMissingAsset([longitude, latitude]: Coordinate) {
    if (!placementTarget) return;
    if (placementTarget.type === "substation") {
      const record = { ...placementTarget.record, latitude, longitude };
      setSubstations((current) => current.map((substation) => substation.id === placementTarget.id ? record : substation));
      setSelectedAsset({ kind: "substation", id: placementTarget.id, label: placementTarget.label, record });
    } else {
      const record = { ...placementTarget.record, latitude, longitude };
      setNodes((current) => current.map((node) => node.id === placementTarget.id ? record : node));
      setSelectedAsset({ kind: "node", id: placementTarget.id, label: placementTarget.label, record });
    }
    setRightMode("details");
    setRightCollapsed(false);
    showToast(`${placementTarget.label} placed with street-level lat/lon.`);
    setPlacementTarget(null);
    setActiveTool("select");
    issueMapCommand("resize");
  }

  function handleSaveSubstation(substation: Substation) {
    setSubstations((current) => [substation, ...current.filter((item) => item.id !== substation.id)]);
    focusSelection({ kind: "substation", id: substation.id, label: substation.name, record: substation });
    setDraftSubstation(null);
    setAddAssetKind(null);
    setActiveTool("select");
    showToast(`Saved substation "${substation.name}" as private planning data.`);
  }

  function handleSaveNode(node: MapNode) {
    setNodes((current) => [node, ...current.filter((item) => item.id !== node.id)]);
    focusSelection({ kind: "node", id: node.id, label: node.name, record: node });
    setDraftNode(null);
    setAddAssetKind(null);
    setActiveTool("select");
    showToast(`Saved node "${node.name}" with configurable parameters.`);
  }

  function focusSelection(selection: StreetMapSelection) {
    if (selection.kind === "design_asset_record") {
      setPendingDesignGeometry(null);
      setDesignDrawingCoordinates([]);
      if (isDesignDrawingTool(activeTool)) setActiveTool("select");
    }
    setSelectedAsset(selection);
    setFocusRequest({ selection: focusTargetForSelection(selection), sequence: Date.now() });
    setRightMode("details");
    setRightCollapsed(false);
  }

  function focusTargetForSelection(selection: StreetMapSelection): StreetMapSelection {
    if (selection.kind === "fiber_assignment") {
      const cable = visibleOpgwCables.find((feature) => selection.record.cableIds.includes(feature.properties.id));
      if (cable) return { kind: "opgw_cable", id: cable.properties.id, label: cable.properties.cableName, record: cable };
    }
    if (selection.kind === "patch_panel" && selection.record.locationType === "structure") {
      const structure = visibleTransmissionStructures.find((feature) => feature.properties.id === selection.record.locationId);
      if (structure) return { kind: "transmission_structure", id: structure.properties.id, label: structure.properties.structureNumber, record: structure };
    }
    return selection;
  }

  function focusSearchResult(selection: StreetMapSelection) {
    if (selection.kind === "fiber_assignment" && searchLayerFilter === "strandContinuity") {
      const record = strandContinuityRecords.find((item) => item.assignmentId === selection.id || item.id === selection.id || item.strandContinuityId === selection.id);
      if (record && focusStrandContinuityRecord(record)) {
        setSearch(selection.label);
        setSearchOpen(false);
        setActiveSearchIndex(0);
        return;
      }
    }
    if (isDistributionSelectionKind(selection.kind) || selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") {
      setStreetLayers((current) => withDistributionNetworkLayerState(current, true));
    }
    if (selection.kind === "design_asset_record") {
      setStreetLayers((current) => ({ ...current, designAssets: true }));
      setRightMode("details");
      setRightCollapsed(false);
    }
    focusSelection(selection);
    setSearch(selection.label);
    setSearchOpen(false);
    setActiveSearchIndex(0);
    showToast(`Zoomed to ${selection.label}.`);
  }

  function handleGlobalSearchChange(value: string) {
    setSearch(value);
    setSearchOpen(Boolean(value.trim()));
  }

  function handleSearchLayerFilterChange(layer: DashboardSearchLayer) {
    setIsolatedCircuitId(null);
    setSearchLayerFilter(layer);
    setVisibilityFilter(visibilityForSearchLayer(layer));
  }

  function handleGlobalSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSearchOpen(false);
      return;
    }
    if (!mapSearchResults.length) {
      if (event.key === "Enter" && search.trim()) showToast("No map asset matched that search.");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((current) => Math.min(current + 1, mapSearchResults.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      focusSearchResult(mapSearchResults[Math.min(activeSearchIndex, mapSearchResults.length - 1)]);
    }
  }

  function handleMapSelect(selection: StreetMapSelection) {
    if (selection.kind === "design_asset_record") {
      setContinuityHighlight(undefined);
      setPendingDesignGeometry(null);
      setDesignDrawingCoordinates([]);
      if (isDesignDrawingTool(activeTool)) setActiveTool("select");
      setSelectedAsset(selection);
      setStreetLayers((current) => ({ ...current, designAssets: true }));
      setRightMode("details");
      setRightCollapsed(false);
      return;
    }
    const nextHighlight = continuityHighlightForSelection(selection);
    if (nextHighlight) {
      setContinuityHighlight(nextHighlight);
      setStreetLayers((current) => selection.kind === "fiber_assignment" && current.strandContinuity
        ? strandContinuityLayerState(current, { includeDevices: current.telecomNodes || current.selIconNodes || current.c3794Nodes })
        : ({
          ...current,
          syntheticOpgwCables: true,
          opgwRoutes: true,
          opgwCableSections: true,
          opgwSplicePoints: true,
          fiberAssignments: true,
          criticalRidingCircuits: true,
        }));
    } else {
      setContinuityHighlight(undefined);
    }
    setSelectedAsset(selection);
    setRightMode("details");
    setRightCollapsed(false);
  }

  function handleCloseAssetDetail() {
    setSelectedAsset(null);
    setRightMode("summary");
    setRightCollapsed(true);
    showToast("Closed asset details.");
  }

  function handleStreetLayerChange(layer: StreetMapLayerKey, enabled: boolean) {
    if (layer === "strandContinuity") {
      if (enabled) {
        const firstRecord = strandContinuityRecords[0];
        if (firstRecord && focusStrandContinuityRecord(firstRecord)) return;
      } else {
        setContinuityHighlight(undefined);
        setIsolatedCircuitId(null);
        setSearchLayerFilter("all");
        setVisibilityFilter("all");
      }
    }
    setIsolatedCircuitId(null);
    setStreetLayers((current) => ({ ...current, [layer]: enabled }));
    applyDashboardLayerFilterContext(layer, enabled);
  }

  function handleDistributionLayerGroupChange(enabled: boolean) {
    setStreetLayers((current) => withDistributionNetworkLayerState(current, enabled));
    if (enabled) {
      setSearchLayerFilter("distributionFiberRoutes");
      setVisibilityFilter("synthetic-demo");
      showToast("Distribution Network layer enabled.");
      return;
    }
    setSearchLayerFilter((current) => current === "distributionFiberRoutes" ? "all" : current);
    setVisibilityFilter("all");
    showToast("Distribution Network layer hidden.");
  }

  function applyDashboardLayerFilterContext(layer: StreetMapLayerKey, enabled: boolean) {
    const searchLayer = searchLayerForStreetLayer(layer);
    if (enabled) {
      if (searchLayer) setSearchLayerFilter(searchLayer);
      setVisibilityFilter(visibilityForStreetLayer(layer));
      return;
    }
    if (searchLayer) {
      setSearchLayerFilter((current) => current === searchLayer ? "all" : current);
    }
    setVisibilityFilter("all");
  }

  function handleGisApiBaseChange(value: string) {
    const nextBase = saveGisApiBase(value);
    setGisApiBase(nextBase);
    setServerGisSearchResults([]);
    showToast(nextBase === API_BASE ? "Using the website GIS backend." : `Using GIS source ${nextBase}.`);
  }

  function handleResetGisApiBase() {
    const nextBase = clearStoredGisApiBase();
    setGisApiBase(nextBase);
    setServerGisSearchResults([]);
    showToast("Using the website GIS backend.");
  }

  function enableGisScaleLayers() {
    setStreetLayers((current) => withDistributionNetworkLayerState(current, true));
    setRightCollapsed(false);
    setRightMode("scale");
    showToast("Distribution Network GIS-scale layer enabled. Individual poles render only at street zoom from server tiles.");
  }

  function focusOpgwRouteLayer(routeId: string) {
    const route = visibleOpgwRoutes.find((feature) => feature.properties.opgwRouteId === routeId);
    if (!route) {
      showToast("That OPGW route is not available in the current layer set.");
      return;
    }
    const selection: StreetMapSelection = { kind: "opgw_route", id: route.properties.opgwRouteId, label: route.properties.routeName, record: route };
    setIsolatedOpgwRouteId(route.properties.opgwRouteId);
    setIsolatedOpgwSectionId(null);
    setIsolatedOpgwSplicePointId(null);
    setContinuityHighlight({
      label: route.properties.routeName,
      assignmentIds: [],
      cableIds: visibleOpgwCables.filter((cable) => opgwRouteIdForDashboardCable(cable) === route.properties.opgwRouteId).map((cable) => cable.properties.id),
      routeIds: [route.properties.opgwRouteId],
      sectionIds: visibleOpgwCableSections.filter((section) => section.properties.opgwRouteId === route.properties.opgwRouteId).map((section) => section.properties.cableSectionId),
      splicePointIds: visibleOpgwSplicePoints.filter((point) => point.properties.opgwRouteId === route.properties.opgwRouteId).map((point) => point.properties.splicePointId),
    });
    setSelectedAsset(selection);
    setFocusRequest({ selection, sequence: Date.now() });
    setStreetLayers((current) => isolatedOpgwLayerState(current, ["opgwRoutes", "opgwCableSections", "opgwSplicePoints"]));
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing OPGW transmission line ${route.properties.transmissionLineId} with splice points.`);
  }

  function focusOpgwCableSectionLayer(sectionId: string) {
    const section = visibleOpgwCableSections.find((feature) => feature.properties.cableSectionId === sectionId);
    if (!section) {
      showToast("That OPGW cable section is not available in the current layer set.");
      return;
    }
    const selection: StreetMapSelection = { kind: "opgw_cable_section", id: section.properties.cableSectionId, label: section.properties.cableSectionId, record: section };
    setIsolatedOpgwRouteId(section.properties.opgwRouteId);
    setIsolatedOpgwSectionId(section.properties.cableSectionId);
    setIsolatedOpgwSplicePointId(null);
    setContinuityHighlight(buildContinuityHighlightForCableSection(section));
    setSelectedAsset(selection);
    setFocusRequest({ selection, sequence: Date.now() });
    setStreetLayers((current) => isolatedOpgwLayerState(current, ["opgwRoutes", "opgwCableSections", "opgwSplicePoints"]));
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing only cable section ${section.properties.cableSectionId}.`);
  }

  function focusOpgwSplicePointLayer(splicePointId: string) {
    const splicePoint = visibleOpgwSplicePoints.find((feature) => feature.properties.splicePointId === splicePointId);
    if (!splicePoint) {
      showToast("That OPGW splice point is not available in the current layer set.");
      return;
    }
    const selection: StreetMapSelection = { kind: "opgw_splice_point", id: splicePoint.properties.splicePointId, label: splicePoint.properties.splicePointId, record: splicePoint };
    setIsolatedOpgwRouteId(splicePoint.properties.opgwRouteId);
    setIsolatedOpgwSectionId(null);
    setIsolatedOpgwSplicePointId(splicePoint.properties.splicePointId);
    setContinuityHighlight(buildContinuityHighlightForSplicePoint(splicePoint));
    setSelectedAsset(selection);
    setFocusRequest({ selection, sequence: Date.now() });
    setStreetLayers((current) => isolatedOpgwLayerState(current, ["opgwRoutes", "opgwCableSections", "opgwSplicePoints"]));
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing only splice point ${splicePoint.properties.splicePointId}.`);
  }

  function focusSpliceConnectionLayer(spliceConnectionId: string) {
    const splice = fiberSplices.find((row) => row.id === spliceConnectionId);
    if (!splice) {
      showToast("That splice connection is not available in the current synthetic splice data.");
      return;
    }
    const parentSplicePoint = visibleOpgwSplicePoints.find((point) => point.properties.closureId === splice.spliceClosureId);
    const selection: StreetMapSelection | null = parentSplicePoint
      ? { kind: "opgw_splice_point", id: parentSplicePoint.properties.splicePointId, label: parentSplicePoint.properties.splicePointId, record: parentSplicePoint }
      : null;
    const highlight = buildContinuityHighlightForSpliceConnection(splice);
    setContinuityHighlight(highlight);
    setIsolatedOpgwRouteId(highlight.routeIds?.[0] || null);
    setIsolatedOpgwSectionId(null);
    setIsolatedOpgwSplicePointId(parentSplicePoint?.properties.splicePointId || null);
    if (selection) {
      setSelectedAsset(selection);
      setFocusRequest({ selection, sequence: Date.now() });
    }
    setStreetLayers((current) => ({
      ...current,
      opgwRoutes: true,
      opgwCableSections: true,
      opgwSplicePoints: true,
      spliceClosures: true,
      existingFiberSplices: true,
      proposedFiberSplices: true,
      compareSpliceLayers: true,
      fiberAssignments: true,
      criticalRidingCircuits: true,
    }));
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing map continuity for splice connection ${spliceConnectionId}.`);
  }

  function continuityHighlightForSelection(selection: StreetMapSelection): ContinuityHighlight | undefined {
    if (selection.kind === "opgw_splice_point") return buildContinuityHighlightForSplicePoint(selection.record);
    if (selection.kind === "opgw_cable") return buildContinuityHighlightForCable(selection.record);
    if (selection.kind === "opgw_cable_section") return buildContinuityHighlightForCableSection(selection.record);
    if (selection.kind === "fiber_assignment") return buildContinuityHighlightForAssignment(selection.record);
    return undefined;
  }

  function buildContinuityHighlightForService(service: SyntheticService): ContinuityHighlight {
    const assignmentIds = uniqueStrings([service.primaryPathAssignmentId, service.backupPathAssignmentId]);
    const cableIds = new Set(service.continuityCableIds || []);
    visibleFiberAssignments
      .filter((assignment) => assignmentIds.includes(assignment.id))
      .forEach((assignment) => assignment.cableIds.forEach((cableId) => cableIds.add(cableId)));
    const routeIds = routeIdsForCableIds(cableIds);
    const sectionIds = visibleOpgwCableSections
      .filter((section) => routeIds.has(section.properties.opgwRouteId))
      .map((section) => section.properties.cableSectionId);
    const splicePointIds = new Set(service.continuitySplicePointIds || []);
    service.continuitySpliceClosureIds?.forEach((closureId) => {
      const point = visibleOpgwSplicePoints.find((item) => item.properties.closureId === closureId);
      if (point) splicePointIds.add(point.properties.splicePointId);
    });
    visibleOpgwCableSections
      .filter((section) => sectionIds.includes(section.properties.cableSectionId))
      .forEach((section) => {
        splicePointIds.add(section.properties.fromSplicePointId);
        splicePointIds.add(section.properties.toSplicePointId);
      });
    return {
      label: service.serviceId,
      serviceId: service.serviceId,
      assignmentIds,
      cableIds: Array.from(cableIds),
      routeIds: Array.from(routeIds),
      sectionIds,
      splicePointIds: Array.from(splicePointIds),
    };
  }

  function buildContinuityHighlightForCable(cable: OpgwCableFeature): ContinuityHighlight {
    const routeId = opgwRouteIdForDashboardCable(cable);
    const sections = visibleOpgwCableSections.filter((section) => section.properties.opgwRouteId === routeId);
    const sectionIds = sections.map((section) => section.properties.cableSectionId);
    const splicePointIds = splicePointIdsFromSections(sections);
    const assignmentIds = visibleFiberAssignments
      .filter((assignment) => assignment.cableIds.includes(cable.properties.id))
      .map((assignment) => assignment.id);
    syntheticServices
      .filter((service) => service.continuityCableIds?.includes(cable.properties.id))
      .forEach((service) => uniqueStrings([service.primaryPathAssignmentId, service.backupPathAssignmentId]).forEach((assignmentId) => assignmentIds.push(assignmentId)));
    return {
      label: cable.properties.cableName,
      assignmentIds: uniqueStrings(assignmentIds),
      cableIds: [cable.properties.id],
      routeIds: [routeId],
      sectionIds,
      splicePointIds,
    };
  }

  function buildContinuityHighlightForCableSection(section: OpgwCableSectionFeature): ContinuityHighlight {
    const cableIds = visibleOpgwCables
      .filter((cable) => opgwRouteIdForDashboardCable(cable) === section.properties.opgwRouteId)
      .map((cable) => cable.properties.id);
    const assignmentIds = visibleFiberAssignments
      .filter((assignment) => assignment.cableIds.some((cableId) => cableIds.includes(cableId)))
      .map((assignment) => assignment.id);
    return {
      label: section.properties.cableSectionId,
      assignmentIds,
      cableIds,
      routeIds: [section.properties.opgwRouteId],
      sectionIds: [section.properties.cableSectionId],
      splicePointIds: [section.properties.fromSplicePointId, section.properties.toSplicePointId],
    };
  }

  function buildContinuityHighlightForSplicePoint(splicePoint: OpgwSplicePointFeature): ContinuityHighlight {
    const directSections = visibleOpgwCableSections.filter((section) =>
      section.properties.fromSplicePointId === splicePoint.properties.splicePointId
      || section.properties.toSplicePointId === splicePoint.properties.splicePointId
      || splicePoint.properties.associatedCableSectionIds.includes(section.properties.cableSectionId)
    );
    const routeIds = new Set([splicePoint.properties.opgwRouteId, ...directSections.map((section) => section.properties.opgwRouteId)]);
    const cableIds = visibleOpgwCables
      .filter((cable) => routeIds.has(opgwRouteIdForDashboardCable(cable)))
      .map((cable) => cable.properties.id);
    const services = syntheticServices.filter((service) => {
      if (service.continuitySplicePointIds?.includes(splicePoint.properties.splicePointId)) return true;
      if (splicePoint.properties.closureId && service.continuitySpliceClosureIds?.includes(splicePoint.properties.closureId)) return true;
      return service.continuityCableIds?.some((cableId) => cableIds.includes(cableId)) || false;
    });
    const assignmentIds = uniqueStrings([
      ...services.flatMap((service) => [service.primaryPathAssignmentId, service.backupPathAssignmentId]),
      ...visibleFiberAssignments
        .filter((assignment) => assignment.cableIds.some((cableId) => cableIds.includes(cableId)))
        .map((assignment) => assignment.id),
    ]);
    const splicePointIds = new Set([splicePoint.properties.splicePointId, ...splicePointIdsFromSections(directSections)]);
    services.forEach((service) => {
      service.continuitySplicePointIds?.forEach((pointId) => splicePointIds.add(pointId));
      service.continuitySpliceClosureIds?.forEach((closureId) => {
        const point = visibleOpgwSplicePoints.find((item) => item.properties.closureId === closureId);
        if (point) splicePointIds.add(point.properties.splicePointId);
      });
    });
    return {
      label: splicePoint.properties.splicePointId,
      assignmentIds,
      cableIds,
      routeIds: Array.from(routeIds),
      sectionIds: directSections.map((section) => section.properties.cableSectionId),
      splicePointIds: Array.from(splicePointIds),
    };
  }

  function buildContinuityHighlightForSpliceConnection(splice: FiberSplice): ContinuityHighlight {
    const parentSplicePoint = visibleOpgwSplicePoints.find((point) => point.properties.closureId === splice.spliceClosureId);
    const assignmentIds = uniqueStrings([splice.assignmentId]);
    const cableIds = new Set<string>();
    const routeIds = new Set<string>();
    const sectionIds = new Set<string>();
    [splice.fromCableId, splice.toCableId].forEach((id) => {
      if (!id) return;
      const cable = visibleOpgwCables.find((feature) => feature.properties.id === id);
      const section = visibleOpgwCableSections.find((feature) => feature.properties.cableSectionId === id);
      if (cable) {
        cableIds.add(cable.properties.id);
        routeIds.add(opgwRouteIdForDashboardCable(cable));
      }
      if (section) {
        sectionIds.add(section.properties.cableSectionId);
        routeIds.add(section.properties.opgwRouteId);
      }
    });
    if (parentSplicePoint) routeIds.add(parentSplicePoint.properties.opgwRouteId);
    const services = syntheticServices.filter((service) => {
      if (splice.assignmentId && (service.primaryPathAssignmentId === splice.assignmentId || service.backupPathAssignmentId === splice.assignmentId)) return true;
      if (service.continuitySpliceClosureIds?.includes(splice.spliceClosureId)) return true;
      return service.continuityCableIds?.some((id) => cableIds.has(id) || id === splice.fromCableId || id === splice.toCableId) || false;
    });
    services.forEach((service) => {
      uniqueStrings([service.primaryPathAssignmentId, service.backupPathAssignmentId]).forEach((assignmentId) => assignmentIds.push(assignmentId));
      service.continuityCableIds?.forEach((id) => cableIds.add(id));
      service.continuitySplicePointIds?.forEach((pointId) => {
        const point = visibleOpgwSplicePoints.find((item) => item.properties.splicePointId === pointId);
        if (point) routeIds.add(point.properties.opgwRouteId);
      });
    });
    visibleOpgwCables
      .filter((cable) => cableIds.has(cable.properties.id))
      .forEach((cable) => routeIds.add(opgwRouteIdForDashboardCable(cable)));
    visibleOpgwCableSections
      .filter((section) => routeIds.has(section.properties.opgwRouteId))
      .forEach((section) => sectionIds.add(section.properties.cableSectionId));
    const splicePointIds = new Set(parentSplicePoint ? [parentSplicePoint.properties.splicePointId] : []);
    visibleOpgwCableSections
      .filter((section) => sectionIds.has(section.properties.cableSectionId))
      .forEach((section) => {
        splicePointIds.add(section.properties.fromSplicePointId);
        splicePointIds.add(section.properties.toSplicePointId);
      });
    services.forEach((service) => {
      service.continuitySplicePointIds?.forEach((pointId) => splicePointIds.add(pointId));
      service.continuitySpliceClosureIds?.forEach((closureId) => {
        const point = visibleOpgwSplicePoints.find((item) => item.properties.closureId === closureId);
        if (point) splicePointIds.add(point.properties.splicePointId);
      });
    });
    return {
      label: splice.id,
      assignmentIds: uniqueStrings(assignmentIds),
      cableIds: Array.from(cableIds),
      routeIds: Array.from(routeIds),
      sectionIds: Array.from(sectionIds),
      splicePointIds: Array.from(splicePointIds),
    };
  }

  function buildContinuityHighlightForAssignment(assignment: FiberAssignment): ContinuityHighlight {
    const cableIds = new Set(assignment.cableIds);
    const routeIds = routeIdsForCableIds(cableIds);
    const sections = visibleOpgwCableSections.filter((section) => routeIds.has(section.properties.opgwRouteId));
    return {
      label: assignment.assignmentName,
      assignmentIds: [assignment.id],
      cableIds: Array.from(cableIds),
      routeIds: Array.from(routeIds),
      sectionIds: sections.map((section) => section.properties.cableSectionId),
      splicePointIds: splicePointIdsFromSections(sections),
    };
  }

  function buildContinuityHighlightForStrandRecord(record: StrandContinuityRecord): ContinuityHighlight {
    const cableIds = new Set(record.cableIds);
    const routeIds = routeIdsForCableIds(cableIds);
    const sections = visibleOpgwCableSections.filter((section) => routeIds.has(section.properties.opgwRouteId));
    const splicePointIds = new Set(splicePointIdsFromSections(sections));
    const spliceClosureIds = new Set(record.spliceClosureIds);
    visibleOpgwSplicePoints.forEach((point) => {
      if (spliceClosureIds.has(point.properties.closureId || "")) splicePointIds.add(point.properties.splicePointId);
    });
    return {
      label: record.strandContinuityId || record.id,
      serviceId: record.serviceId,
      assignmentIds: uniqueStrings([record.assignmentId]),
      cableIds: Array.from(cableIds),
      routeIds: Array.from(routeIds),
      sectionIds: sections.map((section) => section.properties.cableSectionId),
      splicePointIds: Array.from(splicePointIds),
    };
  }

  function focusStrandContinuityRecord(record: StrandContinuityRecord, options: StrandContinuityFocusOptions = {}) {
    if (!visibleOpgwCables.length && !visibleFiberAssignments.length) return false;
    const includeDevices = options.includeDevices ?? true;
    const highlight = buildContinuityHighlightForStrandRecord(record);
    const assignment = visibleFiberAssignments.find((item) => item.id === record.assignmentId);
    const cable = visibleOpgwCables.find((feature) => record.cableIds.includes(feature.properties.id));
    const section = visibleOpgwCableSections.find((feature) => highlight.sectionIds?.includes(feature.properties.cableSectionId));
    const selection: StreetMapSelection | null = assignment
      ? { kind: "fiber_assignment", id: assignment.id, label: assignment.assignmentName, record: assignment }
      : cable
        ? { kind: "opgw_cable", id: cable.properties.id, label: cable.properties.cableName, record: cable }
        : section
          ? { kind: "opgw_cable_section", id: section.properties.cableSectionId, label: section.properties.cableSectionId, record: section }
          : null;
    if (!selection) return false;
    setContinuityHighlight(highlight);
    setSelectedAsset(selection);
    setFocusRequest({ selection: focusTargetForSelection(selection), sequence: Date.now() });
    setIsolatedOpgwRouteId(highlight.routeIds?.[0] || null);
    setIsolatedOpgwSectionId(highlight.sectionIds?.[0] || null);
    setIsolatedOpgwSplicePointId(highlight.splicePointIds[0] || null);
    setStreetLayers((current) => strandContinuityLayerState(current, { includeDevices }));
    setSearchLayerFilter("strandContinuity");
    setVisibilityFilter("synthetic-demo");
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Strand View isolated for ${record.strandContinuityId || record.id}${includeDevices ? "" : " without device layers"}.`);
    return true;
  }

  function focusCircuitRoute(circuitId: string) {
    const target = circuitRouteTargetForQuery(circuitId, syntheticServices, syntheticFiberAssignments, visibleDistributionFiberAssignments, legacyTelecomCircuits);
    if (!target) {
      showToast(`No synthetic fiber route matched circuit ${circuitId}.`);
      return false;
    }
    const highlight = buildContinuityHighlightForCircuitTarget(target, circuitId);
    const selection = circuitRouteSelection(target, highlight, circuitId);
    if (!selection) {
      showToast(`Circuit ${circuitId} does not have generated map geometry yet.`);
      return false;
    }
    setIsolatedCircuitId(circuitId);
    setIsolatedOpgwRouteId(null);
    setIsolatedOpgwSectionId(null);
    setIsolatedOpgwSplicePointId(null);
    setContinuityHighlight(highlight);
    setSelectedAsset(selection);
    setFocusRequest({ selection, sequence: Date.now() });
    setStreetLayers((current) => circuitRouteLayerState(current, circuitRouteLayerFamily(target, highlight)));
    setSearch(target.service?.serviceId || target.service?.circuitId || target.assignments[0]?.id || circuitId);
    setSearchLayerFilter(selection.kind === "distribution_fiber_assignment" ? "distributionFiberRoutes" : "strandContinuity");
    setVisibilityFilter("synthetic-demo");
    setSearchOpen(false);
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing full circuit route for ${highlight.label}. Other map layers are hidden.`);
    return true;
  }

  function buildContinuityHighlightForCircuitTarget(target: CircuitRouteTarget, fallbackLabel: string): ContinuityHighlight {
    const assignmentIds = new Set(target.assignments.map((assignment) => assignment.id));
    uniqueStrings([target.service?.primaryPathAssignmentId, target.service?.backupPathAssignmentId]).forEach((assignmentId) => assignmentIds.add(assignmentId));
    const cableIds = new Set<string>(target.service?.continuityCableIds || []);
    target.assignments.forEach((assignment) => assignment.cableIds.forEach((cableId) => cableIds.add(cableId)));
    const routeIds = routeIdsForCableIds(cableIds);
    const sections = visibleOpgwCableSections.filter((section) => routeIds.has(section.properties.opgwRouteId));
    const sectionIds = new Set(sections.map((section) => section.properties.cableSectionId));
    const splicePointIds = new Set<string>(target.service?.continuitySplicePointIds || []);
    target.service?.continuitySpliceClosureIds?.forEach((closureId) => {
      const point = visibleOpgwSplicePoints.find((item) => item.properties.closureId === closureId);
      if (point) splicePointIds.add(point.properties.splicePointId);
    });
    sections.forEach((section) => {
      splicePointIds.add(section.properties.fromSplicePointId);
      splicePointIds.add(section.properties.toSplicePointId);
    });
    return {
      label: target.service?.serviceId || target.service?.circuitId || target.assignments[0]?.assignmentName || fallbackLabel,
      serviceId: target.service?.serviceId,
      assignmentIds: Array.from(assignmentIds),
      cableIds: Array.from(cableIds),
      routeIds: Array.from(routeIds),
      sectionIds: Array.from(sectionIds),
      splicePointIds: Array.from(splicePointIds),
    };
  }

  function circuitRouteSelection(target: CircuitRouteTarget, highlight: ContinuityHighlight, fallbackLabel: string): StreetMapSelection | null {
    if (target.distributionAssignment) {
      return {
        kind: "distribution_fiber_assignment",
        id: target.distributionAssignment.properties.id,
        label: target.distributionAssignment.properties.assignmentName,
        record: target.distributionAssignment,
      };
    }
    const primaryAssignment = target.assignments[0];
    const coordinates = primaryAssignment?.mapCoordinates?.length
      ? primaryAssignment.mapCoordinates
      : cableCoordinateSets(highlight.cableIds);
    const routeAssignment: FiberAssignment = primaryAssignment
      ? {
        ...primaryAssignment,
        assignmentName: target.service ? `${target.service.serviceId} full route` : primaryAssignment.assignmentName,
        cableIds: uniqueStrings([...primaryAssignment.cableIds, ...highlight.cableIds]),
        mapCoordinates: coordinates,
      }
      : {
        id: target.service?.primaryPathAssignmentId || target.service?.serviceId || fallbackLabel,
        assignmentName: target.service?.serviceName || fallbackLabel,
        synthetic: true,
        serviceType: fiberAssignmentServiceTypeForCircuit(target.service?.serviceType),
        status: assignmentStatusForCircuit(target.service?.operationalStatus),
        cableIds: highlight.cableIds,
        strandSegments: [],
        spliceIds: [],
        estimatedDistanceMiles: undefined,
        estimatedLossDb: undefined,
        mapCoordinates: coordinates,
        notes: "Synthetic dashboard-only circuit route selection generated from service continuity metadata.",
      };
    if (coordinates.length) {
      return { kind: "fiber_assignment", id: routeAssignment.id, label: routeAssignment.assignmentName, record: routeAssignment };
    }
    const cable = visibleOpgwCables.find((feature) => highlight.cableIds.includes(feature.properties.id));
    if (cable) return { kind: "opgw_cable", id: cable.properties.id, label: cable.properties.cableName, record: cable };
    const section = visibleOpgwCableSections.find((feature) => highlight.sectionIds?.includes(feature.properties.cableSectionId));
    if (section) return { kind: "opgw_cable_section", id: section.properties.cableSectionId, label: section.properties.cableSectionId, record: section };
    return null;
  }

  function circuitRouteLayerFamily(target: CircuitRouteTarget, highlight: ContinuityHighlight): "opgw" | "distribution" | "line" {
    if (target.distributionAssignment) return "distribution";
    if (highlight.cableIds.length || highlight.routeIds?.length || highlight.sectionIds?.length) return "opgw";
    return "line";
  }

  function cableCoordinateSets(cableIds: string[]): Coordinate[][] {
    const wanted = new Set(cableIds);
    return visibleOpgwCables
      .filter((feature) => wanted.has(feature.properties.id))
      .flatMap((feature) => feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates);
  }

  function routeIdsForCableIds(cableIds: Set<string>) {
    return new Set(
      visibleOpgwCables
        .filter((cable) => cableIds.has(cable.properties.id))
        .map((cable) => opgwRouteIdForDashboardCable(cable)),
    );
  }

  useEffect(() => {
    if (deepLinkFocusApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const splicePointId = params.get("splicePoint");
    const spliceConnectionId = params.get("spliceConnection") || params.get("spliceConnectionId");
    const cableSectionId = params.get("cableSection") || params.get("cableSectionId");
    const cableId = params.get("cable");
    const serviceId = params.get("service");
    const circuitId = params.get("circuit") || params.get("circuitId") || params.get("fullCircuitRoute");
    const strandContinuityId = params.get("strandContinuity") || params.get("strandContinuityId");
    const includeContinuityDevices = !shouldHideContinuityDevices(params);
    const distributionPoleId = params.get("distributionPole") || params.get("distributionPoleId");
    const distributionRouteId = params.get("distributionRoute") || params.get("distributionRouteId");

    if (strandContinuityId) {
      if (!strandContinuityRecords.length || (!visibleFiberAssignments.length && !visibleOpgwCables.length)) return;
      const record = strandContinuityRecords.find((item) =>
        item.id === strandContinuityId
        || item.strandContinuityId === strandContinuityId
        || item.assignmentId === strandContinuityId
        || item.serviceId === strandContinuityId
      );
      if (!record) return;
      if (!focusStrandContinuityRecord(record, { includeDevices: includeContinuityDevices })) return;
      deepLinkFocusApplied.current = true;
      return;
    }

    if (splicePointId) {
      if (!visibleOpgwSplicePoints.length) return;
      if (!visibleOpgwSplicePoints.some((feature) => feature.properties.splicePointId === splicePointId)) return;
      deepLinkFocusApplied.current = true;
      focusOpgwSplicePointLayer(splicePointId);
      return;
    }

    if (spliceConnectionId) {
      if (!fiberSplices.length || !visibleOpgwSplicePoints.length || !visibleOpgwCableSections.length || !visibleOpgwCables.length) return;
      if (!fiberSplices.some((splice) => splice.id === spliceConnectionId)) return;
      deepLinkFocusApplied.current = true;
      focusSpliceConnectionLayer(spliceConnectionId);
      return;
    }

    if (cableSectionId) {
      if (!visibleOpgwCableSections.length) return;
      if (!visibleOpgwCableSections.some((feature) => feature.properties.cableSectionId === cableSectionId)) return;
      deepLinkFocusApplied.current = true;
      focusOpgwCableSectionLayer(cableSectionId);
      return;
    }

    if (distributionPoleId) {
      if (!visibleDistributionPoles.length) return;
      const pole = visibleDistributionPoles.find((feature) => feature.properties.id === distributionPoleId || feature.properties.poleNumber === distributionPoleId);
      if (!pole) return;
      const selection: StreetMapSelection = { kind: "distribution_pole", id: pole.properties.id, label: pole.properties.poleNumber, record: pole };
      deepLinkFocusApplied.current = true;
      setSelectedAsset(selection);
      setFocusRequest({ selection, sequence: Date.now() });
      setStreetLayers((current) => withDistributionNetworkLayerState(current, true));
      setRightMode("details");
      setRightCollapsed(false);
      showToast(`Showing distribution pole ${pole.properties.poleNumber}.`);
      return;
    }

    if (distributionRouteId) {
      if (!visibleDistributionPoleFiberRoutes.length) return;
      const route = visibleDistributionPoleFiberRoutes.find((feature) => feature.properties.routeId === distributionRouteId || feature.properties.routeName === distributionRouteId);
      if (!route) return;
      const selection: StreetMapSelection = { kind: "distribution_pole_fiber", id: route.properties.routeId, label: route.properties.routeName, record: route };
      deepLinkFocusApplied.current = true;
      setSelectedAsset(selection);
      setFocusRequest({ selection, sequence: Date.now() });
      setStreetLayers((current) => withDistributionNetworkLayerState(current, true));
      setRightMode("details");
      setRightCollapsed(false);
      showToast(`Showing distribution feeder ${route.properties.routeId}.`);
      return;
    }

    if (circuitId) {
      if (!syntheticServices.length || !legacyTelecomCircuits.length || !syntheticFiberAssignments.length || !visibleOpgwCables.length || !visibleOpgwCableSections.length || !visibleDistributionFiberAssignments.length) {
        void loadMapDataGroups(["syntheticServices", "legacyTelecomCircuits", "opgwTopology", "fiberAssignments", "patchPanels", "distributionFiberRoutes", "distributionRouteDetails", "distributionFiberAssignments"]);
        return;
      }
      deepLinkFocusApplied.current = true;
      focusCircuitRoute(circuitId);
      return;
    }

    if (cableId || serviceId) {
      if (!visibleOpgwCables.length) return;
      const service = serviceId ? syntheticServices.find((item) => item.serviceId === serviceId) : undefined;
      const targetCableId = cableId || service?.continuityCableIds?.[0];
      const cable = visibleOpgwCables.find((feature) => feature.properties.id === targetCableId || feature.properties.cableName === targetCableId);
      if (!cable) return;
      const selection: StreetMapSelection = { kind: "opgw_cable", id: cable.properties.id, label: cable.properties.cableName, record: cable };
      deepLinkFocusApplied.current = true;
      setContinuityHighlight(service ? buildContinuityHighlightForService(service) : buildContinuityHighlightForCable(cable));
      setSelectedAsset(selection);
      setFocusRequest({ selection, sequence: Date.now() });
      setStreetLayers((current) => ({ ...current, syntheticOpgwCables: true, opgwRoutes: true, opgwCableSections: true, opgwSplicePoints: true, fiberAssignments: true, criticalRidingCircuits: true }));
      setRightMode("layers");
      setRightCollapsed(false);
      showToast(`Showing map context for ${serviceId || cable.properties.id}.`);
    }
  }, [fiberSplices, legacyTelecomCircuits, loadMapDataGroups, strandContinuityRecords, syntheticFiberAssignments, syntheticServices, visibleDistributionFiberAssignments, visibleDistributionPoleFiberRoutes, visibleDistributionPoles, visibleFiberAssignments, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwSplicePoints]);

  function clearOpgwLayerIsolation() {
    setIsolatedOpgwRouteId(null);
    setIsolatedOpgwSectionId(null);
    setIsolatedOpgwSplicePointId(null);
    setContinuityHighlight(undefined);
    setStreetLayers((current) => ({ ...current, opgwRoutes: true, opgwCableSections: true, opgwSplicePoints: true }));
    showToast("OPGW route visibility filter cleared.");
  }

  function handleOperatingModeChange(nextMode: DashboardOperatingMode) {
    setOperatingMode(nextMode);
    setIsolatedCircuitId(null);
    setStreetLayers((current) => layerStateForOperatingMode(nextMode, current));
    if (nextMode === "planned") {
      setRightMode("layers");
      setRightCollapsed(false);
      showToast("Planned view enabled: OPGW routes, cable sections, spans, splice points, and capacity layers are visible.");
    } else {
      showToast("In Service view enabled: public HIFLD, verified-owner substations, FCC references, verified OPGW, and existing splice layers are prioritized.");
    }
    issueMapCommand("resize");
  }

  function handleDesignModeClick() {
    setDesignModeEnabled(true);
    setStreetLayers((current) => ({ ...current, designAssets: true }));
    setRightMode("design");
    setRightCollapsed(false);
    setActiveTool("select");
    void loadDesignAssets(true);
    showToast("Design Mode enabled: editable planning assets, schema forms, and map drawing tools are available.");
    issueMapCommand("resize");
  }

  function handleGuideClick() {
    window.location.assign("/guide");
  }

  function openGuideDesignRecords() {
    setDesignModeEnabled(true);
    setStreetLayers((current) => ({ ...current, designAssets: true }));
    setSearchLayerFilter("designAssets");
    setVisibilityFilter("synthetic-demo");
    setSelectedDesignAssetTypeSlug("guide-distribution-pole");
    setRightMode("design");
    setRightCollapsed(false);
    void loadDesignAssets(true);
    showToast("Opened Design Mode records created by the guide.");
    issueMapCommand("resize");
  }

  async function runDatabaseGuideWorkflow(workflow: DatabaseGuideWorkflow) {
    setGuideBusy(workflow.key);
    setGuideMessage("");
    try {
      const result = await fetchFromApiBase<DesignBlueprintInstallResult>(API_BASE, "/api/design-assets/blueprint/import", {
        method: "POST",
        body: JSON.stringify({
          blueprint_version: "gridassetlink-dashboard-guide-v1",
          synthetic_data_notice: "Dashboard guide records are synthetic/demo planning records only.",
          mode: "upsert",
          asset_types: databaseGuideAssetTypes,
          records: workflow.records,
        }),
      });
      await loadDesignAssets(true);
      setDesignModeEnabled(true);
      setStreetLayers((current) => ({ ...current, designAssets: true }));
      setSearchLayerFilter("designAssets");
      setVisibilityFilter("synthetic-demo");
      setGuideMessage(`Applied ${workflow.title}: ${result.created_records} created, ${result.updated_records} updated, ${result.created_asset_types} schemas created, ${result.updated_asset_types} schemas updated.`);
      showToast(`Guide database edits applied for ${workflow.title}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGuideMessage(message);
      showToast(message);
    } finally {
      setGuideBusy("");
    }
  }

  async function runDatabaseGuideWorkflowPackage(workflows: DatabaseGuideWorkflow[], label: string, busyKey: string) {
    setGuideBusy(busyKey);
    setGuideMessage("");
    try {
      const recordsByKey = new Map<string, DatabaseGuideRecord>();
      workflows.flatMap((workflow) => workflow.records).forEach((record) => recordsByKey.set(record.record_key, record));
      const result = await fetchFromApiBase<DesignBlueprintInstallResult>(API_BASE, "/api/design-assets/blueprint/import", {
        method: "POST",
        body: JSON.stringify({
          blueprint_version: "gridassetlink-dashboard-guide-v1",
          synthetic_data_notice: "Dashboard guide records are synthetic/demo planning records only.",
          mode: "upsert",
          asset_types: databaseGuideAssetTypes,
          records: Array.from(recordsByKey.values()),
        }),
      });
      await loadDesignAssets(true);
      setDesignModeEnabled(true);
      setStreetLayers((current) => ({ ...current, designAssets: true }));
      setSearchLayerFilter("designAssets");
      setVisibilityFilter("synthetic-demo");
      setGuideMessage(`Applied ${label}: ${result.created_records} created, ${result.updated_records} updated, ${result.created_asset_types} schemas created, ${result.updated_asset_types} schemas updated.`);
      showToast(`Guide database edits applied for ${label}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGuideMessage(message);
      showToast(message);
    } finally {
      setGuideBusy("");
    }
  }

  function runDatabaseGuideCoverage(area: DatabaseGuideCoverageArea) {
    const workflows = databaseGuideWorkflows.filter((workflow) => area.workflowKeys.includes(workflow.key));
    void runDatabaseGuideWorkflowPackage(workflows, area.title, `coverage:${area.title}`);
  }

  function runCompleteDatabaseGuidePackage() {
    void runDatabaseGuideWorkflowPackage(databaseGuideWorkflows, "complete database guide package", "complete-guide-package");
  }

  function handleTransmissionLineOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleTransmissionLineOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setSearchLayerFilter("publicTransmissionLines");
      setVisibilityFilter("public");
      setOwnerFilter(owner);
      setStreetLayers((current) => ({ ...current, publicTransmissionLines: true }));
    }
  }

  function handleAllTransmissionLineOwnersChange(enabled: boolean) {
    setVisibleTransmissionLineOwners(Object.fromEntries(transmissionLineOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setSearchLayerFilter("publicTransmissionLines");
      setVisibilityFilter("public");
      setOwnerFilter("all");
      setStreetLayers((current) => ({ ...current, publicTransmissionLines: true }));
    }
  }

  function handleSubstationOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleSubstationOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setSearchLayerFilter("publicSubstations");
      setVisibilityFilter("public");
      setOwnerFilter(owner);
      setStreetLayers((current) => ({ ...current, publicSubstations: true }));
    }
  }

  function handleAllSubstationOwnersChange(enabled: boolean) {
    setVisibleSubstationOwners(Object.fromEntries(substationOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setSearchLayerFilter("publicSubstations");
      setVisibilityFilter("public");
      setOwnerFilter("all");
      setStreetLayers((current) => ({ ...current, publicSubstations: true }));
    }
  }

  function handleFccTowerOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleFccTowerOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setSearchLayerFilter("fccUtilityTowers");
      setVisibilityFilter("public");
      setOwnerFilter(owner);
      setStreetLayers((current) => ({ ...current, fccUtilityTowers: true }));
    }
  }

  function handleAllFccTowerOwnersChange(enabled: boolean) {
    setVisibleFccTowerOwners(Object.fromEntries(fccTowerOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setSearchLayerFilter("fccUtilityTowers");
      setVisibilityFilter("public");
      setOwnerFilter("all");
      setStreetLayers((current) => ({ ...current, fccUtilityTowers: true }));
    }
  }

  function handleFccLinkOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleFccLinkOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setSearchLayerFilter("fccMicrowaveLinks");
      setVisibilityFilter("public");
      setOwnerFilter(owner);
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function handleAllFccLinkOwnersChange(enabled: boolean) {
    setVisibleFccLinkOwners(Object.fromEntries(fccLinkOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setSearchLayerFilter("fccMicrowaveLinks");
      setVisibilityFilter("public");
      setOwnerFilter("all");
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function handleFccFrequencyBandChange(frequencyBand: string, enabled: boolean) {
    setVisibleFccFrequencyBands((current) => ({ ...current, [frequencyBand]: enabled }));
    if (enabled) {
      setSearchLayerFilter("fccMicrowaveLinks");
      setVisibilityFilter("public");
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function handleAllFccFrequencyBandsChange(enabled: boolean) {
    setVisibleFccFrequencyBands(Object.fromEntries(fccFrequencyBandCounts.map(({ frequencyBand }) => [frequencyBand, enabled])));
    if (enabled) {
      setSearchLayerFilter("fccMicrowaveLinks");
      setVisibilityFilter("public");
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function openEditorDrawer() {
    setRightMode("editor");
    setRightCollapsed(false);
  }

  function selectAddAsset(kind: AddAssetKind) {
    setAddAssetKind(kind);
    setPlacementTarget(null);
    setDraftNode(null);
    setDraftSubstation(null);
    setRightMode("editor");
    setRightCollapsed(false);
    if (kind === "substation") setActiveTool("add_substation");
    else if (kind === "fiber_node") setActiveTool("add_fiber_node");
    else if (kind === "transmission_line") setActiveTool("draw_transmission_line");
    else setActiveTool("add_device_node");
    showToast(`Add Asset: ${addAssetLabel(kind)}. Click the map to place it.`);
  }

  function issueMapCommand(type: Exclude<MapCommand["type"], "pan">) {
    setMapCommand({ type, sequence: Date.now() });
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3800);
  }

  function updateFiberStrands(cableId: string, strandNumbers: number[], status: FiberStrand["status"], assignmentId?: string) {
    const selected = new Set(strandNumbers);
    setFiberStrands((current) => current.map((strand) => {
      if (strand.cableId !== cableId || !selected.has(strand.strandNumber)) return strand;
      return {
        ...strand,
        status,
        assignmentId: status === "available" || status === "spare" || status === "dark" ? undefined : assignmentId || strand.assignmentId,
      };
    }));
    showToast(`${strandNumbers.length} strands on ${cableId} marked ${status}.`);
  }

  function createSyntheticFiberAssignment(assignment: FiberAssignment) {
    setFiberAssignments((current) => [assignment, ...current.filter((item) => item.id !== assignment.id)]);
    setFiberStrands((current) => current.map((strand) => {
      const matchingSegment = assignment.strandSegments.find((segment) => segment.cableId === strand.cableId && segment.strandNumbers.includes(strand.strandNumber));
      if (!matchingSegment) return strand;
      return { ...strand, status: assignment.status === "active" ? "assigned" : "reserved", assignmentId: assignment.id };
    }));
    showToast(`Created synthetic ${assignment.serviceType} assignment ${assignment.assignmentName}.`);
  }

  function addSyntheticSplice(splice: FiberSplice) {
    setFiberSplices((current) => [splice, ...current]);
    showToast(`Added planned splice ${splice.id}.`);
  }

  function deleteSyntheticSplice(spliceId: string) {
    const target = fiberSplices.find((splice) => splice.id === spliceId);
    if (!target || target.status === "existing") {
      showToast("Generated existing splice records are read-only in this demo.");
      return;
    }
    setFiberSplices((current) => current.filter((splice) => splice.id !== spliceId));
    showToast(`Deleted planned splice ${spliceId}.`);
  }

  const placementHint = placementTarget
    ? `Place ${placementTarget.label} with street-level lat/lon. Do not use fake coordinates.`
    : addAssetKind
      ? `Add Asset: ${addAssetLabel(addAssetKind)}. Click the ISO-NE map to place a synthetic proposed record.`
      : undefined;

  return (
    <main className={`dashboard-map-page map-first dashboard-mode-${mode}`} data-map-status={mapStatus}>
      {mapWindowClosed ? (
        <section className="dashboard-map-closed-panel" aria-label="Dashboard map closed">
          <div>
            <X size={20} />
            <strong>Dashboard map window closed</strong>
            <span>Module drawers and layer controls are still available. Reopen the map when you want to browse assets again.</span>
          </div>
          <button type="button" onClick={() => {
            setMapWindowClosed(false);
            window.setTimeout(() => issueMapCommand("resize"), 50);
          }}>Open Dashboard Map</button>
        </section>
      ) : (
        <StreetLevelAssetMap
          activeMap={activeMap}
          substations={visibleSubstations}
          nodes={visibleNodes}
          transmissionLines={visibleTransmissionLines}
          publicTransmissionLines={layerFilteredPublicTransmissionLines}
          publicSubstations={layerFilteredPublicSubstations}
          fccUtilityTowers={layerFilteredFccUtilityTowers}
          fccMicrowaveLinks={layerFilteredFccMicrowaveLinks}
          syntheticSubstations={visibleSyntheticSubstations}
          transmissionStructures={layerFilteredTransmissionStructures}
          opgwCables={visibleOpgwCables}
          opgwRoutes={mapOpgwRoutes}
          opgwCableSections={mapOpgwCableSections}
          opgwSpanSegments={visibleOpgwSpanSegments}
          opgwSplicePoints={mapOpgwSplicePoints}
          spliceClosures={layerFilteredSpliceClosures}
          fiberSplices={fiberSplices}
          fiberStrands={fiberStrands}
          fiberAssignments={visibleFiberAssignments}
          syntheticServices={syntheticServices}
          distributionPoleDensity={layerFilteredDistributionPoleDensity}
          distributionPoles={layerFilteredDistributionPoles}
          distributionPoleFiberRoutes={layerFilteredDistributionFiberRoutes}
          distributionSplicePoints={layerFilteredDistributionSplicePoints}
          distributionSlackLoops={layerFilteredDistributionSlackLoops}
          distributionFiberAssignments={layerFilteredDistributionFiberAssignments}
          patchPanels={visiblePatchPanels}
          designAssetRecords={streetLayers.designAssets ? visibleDesignAssetMapRecords : []}
          planningRegions={visiblePlanningRegions}
          layers={streetLayers}
          gisApiBase={gisApiBase}
          activeTool={activeTool}
          placementHint={placementHint}
          command={mapCommand}
          focusRequest={focusRequest}
          continuityHighlight={continuityHighlight}
          onMapClick={handleMapClick}
          onSelect={handleMapSelect}
          onStatusChange={handleMapStatusChange}
        />
      )}

      <div className="dashboard-floating-topbar">
        <div className="dashboard-compact-brand">
          <strong>GridAssetLink</strong>
        <span>HIFLD references plus synthetic OPGW fiber planning</span>
        </div>
        <div className="dashboard-mode-toggle" aria-label="Dashboard mode">
          {[
            ["in_service", "In Service"],
            ["planned", "Planned"],
          ].map(([value, label]) => (
            <button
              type="button"
              className={operatingMode === value ? "active" : ""}
              key={value}
              onClick={() => handleOperatingModeChange(value as DashboardOperatingMode)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleGuideClick}
          >
            <BookOpen size={14} />
            Guide
          </button>
          <Link href="/admin/database" className="dashboard-mode-link">
            <Database size={14} />
            Backend Modules
          </Link>
          <button
            type="button"
            className={designModeEnabled && rightMode === "design" ? "active" : ""}
            onClick={handleDesignModeClick}
          >
            <PencilRuler size={14} />
            Design Mode
          </button>
        </div>
        <div className="dashboard-map-global-search-wrap">
          <div className="dashboard-map-global-search-shell">
            <label className="dashboard-map-layer-select">
              <span>Layer</span>
              <select value={searchLayerFilter} onChange={(event) => handleSearchLayerFilterChange(event.currentTarget.value as DashboardSearchLayer)}>
                {searchLayerOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="dashboard-map-global-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => handleGlobalSearchChange(event.target.value)}
                onFocus={() => setSearchOpen(Boolean(search.trim()))}
                onKeyDown={handleGlobalSearchKeyDown}
                placeholder="Search selected layer by name, call sign, owner, ID, structure, or splice"
                aria-autocomplete="list"
                aria-expanded={searchOpen && mapSearchResults.length > 0}
              />
            </label>
          </div>
          {searchOpen && search.trim() ? (
            <div className="dashboard-map-search-popover" role="listbox" aria-label="Map search results">
              {mapSearchResults.length ? mapSearchResults.map((result, index) => (
                <button
                  type="button"
                  className={index === activeSearchIndex ? "active" : ""}
                  key={`${result.kind}-${result.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => focusSearchResult(result)}
                  role="option"
                  aria-selected={index === activeSearchIndex}
                >
                  <strong>{result.label}</strong>
                  <span>{selectionLayerLabel(result)} / {formatSelectionKind(result.kind)} / {selectionStatus(result)}</span>
                </button>
              )) : <p>No matching map assets in {searchLayerLabel(searchLayerFilter)}.</p>}
            </div>
          ) : null}
        </div>
      </div>

      <div className="dashboard-top-right-toolbar" aria-label="Map toolbar">
        <button type="button" onClick={() => issueMapCommand("resetIsoNe")}><LocateFixed size={15} />Reset to ISO-NE</button>
        <button type="button" onClick={() => issueMapCommand("fitActiveMap")}><Maximize2 size={15} />Fit active map</button>
        <button type="button" onClick={() => setMapWindowClosed(true)}><X size={15} />Close map</button>
      </div>

      <aside className="dashboard-side-layer-digest" aria-label="Active map layers">
        <LayerSummaryDigest layerSummaries={dashboardLayerSummaries} compact title="Active Map Layers" />
      </aside>

      <aside className={`dashboard-right-floating-drawer ${rightCollapsed ? "collapsed" : ""}`} aria-label="Dashboard details drawer">
        <button className="dashboard-panel-collapse right" type="button" onClick={() => setRightCollapsed((current) => !current)}>
          {rightCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </button>
        {!rightCollapsed ? (
          <>
            <div className="dashboard-drawer-tabs">
              <button type="button" className={rightMode === "modules" ? "active" : ""} onClick={() => setRightMode("modules")}><Network size={14} />Modules</button>
              <button type="button" className={rightMode === "summary" ? "active" : ""} onClick={() => setRightMode("summary")}><Gauge size={14} />Summary</button>
              <button type="button" className={rightMode === "filters" ? "active" : ""} onClick={() => setRightMode("filters")}><Filter size={14} />Filters</button>
              <button type="button" className={rightMode === "layers" ? "active" : ""} onClick={() => setRightMode("layers")}><Layers size={14} />Layers</button>
              <button type="button" className={rightMode === "scale" ? "active" : ""} onClick={() => setRightMode("scale")}><Database size={14} />Scale</button>
              <button type="button" className={rightMode === "sources" ? "active" : ""} onClick={() => setRightMode("sources")}><TableProperties size={14} />Sources</button>
              <button type="button" className={rightMode === "details" ? "active" : ""} onClick={() => setRightMode("details")}><SlidersHorizontal size={14} />Details</button>
              <button type="button" className={rightMode === "splices" ? "active" : ""} onClick={() => setRightMode("splices")}><Cable size={14} />Splices</button>
              <button type="button" onClick={handleGuideClick}><BookOpen size={14} />Guide</button>
              <button type="button" className={rightMode === "design" ? "active" : ""} onClick={handleDesignModeClick}><PencilRuler size={14} />Design</button>
            </div>
            <div className="dashboard-drawer-body">
              {rightMode === "modules" ? <ModulesDrawer pathname={pathname} layerSummaries={dashboardLayerSummaries} /> : null}
              {rightMode === "summary" ? <SummaryDrawer cards={summaryCards} publicOnly={publicOnly} mapStatusMessage={mapStatusMessage} opgwMetrics={opgwPlanningMetrics} layerSummaries={dashboardLayerSummaries} /> : null}
              {rightMode === "filters" ? (
                <FiltersResultsDrawer
                  publicOnly={publicOnly}
                  search={search}
                  searchLayerFilter={searchLayerFilter}
                  assetTypeFilter={assetTypeFilter}
                  statusFilter={statusFilter}
                  regionFilter={regionFilter}
                  visibilityFilter={visibilityFilter}
                  ownerFilter={ownerFilter}
                  ownerOptions={ownerOptions}
                  searchResults={searchResults}
                  onSearchChange={setSearch}
                  onSearchLayerChange={(value) => handleSearchLayerFilterChange(value as DashboardSearchLayer)}
                  onAssetTypeChange={setAssetTypeFilter}
                  onStatusChange={setStatusFilter}
                  onRegionChange={setRegionFilter}
                  onVisibilityChange={setVisibilityFilter}
                  onOwnerChange={setOwnerFilter}
                  onSelectResult={focusSelection}
                />
              ) : null}
              {rightMode === "layers" ? (
                <div className="dashboard-drawer-stack">
                  {continuitySummary ? <ContinuitySummaryPanel summary={continuitySummary} /> : null}
                  <MapLayerControlPanel
                    layers={streetLayers}
                    publicLineCount={visiblePublicTransmissionLines.length}
                    visiblePublicLineCount={layerFilteredPublicTransmissionLines.length}
                    publicSubstationCount={visiblePublicSubstations.length}
                    visiblePublicSubstationCount={layerFilteredPublicSubstations.length}
                    fccTowerCount={visibleFccUtilityTowers.length}
                    visibleFccTowerCount={layerFilteredFccUtilityTowers.length}
                    fccLinkCount={visibleFccMicrowaveLinks.length}
                    visibleFccLinkCount={layerFilteredFccMicrowaveLinks.length}
                    utilityOwnerCount={new Set([...substationOwnerCounts, ...transmissionLineOwnerCounts, ...fccTowerOwnerCounts, ...fccLinkOwnerCounts].map(({ owner }) => owner)).size}
                    structureCount={visibleTransmissionStructures.length}
                    spliceClosureCount={visibleSpliceClosures.length}
                    opgwRouteCount={visibleOpgwRoutes.length}
                    assumedOpgwRouteCount={opgwPlanningMetrics.assumedRouteCount}
                    plannedOpgwRouteCount={opgwPlanningMetrics.plannedRouteCount}
                    verifiedOpgwRouteCount={opgwPlanningMetrics.verifiedRouteCount}
                    opgwCableSectionCount={visibleOpgwCableSections.length}
                    opgwSpanSegmentCount={visibleOpgwSpanSegments.length}
                    opgwSplicePointCount={visibleOpgwSplicePoints.length}
                    patchPanelCount={visiblePatchPanels.length}
                    distributionPoleCount={visibleDistributionPoles.length}
                    distributionPoleFiberRouteCount={visibleDistributionPoleFiberRoutes.length}
                    distributionPoleDensityCount={visibleDistributionPoleDensity.length}
                    distributionSplicePointCount={visibleDistributionSplicePoints.length}
                    distributionSlackLoopCount={visibleDistributionSlackLoops.length}
                    distributionFiberAssignmentCount={visibleDistributionFiberAssignments.length}
                    designAssetCount={visibleDesignAssetRecords.length}
                    estimatedDistributionPoleScale={estimatedDistributionPoleScale}
                    availableStrandCount={opgwPlanningMetrics.availableStrands}
                    strandContinuityCount={strandContinuityRecords.length}
                    criticalRidingCircuitCount={opgwPlanningMetrics.criticalRidingCircuits}
                    outageImpactCount={opgwPlanningMetrics.outageImpactCount}
                    openOpgwWorkOrderCount={opgwPlanningMetrics.openWorkOrders}
                    spanInspectionIssueCount={opgwPlanningMetrics.spanInspectionIssues}
                    opgwRoutes={visibleOpgwRoutes}
                    opgwCableSections={visibleOpgwCableSections}
                    focusedOpgwRouteId={activeIsolatedOpgwRouteId}
                    focusedOpgwSectionId={isolatedOpgwSectionId || undefined}
                    focusedOpgwSplicePointId={isolatedOpgwSplicePointId || undefined}
                    opgwSplicePoints={visibleOpgwSplicePoints}
                    dataWarnings={mapDataWarnings}
                    transmissionLineOwnerCounts={transmissionLineOwnerCounts}
                    visibleTransmissionLineOwners={visibleTransmissionLineOwners}
                    substationOwnerCounts={substationOwnerCounts}
                    visibleSubstationOwners={visibleSubstationOwners}
                    fccTowerOwnerCounts={fccTowerOwnerCounts}
                    visibleFccTowerOwners={visibleFccTowerOwners}
                    fccLinkOwnerCounts={fccLinkOwnerCounts}
                    visibleFccLinkOwners={visibleFccLinkOwners}
                    fccFrequencyBandCounts={fccFrequencyBandCounts}
                    visibleFccFrequencyBands={visibleFccFrequencyBands}
                    onLayerChange={handleStreetLayerChange}
                    onDistributionLayerGroupChange={handleDistributionLayerGroupChange}
                    onTransmissionLineOwnerChange={handleTransmissionLineOwnerLayerChange}
                    onAllTransmissionLineOwnersChange={handleAllTransmissionLineOwnersChange}
                    onSubstationOwnerChange={handleSubstationOwnerLayerChange}
                    onAllSubstationOwnersChange={handleAllSubstationOwnersChange}
                    onFccTowerOwnerChange={handleFccTowerOwnerLayerChange}
                    onAllFccTowerOwnersChange={handleAllFccTowerOwnersChange}
                    onFccLinkOwnerChange={handleFccLinkOwnerLayerChange}
                    onAllFccLinkOwnersChange={handleAllFccLinkOwnersChange}
                    onFccFrequencyBandChange={handleFccFrequencyBandChange}
                    onAllFccFrequencyBandsChange={handleAllFccFrequencyBandsChange}
                    onFocusOpgwRoute={focusOpgwRouteLayer}
                    onFocusOpgwSection={focusOpgwCableSectionLayer}
                    onFocusOpgwSplicePoint={focusOpgwSplicePointLayer}
                    onClearOpgwFocus={clearOpgwLayerIsolation}
                  />
                  {streetLayers.missingLocationAssets ? (
                    <MissingMapLocationPanel
                      substations={substations}
                      nodes={nodes}
                      placementTargetId={placementTarget?.id}
                      onPlaceMissing={(item) => {
                        setPlacementTarget(item);
                        setActiveTool("place_missing");
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
              {rightMode === "scale" ? (
                <GisScaleControlPanel
                  gisApiBase={gisApiBase}
                  onGisApiBaseChange={handleGisApiBaseChange}
                  onResetGisApiBase={handleResetGisApiBase}
                  onEnableGisLayers={enableGisScaleLayers}
                />
              ) : null}
              {rightMode === "sources" ? <DashboardDataSourcesPanel /> : null}
              {rightMode === "details" ? <LinkedAssetDetailPanel selection={selectedAsset} onClose={handleCloseAssetDetail} /> : null}
              {rightMode === "strands" ? (
                <FiberStrandTable
                  strands={fiberStrands}
                  assignments={visibleFiberAssignments}
                  opgwCables={visibleOpgwCables}
                  strandContinuityRecords={strandContinuityRecords}
                  onUpdateStrands={updateFiberStrands}
                  onViewContinuity={(record) => focusStrandContinuityRecord(record, { includeDevices: false })}
                />
              ) : null}
              {rightMode === "splices" ? <SpliceMatrix closures={visibleSpliceClosures} splices={fiberSplices} selectedAsset={selectedAsset} onAddSplice={addSyntheticSplice} onDeleteSplice={deleteSyntheticSplice} /> : null}
              {rightMode === "assignments" ? <FiberAssignmentPlanner assignments={visibleFiberAssignments} opgwCables={visibleOpgwCables} structures={visibleTransmissionStructures} strands={fiberStrands} onCreateAssignment={createSyntheticFiberAssignment} /> : null}
              {rightMode === "guide" ? (
                <DatabaseGuideDrawer
                  coverageAreas={databaseGuideCoverageAreas}
                  workflows={databaseGuideWorkflows}
                  busyKey={guideBusy}
                  message={guideMessage}
                  onRunWorkflow={runDatabaseGuideWorkflow}
                  onRunCoverage={runDatabaseGuideCoverage}
                  onRunAll={runCompleteDatabaseGuidePackage}
                  onOpenDesignRecords={openGuideDesignRecords}
                />
              ) : null}
              {rightMode === "design" ? (
                <DesignEditDrawer
                  enabled={designFeaturesEnabled}
                  assetTypes={designAssetTypes}
                  records={visibleDesignAssetRecords}
                  selectedRecord={selectedDesignAssetRecord}
                  selectedTypeSlug={selectedDesignAssetTypeSlug}
                  pendingGeometry={pendingDesignGeometry}
                  activeTool={activeTool}
                  drawingVertexCount={designDrawingCoordinates.length}
                  message={designAssetMessage}
                  onSelectedTypeSlugChange={setSelectedDesignAssetTypeSlug}
                  onPendingGeometryChange={setPendingDesignGeometry}
                  onBeginDrawing={beginDesignDrawing}
                  onFinishDrawing={finishDesignDrawing}
                  onCancelDraft={cancelDesignDraft}
                  onNewRecord={startNewDesignRecord}
                  onRefresh={() => loadDesignAssets(true)}
                  onSelectRecord={selectDesignAssetRecord}
                  onNotify={showToast}
                />
              ) : null}
              {rightMode === "editor" ? (
                <div className="dashboard-drawer-stack">
                  {showMapEditor ? <TransmissionMapEditor open={showMapEditor} onCancel={() => setShowMapEditor(false)} onSave={handleCreateMap} /> : null}
                  {!showMapEditor && !draftSubstation && !draftNode ? (
                    <AddAssetChooser
                      publicOnly={publicOnly}
                      selectedKind={addAssetKind}
                      onSelect={selectAddAsset}
                      onCreateMap={() => setShowMapEditor(true)}
                    />
                  ) : null}
                  <SubstationEditor draft={draftSubstation} onChange={setDraftSubstation} onCancel={() => setDraftSubstation(null)} onSave={handleSaveSubstation} />
                  <NodeParameterEditor
                    draft={draftNode}
                    maps={transmissionMaps}
                    substations={substations}
                    deviceIds={availableDeviceIds}
                    circuitIds={availableCircuitIds}
                    workOrderIds={availableWorkOrderIds}
                    onChange={setDraftNode}
                    onCancel={() => setDraftNode(null)}
                    onSave={handleSaveNode}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>

      <div className="dashboard-security-note map-overlay-note">
        <AlertTriangle size={15} />
        <span>Dashboard map shows public HIFLD lines, verified-owner public substation nodes, public FCC references, and synthetic demo OPGW, structures, strand capacity, assignments, splice closures, and patch panels. Synthetic OPGW assumptions are not active fiber. Do not enter CEII, SCADA, relay, protection, telecom, or private fiber-route data.</span>
      </div>
      {continuityHighlight ? (
        <div className="dashboard-continuity-chip" role="status" aria-live="polite">
          <span>
            <strong>Continuity Highlight</strong>
            {continuityHighlight.label}
          </span>
          <button type="button" onClick={() => {
            setContinuityHighlight(undefined);
            setIsolatedCircuitId(null);
          }}>Clear</button>
        </div>
      ) : null}
      {toast ? <div className="dashboard-map-toast">{toast}</div> : null}
    </main>
  );
}

function FilterSelect({ label, value, options, onChange, displayLabel = formatFilterOption }: { label: string; value: string; options: string[]; onChange: (value: string) => void; displayLabel?: (value: string) => string }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>{displayLabel(option)}</option>)}
      </select>
    </label>
  );
}

function ContinuitySummaryPanel({ summary }: { summary: DashboardContinuitySummary }) {
  return (
    <section className="dashboard-continuity-summary-panel" aria-label="Continuity highlight summary">
      <div className="dashboard-panel-heading">
        <Route size={16} />
        <div>
          <strong>Continuity Map Summary</strong>
          <span>{summary.label}</span>
        </div>
      </div>
      <div className="dashboard-continuity-service">
        <strong>{summary.primaryServiceName}</strong>
        <span>{summary.endpointA} to {summary.endpointZ}</span>
      </div>
      <div className="dashboard-continuity-metrics">
        <div><span>Status</span><strong>{summary.pathStatus.replaceAll("_", " ")}</strong></div>
        <div><span>Lines</span><strong>{summary.totalTransmissionLines}</strong></div>
        <div><span>Sections</span><strong>{summary.totalCableSections}</strong></div>
        <div><span>Spans</span><strong>{summary.totalSpanSegments}</strong></div>
        <div><span>Splices</span><strong>{summary.totalSplicePoints}</strong></div>
        <div><span>Patch panels</span><strong>{summary.totalPatchPanels}</strong></div>
        <div><span>Loss</span><strong>{summary.estimatedLossDb.toFixed(2)} dB</strong></div>
        <div><span>Services</span><strong>{summary.servicesCarried}</strong></div>
      </div>
      <div className="dashboard-continuity-tags">
        <span>Filter: {summary.filterLabel}</span>
        <span>{summary.criticality}</span>
        <span>{summary.protectionLevel}</span>
        <span>{summary.layerType}</span>
      </div>
      <div className="dashboard-continuity-actions">
        <Link href={summary.traceHref}>Open full fiber trace</Link>
      </div>
      <div className="dashboard-continuity-warnings">
        {summary.warningSummary.length
          ? summary.warningSummary.slice(0, 4).map((warning) => <span key={warning}>{warning}</span>)
          : <span>Synthetic highlighted continuity has no generated warnings.</span>}
      </div>
    </section>
  );
}

function formatFilterOption(value: string) {
  return value === "all" ? "All" : value;
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function circuitRouteTargetForQuery(
  query: string,
  services: SyntheticService[],
  assignments: FiberAssignment[],
  distributionAssignments: DistributionFiberAssignmentFeature[] = [],
  legacyCircuits: Array<GeoFeature<TelecomCircuitProperties, "LineString">> = [],
): CircuitRouteTarget | null {
  const normalized = normalizeCircuitLookup(query);
  if (!normalized) return null;
  const service = services.find((item) => syntheticServiceMatchesCircuit(item, normalized));
  const serviceAssignmentIds = new Set(uniqueStrings([service?.primaryPathAssignmentId, service?.backupPathAssignmentId]));
  const matchedAssignments = assignments.filter((assignment) =>
    serviceAssignmentIds.has(assignment.id) || fiberAssignmentMatchesCircuit(assignment, normalized)
  );
  const distributionAssignment = distributionAssignments.find((feature) =>
    (service?.distributionAssignmentId && feature.properties.id === service.distributionAssignmentId)
    || distributionAssignmentMatchesCircuit(feature, normalized)
    || Boolean(service && distributionAssignmentMatchesCircuit(feature, normalizeCircuitLookup(service.serviceId)))
    || Boolean(service?.circuitId && distributionAssignmentMatchesCircuit(feature, normalizeCircuitLookup(service.circuitId)))
  );
  const legacyCircuit = legacyCircuits.find((feature) =>
    legacyCircuitMatchesCircuit(feature, normalized)
    || Boolean(service?.circuitId && legacyCircuitMatchesCircuit(feature, normalizeCircuitLookup(service.circuitId)))
    || Boolean(service?.serviceName && legacyCircuitMatchesCircuit(feature, normalizeCircuitLookup(service.serviceName)))
  );
  const routeAssignments = legacyCircuit && !matchedAssignments.length
    ? [legacyCircuitToFiberAssignment(legacyCircuit, service, query)]
    : matchedAssignments;
  if (!service && !routeAssignments.length && !distributionAssignment && !legacyCircuit) return null;
  return { service, assignments: routeAssignments, distributionAssignment, legacyCircuit };
}

function syntheticServiceMatchesCircuit(service: SyntheticService, normalized: string) {
  return [
    service.serviceId,
    service.circuitId,
    service.serviceName,
    service.primaryPathAssignmentId,
    service.backupPathAssignmentId,
    service.distributionAssignmentId,
  ].some((value) => normalizeCircuitLookup(value).includes(normalized));
}

function fiberAssignmentMatchesCircuit(assignment: FiberAssignment, normalized: string) {
  return [
    assignment.id,
    assignment.assignmentName,
    assignment.serviceType,
    assignment.aEndNodeId,
    assignment.zEndNodeId,
    assignment.aEndStructureId,
    assignment.zEndStructureId,
  ].some((value) => normalizeCircuitLookup(value).includes(normalized));
}

function distributionAssignmentMatchesCircuit(feature: DistributionFiberAssignmentFeature, normalized: string) {
  return [
    feature.properties.id,
    feature.properties.assignmentName,
    feature.properties.serviceId,
    feature.properties.circuitId,
    feature.properties.serviceName,
    feature.properties.routeId,
    feature.properties.feederId,
  ].some((value) => normalizeCircuitLookup(value).includes(normalized));
}

function legacyCircuitMatchesCircuit(feature: GeoFeature<TelecomCircuitProperties, "LineString">, normalized: string) {
  return [
    feature.properties.circuitId,
    feature.properties.circuitName,
    feature.properties.serviceType,
    feature.properties.primaryRoute,
    feature.properties.backupRoute,
    feature.properties.aEnd,
    feature.properties.zEnd,
  ].some((value) => normalizeCircuitLookup(value).includes(normalized));
}

function legacyCircuitToFiberAssignment(feature: GeoFeature<TelecomCircuitProperties, "LineString">, service: SyntheticService | undefined, fallbackLabel: string): FiberAssignment {
  const label = feature.properties.circuitId || service?.serviceId || fallbackLabel;
  return {
    id: `legacy-route:${label}`,
    assignmentName: `${label} full circuit route`,
    synthetic: true,
    serviceType: fiberAssignmentServiceTypeForCircuit(service?.serviceType || feature.properties.serviceType),
    status: assignmentStatusForCircuit(service?.operationalStatus),
    aEndNodeId: service?.fromSiteId || feature.properties.aEnd,
    zEndNodeId: service?.toSiteId || feature.properties.zEnd,
    cableIds: [],
    strandSegments: [],
    spliceIds: [],
    estimatedDistanceMiles: undefined,
    estimatedLossDb: undefined,
    mapCoordinates: [feature.geometry.coordinates],
    notes: "Synthetic legacy circuit line geometry displayed as a dashboard-only full-route overlay. Not an operational circuit path.",
  };
}

function normalizeCircuitLookup(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function fiberAssignmentServiceTypeForCircuit(serviceType?: string): FiberAssignment["serviceType"] {
  if (serviceType === "SEL_ICON") return "SEL_ICON";
  if (serviceType === "C37.94" || serviceType === "C37_94") return "C37_94";
  if (serviceType === "DTT") return "DTT";
  if (serviceType === "SCADA") return "SCADA";
  if (serviceType === "Ethernet") return "Ethernet";
  if (serviceType === "Protection" || serviceType === "87L") return "Protection";
  if (serviceType === "Leased") return "Leased";
  return "Other";
}

function assignmentStatusForCircuit(status?: SyntheticService["operationalStatus"]): FiberAssignment["status"] {
  if (status === "planned") return "planned";
  if (status === "proposed") return "proposed";
  if (status === "retired") return "retired";
  return "active";
}

function firstCoordinateFromAnyGeometry(value: unknown): Coordinate | undefined {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return [value[0], value[1]];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const coordinate = firstCoordinateFromAnyGeometry(item);
      if (coordinate) return coordinate;
    }
  }
  return undefined;
}

function opgwRouteIdForDashboardCable(cable: OpgwCableFeature) {
  return `OPGW-${cable.properties.lineId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "TL-DEMO"}`;
}

function splicePointIdsFromSections(sections: OpgwCableSectionFeature[]) {
  return uniqueStrings(sections.flatMap((section) => [section.properties.fromSplicePointId, section.properties.toSplicePointId]));
}

function buildDashboardContinuitySummary({
  continuityHighlight,
  syntheticServices,
  opgwCables,
  opgwCableSections,
  opgwSpanSegments,
  opgwSplicePoints,
  spliceClosures,
  fiberSplices,
  fiberAssignments,
  patchPanels,
  filterContext,
}: {
  continuityHighlight: ContinuityHighlight | undefined;
  syntheticServices: SyntheticService[];
  opgwCables: OpgwCableFeature[];
  opgwCableSections: OpgwCableSectionFeature[];
  opgwSpanSegments: OpgwSpanSegmentFeature[];
  opgwSplicePoints: OpgwSplicePointFeature[];
  spliceClosures: SpliceClosureFeature[];
  fiberSplices: FiberSplice[];
  fiberAssignments: FiberAssignment[];
  patchPanels: PatchPanel[];
  filterContext: { searchLayerFilter: DashboardSearchLayer };
}): DashboardContinuitySummary | undefined {
  if (!continuityHighlight) return undefined;
  if (!isContinuitySearchLayerFilter(filterContext.searchLayerFilter)) return undefined;
  const assignmentIds = new Set(continuityHighlight.assignmentIds);
  const cableIds = new Set(continuityHighlight.cableIds);
  const splicePointIds = new Set(continuityHighlight.splicePointIds);
  const spliceClosureIds = new Set(
    opgwSplicePoints
      .filter((point) => splicePointIds.has(point.properties.splicePointId))
      .map((point) => point.properties.closureId)
      .filter(Boolean) as string[],
  );
  const matchedServices = syntheticServices.filter((service) => {
    if (continuityHighlight.serviceId && service.serviceId === continuityHighlight.serviceId) return true;
    if (assignmentIds.has(service.primaryPathAssignmentId || "") || assignmentIds.has(service.backupPathAssignmentId || "")) return true;
    if (service.continuityCableIds?.some((cableId) => cableIds.has(cableId))) return true;
    if (service.continuitySplicePointIds?.some((pointId) => splicePointIds.has(pointId))) return true;
    if (service.continuitySpliceClosureIds?.some((closureId) => spliceClosureIds.has(closureId))) return true;
    return false;
  });
  const data = { opgwCables, opgwCableSections, opgwSpanSegments, opgwSplicePoints, spliceClosures, fiberSplices, fiberAssignments, syntheticServices, patchPanels };
  const selectedSplicePointId = continuityHighlight.splicePointIds[0];
  const paths = matchedServices.map((service) => traceSyntheticService(service, data, selectedSplicePointId));
  const filteredPaths = filterContinuityPathsForSelectedLayer(paths, filterContext.searchLayerFilter);
  if (!filteredPaths.length && filterContext.searchLayerFilter !== "all") return undefined;
  const filteredServiceIds = new Set(filteredPaths.map((path) => path.serviceId));
  const filteredServices = matchedServices.filter((service) => filteredServiceIds.has(service.serviceId));
  const displayPaths = filterContext.searchLayerFilter === "all" ? paths : filteredPaths;
  const displayServices = filterContext.searchLayerFilter === "all" ? matchedServices : filteredServices;
  const firstService = displayServices[0] || matchedServices[0];
  const firstPath = displayPaths[0];
  const traceHref = continuityHighlight.serviceId
    ? `/fiber-trace?service=${encodeURIComponent(continuityHighlight.serviceId)}`
    : continuityHighlight.label.startsWith("SYN-SPLICE-")
      ? `/fiber-trace?spliceConnection=${encodeURIComponent(continuityHighlight.label)}`
      : selectedSplicePointId
        ? `/fiber-trace?splicePoint=${encodeURIComponent(selectedSplicePointId)}`
        : `/fiber-trace`;
  return {
    label: continuityHighlight.label,
    filterLabel: searchLayerLabel(filterContext.searchLayerFilter),
    serviceIds: displayServices.map((service) => service.serviceId),
    primaryServiceName: firstService ? `${firstService.serviceId} / ${firstService.serviceName}` : "No synthetic service matched this map highlight",
    endpointA: firstService?.fromSiteName || "Endpoint A",
    endpointZ: firstService?.toSiteName || "Endpoint Z",
    pathStatus: worstPathStatus(displayPaths),
    totalTransmissionLines: uniqueStrings(displayPaths.flatMap((path) => path.segments.map((segment) => segment.transmissionLineId))).length || firstPath?.totalTransmissionLines || 0,
    totalCableSections: uniqueStrings(displayPaths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "cable_section").map((segment) => segment.objectId))).length,
    totalSpanSegments: uniqueStrings(displayPaths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "span_segment").map((segment) => segment.objectId))).length,
    totalSplicePoints: uniqueStrings(displayPaths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "splice_point" || segment.objectType === "splice_connection").map((segment) => segment.splicePointId || segment.spliceConnectionId || segment.objectId))).length,
    totalPatchPanels: uniqueStrings(displayPaths.flatMap((path) => path.segments.filter((segment) => segment.objectType === "patch_panel").map((segment) => segment.objectId))).length,
    estimatedLossDb: displayPaths.length ? Math.max(...displayPaths.map((path) => path.totalEstimatedLossDb)) : 0,
    criticality: highestCriticality(displayServices),
    protectionLevel: uniqueStrings(displayServices.map((service) => service.protectionLevel)).join(", ") || "no service",
    layerType: uniqueStrings(displayServices.map((service) => service.layerType)).join(" + ") || searchLayerLabel(filterContext.searchLayerFilter),
    servicesCarried: displayServices.length,
    warningSummary: uniqueStrings([
      ...displayPaths.flatMap((path) => path.warningSummary),
      filterContext.searchLayerFilter === "all" ? undefined : `Summary scoped to selected filter: ${searchLayerLabel(filterContext.searchLayerFilter)}.`,
    ]),
    traceHref,
  };
}

function isContinuitySearchLayerFilter(layer: DashboardSearchLayer) {
  return continuityFilterMode(layer) !== "none";
}

function filterContinuityPathsForSelectedLayer(paths: FiberContinuityPath[], layer: DashboardSearchLayer) {
  const mode = continuityFilterMode(layer);
  if (mode === "all" || mode === "path") return paths;
  if (mode === "none") return [];
  return paths.flatMap((path) => {
    const segments = path.segments.filter((segment) => mode.includes(segment.objectType));
    if (!segments.length) return [];
    return [summarizeContinuityPathSegments(path, segments, searchLayerLabel(layer))];
  });
}

function continuityFilterMode(layer: DashboardSearchLayer): "all" | "path" | "none" | Array<FiberContinuityPath["segments"][number]["objectType"]> {
  if (layer === "all") return "all";
  if (layer === "fiberAssignments" || layer === "strandContinuity" || layer === "syntheticOpgwCables" || layer === "opgwRoutes") return "path";
  if (layer === "opgwCableSections") return ["cable_section"];
  if (layer === "opgwSpanSegments") return ["span_segment"];
  if (layer === "opgwSplicePoints" || layer === "spliceClosures") return ["splice_point", "splice_connection"];
  if (layer === "patchPanels") return ["patch_panel"];
  return "none";
}

function summarizeContinuityPathSegments(path: FiberContinuityPath, segments: FiberContinuityPath["segments"], filterLabel: string): FiberContinuityPath {
  const totalEstimatedLossDb = Number(segments.reduce((sum, segment) => sum + (segment.estimatedLossDb || 0), 0).toFixed(3));
  const status = continuityPathStatusForSegments(segments);
  return {
    ...path,
    pathStatus: status,
    totalTransmissionLines: uniqueStrings(segments.map((segment) => segment.transmissionLineId)).length,
    totalCableSections: uniqueStrings(segments.filter((segment) => segment.objectType === "cable_section").map((segment) => segment.objectId)).length,
    totalSpanSegments: uniqueStrings(segments.filter((segment) => segment.objectType === "span_segment").map((segment) => segment.objectId)).length,
    totalSplicePoints: uniqueStrings(segments.filter((segment) => segment.objectType === "splice_point" || segment.objectType === "splice_connection").map((segment) => segment.splicePointId || segment.spliceConnectionId || segment.objectId)).length,
    totalPatchPanels: uniqueStrings(segments.filter((segment) => segment.objectType === "patch_panel").map((segment) => segment.objectId)).length,
    totalEstimatedLossDb,
    hasBrokenContinuity: segments.some((segment) => segment.segmentStatus === "broken"),
    hasFaultedSection: path.hasFaultedSection && segments.some((segment) => segment.segmentStatus === "broken" || segment.segmentStatus === "warning"),
    hasProposedChanges: segments.some((segment) => segment.segmentStatus === "proposed"),
    warningSummary: uniqueStrings([...path.warningSummary, `Continuity summary filtered to ${filterLabel}.`]),
    segments,
  };
}

function continuityPathStatusForSegments(segments: FiberContinuityPath["segments"]): FiberContinuityPath["pathStatus"] {
  if (segments.some((segment) => segment.segmentStatus === "broken")) return "broken";
  if (segments.some((segment) => segment.segmentStatus === "warning")) return "warning";
  if (segments.some((segment) => segment.segmentStatus === "proposed")) return "proposed";
  return "complete";
}

function worstPathStatus(paths: FiberContinuityPath[]): DashboardContinuitySummary["pathStatus"] {
  if (!paths.length) return "no_service";
  if (paths.some((path) => path.pathStatus === "broken")) return "broken";
  if (paths.some((path) => path.pathStatus === "warning")) return "warning";
  if (paths.some((path) => path.pathStatus === "proposed")) return "proposed";
  return "complete";
}

function highestCriticality(services: SyntheticService[]) {
  const order = ["critical", "high", "medium", "low"];
  return order.find((criticality) => services.some((service) => service.criticality === criticality)) || "no service";
}

function layerStateForOperatingMode(mode: DashboardOperatingMode, current: Record<StreetMapLayerKey, boolean>) {
  if (mode === "in_service") {
    return {
      ...current,
      publicTransmissionLines: true,
      publicSubstations: true,
      fccUtilityTowers: false,
      fccMicrowaveLinks: false,
      syntheticSubstations: false,
      transmissionStructures: false,
      syntheticOpgwCables: true,
      assumedOpgwRoutes: false,
      plannedOpgwFiber: false,
      verifiedOpgwFiber: true,
      opgwRoutes: true,
      opgwCableSections: false,
      opgwSpanSegments: false,
      opgwSplicePoints: false,
      existingFiberSplices: false,
      proposedFiberSplices: false,
      compareSpliceLayers: false,
      spliceClosures: false,
      patchPanels: false,
      distributionPoleDensity: true,
      distributionPoles: true,
      distributionFiberRoutes: true,
      distributionSplicePoints: false,
      distributionSlackLoops: false,
      distributionFiberAssignments: false,
      fiberAssignments: false,
      availableStrandCapacity: false,
      criticalRidingCircuits: false,
      opgwOutageImpact: false,
      opgwOpenWorkOrders: false,
      opgwSpanInspectionIssues: false,
    };
  }
  return {
    ...current,
    publicTransmissionLines: true,
    publicSubstations: true,
    fccUtilityTowers: false,
    fccMicrowaveLinks: false,
    transmissionStructures: false,
    syntheticSubstations: false,
    syntheticOpgwCables: true,
    assumedOpgwRoutes: true,
    plannedOpgwFiber: true,
    verifiedOpgwFiber: false,
    opgwRoutes: true,
    opgwCableSections: false,
    opgwSpanSegments: false,
    opgwSplicePoints: false,
    existingFiberSplices: false,
    proposedFiberSplices: false,
    compareSpliceLayers: false,
    spliceClosures: false,
    patchPanels: false,
    distributionPoleDensity: true,
    distributionPoles: true,
    distributionFiberRoutes: true,
    distributionSplicePoints: false,
    distributionSlackLoops: false,
    distributionFiberAssignments: false,
    fiberAssignments: false,
    availableStrandCapacity: false,
    criticalRidingCircuits: false,
    opgwOutageImpact: false,
    opgwOpenWorkOrders: false,
    opgwSpanInspectionIssues: false,
  };
}

type IsolatedOpgwLayerKey = "opgwRoutes" | "opgwCableSections" | "opgwSplicePoints";

function isolatedOpgwLayerState(current: Record<StreetMapLayerKey, boolean>, focusedLayers: IsolatedOpgwLayerKey | IsolatedOpgwLayerKey[]) {
  const next = { ...current };
  for (const key of Object.keys(next) as StreetMapLayerKey[]) {
    next[key] = false;
  }
  for (const layer of Array.isArray(focusedLayers) ? focusedLayers : [focusedLayers]) {
    next[layer] = true;
  }
  return next;
}

type GisScaleTerritory = {
  id: number;
  territory_key?: string;
  name?: string;
  boundary_status?: string;
  area_sq_miles?: number;
  summary_json?: Record<string, unknown>;
  validation_json?: Record<string, unknown>;
};

type GisScaleJob = {
  job_key?: string;
  service_territory_id?: number;
  target_pole_count?: number;
  inserted_pole_count?: number;
  inserted_span_count?: number;
  next_record_batch_id?: number;
  completed_batch_count?: number;
  progress_percent?: number;
  job_status?: string;
  current_step?: string;
};

type GisScaleHealthPayload = {
  postgis_configured?: boolean;
  status?: string;
  warnings?: string[];
  layers?: string[];
  territories?: GisScaleTerritory[];
  recent_generation_jobs?: GisScaleJob[];
  architecture_checks?: Record<string, boolean>;
  table_estimates?: Array<{ table_name: string; estimated_rows?: number; total_bytes?: number }>;
  tile_cache?: Array<{ layer: string; z: number; dirty: boolean; tile_count: number; truncated_tile_count?: number }>;
};

type GisScalePreflightPayload = {
  postgis_configured?: boolean;
  preflight?: {
    eligible_road_segment_count?: number;
    clipped_route_miles?: number;
    estimated_poles?: number;
    estimated_spans?: number;
    target_pole_count?: number;
    target_fill_percent?: number;
    batch_size?: number;
    batch_size_scope?: string;
    estimated_worker_batches?: number;
    status?: string;
  } | null;
  road_plan?: Array<{ placement_class?: string; eligible_road_segment_count?: number; clipped_route_miles?: number; estimated_poles?: number }>;
  warnings?: string[];
};

function GisScaleControlPanel({
  gisApiBase,
  onGisApiBaseChange,
  onResetGisApiBase,
  onEnableGisLayers,
}: {
  gisApiBase: string;
  onGisApiBaseChange: (value: string) => void;
  onResetGisApiBase: () => void;
  onEnableGisLayers: () => void;
}) {
  const [health, setHealth] = useState<GisScaleHealthPayload | null>(null);
  const [territories, setTerritories] = useState<GisScaleTerritory[]>([]);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState("");
  const [gisApiBaseDraft, setGisApiBaseDraft] = useState(gisApiBase);
  const [territoryName, setTerritoryName] = useState("Synthetic service territory");
  const [territoryText, setTerritoryText] = useState("");
  const [roadText, setRoadText] = useState("");
  const [territoryFile, setTerritoryFile] = useState<File | null>(null);
  const [roadFile, setRoadFile] = useState<File | null>(null);
  const [targetPoleCount, setTargetPoleCount] = useState(10_000_000);
  const [batchSize, setBatchSize] = useState(50_000);
  const [preflight, setPreflight] = useState<GisScalePreflightPayload | null>(null);
  const [jobKey, setJobKey] = useState("");
  const [job, setJob] = useState<GisScaleJob | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const normalizedGisApiBase = normalizeApiBase(gisApiBase);
  const usingWebsiteBackend = normalizedGisApiBase === normalizeApiBase(API_BASE);
  const usingLocalBridge = normalizedGisApiBase === normalizeApiBase(LOCAL_GIS_API_BASE);
  const importTargetLabel = usingWebsiteBackend ? "website PostGIS backend" : usingLocalBridge ? "local computer API bridge" : "custom GIS API";

  const selectedTerritory = territories.find((territory) => String(territory.id) === selectedTerritoryId) || health?.territories?.find((territory) => String(territory.id) === selectedTerritoryId);
  const postgisReady = Boolean(health?.postgis_configured);
  const tableEstimateMap = useMemo(
    () => new Map((health?.table_estimates || []).map((row) => [row.table_name, Number(row.estimated_rows || 0)])),
    [health?.table_estimates],
  );
  const gisScaleSummary = (selectedTerritory?.summary_json?.gis_scale || {}) as Record<string, unknown>;
  const summaryCount = useCallback((key: string, fallbackTableName: string) => {
    const summaryValue = Number(gisScaleSummary[key] || 0);
    return summaryValue || tableEstimateMap.get(fallbackTableName) || 0;
  }, [gisScaleSummary, tableEstimateMap]);
  const dirtyTileCount = (health?.tile_cache || []).reduce((sum, row) => sum + (row.dirty ? Number(row.tile_count || 0) : 0), 0);
  const cachedTileCount = (health?.tile_cache || []).reduce((sum, row) => sum + Number(row.tile_count || 0), 0);
  const loadedNetworkCards = [
    ["Synthetic poles", summaryCount("synthetic_pole_estimate", "telecom_poles")],
    ["Synthetic spans", summaryCount("synthetic_span_summary_count", "telecom_spans")],
    ["Fiber routes", tableEstimateMap.get("fiber_routes") || 0],
    ["Carried services", summaryCount("synthetic_circuit_route_count", "circuit_routes")],
    ["Splice cases", tableEstimateMap.get("splice_cases") || 0],
    ["Slack loops", tableEstimateMap.get("slack_loops") || 0],
    ["Handholes", tableEstimateMap.get("handholes") || 0],
    ["Mux sites", tableEstimateMap.get("mux_sites") || 0],
  ];

  useEffect(() => {
    setGisApiBaseDraft(gisApiBase);
  }, [gisApiBase]);

  const loadHealth = useCallback(async () => {
    setBusy("Loading GIS scale health");
    try {
      const [healthPayload, territoryPayload] = await Promise.all([
        fetchFromApiBase<GisScaleHealthPayload>(gisApiBase, "/api/gis/scale-health"),
        fetchFromApiBase<{ territories?: GisScaleTerritory[]; postgis_configured?: boolean }>(gisApiBase, "/api/service-territories"),
      ]);
      const nextTerritories = territoryPayload.territories || healthPayload.territories || [];
      setHealth(healthPayload);
      setTerritories(nextTerritories);
      if (!selectedTerritoryId && nextTerritories[0]) setSelectedTerritoryId(String(nextTerritories[0].id));
      const recentJob = healthPayload.recent_generation_jobs?.[0];
      if (!jobKey && recentJob?.job_key) {
        setJobKey(recentJob.job_key);
        setJob(recentJob);
      }
      setMessage(healthPayload.postgis_configured ? `PostGIS scale services are reachable from ${normalizeApiBase(gisApiBase)}.` : "PostGIS is not configured for this runtime; controls will show safe fallback responses.");
    } catch (error) {
      setMessage(`Could not reach ${normalizeApiBase(gisApiBase)}. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  }, [gisApiBase, jobKey, selectedTerritoryId]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  async function handleGeojsonFile(file: File | null, setFile: (value: File | null) => void, setter: (value: string) => void) {
    if (!file) return;
    setFile(file);
    if (file.size <= MAX_BROWSER_GEOJSON_PREVIEW_BYTES) {
      setter(await file.text());
      setMessage(`${file.name} is ready for direct website upload and loaded into the paste editor.`);
    } else {
      setter("");
      setMessage(`${file.name} is ready for direct website upload. It is too large for the browser preview, so it will be sent as a file.`);
    }
  }

  function parseGeoJsonText(value: string) {
    if (!value.trim()) throw new Error("Paste or upload GeoJSON first.");
    return JSON.parse(value) as Record<string, unknown>;
  }

  async function importTerritory(sourceType: "uploaded_geojson" | "manual_drawn_polygon") {
    setBusy("Importing service territory");
    try {
      const payload = await fetchFromApiBase<{ territory?: GisScaleTerritory; postgis_configured?: boolean }>(gisApiBase, "/api/service-territories/import-geojson", {
        method: "POST",
        body: JSON.stringify({
          name: territoryName || "Synthetic service territory",
          source_type: sourceType,
          source_reference: sourceType === "manual_drawn_polygon" ? "manual GeoJSON editor" : "uploaded GeoJSON",
          geojson: parseGeoJsonText(territoryText),
        }),
      });
      if (payload.territory?.id) {
        setSelectedTerritoryId(String(payload.territory.id));
        setMessage(`Imported territory ${payload.territory.name || payload.territory.id}.`);
      } else {
        setMessage(payload.postgis_configured === false ? "PostGIS is required before importing service territories." : "Territory import completed without a returned record.");
      }
      await loadHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function uploadTerritoryFile() {
    if (!territoryFile) {
      setMessage("Choose a service territory GeoJSON file from this computer first.");
      return;
    }
    setBusy("Uploading service territory file");
    try {
      const formData = new FormData();
      formData.set("file", territoryFile);
      formData.set("name", territoryName || territoryFile.name.replace(/\.(geo)?json$/i, ""));
      formData.set("source_type", "uploaded_geojson");
      formData.set("source_reference", territoryFile.name);
      const payload = await fetchFromApiBase<{ territory?: GisScaleTerritory; postgis_configured?: boolean }>(gisApiBase, "/api/service-territories/import-geojson-file", {
        method: "POST",
        body: formData,
      });
      if (payload.territory?.id) {
        setSelectedTerritoryId(String(payload.territory.id));
        setMessage(`Uploaded and imported territory ${payload.territory.name || payload.territory.id} into ${normalizeApiBase(gisApiBase)}.`);
      } else {
        setMessage(payload.postgis_configured === false ? "PostGIS is required on the website backend before uploaded territory files can be imported." : "Territory file upload completed without a returned record.");
      }
      await loadHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function importRoads() {
    if (!selectedTerritoryId) {
      setMessage("Select or import a service territory before importing road centerlines.");
      return;
    }
    setBusy("Importing road centerlines");
    try {
      const payload = await fetchFromApiBase<{ imported_or_updated?: number; excluded?: number; postgis_configured?: boolean }>(gisApiBase, "/api/road-centerlines/import-geojson", {
        method: "POST",
        body: JSON.stringify({
          service_territory_id: Number(selectedTerritoryId),
          source_name: "dashboard GeoJSON road centerlines",
          source_reference: "manual dashboard upload",
          max_features: 25000,
          geojson: parseGeoJsonText(roadText),
        }),
      });
      setMessage(payload.postgis_configured === false ? "PostGIS is required before importing road centerlines." : `Imported/updated ${formatCompactCount(payload.imported_or_updated || 0)} roads; ${formatCompactCount(payload.excluded || 0)} excluded.`);
      await loadHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function uploadRoadFile() {
    if (!selectedTerritoryId) {
      setMessage("Select or import a service territory before importing road centerlines.");
      return;
    }
    if (!roadFile) {
      setMessage("Choose a public road centerline GeoJSON file from this computer first.");
      return;
    }
    setBusy("Uploading road centerline file");
    try {
      const formData = new FormData();
      formData.set("file", roadFile);
      formData.set("service_territory_id", selectedTerritoryId);
      formData.set("source_name", "dashboard GeoJSON road centerlines");
      formData.set("source_reference", roadFile.name);
      formData.set("max_features", "250000");
      const payload = await fetchFromApiBase<{ imported_or_updated?: number; excluded?: number; postgis_configured?: boolean }>(gisApiBase, "/api/road-centerlines/import-geojson-file", {
        method: "POST",
        body: formData,
      });
      setMessage(payload.postgis_configured === false ? "PostGIS is required on the website backend before uploaded road files can be imported." : `Uploaded and imported ${formatCompactCount(payload.imported_or_updated || 0)} roads; ${formatCompactCount(payload.excluded || 0)} excluded.`);
      await loadHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function runPreflight() {
    if (!selectedTerritoryId) {
      setMessage("Select a territory before running preflight.");
      return;
    }
    setBusy("Running generation preflight");
    try {
      const payload = await fetchFromApiBase<GisScalePreflightPayload>(gisApiBase, `/api/service-territories/${selectedTerritoryId}/generation-preflight?target_pole_count=${targetPoleCount}&batch_size=${batchSize}&density_profile=auto`);
      setPreflight(payload);
      setMessage(payload.preflight ? `Preflight ${payload.preflight.status}: estimated ${formatCompactCount(payload.preflight.estimated_poles || 0)} poles.` : "Preflight requires PostGIS and imported road centerlines.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function queueGeneration() {
    if (!selectedTerritoryId) {
      setMessage("Select a territory before queueing generation.");
      return;
    }
    setBusy("Queueing background generation");
    try {
      const payload = await fetchFromApiBase<{ job?: GisScaleJob; postgis_configured?: boolean }>(gisApiBase, `/api/service-territories/${selectedTerritoryId}/generate-synthetic-assets`, {
        method: "POST",
        body: JSON.stringify({
          seed: "gridassetlink-dashboard-v1",
          target_pole_count: targetPoleCount,
          density_profile: "auto",
          attachment_profile: "telecom_standard",
          road_source: "public_road_centerlines",
          batch_size: batchSize,
        }),
      });
      if (payload.job?.job_key) {
        setJob(payload.job);
        setJobKey(payload.job.job_key);
        setMessage(`Queued background job ${payload.job.job_key}. Run the worker outside the browser.`);
      } else {
        setMessage(payload.postgis_configured === false ? "PostGIS is required before queueing generation." : "Generation queue request completed without a returned job.");
      }
      await loadHealth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function refreshJob() {
    if (!jobKey.trim()) {
      setMessage("Enter a generation job key.");
      return;
    }
    setBusy("Refreshing job status");
    try {
      const payload = await fetchFromApiBase<{ job?: GisScaleJob; postgis_configured?: boolean }>(gisApiBase, `/api/generation-jobs/${encodeURIComponent(jobKey.trim())}`);
      if (payload.job) {
        setJob(payload.job);
        setMessage(`Job ${payload.job.job_key || jobKey} is ${payload.job.job_status || "unknown"}.`);
      } else {
        setMessage(payload.postgis_configured === false ? "PostGIS is required before job status is available." : "No job record returned.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  const workerCommand = jobKey.trim() ? `.venv\\Scripts\\python.exe -m app.jobs.synthetic_telecom_generation_worker --job-key ${jobKey.trim()} --max-batches 10` : ".venv\\Scripts\\python.exe -m app.jobs.synthetic_telecom_generation_worker --max-batches 10";

  return (
    <section className="dashboard-gis-scale-panel" aria-label="GIS-scale synthetic distribution controls">
      <div className="dashboard-panel-heading">
        <Database size={16} />
        <div>
          <strong>GIS-scale controls</strong>
          <span>PostGIS vector tiles, territory clipping, and background generation</span>
        </div>
      </div>

      <div className="dashboard-source-boundary">
        <p>Do not load raw pole inventories in the browser. This panel imports boundaries/road references, queues generation, and shows summary/job state only.</p>
        <p>Generated poles, spans, strand, splice, slack, handhole, mux, circuit, and fiber records are synthetic until explicitly imported and marked verified.</p>
      </div>

      <div className="dashboard-gis-local-import-banner">
        <div>
          <strong>Import from this computer while using gridassetlink.dev</strong>
          <span>Select GeoJSON files in this browser. The files go to the active GIS API target below; the map still reads poles, spans, splices, and routes through vector tiles instead of downloading raw inventories.</span>
        </div>
        <button type="button" onClick={() => onGisApiBaseChange(LOCAL_GIS_API_BASE)} disabled={Boolean(busy)}>
          Use local bridge
        </button>
      </div>

      <div className="dashboard-gis-section">
        <div className="dashboard-gis-section-title">Import target for local files</div>
        <div className="dashboard-gis-import-choice-grid" role="group" aria-label="Choose where local files are imported">
          <button
            type="button"
            className={`dashboard-gis-import-choice ${usingWebsiteBackend ? "active" : ""}`}
            onClick={() => onGisApiBaseChange(API_BASE)}
            disabled={Boolean(busy)}
          >
            <Upload size={15} />
            <span>
              <strong>Import into website</strong>
              <small>Upload selected files to the gridassetlink.dev backend. Requires managed PostGIS on the deployed API.</small>
            </span>
          </button>
          <button
            type="button"
            className={`dashboard-gis-import-choice ${usingLocalBridge ? "active" : ""}`}
            onClick={() => onGisApiBaseChange(LOCAL_GIS_API_BASE)}
            disabled={Boolean(busy)}
          >
            <Database size={15} />
            <span>
              <strong>Import into local PostGIS</strong>
              <small>Use gridassetlink.dev as the app shell while files, tiles, search, and details point at this computer.</small>
            </span>
          </button>
        </div>
        <article className="dashboard-gis-card">
          <strong>Active target: {importTargetLabel}</strong>
          <span>{normalizedGisApiBase}</span>
          <span>{usingWebsiteBackend ? "Files selected on this computer upload to the hosted backend and import into managed PostGIS when configured." : "Files selected on this computer upload to this API source. Keep that API running and allow browser CORS/private-network access from gridassetlink.dev."}</span>
        </article>
        <label className="dashboard-gis-field">
          <span>GIS API URL</span>
          <input value={gisApiBaseDraft} onChange={(event) => setGisApiBaseDraft(event.currentTarget.value)} placeholder={LOCAL_GIS_API_BASE} />
        </label>
        <div className="dashboard-gis-actions">
          <button type="button" onClick={() => onGisApiBaseChange(gisApiBaseDraft)} disabled={Boolean(busy)}>Use this source</button>
          <button type="button" onClick={onResetGisApiBase} disabled={Boolean(busy)}>Use website backend</button>
          <button type="button" onClick={() => onGisApiBaseChange(LOCAL_GIS_API_BASE)} disabled={Boolean(busy)}>Use local bridge</button>
          <button type="button" onClick={loadHealth} disabled={Boolean(busy)}>Test connection</button>
        </div>
        <ol className="dashboard-gis-step-list">
          <li>Choose whether local files import into the website backend or a local API bridge.</li>
          <li>Import a service territory GeoJSON, then import public road centerline GeoJSON.</li>
          <li>Run preflight and queue generation; the worker writes synthetic assets into PostGIS in batches.</li>
          <li>Enable GIS layers to browse the generated network through vector tiles.</li>
        </ol>
        <p className="dashboard-gis-message">Do not upload a raw 10M-pole inventory file through the browser. Upload only territory and public road-reference inputs, then generate synthetic poles server-side.</p>
      </div>

      <div className="dashboard-gis-status-grid">
        <div><span>PostGIS</span><strong>{postgisReady ? "Configured" : "Not configured"}</strong></div>
        <div><span>Tile layers</span><strong>{formatCompactCount(health?.layers?.length || 0)}</strong></div>
        <div><span>Territories</span><strong>{formatCompactCount(territories.length || health?.territories?.length || 0)}</strong></div>
        <div><span>Recent jobs</span><strong>{formatCompactCount(health?.recent_generation_jobs?.length || 0)}</strong></div>
      </div>

      <div className="dashboard-gis-section">
        <div className="dashboard-gis-section-title">Loaded synthetic network</div>
        <div className="dashboard-gis-status-grid">
          {loadedNetworkCards.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{formatCompactCount(Number(value || 0))}</strong>
            </div>
          ))}
          <div><span>Cached tiles</span><strong>{formatCompactCount(cachedTileCount)}</strong></div>
          <div><span>Dirty tiles</span><strong>{formatCompactCount(dirtyTileCount)}</strong></div>
        </div>
        <p className="dashboard-gis-message">The dashboard uses density, cluster, simplified span, and route-summary vector tiles at low/mid zoom. Individual pole records appear only at street zoom and fetch full details on click.</p>
      </div>

      <div className="dashboard-gis-actions">
        <button type="button" onClick={loadHealth} disabled={Boolean(busy)}>Refresh health</button>
        <button type="button" onClick={onEnableGisLayers}>Enable GIS layers</button>
      </div>

      <label className="dashboard-gis-field">
        <span>Service territory</span>
        <select value={selectedTerritoryId} onChange={(event) => setSelectedTerritoryId(event.currentTarget.value)}>
          <option value="">Select territory</option>
          {territories.map((territory) => (
            <option value={territory.id} key={territory.id}>{territory.name || territory.territory_key || territory.id}</option>
          ))}
        </select>
      </label>

      {selectedTerritory ? (
        <article className="dashboard-gis-card">
          <strong>{selectedTerritory.name || selectedTerritory.territory_key}</strong>
          <span>Status: {selectedTerritory.boundary_status || "unknown"} / {Number(selectedTerritory.area_sq_miles || 0).toFixed(1)} sq mi</span>
        </article>
      ) : null}

      <div className="dashboard-gis-section">
        <div className="dashboard-gis-section-title">1. Import service territory from this computer</div>
        <label className="dashboard-gis-field">
          <span>Territory name</span>
          <input value={territoryName} onChange={(event) => setTerritoryName(event.currentTarget.value)} />
        </label>
        <input type="file" accept=".geojson,.json,application/json" onChange={(event) => void handleGeojsonFile(event.currentTarget.files?.[0] || null, setTerritoryFile, setTerritoryText)} />
        {territoryFile ? <p className="dashboard-gis-message">Selected: {territoryFile.name} ({formatCompactCount(territoryFile.size)} bytes)</p> : null}
        <textarea value={territoryText} onChange={(event) => setTerritoryText(event.currentTarget.value)} placeholder="Paste Polygon, MultiPolygon, Feature, or FeatureCollection GeoJSON" />
        <div className="dashboard-gis-actions">
          <button type="button" onClick={() => void uploadTerritoryFile()} disabled={Boolean(busy)}><Upload size={13} />Upload boundary file</button>
          <button type="button" onClick={() => void importTerritory("uploaded_geojson")} disabled={Boolean(busy)}>Import pasted boundary</button>
          <button type="button" onClick={() => void importTerritory("manual_drawn_polygon")} disabled={Boolean(busy)}>Save manual edit</button>
        </div>
      </div>

      <div className="dashboard-gis-section">
        <div className="dashboard-gis-section-title">2. Import public road centerlines from this computer</div>
        <input type="file" accept=".geojson,.json,application/json" onChange={(event) => void handleGeojsonFile(event.currentTarget.files?.[0] || null, setRoadFile, setRoadText)} />
        {roadFile ? <p className="dashboard-gis-message">Selected: {roadFile.name} ({formatCompactCount(roadFile.size)} bytes)</p> : null}
        <textarea value={roadText} onChange={(event) => setRoadText(event.currentTarget.value)} placeholder="Paste public road LineString/MultiLineString GeoJSON. Highways, ramps, rail, water, and unsuitable classes are excluded." />
        <div className="dashboard-gis-actions">
          <button type="button" onClick={() => void uploadRoadFile()} disabled={Boolean(busy)}><Upload size={13} />Upload road file</button>
          <button type="button" onClick={() => void importRoads()} disabled={Boolean(busy)}>Import pasted roads</button>
        </div>
      </div>

      <div className="dashboard-gis-section">
        <div className="dashboard-gis-section-title">3. Preflight and queue background synthetic generation</div>
        <div className="dashboard-gis-two-col">
          <label className="dashboard-gis-field">
            <span>Target poles</span>
            <input type="number" min={1} max={50000000} step={100000} value={targetPoleCount} onChange={(event) => setTargetPoleCount(Number(event.currentTarget.value))} />
          </label>
          <label className="dashboard-gis-field">
            <span>Batch size</span>
            <input type="number" min={10000} max={100000} step={10000} value={batchSize} onChange={(event) => setBatchSize(Number(event.currentTarget.value))} />
          </label>
        </div>
        <div className="dashboard-gis-actions">
          <button type="button" onClick={() => void runPreflight()} disabled={Boolean(busy)}>Run preflight</button>
          <button type="button" onClick={() => void queueGeneration()} disabled={Boolean(busy)}>Queue generation</button>
        </div>
        {preflight?.preflight ? (
          <article className="dashboard-gis-card">
            <strong>{preflight.preflight.status || "preflight"}</strong>
            <span>{formatCompactCount(preflight.preflight.estimated_poles || 0)} poles / {formatCompactCount(preflight.preflight.estimated_spans || 0)} spans / {formatCompactCount(preflight.preflight.estimated_worker_batches || 0)} worker batches</span>
            <span>{preflight.preflight.batch_size_scope}</span>
          </article>
        ) : null}
      </div>

      <div className="dashboard-gis-section">
        <div className="dashboard-gis-section-title">4. Worker and job status</div>
        <label className="dashboard-gis-field">
          <span>Generation job key</span>
          <input value={jobKey} onChange={(event) => setJobKey(event.currentTarget.value)} placeholder="gisgen-..." />
        </label>
        <button type="button" onClick={() => void refreshJob()} disabled={Boolean(busy)}>Refresh job</button>
        {job ? (
          <article className="dashboard-gis-card">
            <strong>{job.job_key}</strong>
            <span>{job.job_status || "unknown"} / {job.current_step || "no step"} / {Number(job.progress_percent || 0).toFixed(1)}%</span>
            <span>{formatCompactCount(job.inserted_pole_count || 0)} poles / {formatCompactCount(job.inserted_span_count || 0)} spans / next batch {job.next_record_batch_id ?? 0}</span>
          </article>
        ) : null}
        <code className="dashboard-gis-command">{workerCommand}</code>
      </div>

      {health?.warnings?.length ? (
        <div className="dashboard-gis-warning-list">
          {health.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
      {message ? <p className="dashboard-gis-message">{busy ? `${busy}... ` : ""}{message}</p> : null}
    </section>
  );
}

function DashboardDataSourcesPanel() {
  return (
    <section className="dashboard-source-disclosure-panel" aria-label="Dashboard data sourcing">
      <div className="dashboard-panel-heading">
        <TableProperties size={16} />
        <div>
          <strong>Data sourcing</strong>
          <span>Public references, attribution, and synthetic-data boundary</span>
        </div>
      </div>
      <div className="dashboard-source-boundary">
        {dataSourceSafetyNotes.map((note) => <p key={note}>{note}</p>)}
      </div>
      <div className="dashboard-source-list">
        {dataSourceRecords.map((source) => (
          <article className="dashboard-source-card" key={source.name}>
            <div className="dashboard-source-card-title">
              <div>
                <strong>{source.name}</strong>
                <span>{source.category}</span>
              </div>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.name} source information`}>
                  <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
            <p>{source.role}</p>
            <small>{source.handling}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModulesDrawer({ pathname, layerSummaries }: { pathname: string; layerSummaries: DashboardLayerSummary[] }) {
  return (
    <section className="dashboard-module-drawer" aria-label="Application modules">
      <div className="dashboard-panel-heading">
        <Network size={16} />
        <div>
          <strong>TelecomNE modules</strong>
          <span>Account-gated synthetic planning modules</span>
        </div>
      </div>
      <LayerSummaryDigest layerSummaries={layerSummaries} />
      <div className="dashboard-module-sections">
        {appNavGroups.map((group) => (
          <section className="dashboard-module-section" key={group.title}>
            <div className="dashboard-module-section-title">{group.title}</div>
            <div className="dashboard-module-link-grid">
              {group.items.map(([href, label, Icon]) => {
                const moduleLayers = layersForModule(href, layerSummaries);
                const visibleFeatureCount = moduleLayers.reduce((sum, layer) => sum + layer.visible, 0);
                return (
                  <Link className={`dashboard-module-link ${isActiveModule(pathname, href) ? "active" : ""}`} href={href} key={href}>
                    <Icon size={15} />
                    <span className="dashboard-module-link-copy">
                      <span>{label}</span>
                      {moduleLayers.length ? (
                        <small>{moduleLayers.slice(0, 2).map((layer) => layer.label).join(" + ")}{moduleLayers.length > 2 ? ` +${moduleLayers.length - 2}` : ""}</small>
                      ) : <small>Module data tables</small>}
                    </span>
                    <span className="dashboard-module-layer-count">
                      {formatCompactCount(visibleFeatureCount)}
                      <small>visible</small>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function LayerSummaryDigest({ layerSummaries, compact = false, title = "Layer information" }: { layerSummaries: DashboardLayerSummary[]; compact?: boolean; title?: string }) {
  const activeLayers = layerSummaries.filter((layer) => layer.enabled);
  const visibleFeatures = activeLayers.reduce((sum, layer) => sum + layer.visible, 0);
  const publicLayers = activeLayers.filter((layer) => layer.category === "Public reference");
  const syntheticLayers = activeLayers.filter((layer) => layer.category !== "Public reference");
  const topLayers = [...activeLayers].sort((a, b) => b.visible - a.visible).slice(0, compact ? 6 : 8);
  return (
    <article className={`dashboard-layer-digest ${compact ? "compact" : ""}`}>
      <div className="dashboard-layer-digest-title">
        <Layers size={15} />
        <span>
          <strong>{title}</strong>
          <small>{activeLayers.length} active map layers / {formatCompactCount(visibleFeatures)} visible features</small>
        </span>
      </div>
      <dl>
        <div><dt>Public reference</dt><dd>{publicLayers.length}</dd></div>
        <div><dt>Synthetic planning</dt><dd>{syntheticLayers.length}</dd></div>
        <div><dt>Layer catalog</dt><dd>{layerSummaries.length}</dd></div>
      </dl>
      <div className="dashboard-layer-chip-list">
        {topLayers.map((layer) => (
          <Link href={layer.moduleHref} className={`dashboard-layer-chip ${layer.enabled ? "active" : ""}`} title={`${layer.source}. ${layer.safety}`} key={layer.key}>
            <span>{layer.label}</span>
            <strong>{formatCompactCount(layer.visible)}</strong>
          </Link>
        ))}
      </div>
    </article>
  );
}

function FiltersResultsDrawer({
  publicOnly,
  search,
  searchLayerFilter,
  assetTypeFilter,
  statusFilter,
  regionFilter,
  visibilityFilter,
  ownerFilter,
  ownerOptions,
  searchResults,
  onSearchChange,
  onSearchLayerChange,
  onAssetTypeChange,
  onStatusChange,
  onRegionChange,
  onVisibilityChange,
  onOwnerChange,
  onSelectResult,
}: {
  publicOnly: boolean;
  search: string;
  searchLayerFilter: string;
  assetTypeFilter: string;
  statusFilter: string;
  regionFilter: string;
  visibilityFilter: string;
  ownerFilter: string;
  ownerOptions: string[];
  searchResults: StreetMapSelection[];
  onSearchChange: (value: string) => void;
  onSearchLayerChange: (value: string) => void;
  onAssetTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onVisibilityChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onSelectResult: (selection: StreetMapSelection) => void;
}) {
  return (
    <section className="dashboard-filter-results-panel" aria-label="Map filters and results">
      <div className="dashboard-panel-heading">
        <Filter size={16} />
        <div>
          <strong>Filters and results</strong>
          <span>{publicOnly ? "Public reference only" : "Synthetic/demo planning overlays"}</span>
        </div>
      </div>
      <label className="dashboard-panel-search">
        <Search size={14} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search map records" />
      </label>
      <div className="dashboard-filter-grid">
        <FilterSelect label="Search Layer" value={searchLayerFilter} onChange={onSearchLayerChange} options={searchLayerOptions.map((option) => option.value)} displayLabel={searchLayerLabel} />
        <FilterSelect label="Asset Types" value={assetTypeFilter} onChange={onAssetTypeChange} options={["all", "public_transmission_line", "public_substation", "transmission_structure", "opgw_cable", "splice_closure", "fiber_assignment", "patch_panel", "synthetic_substation", "substation", "node", "transmission_line", "work_order"]} />
        <FilterSelect label="Status" value={statusFilter} onChange={onStatusChange} options={["all", "synthetic_assumption", "planned", "design", "as_built_verified", "existing", "proposed", "reserved", "assigned", "open"]} />
        <FilterSelect label="Region" value={regionFilter} onChange={onRegionChange} options={["all", "MA", "RI", "CT", "NH", "VT", "ME"]} />
        <FilterSelect label="Utility Owner" value={ownerFilter} onChange={onOwnerChange} options={ownerOptions} />
        <FilterSelect label="Criticality" value="all" onChange={() => undefined} options={["all", "critical", "high", "normal"]} />
        <FilterSelect label="Manufacturer" value="all" onChange={() => undefined} options={["all", "SEL", "Cisco", "Nokia", "Other"]} />
        <FilterSelect label="Lifecycle" value="all" onChange={() => undefined} options={["all", "Existing", "Proposed", "Out of Service"]} />
        <FilterSelect label="Phase Type" value="all" onChange={() => undefined} options={["all", "ABC", "A", "B", "C"]} />
        <FilterSelect label="Circuit Type" value="all" onChange={() => undefined} options={["all", "C37.94", "SCADA", "Ethernet", "DS1"]} />
        <FilterSelect label="Visibility" value={visibilityFilter} onChange={onVisibilityChange} options={["all", "public", "synthetic-demo", "team", "private"]} />
      </div>
      <div className="dashboard-results-heading">
        <strong>Results</strong>
        <span>{searchResults.length}</span>
      </div>
      <div className="dashboard-map-results-list">
        {searchResults.length ? searchResults.map((result) => (
          <button type="button" key={`${result.kind}-${result.id}`} onClick={() => onSelectResult(result)}>
            <strong>{result.label}</strong>
            <span>{selectionLayerLabel(result)} / {formatSelectionKind(result.kind)} / {selectionStatus(result)}</span>
          </button>
        )) : <p>No matching map records.</p>}
      </div>
    </section>
  );
}

function isActiveModule(pathname: string, href: string) {
  if (pathname === "/" && href === "/dashboard") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SummaryDrawer({ cards, publicOnly, mapStatusMessage, opgwMetrics, layerSummaries }: { cards: ReturnType<typeof buildSummaryCards>; publicOnly: boolean; mapStatusMessage: string; opgwMetrics: ReturnType<typeof buildOpgwPlanningMetrics>; layerSummaries: DashboardLayerSummary[] }) {
  return (
    <section className="dashboard-floating-summary">
      <div className="dashboard-panel-heading">
        <Gauge size={16} />
        <div>
          <strong>Dashboard summary</strong>
          <span>{publicOnly ? "Public ISO-NE reference mode" : "Account-gated synthetic planning workspace"}</span>
        </div>
      </div>
      <LayerSummaryDigest layerSummaries={layerSummaries} compact />
      <article className="opgw-planning-card">
        <div>
          <Cable size={16} />
          <strong>OPGW Fiber Planning</strong>
        </div>
        <p>Synthetic/demo overlay. Assumptions are not active fiber and require conversion, work order, and as-built verification.</p>
        <dl>
          <div><dt>Synthetic OPGW route miles</dt><dd>{formatMiles(opgwMetrics.syntheticRouteMiles)}</dd></div>
          <div><dt>Planned OPGW route miles</dt><dd>{formatMiles(opgwMetrics.plannedRouteMiles)}</dd></div>
          <div><dt>Verified OPGW route miles</dt><dd>{formatMiles(opgwMetrics.verifiedRouteMiles)}</dd></div>
          <div><dt>Total OPGW routes</dt><dd>{opgwMetrics.totalRoutes.toLocaleString()}</dd></div>
          <div><dt>Total cable sections</dt><dd>{opgwMetrics.totalCableSections.toLocaleString()}</dd></div>
          <div><dt>Total span segments</dt><dd>{opgwMetrics.totalSpanSegments.toLocaleString()}</dd></div>
          <div><dt>Total splice points</dt><dd>{opgwMetrics.totalSplicePoints.toLocaleString()}</dd></div>
          <div><dt>Total strands</dt><dd>{opgwMetrics.totalStrands.toLocaleString()}</dd></div>
          <div><dt>Available strands</dt><dd>{opgwMetrics.availableStrands.toLocaleString()}</dd></div>
          <div><dt>Assigned strands</dt><dd>{opgwMetrics.assignedStrands.toLocaleString()}</dd></div>
          <div><dt>Reserved strands</dt><dd>{opgwMetrics.reservedStrands.toLocaleString()}</dd></div>
          <div><dt>Critical riding circuits</dt><dd>{opgwMetrics.criticalRidingCircuits.toLocaleString()}</dd></div>
          <div><dt>Open OPGW assumptions</dt><dd>{opgwMetrics.openAssumptions.toLocaleString()}</dd></div>
          <div><dt>Open OPGW work orders</dt><dd>{opgwMetrics.openWorkOrders.toLocaleString()}</dd></div>
          <div className="wide"><dt>Highest-risk route segment</dt><dd>{opgwMetrics.highestRiskRouteSegment}</dd></div>
        </dl>
        <div className="opgw-card-actions">
          <a href="/regional-grid/opgw-assumptions">Open OPGW assumptions</a>
          <a href="/opgw-cables">Open cable sections</a>
          <a href="/fiber-trace">Open fiber trace</a>
          <a href="/outage-impact">Open outage impact</a>
        </div>
      </article>
      <article className="opgw-planning-card">
        <div>
          <Workflow size={16} />
          <strong>OPGW Span Engineering</strong>
        </div>
        <p>Span records are synthetic structure-to-structure segments tied back to splice-point cable sections.</p>
        <dl>
          <div><dt>Total structures with OPGW</dt><dd>{opgwMetrics.totalSpanSegments ? opgwMetrics.totalSpanSegments + opgwMetrics.totalRoutes : 0}</dd></div>
          <div><dt>Total span segments</dt><dd>{opgwMetrics.totalSpanSegments.toLocaleString()}</dd></div>
          <div><dt>Spans with inspection issues</dt><dd>{opgwMetrics.spanInspectionIssues.toLocaleString()}</dd></div>
          <div><dt>Spans with open work orders</dt><dd>{opgwMetrics.spansWithOpenWorkOrders.toLocaleString()}</dd></div>
          <div><dt>Spans with high outage risk</dt><dd>{opgwMetrics.highRiskSpans.toLocaleString()}</dd></div>
          <div className="wide"><dt>Highest-risk span</dt><dd>{opgwMetrics.highestRiskSpan}</dd></div>
          <div className="wide"><dt>Highest-risk cable section</dt><dd>{opgwMetrics.highestRiskCableSection}</dd></div>
          <div><dt>Average span risk score</dt><dd>{opgwMetrics.averageSpanRiskScore.toFixed(1)}</dd></div>
          <div><dt>Open inspection records</dt><dd>{opgwMetrics.spanInspectionIssues.toLocaleString()}</dd></div>
        </dl>
        <div className="opgw-card-actions">
          <a href="/transmission-structures">Open span table</a>
          <a href="/work-orders">Create work order</a>
        </div>
      </article>
      <article className="opgw-planning-card">
        <div>
          <TableProperties size={16} />
          <strong>Fiber Capacity</strong>
        </div>
        <p>Capacity is calculated from synthetic strand and assignment records and excludes faulted or retired strands.</p>
        <dl>
          <div><dt>Total strands</dt><dd>{opgwMetrics.totalStrands.toLocaleString()}</dd></div>
          <div><dt>Available strands</dt><dd>{opgwMetrics.availableStrands.toLocaleString()}</dd></div>
          <div><dt>Assigned strands</dt><dd>{opgwMetrics.assignedStrands.toLocaleString()}</dd></div>
          <div><dt>Reserved strands</dt><dd>{opgwMetrics.reservedStrands.toLocaleString()}</dd></div>
          <div><dt>Damaged/out of service</dt><dd>{opgwMetrics.damagedOrOutOfServiceStrands.toLocaleString()}</dd></div>
          <div><dt>Below spare threshold</dt><dd>{opgwMetrics.lowSpareSections.toLocaleString()}</dd></div>
          <div className="wide"><dt>Highest utilization section</dt><dd>{opgwMetrics.highestUtilizationSection}</dd></div>
          <div className="wide"><dt>Lowest available route</dt><dd>{opgwMetrics.highestRiskRouteSegment}</dd></div>
        </dl>
        <div className="opgw-card-actions">
          <a href="/fiber-strand-table">Open capacity heatmap</a>
          <a href="/fiber-assignments">Open fiber assignments</a>
        </div>
      </article>
      <div className="dashboard-summary-compact-grid">
        {cards.map(({ label, value, note, Icon }) => (
          <div className="dashboard-summary-tile compact" key={label}>
            <Icon size={15} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      {mapStatusMessage ? <p className="dashboard-map-status-message">{mapStatusMessage}</p> : null}
    </section>
  );
}

function DatabaseGuideDrawer({
  coverageAreas,
  workflows,
  busyKey,
  message,
  onRunWorkflow,
  onRunCoverage,
  onRunAll,
  onOpenDesignRecords,
}: {
  coverageAreas: DatabaseGuideCoverageArea[];
  workflows: DatabaseGuideWorkflow[];
  busyKey: string;
  message: string;
  onRunWorkflow: (workflow: DatabaseGuideWorkflow) => void;
  onRunCoverage: (area: DatabaseGuideCoverageArea) => void;
  onRunAll: () => void;
  onOpenDesignRecords: () => void;
}) {
  return (
    <section className="dashboard-guide-panel" aria-label="Database guide">
      <div className="dashboard-panel-heading">
        <BookOpen size={16} />
        <div>
          <strong>Database Guide</strong>
          <span>Step-by-step synthetic edits for poles, spans, splicing, LIUs, devices, strands, and services.</span>
        </div>
      </div>
      <div className="dashboard-guide-callout">
        <strong>No-code database updates</strong>
        <span>Use the buttons below to create or update synthetic Design Mode records. No JSON, payload editing, or coding is required; the app handles the database changes behind the scenes.</span>
      </div>
      <div className="dashboard-guide-actions">
        <button type="button" disabled={Boolean(busyKey)} onClick={onRunAll}><Database size={14} />{busyKey === "complete-guide-package" ? "Creating..." : "Create complete guide package"}</button>
        <button type="button" onClick={onOpenDesignRecords}><PencilRuler size={14} />Open Design records</button>
        <Link href="/guide"><BookOpen size={14} />Open full Guide module</Link>
        <Link href="/admin/database"><Database size={14} />Open database admin</Link>
      </div>
      {message ? <p className="dashboard-gis-message">{message}</p> : null}
      <div className="dashboard-guide-coverage">
        {coverageAreas.map((area) => (
          <article key={area.title}>
            <div>
              <strong>{area.title}</strong>
              <span>{area.summary}</span>
            </div>
            <div className="dashboard-guide-mini-list">
              <strong>Record types</strong>
              <div>{area.recordTypes.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
            <div className="dashboard-guide-mini-list">
              <strong>Design checks</strong>
              <div>{area.checks.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
            <div className="dashboard-guide-card-actions">
              <button type="button" disabled={Boolean(busyKey)} onClick={() => onRunCoverage(area)}>
                {busyKey === `coverage:${area.title}` ? "Creating..." : "Create related examples"}
              </button>
              <Link href={area.moduleHref}>Open module</Link>
            </div>
          </article>
        ))}
      </div>
      <div className="dashboard-guide-workflows">
        {workflows.map((workflow) => (
          <article key={workflow.key}>
            <div className="dashboard-guide-workflow-heading">
              <div>
                <strong>{workflow.title}</strong>
                <span>{workflow.summary}</span>
              </div>
              <button type="button" disabled={Boolean(busyKey)} onClick={() => onRunWorkflow(workflow)}>
                {busyKey === workflow.key ? "Creating..." : "Create example DB edits"}
              </button>
            </div>
            <div className="dashboard-guide-section-grid">
              <div>
                <strong>Workflow</strong>
                <ol>
                  {workflow.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
              <div>
                <strong>Database edits</strong>
                <ul>
                  {workflow.edits.map((edit) => <li key={edit}>{edit}</li>)}
                </ul>
              </div>
            </div>
            <div className="dashboard-guide-records">
              <strong>Records created or updated</strong>
              <div>
                {workflow.records.map((record) => (
                  <span key={record.record_key}>
                    <code>{record.record_key}</code>
                    {record.asset_type_slug}
                    <small>{record.status}</small>
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AddAssetChooser({ publicOnly, selectedKind, onSelect, onCreateMap }: { publicOnly: boolean; selectedKind: AddAssetKind | null; onSelect: (kind: AddAssetKind) => void; onCreateMap: () => void }) {
  return (
    <section className="dashboard-add-asset-panel">
      <div className="dashboard-panel-heading">
        <Plus size={16} />
        <div>
          <strong>Add Asset</strong>
          <span>{publicOnly ? "Public reference mode" : "Choose a synthetic type, then click the map"}</span>
        </div>
      </div>
      <div className="dashboard-add-asset-grid">
        {addAssetOptions.map((option) => (
          <button className={selectedKind === option.kind ? "active" : ""} type="button" key={option.kind} onClick={() => onSelect(option.kind)}>
            <strong>{option.label}</strong>
            <span>{option.note}</span>
          </button>
        ))}
      </div>
      <button className="telecom-map-button full-width" type="button" onClick={onCreateMap}>Create transmission map</button>
    </section>
  );
}

function FiberStrandTable({
  strands,
  assignments,
  opgwCables,
  strandContinuityRecords,
  onUpdateStrands,
  onViewContinuity,
}: {
  strands: FiberStrand[];
  assignments: FiberAssignment[];
  opgwCables: OpgwCableFeature[];
  strandContinuityRecords: StrandContinuityRecord[];
  onUpdateStrands: (cableId: string, strandNumbers: number[], status: FiberStrand["status"], assignmentId?: string) => void;
  onViewContinuity: (record: StrandContinuityRecord) => void;
}) {
  const [cableId, setCableId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const effectiveCableId = cableId || opgwCables[0]?.properties.id || "";
  const cable = opgwCables.find((item) => item.properties.id === effectiveCableId);
  const assignmentById = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment])), [assignments]);
  const continuityRecordsForCable = useMemo(
    () => strandContinuityRecords.filter((record) => record.cableIds.includes(effectiveCableId)),
    [effectiveCableId, strandContinuityRecords],
  );
  const rows = useMemo(() => strands
    .filter((strand) => strand.cableId === effectiveCableId)
    .filter((strand) => statusFilter === "all" || strand.status === statusFilter)
    .filter((strand) => {
      const lowered = query.trim().toLowerCase();
      if (!lowered) return true;
      return `${strand.strandNumber} ${strand.colorCode || ""} ${strand.status} ${strand.assignmentId || ""} ${strand.circuitId || ""}`.toLowerCase().includes(lowered);
    })
    .slice(0, 144), [effectiveCableId, query, statusFilter, strands]);
  const selectedRows = rows.filter((strand) => selected.includes(strand.strandNumber));
  const viewableRows = rows.filter((strand) => Boolean(findStrandContinuityRecord(strand, continuityRecordsForCable))).length;

  function toggleStrand(strandNumber: number) {
    setSelected((current) => current.includes(strandNumber) ? current.filter((item) => item !== strandNumber) : [...current, strandNumber]);
  }

  function updateSelected(status: FiberStrand["status"]) {
    if (!effectiveCableId || selectedRows.length === 0) return;
    onUpdateStrands(effectiveCableId, selectedRows.map((strand) => strand.strandNumber), status);
    setSelected([]);
  }

  function exportCsv() {
    const header = ["strandNumber", "tubeNumber", "colorCode", "status", "assignmentId", "circuitId", "notes"];
    const csv = [header.join(","), ...rows.map((row) => header.map((key) => JSON.stringify(row[key as keyof FiberStrand] ?? "")).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${effectiveCableId || "fiber-strands"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="fiber-planning-panel" aria-label="Fiber strand table">
      <div className="dashboard-panel-heading">
        <TableProperties size={16} />
        <div>
          <strong>Fiber strand table</strong>
          <span>Synthetic strand inventory and local planning reservations</span>
        </div>
      </div>
      <div className="fiber-control-grid">
        <label>
          <span>OPGW cable</span>
          <select value={effectiveCableId} onChange={(event) => { setCableId(event.target.value); setSelected([]); }}>
            {opgwCables.slice(0, 250).map((item) => <option key={item.properties.id} value={item.properties.id}>{item.properties.cableName}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {["all", "available", "assigned", "reserved", "dark", "spare", "faulted", "retired"].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      </div>
      <label className="dashboard-panel-search compact">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search strand, assignment, circuit" />
      </label>
      <div className="fiber-stat-row">
        <span>{cable?.properties.fiberCount || 0}F</span>
        <span>{rows.length} shown</span>
        <span>{viewableRows} continuity views</span>
        <span>{selectedRows.length} selected</span>
      </div>
      <div className="fiber-action-row">
        <button type="button" onClick={() => updateSelected("reserved")}>Reserve</button>
        <button type="button" onClick={() => updateSelected("assigned")}>Assign</button>
        <button type="button" onClick={() => updateSelected("available")}>Release</button>
        <button type="button" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="fiber-table-wrap">
        <table className="fiber-mini-table">
          <thead>
            <tr>
              <th>Strand</th>
              <th>Tube</th>
              <th>Color</th>
              <th>Status</th>
              <th>Assignment</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((strand) => {
              const assignment = strand.assignmentId ? assignmentById.get(strand.assignmentId) : undefined;
              const continuityRecord = findStrandContinuityRecord(strand, continuityRecordsForCable);
              return (
                <tr className={selected.includes(strand.strandNumber) ? "selected" : ""} key={strand.id} onClick={() => toggleStrand(strand.strandNumber)}>
                  <td>{strand.strandNumber}</td>
                  <td>{strand.tubeNumber || "-"}</td>
                  <td>{strand.colorCode || "-"}</td>
                  <td><span className={`fiber-status ${strand.status}`}>{strand.status}</span></td>
                  <td>{assignment?.assignmentName || strand.assignmentId || "-"}</td>
                  <td>
                    <button
                      type="button"
                      disabled={!continuityRecord}
                      title={continuityRecord ? "View full strand continuity on the dashboard without device layers" : "No continuity record for this strand"}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (continuityRecord) onViewContinuity(continuityRecord);
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SpliceMatrix({
  closures,
  splices,
  selectedAsset,
  onAddSplice,
  onDeleteSplice,
}: {
  closures: SpliceClosureFeature[];
  splices: FiberSplice[];
  selectedAsset: StreetMapSelection | null;
  onAddSplice: (splice: FiberSplice) => void;
  onDeleteSplice: (spliceId: string) => void;
}) {
  const initialClosureId = selectedAsset?.kind === "splice_closure" ? selectedAsset.id : "";
  const [closureId, setClosureId] = useState(initialClosureId);
  const effectiveClosureId = closureId || closures[0]?.properties.id || "";
  const closure = closures.find((item) => item.properties.id === effectiveClosureId);
  const rows = splices.filter((splice) => splice.spliceClosureId === effectiveClosureId).slice(0, 180);
  const totalLoss = rows.reduce((total, splice) => total + (splice.lossDb || 0), 0);
  const cableA = closure?.properties.cableIds[0] || "";
  const cableB = closure?.properties.cableIds[1] || cableA;

  useEffect(() => {
    if (initialClosureId) setClosureId(initialClosureId);
  }, [initialClosureId]);

  function addPlannedSplice() {
    if (!effectiveClosureId || !cableA) return;
    const nextIndex = rows.length + 1;
    onAddSplice({
      id: `SPLICE-PLAN-${Date.now().toString(36).toUpperCase()}`,
      spliceClosureId: effectiveClosureId,
      fromCableId: cableA,
      fromStrandNumber: nextIndex,
      toCableId: cableB,
      toStrandNumber: nextIndex,
      spliceType: cableA === cableB ? "express" : "straight_through",
      lossDb: 0.06,
      status: "planned",
      notes: "Synthetic planned splice created in no-auth demo mode.",
    });
  }

  return (
    <section className="fiber-planning-panel" aria-label="Splice matrix">
      <div className="dashboard-panel-heading">
        <Cable size={16} />
        <div>
          <strong>Splice matrix</strong>
          <span>Synthetic generated splices are read-only; planned/proposed rows can be changed</span>
        </div>
      </div>
      <label className="fiber-stacked-field">
        <span>Splice closure</span>
        <select value={effectiveClosureId} onChange={(event) => setClosureId(event.target.value)}>
          {closures.slice(0, 400).map((item) => <option key={item.properties.id} value={item.properties.id}>{item.properties.name}</option>)}
        </select>
      </label>
      <div className="fiber-stat-row">
        <span>{closure?.properties.structureNumber || "-"}</span>
        <span>{rows.length} splices</span>
        <span>{totalLoss.toFixed(2)} dB est.</span>
      </div>
      <div className="fiber-action-row">
        <button type="button" onClick={addPlannedSplice}>Add planned splice</button>
        <button type="button">Create branch</button>
        <button type="button">Export splice sheet</button>
      </div>
      <div className="fiber-table-wrap">
        <table className="fiber-mini-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Type</th>
              <th>Loss</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((splice) => (
              <tr key={splice.id}>
                <td>{splice.fromCableId} / {splice.fromStrandNumber}</td>
                <td>{splice.toCableId} / {splice.toStrandNumber}</td>
                <td>{splice.spliceType}</td>
                <td>{(splice.lossDb || 0).toFixed(2)} dB</td>
                <td><span className={`fiber-status ${splice.status}`}>{splice.status}</span></td>
                <td>{splice.status === "existing" ? <span className="fiber-readonly">read-only</span> : <button type="button" onClick={() => onDeleteSplice(splice.id)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FiberAssignmentPlanner({
  assignments,
  opgwCables,
  structures,
  strands,
  onCreateAssignment,
}: {
  assignments: FiberAssignment[];
  opgwCables: OpgwCableFeature[];
  structures: TransmissionStructureFeature[];
  strands: FiberStrand[];
  onCreateAssignment: (assignment: FiberAssignment) => void;
}) {
  const [serviceType, setServiceType] = useState<FiberAssignment["serviceType"]>("SEL_ICON");
  const [status, setStatus] = useState<FiberAssignment["status"]>("proposed");
  const [cableId, setCableId] = useState("");
  const [strandCount, setStrandCount] = useState(2);
  const effectiveCableId = cableId || opgwCables[0]?.properties.id || "";
  const cable = opgwCables.find((item) => item.properties.id === effectiveCableId);
  const structureById = useMemo(() => new Map(structures.map((structure) => [structure.properties.id, structure])), [structures]);
  const availableStrands = useMemo(() => strands
    .filter((strand) => strand.cableId === effectiveCableId && ["available", "spare", "dark"].includes(strand.status))
    .slice(0, strandCount), [effectiveCableId, strandCount, strands]);
  const startStructure = cable ? structureById.get(cable.properties.startStructureId) : undefined;
  const endStructure = cable ? structureById.get(cable.properties.endStructureId) : undefined;
  const estimatedDistance = cable?.properties.routeMiles || 0;
  const estimatedLoss = Number((estimatedDistance * 0.25 + 1).toFixed(2));
  const canCreate = Boolean(cable && startStructure && endStructure && availableStrands.length === strandCount);

  function createAssignment() {
    if (!cable || !startStructure || !endStructure || !canCreate) return;
    const strandNumbers = availableStrands.map((strand) => strand.strandNumber);
    const assignment: FiberAssignment = {
      id: `FASN-PLAN-${Date.now().toString(36).toUpperCase()}`,
      assignmentName: `${serviceType}-${startStructure.properties.structureNumber}-${endStructure.properties.structureNumber}`,
      synthetic: true,
      serviceType,
      status,
      aEndStructureId: startStructure.properties.id,
      zEndStructureId: endStructure.properties.id,
      cableIds: [cable.properties.id],
      strandSegments: [{
        cableId: cable.properties.id,
        strandNumbers,
        fromStructureId: startStructure.properties.id,
        toStructureId: endStructure.properties.id,
      }],
      spliceIds: [],
      estimatedDistanceMiles: estimatedDistance,
      estimatedLossDb: estimatedLoss,
      notes: "Synthetic/demo fiber assignment. Not an operational telecom route.",
    };
    onCreateAssignment(assignment);
  }

  return (
    <section className="fiber-planning-panel" aria-label="Fiber assignment planner">
      <div className="dashboard-panel-heading">
        <Workflow size={16} />
        <div>
          <strong>Fiber assignment planner</strong>
          <span>Reserve synthetic OPGW strands for planned/demo services</span>
        </div>
      </div>
      <div className="fiber-control-grid">
        <label>
          <span>Service type</span>
          <select value={serviceType} onChange={(event) => setServiceType(event.target.value as FiberAssignment["serviceType"])}>
            {["SEL_ICON", "C37_94", "Ethernet", "MPLS_TP", "OTN", "SCADA", "Protection", "DTT", "Leased", "Spare", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as FiberAssignment["status"])}>
            {["proposed", "planned", "reserved", "active", "retired"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <label className="fiber-stacked-field">
        <span>Candidate OPGW route</span>
        <select value={effectiveCableId} onChange={(event) => setCableId(event.target.value)}>
          {opgwCables.slice(0, 400).map((item) => <option key={item.properties.id} value={item.properties.id}>{item.properties.cableName}</option>)}
        </select>
      </label>
      <div className="fiber-control-grid">
        <label>
          <span>Strands</span>
          <input type="number" min={1} max={12} value={strandCount} onChange={(event) => setStrandCount(Number(event.target.value))} />
        </label>
        <label>
          <span>Available set</span>
          <input readOnly value={availableStrands.map((strand) => strand.strandNumber).join(", ") || "No continuous set"} />
        </label>
      </div>
      <div className="fiber-route-card">
        <strong>{startStructure?.properties.structureNumber || "A-end"} to {endStructure?.properties.structureNumber || "Z-end"}</strong>
        <span>{estimatedDistance.toFixed(2)} miles / {estimatedLoss.toFixed(2)} dB estimated loss</span>
        <small>Loss uses 0.25 dB per mile plus 0.5 dB connector loss per end. Splice losses are estimated separately in the splice matrix.</small>
      </div>
      {!canCreate ? <p className="fiber-warning">No continuous available strand set is available for the selected route and strand count.</p> : null}
      <button className="telecom-map-button full-width" type="button" disabled={!canCreate} onClick={createAssignment}>Confirm planned assignment</button>
      <div className="fiber-mini-list">
        {assignments.slice(0, 8).map((assignment) => (
          <div key={assignment.id}>
            <strong>{assignment.assignmentName}</strong>
            <span>{assignment.serviceType} / {assignment.status} / {(assignment.estimatedLossDb || 0).toFixed(2)} dB</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DesignEditDrawer({
  enabled,
  assetTypes,
  records,
  selectedRecord,
  selectedTypeSlug,
  pendingGeometry,
  activeTool,
  drawingVertexCount,
  message,
  onSelectedTypeSlugChange,
  onPendingGeometryChange,
  onBeginDrawing,
  onFinishDrawing,
  onCancelDraft,
  onNewRecord,
  onRefresh,
  onSelectRecord,
  onNotify,
}: {
  enabled: boolean;
  assetTypes: DesignAssetType[];
  records: DesignAssetRecord[];
  selectedRecord: DesignAssetRecord | null;
  selectedTypeSlug: string;
  pendingGeometry: DesignAssetGeoJsonGeometry | null;
  activeTool: MapDrawingTool;
  drawingVertexCount: number;
  message: string;
  onSelectedTypeSlugChange: (slug: string) => void;
  onPendingGeometryChange: (geometry: DesignAssetGeoJsonGeometry | null) => void;
  onBeginDrawing: (geometryType: DesignAssetGeometryType) => void;
  onFinishDrawing: () => void;
  onCancelDraft: () => void;
  onNewRecord: () => void;
  onRefresh: () => Promise<void>;
  onSelectRecord: (record: DesignAssetRecord) => void;
  onNotify: (message: string) => void;
}) {
  const [mode, setMode] = useState<"record" | "type" | "blueprint">("record");
  const [recordKey, setRecordKey] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [recordStatus, setRecordStatus] = useState<DesignAssetRecord["status"]>("proposed");
  const [notes, setNotes] = useState("");
  const [propertiesDraft, setPropertiesDraft] = useState<Record<string, string>>({});
  const [geometryText, setGeometryText] = useState("");
  const [assetSlug, setAssetSlug] = useState("");
  const [assetDisplayName, setAssetDisplayName] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetGeometryType, setAssetGeometryType] = useState<DesignAssetGeometryType>("point");
  const [assetFieldDrafts, setAssetFieldDrafts] = useState<DesignAssetField[]>(defaultObjectTypeFields);
  const [assetFieldsText, setAssetFieldsText] = useState(defaultDesignAssetFieldsText());
  const [assetStyleText, setAssetStyleText] = useState(JSON.stringify({ color: "#55d6ff", radius: 8, lineWidth: 3, fillOpacity: 0.18 }, null, 2));
  const [moduleBlueprints, setModuleBlueprints] = useState<DesignModuleBlueprint[]>([]);
  const [agentTools, setAgentTools] = useState<DesignAgentTool[]>([]);
  const [moduleEntities, setModuleEntities] = useState<DesignModuleEntity[]>([]);
  const [selectedModuleSnapshotEntities, setSelectedModuleSnapshotEntities] = useState<string[]>(["substations", "devices", "device-ports", "fiber-cables", "fiber-strands", "splice-closures", "fiber-splices", "patch-panels", "patch-panel-ports", "fiber-assignments", "circuits", "work-orders"]);
  const [moduleSnapshotLimit, setModuleSnapshotLimit] = useState("500");
  const [rebuildAudit, setRebuildAudit] = useState<DesignRebuildAudit | null>(null);
  const [selectedAgentToolKey, setSelectedAgentToolKey] = useState("");
  const [agentToolRecordKey, setAgentToolRecordKey] = useState("");
  const [agentToolDisplayLabel, setAgentToolDisplayLabel] = useState("");
  const [agentToolMaterialize, setAgentToolMaterialize] = useState(true);
  const [agentToolPropertiesText, setAgentToolPropertiesText] = useState("{}");
  const [agentToolGeometryText, setAgentToolGeometryText] = useState("");
  const [blueprintText, setBlueprintText] = useState("");
  const [blueprintImportMode, setBlueprintImportMode] = useState<"upsert" | "skip_existing">("upsert");
  const [busy, setBusy] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const activeType = assetTypes.find((item) => item.slug === selectedTypeSlug) || assetTypes[0];
  const fields = activeType?.fields_json?.length ? activeType.fields_json : activeType?.fields || [];
  const drawingForActiveType = Boolean(activeType && activeType.geometry_type !== "table_only" && activeTool === designToolForGeometryType(activeType.geometry_type));
  const pendingGeometryMatches = Boolean(activeType && pendingGeometry && geometryTypeMatchesDesignGeometry(activeType.geometry_type, pendingGeometry));
  const orderedAgentTools = useMemo(() => {
    const order = ["create-database-object", "create-pole", "create-device", "create-device-port", "create-splice", "create-fiber-splice", "create-fiber-span", "create-fiber-strand", "create-patch-panel", "create-patch-panel-port", "create-circuit", "create-fiber-assignment"];
    const orderIndex = new Map(order.map((key, index) => [key, index]));
    return [...agentTools].sort((a, b) => (orderIndex.get(a.tool_key) ?? 99) - (orderIndex.get(b.tool_key) ?? 99) || a.label.localeCompare(b.label));
  }, [agentTools]);
  const activeAgentDesignTool = orderedAgentTools.find((tool) => tool.tool_key === selectedAgentToolKey) || orderedAgentTools[0];
  const agentToolSupportsMaterialize = Boolean(activeAgentDesignTool?.supports_materialize);
  const pendingGeometryMatchesAgentTool = Boolean(activeAgentDesignTool && pendingGeometry && geometryTypeMatchesDesignGeometry(activeAgentDesignTool.geometry_type, pendingGeometry));
  const selectedWorkOrderNumber = selectedRecord ? designRecordWorkOrderNumber(selectedRecord) : "";
  const selectedWorkOrderId = selectedRecord ? designRecordWorkOrderId(selectedRecord) : null;

  useEffect(() => {
    if (!activeType && assetTypes[0]) onSelectedTypeSlugChange(assetTypes[0].slug);
  }, [activeType, assetTypes, onSelectedTypeSlugChange]);

  useEffect(() => {
    if (selectedRecord) {
      if (selectedRecord.asset_type_slug) onSelectedTypeSlugChange(selectedRecord.asset_type_slug);
      setRecordKey(selectedRecord.record_key);
      setDisplayLabel(selectedRecord.display_label);
      setRecordStatus(selectedRecord.status);
      setNotes(selectedRecord.notes || "");
      setPropertiesDraft(propertiesToFieldDraft(fields, selectedRecord.properties || selectedRecord.properties_json || {}));
      setGeometryText(selectedRecord.geometry || selectedRecord.geometry_json ? JSON.stringify(selectedRecord.geometry || selectedRecord.geometry_json, null, 2) : "");
      return;
    }
    if (!activeType) return;
    const defaults = defaultPropertiesForFields(fields);
    setRecordKey(`${activeType.slug}-${Date.now().toString(36)}`);
    setDisplayLabel(`${activeType.display_name} planning record`);
    setRecordStatus("proposed");
    setNotes("Synthetic/demo planning record only.");
    setPropertiesDraft(defaults);
    setGeometryText(defaultGeometryTextForType(activeType.geometry_type, pendingGeometry));
  }, [activeType, fields, onSelectedTypeSlugChange, selectedRecord]);

  useEffect(() => {
    if (!activeType || !pendingGeometry || !geometryTypeMatchesDesignGeometry(activeType.geometry_type, pendingGeometry)) return;
    setGeometryText(JSON.stringify(pendingGeometry, null, 2));
  }, [activeType, pendingGeometry]);

  useEffect(() => {
    setAssetFieldsText(JSON.stringify(assetFieldDrafts, null, 2));
  }, [assetFieldDrafts]);

  useEffect(() => {
    if (!enabled) return;
    Promise.all([
      fetchFromApiBase<DesignModuleBlueprint[]>(API_BASE, "/api/design-assets/module-blueprints"),
      fetchFromApiBase<DesignAgentTool[]>(API_BASE, "/api/design-assets/agent-tools"),
      fetchFromApiBase<DesignModuleEntity[]>(API_BASE, "/api/design-assets/module-entities"),
    ])
      .then(([blueprints, tools, entities]) => {
        setModuleBlueprints(blueprints);
        setAgentTools(tools);
        setModuleEntities(entities);
      })
      .catch((error) => setLocalMessage(error instanceof Error ? error.message : String(error)));
  }, [enabled]);

  useEffect(() => {
    if (!orderedAgentTools.length || selectedAgentToolKey) return;
    applyAgentToolExample(orderedAgentTools[0]);
  }, [orderedAgentTools, selectedAgentToolKey]);

  if (!enabled) {
    return (
      <section className="dashboard-design-panel">
        <div className="dashboard-panel-heading">
          <PencilRuler size={16} />
          <div><strong>Design/Edit mode</strong><span>Feature flag disabled</span></div>
        </div>
        <p className="dashboard-gis-message">Set <code>NEXT_PUBLIC_ENABLE_MAP_EDITING=true</code> to enable schema-backed editing.</p>
      </section>
    );
  }

  async function createAssetType() {
    setBusy("Creating object type");
    try {
      const fieldsPayload = JSON.parse(assetFieldsText) as DesignAssetField[];
      const stylePayload = JSON.parse(assetStyleText) as Record<string, unknown>;
      const payload = await fetchFromApiBase<DesignAssetType>(API_BASE, "/api/design-assets/asset-types", {
        method: "POST",
        body: JSON.stringify({
          slug: assetSlug,
          display_name: assetDisplayName,
          description: assetDescription,
          geometry_type: assetGeometryType,
          fields: fieldsPayload,
          searchable_fields: fieldsPayload.map((field) => field.name),
          map_style: stylePayload,
          status: "active",
        }),
      });
      onSelectedTypeSlugChange(payload.slug);
      await onRefresh();
      setLocalMessage(`Created object type ${payload.display_name}.`);
      onNotify(`Created object type ${payload.display_name}.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function saveRecord() {
    if (!activeType) {
      setLocalMessage("Create or select an object type first.");
      return;
    }
    setBusy(selectedRecord ? "Updating object" : "Creating object");
    try {
      const geometry = activeType.geometry_type === "table_only" ? null : JSON.parse(geometryText) as DesignAssetGeoJsonGeometry;
      const payload = await fetchFromApiBase<DesignAssetRecord>(API_BASE, selectedRecord ? `/api/design-assets/records/${selectedRecord.id}` : "/api/design-assets/records", {
        method: selectedRecord ? "PUT" : "POST",
        body: JSON.stringify({
          asset_type_slug: activeType.slug,
          record_key: recordKey,
          display_label: displayLabel,
          status: recordStatus,
          properties: fieldDraftToProperties(fields, propertiesDraft),
          geometry,
          source: "synthetic_demo",
          visibility: "synthetic-demo",
          notes,
        }),
      });
      await onRefresh();
      onPendingGeometryChange(null);
      onSelectRecord(payload);
      setLocalMessage(`Saved ${payload.display_label}.`);
      onNotify(`Saved editable planning object ${payload.display_label}.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function archiveRecord() {
    if (!selectedRecord) return;
    if (!window.confirm(`Archive ${selectedRecord.display_label}?`)) return;
    setBusy("Archiving record");
    try {
      await fetchFromApiBase<DesignAssetRecord>(API_BASE, `/api/design-assets/records/${selectedRecord.id}`, { method: "DELETE" });
      await onRefresh();
      setLocalMessage(`Archived ${selectedRecord.display_label}.`);
      onNotify(`Archived editable planning object ${selectedRecord.display_label}.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function installModuleBlueprint(blueprintKey: string) {
    setBusy("Installing module blueprint");
    try {
      const result = await fetchFromApiBase<DesignBlueprintInstallResult>(API_BASE, `/api/design-assets/module-blueprints/${blueprintKey}/install`, {
        method: "POST",
        body: JSON.stringify({ mode: "upsert" }),
      });
      await onRefresh();
      setLocalMessage(`Installed ${result.created_asset_types} new and updated ${result.updated_asset_types} object types. ${result.installed_asset_type_slugs.length} schema types are now available in Design Mode.`);
      onNotify("Installed Design Mode rebuild schemas.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function exportDesignBlueprint() {
    setBusy("Exporting blueprint");
    try {
      const blueprint = await fetchFromApiBase<DesignAssetBlueprint>(API_BASE, "/api/design-assets/blueprint?include_records=true");
      setBlueprintText(JSON.stringify(blueprint, null, 2));
      setLocalMessage(`Exported ${blueprint.asset_types.length} object types and ${blueprint.records.length} records into a portable Design Mode blueprint.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function exportRebuildPackage() {
    setBusy("Exporting rebuild package");
    try {
      const rebuildPackage = await fetchFromApiBase<DesignRebuildPackage>(API_BASE, "/api/design-assets/rebuild-package?include_records=true");
      setBlueprintText(JSON.stringify(rebuildPackage, null, 2));
      setLocalMessage(`Exported rebuild package with ${rebuildPackage.blueprint.asset_types.length} object types, ${rebuildPackage.blueprint.records.length} records, and ${rebuildPackage.snapshot_summary.snapshot_record_count} module snapshot records.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function importDesignBlueprint() {
    setBusy("Importing blueprint");
    try {
      const payload = JSON.parse(blueprintText) as DesignAssetBlueprint | DesignRebuildPackage;
      if (isDesignRebuildPackage(payload)) {
        const result = await fetchFromApiBase<DesignRebuildPackageImportResult>(API_BASE, "/api/design-assets/rebuild-package/import", {
          method: "POST",
          body: JSON.stringify({ ...payload, mode: blueprintImportMode }),
        });
        await onRefresh();
        setLocalMessage(`Imported rebuild package: ${result.blueprint_import.created_asset_types} object types created, ${result.blueprint_import.updated_asset_types} updated, ${result.blueprint_import.created_records} records created, ${result.blueprint_import.updated_records} updated.`);
        onNotify("Imported Design Mode rebuild package.");
        return;
      }
      const result = await fetchFromApiBase<DesignBlueprintInstallResult>(API_BASE, "/api/design-assets/blueprint/import", {
        method: "POST",
        body: JSON.stringify({ ...payload, mode: blueprintImportMode }),
      });
      await onRefresh();
      setLocalMessage(`Imported blueprint: ${result.created_asset_types} object types created, ${result.updated_asset_types} updated, ${result.created_records} records created, ${result.updated_records} updated.`);
      onNotify("Imported Design Mode blueprint.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function importRebuildPackageAndReplay() {
    setBusy("Importing and replaying rebuild package");
    try {
      const payload = JSON.parse(blueprintText) as DesignRebuildPackage;
      if (!isDesignRebuildPackage(payload)) throw new Error("Paste a Design Mode rebuild package JSON before replaying.");
      const result = await fetchFromApiBase<DesignRebuildPackageImportResult>(API_BASE, "/api/design-assets/rebuild-package/import", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          mode: blueprintImportMode,
          replay_snapshots: true,
          replay_options: {
            entities: selectedModuleSnapshotEntities,
            limit: Number.parseInt(moduleSnapshotLimit, 10) || 500,
            preserve_ids: true,
            normalize_user_refs: true,
          },
        }),
      });
      await onRefresh();
      setLocalMessage(`Imported package and replayed ${result.replay_result?.materialized_count || 0} module snapshot record${(result.replay_result?.materialized_count || 0) === 1 ? "" : "s"} into backend tables; ${result.replay_result?.error_count || 0} errors.`);
      onNotify("Imported rebuild package and replayed module snapshots.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function applyAgentToolExample(tool: DesignAgentTool) {
    setSelectedAgentToolKey(tool.tool_key);
    setAgentToolPropertiesText(JSON.stringify(tool.example_properties || {}, null, 2));
    setAgentToolGeometryText(tool.example_geometry ? JSON.stringify(tool.example_geometry, null, 2) : "");
    setAgentToolRecordKey("");
    setAgentToolDisplayLabel("");
    setAgentToolMaterialize(Boolean(tool.supports_materialize));
  }

  function usePendingGeometryForAgentTool() {
    if (!activeAgentDesignTool || !pendingGeometryMatchesAgentTool || !pendingGeometry) return;
    setAgentToolGeometryText(JSON.stringify(pendingGeometry, null, 2));
    setLocalMessage(`Loaded staged map geometry into ${activeAgentDesignTool.label}.`);
  }

  async function runAgentToolFromDashboard() {
    if (!activeAgentDesignTool) {
      setLocalMessage("Select a Design Mode creation tool first.");
      return;
    }
    setBusy(`Creating ${activeAgentDesignTool.label}`);
    try {
      const properties = JSON.parse(agentToolPropertiesText) as unknown;
      if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
        throw new Error("Tool field values must be a structured object.");
      }
      let geometry: DesignAssetGeoJsonGeometry | null = null;
      if (activeAgentDesignTool.geometry_type !== "table_only") {
        const geometryDraft = agentToolGeometryText.trim();
        if (!geometryDraft) throw new Error(`${activeAgentDesignTool.label} requires map geometry. Draw on the map or use staged geometry before saving.`);
        geometry = JSON.parse(geometryDraft) as DesignAssetGeoJsonGeometry;
      }
      const result = await fetchFromApiBase<DesignAgentToolRunResult>(API_BASE, `/api/design-assets/agent-tools/${activeAgentDesignTool.tool_key}/run`, {
        method: "POST",
        body: JSON.stringify({
          record_key: agentToolRecordKey.trim() || undefined,
          display_label: agentToolDisplayLabel.trim() || undefined,
          properties,
          geometry,
          materialize: agentToolMaterialize && agentToolSupportsMaterialize,
        }),
      });
      await onRefresh();
      onPendingGeometryChange(null);
      onSelectRecord(result.record);
      const materializationText = result.materialization?.action && result.materialization.action !== "skipped"
        ? ` Materialized into ${result.materialization.entity}.`
        : agentToolSupportsMaterialize && agentToolMaterialize
          ? " Backend materialization was skipped."
          : " Stored as a Design Mode record.";
      setLocalMessage(`${result.record_action === "created" ? "Created" : "Updated"} ${result.record.display_label}.${materializationText}`);
      onNotify(`${result.record_action === "created" ? "Created" : "Updated"} ${activeAgentDesignTool.label}.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function toggleModuleSnapshotEntity(entity: string) {
    setSelectedModuleSnapshotEntities((current) => current.includes(entity) ? current.filter((item) => item !== entity) : [...current, entity]);
  }

  function selectCommonModuleSnapshotEntities() {
    const common = ["substations", "devices", "device-ports", "transmission-lines", "regional-substations", "regional-transmission-lines", "regional-structures", "fiber-cables", "fiber-segments", "fiber-strands", "splice-closures", "splice-trays", "fiber-splices", "patch-panels", "patch-panel-ports", "fiber-assignments", "circuits", "circuit-paths", "circuit-path-elements", "work-orders", "work-order-tasks"];
    const available = new Set(moduleEntities.map((entity) => entity.entity));
    setSelectedModuleSnapshotEntities(common.filter((entity) => available.has(entity)));
  }

  function selectAllModuleSnapshotEntities() {
    setSelectedModuleSnapshotEntities(moduleEntities.map((entity) => entity.entity));
  }

  async function captureModuleSnapshot() {
    if (!selectedModuleSnapshotEntities.length) {
      setLocalMessage("Select at least one backend module table to capture.");
      return;
    }
    setBusy("Capturing module snapshot");
    try {
      const result = await fetchFromApiBase<DesignModuleSnapshotResult>(API_BASE, "/api/design-assets/module-snapshot", {
        method: "POST",
        body: JSON.stringify({
          entities: selectedModuleSnapshotEntities,
          limit_per_entity: Number.parseInt(moduleSnapshotLimit, 10) || 500,
          mode: "upsert",
        }),
      });
      await onRefresh();
      setLocalMessage(`Captured ${result.captured_count} backend module rows into Design Mode snapshot records across ${result.entities.length} table${result.entities.length === 1 ? "" : "s"}.`);
      onNotify("Captured backend module data into Design Mode records.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function replayModuleSnapshot() {
    setBusy("Replaying module snapshot");
    try {
      const result = await fetchFromApiBase<DesignModuleSnapshotMaterializeResult>(API_BASE, "/api/design-assets/module-snapshot/materialize", {
        method: "POST",
        body: JSON.stringify({
          entities: selectedModuleSnapshotEntities,
          limit: Number.parseInt(moduleSnapshotLimit, 10) || 500,
          mode: "upsert",
          preserve_ids: true,
          normalize_user_refs: true,
        }),
      });
      await onRefresh();
      setLocalMessage(`Replayed ${result.materialized_count} Design Mode snapshot record${result.materialized_count === 1 ? "" : "s"} into backend tables; ${result.skipped_count} skipped, ${result.error_count} errors.`);
      onNotify("Replayed Design Mode module snapshot into backend tables.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function runRebuildAudit() {
    const entities = selectedModuleSnapshotEntities.length ? selectedModuleSnapshotEntities.join(",") : "all";
    setBusy("Running rebuild audit");
    try {
      const result = await fetchFromApiBase<DesignRebuildAudit>(API_BASE, `/api/design-assets/rebuild-audit?entities=${encodeURIComponent(entities)}&record_limit=${encodeURIComponent(moduleSnapshotLimit)}`);
      setRebuildAudit(result);
      setLocalMessage(result.rebuild_ready
        ? `Rebuild audit passed for ${result.totals.entity_count} table${result.totals.entity_count === 1 ? "" : "s"}: ${result.totals.snapshot_record_count} snapshot records are replay-ready.`
        : `Rebuild audit found ${result.totals.missing_snapshot_entity_count} missing, ${result.totals.partial_entity_count} partial, and ${result.totals.needs_review_entity_count} needs-review table${result.totals.needs_review_entity_count === 1 ? "" : "s"}.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function materializeSelectedRecord(modeValue: "upsert" | "skip_existing" = "upsert") {
    if (!selectedRecord) {
      setLocalMessage("Select a Design Mode object first.");
      return;
    }
    setBusy("Materializing selected object");
    try {
      const result = await fetchFromApiBase<DesignMaterializationResult>(API_BASE, `/api/design-assets/records/${selectedRecord.id}/materialize`, {
        method: "POST",
        body: JSON.stringify({ mode: modeValue }),
      });
      setLocalMessage(result.action === "skipped"
        ? `Skipped ${selectedRecord.display_label}: ${result.reason || "no backend materialization rule"}`
        : `Materialized ${selectedRecord.display_label} into ${result.entity} #${result.entity_id}.`);
      onNotify("Materialized Design Mode object into backend module data.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function issueWorkOrderFromSelectedRecord() {
    if (!selectedRecord) {
      setLocalMessage("Select a Design Mode object first.");
      return;
    }
    setBusy("Issuing work order");
    try {
      const result = await fetchFromApiBase<DesignIssuedWorkOrderResult>(API_BASE, `/api/design-assets/records/${selectedRecord.id}/issue-work-order`, {
        method: "POST",
        body: JSON.stringify({
          title: `Design work: ${selectedRecord.display_label}`,
          work_type: "design_database_work",
          priority: "normal",
          status: "issued",
        }),
      });
      await onRefresh();
      onSelectRecord(result.record);
      setLocalMessage(`Issued ${result.work_order.work_order_number || "work order"} with ${result.tasks.length} task${result.tasks.length === 1 ? "" : "s"} for ${selectedRecord.display_label}.`);
      onNotify(`Issued work order ${result.work_order.work_order_number || ""} from Design Mode.`);
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function materializeActiveType(modeValue: "upsert" | "skip_existing" = "upsert") {
    if (!activeType) {
      setLocalMessage("Select an object type first.");
      return;
    }
    setBusy("Materializing object type");
    try {
      const result = await fetchFromApiBase<DesignMaterializationBatchResult>(API_BASE, "/api/design-assets/materialize", {
        method: "POST",
        body: JSON.stringify({ asset_type_slug: activeType.slug, mode: modeValue }),
      });
      setLocalMessage(`Materialized ${result.materialized_count} ${activeType.display_name} object${result.materialized_count === 1 ? "" : "s"} into backend tables; ${result.skipped_count} skipped, ${result.error_count} errors.`);
      onNotify("Materialized Design Mode object type into backend module data.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function updateProperty(fieldName: string, value: string) {
    setPropertiesDraft((current) => ({ ...current, [fieldName]: value }));
  }

  function updateAssetDisplayName(value: string) {
    setAssetDisplayName(value);
    if (!assetSlug.trim()) setAssetSlug(slugFromLabel(value));
  }

  function applyAssetTemplate(template: "database-object" | "map-point" | "fiber-span") {
    if (template === "database-object") {
      setAssetSlug("custom-database-object");
      setAssetDisplayName("Custom database object");
      setAssetDescription("Table-only synthetic/demo object type for arbitrary planning data.");
      setAssetGeometryType("table_only");
      setAssetFieldDrafts(defaultObjectTypeFields());
      setAssetStyleText("{}");
      return;
    }
    if (template === "fiber-span") {
      setAssetSlug("custom-fiber-span");
      setAssetDisplayName("Custom fiber span");
      setAssetDescription("Line-based synthetic/demo object type for fiber, cable, span, or route planning.");
      setAssetGeometryType("line");
      setAssetFieldDrafts(defaultFiberSpanFields());
      setAssetStyleText(JSON.stringify({ color: "#6ee7b7", lineWidth: 4 }, null, 2));
      return;
    }
    setAssetSlug("custom-map-object");
    setAssetDisplayName("Custom map object");
    setAssetDescription("Point-based synthetic/demo object type for map nodes, equipment, issues, or planning notes.");
    setAssetGeometryType("point");
    setAssetFieldDrafts(defaultMapPointFields());
    setAssetStyleText(JSON.stringify({ color: "#55d6ff", radius: 8, fillOpacity: 0.22 }, null, 2));
  }

  function updateAssetField(index: number, patch: Partial<DesignAssetField>) {
    setAssetFieldDrafts((current) => current.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)));
  }

  function updateAssetFieldType(index: number, type: DesignAssetFieldType) {
    setAssetFieldDrafts((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      return {
        ...field,
        type,
        enum_options: type === "enum" ? field.enum_options?.length ? field.enum_options : ["proposed", "planned", "active"] : [],
      };
    }));
  }

  function addAssetField() {
    setAssetFieldDrafts((current) => [...current, blankDesignField(current.length + 1)]);
  }

  function removeAssetField(index: number) {
    setAssetFieldDrafts((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  }

  function syncFieldBuilderFromJson() {
    try {
      const parsed = JSON.parse(assetFieldsText) as DesignAssetField[];
      if (!Array.isArray(parsed)) throw new Error("Advanced field backup must be a list.");
      setAssetFieldDrafts(parsed);
      setLocalMessage("Loaded advanced field backup into the visual field builder.");
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="dashboard-design-panel" aria-label="Schema-backed Design/Edit mode">
      <div className="dashboard-panel-heading">
        <PencilRuler size={16} />
        <div>
          <strong>Design/Edit mode</strong>
          <span>Schema-backed synthetic planning records</span>
        </div>
      </div>
      <div className="dashboard-source-boundary">
        <p>This editor is for synthetic/demo planning records only. Do not enter CEII, SCADA, relay, protection, telecom, operational access, or private fiber-route data.</p>
      </div>
      <div className="dashboard-design-tabs">
        <button type="button" className={mode === "record" ? "active" : ""} onClick={() => setMode("record")}>Records</button>
        <button type="button" className={mode === "type" ? "active" : ""} onClick={() => setMode("type")}>Type Designer</button>
        <button type="button" className={mode === "blueprint" ? "active" : ""} onClick={() => setMode("blueprint")}>Blueprints</button>
      </div>

      {mode === "blueprint" ? (
        <div className="dashboard-design-form">
          <div className="dashboard-design-row-title">
            <strong>Rebuild database from Design Mode</strong>
            <span>Install schemas that mirror module and layer data, export the current Design Mode database, or import a blueprint into a blank instance.</span>
          </div>
          <div className="dashboard-design-blueprint-list">
            {moduleBlueprints.map((blueprint) => (
              <article className="dashboard-design-blueprint-card" key={blueprint.key}>
                <div>
                  <strong>{blueprint.display_name}</strong>
                  <span>{blueprint.description}</span>
                </div>
                <div className="dashboard-design-blueprint-meta">
                  <span>{blueprint.asset_type_count} object types</span>
                  <span>{blueprint.record_count} starter records</span>
                </div>
                <div className="dashboard-design-blueprint-slugs">
                  {blueprint.asset_types.map((assetType) => <span key={assetType.slug}>{assetType.slug}</span>)}
                </div>
                <button className="telecom-map-button full-width" type="button" onClick={() => void installModuleBlueprint(blueprint.key)} disabled={Boolean(busy)}>Install rebuild schemas</button>
              </article>
            ))}
            {!moduleBlueprints.length ? <p className="dashboard-gis-message">No module blueprint bundles are available from the API yet.</p> : null}
          </div>
          <div className="dashboard-source-boundary">
            <p>Blueprints are for synthetic/demo planning schemas and records. They do not convert assumptions into operational data and must not contain real CEII, protection settings, credentials, private fiber routes, or operational access information.</p>
          </div>
          <div className="dashboard-design-row-title">
            <strong>Capture module data into Design Mode</strong>
            <span>Snapshot existing backend module rows as full-fidelity Design Mode records, export them in a blueprint, then replay them into a blank instance when needed.</span>
          </div>
          <div className="dashboard-design-quick-add">
            <div className="dashboard-gis-actions">
              <button type="button" onClick={selectCommonModuleSnapshotEntities}>Select rebuild core</button>
              <button type="button" onClick={selectAllModuleSnapshotEntities}>Select all snapshot tables</button>
              <button type="button" onClick={() => setSelectedModuleSnapshotEntities([])}>Clear</button>
            </div>
            <label className="dashboard-design-inline-select"><span>Rows per table</span><input type="number" min="1" max="5000" value={moduleSnapshotLimit} onChange={(event) => setModuleSnapshotLimit(event.currentTarget.value)} /></label>
            <div className="dashboard-design-entity-grid" aria-label="Backend module snapshot entities">
              {moduleEntities.map((entity) => {
                const checked = selectedModuleSnapshotEntities.includes(entity.entity);
                return (
                  <button type="button" key={entity.entity} className={checked ? "active" : ""} onClick={() => toggleModuleSnapshotEntity(entity.entity)}>
                    <strong>{entity.entity}</strong>
                    <span>{entity.record_count} rows / {entity.fields.length} fields</span>
                  </button>
                );
              })}
            </div>
            {!moduleEntities.length ? <p className="dashboard-gis-message">No backend module entity metadata is available from the API yet.</p> : null}
            <div className="dashboard-gis-actions">
              <button className="telecom-map-button" type="button" onClick={() => void captureModuleSnapshot()} disabled={Boolean(busy) || !selectedModuleSnapshotEntities.length}>Capture selected module rows</button>
              <button type="button" onClick={() => void replayModuleSnapshot()} disabled={Boolean(busy) || !selectedModuleSnapshotEntities.length}>Replay selected snapshots to backend</button>
              <button type="button" onClick={() => void runRebuildAudit()} disabled={Boolean(busy)}>Run rebuild audit</button>
            </div>
            <p className="dashboard-gis-message">Snapshot replay preserves row IDs by default so related fibers, splices, ports, circuits, and work-order references can be rebuilt together. Demo actor references are normalized to the backend no-account user or cleared.</p>
            {rebuildAudit ? (
              <div className="dashboard-design-audit">
                <div className="dashboard-design-audit-summary">
                  <span>{rebuildAudit.rebuild_ready ? "Replay ready" : "Needs capture/review"}</span>
                  <span>{rebuildAudit.totals.snapshot_record_count} snapshots</span>
                  <span>{rebuildAudit.totals.backend_record_count} backend rows</span>
                  <span>{rebuildAudit.totals.missing_snapshot_entity_count} missing</span>
                  <span>{rebuildAudit.totals.partial_entity_count} partial</span>
                  <span>{rebuildAudit.totals.invalid_snapshot_count} invalid</span>
                </div>
                <div className="dashboard-design-audit-table">
                  {rebuildAudit.rows.slice(0, 18).map((row) => (
                    <div key={row.entity}>
                      <strong>{row.entity}</strong>
                      <span>{row.coverage_status}</span>
                      <span>{row.snapshot_record_count}/{row.backend_record_count}</span>
                      <span>{row.missing_model_field_count ? `${row.missing_model_field_count} fields missing` : "fields captured"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="dashboard-design-row-title">
            <strong>Quick add objects from Design Mode</strong>
            <span>Create poles, devices, ports, splice points, splice rows, spans/cables, strands, patch panels, circuits, fiber assignments, or any table-only database object directly from the dashboard UI.</span>
          </div>
          <div className="dashboard-design-tool-picker">
            {orderedAgentTools.map((tool) => (
              <button type="button" key={tool.tool_key} className={activeAgentDesignTool?.tool_key === tool.tool_key ? "active" : ""} onClick={() => applyAgentToolExample(tool)}>
                <strong>{tool.label}</strong>
                <span>{tool.geometry_type === "table_only" ? "database object" : tool.geometry_type} / {tool.supports_materialize ? tool.backend_entity : "Design Mode only"}</span>
              </button>
            ))}
          </div>
          {activeAgentDesignTool ? (
            <div className="dashboard-design-quick-add">
              <div className="dashboard-design-row-title">
                <strong>{activeAgentDesignTool.label}</strong>
                <span>{activeAgentDesignTool.description}</span>
              </div>
              <label><span>Creation tool</span><select value={activeAgentDesignTool.tool_key} onChange={(event) => {
                const nextTool = orderedAgentTools.find((tool) => tool.tool_key === event.currentTarget.value);
                if (nextTool) applyAgentToolExample(nextTool);
              }}>
                {orderedAgentTools.map((tool) => <option key={tool.tool_key} value={tool.tool_key}>{tool.label}</option>)}
              </select></label>
              <label><span>Record key override</span><input value={agentToolRecordKey} onChange={(event) => setAgentToolRecordKey(event.currentTarget.value)} placeholder="Leave blank to use the object ID" /></label>
              <label><span>Display label override</span><input value={agentToolDisplayLabel} onChange={(event) => setAgentToolDisplayLabel(event.currentTarget.value)} placeholder="Leave blank to use the object name or ID" /></label>
              {activeAgentDesignTool.geometry_type !== "table_only" ? (
                <>
                  <div className="dashboard-gis-actions">
                    <button type="button" onClick={() => onBeginDrawing(activeAgentDesignTool.geometry_type)} disabled={Boolean(busy)}>Draw {activeAgentDesignTool.geometry_type}</button>
                    {pendingGeometryMatchesAgentTool ? <button type="button" onClick={usePendingGeometryForAgentTool}>Use staged map geometry</button> : null}
                  </div>
                  <details className="dashboard-design-advanced">
                    <summary>Advanced geometry backup</summary>
                    <label><span>Geometry backup</span><textarea value={agentToolGeometryText} onChange={(event) => setAgentToolGeometryText(event.currentTarget.value)} /></label>
                  </details>
                </>
              ) : (
                <p className="dashboard-gis-message">This tool creates a table-only database record. It will not draw a map feature unless you later assign it to a point, line, or polygon object type.</p>
              )}
              <details className="dashboard-design-advanced">
                <summary>Advanced tool field backup</summary>
                <label><span>Tool field backup</span><textarea value={agentToolPropertiesText} onChange={(event) => setAgentToolPropertiesText(event.currentTarget.value)} /></label>
              </details>
              <label className="dashboard-design-inline-select"><span>Backend write</span><select value={agentToolMaterialize && agentToolSupportsMaterialize ? "materialize" : "design-only"} onChange={(event) => setAgentToolMaterialize(event.currentTarget.value === "materialize")} disabled={!agentToolSupportsMaterialize}>
                {agentToolSupportsMaterialize ? <option value="materialize">Create Design record and module row</option> : null}
                <option value="design-only">Design Mode record only</option>
              </select></label>
              <div className="dashboard-gis-actions">
                <button className="telecom-map-button" type="button" onClick={() => void runAgentToolFromDashboard()} disabled={Boolean(busy)}>Create with selected Design tool</button>
              </div>
            </div>
          ) : (
            <p className="dashboard-gis-message">Install or refresh the Design Mode agent tools to quick-add objects from the dashboard.</p>
          )}
          <details className="dashboard-design-advanced">
            <summary>Advanced automation manifest</summary>
            <div className="dashboard-design-row-title">
              <strong>Design Mode automation tools</strong>
              <span>Reference list for integrations. Everyday updates should use the buttons, drawing controls, and field forms above.</span>
            </div>
            <div className="dashboard-design-blueprint-list">
              {orderedAgentTools.map((tool) => (
                <article className="dashboard-design-blueprint-card" key={tool.tool_key}>
                  <div>
                    <strong>{tool.label}</strong>
                    <span>{tool.description}</span>
                  </div>
                  <div className="dashboard-design-blueprint-meta">
                    <span>{tool.asset_type_slug}</span>
                    <span>{tool.backend_entity || "Design Mode only"}</span>
                  </div>
                  <div className="dashboard-design-blueprint-slugs">
                    {tool.required_properties.map((field) => <span key={field}>required: {field}</span>)}
                  </div>
                </article>
              ))}
              {!orderedAgentTools.length ? <p className="dashboard-gis-message">No automation manifest is available from the API yet.</p> : null}
            </div>
          </details>
          <div className="dashboard-gis-actions">
            <button type="button" onClick={() => void exportDesignBlueprint()} disabled={Boolean(busy)}>Export current blueprint</button>
            <button type="button" onClick={() => void exportRebuildPackage()} disabled={Boolean(busy)}>Export rebuild package</button>
            <label className="dashboard-design-inline-select"><span>Import mode</span><select value={blueprintImportMode} onChange={(event) => setBlueprintImportMode(event.currentTarget.value as "upsert" | "skip_existing")}>
              <option value="upsert">Upsert existing</option>
              <option value="skip_existing">Skip existing</option>
            </select></label>
            <button type="button" onClick={() => void importDesignBlueprint()} disabled={Boolean(busy) || !blueprintText.trim()}>Import pasted blueprint/package</button>
            <button type="button" onClick={() => void importRebuildPackageAndReplay()} disabled={Boolean(busy) || !blueprintText.trim()}>Import package + replay snapshots</button>
          </div>
          <details className="dashboard-design-advanced">
            <summary>Advanced blueprint import/export backup</summary>
            <label><span>Blueprint or rebuild package backup</span><textarea value={blueprintText} onChange={(event) => setBlueprintText(event.currentTarget.value)} placeholder="Paste an exported Design Mode blueprint or rebuild package here, or click Export rebuild package." /></label>
          </details>
        </div>
      ) : mode === "type" ? (
        <div className="dashboard-design-form">
          <div className="dashboard-design-template-grid" aria-label="Object type templates">
            <button type="button" onClick={() => applyAssetTemplate("database-object")}>
              <strong>Blank database object</strong>
              <span>Any table-only data: inspections, permits, vendors, notes, or custom records.</span>
            </button>
            <button type="button" onClick={() => applyAssetTemplate("map-point")}>
              <strong>Map point object</strong>
              <span>Clickable map objects such as equipment, incidents, sites, or planning markers.</span>
            </button>
            <button type="button" onClick={() => applyAssetTemplate("fiber-span")}>
              <strong>Line or route object</strong>
              <span>Fiber spans, cable sections, make-ready routes, corridors, or service paths.</span>
            </button>
          </div>
          <label><span>Object type slug</span><input value={assetSlug} onChange={(event) => setAssetSlug(event.currentTarget.value)} placeholder="custom-planning-object" /></label>
          <label><span>Display name</span><input value={assetDisplayName} onChange={(event) => updateAssetDisplayName(event.currentTarget.value)} placeholder="Custom planning object" /></label>
          <label><span>Description</span><textarea value={assetDescription} onChange={(event) => setAssetDescription(event.currentTarget.value)} /></label>
          <label><span>Storage / geometry</span><select value={assetGeometryType} onChange={(event) => setAssetGeometryType(event.currentTarget.value as DesignAssetGeometryType)}>
            {designGeometryTypeOptions.map((item) => <option key={item} value={item}>{item === "table_only" ? "Database only, no map geometry" : item}</option>)}
          </select></label>
          <div className="dashboard-design-field-builder">
            <div className="dashboard-design-row-title">
              <strong>Object fields</strong>
              <span>Build the form users will fill out when adding objects to the database.</span>
            </div>
            {assetFieldDrafts.map((field, index) => (
              <div className="dashboard-design-field-row" key={`${field.name}-${index}`}>
                <div className="dashboard-design-field-row-header">
                  <strong>{field.label || `Field ${index + 1}`}</strong>
                  <button type="button" onClick={() => removeAssetField(index)} disabled={assetFieldDrafts.length <= 1}>Remove</button>
                </div>
                <div className="dashboard-design-field-grid">
                  <label><span>Label</span><input value={field.label || ""} onChange={(event) => {
                    const label = event.currentTarget.value;
                    updateAssetField(index, { label, name: field.name || fieldNameFromLabel(label) });
                  }} /></label>
                  <label><span>Field name</span><input value={field.name || ""} onChange={(event) => updateAssetField(index, { name: fieldNameFromLabel(event.currentTarget.value) })} /></label>
                  <label><span>Type</span><select value={field.type} onChange={(event) => updateAssetFieldType(index, event.currentTarget.value as DesignAssetFieldType)}>
                    {designFieldTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select></label>
                  <label><span>Required</span><select value={field.required ? "true" : "false"} onChange={(event) => updateAssetField(index, { required: event.currentTarget.value === "true" })}>
                    <option value="false">Optional</option>
                    <option value="true">Required</option>
                  </select></label>
                  <label><span>Default</span><input value={designFieldDefaultText(field)} onChange={(event) => updateAssetField(index, { default: designFieldDefaultFromText(field.type, event.currentTarget.value) })} /></label>
                  <label><span>Help text</span><input value={field.help_text || ""} onChange={(event) => updateAssetField(index, { help_text: event.currentTarget.value })} /></label>
                  {field.type === "enum" ? <label className="dashboard-design-field-wide"><span>Enum options</span><input value={(field.enum_options || []).join(", ")} onChange={(event) => updateAssetField(index, { enum_options: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label> : null}
                </div>
              </div>
            ))}
            <button className="dashboard-design-add-field" type="button" onClick={addAssetField}>Add field</button>
          </div>
          <details className="dashboard-design-advanced">
            <summary>Advanced schema backup</summary>
            <label><span>Field definition backup</span><textarea value={assetFieldsText} onChange={(event) => setAssetFieldsText(event.currentTarget.value)} /></label>
            <div className="dashboard-gis-actions">
              <button type="button" onClick={syncFieldBuilderFromJson}>Load backup into builder</button>
            </div>
            <label><span>Map style backup</span><textarea value={assetStyleText} onChange={(event) => setAssetStyleText(event.currentTarget.value)} /></label>
          </details>
          <button className="telecom-map-button full-width" type="button" onClick={() => void createAssetType()} disabled={Boolean(busy)}>Create object type</button>
        </div>
      ) : (
        <div className="dashboard-design-form">
          <label><span>Object type</span><select value={activeType?.slug || ""} onChange={(event) => onSelectedTypeSlugChange(event.currentTarget.value)}>
            {assetTypes.map((assetType) => <option key={assetType.slug} value={assetType.slug}>{assetType.display_name}</option>)}
          </select></label>
          {activeType?.geometry_type === "table_only" ? <p className="dashboard-gis-message">This object type is stored in the database without map geometry. Use it for any synthetic/demo data that should live in the tool but not draw on the map.</p> : null}
          <div className="dashboard-gis-actions">
            <button type="button" onClick={onNewRecord}>New object</button>
            {activeType?.geometry_type !== "table_only" ? <button type="button" onClick={() => activeType ? onBeginDrawing(activeType.geometry_type) : setLocalMessage("Select an object type first.")}>{selectedRecord ? "Redraw geometry" : `Draw ${activeType?.geometry_type || "geometry"}`}</button> : null}
            {drawingForActiveType ? <button type="button" onClick={onFinishDrawing}>Finish drawing</button> : null}
            {pendingGeometry || drawingForActiveType ? <button type="button" onClick={onCancelDraft}>Cancel unsaved geometry</button> : null}
            <button type="button" onClick={() => void onRefresh()} disabled={Boolean(busy)}>Refresh</button>
          </div>
          {drawingForActiveType ? (
            <div className="dashboard-design-drawing-status">
              <strong>{activeType?.geometry_type === "polygon" ? "Polygon drawing" : activeType?.geometry_type === "line" ? "Line drawing" : "Point placement"}</strong>
              <span>{activeType?.geometry_type === "point" ? "Click the map to place or move the point." : `${drawingVertexCount} vertex${drawingVertexCount === 1 ? "" : "es"} staged. ${activeType?.geometry_type === "polygon" ? "Three vertices are required before save." : "Two vertices are required before save."}`}</span>
            </div>
          ) : null}
          {pendingGeometryMatches ? <p className="dashboard-gis-message">Unsaved geometry is staged on the map. Save the record to persist it, or cancel to discard it.</p> : null}
          <div className="dashboard-design-record-list">
            {records.slice(0, 8).map((record) => (
              <button type="button" key={record.id} className={selectedRecord?.id === record.id ? "active" : ""} onClick={() => onSelectRecord(record)}>
                <strong>{record.display_label}</strong>
                <span>{record.asset_type_display_name || record.asset_type_slug} / {record.status}{designRecordWorkOrderNumber(record) ? ` / ${designRecordWorkOrderNumber(record)}` : ""}</span>
              </button>
            ))}
          </div>
          {selectedRecord ? (
            <div className="dashboard-source-boundary">
              <p>
                Living database record: {selectedRecord.record_key}
                {selectedWorkOrderNumber ? <> / latest work order {selectedWorkOrderId ? <Link href={`/work-orders/${selectedWorkOrderId}`}>{selectedWorkOrderNumber}</Link> : selectedWorkOrderNumber}</> : " / no work order issued yet"}
              </p>
            </div>
          ) : null}
          <label><span>Record key</span><input value={recordKey} onChange={(event) => setRecordKey(event.currentTarget.value)} /></label>
          <label><span>Display label</span><input value={displayLabel} onChange={(event) => setDisplayLabel(event.currentTarget.value)} /></label>
          <label><span>Status</span><select value={recordStatus} onChange={(event) => setRecordStatus(event.currentTarget.value as DesignAssetRecord["status"])}>
            {["proposed", "planned", "in_review", "active", "as_built", "archived"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <div className="dashboard-design-fields">
            {fields.map((field) => <DesignFieldInput key={field.name} field={field} value={propertiesDraft[field.name] || ""} onChange={(value) => updateProperty(field.name, value)} />)}
          </div>
          {activeType?.geometry_type !== "table_only" ? (
            <details className="dashboard-design-advanced">
              <summary>Advanced geometry backup</summary>
              <label><span>Geometry backup</span><textarea value={geometryText} onChange={(event) => setGeometryText(event.currentTarget.value)} /></label>
            </details>
          ) : null}
          <label><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></label>
          <div className="dashboard-gis-actions">
            <button className="telecom-map-button" type="button" onClick={() => void saveRecord()} disabled={Boolean(busy) || !activeType}>Save object</button>
            {selectedRecord ? <button className="telecom-map-button" type="button" onClick={() => void issueWorkOrderFromSelectedRecord()} disabled={Boolean(busy)}>Issue work order</button> : null}
            {selectedRecord ? <button type="button" onClick={() => void materializeSelectedRecord("upsert")} disabled={Boolean(busy)}>Materialize selected to backend</button> : null}
            {activeType ? <button type="button" onClick={() => void materializeActiveType("upsert")} disabled={Boolean(busy)}>Materialize object type</button> : null}
            {selectedRecord ? <button type="button" onClick={() => void archiveRecord()} disabled={Boolean(busy)}>Archive</button> : null}
          </div>
        </div>
      )}
      {message || localMessage ? <p className="dashboard-gis-message">{busy ? `${busy}... ` : ""}{localMessage || message}</p> : null}
    </section>
  );
}

function designRecordWorkOrderNumber(record: DesignAssetRecord): string {
  const value = (record.properties || record.properties_json || {}).latest_work_order_number;
  return typeof value === "string" ? value : "";
}

function designRecordWorkOrderId(record: DesignAssetRecord): number | null {
  const value = (record.properties || record.properties_json || {}).latest_work_order_id;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function DesignFieldInput({ field, value, onChange }: { field: DesignAssetField; value: string; onChange: (value: string) => void }) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "textarea" || field.type === "json") {
    return <label><span>{field.type === "json" ? `${label} list` : label}</span><textarea value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={field.help_text || (field.type === "json" ? "Enter one item per line or separate items with commas." : "")} /></label>;
  }
  if (field.type === "enum") {
    return (
      <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Select...</option>
        {(field.enum_options || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select></label>
    );
  }
  if (field.type === "boolean") {
    return (
      <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Select...</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select></label>
    );
  }
  return <label><span>{label}</span><input type={field.type === "number" || field.type === "integer" ? "number" : field.type === "date" ? "date" : "text"} value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={field.help_text || ""} /></label>;
}

function defaultObjectTypeFields(): DesignAssetField[] {
  return [
    { name: "name", label: "Object name", type: "string", required: true, help_text: "Human-readable object name." },
    { name: "category", label: "Category", type: "string", required: false, help_text: "Optional grouping, owner, system, or object class." },
    { name: "status", label: "Status", type: "enum", required: true, default: "proposed", enum_options: ["proposed", "planned", "active", "as_built", "archived"] },
    { name: "metadata", label: "Extra attributes", type: "json", required: false, help_text: "Optional lines or comma-separated values for custom attributes." },
  ];
}

function defaultMapPointFields(): DesignAssetField[] {
  return [
    { name: "name", label: "Object name", type: "string", required: true },
    { name: "object_type", label: "Object category", type: "string", required: false },
    { name: "status", label: "Status", type: "enum", required: true, default: "proposed", enum_options: ["proposed", "planned", "active", "as_built"] },
    { name: "notes", label: "Planning notes", type: "textarea", required: false },
  ];
}

function defaultFiberSpanFields(): DesignAssetField[] {
  return [
    { name: "cable_id", label: "Cable ID", type: "string", required: true },
    { name: "fiber_count", label: "Fiber count", type: "integer", required: false, default: 48, validation_rules: { min: 1, max: 864 } },
    { name: "status", label: "Status", type: "enum", required: true, default: "planned", enum_options: ["proposed", "planned", "in_review", "active", "as_built"] },
    { name: "services_carried", label: "Services carried", type: "textarea", required: false },
    { name: "notes", label: "Planning notes", type: "textarea", required: false },
  ];
}

function blankDesignField(index: number): DesignAssetField {
  return { name: `field_${index}`, label: `Field ${index}`, type: "string", required: false };
}

function defaultDesignAssetFieldsText() {
  return JSON.stringify(defaultObjectTypeFields(), null, 2);
}

function slugFromLabel(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug && /^[a-z]/.test(slug) ? slug.slice(0, 80) : slug ? `x-${slug}`.slice(0, 80) : "";
}

function fieldNameFromLabel(value: string) {
  const name = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!name) return "";
  return /^[a-z_]/.test(name) ? name.slice(0, 80) : `field_${name}`.slice(0, 80);
}

function designFieldDefaultText(field: DesignAssetField) {
  if (field.default === undefined || field.default === null) return "";
  if (field.type === "json") return typeof field.default === "string" ? field.default : JSON.stringify(field.default, null, 2);
  if (field.type === "boolean") return field.default === true ? "true" : field.default === false ? "false" : "";
  return String(field.default);
}

function designFieldDefaultFromText(type: DesignAssetFieldType, value: string) {
  if (value === "") return undefined;
  if (type === "integer") return Number.parseInt(value, 10);
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true";
  if (type === "json") return parseDesignStructuredValue(value);
  return value;
}

function defaultPropertiesForFields(fields: DesignAssetField[]) {
  return Object.fromEntries(fields.map((field) => [field.name, field.default === undefined || field.default === null ? "" : stringifyFieldDraftValue(field.default, field)]));
}

function propertiesToFieldDraft(fields: DesignAssetField[], properties: Record<string, unknown>) {
  return Object.fromEntries(fields.map((field) => [field.name, stringifyFieldDraftValue(properties[field.name] ?? field.default ?? "", field)]));
}

function stringifyFieldDraftValue(value: unknown, field: DesignAssetField) {
  if (value === undefined || value === null) return "";
  if (field.type === "json") {
    if (Array.isArray(value)) return value.map((item) => String(item)).join("\n");
    if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${String(item)}`).join("\n");
    return String(value);
  }
  if (field.type === "boolean") return value === true ? "true" : value === false ? "false" : "";
  return String(value);
}

function fieldDraftToProperties(fields: DesignAssetField[], draft: Record<string, string>) {
  const properties: Record<string, unknown> = {};
  fields.forEach((field) => {
    const value = draft[field.name];
    if (value === undefined || value === "") {
      if (field.required) properties[field.name] = value || "";
      return;
    }
    if (field.type === "integer") {
      properties[field.name] = Number.parseInt(value, 10);
      return;
    }
    if (field.type === "number") {
      properties[field.name] = Number(value);
      return;
    }
    if (field.type === "boolean") {
      properties[field.name] = value === "true";
      return;
    }
    if (field.type === "json") {
      properties[field.name] = parseDesignStructuredValue(value);
      return;
    }
    properties[field.name] = value;
  });
  return properties;
}

function parseDesignStructuredValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  const lines = trimmed.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  if (trimmed.includes(",")) return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  if (trimmed.includes(":")) {
    const entries = lines.map((line) => line.split(":").map((item) => item.trim()));
    if (entries.every((entry) => entry.length >= 2 && entry[0])) {
      return Object.fromEntries(entries.map(([key, ...rest]) => [key, rest.join(":")]));
    }
  }
  return [trimmed];
}

function defaultGeometryTextForType(geometryType: DesignAssetGeometryType, pendingGeometry: DesignAssetGeoJsonGeometry | null) {
  if (pendingGeometry && geometryTypeMatchesDesignGeometry(geometryType, pendingGeometry)) return JSON.stringify(pendingGeometry, null, 2);
  if (geometryType === "line") return JSON.stringify({ type: "LineString", coordinates: [[-72.05, 42.15], [-71.82, 42.28]] }, null, 2);
  if (geometryType === "polygon") return JSON.stringify({ type: "Polygon", coordinates: [[[-72.1, 42.1], [-71.95, 42.1], [-71.95, 42.22], [-72.1, 42.22], [-72.1, 42.1]]] }, null, 2);
  if (geometryType === "point") return JSON.stringify({ type: "Point", coordinates: [-71.82, 42.28] }, null, 2);
  return "";
}

function isDesignRebuildPackage(value: DesignAssetBlueprint | DesignRebuildPackage): value is DesignRebuildPackage {
  return Boolean((value as DesignRebuildPackage).package_version && (value as DesignRebuildPackage).blueprint);
}

function designToolForGeometryType(geometryType: Exclude<DesignAssetGeometryType, "table_only">): MapDrawingTool {
  if (geometryType === "line") return "draw_design_line";
  if (geometryType === "polygon") return "draw_design_polygon";
  return "draw_design_point";
}

function isDesignDrawingTool(tool: MapDrawingTool) {
  return tool === "draw_design_point" || tool === "draw_design_line" || tool === "draw_design_polygon";
}

function closedCoordinateRing(coordinates: Coordinate[]) {
  if (!coordinates.length) return coordinates;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coordinates;
  return [...coordinates, first];
}

function geometryTypeMatchesDesignGeometry(geometryType: DesignAssetGeometryType, geometry: DesignAssetGeoJsonGeometry) {
  if (geometryType === "point") return geometry.type === "Point";
  if (geometryType === "line") return geometry.type === "LineString" || geometry.type === "MultiLineString";
  if (geometryType === "polygon") return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
  return geometryType === "table_only";
}

async function fetchGeoJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return await response.json() as T;
}

function buildOpgwPlanningMetrics(opgw: OpgwCableFeature[], strands: FiberStrand[], assignments: FiberAssignment[], cableSections: OpgwCableSectionFeature[], spanSegments: OpgwSpanSegmentFeature[], splicePoints: OpgwSplicePointFeature[]) {
  const strandStats = dashboardStrandStats(opgw, strands);
  const assignmentStats = dashboardAssignmentStats(assignments);
  let syntheticRouteMiles = 0;
  let plannedRouteMiles = 0;
  let verifiedRouteMiles = 0;
  let assumedRouteCount = 0;
  let plannedRouteCount = 0;
  let verifiedRouteCount = 0;
  let outageImpactCount = 0;
  let highestRiskRouteSegment = "None flagged";
  let highestRiskScore = -1;

  opgw.forEach((feature) => {
    const status = dashboardOpgwStatus(feature);
    const routeMiles = feature.properties.routeMiles || 0;
    const stats = strandStats.get(feature.properties.id) || dashboardFallbackStrandStats(feature.properties.fiberCount);
    const assignment = assignmentStats.get(feature.properties.id) || { critical: 0, openWorkOrders: 0 };
    syntheticRouteMiles += routeMiles;
    if (status === "synthetic_assumption" || status === "engineer_reviewed") assumedRouteCount += 1;
    if (status === "planned" || status === "design" || status === "work_order_issued") {
      plannedRouteCount += 1;
      plannedRouteMiles += routeMiles;
    }
    if (status === "as_built_verified") {
      verifiedRouteCount += 1;
      verifiedRouteMiles += routeMiles;
    }
    const lowCapacity = stats.available <= Math.max(2, Math.floor((feature.properties.fiberCount || 0) * 0.12));
    const lowConfidence = dashboardOpgwConfidence(feature) === "low";
    if (assignment.critical > 0 && (lowCapacity || lowConfidence)) {
      outageImpactCount += 1;
      const riskScore = assignment.critical * 100 + (lowCapacity ? 30 : 0) + (lowConfidence ? 20 : 0) - stats.available;
      if (riskScore > highestRiskScore) {
        highestRiskScore = riskScore;
        highestRiskRouteSegment = `${feature.properties.cableName} / ${assignment.critical} critical / ${stats.available} available strands`;
      }
    }
  });

  const totalStrands = strands.length || opgw.reduce((sum, feature) => sum + feature.properties.fiberCount, 0);
  const availableStrands = strands.length
    ? strands.filter((strand) => strand.status === "available" || strand.status === "spare" || strand.status === "dark").length
    : opgw.reduce((sum, feature) => sum + feature.properties.fiberCount, 0);
  const assignedStrands = strands.length
    ? strands.filter((strand) => strand.status === "assigned" || strand.status === "reserved").length
    : assignments.reduce((sum, assignment) => sum + assignment.strandSegments.reduce((inner, segment) => inner + segment.strandNumbers.length, 0), 0);
  const criticalRidingCircuits = assignments.filter(isDashboardCriticalAssignment).length;
  const openWorkOrders = assignments.filter((assignment) => assignment.status === "planned" || assignment.status === "proposed" || assignment.status === "reserved").length;
  const spanInspectionIssues = spanSegments.filter((span) => span.properties.hasMidspanIssue || span.properties.inspectionStatus === "inspection_due").length;
  const spansWithOpenWorkOrders = spanSegments.filter((span) => span.properties.openWorkOrderCount > 0).length;
  const highRiskSpans = spanSegments.filter((span) => span.properties.outageRiskScore >= 70).length;
  const highestRiskSpan = spanSegments.reduce<OpgwSpanSegmentFeature | null>((highest, span) => {
    if (!highest || span.properties.outageRiskScore > highest.properties.outageRiskScore) return span;
    return highest;
  }, null);
  const highestUtilizationSection = cableSections.reduce<OpgwCableSectionFeature | null>((highest, section) => {
    if (!highest) return section;
    const used = section.properties.assignedStrands + section.properties.reservedStrands;
    const highestUsed = highest.properties.assignedStrands + highest.properties.reservedStrands;
    return used > highestUsed ? section : highest;
  }, null);
  const lowSpareSections = cableSections.filter((section) => section.properties.availableStrands < 12).length;
  const damagedOrOutOfServiceStrands = strands.filter((strand) => strand.status === "faulted" || strand.status === "retired").length;

  return {
    syntheticRouteMiles,
    plannedRouteMiles,
    verifiedRouteMiles,
    totalRoutes: opgw.length,
    totalCableSections: cableSections.length,
    totalSpanSegments: spanSegments.length,
    totalSplicePoints: splicePoints.length,
    totalStrands,
    availableStrands,
    assignedStrands,
    reservedStrands: strands.filter((strand) => strand.status === "reserved").length,
    damagedOrOutOfServiceStrands,
    criticalRidingCircuits,
    openAssumptions: assumedRouteCount,
    openWorkOrders,
    highestRiskRouteSegment,
    assumedRouteCount,
    plannedRouteCount,
    verifiedRouteCount,
    outageImpactCount,
    spanInspectionIssues,
    spansWithOpenWorkOrders,
    highRiskSpans,
    highestRiskSpan: highestRiskSpan ? `${highestRiskSpan.properties.fromStructureNumber} to ${highestRiskSpan.properties.toStructureNumber} / ${highestRiskSpan.properties.outageRiskScore}` : "None",
    highestRiskCableSection: highestRiskSpan?.properties.cableSectionId || "None",
    averageSpanRiskScore: spanSegments.length ? spanSegments.reduce((sum, span) => sum + span.properties.outageRiskScore, 0) / spanSegments.length : 0,
    lowSpareSections,
    highestUtilizationSection: highestUtilizationSection?.properties.cableSectionId || "None",
  };
}

type DashboardOpgwStatus =
  | "synthetic_assumption"
  | "engineer_reviewed"
  | "planned"
  | "design"
  | "work_order_issued"
  | "in_service_synthetic"
  | "as_built_verified"
  | "retired";

function dashboardOpgwStatus(feature: OpgwCableFeature): DashboardOpgwStatus {
  if (feature.properties.status === "planned") return "planned";
  if (feature.properties.status === "proposed") return "design";
  return "synthetic_assumption";
}

function dashboardOpgwConfidence(feature: OpgwCableFeature) {
  if (feature.properties.status === "planned") return "high";
  if (feature.properties.status === "proposed") return "medium";
  return Number(feature.properties.id.replace(/\D/g, "").slice(-4) || 0) % 5 === 0 ? "medium" : "low";
}

function dashboardStrandStats(opgw: OpgwCableFeature[], strands: FiberStrand[]) {
  const stats = new Map<string, { available: number }>();
  opgw.forEach((feature) => stats.set(feature.properties.id, dashboardFallbackStrandStats(feature.properties.fiberCount)));
  if (!strands.length) return stats;
  stats.clear();
  strands.forEach((strand) => {
    const current = stats.get(strand.cableId) || { available: 0 };
    if (strand.status === "available" || strand.status === "spare" || strand.status === "dark") current.available += 1;
    stats.set(strand.cableId, current);
  });
  return stats;
}

function dashboardFallbackStrandStats(fiberCount: number) {
  return { available: fiberCount };
}

function dashboardAssignmentStats(assignments: FiberAssignment[]) {
  const stats = new Map<string, { critical: number; openWorkOrders: number }>();
  assignments.forEach((assignment) => {
    assignment.cableIds.forEach((cableId) => {
      const current = stats.get(cableId) || { critical: 0, openWorkOrders: 0 };
      if (isDashboardCriticalAssignment(assignment)) current.critical += 1;
      if (assignment.status === "planned" || assignment.status === "proposed" || assignment.status === "reserved") current.openWorkOrders += 1;
      stats.set(cableId, current);
    });
  });
  return stats;
}

function isDashboardCriticalAssignment(assignment: FiberAssignment) {
  return assignment.serviceType === "SEL_ICON"
    || assignment.serviceType === "C37_94"
    || assignment.serviceType === "Protection"
    || assignment.serviceType === "DTT"
    || assignment.serviceType === "SCADA";
}

function formatMiles(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`;
}

function formatCompactCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  if (value >= 1000) return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString();
}

function layersForModule(href: string, layerSummaries: DashboardLayerSummary[]) {
  const layerByKey = new Map(layerSummaries.map((layer) => [layer.key, layer]));
  return (moduleLayerCoverage[href] || []).map((key) => layerByKey.get(key)).filter((layer): layer is DashboardLayerSummary => Boolean(layer));
}

function buildDashboardLayerSummaries({
  layers,
  publicLineCount,
  visiblePublicLineCount,
  publicSubstationCount,
  visiblePublicSubstationCount,
  fccTowerCount,
  visibleFccTowerCount,
  fccLinkCount,
  visibleFccLinkCount,
  syntheticSubstationCount,
  structureCount,
  visibleStructureCount,
  opgwCableCount,
  opgwRouteCount,
  assumedOpgwRouteCount,
  plannedOpgwRouteCount,
  verifiedOpgwRouteCount,
  opgwCableSectionCount,
  opgwSpanSegmentCount,
  opgwSplicePointCount,
  spliceClosureCount,
  visibleSpliceClosureCount,
  patchPanelCount,
  distributionPoleDensityCount,
  distributionPoleCount,
  distributionPoleFiberRouteCount,
  distributionSplicePointCount,
  distributionSlackLoopCount,
  distributionFiberAssignmentCount,
  estimatedDistributionPoleScale,
  fiberStrandCount,
  availableStrandCount,
  fiberAssignmentCount,
  strandContinuityCount,
  criticalRidingCircuitCount,
  outageImpactCount,
  openOpgwWorkOrderCount,
  spanInspectionIssueCount,
  nodeCount,
  transmissionLineCount,
  workOrderLocationCount,
  designAssetRecordCount,
}: {
  layers: Record<StreetMapLayerKey, boolean>;
  publicLineCount: number;
  visiblePublicLineCount: number;
  publicSubstationCount: number;
  visiblePublicSubstationCount: number;
  fccTowerCount: number;
  visibleFccTowerCount: number;
  fccLinkCount: number;
  visibleFccLinkCount: number;
  syntheticSubstationCount: number;
  structureCount: number;
  visibleStructureCount: number;
  opgwCableCount: number;
  opgwRouteCount: number;
  assumedOpgwRouteCount: number;
  plannedOpgwRouteCount: number;
  verifiedOpgwRouteCount: number;
  opgwCableSectionCount: number;
  opgwSpanSegmentCount: number;
  opgwSplicePointCount: number;
  spliceClosureCount: number;
  visibleSpliceClosureCount: number;
  patchPanelCount: number;
  distributionPoleDensityCount: number;
  distributionPoleCount: number;
  distributionPoleFiberRouteCount: number;
  distributionSplicePointCount: number;
  distributionSlackLoopCount: number;
  distributionFiberAssignmentCount: number;
  estimatedDistributionPoleScale: number;
  fiberStrandCount: number;
  availableStrandCount: number;
  fiberAssignmentCount: number;
  strandContinuityCount: number;
  criticalRidingCircuitCount: number;
  outageImpactCount: number;
  openOpgwWorkOrderCount: number;
  spanInspectionIssueCount: number;
  nodeCount: number;
  transmissionLineCount: number;
  workOrderLocationCount: number;
  designAssetRecordCount: number;
}): DashboardLayerSummary[] {
  const layer = (
    key: StreetMapLayerKey,
    label: string,
    category: DashboardLayerSummary["category"],
    total: number,
    visible: number,
    moduleHref: string,
    source: string,
    safety: string,
  ): DashboardLayerSummary => ({
    key,
    label,
    category,
    source,
    total,
    visible: layers[key] ? visible : 0,
    enabled: Boolean(layers[key]),
    moduleHref,
    safety,
  });
  const distributionNetworkEnabled = distributionNetworkLayerKeys.some((key) => layers[key]);
  const distributionNetworkTotal = estimatedDistributionPoleScale
    + distributionPoleFiberRouteCount
    + distributionSplicePointCount
    + distributionSlackLoopCount
    + distributionFiberAssignmentCount;
  const distributionNetworkVisible = distributionNetworkEnabled
    ? distributionNetworkTotal
    : 0;

  return [
    layer("publicTransmissionLines", "HIFLD transmission lines", "Public reference", publicLineCount, visiblePublicLineCount, "/transmission-lines", "HIFLD public transmission-line references with open owner buckets", "Read-only public reference; not evidence of private telecom or OPGW."),
    layer("publicSubstations", "Verified-owner substations", "Public reference", publicSubstationCount, visiblePublicSubstationCount, "/substations", "Open public substation references with verified utility-owner fields or open-source matches", "Public reference only; unknown-owner nodes are excluded from this layer."),
    layer("fccUtilityTowers", "FCC utility tower nodes", "Public reference", fccTowerCount, visibleFccTowerCount, "/data-sources", "FCC ULS public utility license/site records", "Public FCC license reference only; not operational telecom routing."),
    layer("fccMicrowaveLinks", "FCC microwave paths", "Public reference", fccLinkCount, visibleFccLinkCount, "/data-sources", "FCC ULS public microwave path records grouped by owner and frequency", "Public FCC license reference only; do not infer active utility operations."),
    layer("syntheticSubstations", "Synthetic substations", "Planning assets", syntheticSubstationCount, syntheticSubstationCount, "/regional-grid", "Synthetic/demo planning nodes", "Synthetic/demo records only."),
    layer("transmissionStructures", "Transmission structures", "Synthetic OPGW Fiber", structureCount, visibleStructureCount, "/transmission-structures", "Synthetic structure points sampled from public line geometry", "Synthetic structure locations only; not real tower/pole locations."),
    layer("syntheticOpgwCables", "Synthetic OPGW cables", "Synthetic OPGW Fiber", opgwCableCount, opgwCableCount, "/opgw-cables", "Generated synthetic OPGW cable records", "Synthetic/demo planning only; not active fiber."),
    layer("assumedOpgwRoutes", "Assumed OPGW routes", "Synthetic OPGW Fiber", assumedOpgwRouteCount, assumedOpgwRouteCount, "/opgw", "Generated synthetic assumptions on public corridors", "Synthetic planning assumption only; requires engineer/as-built verification."),
    layer("plannedOpgwFiber", "Planned OPGW fiber", "Synthetic OPGW Fiber", plannedOpgwRouteCount, plannedOpgwRouteCount, "/opgw", "Synthetic planned OPGW records", "Planning/demo layer; conversion workflow required before as-built status."),
    layer("verifiedOpgwFiber", "Verified OPGW fiber", "Synthetic OPGW Fiber", verifiedOpgwRouteCount, verifiedOpgwRouteCount, "/opgw", "Demo records explicitly marked as verified", "Verification is demo metadata unless imported from approved records."),
    layer("opgwRoutes", "OPGW route records", "Synthetic OPGW Fiber", opgwRouteCount, opgwRouteCount, "/opgw", "Route model built from synthetic cables, structures, and splice points", "Demo route model only."),
    layer("opgwCableSections", "OPGW cable sections", "Synthetic OPGW Fiber", opgwCableSectionCount, opgwCableSectionCount, "/opgw-cables", "Synthetic splice-to-splice cable section model", "Synthetic cable section records only."),
    layer("opgwSpanSegments", "OPGW span segments", "Synthetic OPGW Fiber", opgwSpanSegmentCount, opgwSpanSegmentCount, "/transmission-structures", "Synthetic structure-to-structure OPGW spans", "Synthetic spans for planning and outage demos."),
    layer("opgwSplicePoints", "OPGW splice points", "Synthetic OPGW Fiber", opgwSplicePointCount, opgwSplicePointCount, "/splice-points", "Synthetic splice, tap, transition, and termination points", "Synthetic splice point records only."),
    layer("existingFiberSplices", "Existing fiber splices", "Synthetic OPGW Fiber", opgwSplicePointCount, opgwSplicePointCount, "/splice-matrix", "Synthetic existing splice continuity rows", "Read-only demo splice records."),
    layer("proposedFiberSplices", "Proposed fiber splices", "Synthetic OPGW Fiber", opgwSplicePointCount, opgwSplicePointCount, "/splice-matrix", "Editable proposed splice layer for planning", "Proposed/demo changes only."),
    layer("compareSpliceLayers", "Splice compare", "Analysis overlays", opgwSplicePointCount, opgwSplicePointCount, "/splice-matrix", "Existing-versus-proposed synthetic splice comparison", "Demo comparison layer only."),
    layer("spliceClosures", "Splice closures", "Synthetic OPGW Fiber", spliceClosureCount, visibleSpliceClosureCount, "/splice-closures", "Synthetic closures mounted on synthetic structure points", "Synthetic/demo splice closure records only."),
    layer("patchPanels", "Patch panels", "Synthetic OPGW Fiber", patchPanelCount, patchPanelCount, "/patch-panels", "Synthetic termination panels at demo structures and nodes", "Synthetic/demo patch panel records only."),
    {
      key: "distributionFiberRoutes",
      label: "Distribution Network",
      category: "Planning assets",
      source: `One combined module layer: ${formatCompactCount(estimatedDistributionPoleScale)} represented poles, ${distributionPoleDensityCount.toLocaleString()} density cells, ${distributionPoleCount.toLocaleString()} rendered pole samples, ${distributionPoleFiberRouteCount.toLocaleString()} routes, ${distributionSplicePointCount.toLocaleString()} splice points, ${distributionSlackLoopCount.toLocaleString()} slack loops, and ${distributionFiberAssignmentCount.toLocaleString()} assignments.`,
      total: distributionNetworkTotal,
      visible: distributionNetworkVisible,
      enabled: distributionNetworkEnabled,
      moduleHref: "/distribution-fiber",
      safety: "Synthetic distribution planning records only; not real pole, splice, fiber, or service inventory.",
    },
    layer("fiberStrandsLayer", "Fiber strands", "Synthetic OPGW Fiber", fiberStrandCount, fiberStrandCount, "/fiber-strand-table", "Synthetic strand records generated from OPGW fiber counts", "Synthetic/demo strand inventory only."),
    layer("availableStrandCapacity", "Available strand capacity", "Analysis overlays", availableStrandCount, availableStrandCount, "/fiber-strand-table", "Capacity overlay calculated from synthetic strand statuses", "Capacity is demo planning data only."),
    layer("fiberAssignments", "Fiber assignments", "Planning assets", fiberAssignmentCount, fiberAssignmentCount, "/fiber-assignments", "Synthetic service-to-strand assignment model", "Synthetic/demo assignments only."),
    layer("strandContinuity", "Strand Continuity", "Analysis overlays", strandContinuityCount, strandContinuityCount, "/strand-continuity", "Synthetic end-to-end strand paths from patch panels through splices to terminated devices", "Synthetic/demo continuity records only."),
    layer("criticalRidingCircuits", "Critical riding circuits", "Analysis overlays", criticalRidingCircuitCount, criticalRidingCircuitCount, "/outage-impact", "Synthetic critical service assignments riding OPGW paths", "Fictional circuits only; not operational routing."),
    layer("opgwOutageImpact", "Outage impact", "Analysis overlays", outageImpactCount, outageImpactCount, "/outage-impact", "Synthetic outage-risk overlay from route capacity and assignment flags", "Demo impact analysis only."),
    layer("opgwOpenWorkOrders", "Open OPGW work orders", "Planning assets", openOpgwWorkOrderCount, openOpgwWorkOrderCount, "/work-orders", "Synthetic OPGW work-order indicators", "Demo work orders only."),
    layer("opgwSpanInspectionIssues", "Span inspection issues", "Analysis overlays", spanInspectionIssueCount, spanInspectionIssueCount, "/outage-impact", "Synthetic inspection and midspan issue highlights", "Demo inspection flags only."),
    layer("telecomNodes", "Telecom nodes", "Planning assets", nodeCount, nodeCount, "/devices", "Local synthetic telecom/device nodes", "Synthetic/demo device planning data."),
    layer("selIconNodes", "SEL ICON nodes", "Planning assets", nodeCount, nodeCount, "/deviceops/icon", "Local synthetic SEL ICON node layer", "Synthetic/demo ICON planning data."),
    layer("c3794Nodes", "C37.94 endpoints", "Planning assets", nodeCount, nodeCount, "/circuits", "Local synthetic protection endpoint layer", "Fictional relay/protection endpoint data."),
    layer("transmissionLines", "Editable transmission lines", "Planning assets", transmissionLineCount, transmissionLineCount, "/transmission-lines", "Local planning line records", "Demo planning records only."),
    layer("workOrderLocations", "Work order locations", "Planning assets", workOrderLocationCount, workOrderLocationCount, "/work-orders", "Synthetic work-order markers", "Demo work orders only."),
    layer("proposedChanges", "Proposed changes", "Planning assets", workOrderLocationCount, workOrderLocationCount, "/deviceops/change-requests", "Synthetic proposed planning changes", "Proposed/demo records only."),
    layer("designAssets", "Design-mode planning assets", "Planning assets", designAssetRecordCount, designAssetRecordCount, "/dashboard?drawer=layers", "Schema-backed design records", "Synthetic/demo records only; do not enter sensitive utility data."),
  ];
}

function buildSummaryCards(
  maps: TransmissionMap[],
  substations: Substation[],
  nodes: MapNode[],
  lines: TransmissionLine[],
  publicLines: PublicTransmissionLineFeature[],
  publicSubstations: PublicSubstationFeature[],
  fccTowers: FccUtilityTowerFeature[],
  fccLinks: FccMicrowaveLinkFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  structures: TransmissionStructureFeature[],
  opgw: OpgwCableFeature[],
  opgwRoutes: OpgwRouteFeature[],
  opgwCableSections: OpgwCableSectionFeature[],
  opgwSpanSegments: OpgwSpanSegmentFeature[],
  opgwSplicePoints: OpgwSplicePointFeature[],
  closures: SpliceClosureFeature[],
  assignments: FiberAssignment[],
  distributionPoles: DistributionPoleFeature[],
  distributionPoleFiberRoutes: DistributionPoleFiberRouteFeature[],
  distributionPoleDensity: DistributionPoleDensityFeature[],
  distributionSplicePoints: DistributionPoleSplicePointFeature[],
  distributionSlackLoops: DistributionSlackLoopFeature[],
  distributionFiberAssignments: DistributionFiberAssignmentFeature[],
  estimatedDistributionPoleScale: number,
  panels: PatchPanel[],
) {
  const stateCount = new Set(publicLines.flatMap((line) => line.properties.states)).size;
  const voltageClassCount = new Set(publicLines.map((line) => line.properties.voltageClass || "unknown")).size;
  const ownerCounts = combinedOwnerCounts(publicSubstations, publicLines, fccTowers, fccLinks);
  const utilityOwnerCount = ownerCounts.filter(({ owner }) => owner !== "Unknown public owner").length;
  const topOwner = ownerCounts.find(({ owner }) => owner !== "Unknown public owner") || ownerCounts[0];
  return [
    { label: "Transmission Maps", value: maps.length, note: "public HIFLD reference", Icon: Network },
    { label: "HIFLD Lines", value: publicLines.length, note: "read-only public reference", Icon: Route },
    { label: "Substation Nodes", value: publicSubstations.length, note: "verified public owner", Icon: MapPin },
    { label: "FCC Utility Towers", value: fccTowers.length, note: "public ULS site nodes", Icon: RadioTower },
    { label: "FCC MW Links", value: fccLinks.length, note: `${fccFrequencyBandCountsFor(fccLinks).length} frequency groups`, Icon: Route },
    { label: "Utility Owners", value: utilityOwnerCount, note: "verified public buckets", Icon: Layers },
    { label: "Top Owner Bucket", value: topOwner?.count || 0, note: topOwner?.owner || "none", Icon: Gauge },
    { label: "Structures", value: structures.length, note: "synthetic demo points", Icon: MapPin },
    { label: "Splice Closures", value: closures.length, note: "synthetic demo closures", Icon: Cable },
    { label: "Distribution Poles", value: distributionPoles.length, note: "clustered telecom sample", Icon: MapPin },
    { label: "Pole Density Cells", value: distributionPoleDensity.length, note: "million-scale rollups", Icon: Gauge },
    { label: "Pole Fiber Routes", value: distributionPoleFiberRoutes.length, note: "street-path continuity", Icon: Route },
    { label: "Pole Splice Points", value: distributionSplicePoints.length, note: "synthetic route nodes", Icon: Cable },
    { label: "Slack Loops", value: distributionSlackLoops.length, note: "splice/storage slack", Icon: Workflow },
    { label: "Distribution Assignments", value: distributionFiberAssignments.length, note: "services carried", Icon: Route },
    { label: "Pole Scale Model", value: estimatedDistributionPoleScale, note: "estimated full territory", Icon: Gauge },
    { label: "States Covered", value: stateCount, note: "ISO New England states", Icon: MapPin },
    { label: "Voltage Classes", value: voltageClassCount, note: "HIFLD normalized classes", Icon: Gauge },
  ];
}

function buildSearchResults(
  substations: Substation[],
  nodes: MapNode[],
  lines: TransmissionLine[],
  publicLines: PublicTransmissionLineFeature[],
  publicSubstations: PublicSubstationFeature[],
  fccTowers: FccUtilityTowerFeature[],
  fccLinks: FccMicrowaveLinkFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  structures: TransmissionStructureFeature[],
  opgw: OpgwCableFeature[],
  opgwRoutes: OpgwRouteFeature[],
  opgwCableSections: OpgwCableSectionFeature[],
  opgwSpanSegments: OpgwSpanSegmentFeature[],
  opgwSplicePoints: OpgwSplicePointFeature[],
  closures: SpliceClosureFeature[],
  assignments: FiberAssignment[],
  distributionPoleDensity: DistributionPoleDensityFeature[],
  distributionPoles: DistributionPoleFeature[],
  distributionPoleFiberRoutes: DistributionPoleFiberRouteFeature[],
  distributionSplicePoints: DistributionPoleSplicePointFeature[],
  distributionSlackLoops: DistributionSlackLoopFeature[],
  distributionFiberAssignments: DistributionFiberAssignmentFeature[],
  panels: PatchPanel[],
  designRecords: DesignAssetRecord[],
  query: string,
): StreetMapSelection[] {
  const lowered = query.trim().toLowerCase();
  if (lowered.length < 2) return [];
  const all: StreetMapSelection[] = [
    ...publicLines.map((record) => ({ kind: "public_transmission_line" as const, id: record.properties.id, label: publicLineLabel(record), record })),
    ...publicSubstations.map((record) => ({ kind: "public_substation" as const, id: record.properties.id, label: publicSubstationLabel(record), record })),
    ...fccTowers.map((record) => ({ kind: "fcc_utility_tower" as const, id: record.properties.id, label: fccTowerLabel(record), record })),
    ...fccLinks.map((record) => ({ kind: "fcc_microwave_link" as const, id: record.properties.id, label: fccLinkLabel(record), record })),
    ...syntheticSubstations.map((record) => ({ kind: "synthetic_substation" as const, id: record.properties.id, label: record.properties.name, record })),
    ...structures.map((record) => ({ kind: "transmission_structure" as const, id: record.properties.id, label: record.properties.structureNumber, record })),
    ...opgw.map((record) => ({ kind: "opgw_cable" as const, id: record.properties.id, label: record.properties.cableName, record })),
    ...opgwRoutes.map((record) => ({ kind: "opgw_route" as const, id: record.properties.opgwRouteId, label: record.properties.routeName, record })),
    ...opgwCableSections.map((record) => ({ kind: "opgw_cable_section" as const, id: record.properties.cableSectionId, label: record.properties.cableSectionId, record })),
    ...opgwSpanSegments.map((record) => ({ kind: "opgw_span_segment" as const, id: record.properties.spanSegmentId, label: `${record.properties.fromStructureNumber} to ${record.properties.toStructureNumber}`, record })),
    ...opgwSplicePoints.map((record) => ({ kind: "opgw_splice_point" as const, id: record.properties.splicePointId, label: record.properties.splicePointId, record })),
    ...closures.map((record) => ({ kind: "splice_closure" as const, id: record.properties.id, label: record.properties.name, record })),
    ...assignments.map((record) => ({ kind: "fiber_assignment" as const, id: record.id, label: record.assignmentName, record })),
    ...distributionPoleDensity.map((record) => ({ kind: "distribution_pole_density" as const, id: record.properties.id, label: record.properties.densityCellName, record })),
    ...distributionPoles.map((record) => ({ kind: "distribution_pole" as const, id: record.properties.id, label: record.properties.poleNumber, record })),
    ...distributionPoleFiberRoutes.map((record) => ({ kind: "distribution_pole_fiber" as const, id: record.properties.routeId, label: record.properties.routeName, record })),
    ...distributionSplicePoints.map((record) => ({ kind: "distribution_splice_point" as const, id: record.properties.id, label: record.properties.spliceName, record })),
    ...distributionSlackLoops.map((record) => ({ kind: "distribution_slack_loop" as const, id: record.properties.id, label: record.properties.slackName, record })),
    ...distributionFiberAssignments.map((record) => ({ kind: "distribution_fiber_assignment" as const, id: record.properties.id, label: record.properties.assignmentName, record })),
    ...panels.map((record) => ({ kind: "patch_panel" as const, id: record.id, label: record.name, record })),
    ...designRecords.map((record) => ({ kind: "design_asset_record" as const, id: String(record.id), label: record.display_label || record.record_key, record })),
    ...substations.map((record) => ({ kind: "substation" as const, id: record.id, label: record.name, record })),
    ...nodes.map((record) => ({ kind: "node" as const, id: record.id, label: record.name, record })),
    ...lines.map((record) => ({ kind: "transmission_line" as const, id: record.id, label: record.name, record })),
  ];
  return all.filter((asset) => selectionSearchText(asset).toLowerCase().includes(lowered)).slice(0, 120);
}

function publicLineLabel(record: PublicTransmissionLineFeature) {
  return record.properties.name ? `${record.properties.name} (${record.properties.id})` : record.properties.id;
}

function publicSubstationLabel(record: PublicSubstationFeature) {
  return `${record.properties.name} / ${record.properties.utilityOwner}`;
}

function fccTowerLabel(record: FccUtilityTowerFeature) {
  return `${record.properties.callSign} loc ${record.properties.locationNumber} / ${record.properties.utilityOwner}`;
}

function fccLinkLabel(record: FccMicrowaveLinkFeature) {
  return `${record.properties.callSign} path ${record.properties.pathNumber} / ${record.properties.utilityOwner}`;
}

function isDashboardMapSearchResult(selection: StreetMapSelection) {
  return selection.kind === "public_transmission_line"
    || selection.kind === "public_substation"
    || selection.kind === "fcc_utility_tower"
    || selection.kind === "fcc_microwave_link"
    || selection.kind === "transmission_structure"
    || selection.kind === "opgw_cable"
    || selection.kind === "opgw_route"
    || selection.kind === "opgw_cable_section"
    || selection.kind === "opgw_span_segment"
    || selection.kind === "opgw_splice_point"
    || selection.kind === "splice_closure"
    || selection.kind === "fiber_assignment"
    || selection.kind === "distribution_pole_density"
    || selection.kind === "distribution_pole"
    || selection.kind === "distribution_pole_fiber"
    || selection.kind === "distribution_splice_point"
    || selection.kind === "distribution_slack_loop"
    || selection.kind === "distribution_fiber_assignment"
    || selection.kind === "gis_pole"
    || selection.kind === "gis_vector_asset"
    || selection.kind === "patch_panel"
    || selection.kind === "design_asset_record";
}

function matchesDashboardFilters(selection: StreetMapSelection, assetType: string, status: string, region: string, visibility: string, owner: string) {
  if (assetType !== "all" && selection.kind !== assetType) return false;
  if (status !== "all" && selectionStatus(selection) !== status) return false;
  if (region !== "all" && selectionRegion(selection) !== region) return false;
  if (visibility !== "all" && selectionVisibility(selection) !== visibility) return false;
  if (owner !== "all" && selectionUtilityOwner(selection) !== owner) return false;
  return true;
}

function matchesSearchLayer(selection: StreetMapSelection, layer: string) {
  if (selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") return layer === "all" || gisSearchTypesForLayer(layer).length > 0;
  if (layer === "all") return true;
  const option = searchLayerOptions.find((item) => item.value === layer);
  return option ? option.kinds.includes(selection.kind) : true;
}

function searchLayerForStreetLayer(layer: StreetMapLayerKey): DashboardSearchLayer | null {
  if (layer === "publicTransmissionLines") return "publicTransmissionLines";
  if (layer === "publicSubstations") return "publicSubstations";
  if (layer === "fccUtilityTowers") return "fccUtilityTowers";
  if (layer === "fccMicrowaveLinks") return "fccMicrowaveLinks";
  if (layer === "transmissionStructures") return "transmissionStructures";
  if (layer === "spliceClosures" || layer === "existingFiberSplices" || layer === "proposedFiberSplices" || layer === "compareSpliceLayers") return "spliceClosures";
  if (layer === "syntheticOpgwCables" || layer === "assumedOpgwRoutes" || layer === "plannedOpgwFiber" || layer === "verifiedOpgwFiber") return "syntheticOpgwCables";
  if (layer === "opgwRoutes") return "opgwRoutes";
  if (layer === "opgwCableSections") return "opgwCableSections";
  if (layer === "opgwSpanSegments" || layer === "opgwOutageImpact" || layer === "opgwSpanInspectionIssues") return "opgwSpanSegments";
  if (layer === "opgwSplicePoints") return "opgwSplicePoints";
  if (layer === "strandContinuity") return "strandContinuity";
  if (layer === "fiberAssignments" || layer === "availableStrandCapacity" || layer === "criticalRidingCircuits") return "fiberAssignments";
  if (isDistributionLayerKey(layer)) return "distributionFiberRoutes";
  if (layer === "patchPanels") return "patchPanels";
  if (layer === "syntheticSubstations") return "syntheticSubstations";
  if (layer === "designAssets") return "designAssets";
  return null;
}

function isDistributionLayerKey(layer: StreetMapLayerKey) {
  return distributionNetworkLayerKeys.includes(layer);
}

function withDistributionNetworkLayerState(current: Record<StreetMapLayerKey, boolean>, enabled: boolean) {
  const next = { ...current };
  distributionNetworkLayerKeys.forEach((key) => {
    next[key] = false;
  });
  if (enabled) {
    next.distributionPoleDensity = true;
    next.distributionPoles = true;
    next.distributionFiberRoutes = true;
  }
  return next;
}

function shouldHideContinuityDevices(params: URLSearchParams) {
  return isTruthyUrlParam(params.get("hideDevices"))
    || isTruthyUrlParam(params.get("withoutDevices"))
    || params.get("devices") === "0";
}

function isTruthyUrlParam(value: string | null) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function strandContinuityLayerState(current: Record<StreetMapLayerKey, boolean>, options: StrandContinuityFocusOptions = {}) {
  const includeDevices = options.includeDevices ?? true;
  const next = Object.fromEntries(
    (Object.keys(current) as StreetMapLayerKey[]).map((key) => [key, false]),
  ) as Record<StreetMapLayerKey, boolean>;
  next.strandContinuity = true;
  next.syntheticOpgwCables = true;
  next.opgwRoutes = true;
  next.opgwCableSections = true;
  next.opgwSplicePoints = true;
  next.spliceClosures = true;
  next.patchPanels = true;
  next.fiberAssignments = true;
  next.telecomNodes = includeDevices;
  next.selIconNodes = includeDevices;
  next.c3794Nodes = includeDevices;
  return next;
}

function circuitRouteLayerState(current: Record<StreetMapLayerKey, boolean>, family: "opgw" | "distribution" | "line" = "opgw") {
  const next = Object.fromEntries(
    (Object.keys(current) as StreetMapLayerKey[]).map((key) => [key, false]),
  ) as Record<StreetMapLayerKey, boolean>;
  if (family === "distribution") {
    next.distributionFiberRoutes = true;
    next.distributionFiberAssignments = true;
    next.distributionSplicePoints = true;
    next.distributionSlackLoops = true;
    next.distributionPoles = true;
    return next;
  }
  next.strandContinuity = true;
  next.fiberAssignments = true;
  if (family === "opgw") {
    next.opgwRoutes = true;
    next.opgwCableSections = true;
    next.opgwSplicePoints = true;
    next.spliceClosures = true;
    next.patchPanels = true;
  }
  return next;
}

function isDistributionSelectionKind(kind: StreetMapSelection["kind"]) {
  return kind === "distribution_pole_density"
    || kind === "distribution_pole"
    || kind === "distribution_pole_fiber"
    || kind === "distribution_splice_point"
    || kind === "distribution_slack_loop"
    || kind === "distribution_fiber_assignment";
}

function visibilityForStreetLayer(layer: StreetMapLayerKey) {
  if (layer === "publicTransmissionLines" || layer === "publicSubstations" || layer === "fccUtilityTowers" || layer === "fccMicrowaveLinks") return "public";
  return "synthetic-demo";
}

function visibilityForSearchLayer(layer: DashboardSearchLayer) {
  if (layer === "all") return "all";
  if (layer === "publicTransmissionLines" || layer === "publicSubstations" || layer === "fccUtilityTowers" || layer === "fccMicrowaveLinks") return "public";
  return "synthetic-demo";
}

function gisSearchTypesForLayer(layer: string): Array<"pole" | "circuit" | "fiber" | "splice" | "handhole" | "mux"> {
  if (layer === "distributionPoles") return ["pole"];
  if (layer === "distributionFiberRoutes") return ["pole", "fiber", "circuit", "splice"];
  if (layer === "distributionFiberAssignments" || layer === "fiberAssignments") return ["fiber", "circuit"];
  if (layer === "distributionSplicePoints" || layer === "spliceClosures") return ["splice"];
  if (layer === "all") return ["pole", "fiber", "circuit", "splice"];
  return [];
}

function serverSearchRecordToSelection(type: "pole" | "circuit" | "fiber" | "splice" | "handhole" | "mux", record: Record<string, unknown>): StreetMapSelection {
  const id = String(record.id || record.label || "gis-asset");
  const label = String(record.label || id);
  const mappedKind = type === "pole" ? "gis_pole" : "gis_vector_asset";
  return {
    kind: mappedKind,
    id,
    label,
    record: {
      ...record,
      assetType: type,
      source: "PostGIS server search",
      warning: "Synthetic GIS-scale record returned by paginated server-side search.",
    },
  } as StreetMapSelection;
}

function searchLayerLabel(layer: string) {
  return searchLayerOptions.find((option) => option.value === layer)?.label || "All searchable layers";
}

function selectionLayerLabel(selection: StreetMapSelection) {
  if (selection.kind === "gis_pole") return "GIS-scale distribution poles";
  if (selection.kind === "gis_vector_asset") return `GIS-scale ${String(selection.record.assetType || "asset")} layer`;
  if (selection.kind === "design_asset_record") return "Editable planning assets";
  return searchLayerOptions.find((option) => option.kinds.includes(selection.kind))?.label || "Other map layer";
}

function selectionStatus(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return selection.record.properties.status || "unknown";
  if (selection.kind === "public_substation") return selection.record.properties.status || "unknown";
  if (selection.kind === "fcc_utility_tower") return selection.record.properties.licenseStatus || "active";
  if (selection.kind === "fcc_microwave_link") return selection.record.properties.pathStatus || "active";
  if (selection.kind === "synthetic_substation") return selection.record.properties.status;
  if (selection.kind === "transmission_structure") return selection.record.properties.hasSplice ? "assigned" : selection.record.properties.hasOpgw ? "existing" : "planned";
  if (selection.kind === "opgw_cable") return dashboardOpgwStatus(selection.record);
  if (selection.kind === "opgw_route") return selection.record.properties.routeStatus;
  if (selection.kind === "opgw_cable_section") return selection.record.properties.installStatus;
  if (selection.kind === "opgw_span_segment") return selection.record.properties.spanStatus;
  if (selection.kind === "opgw_splice_point") return selection.record.properties.status;
  if (selection.kind === "splice_closure") return selection.record.properties.status;
  if (selection.kind === "fiber_assignment") return selection.record.status;
  if (selection.kind === "distribution_pole_density") return selection.record.properties.statusSummary;
  if (selection.kind === "distribution_pole") return selection.record.properties.status;
  if (selection.kind === "distribution_pole_fiber") return selection.record.properties.status;
  if (selection.kind === "distribution_splice_point") return selection.record.properties.status;
  if (selection.kind === "distribution_slack_loop") return selection.record.properties.status;
  if (selection.kind === "distribution_fiber_assignment") return selection.record.properties.status;
  if (selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") return String(selection.record.status || selection.record.asset_status || "synthetic");
  if (selection.kind === "design_asset_record") return selection.record.status;
  if (selection.kind === "patch_panel") return selection.record.ports.some((port) => port.status === "assigned") ? "assigned" : "planned";
  const record = selection.record as { status?: string };
  return record.status || "open";
}

function selectionRegion(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return selection.record.properties.states[0] || "MA";
  if (selection.kind === "public_substation") return selection.record.properties.state;
  if (selection.kind === "fcc_utility_tower") return selection.record.properties.state;
  if (selection.kind === "fcc_microwave_link") return selection.record.properties.states[0] || "MA";
  if (selection.kind === "synthetic_substation") return selection.record.properties.state;
  if (selection.kind === "distribution_pole_density" || selection.kind === "distribution_pole" || selection.kind === "distribution_pole_fiber" || selection.kind === "distribution_splice_point" || selection.kind === "distribution_slack_loop" || selection.kind === "distribution_fiber_assignment") return selection.record.properties.state;
  if (selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") return String(selection.record.state || "MA");
  if (selection.kind === "design_asset_record") return "MA";
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "opgw_route" || selection.kind === "opgw_cable_section" || selection.kind === "opgw_span_segment" || selection.kind === "opgw_splice_point" || selection.kind === "splice_closure" || selection.kind === "fiber_assignment" || selection.kind === "patch_panel") return "MA";
  const record = selection.record as { state?: string };
  return record.state || "MA";
}

function selectionVisibility(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return "public";
  if (selection.kind === "public_substation") return "public";
  if (selection.kind === "fcc_utility_tower" || selection.kind === "fcc_microwave_link") return "public";
  if (selection.kind === "synthetic_substation") return selection.record.properties.visibility;
  if (selection.kind === "distribution_pole_density" || selection.kind === "distribution_pole" || selection.kind === "distribution_pole_fiber" || selection.kind === "distribution_splice_point" || selection.kind === "distribution_slack_loop" || selection.kind === "distribution_fiber_assignment") return "synthetic-demo";
  if (selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") return "synthetic-demo";
  if (selection.kind === "design_asset_record") return selection.record.visibility || "synthetic-demo";
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "opgw_route" || selection.kind === "opgw_cable_section" || selection.kind === "opgw_span_segment" || selection.kind === "opgw_splice_point" || selection.kind === "splice_closure" || selection.kind === "fiber_assignment" || selection.kind === "patch_panel") return "synthetic-demo";
  const record = selection.record as { visibility?: string };
  return record.visibility || "private";
}

function selectionUtilityOwner(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return publicTransmissionLineOwner(selection.record.properties);
  if (selection.kind === "public_substation") return selection.record.properties.utilityOwner;
  if (selection.kind === "fcc_utility_tower" || selection.kind === "fcc_microwave_link") return selection.record.properties.utilityOwner;
  if (selection.kind === "distribution_pole_density" || selection.kind === "distribution_pole" || selection.kind === "distribution_pole_fiber" || selection.kind === "distribution_splice_point" || selection.kind === "distribution_slack_loop" || selection.kind === "distribution_fiber_assignment") return selection.record.properties.utilityOwner;
  if (selection.kind === "gis_pole" || selection.kind === "gis_vector_asset") return String(selection.record.utilityOwner || selection.record.owner || "Synthetic planning owner");
  if (selection.kind === "design_asset_record") return String(selection.record.properties?.owner || selection.record.properties_json?.owner || "Synthetic planning owner");
  return "Unknown public owner";
}

function buildOwnerOptions(publicSubstations: PublicSubstationFeature[], publicLines: PublicTransmissionLineFeature[], fccTowers: FccUtilityTowerFeature[], fccLinks: FccMicrowaveLinkFeature[]) {
  return ["all", ...combinedOwnerCounts(publicSubstations, publicLines, fccTowers, fccLinks).map(({ owner }) => owner)];
}

function ownerCountsFor(publicSubstations: PublicSubstationFeature[], publicLines: PublicTransmissionLineFeature[]) {
  const counts = new Map<string, number>();
  publicSubstations.forEach((record) => {
    counts.set(record.properties.utilityOwner, (counts.get(record.properties.utilityOwner) || 0) + 1);
  });
  publicLines.forEach((record) => {
    const owner = publicTransmissionLineOwner(record.properties);
    counts.set(owner, (counts.get(owner) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

function fccOwnerCountsFor(towers: FccUtilityTowerFeature[], links: FccMicrowaveLinkFeature[]) {
  const counts = new Map<string, number>();
  towers.forEach((record) => {
    counts.set(record.properties.utilityOwner, (counts.get(record.properties.utilityOwner) || 0) + 1);
  });
  links.forEach((record) => {
    counts.set(record.properties.utilityOwner, (counts.get(record.properties.utilityOwner) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

function fccFrequencyBandCountsFor(links: FccMicrowaveLinkFeature[]) {
  const counts = new Map<string, number>();
  links.forEach((record) => {
    const frequencyBand = fccFrequencyBandLabel(record.properties.frequencyAssignedMhz);
    counts.set(frequencyBand, (counts.get(frequencyBand) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([frequencyBand, count]) => ({ frequencyBand, count }))
    .sort((a, b) => frequencyBandSortValue(a.frequencyBand) - frequencyBandSortValue(b.frequencyBand) || a.frequencyBand.localeCompare(b.frequencyBand));
}

function fccFrequencyBandLabel(frequencyMhz?: number | null) {
  if (!frequencyMhz) return "unknown";
  if (frequencyMhz >= 21000) return "23 GHz+";
  if (frequencyMhz >= 17000) return "18 GHz";
  if (frequencyMhz >= 10000) return "11-15 GHz";
  if (frequencyMhz >= 5800) return "6-10 GHz";
  if (frequencyMhz >= 1900) return "2 GHz";
  return "below 2 GHz";
}

function frequencyBandSortValue(frequencyBand: string) {
  if (frequencyBand === "below 2 GHz") return 1;
  if (frequencyBand === "2 GHz") return 2;
  if (frequencyBand === "6-10 GHz") return 6;
  if (frequencyBand === "11-15 GHz") return 11;
  if (frequencyBand === "18 GHz") return 18;
  if (frequencyBand === "23 GHz+") return 23;
  return 99;
}

function combinedOwnerCounts(publicSubstations: PublicSubstationFeature[], publicLines: PublicTransmissionLineFeature[], fccTowers: FccUtilityTowerFeature[], fccLinks: FccMicrowaveLinkFeature[]) {
  const counts = new Map<string, number>();
  [...ownerCountsFor(publicSubstations, publicLines), ...fccOwnerCountsFor(fccTowers, fccLinks)].forEach(({ owner, count }) => {
    counts.set(owner, (counts.get(owner) || 0) + count);
  });
  return [...counts.entries()]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

function mergeVisibleOwnerState(current: Record<string, boolean>, ownerCounts: Array<{ owner: string; count: number }>) {
  const activeOwners = new Set(ownerCounts.map(({ owner }) => owner));
  let changed = false;
  const next: Record<string, boolean> = {};
  ownerCounts.forEach(({ owner }) => {
    next[owner] = current[owner] ?? true;
    if (!(owner in current)) changed = true;
  });
  Object.keys(current).forEach((owner) => {
    if (!activeOwners.has(owner)) changed = true;
  });
  return changed ? next : current;
}

function mergeVisibleFrequencyBandState(current: Record<string, boolean>, frequencyBandCounts: Array<{ frequencyBand: string; count: number }>) {
  const activeBands = new Set(frequencyBandCounts.map(({ frequencyBand }) => frequencyBand));
  let changed = false;
  const next: Record<string, boolean> = {};
  frequencyBandCounts.forEach(({ frequencyBand }) => {
    next[frequencyBand] = current[frequencyBand] ?? true;
    if (!(frequencyBand in current)) changed = true;
  });
  Object.keys(current).forEach((frequencyBand) => {
    if (!activeBands.has(frequencyBand)) changed = true;
  });
  return changed ? next : current;
}

function formatSelectionKind(kind: StreetMapSelection["kind"]) {
  return kind.replaceAll("_", " ");
}

function selectionSearchText(selection: StreetMapSelection) {
  const layerLabel = selectionLayerLabel(selection);
  if (selection.kind === "public_transmission_line") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.name, publicTransmissionLineOwner(properties), properties.rawOwner, properties.ownerSource, properties.osmLineElementId, properties.osmLineName, properties.osmOperator, properties.osmOwner, properties.voltageClass, properties.states.join(" ")].join(" ");
  }
  if (selection.kind === "public_substation") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.name, properties.utilityOwner, properties.city, properties.county, properties.state, properties.nearestPublicLineId].join(" ");
  }
  if (selection.kind === "fcc_utility_tower") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.nodeName, properties.callSign, properties.utilityOwner, properties.rawLicenseeName, properties.frn, properties.locationName, properties.address, properties.city, properties.county, properties.state, properties.towerRegistrationNumber, properties.frequencyBandsMhz.join(" ")].join(" ");
  }
  if (selection.kind === "fcc_microwave_link") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.linkName, properties.callSign, properties.utilityOwner, properties.rawLicenseeName, properties.pathNumber, properties.pathTypeDesc, fccFrequencyBandLabel(properties.frequencyAssignedMhz), properties.frequencyAssignedMhz, properties.frequencyUpperBandMhz, properties.txNodeId, properties.rxNodeId, properties.states.join(" ")].join(" ");
  }
  if (selection.kind === "transmission_structure") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.structureNumber, properties.lineId, properties.lineName, properties.structureType].join(" ");
  }
  if (selection.kind === "opgw_route") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.opgwRouteId, properties.routeName, properties.transmissionLineId, properties.routeStatus, properties.voltageClass, properties.syntheticConfidence].join(" ");
  }
  if (selection.kind === "opgw_cable_section") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.cableSectionId, properties.opgwRouteId, properties.transmissionLineId, properties.fromSplicePointId, properties.toSplicePointId, properties.fromStructureNumber, properties.toStructureNumber, properties.installStatus, properties.syntheticConfidence].join(" ");
  }
  if (selection.kind === "opgw_span_segment") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.spanSegmentId, properties.cableSectionId, properties.opgwRouteId, properties.transmissionLineId, properties.fromStructureNumber, properties.toStructureNumber, properties.spanStatus, properties.inspectionStatus, properties.outageRiskScore].join(" ");
  }
  if (selection.kind === "opgw_splice_point") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.splicePointId, properties.opgwRouteId, properties.transmissionLineId, properties.structureId, properties.structureNumber, properties.spliceType, properties.closureId, properties.status].join(" ");
  }
  if (selection.kind === "splice_closure") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.name, properties.structureNumber, properties.closureType, properties.status].join(" ");
  }
  if (selection.kind === "distribution_pole_density") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.densityCellName, properties.utilityOwner, properties.state, properties.statusSummary, properties.displayPoleCount, properties.representedPoleCount, properties.splicePointCount, properties.slackLoopCount, properties.assignmentCount, properties.maxFiberCount].join(" ");
  }
  if (selection.kind === "distribution_pole") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.poleNumber, properties.feederId, properties.streetPathId, properties.utilityOwner, properties.state, properties.telecomRole, properties.fiberCount, properties.continuityPathId, properties.upstreamPatchPanelId, properties.upstreamPoleId, properties.downstreamPoleId, properties.status, properties.splicePointIds?.join(" "), properties.slackLoopIds?.join(" "), properties.assignmentIds?.join(" ")].join(" ");
  }
  if (selection.kind === "distribution_pole_fiber") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.routeId, properties.routeName, properties.feederId, properties.streetPathId, properties.utilityOwner, properties.state, properties.fiberCount, properties.parentPatchPanelId, properties.parentOpgwRouteId, properties.continuityStatus, properties.serviceTypesCarried.join(" "), properties.status, properties.splicePointIds?.join(" "), properties.slackLoopIds?.join(" "), properties.assignmentIds?.join(" ")].join(" ");
  }
  if (selection.kind === "distribution_splice_point") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.spliceName, properties.routeId, properties.feederId, properties.streetPathId, properties.poleId, properties.poleNumber, properties.utilityOwner, properties.state, properties.spliceType, properties.spliceCount, properties.slackLoopFeet, properties.connectedAssignmentIds.join(" "), properties.status].join(" ");
  }
  if (selection.kind === "distribution_slack_loop") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.slackName, properties.routeId, properties.feederId, properties.poleId, properties.poleNumber, properties.utilityOwner, properties.state, properties.slackType, properties.slackFeet, properties.relatedSplicePointId, properties.status].join(" ");
  }
  if (selection.kind === "distribution_fiber_assignment") {
    const properties = selection.record.properties;
    return [layerLabel, selection.label, properties.id, properties.assignmentName, properties.routeId, properties.feederId, properties.utilityOwner, properties.state, properties.serviceType, properties.status, properties.criticality, properties.strandNumbers.join(" "), properties.aEndPoleId, properties.zEndPoleId, properties.splicePointIds.join(" "), properties.slackLoopIds.join(" ")].join(" ");
  }
  if (selection.kind === "design_asset_record") {
    const record = selection.record;
    return [layerLabel, selection.label, record.id, record.record_key, record.asset_type_slug, record.asset_type_display_name, record.status, record.source, record.visibility, JSON.stringify(record.properties || record.properties_json || {})].join(" ");
  }
  return [layerLabel, JSON.stringify(selection.record)].join(" ");
}

function filterSubstationsForScope(substations: Substation[], publicOnly: boolean) {
  return substations.filter((substation) => {
    if (!isSubstationInIsoNeScope(substation)) return false;
    if (publicOnly) return substation.visibility === "public";
    return true;
  });
}

function filterNodesForScope(nodes: MapNode[], publicOnly: boolean) {
  return nodes.filter((node) => {
    if (!isCoordinateInIsoNeScope(node.longitude, node.latitude)) return false;
    if (publicOnly) return node.visibility === "public";
    return true;
  });
}

function isSubstationInIsoNeScope(substation: Substation) {
  if (substation.state && newEnglandStates.has(substation.state)) return true;
  return isCoordinateInIsoNeScope(substation.longitude, substation.latitude);
}

function isLineInIsoNeScope(line: TransmissionLine) {
  return line.geometry.coordinates.every(([longitude, latitude]) => isCoordinateInIsoNeScope(longitude, latitude));
}

function isCoordinateInIsoNeScope(longitude?: number, latitude?: number) {
  if (longitude === undefined || latitude === undefined) return true;
  return longitude >= -74.2 && longitude <= -66.7 && latitude >= 40.8 && latitude <= 47.7;
}

function publicLayerSet(layers: Record<StreetMapLayerKey, boolean>) {
  return {
    ...layers,
    publicTransmissionLines: true,
    fccUtilityTowers: true,
    fccMicrowaveLinks: true,
    syntheticSubstations: false,
    transmissionLines: false,
    substations: false,
    telecomNodes: false,
    selIconNodes: false,
    c3794Nodes: false,
    fiberRoutes: false,
    opgwRoutes: false,
    existingFiberSplices: false,
    proposedFiberSplices: false,
    compareSpliceLayers: false,
    distributionPoleDensity: true,
    distributionPoles: true,
    distributionFiberRoutes: true,
    distributionSplicePoints: false,
    distributionSlackLoops: false,
    distributionFiberAssignments: false,
    circuitEndpoints: false,
    workOrderLocations: false,
    proposedChanges: false,
    missingLocationAssets: false,
    planningRegions: false,
    isoNeReferenceOverlays: true,
  };
}

function createSubstationDraft([longitude, latitude]: Coordinate): Substation {
  const id = `SUB-CUSTOM-${Date.now().toString(36).toUpperCase()}`;
  return {
    id,
    name: "New Substation",
    abbreviation: "NEW",
    state: "MA",
    county: "",
    city: "",
    voltageKv: [115],
    status: "proposed",
    latitude,
    longitude,
    source: "Manual street-level placement",
    visibility: "private",
    connectedTransmissionLineIds: [],
    connectedDeviceIds: [],
    connectedCircuitIds: [],
    connectedFiberIds: [],
    nodeParameters: {
      nodeId: id,
      nodeName: "New Substation",
      nodeType: "substation",
      electrical: { voltageKv: 115, phases: "ABC" },
      planning: { status: "proposed", priority: "medium", notes: "Created from street-level map click." },
    },
    notes: "Private by default.",
  };
}

function createNodeDraft([longitude, latitude]: Coordinate, activeMapId: string, addAssetKind: AddAssetKind | null): MapNode {
  const kind = addAssetKind || "telecom_node";
  const id = `NODE-CUSTOM-${Date.now().toString(36).toUpperCase()}`;
  const nodeType = nodeTypeForAddAsset(kind);
  const name = `New ${addAssetLabel(kind)}`;
  return {
    id,
    name,
    nodeType,
    transmissionMapId: activeMapId,
    latitude,
    longitude,
    status: "proposed",
    visibility: "private",
    linkedDeviceIds: [],
    linkedCircuitIds: kind === "circuit_endpoint" ? ["CIRCUIT-TBD"] : [],
    linkedWorkOrderIds: kind === "work_order" ? [`WO-CUSTOM-${Date.now().toString(36).toUpperCase()}`] : [],
    linkedFiberAssignmentIds: [],
    nodeParameters: {
      nodeId: id,
      nodeName: name,
      nodeType,
      telecom: ["telecom_node", "sel_icon_node", "circuit_endpoint"].includes(kind) ? {
        deviceType: kind === "sel_icon_node" ? "SEL ICON" : "Telecom node",
        vendor: kind === "sel_icon_node" ? "SEL" : undefined,
        protocol: kind === "circuit_endpoint" ? "C37.94" : "Ethernet",
        timingSource: "Unknown",
      } : undefined,
      fiber: kind === "fiber_node" ? { fiberType: "unknown" } : undefined,
      planning: { status: "proposed", priority: "medium", notes: "Created from street-level MapLibre click. Private by default." },
    },
    notes: "Private by default.",
  };
}

function nodeTypeForAddAsset(kind: AddAssetKind): NodeParameters["nodeType"] {
  if (kind === "sel_icon_node") return "sel_icon_node";
  if (kind === "fiber_node") return "fiber_node";
  if (kind === "circuit_endpoint") return "circuit_endpoint";
  if (kind === "work_order" || kind === "proposed_change") return "proposed_node";
  return "device_node";
}

function addAssetLabel(kind: AddAssetKind | null) {
  if (!kind) return "Asset";
  return kind.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
