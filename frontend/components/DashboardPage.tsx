"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Cable, Filter, Gauge, Layers, LocateFixed, MapPin, Maximize2, Network, PanelRightClose, PanelRightOpen, Plus, RadioTower, Route, Search, SlidersHorizontal, TableProperties, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appNavGroups } from "@/components/navigation";
import { seedMapNodes } from "@/data/nodeParameters";
import { seedEditableSubstations } from "@/data/substations";
import { seedPlanningRegions, seedTransmissionLines } from "@/data/transmissionLines";
import { seedTransmissionMaps } from "@/data/transmissionMaps";
import { LinkedAssetDetailPanel } from "@/components/map/LinkedAssetDetailPanel";
import { MapLayerControlPanel } from "@/components/map/MapLayerControlPanel";
import { MissingMapLocationPanel, type MissingMapLocation } from "@/components/map/MissingMapLocationPanel";
import { NodeParameterEditor } from "@/components/map/NodeParameterEditor";
import { StreetLevelAssetMap, type FocusRequest, type MapCommand, type StreetMapSelection } from "@/components/map/StreetLevelAssetMap";
import { SubstationEditor } from "@/components/map/SubstationEditor";
import { TransmissionMapEditor } from "@/components/map/TransmissionMapEditor";
import type { Coordinate, DashboardMapMode, FiberAssignment, FiberSplice, FiberStrand, MapDrawingTool, MapNode, NodeParameters, OpgwCableFeature, PatchPanel, PublicTransmissionLineCollection, PublicTransmissionLineFeature, SpliceClosureFeature, StreetMapLayerKey, Substation, SyntheticSubstationFeature, TransmissionLine, TransmissionMap, TransmissionStructureFeature } from "@/lib/types/assets";

