export type AssetStatus = "existing" | "active" | "online" | "planned" | "proposed" | "out_of_service" | "maintenance" | "open" | "in_progress" | "complete";
export type LifecycleState = "Existing" | "Proposed" | "Out of Service";
export type AssetCriticality = "low" | "normal" | "high" | "critical";

export type Coordinate = [number, number];
export type IsoNeState = "CT" | "MA" | "RI" | "NH" | "VT" | "ME";
export type TransmissionVoltageClass = "735+" | "500-734" | "345-499" | "230-344" | "115-229" | "69-114" | "below-69" | "unknown";

export type GeoFeature<TProperties, TGeometry extends "Point" | "LineString" | "Polygon"> = {
  type: "Feature";
  properties: TProperties;
  geometry: TGeometry extends "Point"
    ? { type: "Point"; coordinates: Coordinate }
    : TGeometry extends "LineString"
      ? { type: "LineString"; coordinates: Coordinate[] }
      : { type: "Polygon"; coordinates: Coordinate[][] };
};

export type GeoFeatureCollection<TProperties, TGeometry extends "Point" | "LineString" | "Polygon"> = {
  type: "FeatureCollection";
  features: Array<GeoFeature<TProperties, TGeometry>>;
};

export type SubstationProperties = {
  id: string;
  name: string;
  operatingCompany: string;
  region: string;
  voltageClass: string;
  telecomRoom: string;
  batteryPlant: string;
  status: AssetStatus;
  criticality: AssetCriticality;
};

export type TelecomNodeProperties = {
  id: string;
  name: string;
  site: string;
  manufacturer: "SEL" | "Belden" | "Nokia" | "Cisco" | "Juniper" | "Microwave" | "Battery" | "Other";
  model: string;
  role: "SEL ICON" | "Belden XTran" | "Nokia" | "Router" | "RTU" | "Microwave" | "Battery/Power" | "DWDM/OTN";
  ipAddress: string;
  firmware: string;
  status: AssetStatus;
  lifecycleState: LifecycleState;
  installDate: string;
  criticality: AssetCriticality;
  notes: string;
};

export type FiberRouteProperties = {
  id: string;
  routeName: string;
  fiberType: "OPGW" | "ADSS" | "Underground distribution fiber" | "Leased service" | "Spare duct";
  strandCount: number;
  availableStrands: number;
  owner: string;
  status: AssetStatus;
  fromSite: string;
  toSite: string;
  lengthMiles: number;
  criticality: AssetCriticality;
};

export type TelecomCircuitProperties = {
  circuitId: string;
  circuitName: string;
  serviceType: "Protection" | "SCADA" | "Voice" | "Ethernet" | "C37.94" | "T1/E1" | "MPLS-TP" | "DWDM wavelength";
  bandwidth: string;
  protectionClass: string;
  aEnd: string;
  zEnd: string;
  path: string;
  primaryRoute: string;
  backupRoute: string;
  status: AssetStatus;
  criticality: AssetCriticality;
};

export type MicrowavePathProperties = {
  pathId: string;
  aSite: string;
  zSite: string;
  frequencyBand: string;
  bandwidth: string;
  status: AssetStatus;
  fadeMargin: string;
  pathLengthMiles: number;
};

export type WorkOrderProperties = {
  woId: string;
  title: string;
  assignedGroup: string;
  status: AssetStatus;
  priority: "low" | "normal" | "high" | "critical";
  dueDate: string;
  relatedAssetId: string;
  site: string;
};

export type ProposedChangeProperties = {
  id: string;
  title: string;
  changeType: "fiber_route" | "circuit" | "device" | "work_order";
  status: "draft" | "engineering_review" | "approved" | "field_ready";
  fromSite?: string;
  toSite?: string;
  relatedAssetId?: string;
  notes: string;
};

export type PointAssetFeature =
  | (GeoFeature<SubstationProperties, "Point"> & { assetKind: "substation" })
  | (GeoFeature<TelecomNodeProperties, "Point"> & { assetKind: "telecom_node" })
  | (GeoFeature<WorkOrderProperties, "Point"> & { assetKind: "work_order" });

