"use client";

import Link from "next/link";
import { Cable, ClipboardList, Eye, Filter, GitBranch, Landmark, MapPin, Network, RadioTower } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/Badges";
import { displayValue, formatLabel } from "@/lib/api";
import type { JsonRecord } from "@/types";

type MapPayload = { viewport?: JsonRecord; layers?: Record<string, JsonRecord[]>; todo?: string };
type LayerKey = "substations" | "transmission_lines" | "assumed_opgw" | "verified_fiber" | "sel_icon_nodes" | "circuit_paths" | "work_order_locations";
type SelectedFeature = { layer: LayerKey; row: JsonRecord };
type Point = { x: number; y: number };
type GeoPoint = { latitude: number; longitude: number };

const WIDTH = 920;
const HEIGHT = 560;
const BOUNDS = { minLon: -73.9, maxLon: -66.7, minLat: 40.7, maxLat: 47.7 };

const LAYERS: Array<{ key: LayerKey; label: string; className: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "substations", label: "Substations", className: "substations", icon: Landmark },
  { key: "transmission_lines", label: "Transmission Lines", className: "transmission-lines", icon: GitBranch },
  { key: "assumed_opgw", label: "Assumed OPGW", className: "assumed-opgw", icon: Cable },
  { key: "verified_fiber", label: "Verified Fiber", className: "verified-fiber", icon: Cable },
  { key: "sel_icon_nodes", label: "SEL ICON Nodes", className: "sel-icon-nodes", icon: Network },
  { key: "circuit_paths", label: "Circuit Paths", className: "circuit-paths", icon: RadioTower },
  { key: "work_order_locations", label: "Work Orders", className: "work-order-locations", icon: ClipboardList },
];

export function AssetBrowserMap({ mapData }: { mapData: MapPayload | null }) {
  const layers = mapData?.layers || {};
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [stateFilter, setStateFilter] = useState("");
  const [query, setQuery] = useState("");
  const [enabledLayers, setEnabledLayers] = useState<Partial<Record<LayerKey, boolean>>>({});
  const layerEnabled = (key: LayerKey) => enabledLayers[key] !== false;
  const layerRows = (key: LayerKey) => (layers[key] || []) as JsonRecord[];

  const states = useMemo(() => {
    const values = new Set<string>();
    LAYERS.forEach(({ key }) => layerRows(key).forEach((row) => {
      const state = stringValue(row.state);
      if (state) values.add(state);
    }));
    return Array.from(values).sort();
  }, [layers]);

  const visibleLayers = useMemo(() => {
    const next = {} as Record<LayerKey, JsonRecord[]>;
    LAYERS.forEach(({ key }) => {
      next[key] = layerEnabled(key) ? layerRows(key).filter((row) => matchesFilters(row, stateFilter, query)) : [];
    });
    return next;
  }, [enabledLayers, layers, query, stateFilter]);

  const totals = LAYERS.map(({ key, label }) => ({ key, label, total: layerRows(key).length, visible: visibleLayers[key].length }));
  const firstSubstation = visibleLayers.substations[0];
  const defaultSelection: SelectedFeature | null = firstSubstation ? { layer: "substations", row: firstSubstation } : null;
  const activeSelection = selected && visibleLayers[selected.layer].some((row) => row === selected.row || String(row.id) === String(selected.row.id)) ? selected : defaultSelection;

  return (
    <div className="asset-browser">
      <div className="asset-map-panel">
        <div className="asset-map-toolbar">
          <div>
            <div className="section-title">Browse Assets</div>
            <div className="subtle">{displayValue(mapData?.viewport?.name || "New England")} synthetic planning map</div>
          </div>
          <div className="toolbar">
            <Filter size={16} />
            <select className="select compact-select" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
              <option value="">All states</option>
              {states.map((value) => <option key={value}>{value}</option>)}
            </select>
            <input className="input compact-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search map assets" />
          </div>
        </div>
        <div className="asset-layer-toggles">
          {LAYERS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`layer-toggle ${layerEnabled(key) ? "active" : ""}`} onClick={() => setEnabledLayers((current) => ({ ...current, [key]: !layerEnabled(key) }))}>
              <Icon size={14} />
              <span>{label}</span>
              <strong>{layerRows(key).length}</strong>
            </button>
          ))}
        </div>
        <div className="asset-map-canvas" aria-label="New England synthetic asset browser map">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="New England grid asset layers">
            <rect className="map-background" width={WIDTH} height={HEIGHT} rx="8" />
            <MapFrame />
            {visibleLayers.transmission_lines.map((row) => <MapLine key={`line-${displayValue(row.id)}`} row={row} layer="transmission_lines" className="transmission-lines" onSelect={setSelected} />)}
            {visibleLayers.assumed_opgw.map((row) => <MapLine key={`opgw-${displayValue(row.id)}`} row={row} layer="assumed_opgw" className="assumed-opgw" onSelect={setSelected} />)}
            {visibleLayers.verified_fiber.map((row) => <EndpointLine key={`fiber-${displayValue(row.id)}`} row={row} layer="verified_fiber" className="verified-fiber" onSelect={setSelected} />)}
            {visibleLayers.circuit_paths.map((row) => <EndpointLine key={`circuit-${displayValue(row.id)}`} row={row} layer="circuit_paths" className="circuit-paths" onSelect={setSelected} />)}
            {visibleLayers.substations.map((row) => <MapMarker key={`sub-${displayValue(row.id)}`} row={row} layer="substations" className="substations" shape="circle" onSelect={setSelected} />)}
            {visibleLayers.sel_icon_nodes.map((row) => <MapMarker key={`icon-${displayValue(row.id)}`} row={row} layer="sel_icon_nodes" className="sel-icon-nodes" shape="diamond" onSelect={setSelected} />)}
            {visibleLayers.work_order_locations.map((row) => <MapMarker key={`wo-${displayValue(row.id)}`} row={row} layer="work_order_locations" className="work-order-locations" shape="square" onSelect={setSelected} />)}
          </svg>
        </div>
        <div className="asset-map-counts">
          {totals.map((item) => <span key={item.key} className="source-badge planned">{item.label}: {item.visible}/{item.total}</span>)}
        </div>
      </div>
      <div className="asset-detail-panel">
        <SelectedAsset feature={activeSelection} />
      </div>
    </div>
  );
}

