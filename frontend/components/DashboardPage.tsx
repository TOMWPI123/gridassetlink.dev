"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Cable, ExternalLink, Filter, Gauge, Layers, LocateFixed, MapPin, Maximize2, Network, PanelRightClose, PanelRightOpen, Plus, RadioTower, Route, Search, SlidersHorizontal, TableProperties, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { appNavGroups } from "@/components/navigation";
import { dataSourceRecords, dataSourceSafetyNotes } from "@/data/dataSources";
import { seedMapNodes } from "@/data/nodeParameters";
import { seedEditableSubstations } from "@/data/substations";
import { seedPlanningRegions, seedTransmissionLines } from "@/data/transmissionLines";
import { seedTransmissionMaps } from "@/data/transmissionMaps";
import { buildSyntheticOpgwEngineeringModel } from "@/lib/opgw/spanModel";
import { publicTransmissionLineOwner } from "@/lib/map/public-owner";
import { LinkedAssetDetailPanel } from "@/components/map/LinkedAssetDetailPanel";
import { MapLayerControlPanel } from "@/components/map/MapLayerControlPanel";
import { MissingMapLocationPanel, type MissingMapLocation } from "@/components/map/MissingMapLocationPanel";
import { NodeParameterEditor } from "@/components/map/NodeParameterEditor";
import { StreetLevelAssetMap, type FocusRequest, type MapCommand, type StreetMapSelection } from "@/components/map/StreetLevelAssetMap";
import { SubstationEditor } from "@/components/map/SubstationEditor";
import { TransmissionMapEditor } from "@/components/map/TransmissionMapEditor";
import type { Coordinate, DashboardMapMode, FccMicrowaveLinkCollection, FccMicrowaveLinkFeature, FccUtilityTowerCollection, FccUtilityTowerFeature, FiberAssignment, FiberSplice, FiberStrand, MapDrawingTool, MapNode, NodeParameters, OpgwCableCollection, OpgwCableFeature, OpgwCableSectionFeature, OpgwRouteFeature, OpgwSpanSegmentFeature, OpgwSplicePointFeature, PatchPanel, PublicSubstationCollection, PublicSubstationFeature, PublicTransmissionLineCollection, PublicTransmissionLineFeature, SpliceClosureCollection, SpliceClosureFeature, StreetMapLayerKey, Substation, SyntheticService, SyntheticSubstationFeature, TransmissionLine, TransmissionMap, TransmissionStructureCollection, TransmissionStructureFeature } from "@/lib/types/assets";

const initialStreetLayers: Record<StreetMapLayerKey, boolean> = {
  publicTransmissionLines: true,
  publicSubstations: true,
  fccUtilityTowers: false,
  fccMicrowaveLinks: false,
  syntheticSubstations: false,
  transmissionStructures: true,
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
  spliceClosures: true,
  fiberAssignments: false,
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
  distributionFiberRoutes: false,
  circuitEndpoints: false,
  workOrderLocations: false,
  proposedChanges: false,
  missingLocationAssets: false,
  planningRegions: false,
  isoNeReferenceOverlays: false,
};

const dashboardStreetLayers: Record<StreetMapLayerKey, boolean> = {
  ...initialStreetLayers,
  publicTransmissionLines: true,
  publicSubstations: true,
  fccUtilityTowers: true,
  fccMicrowaveLinks: true,
  transmissionStructures: true,
  assumedOpgwRoutes: true,
  plannedOpgwFiber: true,
  opgwCableSections: true,
  opgwSpanSegments: true,
  opgwSplicePoints: true,
  existingFiberSplices: true,
  proposedFiberSplices: true,
  compareSpliceLayers: false,
  spliceClosures: true,
  availableStrandCapacity: true,
};

