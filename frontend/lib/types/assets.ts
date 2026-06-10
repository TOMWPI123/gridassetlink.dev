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
  ownerSource?: "hifld_owner_field" | "openstreetmap_line_operator_tag" | "openstreetmap_line_owner_tag" | "line_name_owner_token" | "unknown";
  ownerConfidence?: "public_record" | "openstreetmap_spatial_match" | "line_name_token" | "unknown";
  rawOwner?: string | null;
  osmLineElementId?: string | null;
  osmLineName?: string | null;
  osmOperator?: string | null;
  osmOwner?: string | null;
  osmMatchDistanceMiles?: number | null;
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

export type FccUtilityTowerProperties = {
  id: string;
  nodeName: string;
  callSign: string;
  utilityOwner: string;
  rawLicenseeName: string;
  frn?: string | null;
  radioServiceCode?: string | null;
  licenseStatus?: "active" | "unknown";
  grantDate?: string | null;
  expirationDate?: string | null;
  locationNumber: number;
  locationName?: string | null;
  locationTypeCode?: string | null;
  locationClassCode?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  state: IsoNeState;
  towerRegistrationNumber?: string | null;
  groundElevationM?: number | null;
  supportHeightM?: number | null;
  overallHeightM?: number | null;
  structureType?: string | null;
  linkedPathIds: string[];
  frequencyBandsMhz: number[];
  source: "FCC ULS";
  sourceType: "public-reference";
  readOnly: true;
  synthetic: false;
  isoNe: true;
  publicDataNotice: "Public FCC ULS microwave site record. Utility telecom planning reference only; not for operations.";
};