function MapFrame() {
  const labels = [
    { label: "ME", latitude: 45.3, longitude: -69.1 },
    { label: "VT", latitude: 44.0, longitude: -72.6 },
    { label: "NH", latitude: 43.8, longitude: -71.6 },
    { label: "MA", latitude: 42.1, longitude: -71.8 },
    { label: "RI", latitude: 41.7, longitude: -71.5 },
    { label: "CT", latitude: 41.5, longitude: -72.7 },
  ];
  return (
    <>
      <path className="map-region-outline" d="M104 441 L196 406 L245 420 L331 376 L390 386 L480 348 L580 318 L649 245 L735 204 L809 122 L858 68" />
      <path className="map-region-outline secondary" d="M161 309 L239 274 L302 297 L377 246 L477 250 L567 196 L655 179" />
      {labels.map((item) => {
        const point = project(item.latitude, item.longitude);
        return <text className="map-state-label" key={item.label} x={point.x} y={point.y}>{item.label}</text>;
      })}
    </>
  );
}

function MapLine({ row, layer, className, onSelect }: { row: JsonRecord; layer: LayerKey; className: string; onSelect: (feature: SelectedFeature) => void }) {
  const points = coordinates(row).map(([longitude, latitude]) => project(latitude, longitude));
  if (points.length < 2) return null;
  return <InteractivePath row={row} layer={layer} className={className} points={points} onSelect={onSelect} />;
}

function EndpointLine({ row, layer, className, onSelect }: { row: JsonRecord; layer: LayerKey; className: string; onSelect: (feature: SelectedFeature) => void }) {
  const a = geoPoint(row, "a");
  const z = geoPoint(row, "z");
  if (!a || !z) return null;
  return <InteractivePath row={row} layer={layer} className={className} points={[project(a.latitude, a.longitude), project(z.latitude, z.longitude)]} onSelect={onSelect} />;
}

function InteractivePath({ row, layer, className, points, onSelect }: { row: JsonRecord; layer: LayerKey; className: string; points: Point[]; onSelect: (feature: SelectedFeature) => void }) {
  const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const label = displayValue(row.asset_label || row.line_name || row.circuit_id || row.cable_id);
  return (
    <g role="button" tabIndex={0} aria-label={`Open ${label}`} onClick={() => onSelect({ layer, row })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect({ layer, row }); }}>
      <path className={`asset-map-line-hit ${className}`} d={pathData} />
      <path className={`asset-map-line ${className}`} d={pathData} />
      <title>{label}</title>
    </g>
  );
}

