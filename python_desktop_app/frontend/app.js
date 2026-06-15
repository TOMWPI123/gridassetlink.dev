const SVG_NS = "http://www.w3.org/2000/svg";

const isoNeBounds = [[-74.2, 40.8], [-66.7, 47.7]];
const isoNeMaxBounds = [[-75.4, 39.9], [-65.5, 48.6]];
const isoNeCenter = [-71.6, 43.6];
const mapConfig = {
  minZoom: 5.4,
  maxZoom: 18,
  defaultZoom: 6,
  tileSize: 256,
  tileMaxZoom: 18,
  rasterOpacity: 0.92,
};
const rasterTileUrl = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const rasterTileAttribution = "OpenStreetMap contributors, CARTO";
const rasterTileCache = new Map();

const mapStateShapes = [
  { label: "ME", coordinates: [[-71.1, 43.1], [-70.3, 43.8], [-70.8, 45.0], [-70.2, 46.0], [-69.0, 47.4], [-67.0, 47.2], [-66.9, 44.8], [-68.8, 43.4]] },
  { label: "NH", coordinates: [[-72.6, 42.7], [-70.8, 42.7], [-70.7, 43.3], [-71.2, 45.3], [-72.0, 45.3], [-72.4, 44.4]] },
  { label: "VT", coordinates: [[-73.4, 42.7], [-72.6, 42.7], [-72.4, 44.4], [-72.0, 45.3], [-73.4, 45.0]] },
  { label: "MA", coordinates: [[-73.5, 42.0], [-70.7, 42.0], [-70.0, 41.6], [-69.9, 42.2], [-70.8, 42.7], [-73.5, 42.7]] },
  { label: "CT", coordinates: [[-73.7, 41.0], [-71.8, 41.0], [-71.8, 42.05], [-73.5, 42.05]] },
  { label: "RI", coordinates: [[-71.9, 41.15], [-71.1, 41.15], [-71.1, 42.05], [-71.8, 42.05]] },
];

const mapPlaceLabels = [
  { label: "Maine", lon: -69.1, lat: 45.1, minZoom: 0, rank: 1 },
  { label: "New Hampshire", lon: -71.6, lat: 43.8, minZoom: 0, rank: 1 },
  { label: "Vermont", lon: -72.8, lat: 44.1, minZoom: 0, rank: 1 },
  { label: "Massachusetts", lon: -71.8, lat: 42.25, minZoom: 0, rank: 1 },
  { label: "Connecticut", lon: -72.7, lat: 41.55, minZoom: 0, rank: 1 },
  { label: "Rhode Island", lon: -71.45, lat: 41.72, minZoom: 0, rank: 1 },
  { label: "Boston", lon: -71.06, lat: 42.36, minZoom: 5.4, rank: 2 },
  { label: "Providence", lon: -71.41, lat: 41.82, minZoom: 5.6, rank: 2 },
  { label: "Portland", lon: -70.25, lat: 43.66, minZoom: 5.7, rank: 2 },
  { label: "Hartford", lon: -72.67, lat: 41.76, minZoom: 5.7, rank: 2 },
  { label: "Worcester", lon: -71.8, lat: 42.26, minZoom: 6.2, rank: 3 },
  { label: "Springfield", lon: -72.59, lat: 42.1, minZoom: 6.4, rank: 3 },
  { label: "Burlington", lon: -73.21, lat: 44.48, minZoom: 6.4, rank: 3 },
  { label: "Manchester", lon: -71.45, lat: 42.99, minZoom: 6.4, rank: 3 },
  { label: "Augusta", lon: -69.78, lat: 44.31, minZoom: 6.7, rank: 3 },
];

const mapStreetCorridors = [
  { label: "Coastal trunk", kind: "highway", minZoom: 0, coordinates: [[-73.2, 41.18], [-72.65, 41.32], [-72.08, 41.36], [-71.41, 41.82], [-71.06, 42.36], [-70.72, 42.58], [-70.25, 43.66], [-69.78, 44.31], [-69.05, 44.8]] },
  { label: "Merrimack utility route", kind: "highway", minZoom: 5.2, coordinates: [[-72.95, 42.08], [-72.1, 42.65], [-71.45, 42.99], [-71.34, 43.2], [-71.0, 43.92], [-70.78, 44.15]] },
  { label: "Green Mountain trunk", kind: "highway", minZoom: 5.4, coordinates: [[-73.35, 42.75], [-73.08, 43.18], [-72.9, 43.65], [-72.75, 44.1], [-73.21, 44.48], [-73.12, 44.83]] },
  { label: "Central Mass relay road", kind: "arterial", minZoom: 5.8, coordinates: [[-73.2, 42.1], [-72.59, 42.1], [-71.8, 42.26], [-71.31, 42.38], [-71.06, 42.36], [-70.78, 42.42]] },
  { label: "Northern fiber service road", kind: "arterial", minZoom: 6.1, coordinates: [[-71.78, 43.0], [-71.6, 43.45], [-71.3, 43.95], [-70.95, 44.32], [-70.45, 44.62], [-69.85, 44.92]] },
  { label: "Rhode Island access loop", kind: "arterial", minZoom: 6.4, coordinates: [[-71.8, 41.55], [-71.41, 41.82], [-71.12, 41.72], [-71.28, 41.45], [-71.8, 41.55]] },
  { label: "Connecticut service spine", kind: "arterial", minZoom: 6.3, coordinates: [[-73.45, 41.05], [-72.95, 41.31], [-72.67, 41.76], [-72.2, 41.78], [-71.83, 41.58]] },
  { label: "Maine interior access", kind: "arterial", minZoom: 6.3, coordinates: [[-70.75, 43.2], [-70.25, 43.66], [-69.78, 44.31], [-69.45, 44.9], [-68.78, 45.15], [-68.45, 45.55]] },
];

const mapLocalStreetAnchors = [
  { label: "Boston", lon: -71.06, lat: 42.36, prefixes: ["Station Ave", "Relay House Rd", "Harbor Fiber St"] },
  { label: "Providence", lon: -71.41, lat: 41.82, prefixes: ["Substation Way", "Canal Service Rd", "Feeder St"] },
  { label: "Hartford", lon: -72.67, lat: 41.76, prefixes: ["Control Center Dr", "Terminal Ave", "Fiber Loop Rd"] },
  { label: "Worcester", lon: -71.8, lat: 42.26, prefixes: ["Gridview Ave", "Splice Case Rd", "Central Service St"] },
  { label: "Manchester", lon: -71.45, lat: 42.99, prefixes: ["North Relay Rd", "Pole Line Ave", "Merrimack St"] },
  { label: "Portland", lon: -70.25, lat: 43.66, prefixes: ["Coastal Fiber Rd", "Harbor Substation St", "Utility Access Dr"] },
  { label: "Burlington", lon: -73.21, lat: 44.48, prefixes: ["Lake Fiber Rd", "Mountain Relay St", "Switchyard Ave"] },
];

const gisLayerCanvasOrder = {
  public_transmission_lines: 10,
  fcc_microwave_links: 12,
  public_substations: 16,
  fcc_utility_towers: 18,
  transmission_structures: 22,
  synthetic_substations: 26,
  opgw_cables: 34,
  distribution_fiber_routes: 38,
  distribution_poles_lite: 42,
  distribution_splice_points: 46,
  splice_closures: 48,
  legacy_fiber_routes: 56,
  legacy_telecom_circuits: 60,
  legacy_telecom_nodes: 64,
  legacy_work_orders: 68,
  proposed_changes: 72,
};

const assetTypes = {
  substation: { label: "Substations", color: "#68e1ad", shape: "diamond", geometry: "point" },
  transmission_line: { label: "Transmission lines", color: "#9fb6ff", shape: "line", geometry: "line" },
  distribution_pole: { label: "Distribution poles", color: "#f7c96b", shape: "circle", geometry: "point" },
  structure: { label: "Structures", color: "#b8c6c9", shape: "square", geometry: "point" },
  opgw_route: { label: "OPGW routes", color: "#6ee7f5", shape: "line", geometry: "line" },
  fiber_span: { label: "Fiber spans", color: "#44d07b", shape: "line", geometry: "line" },
  splice_point: { label: "Splice points", color: "#ff9f7a", shape: "circle", geometry: "point" },
  device: { label: "Devices", color: "#57c7ff", shape: "circle", geometry: "point" },
  circuit: { label: "Circuits", color: "#d59cff", shape: "line", geometry: "line" },
  service: { label: "Services", color: "#ff7d7d", shape: "line", geometry: "line" },
  work_order: { label: "Work orders", color: "#ffffff", shape: "square", geometry: "point" },
};

const state = {
  bootstrap: null,
  summary: null,
  assets: [],
  gisLayers: [],
  gisLayerData: {},
  gisLoading: {},
  selectedId: null,
  selectedGis: null,
  dependencies: null,
  editing: false,
  mapReady: false,
  mapView: { centerLon: isoNeCenter[0], centerLat: isoNeCenter[1], zoom: mapConfig.defaultZoom },
  mapProjection: null,
  mapRenderQueued: false,
  mapIsMoving: false,
  featureDragActive: false,
  mapSvgTarget: null,
  canvasHits: [],
  canvasClusterBubbles: [],
  canvasDrag: null,
  search: "",
  lifecycle: "all",
  status: "all",
  layers: Object.fromEntries(Object.keys(assetTypes).map((key) => [key, true])),
  bounds: { minLon: -72.05, maxLon: -70.85, minLat: 41.65, maxLat: 42.55 },
};

const dynamicFieldSets = {
  distribution_pole: [
    ["pole_number", "Pole number", "NEW-POLE"],
    ["utility_owner", "Utility owner", "TelecomNE Demo Utility"],
    ["telecom_role", "Telecom role", "fiber_lateral"],
    ["notes", "Notes", "Synthetic distribution pole created locally."],
  ],
  fiber_span: [
    ["cable_id", "Cable ID", "NEW-FBR"],
    ["cable_type", "Cable type", "OPGW"],
    ["from_structure_id", "From structure", "STR-NEW-A"],
    ["to_structure_id", "To structure", "STR-NEW-Z"],
    ["strand_range", "Strand range", "1-48"],
    ["construction_status", "Construction status", "proposed"],
    ["notes", "Notes", "Synthetic fiber span created locally."],
  ],
  splice_point: [
    ["splice_id", "Splice ID", "NEW-SPL"],
    ["splice_type", "Splice type", "inline_splice"],
    ["fiber_span_id", "Fiber span ID", "FBR-WBS-AUB-001"],
    ["splice_count", "Splice count", "12"],
    ["notes", "Notes", "Synthetic splice point created locally."],
  ],
  device: [
    ["device_id", "Device ID", "DEV-NEW-01"],
    ["device_type", "Device type", "SEL ICON"],
    ["site", "Site", "SUB-AUB"],
    ["rack", "Rack", "R1"],
    ["shelf", "Shelf", "S1"],
    ["slot", "Slot", "1"],
    ["port", "Port", "P01"],
    ["ip_address", "IP address", "10.60.99.10"],
    ["vendor_model", "Vendor/model", "SEL ICON 3620"],
    ["service_role", "Service role", "Protection transport"],
    ["operational_status", "Operational status", "planned"],
    ["notes", "Notes", "Synthetic device inventory record."],
  ],
  substation: [
    ["region", "Region", "MA Central"],
    ["state", "State", "MA"],
    ["voltage_kv", "Voltage kV", "115"],
    ["telecom_room", "Telecom room", "Demo relay house"],
    ["criticality", "Criticality", "normal"],
    ["notes", "Notes", "Synthetic substation created locally."],
  ],
  circuit: [
    ["circuit_id", "Circuit ID", "CIR-NEW-001"],
    ["service_type", "Service type", "SCADA"],
    ["bandwidth", "Bandwidth", "10 Mbps"],
    ["a_end", "A end", "DEV-AUB-OTN-01"],
    ["z_end", "Z end", "DEV-BOS-OTN-01"],
    ["criticality", "Criticality", "normal"],
    ["notes", "Notes", "Synthetic circuit record."],
  ],
  service: [
    ["service_id", "Service ID", "SVC-NEW-001"],
    ["service_type", "Service type", "Ethernet"],
    ["from_site", "From site", "SUB-AUB"],
    ["to_site", "To site", "SUB-BOS"],
    ["circuit_id", "Circuit ID", "CIR-ETH-AUB-BOS-002"],
    ["criticality", "Criticality", "normal"],
    ["notes", "Notes", "Synthetic service dependency record."],
  ],
};

