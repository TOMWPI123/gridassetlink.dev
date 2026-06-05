"use client";

import { AlertTriangle, Cable, Cpu, Filter, Gauge, Layers, LocateFixed, MapPin, Maximize2, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, RadioTower, Route, Search, ShieldCheck, SlidersHorizontal, Workflow, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/api";
import { isoNeDiagramAnnotations } from "@/data/mapAnnotations";
import { seedMapNodes } from "@/data/nodeParameters";
import { seedEditableSubstations } from "@/data/substations";
import { seedPlanningRegions, seedTransmissionLines } from "@/data/transmissionLines";
import { seedTransmissionMaps } from "@/data/transmissionMaps";
import { DashboardMapModeToggle } from "@/components/map/DashboardMapModeToggle";
import { IsoNeDiagramMap } from "@/components/map/IsoNeDiagramMap";
import { LinkedAssetDetailPanel } from "@/components/map/LinkedAssetDetailPanel";
import { MapLayerControlPanel } from "@/components/map/MapLayerControlPanel";
import { MissingMapLocationPanel, type MissingMapLocation } from "@/components/map/MissingMapLocationPanel";
import { NodeParameterEditor } from "@/components/map/NodeParameterEditor";
import { StreetLevelAssetMap, type FocusRequest, type MapCommand, type StreetMapSelection } from "@/components/map/StreetLevelAssetMap";
import { SubstationEditor } from "@/components/map/SubstationEditor";
import { TransmissionMapEditor } from "@/components/map/TransmissionMapEditor";
import { TransmissionMapSelector } from "@/components/map/TransmissionMapSelector";
import type { Coordinate, DashboardMapMode, MapDrawingTool, MapNode, NodeParameters, PublicTransmissionLineCollection, PublicTransmissionLineFeature, StreetMapLayerKey, Substation, SyntheticSubstationCollection, SyntheticSubstationFeature, TransmissionLine, TransmissionMap } from "@/lib/types/assets";

const initialStreetLayers: Record<StreetMapLayerKey, boolean> = {
  publicTransmissionLines: true,
  syntheticSubstations: true,
  transmissionLines: true,
  substations: true,
  telecomNodes: true,
  selIconNodes: true,
  c3794Nodes: true,
  fiberRoutes: true,
  opgwRoutes: true,
  distributionFiberRoutes: true,
  circuitEndpoints: true,
  workOrderLocations: true,
  proposedChanges: true,
  missingLocationAssets: true,
  planningRegions: true,
  isoNeReferenceOverlays: true,
};

type MapStatus = "loading" | "active" | "error";
type RightDrawerMode = "summary" | "layers" | "details" | "editor";
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
  const [mode, setMode] = useState<DashboardMapMode>("street-level");
  const [transmissionMaps, setTransmissionMaps] = useState(seedTransmissionMaps);
  const [activeMapId, setActiveMapId] = useState(seedTransmissionMaps[1].id);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [substations, setSubstations] = useState(seedEditableSubstations);
  const [nodes, setNodes] = useState(seedMapNodes);
  const [transmissionLines] = useState(seedTransmissionLines);
  const [planningRegions] = useState(seedPlanningRegions);
  const [streetLayers, setStreetLayers] = useState(initialStreetLayers);
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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightMode, setRightMode] = useState<RightDrawerMode>("summary");
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapStatusMessage, setMapStatusMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [publicTransmissionLines, setPublicTransmissionLines] = useState<PublicTransmissionLineFeature[]>([]);
  const [syntheticSubstations, setSyntheticSubstations] = useState<SyntheticSubstationFeature[]>([]);
  const [mapDataWarnings, setMapDataWarnings] = useState<{ publicLines?: string; syntheticSubstations?: string }>({});

  useEffect(() => {
    setIsAuthenticated(Boolean(getSession()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStaticMapData() {
      const warnings: { publicLines?: string; syntheticSubstations?: string } = {};
      const publicLines = await fetchGeoJson<PublicTransmissionLineCollection>("/data/iso-ne-public-transmission-lines.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.publicLines = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as PublicTransmissionLineFeature[];
        });
      const synthetic = await fetchGeoJson<SyntheticSubstationCollection>("/data/iso-ne-synthetic-substations.geojson")
        .then((collection) => collection.features || [])
        .catch((error) => {
          warnings.syntheticSubstations = `Data not loaded: ${error instanceof Error ? error.message : String(error)}`;
          return [] as SyntheticSubstationFeature[];
        });
      if (cancelled) return;
      setPublicTransmissionLines(publicLines);
      setSyntheticSubstations(synthetic);
      setMapDataWarnings(warnings);
    }
    void loadStaticMapData();
    return () => {
      cancelled = true;
    };
  }, []);

  const publicOnly = !isAuthenticated;
  const visibleTransmissionMaps = useMemo(
    () => publicOnly ? transmissionMaps.filter((map) => map.visibility === "public") : transmissionMaps,
    [publicOnly, transmissionMaps],
  );
  const activeMap = visibleTransmissionMaps.find((map) => map.id === activeMapId) || visibleTransmissionMaps[0] || transmissionMaps[0];

  const visibleSubstations = useMemo(
    () => filterSubstationsForScope(substations, publicOnly),
    [publicOnly, substations],
  );
  const visibleNodes = useMemo(
    () => filterNodesForScope(nodes, publicOnly),
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
    () => publicOnly ? [] : syntheticSubstations.filter((feature) => feature.properties.synthetic && feature.properties.public === false),
    [publicOnly, syntheticSubstations],
  );
  const visiblePlanningRegions = useMemo(
    () => publicOnly ? [] : planningRegions,
    [planningRegions, publicOnly],
  );
  const effectiveStreetLayers = useMemo(
    () => publicOnly ? publicLayerSet(streetLayers) : streetLayers,
    [publicOnly, streetLayers],
  );

  const summaryCards = useMemo(
    () => buildSummaryCards(visibleTransmissionMaps, visibleSubstations, visibleNodes, visibleTransmissionLines, visiblePublicTransmissionLines, visibleSyntheticSubstations, mapStatus),
    [mapStatus, visibleNodes, visiblePublicTransmissionLines, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines, visibleTransmissionMaps],
  );
  const searchResults = useMemo(
    () => buildSearchResults(visibleSubstations, visibleNodes, visibleTransmissionLines, visiblePublicTransmissionLines, visibleSyntheticSubstations, search)
      .filter((selection) => matchesDashboardFilters(selection, assetTypeFilter, statusFilter, regionFilter, visibilityFilter))
      .slice(0, 12),
    [assetTypeFilter, regionFilter, search, statusFilter, visibilityFilter, visibleNodes, visiblePublicTransmissionLines, visibleSubstations, visibleSyntheticSubstations, visibleTransmissionLines],
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
    if (publicOnly) {
      showToast("Sign in to create private planning overlays.");
      return;
    }
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

  function handleDiagramAnnotation(annotationId: string) {
    const annotation = isoNeDiagramAnnotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    const substation = visibleSubstations.find((item) => item.id === annotation.entityId);
    const node = visibleNodes.find((item) => item.id === annotation.entityId);
    const line = visibleTransmissionLines.find((item) => item.id === annotation.entityId);
    if (substation) focusSelection({ kind: "substation", id: substation.id, label: substation.name, record: substation });
    else if (node) focusSelection({ kind: "node", id: node.id, label: node.name, record: node });
    else if (line) focusSelection({ kind: "transmission_line", id: line.id, label: line.name, record: line });
    else showToast(`Selected public reference annotation "${annotation.label}".`);
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
    if (publicOnly) {
      showToast("Sign in to add private planning assets.");
      return;
    }
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

  const placementHint = placementTarget
    ? `Place ${placementTarget.label} with street-level lat/lon. Do not use fake coordinates.`
    : addAssetKind
      ? `Add Asset: ${addAssetLabel(addAssetKind)}. Click the ISO-NE map to place a private proposed record.`
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
          <span>ISO New England planning map</span>
        </div>
        <label className="dashboard-map-global-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets, circuits, work orders, substations" />
        </label>
        <div className={`dashboard-map-status-pill ${mapStatus}`}>
          <RadioTower size={15} />
          <span>{mapStatus === "active" ? "MapLibre active" : mapStatus === "error" ? "MapLibre error" : "MapLibre loading"}</span>
        </div>
      </div>

      <div className="dashboard-top-right-toolbar" aria-label="Map toolbar">
        <button type="button" onClick={() => issueMapCommand("resetIsoNe")}><LocateFixed size={15} />Reset to ISO-NE</button>
        <button type="button" onClick={() => issueMapCommand("fitActiveMap")}><Maximize2 size={15} />Fit active map</button>
        <button type="button" onClick={() => setMode(mode === "iso-ne-diagram" ? "street-level" : "iso-ne-diagram")}><Network size={15} />Open ISO-NE Diagram</button>
        <button type="button" onClick={() => openEditorDrawer()}><Plus size={15} />Add Asset</button>
      </div>

      <aside className={`dashboard-left-filter-panel ${leftCollapsed ? "collapsed" : ""}`} aria-label="Map filters and results">
        <button className="dashboard-panel-collapse" type="button" onClick={() => setLeftCollapsed((current) => !current)}>
          {leftCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        {!leftCollapsed ? (
          <>
            <div className="dashboard-panel-heading">
              <Filter size={16} />
              <div>
                <strong>Filters</strong>
                <span>{publicOnly ? "Public reference only" : "Private planning overlays"}</span>
              </div>
            </div>
            <label className="dashboard-panel-search">
              <Search size={14} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search map records" />
            </label>
            <div className="dashboard-filter-grid">
              <FilterSelect label="Asset Types" value={assetTypeFilter} onChange={setAssetTypeFilter} options={["all", "public_transmission_line", "synthetic_substation", "substation", "node", "transmission_line", "work_order"]} />
              <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={["all", "existing", "planned", "proposed", "open"]} />
              <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={["all", "MA", "RI", "CT", "NH", "VT", "ME"]} />
              <FilterSelect label="Criticality" value="all" onChange={() => undefined} options={["all", "critical", "high", "normal"]} />
              <FilterSelect label="Manufacturer" value="all" onChange={() => undefined} options={["all", "SEL", "Cisco", "Nokia", "Other"]} />
              <FilterSelect label="Lifecycle" value="all" onChange={() => undefined} options={["all", "Existing", "Proposed", "Out of Service"]} />
              <FilterSelect label="Phase Type" value="all" onChange={() => undefined} options={["all", "ABC", "A", "B", "C"]} />
              <FilterSelect label="Circuit Type" value="all" onChange={() => undefined} options={["all", "C37.94", "SCADA", "Ethernet", "DS1"]} />
              <FilterSelect label="Visibility" value={visibilityFilter} onChange={setVisibilityFilter} options={["all", "public", "team", "private"]} />
            </div>
            <div className="dashboard-results-heading">
              <strong>Results</strong>
              <span>{searchResults.length}</span>
            </div>
            <div className="dashboard-map-results-list">
              {searchResults.length ? searchResults.map((result) => (
                <button type="button" key={`${result.kind}-${result.id}`} onClick={() => focusSelection(result)}>
                  <strong>{result.label}</strong>
                  <span>{formatSelectionKind(result.kind)} / {selectionStatus(result)}</span>
                </button>
              )) : <p>{publicOnly ? "Sign in to view private planning records." : "No matching map records."}</p>}
            </div>
          </>
        ) : null}
      </aside>

      <aside className={`dashboard-right-floating-drawer ${rightCollapsed ? "collapsed" : ""}`} aria-label="Dashboard details drawer">
        <button className="dashboard-panel-collapse right" type="button" onClick={() => setRightCollapsed((current) => !current)}>
          {rightCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </button>
        {!rightCollapsed ? (
          <>
            <div className="dashboard-drawer-tabs">
              <button type="button" className={rightMode === "summary" ? "active" : ""} onClick={() => setRightMode("summary")}><Gauge size={14} />Summary</button>
              <button type="button" className={rightMode === "layers" ? "active" : ""} onClick={() => setRightMode("layers")}><Layers size={14} />Layers</button>
              <button type="button" className={rightMode === "details" ? "active" : ""} onClick={() => setRightMode("details")}><SlidersHorizontal size={14} />Details</button>
              <button type="button" className={rightMode === "editor" ? "active" : ""} onClick={() => setRightMode("editor")}><Plus size={14} />Add</button>
            </div>
            <div className="dashboard-drawer-body">
              {rightMode === "summary" ? <SummaryDrawer cards={summaryCards} publicOnly={publicOnly} mapStatusMessage={mapStatusMessage} /> : null}
              {rightMode === "layers" ? (
                <div className="dashboard-drawer-stack">
                  <MapLayerControlPanel
                    layers={effectiveStreetLayers}
                    activeTool={activeTool}
                    publicLineCount={visiblePublicTransmissionLines.length}
                    syntheticSubstationCount={visibleSyntheticSubstations.length}
                    dataWarnings={mapDataWarnings}
                    onToggleLayer={(layer) => setStreetLayers((current) => ({ ...current, [layer]: !current[layer] }))}
                    onToolChange={(tool) => {
                      if (publicOnly) {
                        showToast("Sign in to edit private map geometry.");
                        return;
                      }
                      setActiveTool(tool);
                      if (tool !== "place_missing") setPlacementTarget(null);
                    }}
                  />
                  {effectiveStreetLayers.missingLocationAssets ? (
                    <MissingMapLocationPanel
                      substations={substations}
                      nodes={nodes}
                      placementTargetId={placementTarget?.id}
                      onPlaceMissing={(item) => {
                        if (publicOnly) {
                          showToast("Sign in to place missing private assets.");
                          return;
                        }
                        setPlacementTarget(item);
                        setActiveTool("place_missing");
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
              {rightMode === "details" ? <LinkedAssetDetailPanel selection={selectedAsset} /> : null}
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

      <div className="dashboard-bottom-left-modes">
        <DashboardMapModeToggle value={mode} onChange={setMode} />
      </div>

      {mode === "iso-ne-diagram" ? (
        <div className="dashboard-reference-overlay">
          <button className="dashboard-reference-close" type="button" onClick={() => setMode("street-level")}><X size={15} /></button>
          <IsoNeDiagramMap annotations={isoNeDiagramAnnotations} onSelectAnnotation={(annotation) => handleDiagramAnnotation(annotation.id)} />
        </div>
      ) : null}

      {mode === "hybrid" ? (
        <div className="dashboard-mini-reference-card">
          <IsoNeDiagramMap annotations={isoNeDiagramAnnotations} onSelectAnnotation={(annotation) => handleDiagramAnnotation(annotation.id)} />
        </div>
      ) : null}

      <div className="dashboard-active-map-floating">
        <TransmissionMapSelector maps={visibleTransmissionMaps} activeMapId={activeMap.id} onChange={setActiveMapId} onCreateNew={() => {
          if (publicOnly) showToast("Sign in to create private transmission maps.");
          else {
            setShowMapEditor(true);
            openEditorDrawer();
          }
        }} />
      </div>

      <div className="dashboard-security-note map-overlay-note">
        <AlertTriangle size={15} />
        <span>{publicOnly ? "Public view: only public ISO-NE reference context is shown. Private telecom routes, protection channels, fiber strands, and SEL ICON service paths are hidden." : "Authenticated planning view: user-created layers default to private. Do not publish real telecom paths, protection settings, fiber strand routes, or CEII-restricted data."}</span>
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

function SummaryDrawer({ cards, publicOnly, mapStatusMessage }: { cards: ReturnType<typeof buildSummaryCards>; publicOnly: boolean; mapStatusMessage: string }) {
  return (
    <section className="dashboard-floating-summary">
      <div className="dashboard-panel-heading">
        <Gauge size={16} />
        <div>
          <strong>Dashboard summary</strong>
          <span>{publicOnly ? "Public ISO-NE reference mode" : "Authenticated planning workspace"}</span>
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
          <span>{publicOnly ? "Sign in required for private overlays" : "Choose a type, then click the map"}</span>
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
  mapStatus: MapStatus,
) {
  return [
    { label: "Transmission Maps", value: maps.length, note: "public + private", Icon: Network },
    { label: "Public Lines", value: publicLines.length, note: "read-only HIFLD reference", Icon: Route },
    { label: "Synthetic Substations", value: syntheticSubstations.length, note: "demo/private planning", Icon: MapPin },
    { label: "Substations", value: substations.length, note: `${substations.filter((item) => item.latitude === undefined).length} missing location`, Icon: MapPin },
    { label: "Transmission Lines", value: lines.length, note: "ISO-NE scoped", Icon: Route },
    { label: "SEL ICON Nodes", value: nodes.filter((node) => node.nodeType === "sel_icon_node").length, note: "parameterized", Icon: Cpu },
    { label: "Circuit Endpoints", value: nodes.filter((node) => node.nodeType === "circuit_endpoint").length, note: "C37.94/telecom", Icon: Workflow },
    { label: "Fiber Nodes", value: nodes.filter((node) => node.nodeType === "fiber_node").length, note: "splice/patch context", Icon: Cable },
    { label: "Private Layers", value: nodes.filter((node) => node.visibility === "private").length + substations.filter((item) => item.visibility === "private").length, note: "hidden publicly", Icon: ShieldCheck },
    { label: "MapLibre", value: mapStatus === "active" ? "Active" : mapStatus === "error" ? "Error" : "Loading", note: mapStatus === "active" ? "MapLibre active" : mapStatus === "error" ? "clear failure state" : "waiting for load", Icon: RadioTower },
  ];
}

function buildSearchResults(
  substations: Substation[],
  nodes: MapNode[],
  lines: TransmissionLine[],
  publicLines: PublicTransmissionLineFeature[],
  syntheticSubstations: SyntheticSubstationFeature[],
  query: string,
): StreetMapSelection[] {
  const all: StreetMapSelection[] = [
    ...publicLines.map((record) => ({ kind: "public_transmission_line" as const, id: record.properties.id, label: publicLineLabel(record), record })),
    ...syntheticSubstations.map((record) => ({ kind: "synthetic_substation" as const, id: record.properties.id, label: record.properties.name, record })),
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
  const record = selection.record as { status?: string };
  return record.status || "open";
}

function selectionRegion(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return selection.record.properties.states[0] || "MA";
  if (selection.kind === "synthetic_substation") return selection.record.properties.state;
  const record = selection.record as { state?: string };
  return record.state || "MA";
}

function selectionVisibility(selection: StreetMapSelection) {
  if (selection.kind === "public_transmission_line") return "public";
  if (selection.kind === "synthetic_substation") return selection.record.properties.visibility;
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