function MapMarker({ row, layer, className, shape, onSelect }: { row: JsonRecord; layer: LayerKey; className: string; shape: "circle" | "diamond" | "square"; onSelect: (feature: SelectedFeature) => void }) {
  const point = geoPoint(row);
  if (!point) return null;
  const projected = project(point.latitude, point.longitude);
  const label = displayValue(row.asset_label || row.substation_name || row.node_name || row.work_order_number);
  return (
    <g role="button" tabIndex={0} aria-label={`Open ${label}`} className={`asset-map-marker ${className}`} transform={`translate(${projected.x.toFixed(1)} ${projected.y.toFixed(1)})`} onClick={() => onSelect({ layer, row })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect({ layer, row }); }}>
      {shape === "circle" ? <circle r="7" /> : shape === "diamond" ? <rect x="-7" y="-7" width="14" height="14" rx="3" transform="rotate(45)" /> : <rect x="-7" y="-7" width="14" height="14" rx="3" />}
      <text x="10" y="-10">{shortLabel(label)}</text>
      <title>{label}</title>
    </g>
  );
}

function SelectedAsset({ feature }: { feature: SelectedFeature | null }) {
  if (!feature) return <div className="subtle">No map feature selected.</div>;
  const { row, layer } = feature;
  const href = stringValue(row.href);
  const title = displayValue(row.asset_label || row.substation_name || row.line_name || row.circuit_id || row.work_order_number || row.id);
  const layerLabel = LAYERS.find((item) => item.key === layer)?.label || formatLabel(layer);
  const important = ["state", "owner_name", "voltage_class", "status", "synthetic_status", "confidence_level", "service_type", "criticality", "ring_name", "assumed_or_verified_path", "work_type", "priority"];
  return (
    <div>
      <div className="asset-detail-heading">
        <div>
          <div className="section-title">{layerLabel}</div>
          <h2>{title}</h2>
        </div>
        <Badge value={row.synthetic_status || row.status || layerLabel} />
      </div>
      <div className="asset-detail-fields">
        {important.filter((key) => row[key] !== undefined && row[key] !== null).map((key) => (
          <div className="field compact-field" key={key}>
            <div className="field-label">{formatLabel(key)}</div>
            <div className="field-value">{displayValue(row[key])}</div>
          </div>
        ))}
      </div>
      {href ? <Link className="button primary asset-open-link" href={href}><Eye size={16} />Open Detail</Link> : null}
      <details className="asset-json-details">
        <summary>Raw synthetic/public-reference payload</summary>
        <pre className="json-block">{JSON.stringify(row, null, 2)}</pre>
      </details>
    </div>
  );
}

function matchesFilters(row: JsonRecord, stateFilter: string, query: string): boolean {
  if (stateFilter && stringValue(row.state) !== stateFilter) return false;
  if (!query) return true;
  const haystack = Object.values(row).map((value) => displayValue(value).toLowerCase()).join(" ");
  return haystack.includes(query.toLowerCase());
}

function coordinates(row: JsonRecord): Array<[number, number]> {
  const value = row.geometry_coordinates || (row.geometry_json as JsonRecord | undefined)?.coordinates;
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const longitude = numberValue(point[0]);
    const latitude = numberValue(point[1]);
    return longitude === undefined || latitude === undefined ? [] : [[longitude, latitude] as [number, number]];
  });
}

function geoPoint(row: JsonRecord, prefix = ""): GeoPoint | null {
  const latitude = numberValue(row[`${prefix ? `${prefix}_` : ""}latitude`]);
  const longitude = numberValue(row[`${prefix ? `${prefix}_` : ""}longitude`]);
  return latitude === undefined || longitude === undefined ? null : { latitude, longitude };
}

function project(latitude: number, longitude: number): Point {
  const x = ((longitude - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * WIDTH;
  const y = ((BOUNDS.maxLat - latitude) / (BOUNDS.maxLat - BOUNDS.minLat)) * HEIGHT;
  return { x: Math.max(24, Math.min(WIDTH - 24, x)), y: Math.max(24, Math.min(HEIGHT - 24, y)) };
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function shortLabel(value: string): string {
  const match = value.match(/[A-Z]{2}-[A-Z0-9]{3}/);
  if (match) return match[0];
  return value.length > 18 ? value.slice(0, 18) : value;
}