const el = {
  startupNotice: document.getElementById("startup-notice"),
  visibleCount: document.getElementById("visible-count"),
  resultSummary: document.getElementById("result-summary"),
  layerList: document.getElementById("layer-list"),
  gisLayerList: document.getElementById("gis-layer-list"),
  gisLayerSummary: document.getElementById("gis-layer-summary"),
  assetResults: document.getElementById("asset-results"),
  assetMap: document.getElementById("asset-map"),
  assetCanvas: document.getElementById("asset-canvas"),
  mapZoomInButton: document.getElementById("map-zoom-in-button"),
  mapZoomOutButton: document.getElementById("map-zoom-out-button"),
  mapLegend: document.getElementById("map-legend"),
  mapPopup: document.getElementById("map-popup"),
  mapReadout: document.getElementById("map-readout"),
  mapStatusPill: document.getElementById("map-status-pill"),
  fitMapButton: document.getElementById("fit-map-button"),
  summaryCards: document.getElementById("summary-cards"),
  assetDetail: document.getElementById("asset-detail"),
  tileModeLabel: document.getElementById("tile-mode-label"),
  statusFilter: document.getElementById("status-filter"),
  lifecycleFilter: document.getElementById("lifecycle-filter"),
  searchInput: document.getElementById("search-input"),
  createForm: document.getElementById("create-form"),
  createType: document.getElementById("create-type"),
  dynamicFields: document.getElementById("dynamic-fields"),
  commandForm: document.getElementById("command-form"),
  commandInput: document.getElementById("command-input"),
  commandHistory: document.getElementById("command-history"),
  importText: document.getElementById("import-text"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail);
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function initLocalCanvasMap() {
  state.mapReady = Boolean(el.assetCanvas);
  if (!state.mapReady) {
    document.body.classList.add("map-offline-fallback");
    if (el.mapStatusPill) el.mapStatusPill.textContent = "Offline SVG planning map";
    return;
  }

  document.body.classList.add("map-canvas-mode");
  document.body.classList.remove("map-offline-fallback");
  updateMapChrome();
  requestMapOverlayRender();
  window.addEventListener("resize", requestMapOverlayRender);
}

async function load() {
  const [bootstrap, summaryPayload, assetPayload, gisPayload] = await Promise.all([
    api("/api/bootstrap"),
    api("/api/summary"),
    api("/api/assets"),
    api("/api/gis/layers"),
  ]);
  state.bootstrap = bootstrap;
  state.summary = summaryPayload;
  state.assets = assetPayload.assets;
  state.gisLayers = gisPayload.layers.map((layer) => ({ ...layer, visible: Boolean(layer.default_visible) }));
  await loadVisibleGisLayers();
  state.bounds = computeBounds(state.assets, allLoadedGisFeatures());
  el.startupNotice.textContent = bootstrap.synthetic_data_notice;
  el.tileModeLabel.textContent = "Custom canvas CARTO dark street map / bundled GIS overlays";
  fitMapToIsoNe(0);
  renderAll();
}

async function refreshAssets(selectId = state.selectedId) {
  const [summaryPayload, assetPayload] = await Promise.all([api("/api/summary"), api("/api/assets")]);
  state.summary = summaryPayload;
  state.assets = assetPayload.assets;
  state.bounds = computeBounds(state.assets, allLoadedGisFeatures());
  state.selectedId = selectId && state.assets.some((asset) => asset.id === selectId) ? selectId : null;
  state.selectedGis = state.selectedId ? null : state.selectedGis;
  state.dependencies = null;
  state.editing = false;
  renderAll();
}

async function loadVisibleGisLayers() {
  const visibleLayers = state.gisLayers.filter((layer) => layer.visible && !state.gisLayerData[layer.id] && !state.gisLoading[layer.id]);
  await Promise.all(visibleLayers.map((layer) => loadGisLayer(layer.id)));
}

async function loadGisLayer(layerId) {
  state.gisLoading[layerId] = true;
  try {
    const layer = state.gisLayers.find((candidate) => candidate.id === layerId);
    const limit = layer?.render_limit || 600;
    const payload = await api(`/api/gis/layers/${encodeURIComponent(layerId)}?limit=${limit}`);
    state.gisLayerData[layerId] = payload;
  } finally {
    state.gisLoading[layerId] = false;
  }
}

function allLoadedGisFeatures() {
  return Object.values(state.gisLayerData).flatMap((payload) => payload?.feature_collection?.features || []);
}

function visibleLoadedGisFeatures() {
  return state.gisLayers
    .filter((layer) => layer.visible)
    .flatMap((layer) => state.gisLayerData[layer.id]?.feature_collection?.features || []);
}

function requestMapOverlayRender() {
  updateMapChrome();
  if (state.featureDragActive) return;
  if (state.mapRenderQueued) return;
  state.mapRenderQueued = true;
  window.requestAnimationFrame(() => {
    state.mapRenderQueued = false;
    renderMap();
    setMapMoving(false);
  });
}

function setMapMoving(moving) {
  state.mapIsMoving = moving;
  el.assetMap?.classList.toggle("map-moving", moving);
  el.assetCanvas?.classList.toggle("map-moving", moving);
  el.mapPopup?.classList.toggle("map-moving", moving);
}

function updateMapChrome() {
  if (!el.mapReadout || !el.mapStatusPill) return;
  if (!state.mapReady) {
    el.mapReadout.textContent = "Offline SVG";
    el.mapStatusPill.textContent = "Offline SVG planning map";
    return;
  }
  el.mapReadout.textContent = `Zoom ${state.mapView.zoom.toFixed(1)} / ${mapDetailLabel()} / ${state.mapView.centerLon.toFixed(3)}, ${state.mapView.centerLat.toFixed(3)}`;
  el.mapStatusPill.textContent = `Custom canvas map / CARTO dark / ${mapDetailLabel()}`;
}

function fitMapToIsoNe(_duration = 420) {
  if (!state.mapReady) return;
  fitMapBounds(isoNeBounds, { top: 28, right: 28, bottom: 28, left: 28 });
  requestMapOverlayRender();
}

function fitMapToData(_duration = 420) {
  if (!state.mapReady) return;
  const coordinates = [
    ...getVisibleAssets().flatMap((asset) => allCoordinates(asset.geometry)),
    ...visibleLoadedGisFeatures().flatMap((feature) => allCoordinates(feature.geometry)),
  ].filter(isCoordinate);
  const bounds = coordinates.length ? boundsFromCoordinates(coordinates) : isoNeBounds;
  fitMapBounds(bounds);
  requestMapOverlayRender();
}

function boundsFromCoordinates(coordinates) {
  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function renderAll() {
  renderStatusOptions();
  renderLayerControls();
  renderGisLayerControls();
  renderSummary();
  renderMap();
  renderResults();
  renderDetail();
  renderDynamicFields();
}

function getVisibleAssets() {
  const query = state.search.trim().toLowerCase();
  return state.assets.filter((asset) => {
    if (!state.layers[asset.asset_type]) return false;
    if (state.lifecycle !== "all" && asset.lifecycle !== state.lifecycle) return false;
    if (state.status !== "all" && asset.status !== state.status) return false;
    if (!query) return true;
    return assetSearchText(asset).includes(query);
  });
}

function assetSearchText(asset) {
  return [
    asset.id,
    asset.asset_type,
    asset.name,
    asset.status,
    asset.lifecycle,
    JSON.stringify(asset.properties || {}),
  ]
    .join(" ")
    .toLowerCase();
}

function renderStatusOptions() {
  const statuses = Array.from(new Set(state.assets.map((asset) => asset.status))).sort();
  const current = state.status;
  el.statusFilter.innerHTML = '<option value="all">All</option>' + statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  el.statusFilter.value = statuses.includes(current) ? current : "all";
  state.status = el.statusFilter.value;
}

function renderLayerControls() {
  el.layerList.innerHTML = Object.entries(assetTypes)
    .map(([key, config]) => {
      const count = state.assets.filter((asset) => asset.asset_type === key).length;
      return `
        <label class="layer-row street-layer-toggle ${state.layers[key] ? "active" : ""}">
          <input type="checkbox" data-layer="${key}" ${state.layers[key] ? "checked" : ""} />
          <span class="layer-color" style="background:${config.color}"></span>
          <span class="layer-copy">
            <strong>${config.label}</strong>
            <small>${count} records</small>
          </span>
        </label>
      `;
    })
    .join("");

  el.layerList.querySelectorAll("input[data-layer]").forEach((input) => {
    input.addEventListener("change", () => {
      state.layers[input.dataset.layer] = input.checked;
      renderAll();
    });
  });
}

function renderGisLayerControls() {
  const totalFeatures = state.gisLayers.reduce((sum, layer) => sum + (layer.feature_count || 0), 0);
  const visibleCount = state.gisLayers.filter((layer) => layer.visible).length;
  el.gisLayerSummary.textContent = `${visibleCount} on / ${totalFeatures.toLocaleString()} features`;
  el.gisLayerList.innerHTML = state.gisLayers
    .map((layer) => {
      const payload = state.gisLayerData[layer.id];
      const renderedCount = payload?.rendered_count || 0;
      const countLabel = payload
        ? `${renderedCount.toLocaleString()} shown / ${layer.feature_count.toLocaleString()} total`
        : `${layer.feature_count.toLocaleString()} records`;
      return `
        <label class="layer-row street-layer-toggle gis-row ${layer.visible ? "active" : ""}">
          <input type="checkbox" data-gis-layer="${escapeHtml(layer.id)}" ${layer.visible ? "checked" : ""} ${layer.available ? "" : "disabled"} />
          <span class="layer-color" style="background:${layer.color}"></span>
          <span class="layer-copy">
            <strong>${escapeHtml(layer.label)}</strong>
            <small>${escapeHtml(layer.category)} / ${escapeHtml(countLabel)}</small>
          </span>
        </label>
      `;
    })
    .join("");

  el.gisLayerList.querySelectorAll("input[data-gis-layer]").forEach((input) => {
    input.addEventListener("change", async () => {
      const layer = state.gisLayers.find((candidate) => candidate.id === input.dataset.gisLayer);
      if (!layer) return;
      layer.visible = input.checked;
      if (layer.visible && !state.gisLayerData[layer.id]) {
        renderGisLayerControls();
        await loadGisLayer(layer.id);
      }
      state.bounds = computeBounds(state.assets, allLoadedGisFeatures());
      renderAll();
    });
  });
}

function renderSummary() {
  const summary = state.summary || { total: 0, by_type: {}, by_lifecycle: {}, high_risk_count: 0 };
  const visible = getVisibleAssets();
  const gisRendered = state.gisLayers
    .filter((layer) => layer.visible)
    .reduce((sum, layer) => sum + (state.gisLayerData[layer.id]?.rendered_count || 0), 0);
  const cards = [
    ["Visible", visible.length],
    ["All records", summary.total],
    ["Fiber spans", summary.by_type.fiber_span || 0],
    ["GIS shown", gisRendered],
  ];
  el.summaryCards.innerHTML = cards
    .map(([label, value]) => `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
  el.visibleCount.textContent = `${visible.length} visible`;
  el.resultSummary.textContent = `${state.assets.length} total local records`;
}

function renderResults() {
  const visible = getVisibleAssets();
  el.assetResults.innerHTML = visible.slice(0, 90).map((asset) => {
    const config = assetTypes[asset.asset_type] || assetTypes.substation;
    return `
      <button class="asset-result ${asset.id === state.selectedId ? "active" : ""}" type="button" data-asset-id="${escapeHtml(asset.id)}">
        <span>${escapeHtml(config.label)} / ${escapeHtml(asset.lifecycle)}</span>
        <strong>${escapeHtml(asset.name)}</strong>
      </button>
    `;
  }).join("") || '<div class="empty-state">No assets match the active filters.</div>';
  el.assetResults.querySelectorAll("[data-asset-id]").forEach((button) => {
    button.addEventListener("click", () => selectAsset(button.dataset.assetId));
  });
}

function renderMap() {
  const visible = getVisibleAssets();
  const visibleGisLayers = state.gisLayers.filter((layer) => layer.visible && state.gisLayerData[layer.id]);
  if (state.mapReady && el.assetCanvas) {
    document.body.classList.add("map-canvas-mode");
    el.assetMap.replaceChildren();
    renderCanvasMap(visible, visibleGisLayers);
    renderLegend(visibleGisLayers);
    renderMapPopup();
    updateMapChrome();
    return;
  }

  document.body.classList.remove("map-canvas-mode");
  const fragment = document.createDocumentFragment();
  state.mapSvgTarget = fragment;
  drawMapBase();

  visibleGisLayers.forEach(drawGisLayer);

  const lines = visible.filter((asset) => asset.geometry.type !== "Point");
  const points = visible.filter((asset) => asset.geometry.type === "Point");
  lines.forEach(drawLineAsset);
  points.forEach(drawPointAsset);
  el.assetMap.replaceChildren(fragment);
  state.mapSvgTarget = null;
  renderLegend(visibleGisLayers);
  renderMapPopup();
  updateMapChrome();
}

function renderLegend(visibleGisLayers) {
  const contextItems = `
    <span><i class="legend-swatch street-swatch"></i>CARTO dark streets</span>
    <span><i class="legend-swatch scale-swatch"></i>${escapeHtml(humanize(mapDetailLabel()))}</span>
  `;
  const legendItems = contextItems + Object.entries(assetTypes)
    .filter(([key]) => state.layers[key])
    .map(([, config]) => `<span><i class="legend-swatch" style="background:${config.color}"></i>${config.label}</span>`)
    .join("") + visibleGisLayers.slice(0, 8).map((layer) => `<span><i class="legend-swatch gis-swatch" style="background:${layer.color}"></i>${escapeHtml(layer.label)}</span>`).join("");
  el.mapLegend.innerHTML = `
    <div class="local-legend-title">Active Map Layers</div>
    <div class="local-legend-list">${legendItems}</div>
  `;
}

function renderCanvasMap(visible, visibleGisLayers) {
  const canvas = el.assetCanvas;
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const size = resizeCanvasToDisplaySize(canvas);
  updateProjectionContext({ width: size.cssWidth, height: size.cssHeight });
  context.clearRect(0, 0, size.width, size.height);
  context.save();
  context.scale(size.dpr, size.dpr);
  context.lineCap = "round";
  context.lineJoin = "round";
  state.canvasHits = [];
  state.canvasClusterBubbles = [];

  drawCanvasBase(context, size);

  sortedCanvasGisLayers(visibleGisLayers).forEach((layer) => drawCanvasGisLayer(context, layer, size));
  const visibleIsoAssets = visible.filter((asset) => geometryIntersectsIsoNe(asset.geometry));
  visibleIsoAssets.filter((asset) => asset.geometry.type !== "Point").forEach((asset) => drawCanvasLineAsset(context, asset));
  visibleIsoAssets.filter((asset) => asset.geometry.type === "Point").forEach((asset) => drawCanvasPointAsset(context, asset));

  context.fillStyle = "rgba(232, 255, 251, 0.28)";
  context.font = "11px Inter, system-ui, sans-serif";
  context.fillText("Custom canvas planning overlay / fictional demo records only", 18, size.cssHeight - 18);
  context.textAlign = "right";
  context.fillStyle = "rgba(232, 255, 251, 0.36)";
  context.fillText(rasterTileAttribution, size.cssWidth - 14, size.cssHeight - 18);
  context.restore();
}

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, cssWidth, cssHeight, dpr };
}

function drawCanvasBase(context, size) {
  const { cssWidth, cssHeight } = size;
  const gradient = context.createLinearGradient(0, 0, cssWidth, cssHeight);
  gradient.addColorStop(0, "#0b1114");
  gradient.addColorStop(0.56, "#071012");
  gradient.addColorStop(1, "#0b1113");
  context.fillStyle = gradient;
  context.fillRect(0, 0, cssWidth, cssHeight);

  const tileStats = drawCanvasRasterTiles(context, size);
  const usingRasterBase = tileStats.loaded > 0;

  if (!usingRasterBase) {
    context.save();
    context.globalAlpha = 0.95;
    context.strokeStyle = "rgba(178, 233, 226, 0.075)";
    context.lineWidth = 1;
    for (let lon = -75; lon <= -66; lon += 1) {
      const start = projectCss(lon, 40.5);
      const end = projectCss(lon, 48);
      drawBaseLine(context, start, end);
    }
    for (let lat = 41; lat <= 48; lat += 1) {
      const start = projectCss(-75, lat);
      const end = projectCss(-66, lat);
      drawBaseLine(context, start, end);
    }
    context.restore();
  }

  mapStateShapes.forEach((shape, index) => {
    const points = shape.coordinates.map(([lon, lat]) => projectCss(lon, lat)).filter(Boolean);
    if (points.length < 3) return;
    context.save();
    context.fillStyle = "rgba(239, 201, 95, 0.055)";
    context.strokeStyle = "rgba(239, 201, 95, 0.34)";
    context.lineWidth = 1.35;
    context.setLineDash([6, 4]);
    context.beginPath();
    points.forEach((point, pointIndex) => {
      if (pointIndex === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    const center = polygonCentroid(points);
    context.save();
    context.fillStyle = "rgba(232, 255, 251, 0.18)";
    context.font = "800 12px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(shape.label, center.x, center.y);
    context.restore();
  });

  if (!usingRasterBase) drawCanvasStreetContext(context, size);

  context.save();
  context.font = "700 11px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  mapPlaceLabels.forEach(({ label, lon, lat, minZoom, rank }) => {
    if (state.mapView.zoom < minZoom) return;
    const point = projectCss(lon, lat);
    if (!point || point.x < -60 || point.y < -30 || point.x > cssWidth + 60 || point.y > cssHeight + 30) return;
    context.fillStyle = rank === 1 ? "rgba(232, 255, 251, 0.36)" : "rgba(232, 255, 251, 0.62)";
    context.strokeStyle = "rgba(4, 13, 15, 0.82)";
    context.lineWidth = rank === 1 ? 2.5 : 3;
    context.font = `${rank === 1 ? 800 : 760} ${rank === 1 ? 12 : 11}px Inter, system-ui, sans-serif`;
    context.strokeText(label, point.x, point.y);
    context.fillText(label, point.x, point.y);
  });
  context.restore();

  if (!usingRasterBase) {
    context.save();
    context.strokeStyle = "rgba(105, 215, 228, 0.1)";
    context.lineWidth = 1;
    for (let x = -cssHeight; x < cssWidth + cssHeight; x += 46) {
      context.beginPath();
      context.moveTo(x, cssHeight);
      context.lineTo(x + cssHeight * 0.72, 0);
      context.stroke();
    }
    context.restore();
  }
}

function drawCanvasRasterTiles(context, size) {
  const projection = state.mapProjection || updateProjectionContext({ width: size.cssWidth, height: size.cssHeight });
  const tileZoom = Math.max(0, Math.min(mapConfig.tileMaxZoom, Math.floor(state.mapView.zoom)));
  const tileCount = 2 ** tileZoom;
  const tileCssSize = mapConfig.tileSize * 2 ** (state.mapView.zoom - tileZoom);
  const worldLeft = projection.center.x - size.cssWidth / 2 / projection.scale;
  const worldTop = projection.center.y - size.cssHeight / 2 / projection.scale;
  const worldRight = projection.center.x + size.cssWidth / 2 / projection.scale;
  const worldBottom = projection.center.y + size.cssHeight / 2 / projection.scale;
  const minTileX = Math.floor((worldLeft / mapConfig.tileSize) * tileCount) - 1;
  const maxTileX = Math.floor((worldRight / mapConfig.tileSize) * tileCount) + 1;
  const minTileY = Math.floor((worldTop / mapConfig.tileSize) * tileCount) - 1;
  const maxTileY = Math.floor((worldBottom / mapConfig.tileSize) * tileCount) + 1;
  let loaded = 0;
  let pending = 0;

  context.save();
  context.globalAlpha = mapConfig.rasterOpacity;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "low";
  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    if (tileX < 0 || tileX >= tileCount) continue;
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      const tile = getRasterTile(tileZoom, tileX, tileY);
      if (tile.status === "loaded") {
        const tileWorldX = (tileX / tileCount) * mapConfig.tileSize;
        const tileWorldY = (tileY / tileCount) * mapConfig.tileSize;
        const cssX = size.cssWidth / 2 + (tileWorldX - projection.center.x) * projection.scale;
        const cssY = size.cssHeight / 2 + (tileWorldY - projection.center.y) * projection.scale;
        context.drawImage(tile.image, cssX, cssY, tileCssSize + 0.5, tileCssSize + 0.5);
        loaded += 1;
      } else if (tile.status === "loading") {
        pending += 1;
      }
    }
  }
  context.restore();

  return { loaded, pending };
}

function getRasterTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  const cached = rasterTileCache.get(key);
  if (cached) return cached;
  const image = new Image();
  const tile = { image, status: "loading" };
  rasterTileCache.set(key, tile);
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.onload = () => {
    tile.status = "loaded";
    requestMapOverlayRender();
  };
  image.onerror = () => {
    tile.status = "failed";
  };
  image.src = rasterTileUrl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  return tile;
}

function drawCanvasStreetContext(context, size) {
  const zoom = state.mapView.zoom;
  mapStreetCorridors
    .filter((road) => zoom >= road.minZoom)
    .forEach((road) => drawCanvasRoad(context, road, size));

  if (zoom >= 7.25) {
    mapLocalStreetAnchors.forEach((anchor) => drawLocalStreetGrid(context, anchor, size));
  }
}

function drawCanvasRoad(context, road, size) {
  const points = projectedCanvasLine(road.coordinates);
  if (points.length < 2 || !lineIntersectsViewport(points, size, 80)) return;
  const zoom = state.mapView.zoom;
  const isHighway = road.kind === "highway";
  const width = isHighway
    ? clamp(2.6 + (zoom - 5) * 0.78, 2.4, 7.4)
    : clamp(1.4 + (zoom - 5.8) * 0.52, 1.2, 4.6);
  context.save();
  context.globalAlpha = isHighway ? 0.82 : 0.68;
  context.strokeStyle = "rgba(2, 10, 12, 0.78)";
  context.lineWidth = width + (isHighway ? 3.8 : 2.2);
  strokeCanvasLine(context, points);
  context.strokeStyle = isHighway ? "rgba(239, 201, 95, 0.88)" : "rgba(175, 221, 223, 0.7)";
  context.lineWidth = width;
  if (!isHighway) context.setLineDash([9, 7]);
  strokeCanvasLine(context, points);
  context.restore();

  if (zoom >= (isHighway ? 5.7 : 7.0)) {
    drawLineLabel(context, points, road.label, isHighway ? "#ffe7a6" : "#cbe4e4", size);
  }
}

function drawLocalStreetGrid(context, anchor, size) {
  const zoom = state.mapView.zoom;
  const extent = zoom >= 10 ? 0.12 : 0.075;
  const step = zoom >= 10 ? 0.026 : 0.04;
  const streets = [];
  for (let offset = -extent; offset <= extent + 0.0001; offset += step) {
    streets.push({
      label: anchor.prefixes[Math.abs(Math.round(offset * 1000)) % anchor.prefixes.length],
      coordinates: [[anchor.lon - extent, anchor.lat + offset], [anchor.lon + extent, anchor.lat + offset + 0.018]],
    });
    streets.push({
      label: anchor.prefixes[(Math.abs(Math.round(offset * 1000)) + 1) % anchor.prefixes.length],
      coordinates: [[anchor.lon + offset, anchor.lat - extent], [anchor.lon + offset + 0.016, anchor.lat + extent]],
    });
  }

  context.save();
  streets.forEach((street, index) => {
    const points = projectedCanvasLine(street.coordinates);
    if (points.length < 2 || !lineIntersectsViewport(points, size, 24)) return;
    context.globalAlpha = clamp((zoom - 7.1) / 3.4, 0.18, 0.58);
    context.strokeStyle = "rgba(202, 226, 226, 0.58)";
    context.lineWidth = clamp(0.65 + (zoom - 7.5) * 0.22, 0.65, 1.8);
    strokeCanvasLine(context, points);
    if (zoom >= 9.25 && index % 3 === 0) drawLineLabel(context, points, street.label, "#d7eceb", size, 9);
  });
  context.restore();
}

function drawLineLabel(context, points, label, color, size, fontSize = 10) {
  const midIndex = Math.max(1, Math.floor(points.length / 2));
  const a = points[midIndex - 1];
  const b = points[midIndex] || points[midIndex - 1];
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  if (x < 20 || y < 20 || x > size.cssWidth - 20 || y > size.cssHeight - 20) return;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.font = `760 ${fontSize}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 3.2;
  context.strokeStyle = "rgba(4, 13, 15, 0.9)";
  context.fillStyle = color;
  context.strokeText(label, 0, -6);
  context.fillText(label, 0, -6);
  context.restore();
}

function lineIntersectsViewport(points, size, pad = 0) {
  return points.some((point) => point.x >= -pad && point.y >= -pad && point.x <= size.cssWidth + pad && point.y <= size.cssHeight + pad);
}

function mapDetailLabel() {
  if (state.mapView.zoom >= 9.25) return "local streets";
  if (state.mapView.zoom >= 7.25) return "street grid";
  if (state.mapView.zoom >= 5.85) return "arterials";
  return "regional roads";
}

function drawBaseLine(context, start, end) {
  if (!start || !end) return;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

function polygonCentroid(points) {
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function sortedCanvasGisLayers(layers) {
  return layers.slice().sort((a, b) => gisLayerDrawOrder(a.id) - gisLayerDrawOrder(b.id));
}

function gisLayerDrawOrder(layerId) {
  return gisLayerCanvasOrder[layerId] ?? 100;
}

function drawCanvasGisLayer(context, layer, size) {
  const payload = state.gisLayerData[layer.id];
  const features = (payload?.feature_collection?.features || []).filter((feature) => geometryIntersectsIsoNe(feature.geometry));
  if (shouldClusterCanvasPointLayer(layer)) {
    drawCanvasGisPointClusters(context, layer, features, size);
    return;
  }
  features.forEach((feature, index) => {
    const geometry = feature.geometry || {};
    if (geometry.type === "Point") {
      drawCanvasGisPoint(context, layer, feature, index, size);
    } else {
      lineCoordinateParts(geometry).forEach((coordinates) => drawCanvasGisLine(context, layer, feature, index, coordinates, size));
    }
  });
}

function shouldClusterCanvasPointLayer(layer) {
  if (state.mapView.zoom > 8.4) return false;
  return [
    "public_substations",
    "synthetic_substations",
    "transmission_structures",
    "distribution_poles_lite",
    "distribution_splice_points",
    "splice_closures",
    "fcc_utility_towers",
    "legacy_telecom_nodes",
    "legacy_work_orders",
  ].includes(layer.id);
}

function drawCanvasGisPointClusters(context, layer, features, size) {
  const clusters = new Map();
  const singles = [];
  const cellSize = canvasClusterCellSize(layer);
  features.forEach((feature, index) => {
    if (feature.geometry?.type !== "Point") return;
    const [lon, lat] = feature.geometry.coordinates || [];
    const point = projectCss(lon, lat);
    if (!point || point.x < -80 || point.y < -80 || point.x > size.cssWidth + 80 || point.y > size.cssHeight + 80) return;
    const selected = isSelectedGis(layer.id, index);
    if (selected) {
      singles.push({ feature, index, point });
      return;
    }
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const cluster = clusters.get(key) || { x: 0, y: 0, count: 0, feature, index };
    cluster.x += point.x;
    cluster.y += point.y;
    cluster.count += 1;
    clusters.set(key, cluster);
  });

  clusters.forEach((cluster) => {
    if (cluster.count <= 1) {
      singles.push({ feature: cluster.feature, index: cluster.index, point: { x: cluster.x, y: cluster.y } });
      return;
    }
    cluster.x /= cluster.count;
    cluster.y /= cluster.count;
    drawCanvasGisCluster(context, layer, cluster, size);
  });

  singles.forEach(({ feature, index }) => drawCanvasGisPoint(context, layer, feature, index, size));
}

function canvasClusterCellSize(layer) {
  const zoom = state.mapView.zoom;
  if (layer.id === "distribution_poles_lite") return zoom < 7 ? 132 : 96;
  if (layer.id === "public_substations") return zoom < 7 ? 112 : 86;
  if (layer.id === "legacy_telecom_nodes") return zoom < 7 ? 104 : 78;
  return zoom < 7 ? 108 : 82;
}

function drawCanvasGisCluster(context, layer, cluster, size) {
  const color = canvasClusterColor(layer);
  const radius = clamp(10 + Math.sqrt(cluster.count) * 4.2, 15, 30);
  const placed = placeCanvasCluster(cluster.x, cluster.y, radius, size);
  context.save();
  context.globalAlpha = canvasClusterAlpha(layer);
  context.fillStyle = color;
  context.strokeStyle = "rgba(232, 255, 251, 0.86)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(placed.x, placed.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = "#071012";
  context.strokeStyle = "rgba(255,255,255,0.62)";
  context.lineWidth = 2;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const label = canvasClusterLabelParts(layer, cluster.count);
  context.font = "850 11px Inter, system-ui, sans-serif";
  context.strokeText(label[0], placed.x, placed.y - 4);
  context.fillText(label[0], placed.x, placed.y - 4);
  context.font = "760 8.5px Inter, system-ui, sans-serif";
  context.strokeText(label[1], placed.x, placed.y + 8);
  context.fillText(label[1], placed.x, placed.y + 8);
  context.restore();
  state.canvasHits.push({ type: "gis", geometry: "point", layerId: layer.id, index: cluster.index, x: placed.x, y: placed.y, radius: radius + 6 });
}

function placeCanvasCluster(x, y, radius, size) {
  const padding = radius + 8;
  const clampX = (value) => clamp(value, padding, size.cssWidth - padding);
  const clampY = (value) => clamp(value, padding + 14, size.cssHeight - padding - 38);
  const candidates = [{ x: clampX(x), y: clampY(y) }];
  const step = radius + 9;
  for (let ring = 1; ring <= 4; ring += 1) {
    const distance = step * ring;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      candidates.push({
        x: clampX(x + Math.cos(angle) * distance),
        y: clampY(y + Math.sin(angle) * distance),
      });
    }
  }

  let best = candidates[0];
  let bestOverlap = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const overlap = clusterOverlapScore(candidate.x, candidate.y, radius);
    if (overlap <= 0) {
      state.canvasClusterBubbles.push({ x: candidate.x, y: candidate.y, radius });
      return candidate;
    }
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      best = candidate;
    }
  }
  state.canvasClusterBubbles.push({ x: best.x, y: best.y, radius });
  return best;
}

function clusterOverlapScore(x, y, radius) {
  return state.canvasClusterBubbles.reduce((score, bubble) => {
    const gap = Math.hypot(bubble.x - x, bubble.y - y) - (bubble.radius + radius + 5);
    return gap < 0 ? score + Math.abs(gap) : score;
  }, 0);
}

function canvasClusterColor(layer) {
  const colors = {
    public_substations: "#7dd3fc",
    synthetic_substations: "#ffb84d",
    transmission_structures: "#c9d4d8",
    distribution_poles_lite: "#52f2c8",
    distribution_splice_points: "#ffb84d",
    splice_closures: "#ffb84d",
    fcc_utility_towers: "#f5a524",
    legacy_telecom_nodes: "#28c7a9",
    legacy_work_orders: "#efc95f",
  };
  return colors[layer.id] || layer.color || "#7dd3fc";
}

function canvasClusterAlpha(layer) {
  if (layer.id === "distribution_poles_lite") return 0.78;
  if (layer.id === "legacy_telecom_nodes") return 0.7;
  return 0.76;
}

function canvasClusterLabelParts(layer, count) {
  const labels = {
    public_substations: "substations",
    synthetic_substations: "synthetic",
    transmission_structures: "structures",
    distribution_poles_lite: "poles",
    distribution_splice_points: "splices",
    splice_closures: "splice",
    fcc_utility_towers: "FCC",
    legacy_telecom_nodes: "nodes",
    legacy_work_orders: "orders",
  };
  return [formatClusterCount(count), labels[layer.id] || "features"];
}

function formatClusterCount(count) {
  if (count >= 1000) return `${Math.round(count / 100) / 10}k`;
  return String(count);
}

function drawCanvasGisLine(context, layer, feature, index, coordinates, size) {
  const points = projectedCanvasLine(coordinates);
  if (points.length < 2 || !lineIntersectsViewport(points, size, 120)) return;
  const selected = isSelectedGis(layer.id, index);
  const style = canvasGisLineStyle(layer, selected);
  context.save();
  if (style.casingWidth) {
    context.globalAlpha = style.casingAlpha;
    context.strokeStyle = style.casingColor;
    context.lineWidth = style.casingWidth;
    strokeCanvasLine(context, points);
  }
  context.globalAlpha = style.alpha;
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  if (style.dash?.length) context.setLineDash(style.dash);
  strokeCanvasLine(context, points);
  context.restore();
  if (shouldLabelCanvasGisFeature(layer, index, style, selected)) {
    drawLineLabel(context, points, mapFeatureLabel(layer, feature), style.labelColor || style.color, size, style.labelSize || 10);
  }
  state.canvasHits.push({ type: "gis", geometry: "line", layerId: layer.id, index, points, tolerance: selected ? 11 : style.hitTolerance });
}

function drawCanvasGisPoint(context, layer, feature, index, size) {
  const [lon, lat] = feature.geometry.coordinates || [0, 0];
  const point = projectCss(lon, lat);
  if (!point || point.x < -60 || point.y < -60 || point.x > size.cssWidth + 60 || point.y > size.cssHeight + 60) return;
  const selected = isSelectedGis(layer.id, index);
  const style = canvasGisPointStyle(layer, selected);
  if (!selected && state.mapView.zoom < style.visibleZoom) return;
  context.save();
  context.globalAlpha = style.alpha;
  context.fillStyle = style.fill;
  context.strokeStyle = style.stroke;
  context.lineWidth = style.strokeWidth;
  if (style.halo) {
    context.beginPath();
    context.arc(point.x, point.y, style.radius + style.halo, 0, Math.PI * 2);
    context.fillStyle = style.haloFill;
    context.fill();
    context.fillStyle = style.fill;
  }
  context.beginPath();
  if (style.shape === "square") {
    context.rect(point.x - style.radius, point.y - style.radius, style.radius * 2, style.radius * 2);
  } else if (style.shape === "diamond") {
    context.moveTo(point.x, point.y - style.radius);
    context.lineTo(point.x + style.radius, point.y);
    context.lineTo(point.x, point.y + style.radius);
    context.lineTo(point.x - style.radius, point.y);
    context.closePath();
  } else {
    context.arc(point.x, point.y, style.radius, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.restore();
  if (shouldLabelCanvasGisFeature(layer, index, style, selected)) {
    drawPointLabel(context, point, mapFeatureLabel(layer, feature), style.labelColor || style.fill, size);
  }
  state.canvasHits.push({ type: "gis", geometry: "point", layerId: layer.id, index, x: point.x, y: point.y, radius: selected ? 13 : style.hitRadius });
}

function canvasGisLineStyle(layer, selected) {
  const zoom = state.mapView.zoom;
  const styles = {
    public_transmission_lines: {
      color: "#8398df",
      width: clamp(1.05 + (zoom - 5) * 0.18, 1.05, 2.3),
      alpha: 0.48,
      casingWidth: 3.6,
      labelZoom: 10.8,
      hitTolerance: 7,
    },
    fcc_microwave_links: {
      color: "#d59cff",
      width: clamp(1 + (zoom - 5) * 0.14, 1, 2),
      alpha: 0.5,
      dash: [8, 7],
      labelZoom: 10.6,
      hitTolerance: 7,
    },
    opgw_cables: {
      color: "#6ee7f5",
      width: clamp(2.1 + (zoom - 5) * 0.34, 2.1, 5.1),
      alpha: 0.9,
      casingWidth: clamp(5.5 + (zoom - 5) * 0.36, 5.5, 8.8),
      casingAlpha: 0.54,
      labelZoom: 7.9,
      labelSize: 10,
      hitTolerance: 9,
    },
    distribution_fiber_routes: {
      color: "#52f2c8",
      width: clamp(1.6 + (zoom - 5.5) * 0.36, 1.4, 4.2),
      alpha: 0.82,
      casingWidth: clamp(4.3 + (zoom - 5.5) * 0.28, 4, 7),
      casingAlpha: 0.42,
      labelZoom: 8.35,
      hitTolerance: 8,
    },
    legacy_fiber_routes: {
      color: "#44d07b",
      width: clamp(2.2 + (zoom - 5.5) * 0.3, 2.1, 4.8),
      alpha: 0.9,
      casingWidth: clamp(5 + (zoom - 5.5) * 0.32, 4.8, 8.4),
      casingAlpha: 0.48,
      labelZoom: 7.75,
      hitTolerance: 9,
    },
    legacy_telecom_circuits: {
      color: "#ff7d7d",
      width: clamp(1.7 + (zoom - 5.5) * 0.28, 1.7, 4),
      alpha: 0.86,
      dash: [11, 7],
      casingWidth: clamp(4.2 + (zoom - 5.5) * 0.24, 4.2, 7.2),
      casingAlpha: 0.42,
      labelZoom: 8.1,
      hitTolerance: 8,
    },
    proposed_changes: {
      color: "#f7c96b",
      width: clamp(2.1 + (zoom - 5.5) * 0.3, 2.1, 4.8),
      alpha: 0.92,
      dash: [8, 5],
      casingWidth: clamp(5.2 + (zoom - 5.5) * 0.34, 5.2, 8.6),
      casingAlpha: 0.5,
      labelZoom: 7.65,
      hitTolerance: 9,
    },
  };
  const base = {
    color: layer.color || "#b6d8d2",
    width: clamp(1.5 + (zoom - 5) * 0.2, 1.4, 3.6),
    alpha: 0.66,
    casingColor: "rgba(3, 11, 13, 0.78)",
    casingAlpha: 0.36,
    casingWidth: 0,
    dash: [],
    labelZoom: 9.4,
    labelSize: 9,
    hitTolerance: 7,
    ...(styles[layer.id] || {}),
  };
  base.casingColor ||= "rgba(3, 11, 13, 0.78)";
  base.casingAlpha ??= 0.38;
  base.dash ||= [];
  if (!selected) return base;
  return {
    ...base,
    color: "#fff4cf",
    alpha: 0.98,
    width: Math.max(base.width + 1.8, 4.2),
    casingWidth: Math.max(base.casingWidth || 0, base.width + 5),
    casingAlpha: 0.68,
    dash: [],
    labelZoom: 0,
    labelSize: 11,
    hitTolerance: 12,
  };
}

function canvasGisPointStyle(layer, selected) {
  const zoom = state.mapView.zoom;
  const styles = {
    public_substations: { fill: "#68e1ad", radius: clamp(3.3 + (zoom - 5) * 0.17, 3.2, 5.4), alpha: 0.7, labelZoom: 10.4, visibleZoom: 0 },
    synthetic_substations: { fill: "#54d6ff", radius: clamp(4.2 + (zoom - 5) * 0.2, 4.2, 6.4), alpha: 0.86, labelZoom: 8.4, visibleZoom: 0, halo: 4 },
    transmission_structures: { fill: "#b8c6c9", radius: clamp(2 + (zoom - 6.2) * 0.2, 1.8, 3.8), alpha: 0.58, visibleZoom: 6.3, labelZoom: 10.7 },
    distribution_poles_lite: { fill: "#f7c96b", radius: clamp(1.6 + (zoom - 7) * 0.22, 1.5, 3.7), alpha: 0.6, visibleZoom: 7.1, labelZoom: 11.1 },
    distribution_splice_points: { fill: "#ff9f7a", radius: clamp(2.6 + (zoom - 7) * 0.23, 2.6, 4.8), alpha: 0.78, visibleZoom: 7.0, labelZoom: 9.7 },
    splice_closures: { fill: "#ffb38f", radius: clamp(2.9 + (zoom - 7) * 0.22, 2.8, 4.9), alpha: 0.8, visibleZoom: 7.0, labelZoom: 9.5, shape: "diamond" },
    fcc_utility_towers: { fill: "#ffffff", radius: clamp(2.2 + (zoom - 6.5) * 0.18, 2, 4.4), alpha: 0.58, visibleZoom: 6.7, labelZoom: 10.5 },
    legacy_telecom_nodes: { fill: "#57c7ff", radius: clamp(4 + (zoom - 5.8) * 0.24, 4, 6.6), alpha: 0.88, labelZoom: 8.1, visibleZoom: 0, halo: 4 },
    legacy_work_orders: { fill: "#ffffff", radius: clamp(4 + (zoom - 5.8) * 0.2, 4, 6.4), alpha: 0.92, labelZoom: 8.35, visibleZoom: 0, shape: "square" },
  };
  const base = {
    fill: layer.color || "#d8eeee",
    stroke: "rgba(4, 13, 15, 0.9)",
    strokeWidth: 1.2,
    radius: clamp(2.8 + (zoom - 5) * 0.18, 2.6, 5.2),
    alpha: 0.72,
    hitRadius: 9,
    halo: 0,
    haloFill: "rgba(87, 199, 255, 0.12)",
    labelZoom: 9.4,
    labelColor: "#e8fffb",
    visibleZoom: 0,
    shape: "circle",
    ...(styles[layer.id] || {}),
  };
  base.hitRadius = Math.max(base.hitRadius, base.radius + 5);
  if (!selected) return base;
  return {
    ...base,
    fill: "#fff4cf",
    stroke: "rgba(4, 13, 15, 0.96)",
    strokeWidth: 2.2,
    radius: Math.max(base.radius + 2.2, 7),
    alpha: 1,
    hitRadius: 13,
    labelZoom: 0,
    halo: Math.max(base.halo || 0, 5),
    haloFill: "rgba(255, 244, 207, 0.18)",
  };
}

function shouldLabelCanvasGisFeature(layer, index, style, selected) {
  if (selected) return true;
  if (state.mapView.zoom < style.labelZoom) return false;
  const step = state.mapView.zoom >= 10 ? 4 : state.mapView.zoom >= 8.6 ? 7 : 13;
  if (["legacy_fiber_routes", "legacy_telecom_circuits", "proposed_changes"].includes(layer.id)) return index % Math.max(2, step - 3) === 0;
  return index % step === 0;
}

function mapFeatureLabel(layer, feature) {
  const label = gisFeatureName(layer, feature);
  return label.length > 30 ? `${label.slice(0, 27)}...` : label;
}

function drawPointLabel(context, point, label, color, size) {
  if (point.x < 22 || point.y < 22 || point.x > size.cssWidth - 22 || point.y > size.cssHeight - 22) return;
  context.save();
  context.font = "760 9px Inter, system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(4, 13, 15, 0.9)";
  context.fillStyle = color;
  context.strokeText(label, point.x + 8, point.y - 8);
  context.fillText(label, point.x + 8, point.y - 8);
  context.restore();
}

function drawCanvasLineAsset(context, asset) {
  const config = assetTypes[asset.asset_type] || assetTypes.fiber_span;
  const points = projectedCanvasLine(asset.geometry.coordinates || []);
  if (points.length < 2) return;
  const selected = asset.id === state.selectedId;
  context.save();
  context.globalAlpha = 0.92;
  context.strokeStyle = selected ? "#fff4cf" : config.color;
  context.lineWidth = selected ? 7 : 4.4;
  if (asset.lifecycle === "proposed") context.setLineDash([10, 8]);
  strokeCanvasLine(context, points);
  context.restore();
  state.canvasHits.push({ type: "asset", geometry: "line", assetId: asset.id, points, tolerance: selected ? 12 : 9 });
}

function drawCanvasPointAsset(context, asset) {
  const config = assetTypes[asset.asset_type] || assetTypes.substation;
  const [lon, lat] = asset.geometry.coordinates || [0, 0];
  const point = projectCss(lon, lat);
  if (!point) return;
  const selected = asset.id === state.selectedId;
  const radius = markerRadius(asset);
  context.save();
  context.fillStyle = "rgba(4, 13, 15, 0.9)";
  context.strokeStyle = selected ? "#fff4cf" : config.color;
  context.lineWidth = selected ? 5 : 3;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = config.color;
  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = 1;
  if (config.shape === "diamond") {
    context.beginPath();
    context.moveTo(point.x, point.y - 9);
    context.lineTo(point.x + 9, point.y);
    context.lineTo(point.x, point.y + 9);
    context.lineTo(point.x - 9, point.y);
    context.closePath();
    context.fill();
    context.stroke();
  } else if (config.shape === "square") {
    context.fillRect(point.x - 7, point.y - 7, 14, 14);
    context.strokeRect(point.x - 7, point.y - 7, 14, 14);
  } else {
    context.beginPath();
    context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.font = "800 11px Inter, system-ui, sans-serif";
  context.lineWidth = 4;
  context.strokeStyle = "rgba(4, 13, 15, 0.95)";
  context.fillStyle = "#e8fffb";
  const label = shortLabel(asset);
  context.strokeText(label, point.x + 15, point.y - 11);
  context.fillText(label, point.x + 15, point.y - 11);
  context.restore();
  state.canvasHits.push({ type: "asset", geometry: "point", assetId: asset.id, x: point.x, y: point.y, radius: radius + 7 });
}

function projectedCanvasLine(coordinates) {
  return (coordinates || [])
    .map(([lon, lat]) => projectCss(lon, lat))
    .filter(Boolean);
}

function strokeCanvasLine(context, points) {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function drawMapBase() {
  if (!state.mapReady) {
    const background = svg("rect", { class: "map-background", width: 1000, height: 700 });
    appendMapNode(background);

    const region = svg("path", {
      class: "map-region",
      d: "M170 95 L585 75 L860 180 L840 520 L575 635 L195 585 L100 330 Z",
    });
    appendMapNode(region);

    const grid = svg("g", { class: "map-grid" });
    for (let x = 80; x <= 920; x += 105) grid.appendChild(svg("line", { x1: x, y1: 45, x2: x, y2: 655 }));
    for (let y = 70; y <= 630; y += 80) grid.appendChild(svg("line", { x1: 45, y1: y, x2: 955, y2: y }));
    appendMapNode(grid);

    [
      ["MA", 445, 395],
      ["RI", 548, 570],
      ["CT", 272, 590],
      ["VT", 205, 185],
      ["NH", 560, 225],
      ["ME", 810, 125],
    ].forEach(([label, x, y]) => {
      const text = svg("text", { class: "map-state-label", x, y });
      text.textContent = label;
      appendMapNode(text);
    });
  } else {
    appendMapNode(svg("rect", { class: "map-projection-vignette", width: 1000, height: 700 }));
  }
  const watermark = svg("text", { class: "map-watermark", x: 28, y: 672 });
  watermark.textContent = "Offline synthetic planning overlay / fictional demo records only";
  appendMapNode(watermark);
}

function drawLineAsset(asset) {
  const config = assetTypes[asset.asset_type] || assetTypes.fiber_span;
  const group = svg("g", {
    class: `line-asset ${asset.lifecycle === "proposed" ? "proposed" : "existing"} ${asset.id === state.selectedId ? "selected" : ""}`,
    "data-asset-id": asset.id,
    role: "button",
    tabindex: "0",
  });
  const path = coordinatesToPath(asset.geometry.coordinates || []);
  group.appendChild(svg("path", { class: "line-hit", d: path }));
  group.appendChild(svg("path", { class: "line-visible", d: path, stroke: config.color }));
  const title = svg("title");
  title.textContent = asset.name;
  group.appendChild(title);
  bindFeatureInteraction(group, () => selectAsset(asset.id));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") selectAsset(asset.id);
  });
  appendMapNode(group);
}

function drawGisLayer(layer) {
  const payload = state.gisLayerData[layer.id];
  const features = payload?.feature_collection?.features || [];
  const lineGroup = svg("g", { class: "gis-layer-lines", "data-gis-layer": layer.id });
  const pointGroup = svg("g", { class: "gis-layer-points", "data-gis-layer": layer.id });
  features.forEach((feature, index) => {
    const geometry = feature.geometry || {};
    if (geometry.type === "Point") {
      pointGroup.appendChild(gisPointNode(layer, feature, index));
    } else {
      gisLineNodes(layer, feature, index).forEach((node) => lineGroup.appendChild(node));
    }
  });
  appendMapNode(lineGroup);
  appendMapNode(pointGroup);
}

function gisLineNodes(layer, feature, index) {
  const parts = lineCoordinateParts(feature.geometry);
  return parts.map((coordinates) => {
    const group = svg("g", {
      class: `gis-line ${isSelectedGis(layer.id, index) ? "selected" : ""}`,
      "data-gis-layer": layer.id,
      "data-gis-index": index,
      role: "button",
      tabindex: "0",
    });
    const path = coordinatesToPath(coordinates);
    const hit = svg("path", { class: "gis-line-hit", d: path });
    const visible = svg("path", { class: "gis-line-visible", d: path, stroke: layer.color });
    group.appendChild(hit);
    group.appendChild(visible);
    const title = svg("title");
    title.textContent = gisFeatureName(layer, feature);
    group.appendChild(title);
    bindFeatureInteraction(group, () => selectGisFeature(layer.id, index));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") selectGisFeature(layer.id, index);
    });
    return group;
  });
}

function gisPointNode(layer, feature, index) {
  const [lon, lat] = feature.geometry.coordinates || [0, 0];
  const point = project(lon, lat);
  const group = svg("g", {
    class: `gis-point ${isSelectedGis(layer.id, index) ? "selected" : ""}`,
    transform: `translate(${point.x} ${point.y})`,
    "data-gis-layer": layer.id,
    "data-gis-index": index,
    role: "button",
    tabindex: "0",
  });
  const hit = svg("circle", { class: "gis-point-hit", r: 9 });
  const visible = svg("circle", { class: "gis-point-visible", r: 3.5, fill: layer.color });
  group.appendChild(hit);
  group.appendChild(visible);
  const title = svg("title");
  title.textContent = gisFeatureName(layer, feature);
  group.appendChild(title);
  bindFeatureInteraction(group, () => selectGisFeature(layer.id, index));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") selectGisFeature(layer.id, index);
  });
  return group;
}