type MapStatus = "loading" | "active" | "error";
type RightDrawerMode = "modules" | "summary" | "filters" | "layers" | "sources" | "details" | "strands" | "splices" | "assignments" | "editor";
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
  | "patchPanels"
  | "syntheticSubstations"
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
  { value: "patchPanels", label: "Patch panels", kinds: ["patch_panel"] },
  { value: "syntheticSubstations", label: "Synthetic substations", kinds: ["synthetic_substation"] },
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
  "/distribution-fiber": ["distributionFiberRoutes", "fiberAssignments"],
  "/fiber-cables": ["syntheticOpgwCables", "opgwCableSections"],
  "/fiber-strands": ["fiberStrandsLayer", "availableStrandCapacity"],
  "/fiber-assignments": ["fiberAssignments", "criticalRidingCircuits", "availableStrandCapacity"],
  "/splice-closures": ["spliceClosures", "existingFiberSplices", "proposedFiberSplices"],
  "/splice-points": ["opgwSplicePoints", "existingFiberSplices", "proposedFiberSplices"],
  "/patch-panels": ["patchPanels", "spliceClosures"],
  "/deviceops/change-requests": ["proposedChanges", "plannedOpgwFiber", "opgwOpenWorkOrders"],
  "/fiber-trace": ["fiberAssignments", "opgwCableSections", "opgwSpanSegments"],
  "/outage-impact": ["opgwOutageImpact", "criticalRidingCircuits", "opgwSpanInspectionIssues"],
  "/splice-matrix": ["existingFiberSplices", "proposedFiberSplices", "compareSpliceLayers"],
  "/fiber-strand-table": ["fiberStrandsLayer", "availableStrandCapacity"],
  "/fiber-assignment-planner": ["fiberAssignments", "availableStrandCapacity", "criticalRidingCircuits"],
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
  const [selectedAsset, setSelectedAsset] = useState<StreetMapSelection | null>(null);
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
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapStatusMessage, setMapStatusMessage] = useState("");
  const [streetLayers, setStreetLayers] = useState<Record<StreetMapLayerKey, boolean>>(() => dashboardStreetLayers);
  const [isolatedOpgwRouteId, setIsolatedOpgwRouteId] = useState<string | null>(null);
  const [isolatedOpgwSectionId, setIsolatedOpgwSectionId] = useState<string | null>(null);
  const [visibleTransmissionLineOwners, setVisibleTransmissionLineOwners] = useState<Record<string, boolean>>({});
  const [visibleSubstationOwners, setVisibleSubstationOwners] = useState<Record<string, boolean>>({});
  const [visibleFccTowerOwners, setVisibleFccTowerOwners] = useState<Record<string, boolean>>({});
  const [visibleFccLinkOwners, setVisibleFccLinkOwners] = useState<Record<string, boolean>>({});
  const [visibleFccFrequencyBands, setVisibleFccFrequencyBands] = useState<Record<string, boolean>>({});
  const [publicTransmissionLines, setPublicTransmissionLines] = useState<PublicTransmissionLineFeature[]>([]);
  const [publicSubstations, setPublicSubstations] = useState<PublicSubstationFeature[]>([]);
  const [fccUtilityTowers, setFccUtilityTowers] = useState<FccUtilityTowerFeature[]>([]);
  const [fccMicrowaveLinks, setFccMicrowaveLinks] = useState<FccMicrowaveLinkFeature[]>([]);
  const [syntheticSubstations, setSyntheticSubstations] = useState<SyntheticSubstationFeature[]>([]);
  const [transmissionStructures, setTransmissionStructures] = useState<TransmissionStructureFeature[]>([]);
  const [opgwCables, setOpgwCables] = useState<OpgwCableFeature[]>([]);
  const [spliceClosures, setSpliceClosures] = useState<SpliceClosureFeature[]>([]);
  const [fiberStrands, setFiberStrands] = useState<FiberStrand[]>([]);
  const [fiberSplices, setFiberSplices] = useState<FiberSplice[]>([]);
  const [patchPanels, setPatchPanels] = useState<PatchPanel[]>([]);
  const [fiberAssignments, setFiberAssignments] = useState<FiberAssignment[]>([]);
  const [syntheticServices, setSyntheticServices] = useState<SyntheticService[]>([]);
  const [mapDataWarnings, setMapDataWarnings] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadStaticMapData() {
      const warnings: Record<string, string> = {};
      const publicLines = await fetchGeoJson<PublicTransmissionLineCollection>("/data/iso-ne-public-transmission-lines.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.publicLines = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as PublicTransmissionLineFeature[];
        });
      const publicSubstationRecords = await fetchGeoJson<PublicSubstationCollection>("/data/iso-ne-public-substations.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.publicSubstations = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as PublicSubstationFeature[];
        });
      const structures = await fetchGeoJson<TransmissionStructureCollection>("/data/iso-ne-synthetic-transmission-structures.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.structures = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as TransmissionStructureFeature[];
        });
      const closures = await fetchGeoJson<SpliceClosureCollection>("/data/iso-ne-synthetic-splice-closures.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.spliceClosures = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as SpliceClosureFeature[];
        });
      const cables = await fetchGeoJson<OpgwCableCollection>("/data/iso-ne-synthetic-opgw-cables.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.opgwCables = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as OpgwCableFeature[];
        });
      const strands = await fetchGeoJson<FiberStrand[]>("/data/iso-ne-synthetic-fiber-strands.json").catch((error) => {
        warnings.fiberStrands = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
        return [] as FiberStrand[];
      });
      const assignments = await fetchGeoJson<FiberAssignment[]>("/data/iso-ne-synthetic-fiber-assignments.json").catch((error) => {
        warnings.fiberAssignments = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
        return [] as FiberAssignment[];
      });
      const panels = await fetchGeoJson<PatchPanel[]>("/data/iso-ne-synthetic-patch-panels.json").catch((error) => {
        warnings.patchPanels = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
        return [] as PatchPanel[];
      });
      const fccTowers = await fetchGeoJson<FccUtilityTowerCollection>("/data/fcc-uls-utility-towers.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.fccUtilityTowers = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as FccUtilityTowerFeature[];
        });
      const fccLinks = await fetchGeoJson<FccMicrowaveLinkCollection>("/data/fcc-uls-utility-microwave-links.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.fccMicrowaveLinks = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as FccMicrowaveLinkFeature[];
        });
      const splices = await fetchGeoJson<FiberSplice[]>("/data/iso-ne-synthetic-fiber-splices.json").catch((error) => {
        warnings.splices = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
        return [] as FiberSplice[];
      });
      const services = await fetchGeoJson<SyntheticService[]>("/data/iso-ne-synthetic-services.json").catch((error) => {
        warnings.syntheticServices = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
        return [] as SyntheticService[];
      });
      if (cancelled) return;
      setPublicTransmissionLines(publicLines);
      setPublicSubstations(publicSubstationRecords);
      setTransmissionStructures(structures);
      setSpliceClosures(closures);
      setOpgwCables(cables);
      setFiberStrands(strands);
      setFiberAssignments(assignments);
      setPatchPanels(panels);
      setFccUtilityTowers(fccTowers);
      setFccMicrowaveLinks(fccLinks);
      setFiberSplices(splices);
      setSyntheticServices(services);
      setMapDataWarnings(warnings);
    }
    void loadStaticMapData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const drawer = new URLSearchParams(window.location.search).get("drawer");
    if (drawer && ["modules", "summary", "filters", "layers", "sources", "details", "strands", "splices", "assignments"].includes(drawer)) {
      setRightMode(drawer as RightDrawerMode);
      setRightCollapsed(false);
    }
  }, []);

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
  const visibleFiberAssignments = useMemo(
    () => fiberAssignments.filter((assignment) => assignment.synthetic),
    [fiberAssignments],
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
  const activeIsolatedOpgwRouteId = isolatedOpgwSection?.properties.opgwRouteId || isolatedOpgwRouteId || "";
  const mapOpgwRoutes = useMemo(
    () => activeIsolatedOpgwRouteId ? visibleOpgwRoutes.filter((route) => route.properties.opgwRouteId === activeIsolatedOpgwRouteId) : visibleOpgwRoutes,
    [activeIsolatedOpgwRouteId, visibleOpgwRoutes],
  );
  const mapOpgwCableSections = useMemo(
    () => {
      if (isolatedOpgwSectionId) return visibleOpgwCableSections.filter((section) => section.properties.cableSectionId === isolatedOpgwSectionId);
      if (isolatedOpgwRouteId) return visibleOpgwCableSections.filter((section) => section.properties.opgwRouteId === isolatedOpgwRouteId);
      return visibleOpgwCableSections;
    },
    [isolatedOpgwRouteId, isolatedOpgwSectionId, visibleOpgwCableSections],
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
      fiberStrandCount: fiberStrands.length,
      availableStrandCount: opgwPlanningMetrics.availableStrands,
      fiberAssignmentCount: visibleFiberAssignments.length,
      criticalRidingCircuitCount: opgwPlanningMetrics.criticalRidingCircuits,
      outageImpactCount: opgwPlanningMetrics.outageImpactCount,
      openOpgwWorkOrderCount: opgwPlanningMetrics.openWorkOrders,
      spanInspectionIssueCount: opgwPlanningMetrics.spanInspectionIssues,
      nodeCount: visibleNodes.length,
      transmissionLineCount: visibleTransmissionLines.length,
      workOrderLocationCount: availableWorkOrderIds.length,
    }),
    [fiberStrands.length, layerFilteredFccMicrowaveLinks.length, layerFilteredFccUtilityTowers.length, layerFilteredPublicSubstations.length, layerFilteredPublicTransmissionLines.length, layerFilteredSpliceClosures.length, layerFilteredTransmissionStructures.length, opgwPlanningMetrics.assumedRouteCount, opgwPlanningMetrics.availableStrands, opgwPlanningMetrics.criticalRidingCircuits, opgwPlanningMetrics.openWorkOrders, opgwPlanningMetrics.outageImpactCount, opgwPlanningMetrics.plannedRouteCount, opgwPlanningMetrics.spanInspectionIssues, opgwPlanningMetrics.verifiedRouteCount, streetLayers, visibleFccMicrowaveLinks.length, visibleFccUtilityTowers.length, visibleFiberAssignments.length, visibleNodes.length, visibleOpgwCableSections.length, visibleOpgwCables.length, visibleOpgwRoutes.length, visibleOpgwSpanSegments.length, visibleOpgwSplicePoints.length, visiblePatchPanels.length, visiblePublicSubstations.length, visiblePublicTransmissionLines.length, visibleSpliceClosures.length, visibleSyntheticSubstations.length, visibleTransmissionLines.length, visibleTransmissionStructures.length],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(visibleTransmissionMaps, visibleSubstations, visibleNodes, visibleTransmissionLines, visiblePublicTransmissionLines, visiblePublicSubstations, visibleFccUtilityTowers, visibleFccMicrowaveLinks, visibleSyntheticSubstations, visibleTransmissionStructures, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwCableSections, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visibleSpliceClosures, visibleFiberAssignments, visiblePatchPanels),
    [visibleFccMicrowaveLinks, visibleFccUtilityTowers, visibleFiberAssignments, visibleNodes, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visiblePatchPanels, visiblePublicSubstations, visiblePublicTransmissionLines, visibleSpliceClosures, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines, visibleTransmissionMaps, visibleTransmissionStructures],
  );
  const ownerOptions = useMemo(
    () => buildOwnerOptions(visiblePublicSubstations, visiblePublicTransmissionLines, visibleFccUtilityTowers, visibleFccMicrowaveLinks),
    [visibleFccMicrowaveLinks, visibleFccUtilityTowers, visiblePublicSubstations, visiblePublicTransmissionLines],
  );
  const rawSearchResults = useMemo(
    () => buildSearchResults(visibleSubstations, visibleNodes, visibleTransmissionLines, layerFilteredPublicTransmissionLines, layerFilteredPublicSubstations, layerFilteredFccUtilityTowers, layerFilteredFccMicrowaveLinks, visibleSyntheticSubstations, layerFilteredTransmissionStructures, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwCableSections, visibleOpgwSpanSegments, visibleOpgwSplicePoints, layerFilteredSpliceClosures, visibleFiberAssignments, visiblePatchPanels, search),
    [layerFilteredFccMicrowaveLinks, layerFilteredFccUtilityTowers, layerFilteredPublicSubstations, layerFilteredPublicTransmissionLines, layerFilteredSpliceClosures, layerFilteredTransmissionStructures, search, visibleFiberAssignments, visibleNodes, visibleOpgwCableSections, visibleOpgwCables, visibleOpgwRoutes, visibleOpgwSpanSegments, visibleOpgwSplicePoints, visiblePatchPanels, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines],
  );
  const layerScopedSearchResults = useMemo(
    () => rawSearchResults.filter((selection) => matchesSearchLayer(selection, searchLayerFilter)),
    [rawSearchResults, searchLayerFilter],
  );
  const mapSearchResults = useMemo(
    () => search.trim() ? layerScopedSearchResults.filter(isDashboardMapSearchResult).slice(0, 8) : [],
    [layerScopedSearchResults, search],
  );
  const searchResults = useMemo(
    () => layerScopedSearchResults
      .filter((selection) => matchesDashboardFilters(selection, assetTypeFilter, statusFilter, regionFilter, visibilityFilter, ownerFilter))
      .slice(0, 12),
    [assetTypeFilter, layerScopedSearchResults, ownerFilter, regionFilter, statusFilter, visibilityFilter],
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
    setStreetLayers((current) => ({ ...current, [layer]: enabled }));
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
    setSelectedAsset(selection);
    setFocusRequest({ selection, sequence: Date.now() });
    setStreetLayers((current) => isolatedOpgwLayerState(current, "opgwRoutes"));
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing only OPGW transmission line ${route.properties.transmissionLineId}.`);
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
    setSelectedAsset(selection);
    setFocusRequest({ selection, sequence: Date.now() });
    setStreetLayers((current) => isolatedOpgwLayerState(current, "opgwCableSections"));
    setRightMode("layers");
    setRightCollapsed(false);
    showToast(`Showing only cable section ${section.properties.cableSectionId}.`);
  }

  function clearOpgwLayerIsolation() {
    setIsolatedOpgwRouteId(null);
    setIsolatedOpgwSectionId(null);
    setStreetLayers((current) => ({ ...current, opgwRoutes: true, opgwCableSections: true }));
    showToast("OPGW route visibility filter cleared.");
  }

  function handleOperatingModeChange(nextMode: DashboardOperatingMode) {
    setOperatingMode(nextMode);
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

  function handleTransmissionLineOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleTransmissionLineOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, publicTransmissionLines: true }));
    }
  }

  function handleAllTransmissionLineOwnersChange(enabled: boolean) {
    setVisibleTransmissionLineOwners(Object.fromEntries(transmissionLineOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, publicTransmissionLines: true }));
    }
  }

  function handleSubstationOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleSubstationOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, publicSubstations: true }));
    }
  }

  function handleAllSubstationOwnersChange(enabled: boolean) {
    setVisibleSubstationOwners(Object.fromEntries(substationOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, publicSubstations: true }));
    }
  }

  function handleFccTowerOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleFccTowerOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, fccUtilityTowers: true }));
    }
  }

  function handleAllFccTowerOwnersChange(enabled: boolean) {
    setVisibleFccTowerOwners(Object.fromEntries(fccTowerOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, fccUtilityTowers: true }));
    }
  }

  function handleFccLinkOwnerLayerChange(owner: string, enabled: boolean) {
    setVisibleFccLinkOwners((current) => ({ ...current, [owner]: enabled }));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function handleAllFccLinkOwnersChange(enabled: boolean) {
    setVisibleFccLinkOwners(Object.fromEntries(fccLinkOwnerCounts.map(({ owner }) => [owner, enabled])));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function handleFccFrequencyBandChange(frequencyBand: string, enabled: boolean) {
    setVisibleFccFrequencyBands((current) => ({ ...current, [frequencyBand]: enabled }));
    if (enabled) {
      setStreetLayers((current) => ({ ...current, fccMicrowaveLinks: true }));
    }
  }

  function handleAllFccFrequencyBandsChange(enabled: boolean) {
    setVisibleFccFrequencyBands(Object.fromEntries(fccFrequencyBandCounts.map(({ frequencyBand }) => [frequencyBand, enabled])));
    if (enabled) {
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
        opgwSplicePoints={visibleOpgwSplicePoints}
        spliceClosures={layerFilteredSpliceClosures}
        fiberSplices={fiberSplices}
        fiberStrands={fiberStrands}
        fiberAssignments={visibleFiberAssignments}
        syntheticServices={syntheticServices}
        patchPanels={visiblePatchPanels}
        planningRegions={visiblePlanningRegions}
        layers={streetLayers}
        activeTool={activeTool}
        placementHint={placementHint}
        command={mapCommand}
        focusRequest={focusRequest}
        onMapClick={handleMapClick}
        onSelect={handleMapSelect}
        onStatusChange={handleMapStatusChange}
      />

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
        </div>
        <div className="dashboard-map-global-search-wrap">
          <div className="dashboard-map-global-search-shell">
            <label className="dashboard-map-layer-select">
              <span>Layer</span>
              <select value={searchLayerFilter} onChange={(event) => setSearchLayerFilter(event.currentTarget.value as DashboardSearchLayer)}>
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
      </div>

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
              <button type="button" className={rightMode === "sources" ? "active" : ""} onClick={() => setRightMode("sources")}><TableProperties size={14} />Sources</button>
              <button type="button" className={rightMode === "details" ? "active" : ""} onClick={() => setRightMode("details")}><SlidersHorizontal size={14} />Details</button>
              <button type="button" className={rightMode === "splices" ? "active" : ""} onClick={() => setRightMode("splices")}><Cable size={14} />Splices</button>
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
                  onSearchLayerChange={(value) => setSearchLayerFilter(value as DashboardSearchLayer)}
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
                    availableStrandCount={opgwPlanningMetrics.availableStrands}
                    criticalRidingCircuitCount={opgwPlanningMetrics.criticalRidingCircuits}
                    outageImpactCount={opgwPlanningMetrics.outageImpactCount}
                    openOpgwWorkOrderCount={opgwPlanningMetrics.openWorkOrders}
                    spanInspectionIssueCount={opgwPlanningMetrics.spanInspectionIssues}
                    opgwRoutes={visibleOpgwRoutes}
                    opgwCableSections={visibleOpgwCableSections}
                    focusedOpgwRouteId={activeIsolatedOpgwRouteId}
                    focusedOpgwSectionId={isolatedOpgwSectionId || undefined}
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
              {rightMode === "sources" ? <DashboardDataSourcesPanel /> : null}
              {rightMode === "details" ? <LinkedAssetDetailPanel selection={selectedAsset} onClose={handleCloseAssetDetail} /> : null}
              {rightMode === "strands" ? <FiberStrandTable strands={fiberStrands} assignments={visibleFiberAssignments} opgwCables={visibleOpgwCables} onUpdateStrands={updateFiberStrands} /> : null}
              {rightMode === "splices" ? <SpliceMatrix closures={visibleSpliceClosures} splices={fiberSplices} selectedAsset={selectedAsset} onAddSplice={addSyntheticSplice} onDeleteSplice={deleteSyntheticSplice} /> : null}
              {rightMode === "assignments" ? <FiberAssignmentPlanner assignments={visibleFiberAssignments} opgwCables={visibleOpgwCables} structures={visibleTransmissionStructures} strands={fiberStrands} onCreateAssignment={createSyntheticFiberAssignment} /> : null}
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

function formatFilterOption(value: string) {
  return value === "all" ? "All" : value;
}

function layerStateForOperatingMode(mode: DashboardOperatingMode, current: Record<StreetMapLayerKey, boolean>) {
  if (mode === "in_service") {
    return {
      ...current,
      publicTransmissionLines: true,
      publicSubstations: true,
      fccUtilityTowers: true,
      fccMicrowaveLinks: true,
      syntheticSubstations: false,
      transmissionStructures: true,
      syntheticOpgwCables: true,
      assumedOpgwRoutes: false,
      plannedOpgwFiber: false,
      verifiedOpgwFiber: true,
      opgwRoutes: true,
      opgwCableSections: true,
      opgwSpanSegments: false,
      opgwSplicePoints: false,
      existingFiberSplices: true,
      proposedFiberSplices: false,
      compareSpliceLayers: false,
      spliceClosures: true,
      patchPanels: true,
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
    fccUtilityTowers: true,
    fccMicrowaveLinks: true,
    transmissionStructures: true,
    syntheticSubstations: true,
    syntheticOpgwCables: true,
    assumedOpgwRoutes: true,
    plannedOpgwFiber: true,
    verifiedOpgwFiber: true,
    opgwRoutes: true,
    opgwCableSections: true,
    opgwSpanSegments: true,
    opgwSplicePoints: true,
    existingFiberSplices: true,
    proposedFiberSplices: true,
    compareSpliceLayers: false,
    spliceClosures: true,
    patchPanels: true,
    fiberAssignments: true,
    availableStrandCapacity: true,
    criticalRidingCircuits: true,
    opgwOutageImpact: true,
    opgwOpenWorkOrders: true,
    opgwSpanInspectionIssues: true,
  };
}

function isolatedOpgwLayerState(current: Record<StreetMapLayerKey, boolean>, focusedLayer: "opgwRoutes" | "opgwCableSections") {
  const next = { ...current };
  for (const key of Object.keys(next) as StreetMapLayerKey[]) {
    next[key] = false;
  }
  next[focusedLayer] = true;
  return next;
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
          <span>No-account synthetic planning modules</span>
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

function LayerSummaryDigest({ layerSummaries, compact = false }: { layerSummaries: DashboardLayerSummary[]; compact?: boolean }) {
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
          <strong>Layer information</strong>
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
          <span>{publicOnly ? "Public ISO-NE reference mode" : "No-account synthetic planning workspace"}</span>
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
  onUpdateStrands,
}: {
  strands: FiberStrand[];
  assignments: FiberAssignment[];
  opgwCables: OpgwCableFeature[];
  onUpdateStrands: (cableId: string, strandNumbers: number[], status: FiberStrand["status"], assignmentId?: string) => void;
}) {
  const [cableId, setCableId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const effectiveCableId = cableId || opgwCables[0]?.properties.id || "";
  const cable = opgwCables.find((item) => item.properties.id === effectiveCableId);
  const assignmentById = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment])), [assignments]);
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
            </tr>
          </thead>
          <tbody>
            {rows.map((strand) => {
              const assignment = strand.assignmentId ? assignmentById.get(strand.assignmentId) : undefined;
              return (
                <tr className={selected.includes(strand.strandNumber) ? "selected" : ""} key={strand.id} onClick={() => toggleStrand(strand.strandNumber)}>
                  <td>{strand.strandNumber}</td>
                  <td>{strand.tubeNumber || "-"}</td>
                  <td>{strand.colorCode || "-"}</td>
                  <td><span className={`fiber-status ${strand.status}`}>{strand.status}</span></td>
                  <td>{assignment?.assignmentName || strand.assignmentId || "-"}</td>
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
  fiberStrandCount,
  availableStrandCount,
  fiberAssignmentCount,
  criticalRidingCircuitCount,
  outageImpactCount,
  openOpgwWorkOrderCount,
  spanInspectionIssueCount,
  nodeCount,
  transmissionLineCount,
  workOrderLocationCount,
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
  fiberStrandCount: number;
  availableStrandCount: number;
  fiberAssignmentCount: number;
  criticalRidingCircuitCount: number;
  outageImpactCount: number;
  openOpgwWorkOrderCount: number;
  spanInspectionIssueCount: number;
  nodeCount: number;
  transmissionLineCount: number;
  workOrderLocationCount: number;
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
    layer("fiberStrandsLayer", "Fiber strands", "Synthetic OPGW Fiber", fiberStrandCount, fiberStrandCount, "/fiber-strand-table", "Synthetic strand records generated from OPGW fiber counts", "Synthetic/demo strand inventory only."),
    layer("availableStrandCapacity", "Available strand capacity", "Analysis overlays", availableStrandCount, availableStrandCount, "/fiber-strand-table", "Capacity overlay calculated from synthetic strand statuses", "Capacity is demo planning data only."),
    layer("fiberAssignments", "Fiber assignments", "Planning assets", fiberAssignmentCount, fiberAssignmentCount, "/fiber-assignments", "Synthetic service-to-strand assignment model", "Synthetic/demo assignments only."),
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
    layer("distributionFiberRoutes", "Distribution fiber routes", "Planning assets", fiberAssignmentCount, fiberAssignmentCount, "/distribution-fiber", "Synthetic distribution fiber planning routes", "Synthetic/demo fiber routes only."),
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
  panels: PatchPanel[],
  query: string,
): StreetMapSelection[] {
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
    ...panels.map((record) => ({ kind: "patch_panel" as const, id: record.id, label: record.name, record })),
    ...substations.map((record) => ({ kind: "substation" as const, id: record.id, label: record.name, record })),
    ...nodes.map((record) => ({ kind: "node" as const, id: record.id, label: record.name, record })),
    ...lines.map((record) => ({ kind: "transmission_line" as const, id: record.id, label: record.name, record })),
  ];
  const lowered = query.trim().toLowerCase();
  if (!lowered) return all;
  return all.filter((asset) => selectionSearchText(asset).toLowerCase().includes(lowered));
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
    || selection.kind === "patch_panel";
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
  if (layer === "all") return true;
  const option = searchLayerOptions.find((item) => item.value === layer);
  return option ? option.kinds.includes(selection.kind) : true;
}

function searchLayerLabel(layer: string) {
  return searchLayerOptions.find((option) => option.value === layer)?.label || "All searchable layers";
}

function selectionLayerLabel(selection: StreetMapSelection) {
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
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "opgw_route" || selection.kind === "opgw_cable_section" || selection.kind === "opgw_span_segment" || selection.kind === "opgw_splice_point" || selection.kind === "splice_closure" || selection.kind === "fiber_assignment" || selection.kind === "patch_panel") return "MA";
  const record = selection.record as { state?: string };
  return record.state || "MA";
}

function selectionVisibility(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return "public";
  if (selection.kind === "public_substation") return "public";
  if (selection.kind === "fcc_utility_tower" || selection.kind === "fcc_microwave_link") return "public";
  if (selection.kind === "synthetic_substation") return selection.record.properties.visibility;
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "opgw_route" || selection.kind === "opgw_cable_section" || selection.kind === "opgw_span_segment" || selection.kind === "opgw_splice_point" || selection.kind === "splice_closure" || selection.kind === "fiber_assignment" || selection.kind === "patch_panel") return "synthetic-demo";
  const record = selection.record as { visibility?: string };
  return record.visibility || "private";
}

function selectionUtilityOwner(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return publicTransmissionLineOwner(selection.record.properties);
  if (selection.kind === "public_substation") return selection.record.properties.utilityOwner;
  if (selection.kind === "fcc_utility_tower" || selection.kind === "fcc_microwave_link") return selection.record.properties.utilityOwner;
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
    distributionFiberRoutes: false,
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
