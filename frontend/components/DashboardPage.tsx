"use client";

import { AlertTriangle, Cable, Cpu, MapPin, Network, Plus, RadioTower, Route, ShieldCheck, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
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
import { StreetLevelAssetMap, type StreetMapSelection } from "@/components/map/StreetLevelAssetMap";
import { SubstationEditor } from "@/components/map/SubstationEditor";
import { TransmissionMapEditor } from "@/components/map/TransmissionMapEditor";
import { TransmissionMapSelector } from "@/components/map/TransmissionMapSelector";
import type { Coordinate, DashboardMapMode, MapDrawingTool, MapNode, NodeParameters, StreetMapLayerKey, Substation, TransmissionMap } from "@/lib/types/assets";

const initialStreetLayers: Record<StreetMapLayerKey, boolean> = {
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
  planningRegions: true,
  isoNeReferenceOverlays: true,
};

const availableDeviceIds = ["NODE-WBS-ICON", "NODE-AUB-ICON", "NODE-BOS-OTN", "NODE-RI-RTR", "NODE-NH-MW"];
const availableCircuitIds = ["87L-MA-WBS-AUB-001", "87L-MA-WBS-AUB-002", "DTT-MA-AUB-MIL-001", "SCADA-MA-BOS-RI-001", "DWDM-ME-BOS-001"];
const availableWorkOrderIds = ["WO-NE-2601", "WO-NE-2603", "WO-NE-2606", "WO-NE-2611"];

export function DashboardPage() {
  const [mode, setMode] = useState<DashboardMapMode>("hybrid");
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
  const [toast, setToast] = useState("");

  const activeMap = transmissionMaps.find((map) => map.id === activeMapId) || transmissionMaps[0];
  const summaryCards = useMemo(() => buildSummaryCards(transmissionMaps, substations, nodes, transmissionLines), [transmissionMaps, substations, nodes, transmissionLines]);

  function handleCreateMap(map: TransmissionMap) {
    setTransmissionMaps((current) => [map, ...current.filter((item) => item.id !== map.id)]);
    setActiveMapId(map.id);
    setShowMapEditor(false);
    showToast(`Created transmission map "${map.name}".`);
  }

  function handleMapClick(coordinate: Coordinate) {
    if (activeTool === "add_substation") {
      setDraftSubstation(createSubstationDraft(coordinate));
      showToast("Substation point staged. Complete the Create Substation workflow.");
      return;
    }
    if (activeTool === "add_device_node" || activeTool === "add_fiber_node") {
      setDraftNode(createNodeDraft(coordinate, activeMap.id, activeTool));
      showToast("Node point staged. Complete NodeParameterEditor fields.");
      return;
    }
    if (activeTool === "place_missing" && placementTarget) {
      placeMissingAsset(coordinate);
      return;
    }
    if (activeTool.startsWith("draw_") || activeTool.includes("geometry")) {
      showToast("Advanced line, polygon, snapping, and geometry editing are staged as follow-up TODOs.");
    }
  }

  function placeMissingAsset([longitude, latitude]: Coordinate) {
    if (!placementTarget) return;
    if (placementTarget.type === "substation") {
      setSubstations((current) => current.map((substation) => substation.id === placementTarget.id ? { ...substation, latitude, longitude } : substation));
      setSelectedAsset({ kind: "substation", id: placementTarget.id, label: placementTarget.label, record: { ...placementTarget.record, latitude, longitude } });
    } else {
      setNodes((current) => current.map((node) => node.id === placementTarget.id ? { ...node, latitude, longitude } : node));
      setSelectedAsset({ kind: "node", id: placementTarget.id, label: placementTarget.label, record: { ...placementTarget.record, latitude, longitude } });
    }
    showToast(`${placementTarget.label} placed with street-level lat/lon.`);
    setPlacementTarget(null);
    setActiveTool("select");
  }

  function handleSaveSubstation(substation: Substation) {
    setSubstations((current) => [substation, ...current.filter((item) => item.id !== substation.id)]);
    setSelectedAsset({ kind: "substation", id: substation.id, label: substation.name, record: substation });
    setDraftSubstation(null);
    setActiveTool("select");
    showToast(`Saved substation "${substation.name}" as ${substation.visibility}.`);
  }

  function handleSaveNode(node: MapNode) {
    setNodes((current) => [node, ...current.filter((item) => item.id !== node.id)]);
    setSelectedAsset({ kind: "node", id: node.id, label: node.name, record: node });
    setDraftNode(null);
    setActiveTool("select");
    showToast(`Saved node "${node.name}" with configurable parameters.`);
  }

  function handleDiagramAnnotation(annotationId: string) {
    const annotation = isoNeDiagramAnnotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    const substation = substations.find((item) => item.id === annotation.entityId);
    const node = nodes.find((item) => item.id === annotation.entityId);
    const line = transmissionLines.find((item) => item.id === annotation.entityId);
    if (substation) setSelectedAsset({ kind: "substation", id: substation.id, label: substation.name, record: substation });
    else if (node) setSelectedAsset({ kind: "node", id: node.id, label: node.name, record: node });
    else if (line) setSelectedAsset({ kind: "transmission_line", id: line.id, label: line.name, record: line });
    else showToast(`Selected diagram annotation "${annotation.label}".`);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3800);
  }

  const placementHint = placementTarget ? `Place ${placementTarget.label} with street-level lat/lon. Do not use percentage coordinates here.` : undefined;

  return (
    <main className={`dashboard-map-page dashboard-mode-${mode}`}>
      <header className="dashboard-map-page-header">
        <div>
          <h1>GridAssetLink Dashboard</h1>
          <p>Switch between public ISO-NE planning context, street-level editable assets, and a hybrid planning workspace.</p>
        </div>
        <DashboardMapModeToggle value={mode} onChange={setMode} />
      </header>

      <div className="dashboard-map-toolbar-row">
        <TransmissionMapSelector maps={transmissionMaps} activeMapId={activeMapId} onChange={setActiveMapId} onCreateNew={() => setShowMapEditor(true)} />
        <div className="street-action-buttons">
          <button className="telecom-map-button" type="button" onClick={() => setActiveTool("add_substation")}><MapPin size={15} />Add Substation</button>
          <button className="telecom-map-button" type="button" onClick={() => setActiveTool("add_device_node")}><Plus size={15} />Create Node</button>
          {selectedAsset?.kind === "node" ? <button className="telecom-map-button" type="button" onClick={() => setDraftNode(selectedAsset.record)}>Edit Selected Node</button> : null}
        </div>
      </div>

      <section className="dashboard-summary-bar">
        {summaryCards.map(({ label, value, note, Icon }) => (
          <div className="dashboard-summary-tile" key={label}>
            <Icon size={17} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </section>

      <div className="dashboard-map-mode-grid">
        {(mode === "iso-ne-diagram" || mode === "hybrid") ? (
          <IsoNeDiagramMap annotations={isoNeDiagramAnnotations} onSelectAnnotation={(annotation) => handleDiagramAnnotation(annotation.id)} />
        ) : null}

        {(mode === "street-level" || mode === "hybrid") ? (
          <StreetLevelAssetMap
            activeMap={activeMap}
            substations={substations}
            nodes={nodes}
            transmissionLines={transmissionLines}
            planningRegions={planningRegions}
            layers={streetLayers}
            activeTool={activeTool}
            placementHint={placementHint}
            onMapClick={handleMapClick}
            onSelect={setSelectedAsset}
          />
        ) : null}

        {(mode === "street-level" || mode === "hybrid") ? (
          <div className="dashboard-right-rail">
            <MapLayerControlPanel
              layers={streetLayers}
              activeTool={activeTool}
              onToggleLayer={(layer) => setStreetLayers((current) => ({ ...current, [layer]: !current[layer] }))}
              onToolChange={(tool) => {
                setActiveTool(tool);
                if (tool !== "place_missing") setPlacementTarget(null);
              }}
            />
            <MissingMapLocationPanel
              substations={substations}
              nodes={nodes}
              placementTargetId={placementTarget?.id}
              onPlaceMissing={(item) => {
                setPlacementTarget(item);
                setActiveTool("place_missing");
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="dashboard-editor-grid">
        <LinkedAssetDetailPanel selection={selectedAsset} />
        <TransmissionMapEditor open={showMapEditor} onCancel={() => setShowMapEditor(false)} onSave={handleCreateMap} />
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

      <div className="dashboard-security-note">
        <AlertTriangle size={15} />
        <span>Security boundary: new transmission maps, substations, nodes, fiber routes, device nodes, and circuit paths default to private visibility. Public views should expose only public reference data and approved disclaimers.</span>
      </div>
      {toast ? <div className="dashboard-map-toast">{toast}</div> : null}
    </main>
  );
}

function buildSummaryCards(maps: TransmissionMap[], substations: Substation[], nodes: MapNode[], lines: typeof seedTransmissionLines) {
  return [
    { label: "Transmission Maps", value: maps.length, note: "seed + custom", Icon: Network },
    { label: "Substations", value: substations.length, note: `${substations.filter((item) => item.latitude === undefined).length} missing location`, Icon: MapPin },
    { label: "Transmission Lines", value: lines.length, note: "editable line models", Icon: Route },
    { label: "SEL ICON Nodes", value: nodes.filter((node) => node.nodeType === "sel_icon_node").length, note: "parameterized", Icon: Cpu },
    { label: "Circuit Endpoints", value: nodes.filter((node) => node.nodeType === "circuit_endpoint").length, note: "C37.94/telecom", Icon: Workflow },
    { label: "Fiber Nodes", value: nodes.filter((node) => node.nodeType === "fiber_node").length, note: "splice/patch context", Icon: Cable },
    { label: "Private Layers", value: nodes.filter((node) => node.visibility === "private").length + substations.filter((item) => item.visibility === "private").length, note: "not public", Icon: ShieldCheck },
    { label: "MapLibre Status", value: "Fallback", note: "SVG lat/lon MVP", Icon: RadioTower },
  ];
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

function createNodeDraft([longitude, latitude]: Coordinate, activeMapId: string, activeTool: MapDrawingTool): MapNode {
  const id = `NODE-CUSTOM-${Date.now().toString(36).toUpperCase()}`;
  const nodeType: NodeParameters["nodeType"] = activeTool === "add_fiber_node" ? "fiber_node" : "device_node";
  return {
    id,
    name: activeTool === "add_fiber_node" ? "New Fiber Node" : "New Device Node",
    nodeType,
    transmissionMapId: activeMapId,
    latitude,
    longitude,
    status: "proposed",
    visibility: "private",
    linkedDeviceIds: [],
    linkedCircuitIds: [],
    linkedWorkOrderIds: [],
    linkedFiberAssignmentIds: [],
    nodeParameters: {
      nodeId: id,
      nodeName: activeTool === "add_fiber_node" ? "New Fiber Node" : "New Device Node",
      nodeType,
      telecom: nodeType === "device_node" ? { protocol: "Ethernet", timingSource: "Unknown" } : undefined,
      fiber: nodeType === "fiber_node" ? { fiberType: "unknown" } : undefined,
      planning: { status: "proposed", priority: "medium", notes: "Created from street-level map click." },
    },
    notes: "Private by default.",
  };
}