function drawPointAsset(asset) {
  const config = assetTypes[asset.asset_type] || assetTypes.substation;
  const [lon, lat] = asset.geometry.coordinates;
  const point = project(lon, lat);
  const group = svg("g", {
    class: `point-asset ${asset.id === state.selectedId ? "selected" : ""}`,
    transform: `translate(${point.x} ${point.y})`,
    "data-asset-id": asset.id,
    role: "button",
    tabindex: "0",
  });
  group.appendChild(svg("circle", { class: "marker-ring", r: markerRadius(asset), stroke: config.color }));
  if (config.shape === "diamond") {
    group.appendChild(svg("path", { class: "marker-dot", d: "M0 -9 L9 0 L0 9 L-9 0 Z", fill: config.color }));
  } else if (config.shape === "square") {
    group.appendChild(svg("rect", { class: "marker-dot", x: -7, y: -7, width: 14, height: 14, rx: 2, fill: config.color }));
  } else {
    group.appendChild(svg("circle", { class: "marker-dot", r: 7, fill: config.color }));
  }
  const label = svg("text", { x: 15, y: -11 });
  label.textContent = shortLabel(asset);
  group.appendChild(label);
  const title = svg("title");
  title.textContent = asset.name;
  group.appendChild(title);
  bindFeatureInteraction(group, () => selectAsset(asset.id));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") selectAsset(asset.id);
  });
  appendMapNode(group);
}