export type LineAssetFeature =
  | (GeoFeature<FiberRouteProperties, "LineString"> & { assetKind: "fiber_route" })
  | (GeoFeature<TelecomCircuitProperties, "LineString"> & { assetKind: "telecom_circuit" })
  | (GeoFeature<MicrowavePathProperties, "LineString"> & { assetKind: "microwave_path" })
  | (GeoFeature<ProposedChangeProperties, "LineString"> & { assetKind: "proposed_change" });

export type TelecomAssetFeature = PointAssetFeature | LineAssetFeature;

export type TelecomAssetFilters = {
  query: string;
  assetTypes: string[];
  statuses: string[];
  regions: string[];
  criticalities: string[];
  manufacturers: string[];
  lifecycleStates: string[];
  fiberTypes: string[];
  circuitServiceTypes: string[];
  workOrderPriorities: string[];
};

export type TelecomAssetDashboardData = {
  substations: GeoFeatureCollection<SubstationProperties, "Point">;
  telecomNodes: GeoFeatureCollection<TelecomNodeProperties, "Point">;
  fiberRoutes: GeoFeatureCollection<FiberRouteProperties, "LineString">;
  telecomCircuits: GeoFeatureCollection<TelecomCircuitProperties, "LineString">;
  microwavePaths: GeoFeatureCollection<MicrowavePathProperties, "LineString">;
  workOrders: GeoFeatureCollection<WorkOrderProperties, "Point">;
  proposedChanges: GeoFeatureCollection<ProposedChangeProperties, "LineString">;
};

export type ProposedRouteDraft = {
  id: string;
  aSite: string;
  zSite: string;
  routeType: "fiber" | "circuit";
  status: "draft";
  coordinates: Coordinate[];
};

export type DashboardMapMode = "iso-ne-diagram" | "street-level" | "hybrid";
export type MapVisibility = "private" | "team" | "public";
export type TransmissionMapType = "public_reference" | "internal_planning" | "synthetic" | "proposed";
export type EditableMapStatus = "existing" | "planned" | "proposed" | "retired" | "unknown";

export type TransmissionMap = {
  id: string;
  name: string;
  description: string;
  region: string;
  voltageClasses: number[];
  ownerOperator?: string;
  mapType: TransmissionMapType;
  visibility: MapVisibility;
  source: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
};

export type TransmissionLine = {
  id: string;
  name: string;
  fromSubstationId?: string;
  toSubstationId?: string;
  voltageKv?: number;
  circuitId?: string;
  status: EditableMapStatus;
  lineType?: "overhead" | "underground" | "submarine" | "unknown";
  conductorType?: string;
  lengthMiles?: number;
  owner?: string;
  source?: string;
  geometry: {
    type: "LineString";
    coordinates: Coordinate[];
  };
  nodeParameters?: Record<string, unknown>;
  notes?: string;
};

export type PublicTransmissionLineProperties = {
  id: string;
  name?: string;
  voltageKv?: number | null;
  voltageClass?: TransmissionVoltageClass;
  status?: "existing" | "planned" | "proposed" | "unknown";
  owner?: string | null;
  utilityOwner?: string | null;
  ownerSource?: "hifld_owner_field" | "line_name_owner_token" | "unknown";
  ownerConfidence?: "public_record" | "line_name_token" | "unknown";
  rawOwner?: string | null;
  source: "HIFLD" | "OpenStreetMap" | "Public GIS";
  sourceType: "public-reference";
  readOnly: true;
  synthetic: false;
  states: IsoNeState[];
  isoNe: true;
  publicDataNotice: "Public reference transmission-line geometry. Not for operations.";
};

export type PublicTransmissionLineFeature = {
  type: "Feature";
  properties: PublicTransmissionLineProperties;
  geometry:
    | { type: "LineString"; coordinates: Coordinate[] }
    | { type: "MultiLineString"; coordinates: Coordinate[][] };
};