const initialStreetLayers: Record<StreetMapLayerKey, boolean> = {
  publicTransmissionLines: true,
  syntheticSubstations: false,
  transmissionStructures: false,
  syntheticOpgwCables: false,
  spliceClosures: false,
  fiberAssignments: false,
  patchPanels: false,
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

const hifldOnlyStreetLayers: Record<StreetMapLayerKey, boolean> = {
  ...initialStreetLayers,
  publicTransmissionLines: true,
};

type MapStatus = "loading" | "active" | "error";
type RightDrawerMode = "modules" | "summary" | "filters" | "layers" | "details" | "strands" | "splices" | "assignments" | "editor";
type AddAssetKind = "substation" | "transmission_line" | "telecom_node" | "sel_icon_node" | "fiber_node" | "circuit_endpoint" | "work_order" | "proposed_change";

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

export function DashboardPage() {
  const pathname = usePathname();
  const [mode, setMode] = useState<DashboardMapMode>("street-level");
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
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [rightMode, setRightMode] = useState<RightDrawerMode>("modules");
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapStatusMessage, setMapStatusMessage] = useState("");
  const [publicTransmissionLines, setPublicTransmissionLines] = useState<PublicTransmissionLineFeature[]>([]);
  const [syntheticSubstations, setSyntheticSubstations] = useState<SyntheticSubstationFeature[]>([]);
  const [transmissionStructures, setTransmissionStructures] = useState<TransmissionStructureFeature[]>([]);
  const [opgwCables, setOpgwCables] = useState<OpgwCableFeature[]>([]);
  const [spliceClosures, setSpliceClosures] = useState<SpliceClosureFeature[]>([]);
  const [fiberStrands, setFiberStrands] = useState<FiberStrand[]>([]);
  const [fiberSplices, setFiberSplices] = useState<FiberSplice[]>([]);
  const [patchPanels, setPatchPanels] = useState<PatchPanel[]>([]);
  const [fiberAssignments, setFiberAssignments] = useState<FiberAssignment[]>([]);
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
      if (cancelled) return;
      setPublicTransmissionLines(publicLines);
      setMapDataWarnings(warnings);
    }
    void loadStaticMapData();
    return () => {
      cancelled = true;
    };
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
  const effectiveStreetLayers = useMemo(
    () => hifldOnlyStreetLayers,
    [],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(visibleTransmissionMaps, visibleSubstations, visibleNodes, visibleTransmissionLines, visiblePublicTransmissionLines, visibleSyntheticSubstations, visibleTransmissionStructures, visibleOpgwCables, visibleSpliceClosures, visibleFiberAssignments, visiblePatchPanels, mapStatus),
    [mapStatus, visibleFiberAssignments, visibleNodes, visibleOpgwCables, visiblePatchPanels, visiblePublicTransmissionLines, visibleSpliceClosures, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines, visibleTransmissionMaps, visibleTransmissionStructures],
  );
  const searchResults = useMemo(
    () => buildSearchResults(visibleSubstations, visibleNodes, visibleTransmissionLines, visiblePublicTransmissionLines, visibleSyntheticSubstations, visibleTransmissionStructures, visibleOpgwCables, visibleSpliceClosures, visibleFiberAssignments, visiblePatchPanels, search)
      .filter((selection) => matchesDashboardFilters(selection, assetTypeFilter, statusFilter, regionFilter, visibilityFilter))
      .slice(0, 12),
    [assetTypeFilter, regionFilter, search, statusFilter, visibilityFilter, visibleFiberAssignments, visibleNodes, visibleOpgwCables, visiblePatchPanels, visiblePublicTransmissionLines, visibleSpliceClosures, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines, visibleTransmissionStructures],
  );

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
    setFocusRequest({ selection, sequence: Date.now() });
    setRightMode("details");
    setRightCollapsed(false);
  }

  function handleMapSelect(selection: StreetMapSelection) {
    setSelectedAsset(selection);
    setRightMode("details");
    setRightCollapsed(false);
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
        publicTransmissionLines={visiblePublicTransmissionLines}
        syntheticSubstations={visibleSyntheticSubstations}
        transmissionStructures={visibleTransmissionStructures}
        opgwCables={visibleOpgwCables}
        spliceClosures={visibleSpliceClosures}
        fiberAssignments={visibleFiberAssignments}
        patchPanels={visiblePatchPanels}
        planningRegions={visiblePlanningRegions}
        layers={effectiveStreetLayers}
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
          <span>HIFLD transmission-line map</span>
        </div>
        <label className="dashboard-map-global-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search HIFLD transmission lines" />
        </label>
        <div className={`dashboard-map-status-pill ${mapStatus}`}>
          <RadioTower size={15} />
          <span>{mapStatus === "active" ? "MapLibre active" : mapStatus === "error" ? "MapLibre error" : "MapLibre loading"}</span>
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
              <button type="button" className={rightMode === "details" ? "active" : ""} onClick={() => setRightMode("details")}><SlidersHorizontal size={14} />Details</button>
            </div>
            <div className="dashboard-drawer-body">
              {rightMode === "modules" ? <ModulesDrawer pathname={pathname} /> : null}
              {rightMode === "summary" ? <SummaryDrawer cards={summaryCards} publicOnly={publicOnly} mapStatusMessage={mapStatusMessage} /> : null}
              {rightMode === "filters" ? (
                <FiltersResultsDrawer
                  publicOnly={publicOnly}
                  search={search}
                  assetTypeFilter={assetTypeFilter}
                  statusFilter={statusFilter}
                  regionFilter={regionFilter}
                  visibilityFilter={visibilityFilter}
                  searchResults={searchResults}
                  onSearchChange={setSearch}
                  onAssetTypeChange={setAssetTypeFilter}
                  onStatusChange={setStatusFilter}
                  onRegionChange={setRegionFilter}
                  onVisibilityChange={setVisibilityFilter}
                  onSelectResult={focusSelection}
                />
              ) : null}
              {rightMode === "layers" ? (
                <div className="dashboard-drawer-stack">
                  <MapLayerControlPanel
                    layers={effectiveStreetLayers}
                    publicLineCount={visiblePublicTransmissionLines.length}
                    dataWarnings={mapDataWarnings}
                  />
                  {effectiveStreetLayers.missingLocationAssets ? (
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
              {rightMode === "details" ? <LinkedAssetDetailPanel selection={selectedAsset} /> : null}
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
        <span>Dashboard map shows public HIFLD transmission-line reference data only. Do not enter or infer CEII, SCADA, relay, protection, telecom, or private fiber-route data.</span>
      </div>
      {toast ? <div className="dashboard-map-toast">{toast}</div> : null}
    </main>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>{option === "all" ? "All" : option}</option>)}
      </select>
    </label>
  );
}

function ModulesDrawer({ pathname }: { pathname: string }) {
  return (
    <section className="dashboard-module-drawer" aria-label="Application modules">
      <div className="dashboard-panel-heading">
        <Network size={16} />
        <div>
          <strong>TelecomNE modules</strong>
          <span>No-account synthetic planning modules</span>
        </div>
      </div>
      <div className="dashboard-module-sections">
        {appNavGroups.map((group) => (
          <section className="dashboard-module-section" key={group.title}>
            <div className="dashboard-module-section-title">{group.title}</div>
            <div className="dashboard-module-link-grid">
              {group.items.map(([href, label, Icon]) => (
                <Link className={`dashboard-module-link ${isActiveModule(pathname, href) ? "active" : ""}`} href={href} key={href}>
                  <Icon size={15} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function FiltersResultsDrawer({
  publicOnly,
  search,
  assetTypeFilter,
  statusFilter,
  regionFilter,
  visibilityFilter,
  searchResults,
  onSearchChange,
  onAssetTypeChange,
  onStatusChange,
  onRegionChange,
  onVisibilityChange,
  onSelectResult,
}: {
  publicOnly: boolean;
  search: string;
  assetTypeFilter: string;
  statusFilter: string;
  regionFilter: string;
  visibilityFilter: string;
  searchResults: StreetMapSelection[];
  onSearchChange: (value: string) => void;
  onAssetTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onVisibilityChange: (value: string) => void;
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
        <FilterSelect label="Asset Types" value={assetTypeFilter} onChange={onAssetTypeChange} options={["all", "public_transmission_line", "transmission_structure", "opgw_cable", "splice_closure", "fiber_assignment", "patch_panel", "synthetic_substation", "substation", "node", "transmission_line", "work_order"]} />
        <FilterSelect label="Status" value={statusFilter} onChange={onStatusChange} options={["all", "existing", "planned", "proposed", "reserved", "assigned", "open"]} />
        <FilterSelect label="Region" value={regionFilter} onChange={onRegionChange} options={["all", "MA", "RI", "CT", "NH", "VT", "ME"]} />
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
            <span>{formatSelectionKind(result.kind)} / {selectionStatus(result)}</span>
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

function SummaryDrawer({ cards, publicOnly, mapStatusMessage }: { cards: ReturnType<typeof buildSummaryCards>; publicOnly: boolean; mapStatusMessage: string }) {
  return (
    <section className="dashboard-floating-summary">
      <div className="dashboard-panel-heading">
        <Gauge size={16} />
        <div>
          <strong>Dashboard summary</strong>
          <span>{publicOnly ? "Public ISO-NE reference mode" : "No-account synthetic planning workspace"}</span>
        </div>
      </div>
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

function buildSummaryCards(
  maps: TransmissionMap[],
  substations: Substation[],
  nodes: MapNode[],
  lines: TransmissionLine[],
  publicLines: PublicTransmissionLineFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  structures: TransmissionStructureFeature[],
  opgw: OpgwCableFeature[],
  closures: SpliceClosureFeature[],
  assignments: FiberAssignment[],
  panels: PatchPanel[],
  mapStatus: MapStatus,
) {
  const stateCount = new Set(publicLines.flatMap((line) => line.properties.states)).size;
  const voltageClassCount = new Set(publicLines.map((line) => line.properties.voltageClass || "unknown")).size;
  return [
    { label: "Transmission Maps", value: maps.length, note: "public HIFLD reference", Icon: Network },
    { label: "HIFLD Lines", value: publicLines.length, note: "read-only public reference", Icon: Route },
    { label: "States Covered", value: stateCount, note: "ISO New England states", Icon: MapPin },
    { label: "Voltage Classes", value: voltageClassCount, note: "HIFLD normalized classes", Icon: Gauge },
    { label: "MapLibre", value: mapStatus === "active" ? "Active" : mapStatus === "error" ? "Error" : "Loading", note: mapStatus === "active" ? "MapLibre active" : mapStatus === "error" ? "clear failure state" : "waiting for load", Icon: RadioTower },
  ];
}

function buildSearchResults(
  substations: Substation[],
  nodes: MapNode[],
  lines: TransmissionLine[],
  publicLines: PublicTransmissionLineFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  structures: TransmissionStructureFeature[],
  opgw: OpgwCableFeature[],
  closures: SpliceClosureFeature[],
  assignments: FiberAssignment[],
  panels: PatchPanel[],
  query: string,
): StreetMapSelection[] {
  const all: StreetMapSelection[] = [
    ...publicLines.map((record) => ({ kind: "public_transmission_line" as const, id: record.properties.id, label: publicLineLabel(record), record })),
    ...syntheticSubstations.map((record) => ({ kind: "synthetic_substation" as const, id: record.properties.id, label: record.properties.name, record })),
    ...structures.map((record) => ({ kind: "transmission_structure" as const, id: record.properties.id, label: record.properties.structureNumber, record })),
    ...opgw.map((record) => ({ kind: "opgw_cable" as const, id: record.properties.id, label: record.properties.cableName, record })),
    ...closures.map((record) => ({ kind: "splice_closure" as const, id: record.properties.id, label: record.properties.name, record })),
    ...assignments.map((record) => ({ kind: "fiber_assignment" as const, id: record.id, label: record.assignmentName, record })),
    ...panels.map((record) => ({ kind: "patch_panel" as const, id: record.id, label: record.name, record })),
    ...substations.map((record) => ({ kind: "substation" as const, id: record.id, label: record.name, record })),
    ...nodes.map((record) => ({ kind: "node" as const, id: record.id, label: record.name, record })),
    ...lines.map((record) => ({ kind: "transmission_line" as const, id: record.id, label: record.name, record })),
  ];
  const lowered = query.trim().toLowerCase();
  if (!lowered) return all;
  return all.filter((asset) => JSON.stringify(asset.record).toLowerCase().includes(lowered));
}

function publicLineLabel(record: PublicTransmissionLineFeature) {
  return record.properties.name ? `${record.properties.name} (${record.properties.id})` : record.properties.id;
}

function matchesDashboardFilters(selection: StreetMapSelection, assetType: string, status: string, region: string, visibility: string) {
  if (assetType !== "all" && selection.kind !== assetType) return false;
  if (status !== "all" && selectionStatus(selection) !== status) return false;
  if (region !== "all" && selectionRegion(selection) !== region) return false;
  if (visibility !== "all" && selectionVisibility(selection) !== visibility) return false;
  return true;
}

function selectionStatus(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return selection.record.properties.status || "unknown";
  if (selection.kind === "synthetic_substation") return selection.record.properties.status;
  if (selection.kind === "transmission_structure") return selection.record.properties.hasSplice ? "assigned" : selection.record.properties.hasOpgw ? "existing" : "planned";
  if (selection.kind === "opgw_cable") return selection.record.properties.status;
  if (selection.kind === "splice_closure") return selection.record.properties.status;
  if (selection.kind === "fiber_assignment") return selection.record.status;
  if (selection.kind === "patch_panel") return selection.record.ports.some((port) => port.status === "assigned") ? "assigned" : "planned";
  const record = selection.record as { status?: string };
  return record.status || "open";
}

function selectionRegion(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return selection.record.properties.states[0] || "MA";
  if (selection.kind === "synthetic_substation") return selection.record.properties.state;
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "splice_closure" || selection.kind === "fiber_assignment" || selection.kind === "patch_panel") return "MA";
  const record = selection.record as { state?: string };
  return record.state || "MA";
}

function selectionVisibility(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return "public";
  if (selection.kind === "synthetic_substation") return selection.record.properties.visibility;
  if (selection.kind === "transmission_structure" || selection.kind === "opgw_cable" || selection.kind === "splice_closure" || selection.kind === "fiber_assignment" || selection.kind === "patch_panel") return "synthetic-demo";
  const record = selection.record as { visibility?: string };
  return record.visibility || "private";
}

function formatSelectionKind(kind: StreetMapSelection["kind"]) {
  return kind.replaceAll("_", " ");
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
    syntheticSubstations: false,
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