function markerRadius(asset) {
  if (asset.asset_type === "substation") return 16;
  if (asset.asset_type === "distribution_pole" || asset.asset_type === "splice_point") return 12;
  if (asset.asset_type === "device") return 13;
  return 11;
}

function bindFeatureInteraction(group, onSelect) {
  let drag = null;

  group.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    group.setPointerCapture?.(event.pointerId);
  });

  group.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(totalX, totalY) < 5) return;
    drag.moved = true;
    if (state.mapReady) {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      state.featureDragActive = true;
      setMapMoving(true);
      panMapByCssDelta(dx, dy);
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    event.preventDefault();
    event.stopPropagation();
  });

  const finish = (event) => {
    if (!drag) return;
    const wasMoved = drag.moved;
    group.releasePointerCapture?.(drag.pointerId);
    drag = null;
    state.featureDragActive = false;
    if (wasMoved) {
      requestMapOverlayRender();
    } else {
      onSelect();
    }
    event.preventDefault();
    event.stopPropagation();
  };

  group.addEventListener("pointerup", finish);
  group.addEventListener("pointercancel", (event) => {
    if (!drag) return;
    group.releasePointerCapture?.(drag.pointerId);
    drag = null;
    state.featureDragActive = false;
    requestMapOverlayRender();
    event.preventDefault();
    event.stopPropagation();
  });
}