export type PublicTransmissionLineCollection = {
  type: "FeatureCollection";
  features: PublicTransmissionLineFeature[];
};

export type PublicSubstationOwnerSource =
  | "public_substation_owner_field"
  | "public_substation_source_field"
  | "openstreetmap_operator_tag"
  | "openstreetmap_owner_tag"
  | "nearest_public_hifld_transmission_line_owner"
  | "unknown";

export type PublicSubstationProperties = {
  id: string;
  name: string;
  city?: string | null;
  county?: string | null;
  state: IsoNeState;
  substationType?: string | null;
  status?: "existing" | "planned" | "proposed" | "unknown";
  maxVoltageKv?: number | null;
  minVoltageKv?: number | null;
  lineCount?: number | null;
  utilityOwner: string;
  ownerSource: PublicSubstationOwnerSource;
  ownerConfidence: "public_record" | "public_source_label" | "openstreetmap_spatial_match" | "public_line_inferred" | "unknown";
  osmElementId?: string | null;
  osmSubstationName?: string | null;
  osmOperator?: string | null;
  osmOwner?: string | null;
  osmMatchDistanceMiles?: number | null;
  nearestPublicLineId?: string | null;
  nearestPublicLineDistanceMiles?: number | null;
  source: "HIFLD" | "OpenStreetMap" | "Public GIS";
  sourceType: "public-reference";
  readOnly: true;
  synthetic: false;
  isoNe: true;
  rawSource?: string | null;
  publicDataNotice: "Public substation reference point. Not for operations.";
};

