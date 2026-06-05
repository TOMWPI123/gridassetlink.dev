"use client";

import { CircleDot, Filter, Route, Search, X } from "lucide-react";
import type { TelecomAssetFeature, TelecomAssetFilters } from "@/lib/types/assets";
import { getAssetName, getAssetStatus, getAssetSite } from "@/lib/api/assets";

type FilterOptions = {
  statuses: string[];
  regions: string[];
  criticalities: string[];
  manufacturers: string[];
  lifecycleStates: string[];
  fiberTypes: string[];
  circuitServiceTypes: string[];
  workOrderPriorities: string[];
};

type SearchAndFiltersProps = {
  collapsed: boolean;
  filters: TelecomAssetFilters;
  filterOptions: FilterOptions;
  results: TelecomAssetFeature[];
  planningMode: boolean;
  selectedDraftSites: string[];
  onFiltersChange: (filters: TelecomAssetFilters) => void;
  onSelectAsset: (asset: TelecomAssetFeature) => void;
  onToggleCollapsed: () => void;
  onTogglePlanningMode: () => void;
  onCreateDraftRoute: () => void;
  onClearDraftSites: () => void;
};

const assetTypeOptions = [
  ["substation", "Substations"],
  ["telecom_node", "Telecom nodes"],
  ["fiber_route", "Fiber routes"],
  ["telecom_circuit", "Circuits"],
  ["microwave_path", "Microwave"],
  ["work_order", "Work orders"],
  ["proposed_change", "Proposed"],
] as const;

export function SearchAndFilters({
  collapsed,
  filters,
  filterOptions,
  results,
  planningMode,
  selectedDraftSites,
  onFiltersChange,
  onSelectAsset,
  onToggleCollapsed,
  onTogglePlanningMode,
  onCreateDraftRoute,
  onClearDraftSites,
}: SearchAndFiltersProps) {
  if (collapsed) {
    return (
      <aside className="telecom-map-sidebar collapsed" aria-label="Collapsed search and filters">
        <button className="telecom-map-icon-button" type="button" onClick={onToggleCollapsed} title="Open search and filters">
          <Filter size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="telecom-map-sidebar" aria-label="Search and filters">
      <div className="telecom-panel-heading">
        <div>
          <strong>Telecom Asset Map</strong>
          <span>New England planning view</span>
        </div>
        <button className="telecom-map-icon-button" type="button" onClick={onToggleCollapsed} title="Collapse filters">
          <X size={16} />
        </button>
      </div>

      <label className="telecom-map-search">
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
          placeholder="Search assets"
          aria-label="Search assets"
        />
      </label>

      <div className="telecom-filter-section">
        <div className="telecom-filter-title"><CircleDot size={14} />Asset types</div>
        <div className="telecom-token-grid">
          {assetTypeOptions.map(([assetType, label]) => (
            <button
              className={`telecom-filter-token ${filters.assetTypes.includes(assetType) ? "active" : ""}`}
              type="button"
              key={assetType}
              onClick={() => toggleFilter(filters, "assetTypes", assetType, onFiltersChange)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="telecom-filter-grid">
        <MultiSelectFilter label="Status" values={filters.statuses} options={filterOptions.statuses} onChange={(statuses) => onFiltersChange({ ...filters, statuses })} />
        <MultiSelectFilter label="Region" values={filters.regions} options={filterOptions.regions} onChange={(regions) => onFiltersChange({ ...filters, regions })} />
        <MultiSelectFilter label="Criticality" values={filters.criticalities} options={filterOptions.criticalities} onChange={(criticalities) => onFiltersChange({ ...filters, criticalities })} />
        <MultiSelectFilter label="Manufacturer" values={filters.manufacturers} options={filterOptions.manufacturers} onChange={(manufacturers) => onFiltersChange({ ...filters, manufacturers })} />
        <MultiSelectFilter label="Lifecycle" values={filters.lifecycleStates} options={filterOptions.lifecycleStates} onChange={(lifecycleStates) => onFiltersChange({ ...filters, lifecycleStates })} />
        <MultiSelectFilter label="Fiber Type" values={filters.fiberTypes} options={filterOptions.fiberTypes} onChange={(fiberTypes) => onFiltersChange({ ...filters, fiberTypes })} />
        <MultiSelectFilter label="Circuit Type" values={filters.circuitServiceTypes} options={filterOptions.circuitServiceTypes} onChange={(circuitServiceTypes) => onFiltersChange({ ...filters, circuitServiceTypes })} />
        <MultiSelectFilter label="WO Priority" values={filters.workOrderPriorities} options={filterOptions.workOrderPriorities} onChange={(workOrderPriorities) => onFiltersChange({ ...filters, workOrderPriorities })} />
      </div>

      <div className={`telecom-planning-card ${planningMode ? "active" : ""}`}>
        <div className="telecom-filter-title"><Route size={14} />Planning Mode</div>
        <p>Click two substations on the map to stage a synthetic proposed route.</p>
        <div className="telecom-draft-sites">
          <span>{selectedDraftSites[0] || "A-end not selected"}</span>
          <span>{selectedDraftSites[1] || "Z-end not selected"}</span>
        </div>
        <div className="telecom-planning-actions">
          <button className="telecom-map-button primary" type="button" onClick={onTogglePlanningMode}>{planningMode ? "Exit Planning" : "Start Planning"}</button>
          <button className="telecom-map-button" type="button" onClick={onCreateDraftRoute} disabled={selectedDraftSites.length < 2}>Save Proposal</button>
          <button className="telecom-map-icon-button" type="button" onClick={onClearDraftSites} title="Clear drafted endpoints"><X size={15} /></button>
        </div>
      </div>

      <div className="telecom-filter-section">
        <div className="telecom-filter-title">Results <span>{results.length}</span></div>
        <div className="telecom-result-list">
          {results.slice(0, 18).map((asset) => (
            <button className="telecom-result-row" type="button" key={assetKey(asset)} onClick={() => onSelectAsset(asset)}>
              <strong>{getAssetName(asset)}</strong>
              <span>{assetLabel(asset)} / {getAssetSite(asset)}</span>
              <small>{getAssetStatus(asset)}</small>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function MultiSelectFilter({ label, values, options, onChange }: { label: string; values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  return (
    <label className="telecom-filter-field">
      <span>{label}</span>
      <select
        value=""
        onChange={(event) => {
          if (!event.target.value) return;
          const next = values.includes(event.target.value) ? values.filter((value) => value !== event.target.value) : [...values, event.target.value];
          onChange(next);
        }}
        aria-label={`${label} filter`}
      >
        <option value="">{values.length ? `${values.length} selected` : "All"}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {values.length ? (
        <div className="telecom-active-filter-row">
          {values.map((value) => (
            <button type="button" key={value} onClick={() => onChange(values.filter((item) => item !== value))}>{value}<X size={12} /></button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function toggleFilter(
  filters: TelecomAssetFilters,
  key: keyof Pick<TelecomAssetFilters, "assetTypes">,
  value: string,
  onChange: (filters: TelecomAssetFilters) => void,
) {
  const current = filters[key];
  onChange({ ...filters, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
}

function assetLabel(asset: TelecomAssetFeature): string {
  return asset.assetKind.replaceAll("_", " ");
}

function assetKey(asset: TelecomAssetFeature): string {
  const props = asset.properties as Record<string, unknown>;
  return `${asset.assetKind}-${String(props.id || props.circuitId || props.pathId || props.woId || props.routeName)}`;
}