function setupCanvasInteractions() {
  const canvas = el.assetCanvas;
  if (!canvas) return;

  canvas.addEventListener("pointerdown", (event) => {
    if (!state.mapReady || event.button !== 0) return;
    const point = canvasEventPoint(event);
    state.canvasDrag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      hit: findCanvasHit(point.x, point.y),
      moved: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const drag = state.canvasDrag;
    if (!drag || !state.mapReady) return;
    const point = canvasEventPoint(event);
    const totalX = point.x - drag.startX;
    const totalY = point.y - drag.startY;
    if (!drag.moved && Math.hypot(totalX, totalY) < 4) return;
    drag.moved = true;
    state.featureDragActive = true;
    setMapMoving(true);
    canvas.style.transform = `translate(${totalX}px, ${totalY}px)`;
    panMapByCssDelta(point.x - drag.lastX, point.y - drag.lastY);
    drag.lastX = point.x;
    drag.lastY = point.y;
    event.preventDefault();
  });

  canvas.addEventListener("pointerup", (event) => {
    const drag = state.canvasDrag;
    if (!drag) return;
    canvas.releasePointerCapture?.(drag.pointerId);
    state.canvasDrag = null;
    state.featureDragActive = false;
    canvas.style.transform = "";
    if (drag.moved) {
      requestMapOverlayRender();
      window.setTimeout(() => {
        if (!state.featureDragActive) setMapMoving(false);
      }, 80);
      event.preventDefault();
      return;
    }
    const point = canvasEventPoint(event);
    const hit = findCanvasHit(point.x, point.y) || drag.hit;
    if (hit) selectCanvasHit(hit);
    event.preventDefault();
  });

  canvas.addEventListener("pointercancel", () => {
    state.canvasDrag = null;
    state.featureDragActive = false;
    canvas.style.transform = "";
    requestMapOverlayRender();
    window.setTimeout(() => {
      if (!state.featureDragActive) setMapMoving(false);
    }, 80);
  });

  canvas.addEventListener("wheel", (event) => {
    if (!state.mapReady) return;
    const point = canvasEventPoint(event);
    const delta = event.deltaY > 0 ? -0.45 : 0.45;
    zoomMapAtCssPoint(point.x, point.y, delta);
    requestMapOverlayRender();
    event.preventDefault();
  }, { passive: false });
}