export type FccUtilityTowerFeature = {
  type: "Feature";
  properties: FccUtilityTowerProperties;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type FccUtilityTowerCollection = {
  type: "FeatureCollection";
  features: FccUtilityTowerFeature[];
};

export type FccMicrowaveLinkProperties = {
  id: string;
  linkName: string;
  callSign: string;
  utilityOwner: string;
  rawLicenseeName: string;
  radioServiceCode?: string | null;
  typeOfOperation?: string | null;
  stationClass?: string | null;
  pathNumber: number;
  pathTypeDesc?: string | null;
  txNodeId: string;
  rxNodeId: string;
  txLocationNumber: number;
  rxLocationNumber: number;
  txAntennaNumber?: number | null;
  rxAntennaNumber?: number | null;
  receiverCallSign?: string | null;
  frequencyAssignedMhz?: number | null;
  frequencyUpperBandMhz?: number | null;
  eirp?: number | null;
  powerOutput?: number | null;
  transmitterMake?: string | null;
  transmitterModel?: string | null;
  pathDistanceMiles?: number | null;
  pathStatus?: string | null;
  linkStartDate?: string | null;
  linkEndDate?: string | null;
  states: IsoNeState[];
  source: "FCC ULS";
  sourceType: "public-reference";
  readOnly: true;
  synthetic: false;
  isoNe: true;
  publicDataNotice: "Public FCC ULS microwave path record. Utility telecom planning reference only; not for operations.";
};

export type FccMicrowaveLinkFeature = {
  type: "Feature";
  properties: FccMicrowaveLinkProperties;
  geometry: { type: "LineString"; coordinates: Coordinate[] };
};

export type FccMicrowaveLinkCollection = {
  type: "FeatureCollection";
  features: FccMicrowaveLinkFeature[];
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

export type DistributionPole = {
  id: string;
  poleNumber: string;
  feederId: string;
  streetPathId: string;
  sequenceIndex: number;
  latitude: number;
  longitude: number;
  utilityOwner: string;
  state: "CT" | "ME" | "MA" | "NH" | "RI" | "VT" | "unknown";
  placementModel: "synthetic_street_path";
  placementBasis: string;
  roadSide: "left" | "right" | "alternating";
  poleClass: "distribution_wood" | "composite" | "steel" | "unknown";
  heightFt: 35 | 40 | 45 | 50 | 55 | 60;
  spanFromPreviousFt?: number;
  telecomRole: "distribution_backbone" | "fiber_lateral" | "splice_pole" | "riser" | "service_drop" | "wireless_backhaul" | "spare";
  hasTelecomFiber: boolean;
  fiberCount: 0 | 12 | 24 | 48 | 96;
  connectedDistributionFiberRouteIds: string[];
  upstreamPoleId?: string;
  downstreamPoleId?: string;
  upstreamNetworkNodeId?: string;
  upstreamPatchPanelId?: string;
  continuityPathId?: string;
  representedPoleCount?: number;
  splicePointIds?: string[];
  slackLoopIds?: string[];
  assignmentIds?: string[];
  serviceDropCount: number;
  status: "in_service_synthetic" | "planned" | "proposed" | "reserved" | "needs_field_verification";
  synthetic: true;
  source: "synthetic-demo";
  notes: string;
};

export type DistributionPoleFeature = {
  type: "Feature";
  properties: DistributionPole;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type DistributionPoleCollection = {
  type: "FeatureCollection";
  features: DistributionPoleFeature[];
};

export type DistributionPoleFiberRoute = {
  routeId: string;
  routeName: string;
  feederId: string;
  streetPathId: string;
  utilityOwner: string;
  state: "CT" | "ME" | "MA" | "NH" | "RI" | "VT" | "unknown";
  synthetic: true;
  source: "synthetic-demo";
  placementModel: "synthetic_street_path";
  routeMiles: number;
  poleCount: number;
  representedPoleCount?: number;
  firstPoleId: string;
  lastPoleId: string;
  samplePoleIds: string[];
  splicePointIds?: string[];
  slackLoopIds?: string[];
  assignmentIds?: string[];
  totalSlackFeet?: number;
  parentPatchPanelId?: string;
  parentOpgwRouteId?: string;
  fiberCount: 12 | 24 | 48 | 96;
  status: "in_service_synthetic" | "planned" | "proposed" | "reserved" | "needs_field_verification";
  continuityStatus: "complete_synthetic" | "planned" | "proposed" | "needs_splice_review" | "broken_demo";
  serviceTypesCarried: Array<"SCADA" | "Distribution Automation" | "Telecom Backhaul" | "AMI Backhaul" | "Protection Pilot" | "Spare">;
  estimatedPoleScaleCount: number;
  notes: string;
};

export type DistributionPoleFiberRouteFeature = {
  type: "Feature";
  properties: DistributionPoleFiberRoute;
  geometry: { type: "LineString"; coordinates: Coordinate[] };
};

export type DistributionPoleFiberRouteCollection = {
  type: "FeatureCollection";
  features: DistributionPoleFiberRouteFeature[];
};

export type DistributionPoleContinuityRecord = {
  continuityId: string;
  routeId: string;
  feederId: string;
  utilityOwner: string;
  state: string;
  endpointAType: "substation_patch_panel" | "opgw_patch_panel" | "synthetic_telecom_node";
  endpointAId: string;
  endpointZType: "distribution_pole";
  endpointZId: string;
  totalPoleCount: number;
  representedPoleCount?: number;
  samplePoleIds: string[];
  splicePointIds?: string[];
  slackLoopIds?: string[];
  assignmentIds?: string[];
  totalSlackFeet?: number;
  fiberCount: 12 | 24 | 48 | 96;
  serviceTypesCarried: DistributionPoleFiberRoute["serviceTypesCarried"];
  continuityStatus: DistributionPoleFiberRoute["continuityStatus"];
  synthetic: true;
  warning: string;
};

export type DistributionPoleDensity = {
  id: string;
  densityCellName: string;
  utilityOwner: string;
  state: "CT" | "ME" | "MA" | "NH" | "RI" | "VT" | "unknown";
  latitude: number;
  longitude: number;
  displayPoleCount: number;
  representedPoleCount: number;
  feederRouteCount: number;
  fiberRouteMiles: number;
  splicePointCount: number;
  slackLoopCount: number;
  assignmentCount: number;
  maxFiberCount: 12 | 24 | 48 | 96;
  statusSummary: string;
  synthetic: true;
  source: "synthetic-demo";
  notes: string;
};

export type DistributionPoleDensityFeature = {
  type: "Feature";
  properties: DistributionPoleDensity;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type DistributionPoleDensityCollection = {
  type: "FeatureCollection";
  features: DistributionPoleDensityFeature[];
};

export type DistributionPoleSplicePoint = {
  id: string;
  spliceName: string;
  routeId: string;
  feederId: string;
  streetPathId: string;
  poleId: string;
  poleNumber: string;
  sequenceIndex: number;
  utilityOwner: string;
  state: "CT" | "ME" | "MA" | "NH" | "RI" | "VT" | "unknown";
  latitude: number;
  longitude: number;
  spliceType: "riser_terminal" | "inline_splice" | "tap_splice" | "branch_splice" | "midspan_storage";
  spliceCount: number;
  slackLoopFeet: number;
  connectedAssignmentIds: string[];
  status: "in_service_synthetic" | "planned" | "proposed" | "needs_field_verification";
  synthetic: true;
  source: "synthetic-demo";
  notes: string;
};

export type DistributionPoleSplicePointFeature = {
  type: "Feature";
  properties: DistributionPoleSplicePoint;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type DistributionPoleSplicePointCollection = {
  type: "FeatureCollection";
  features: DistributionPoleSplicePointFeature[];
};

export type DistributionSlackLoop = {
  id: string;
  slackName: string;
  routeId: string;
  feederId: string;
  poleId: string;
  poleNumber: string;
  sequenceIndex: number;
  utilityOwner: string;
  state: "CT" | "ME" | "MA" | "NH" | "RI" | "VT" | "unknown";
  latitude: number;
  longitude: number;
  slackType: "splice_slack" | "snowshoe_loop" | "riser_storage" | "maintenance_loop" | "service_reserve";
  slackFeet: number;
  relatedSplicePointId?: string;
  status: "in_service_synthetic" | "planned" | "proposed" | "needs_field_verification";
  synthetic: true;
  source: "synthetic-demo";
  notes: string;
};

export type DistributionSlackLoopFeature = {
  type: "Feature";
  properties: DistributionSlackLoop;
  geometry: { type: "Point"; coordinates: Coordinate };
};

export type DistributionSlackLoopCollection = {
  type: "FeatureCollection";
  features: DistributionSlackLoopFeature[];
};

export type DistributionFiberAssignment = {
  id: string;
  assignmentName: string;
  routeId: string;
  feederId: string;
  utilityOwner: string;
  state: "CT" | "ME" | "MA" | "NH" | "RI" | "VT" | "unknown";
  serviceType: "SCADA" | "Distribution Automation" | "Telecom Backhaul" | "AMI Backhaul" | "Protection Pilot" | "Spare";
  status: "active_synthetic" | "planned" | "proposed" | "reserved";
  criticality: "low" | "normal" | "high" | "critical";
  strandNumbers: number[];
  aEndPoleId: string;
  zEndPoleId: string;
  poleIds: string[];
  splicePointIds: string[];
  slackLoopIds: string[];
  routeMiles: number;
  estimatedLossDb: number;
  fiberCount: 12 | 24 | 48 | 96;
  synthetic: true;
  source: "synthetic-demo";
  notes: string;
};

export type DistributionFiberAssignmentFeature = {
  type: "Feature";
  properties: DistributionFiberAssignment;
  geometry: { type: "LineString"; coordinates: Coordinate[] };
};

export type DistributionFiberAssignmentCollection = {
  type: "FeatureCollection";
  features: DistributionFiberAssignmentFeature[];
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

export type OpgwWorkflowStatus =
  | "synthetic_assumption"
  | "engineer_reviewed"
  | "proposed"
  | "planned"
  | "design"
  | "work_order_issued"
  | "in_service_synthetic"
  | "as_built_verified"
  | "retired"
  | "faulted"
  | "abandoned"
  | "superseded";

export type OpgwCableSectionStatus =
  | "assumed"
  | "proposed"
  | "planned"
  | "installed_synthetic"
  | "verified"
  | "faulted"
  | "retired"
  | "superseded";

export type OpgwSpanSegmentStatus =
  | "normal"
  | "inspection_due"
  | "issue_found"
  | "work_order_open"
  | "faulted"
  | "resolved"
  | "retired";

export type OpgwRouteRecord = {
  opgwRouteId: string;
  transmissionLineId: string;
  routeName: string;
  fromSubstationId?: string;
  toSubstationId?: string;
  fromStructureId: string;
  toStructureId: string;
  voltageClass?: string;
  routeStatus: OpgwWorkflowStatus;
  sourceType: "synthetic-demo";
  syntheticConfidence: "low" | "medium" | "high" | "user_verified";
  routeMiles: number;
  totalStructures: number;
  totalSpans: number;
  totalCableSections: number;
  totalSplicePoints: number;
  totalFiberCount: number;
  availableStrands: number;
  assignedStrands: number;
  reservedStrands: number;
  criticalRidingCircuits: number;
  openWorkOrders: number;
  outageImpactCount: number;
  synthetic: true;
  warning: string;
  notes?: string;
};

export type OpgwRouteFeature = {
  type: "Feature";
  properties: OpgwRouteRecord;
  geometry:
    | { type: "LineString"; coordinates: Coordinate[] }
    | { type: "MultiLineString"; coordinates: Coordinate[][] };
};

export type OpgwCableSectionRecord = {
  cableSectionId: string;
  opgwRouteId: string;
  transmissionLineId: string;
  fromSplicePointId: string;
  toSplicePointId: string;
  fromStructureId: string;
  toStructureId: string;
  fromStructureNumber: string;
  toStructureNumber: string;
  fromSubstationId?: string;
  toSubstationId?: string;
  fiberCount: 24 | 48 | 72 | 96 | 144;
  cableType: "OPGW";
  manufacturer?: string;
  installStatus: OpgwCableSectionStatus;
  syntheticConfidence: "low" | "medium" | "high" | "user_verified";
  installYear?: number;
  routeMiles: number;
  totalSpans: number;
  strandCount: number;
  availableStrands: number;
  assignedStrands: number;
  reservedStrands: number;
  assignedServices: number;
  associatedSpliceClosureIds: string[];
  associatedPatchPanelIds: string[];
  retiredOrSupersededBy?: string;
  auditStatus: "current" | "superseded_demo" | "verified_import";
  synthetic: true;
  warning: string;
  notes?: string;
};

export type OpgwCableSectionFeature = {
  type: "Feature";
  properties: OpgwCableSectionRecord;
  geometry: { type: "LineString"; coordinates: Coordinate[] };
};

export type OpgwSpanSegmentRecord = {
  spanSegmentId: string;
  cableSectionId: string;
  opgwRouteId: string;
  transmissionLineId: string;
  fromStructureId: string;
  toStructureId: string;
  fromStructureNumber: string;
  toStructureNumber: string;
  spanLengthFt: number;
  fiberCount: 24 | 48 | 72 | 96 | 144;
  cableStatus: OpgwCableSectionStatus;
  spanStatus: OpgwSpanSegmentStatus;
  hasMidspanIssue: boolean;
  sagClearanceNote?: string;
  inspectionStatus: "not_started" | "inspection_due" | "passed" | "issue_found" | "resolved";
  outageRiskScore: number;
  openWorkOrderCount: number;
  synthetic: true;
  notes?: string;
};

export type OpgwSpanSegmentFeature = {
  type: "Feature";
  properties: OpgwSpanSegmentRecord;
  geometry: { type: "LineString"; coordinates: Coordinate[] };
};

export type OpgwSplicePointRecord = {
  splicePointId: string;
  opgwRouteId: string;
  transmissionLineId: string;
  structureId: string;
  structureNumber: string;
  substationId?: string;
  spliceType: "substation_deadend" | "line_splice" | "junction" | "tap" | "transition" | "termination";
  closureId?: string;
  associatedCableSectionIds: string[];
  latitude: number;
  longitude: number;
  status: "synthetic_assumption" | "planned" | "verified" | "retired";
  syntheticConfidence: "low" | "medium" | "high" | "user_verified";
  synthetic: true;
  notes?: string;
};

export type OpgwSplicePointFeature = {
  type: "Feature";
  properties: OpgwSplicePointRecord;
  geometry: { type: "Point"; coordinates: Coordinate };
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
  spliceType: "straight_through" | "express" | "branch" | "patch" | "open" | "reserved" | "termination" | "spare";
  lossDb?: number;
  status: "existing" | "planned" | "proposed" | "faulted";
  assignmentId?: string;
  notes?: string;
};

export type SyntheticServiceType =
  | "SCADA synthetic demo"
  | "Relay/protection synthetic demo"
  | "SEL ICON synthetic demo"
  | "Microwave backhaul synthetic demo"
  | "Substation LAN synthetic demo"
  | "EMS/RTU synthetic demo"
  | "Dark fiber synthetic demo"
  | "Leased fiber synthetic demo"
  | "DERMS communications synthetic demo"
  | "Voice operations synthetic demo";

export type SyntheticService = {
  serviceId: string;
  serviceName: string;
  serviceType: SyntheticServiceType;
  serviceDescription: string;
  fromSiteId: string;
  fromSiteName: string;
  toSiteId: string;
  toSiteName: string;
  endpointAPatchPanelId?: string;
  endpointAPort?: string;
  endpointZPatchPanelId?: string;
  endpointZPort?: string;
  primaryPathAssignmentId?: string;
  backupPathAssignmentId?: string;
  criticality: "low" | "medium" | "high" | "critical";
  protectionLevel: "none" | "single_path" | "diverse_path" | "ring_protected" | "backup_available";
  latencyClass: "best_effort" | "normal" | "low_latency" | "protection_grade";
  operationalStatus: "active_synthetic" | "planned" | "proposed" | "broken_demo" | "retired";
  layerType: "existing" | "proposed" | "compare";
  syntheticFlag: true;
  continuityCableIds?: string[];
  continuitySplicePointIds?: string[];
  continuitySpliceClosureIds?: string[];
  continuityStatus?: "complete" | "broken" | "proposed_fix" | "proposed_change";
  notes: string;
};

export type FiberContinuityPathSegment = {
  pathSegmentId: string;
  continuityPathId: string;
  sequenceNumber: number;
  objectType: "patch_panel" | "cable_section" | "span_segment" | "splice_point" | "splice_connection" | "service";
  objectId: string;
  transmissionLineId?: string;
  opgwRouteId?: string;
  cableSectionId?: string;
  spanSegmentId?: string;
  splicePointId?: string;
  spliceConnectionId?: string;
  patchPanelId?: string;
  strandNumber?: number;
  segmentStatus: "existing" | "planned" | "proposed" | "broken" | "warning";
  estimatedLossDb?: number;
  notes?: string;
};

export type FiberContinuityPath = {
  continuityPathId: string;
  serviceId: string;
  assignmentId?: string;
  layerType: "existing" | "proposed" | "compare";
  endpointASiteId: string;
  endpointZSiteId: string;
  pathStatus: "complete" | "broken" | "proposed" | "warning";
  totalRouteMiles: number;
  totalCableSections: number;
  totalTransmissionLines: number;
  totalSpanSegments: number;
  totalSplicePoints: number;
  totalPatchPanels: number;
  totalEstimatedLossDb: number;
  hasBrokenContinuity: boolean;
  hasFaultedSection: boolean;
  hasProposedChanges: boolean;
  syntheticFlag: true;
  warningSummary: string[];
  segments: FiberContinuityPathSegment[];
  notes: string;
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

export type DesignAssetGeometryType = "point" | "line" | "polygon" | "table_only";
export type DesignAssetFieldType = "string" | "textarea" | "number" | "integer" | "boolean" | "date" | "enum" | "json";

export type DesignAssetField = {
  name: string;
  label: string;
  type: DesignAssetFieldType;
  required?: boolean;
  default?: unknown;
  enum_options?: string[];
  validation_rules?: Record<string, unknown>;
  help_text?: string;
};

export type DesignAssetType = {
  id: number;
  slug: string;
  display_name: string;
  description?: string | null;
  geometry_type: DesignAssetGeometryType;
  fields_json: DesignAssetField[];
  fields: DesignAssetField[];
  searchable_fields_json?: string[];
  searchable_fields?: string[];
  validation_rules_json?: Record<string, unknown>;
  validation_rules?: Record<string, unknown>;
  map_style_json?: Record<string, unknown>;
  map_style?: Record<string, unknown>;
  status: "active" | "archived";
  version: number;
  created_at?: string;
  updated_at?: string;
};

export type DesignAssetGeoJsonGeometry =
  | { type: "Point"; coordinates: Coordinate }
  | { type: "LineString"; coordinates: Coordinate[] }
  | { type: "MultiLineString"; coordinates: Coordinate[][] }
  | { type: "Polygon"; coordinates: Coordinate[][] }
  | { type: "MultiPolygon"; coordinates: Coordinate[][][] };

export type DesignAssetRecord = {
  id: number;
  asset_type_id: number;
  asset_type_slug?: string | null;
  asset_type_display_name?: string | null;
  record_key: string;
  display_label: string;
  geometry_type: DesignAssetGeometryType;
  geometry_json?: DesignAssetGeoJsonGeometry | null;
  geometry?: DesignAssetGeoJsonGeometry | null;
  properties_json: Record<string, unknown>;
  properties: Record<string, unknown>;
  map_style?: Record<string, unknown>;
  status: "active" | "planned" | "proposed" | "in_review" | "as_built" | "archived";
  source: string;
  visibility: string;
  version: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DesignAssetMapPayload = {
  feature_flag: string;
  synthetic_data_notice: string;
  asset_types: DesignAssetType[];
  records: DesignAssetRecord[];
  feature_collection: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: Record<string, string | number | boolean | null>;
      geometry: DesignAssetGeoJsonGeometry;
    }>;
  };
};

export type StreetMapLayerKey =
  | "publicTransmissionLines"
  | "publicSubstations"
  | "fccUtilityTowers"
  | "fccMicrowaveLinks"
  | "syntheticSubstations"
  | "transmissionStructures"
  | "syntheticOpgwCables"
  | "assumedOpgwRoutes"
  | "plannedOpgwFiber"
  | "verifiedOpgwFiber"
  | "opgwCableSections"
  | "opgwSpanSegments"
  | "opgwSplicePoints"
  | "existingFiberSplices"
  | "proposedFiberSplices"
  | "compareSpliceLayers"
  | "fiberStrandsLayer"
  | "spliceClosures"
  | "fiberAssignments"
  | "patchPanels"
  | "availableStrandCapacity"
  | "criticalRidingCircuits"
  | "opgwOutageImpact"
  | "opgwOpenWorkOrders"
  | "opgwSpanInspectionIssues"
  | "transmissionLines"
  | "substations"
  | "telecomNodes"
  | "selIconNodes"
  | "c3794Nodes"
  | "fiberRoutes"
  | "opgwRoutes"
  | "distributionPoleDensity"
  | "distributionPoles"
  | "distributionFiberRoutes"
  | "distributionSplicePoints"
  | "distributionSlackLoops"
  | "distributionFiberAssignments"
  | "circuitEndpoints"
  | "workOrderLocations"
  | "proposedChanges"
  | "designAssets"
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
  | "draw_design_point"
  | "draw_design_line"
  | "draw_design_polygon"
  | "edit_geometry"
  | "delete_geometry"
  | "place_missing";