export type PublicSubstationFeature = {
  type: "Feature";
  properties: PublicSubstationProperties;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type PublicSubstationCollection = {
  type: "FeatureCollection";
  features: PublicSubstationFeature[];
};

export type SyntheticSubstationProperties = {
  id: string;
  name: string;
  synthetic: true;
  labelType: "synthetic";
  source: "synthetic-demo";
  sourceType: "synthetic-planning";
  visibility: "private" | "team";
  public: false;
  state: IsoNeState;
  county?: string;
  cityHint?: string;
  latitude: number;
  longitude: number;
  voltageClasses: number[];
  status: "existing" | "planned" | "proposed";
  planningRole:
    | "bulk_transmission_hub"
    | "regional_switching_station"
    | "telecom_hub"
    | "fiber_aggregation_site"
    | "distribution_interface"
    | "renewables_collection"
    | "load_center"
    | "intertie_planning_node";
  criticality: "low" | "medium" | "high" | "critical";
  connectedTransmissionLineIds: string[];
  connectedDeviceIds: string[];
  connectedCircuitIds: string[];
  connectedFiberIds: string[];
  notes: string;
  disclaimer: "Synthetic demo/planning substation. Not a real utility asset.";
  connectionNote: "Synthetic planning association to nearest public transmission corridor. Not a verified physical connection.";
};

export type SyntheticSubstationFeature = {
  type: "Feature";
  properties: SyntheticSubstationProperties;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type SyntheticSubstationCollection = {
  type: "FeatureCollection";
  features: SyntheticSubstationFeature[];
};

export type TransmissionStructure = {
  id: string;
  structureNumber: string;
  lineId: string;
  lineName?: string;
  sequenceIndex: number;
  latitude: number;
  longitude: number;
  milepost?: number;
  structureType: "tangent" | "angle" | "deadend" | "tap" | "splice" | "riser" | "terminal" | "unknown";
  voltageKv?: number;
  source: "synthetic-demo";
  synthetic: true;
  hasOpgw: boolean;
  hasSplice: boolean;
  spliceClosureIds: string[];
  connectedFiberCableIds: string[];
  notes?: string;
};

export type TransmissionStructureFeature = {
  type: "Feature";
  properties: TransmissionStructure;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type TransmissionStructureCollection = {
  type: "FeatureCollection";
  features: TransmissionStructureFeature[];
};

export type OpgwCable = {
  id: string;
  cableName: string;
  lineId: string;
  lineName?: string;
  synthetic: true;
  source: "synthetic-demo";
  status: "existing" | "planned" | "proposed";
  fiberCount: 24 | 48 | 72 | 96 | 144;
  fiberType: "OPGW";
  startStructureId: string;
  endStructureId: string;
  structureIds: string[];
  routeMiles: number;
  manufacturer?: string;
  cableSpec?: string;
  bufferTubeCount?: number;
  fibersPerTube?: number;
  connectedSpliceClosureIds: string[];
  notes?: string;
};

export type OpgwCableFeature = {
  type: "Feature";
  properties: OpgwCable;
  geometry:
    | { type: "LineString"; coordinates: Coordinate[] }
    | { type: "MultiLineString"; coordinates: Coordinate[][] };
};

export type OpgwCableCollection = {
  type: "FeatureCollection";
  features: OpgwCableFeature[];
};

export type FiberStrand = {
  id: string;
  cableId: string;
  strandNumber: number;
  tubeNumber?: number;
  colorCode?: string;
  status: "available" | "assigned" | "reserved" | "dark" | "spare" | "faulted" | "retired";
  assignmentId?: string;
  circuitId?: string;
  notes?: string;
};

export type SpliceClosure = {
  id: string;
  name: string;
  synthetic: true;
  source: "synthetic-demo";
  closureType: "aerial_opgw_splice" | "transition_splice" | "tap_splice" | "midspan_splice" | "terminal_splice";
  structureId: string;
  structureNumber: string;
  latitude: number;
  longitude: number;
  cableIds: string[];
  spliceCount: number;
  status: "existing" | "planned" | "proposed";
  installType: "aerial" | "riser" | "terminal" | "unknown";
  notes?: string;
};

export type SpliceClosureFeature = {
  type: "Feature";
  properties: SpliceClosure;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type SpliceClosureCollection = {
  type: "FeatureCollection";
  features: SpliceClosureFeature[];
};

export type FiberSplice = {
  id: string;
  spliceClosureId: string;
  fromCableId: string;
  fromStrandNumber: number;
  toCableId: string;
  toStrandNumber: number;
  spliceType: "straight_through" | "express" | "branch" | "patch" | "open" | "reserved";
  lossDb?: number;
  status: "existing" | "planned" | "proposed" | "faulted";
  assignmentId?: string;
  notes?: string;
};

export type FiberAssignment = {
  id: string;
  assignmentName: string;
  synthetic: true;
  serviceType: "SEL_ICON" | "C37_94" | "Ethernet" | "MPLS_TP" | "OTN" | "SCADA" | "Protection" | "DTT" | "Leased" | "Spare" | "Other";
  status: "active" | "planned" | "proposed" | "reserved" | "retired";
  aEndStructureId?: string;
  zEndStructureId?: string;
  aEndNodeId?: string;
  zEndNodeId?: string;
  cableIds: string[];
  strandSegments: Array<{
    cableId: string;
    strandNumbers: number[];
    fromStructureId: string;
    toStructureId: string;
  }>;
  spliceIds: string[];
  estimatedDistanceMiles?: number;
  estimatedLossDb?: number;
  notes?: string;
};

export type PatchPanelPort = {
  id: string;
  panelId: string;
  portNumber: number;
  cableId?: string;
  strandNumber?: number;
  assignmentId?: string;
  status: "available" | "assigned" | "reserved" | "faulted";
};

export type PatchPanel = {
  id: string;
  name: string;
  synthetic: true;
  locationType: "structure" | "substation" | "telecom_node";
  locationId: string;
  fiberCableIds: string[];
  portCount: 12 | 24 | 48 | 72 | 96 | 144;
  connectorType: "LC" | "SC" | "ST" | "FC" | "Unknown";
  ports: PatchPanelPort[];
  notes?: string;
};

export type NodeParameters = {
  nodeId: string;
  nodeName: string;
  nodeType:
    | "substation"
    | "transmission_node"
    | "telecom_node"
    | "sel_icon_node"
    | "fiber_node"
    | "device_node"
    | "circuit_endpoint"
    | "load_node"
    | "generation_node"
    | "proposed_node";
  electrical?: {
    voltageKv?: number;
    phases?: "A" | "B" | "C" | "ABC";
    nominalLoadMw?: number;
    nominalLoadMvar?: number;
    powerFactor?: number;
    generationMw?: number;
    transformerMva?: number;
    impedancePercent?: number;
    shortCircuitMva?: number;
  };
  telecom?: {
    deviceType?: string;
    vendor?: string;
    model?: string;
    rack?: string;
    shelf?: string;
    slot?: string;
    port?: string;
    serviceType?: string;
    protocol?: "Ethernet" | "C37.94" | "T1" | "E1" | "SONET" | "MPLS-TP" | "DWDM" | "OTN" | "Other";
    bandwidthMbps?: number;
    timingSource?: "PTP" | "SyncE" | "IRIG-B" | "GPS" | "Internal" | "Unknown";
  };
  fiber?: {
    fiberCableId?: string;
    fiberType?: "OPGW" | "ADSS" | "underground" | "leased" | "unknown";
    strandCount?: number;
    assignedStrands?: number[];
    spliceClosureId?: string;
    patchPanelId?: string;
    connectorType?: string;
    lossDb?: number;
    distanceMiles?: number;
  };
  planning?: {
    status: "existing" | "planned" | "proposed" | "needs_review" | "approved" | "rejected";
    priority?: "low" | "medium" | "high" | "critical";
    projectId?: string;
    workOrderId?: string;
    targetInServiceDate?: string;
    notes?: string;
  };
};

export type Substation = {
  id: string;
  name: string;
  abbreviation?: string;
  state?: string;
  county?: string;
  city?: string;
  voltageKv?: number[];
  status: EditableMapStatus;
  latitude?: number;
  longitude?: number;
  source?: string;
  visibility: MapVisibility;
  connectedTransmissionLineIds?: string[];
  connectedDeviceIds?: string[];
  connectedCircuitIds?: string[];
  connectedFiberIds?: string[];
  nodeParameters?: NodeParameters;
  notes?: string;
};

export type MapNode = {
  id: string;
  name: string;
  nodeType: NodeParameters["nodeType"];
  transmissionMapId: string;
  parentSubstationId?: string;
  latitude?: number;
  longitude?: number;
  status: EditableMapStatus;
  visibility: MapVisibility;
  linkedDeviceIds: string[];
  linkedCircuitIds: string[];
  linkedWorkOrderIds: string[];
  linkedFiberAssignmentIds: string[];
  nodeParameters: NodeParameters;
  notes?: string;
};

export type PlanningRegion = {
  id: string;
  name: string;
  status: "planned" | "proposed" | "needs_review";
  visibility: MapVisibility;
  geometry: {
    type: "Polygon";
    coordinates: Coordinate[][];
  };
  notes?: string;
};

export type MapAnnotation = {
  id: string;
  label: string;
  entityType: "substation" | "transmission_line" | "node" | "circuit" | "work_order" | "note";
  entityId: string;
  xPercent: number;
  yPercent: number;
  status: EditableMapStatus | "needs_review";
};

export type StreetMapLayerKey =
  | "publicTransmissionLines"
  | "publicSubstations"
  | "syntheticSubstations"
  | "transmissionStructures"
  | "syntheticOpgwCables"
  | "spliceClosures"
  | "fiberAssignments"
  | "patchPanels"
  | "transmissionLines"
  | "substations"
  | "telecomNodes"
  | "selIconNodes"
  | "c3794Nodes"
  | "fiberRoutes"
  | "opgwRoutes"
  | "distributionFiberRoutes"
  | "circuitEndpoints"
  | "workOrderLocations"
  | "proposedChanges"
  | "missingLocationAssets"
  | "planningRegions"
  | "isoNeReferenceOverlays";

export type MapDrawingTool =
  | "select"
  | "add_substation"
  | "add_device_node"
  | "add_fiber_node"
  | "draw_transmission_line"
  | "draw_fiber_path"
  | "draw_planning_polygon"
  | "edit_geometry"
  | "delete_geometry"
  | "place_missing";