function canvasEventPoint(event) {
  const rect = el.assetCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function findCanvasHit(x, y) {
  for (let index = state.canvasHits.length - 1; index >= 0; index -= 1) {
    const hit = state.canvasHits[index];
    if (hit.geometry === "point") {
      if (Math.hypot(hit.x - x, hit.y - y) <= hit.radius) return hit;
      continue;
    }
    if (hit.geometry === "line" && canvasLineDistance(hit.points, x, y) <= hit.tolerance) return hit;
  }
  return null;
}

function canvasLineDistance(points, x, y) {
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, pointSegmentDistance(x, y, points[index - 1], points[index]));
    if (best <= 3) break;
  }
  return best;
}

function pointSegmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(x - a.x, y - a.y);
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(x - px, y - py);
}

function selectCanvasHit(hit) {
  if (hit.type === "asset") {
    selectAsset(hit.assetId);
    return;
  }
  selectGisFeature(hit.layerId, hit.index);
}

function renderDetail() {
  if (state.selectedGis) {
    renderGisDetail();
    return;
  }
  const asset = selectedAsset();
  if (!asset) {
    el.assetDetail.className = "asset-detail empty-state";
    el.assetDetail.textContent = "Select an asset on the map or in the result list.";
    return;
  }
  el.assetDetail.className = "asset-detail";
  if (state.editing) {
    renderEditDetail(asset);
    return;
  }
  const config = assetTypes[asset.asset_type] || assetTypes.substation;
  const properties = Object.entries(asset.properties || {}).slice(0, 14);
  el.assetDetail.innerHTML = `
    <div class="detail-title">
      <span>${escapeHtml(config.label)}</span>
      <strong>${escapeHtml(asset.name)}</strong>
    </div>
    <div class="badge-row">
      <span class="badge">${escapeHtml(asset.status)}</span>
      <span class="badge ${asset.lifecycle === "proposed" ? "proposed" : ""}">${escapeHtml(asset.lifecycle)}</span>
      <span class="badge">${escapeHtml(asset.geometry.type)}</span>
    </div>
    <div class="property-table">
      <div class="property-row"><span>ID</span><strong>${escapeHtml(asset.id)}</strong></div>
      ${properties.map(([key, value]) => `<div class="property-row"><span>${escapeHtml(humanize(key))}</span><strong>${escapeHtml(formatValue(value))}</strong></div>`).join("")}
    </div>
    <div>
      <div class="panel-heading" style="padding:0 0 8px;border:0"><span>Dependencies</span><small id="dependency-count">Loading</small></div>
      <div class="dependency-list" id="dependency-list"></div>
    </div>
    <div class="detail-actions">
      <button class="ghost-button" id="edit-asset-button" type="button">Edit</button>
      <button class="danger-button" id="delete-asset-button" type="button">Delete</button>
    </div>
  `;
  document.getElementById("edit-asset-button").addEventListener("click", () => {
    state.editing = true;
    renderDetail();
  });
  document.getElementById("delete-asset-button").addEventListener("click", () => deleteSelectedAsset(asset.id));
  loadDependencyView(asset.id);
}

