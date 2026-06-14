const SVG_NS = "http://www.w3.org/2000/svg";

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
  mapLegend: document.getElementById("map-legend"),
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
  el.tileModeLabel.textContent = bootstrap.offline_map_mode ? "Offline SVG map mode" : "Optional external tile mode";
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
        <label class="layer-row ${state.layers[key] ? "active" : ""}">
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
        <label class="layer-row gis-row ${layer.visible ? "active" : ""}">
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
  el.assetMap.innerHTML = "";
  drawMapBase();

  const visibleGisLayers = state.gisLayers.filter((layer) => layer.visible && state.gisLayerData[layer.id]);
  visibleGisLayers.forEach(drawGisLayer);

  const lines = visible.filter((asset) => asset.geometry.type !== "Point");
  const points = visible.filter((asset) => asset.geometry.type === "Point");
  lines.forEach(drawLineAsset);
  points.forEach(drawPointAsset);

  el.mapLegend.innerHTML = Object.entries(assetTypes)
    .filter(([key]) => state.layers[key])
    .map(([, config]) => `<span class="legend-chip"><i class="legend-swatch" style="background:${config.color}"></i>${config.label}</span>`)
    .join("") + visibleGisLayers.slice(0, 8).map((layer) => `<span class="legend-chip gis-chip"><i class="legend-swatch" style="background:${layer.color}"></i>${escapeHtml(layer.label)}</span>`).join("");
}

function drawMapBase() {
  const background = svg("rect", { class: "map-background", width: 1000, height: 700 });
  el.assetMap.appendChild(background);

  const region = svg("path", {
    class: "map-region",
    d: "M170 95 L585 75 L860 180 L840 520 L575 635 L195 585 L100 330 Z",
  });
  el.assetMap.appendChild(region);

  const grid = svg("g", { class: "map-grid" });
  for (let x = 80; x <= 920; x += 105) grid.appendChild(svg("line", { x1: x, y1: 45, x2: x, y2: 655 }));
  for (let y = 70; y <= 630; y += 80) grid.appendChild(svg("line", { x1: 45, y1: y, x2: 955, y2: y }));
  el.assetMap.appendChild(grid);

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
    el.assetMap.appendChild(text);
  });
  const watermark = svg("text", { class: "map-watermark", x: 28, y: 672 });
  watermark.textContent = "Offline synthetic planning overlay / fictional demo records only";
  el.assetMap.appendChild(watermark);
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
  group.addEventListener("click", () => selectAsset(asset.id));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") selectAsset(asset.id);
  });
  el.assetMap.appendChild(group);
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
  el.assetMap.appendChild(lineGroup);
  el.assetMap.appendChild(pointGroup);
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
    group.appendChild(svg("path", { class: "gis-line-hit", d: path }));
    group.appendChild(svg("path", { class: "gis-line-visible", d: path, stroke: layer.color }));
    const title = svg("title");
    title.textContent = gisFeatureName(layer, feature);
    group.appendChild(title);
    group.addEventListener("click", () => selectGisFeature(layer.id, index));
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
  group.appendChild(svg("circle", { class: "gis-point-hit", r: 9 }));
  group.appendChild(svg("circle", { class: "gis-point-visible", r: 3.5, fill: layer.color }));
  const title = svg("title");
  title.textContent = gisFeatureName(layer, feature);
  group.appendChild(title);
  group.addEventListener("click", () => selectGisFeature(layer.id, index));
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
  group.addEventListener("click", () => selectAsset(asset.id));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") selectAsset(asset.id);
  });
  el.assetMap.appendChild(group);
}

function markerRadius(asset) {
  if (asset.asset_type === "substation") return 16;
  if (asset.asset_type === "distribution_pole" || asset.asset_type === "splice_point") return 12;
  if (asset.asset_type === "device") return 13;
  return 11;
}

function renderDetail() {
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
  state.dependencies = null;
  state.editing = false;
  renderAll();
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

function computeBounds(assets) {
  const coords = assets.flatMap((asset) => allCoordinates(asset.geometry));
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
  if (geometry.type === "Polygon") return (geometry.coordinates || []).flat();
  return [];
}

function project(lon, lat) {
  const { minLon, maxLon, minLat, maxLat } = state.bounds;
  const width = 1000;
  const height = 700;
  const x = 55 + ((lon - minLon) / (maxLon - minLon || 1)) * (width - 110);
  const y = height - 55 - ((lat - minLat) / (maxLat - minLat || 1)) * (height - 110);
  return { x, y };
}

function coordinatesToPath(coordinates) {
  return coordinates
    .map(([lon, lat], index) => {
      const point = project(lon, lat);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
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
  state.dependencies = null;
  state.editing = false;
  renderAll();
});

document.getElementById("export-geojson-button").addEventListener("click", exportVisibleGeoJson);
document.getElementById("export-csv-button").addEventListener("click", exportVisibleCsv);
document.getElementById("import-geojson-button").addEventListener("click", importGeoJson);
document.getElementById("import-csv-button").addEventListener("click", importCsv);
document.getElementById("reset-demo-button").addEventListener("click", resetDemoData);
document.getElementById("quick-splice-button").addEventListener("click", () => {
  el.createType.value = "splice_point";
  document.getElementById("create-name").value = "New synthetic splice point";
  document.getElementById("create-status").value = "proposed";
  renderDynamicFields();
});

el.createType.addEventListener("change", renderDynamicFields);
el.createForm.addEventListener("submit", createAssetFromForm);
el.commandForm.addEventListener("submit", runCommand);

load().catch((error) => {
  el.startupNotice.textContent = `Startup failed: ${error.message}`;
  toast(`Startup failed: ${error.message}`);
});