function renderGisDetail() {
  const selected = selectedGisFeature();
  if (!selected) {
    state.selectedGis = null;
    renderDetail();
    return;
  }
  const { layer, feature } = selected;
  const properties = Object.entries(feature.properties || {}).slice(0, 18);
  el.assetDetail.className = "asset-detail";
  el.assetDetail.innerHTML = `
    <div class="detail-title">
      <span>${escapeHtml(layer.category)}</span>
      <strong>${escapeHtml(gisFeatureName(layer, feature))}</strong>
    </div>
    <div class="badge-row">
      <span class="badge">GIS dataset</span>
      <span class="badge">${escapeHtml(layer.label)}</span>
      <span class="badge">${escapeHtml(feature.geometry?.type || "Geometry")}</span>
    </div>
    <div class="property-table">
      ${properties.map(([key, value]) => `<div class="property-row"><span>${escapeHtml(humanize(key))}</span><strong>${escapeHtml(formatValue(value))}</strong></div>`).join("")}
    </div>
    <p class="hint" style="margin:0">${escapeHtml(layer.notice || state.bootstrap?.synthetic_data_notice || "")}</p>
  `;
}

function renderEditDetail(asset) {
  el.assetDetail.innerHTML = `
    <form id="detail-edit-form" class="create-form">
      <label class="field"><span>Name</span><input id="detail-name" value="${escapeAttr(asset.name)}" /></label>
      <div class="filter-grid">
        <label class="field"><span>Status</span><input id="detail-status" value="${escapeAttr(asset.status)}" /></label>
        <label class="field"><span>Lifecycle</span><select id="detail-lifecycle"><option value="existing">Existing/demo</option><option value="proposed">Proposed/design</option></select></label>
      </div>
      <label class="field"><span>Geometry JSON</span><textarea id="detail-geometry" rows="5" spellcheck="false">${escapeHtml(JSON.stringify(asset.geometry, null, 2))}</textarea></label>
      <label class="field"><span>Properties JSON</span><textarea id="detail-properties" rows="8" spellcheck="false">${escapeHtml(JSON.stringify(asset.properties, null, 2))}</textarea></label>
      <div class="form-actions">
        <button class="primary-button" type="submit">Save</button>
        <button class="ghost-button" id="cancel-edit-button" type="button">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById("detail-lifecycle").value = asset.lifecycle;
  document.getElementById("cancel-edit-button").addEventListener("click", () => {
    state.editing = false;
    renderDetail();
  });
  document.getElementById("detail-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        id: asset.id,
        asset_type: asset.asset_type,
        name: document.getElementById("detail-name").value.trim(),
        status: document.getElementById("detail-status").value.trim(),
        lifecycle: document.getElementById("detail-lifecycle").value,
        geometry: JSON.parse(document.getElementById("detail-geometry").value),
        properties: JSON.parse(document.getElementById("detail-properties").value),
        source: asset.source || "synthetic-demo",
      };
      await api(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "PUT", body: JSON.stringify(payload) });
      toast(`Saved ${payload.name}.`);
      await refreshAssets(asset.id);
    } catch (error) {
      toast(`Save failed: ${error.message}`);
    }
  });
}

async function loadDependencyView(assetId) {
  try {
    const payload = await api(`/api/assets/${encodeURIComponent(assetId)}/dependencies`);
    if (state.selectedId !== assetId) return;
    state.dependencies = payload;
    const direct = payload.direct_dependencies || [];
    const dependents = payload.dependents || [];
    const list = document.getElementById("dependency-list");
    const count = document.getElementById("dependency-count");
    if (!list || !count) return;
    count.textContent = `${direct.length} dependencies / ${dependents.length} dependents`;
    const chips = [
      ...direct.map((asset) => ({ asset, prefix: "Depends on" })),
      ...dependents.map((asset) => ({ asset, prefix: "Used by" })),
    ];
    list.innerHTML = chips.length
      ? chips.map(({ asset, prefix }) => `<button class="tiny-button" type="button" data-dep-id="${escapeHtml(asset.id)}">${escapeHtml(prefix)} ${escapeHtml(asset.id)}</button>`).join("")
      : '<span class="badge">No dependency links</span>';
    list.querySelectorAll("[data-dep-id]").forEach((button) => {
      button.addEventListener("click", () => selectAsset(button.dataset.depId));
    });
  } catch (error) {
    const count = document.getElementById("dependency-count");
    if (count) count.textContent = "Unavailable";
  }
}

function selectedAsset() {
  return state.assets.find((asset) => asset.id === state.selectedId) || null;
}

function selectAsset(assetId) {
  state.selectedId = assetId;
  state.selectedGis = null;
  state.dependencies = null;
  state.editing = false;
  renderAll();
}

function selectGisFeature(layerId, index) {
  state.selectedId = null;
  state.selectedGis = { layerId, index };
  state.dependencies = null;
  state.editing = false;
  renderAll();
}

function selectedGisFeature() {
  if (!state.selectedGis) return null;
  const layer = state.gisLayers.find((candidate) => candidate.id === state.selectedGis.layerId);
  const feature = state.gisLayerData[state.selectedGis.layerId]?.feature_collection?.features?.[state.selectedGis.index];
  if (!layer || !feature) return null;
  return { layer, feature };
}

function isSelectedGis(layerId, index) {
  return state.selectedGis?.layerId === layerId && state.selectedGis?.index === index;
}

async function deleteSelectedAsset(assetId) {
  if (!window.confirm(`Delete ${assetId} from the local synthetic database?`)) return;
  try {
    await api(`/api/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
    toast(`Deleted ${assetId}.`);
    await refreshAssets(null);
  } catch (error) {
    toast(`Delete failed: ${error.message}`);
  }
}

function renderDynamicFields() {
  const type = el.createType.value;
  const fields = dynamicFieldSets[type] || [];
  document.querySelectorAll(".line-only").forEach((field) => {
    field.style.display = assetTypes[type]?.geometry === "line" ? "grid" : "none";
  });
  el.dynamicFields.innerHTML = fields
    .map(([key, label, value]) => `<label class="field"><span>${escapeHtml(label)}</span><input data-prop="${escapeHtml(key)}" value="${escapeAttr(value)}" /></label>`)
    .join("");
}

async function createAssetFromForm(event) {
  event.preventDefault();
  const type = el.createType.value;
  const isLine = assetTypes[type]?.geometry === "line";
  const lonA = numberValue("create-lon-a");
  const latA = numberValue("create-lat-a");
  const lonZ = numberValue("create-lon-z");
  const latZ = numberValue("create-lat-z");
  const properties = collectDynamicProperties();
  const fiberCount = Number(document.getElementById("create-fiber-count").value || 0);
  if (fiberCount) properties.fiber_count = fiberCount;
  properties.source = "desktop-local";
  const geometry = isLine
    ? { type: "LineString", coordinates: [[lonA, latA], [lonZ, latZ]] }
    : { type: "Point", coordinates: [lonA, latA] };
  const payload = {
    asset_type: type,
    name: document.getElementById("create-name").value.trim() || "New synthetic asset",
    status: document.getElementById("create-status").value.trim() || "proposed",
    lifecycle: document.getElementById("create-lifecycle").value,
    geometry,
    properties,
    source: "desktop-local",
  };
  try {
    const response = await api("/api/assets", { method: "POST", body: JSON.stringify(payload) });
    toast(`Created ${response.asset.id}.`);
    await refreshAssets(response.asset.id);
  } catch (error) {
    toast(`Create failed: ${error.message}`);
  }
}

function collectDynamicProperties() {
  const properties = {};
  el.dynamicFields.querySelectorAll("[data-prop]").forEach((input) => {
    const value = input.value.trim();
    if (!value) return;
    properties[input.dataset.prop] = maybeNumber(value);
  });
  return properties;
}

async function runCommand(event) {
  event.preventDefault();
  const command = el.commandInput.value.trim();
  if (!command) return;
  el.commandInput.value = "";
  try {
    const response = await api("/api/commands", {
      method: "POST",
      body: JSON.stringify({ command, selected_asset_id: state.selectedId }),
    });
    addCommandHistory(command, response.summary, response.answers || []);
    const created = (response.actions || []).find((action) => action.type === "created");
    if (created?.asset?.id) {
      await refreshAssets(created.asset.id);
    }
  } catch (error) {
    addCommandHistory(command, `Command failed: ${error.message}`, []);
  }
}

function addCommandHistory(command, summary, answers) {
  const entry = document.createElement("div");
  entry.className = "command-entry";
  const answerText = answers.length
    ? `<div>${answers.slice(0, 4).map((asset) => `<button class="tiny-button" type="button" data-command-asset="${escapeHtml(asset.id)}">${escapeHtml(asset.id)}</button>`).join(" ")}</div>`
    : "";
  entry.innerHTML = `<code>${escapeHtml(command)}</code><div>${escapeHtml(summary)}</div>${answerText}`;
  el.commandHistory.prepend(entry);
  entry.querySelectorAll("[data-command-asset]").forEach((button) => {
    button.addEventListener("click", () => selectAsset(button.dataset.commandAsset));
  });
}

function exportVisibleGeoJson() {
  const geojson = {
    type: "FeatureCollection",
    synthetic_data_notice: state.bootstrap?.synthetic_data_notice || "",
    features: getVisibleAssets().map((asset) => ({
      type: "Feature",
      id: asset.id,
      geometry: asset.geometry,
      properties: {
        id: asset.id,
        asset_type: asset.asset_type,
        name: asset.name,
        status: asset.status,
        lifecycle: asset.lifecycle,
        source: asset.source,
        ...asset.properties,
      },
    })),
  };
  downloadText("gridassetlink-visible-assets.geojson", JSON.stringify(geojson, null, 2), "application/geo+json");
}

function exportVisibleCsv() {
  const rows = getVisibleAssets().map((asset) => {
    const point = asset.geometry.type === "Point" ? asset.geometry.coordinates : ["", ""];
    return {
      id: asset.id,
      asset_type: asset.asset_type,
      name: asset.name,
      status: asset.status,
      lifecycle: asset.lifecycle,
      longitude: point[0],
      latitude: point[1],
      geometry_json: JSON.stringify(asset.geometry),
      properties_json: JSON.stringify(asset.properties),
    };
  });
  const header = ["id", "asset_type", "name", "status", "lifecycle", "longitude", "latitude", "geometry_json", "properties_json"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(","))].join("\n");
  downloadText("gridassetlink-visible-assets.csv", csv, "text/csv");
}

async function importGeoJson() {
  try {
    const payload = JSON.parse(el.importText.value);
    const response = await api("/api/import/geojson", { method: "POST", body: JSON.stringify(payload) });
    toast(`Imported ${response.imported_count} GeoJSON records.`);
    await refreshAssets(response.assets[0]?.id || state.selectedId);
  } catch (error) {
    toast(`GeoJSON import failed: ${error.message}`);
  }
}

async function importCsv() {
  try {
    const response = await fetch("/api/import/csv", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: el.importText.value,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || response.statusText);
    }
    const result = await response.json();
    toast(`Imported ${result.imported_count} CSV records.`);
    await refreshAssets(result.assets[0]?.id || state.selectedId);
  } catch (error) {
    toast(`CSV import failed: ${error.message}`);
  }
}

async function resetDemoData() {
  if (!window.confirm("Reset the local SQLite database back to the bundled synthetic demo seed?")) return;
  try {
    await api("/api/reset-demo-data", { method: "POST", body: "{}" });
    toast("Synthetic demo data reset.");
    await refreshAssets(null);
  } catch (error) {
    toast(`Reset failed: ${error.message}`);
  }
}

function computeBounds(assets, gisFeatures = []) {
  const coords = [
    ...assets.flatMap((asset) => allCoordinates(asset.geometry)),
    ...gisFeatures.flatMap((feature) => allCoordinates(feature.geometry)),
  ];
  if (!coords.length) return state.bounds;
  const lons = coords.map((coordinate) => coordinate[0]);
  const lats = coords.map((coordinate) => coordinate[1]);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  const lonPad = Math.max((maxLon - minLon) * 0.14, 0.08);
  const latPad = Math.max((maxLat - minLat) * 0.14, 0.08);
  minLon -= lonPad;
  maxLon += lonPad;
  minLat -= latPad;
  maxLat += latPad;
  return { minLon, maxLon, minLat, maxLat };
}

function allCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString") return geometry.coordinates || [];
  if (geometry.type === "MultiLineString") return (geometry.coordinates || []).flat();
  if (geometry.type === "Polygon") return (geometry.coordinates || []).flat();
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flat(2);
  return [];
}

function isCoordinate(coordinate) {
  return Array.isArray(coordinate)
    && coordinate.length >= 2
    && Number.isFinite(Number(coordinate[0]))
    && Number.isFinite(Number(coordinate[1]));
}

function geometryIntersectsIsoNe(geometry, pad = 0.04) {
  return allCoordinates(geometry)
    .filter(isCoordinate)
    .some((coordinate) => coordinateInsideBounds(coordinate, isoNeMaxBounds, pad));
}

function coordinateInsideBounds(coordinate, bounds, pad = 0) {
  const lon = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  return lon >= bounds[0][0] - pad
    && lon <= bounds[1][0] + pad
    && lat >= bounds[0][1] - pad
    && lat <= bounds[1][1] + pad;
}

function lineCoordinateParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates || []];
  if (geometry.type === "MultiLineString") return geometry.coordinates || [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flat();
  return [];
}

function gisFeatureName(layer, feature) {
  const properties = feature.properties || {};
  return String(
    properties.name ||
    properties.cableName ||
    properties.routeName ||
    properties.spliceName ||
    properties.nodeName ||
    properties.linkName ||
    properties.title ||
    properties.id ||
    feature.id ||
    layer.label,
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lonLatToWorld(lon, lat) {
  const normalizedLon = Number(lon);
  const normalizedLat = clamp(Number(lat), -85.05112878, 85.05112878);
  const sinLat = Math.sin((normalizedLat * Math.PI) / 180);
  return {
    x: ((normalizedLon + 180) / 360) * mapConfig.tileSize,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * mapConfig.tileSize,
  };
}

function worldToLonLat(x, y) {
  const lon = (x / mapConfig.tileSize) * 360 - 180;
  const mercatorN = Math.PI - (2 * Math.PI * y) / mapConfig.tileSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercatorN) - Math.exp(-mercatorN)));
  return { lon, lat: clamp(lat, -85.05112878, 85.05112878) };
}

function mapScale() {
  return 2 ** state.mapView.zoom;
}

function mapViewportRect() {
  return el.assetCanvas?.getBoundingClientRect()
    || el.assetMap?.getBoundingClientRect()
    || { width: 1000, height: 700 };
}

function updateProjectionContext(rect = mapViewportRect()) {
  const width = Math.max(1, rect.width || 1000);
  const height = Math.max(1, rect.height || 700);
  state.mapProjection = {
    width,
    height,
    center: lonLatToWorld(state.mapView.centerLon, state.mapView.centerLat),
    scale: mapScale(),
  };
  return state.mapProjection;
}

function projectCss(lon, lat) {
  if (state.mapReady) {
    const projection = state.mapProjection || updateProjectionContext();
    const point = lonLatToWorld(lon, lat);
    return {
      x: projection.width / 2 + (point.x - projection.center.x) * projection.scale,
      y: projection.height / 2 + (point.y - projection.center.y) * projection.scale,
    };
  }
  const { minLon, maxLon, minLat, maxLat } = state.bounds;
  const rect = mapViewportRect();
  const x = 55 + ((lon - minLon) / (maxLon - minLon || 1)) * (rect.width - 110);
  const y = rect.height - 55 - ((lat - minLat) / (maxLat - minLat || 1)) * (rect.height - 110);
  return { x, y };
}

function project(lon, lat) {
  const point = projectCss(lon, lat);
  const rect = state.mapProjection || mapViewportRect();
  return {
    x: (point.x / (rect.width || 1)) * 1000,
    y: (point.y / (rect.height || 1)) * 700,
  };
}

function cssPointToLonLat(x, y) {
  const projection = state.mapProjection || updateProjectionContext();
  const worldX = projection.center.x + (x - projection.width / 2) / projection.scale;
  const worldY = projection.center.y + (y - projection.height / 2) / projection.scale;
  return worldToLonLat(worldX, worldY);
}

function setMapCenterFromWorld(worldX, worldY) {
  const center = worldToLonLat(clamp(worldX, 0, mapConfig.tileSize), clamp(worldY, 0, mapConfig.tileSize));
  state.mapView.centerLon = clamp(center.lon, isoNeMaxBounds[0][0], isoNeMaxBounds[1][0]);
  state.mapView.centerLat = clamp(center.lat, isoNeMaxBounds[0][1], isoNeMaxBounds[1][1]);
}

function panMapByCssDelta(dx, dy) {
  const center = lonLatToWorld(state.mapView.centerLon, state.mapView.centerLat);
  const scale = mapScale();
  setMapCenterFromWorld(center.x - dx / scale, center.y - dy / scale);
  updateProjectionContext();
  updateMapChrome();
}

function zoomMapAtCssPoint(x, y, delta) {
  const projection = state.mapProjection || updateProjectionContext();
  const anchor = cssPointToLonLat(x, y);
  const anchorWorld = lonLatToWorld(anchor.lon, anchor.lat);
  state.mapView.zoom = clamp(state.mapView.zoom + delta, mapConfig.minZoom, mapConfig.maxZoom);
  const scale = mapScale();
  setMapCenterFromWorld(
    anchorWorld.x - (x - projection.width / 2) / scale,
    anchorWorld.y - (y - projection.height / 2) / scale,
  );
  updateProjectionContext();
  updateMapChrome();
}

function zoomMapAtCenter(delta) {
  const rect = mapViewportRect();
  zoomMapAtCssPoint(rect.width / 2, rect.height / 2, delta);
  requestMapOverlayRender();
}

function fitMapBounds(bounds, padding = { top: 58, right: 46, bottom: 86, left: 46 }) {
  const rect = mapViewportRect();
  const sw = lonLatToWorld(bounds[0][0], bounds[0][1]);
  const ne = lonLatToWorld(bounds[1][0], bounds[1][1]);
  const minX = Math.min(sw.x, ne.x);
  const maxX = Math.max(sw.x, ne.x);
  const minY = Math.min(sw.y, ne.y);
  const maxY = Math.max(sw.y, ne.y);
  const worldWidth = Math.max(maxX - minX, 0.0001);
  const worldHeight = Math.max(maxY - minY, 0.0001);
  const usableWidth = Math.max(1, rect.width - padding.left - padding.right);
  const usableHeight = Math.max(1, rect.height - padding.top - padding.bottom);
  const fitZoom = Math.log2(Math.min(usableWidth / worldWidth, usableHeight / worldHeight));
  state.mapView.zoom = clamp(fitZoom, mapConfig.minZoom, mapConfig.maxZoom);
  setMapCenterFromWorld((minX + maxX) / 2, (minY + maxY) / 2);
  updateProjectionContext(rect);
  updateMapChrome();
}

function coordinatesToPath(coordinates) {
  return coordinates
    .map(([lon, lat], index) => {
      const point = project(lon, lat);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function geometryAnchor(geometry) {
  const coordinates = allCoordinates(geometry).filter(isCoordinate);
  if (!coordinates.length) return null;
  return coordinates[Math.floor(coordinates.length / 2)];
}

function selectedMapAnchor() {
  const asset = selectedAsset();
  if (asset) return geometryAnchor(asset.geometry);
  const selected = selectedGisFeature();
  if (selected) return geometryAnchor(selected.feature.geometry);
  return null;
}

function renderMapPopup() {
  if (!el.mapPopup) return;
  const anchor = selectedMapAnchor();
  const asset = selectedAsset();
  const gis = selectedGisFeature();
  if (!anchor || (!asset && !gis)) {
    el.mapPopup.hidden = true;
    return;
  }

  const canvasMode = state.mapReady && el.assetCanvas;
  const point = canvasMode ? projectCss(anchor[0], anchor[1]) : project(anchor[0], anchor[1]);
  const rect = canvasMode ? el.assetCanvas.getBoundingClientRect() : { width: 1000, height: 700 };
  const isOnScreen = point.x > -70 && point.x < rect.width + 70 && point.y > -70 && point.y < rect.height + 70;
  if (!isOnScreen) {
    el.mapPopup.hidden = true;
    return;
  }

  const title = asset ? asset.name : gisFeatureName(gis.layer, gis.feature);
  const label = asset ? (assetTypes[asset.asset_type]?.label || asset.asset_type) : gis.layer.label;
  const status = asset ? asset.status : (gis.feature.geometry?.type || "GIS feature");
  el.mapPopup.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(title)}</strong>
    <small>${escapeHtml(status)}</small>
  `;
  if (canvasMode) {
    el.mapPopup.style.left = `${point.x}px`;
    el.mapPopup.style.top = `${point.y}px`;
  } else {
    el.mapPopup.style.left = `${point.x / 10}%`;
    el.mapPopup.style.top = `${point.y / 7}%`;
  }
  el.mapPopup.hidden = false;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function appendMapNode(node) {
  (state.mapSvgTarget || el.assetMap).appendChild(node);
}

function shortLabel(asset) {
  const source = asset.id || asset.name;
  return source
    .replace("SUB-", "")
    .replace("DEV-", "")
    .replace("FBR-", "")
    .replace("SPL-", "")
    .slice(0, 14);
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function maybeNumber(value) {
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.includes(",") && !value.includes("{")) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

function numberValue(id) {
  const value = Number(document.getElementById(id).value);
  if (!Number.isFinite(value)) throw new Error(`Invalid number for ${id}`);
  return value;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${filename}.`);
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

el.searchInput.addEventListener("input", () => {
  state.search = el.searchInput.value;
  renderAll();
});

el.lifecycleFilter.addEventListener("change", () => {
  state.lifecycle = el.lifecycleFilter.value;
  renderAll();
});

el.statusFilter.addEventListener("change", () => {
  state.status = el.statusFilter.value;
  renderAll();
});

document.getElementById("show-all-layers-button").addEventListener("click", () => {
  Object.keys(state.layers).forEach((key) => {
    state.layers[key] = true;
  });
  renderAll();
});

document.getElementById("clear-selection-button").addEventListener("click", () => {
  state.selectedId = null;
  state.selectedGis = null;
  state.dependencies = null;
  state.editing = false;
  renderAll();
});

document.getElementById("export-geojson-button").addEventListener("click", exportVisibleGeoJson);
document.getElementById("export-csv-button").addEventListener("click", exportVisibleCsv);
document.getElementById("import-geojson-button").addEventListener("click", importGeoJson);
document.getElementById("import-csv-button").addEventListener("click", importCsv);
document.getElementById("reset-demo-button").addEventListener("click", resetDemoData);
el.fitMapButton?.addEventListener("click", () => fitMapToIsoNe(420));
el.mapZoomInButton?.addEventListener("click", () => zoomMapAtCenter(0.75));
el.mapZoomOutButton?.addEventListener("click", () => zoomMapAtCenter(-0.75));
document.getElementById("quick-splice-button").addEventListener("click", () => {
  el.createType.value = "splice_point";
  document.getElementById("create-name").value = "New synthetic splice point";
  document.getElementById("create-status").value = "proposed";
  renderDynamicFields();
});

el.createType.addEventListener("change", renderDynamicFields);
el.createForm.addEventListener("submit", createAssetFromForm);
el.commandForm.addEventListener("submit", runCommand);

setupCanvasInteractions();
initLocalCanvasMap();
load().catch((error) => {
  el.startupNotice.textContent = `Startup failed: ${error.message}`;
  toast(`Startup failed: ${error.message}`);
});
