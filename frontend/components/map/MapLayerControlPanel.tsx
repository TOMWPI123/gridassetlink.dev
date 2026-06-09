"use client";

import { Layers, Search, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { OpgwCableSectionFeature, OpgwRouteFeature, OpgwSplicePointFeature, StreetMapLayerKey } from "@/lib/types/assets";

type MapLayerControlPanelProps = {
  layers: Record<StreetMapLayerKey, boolean>;
  onLayerChange?: (layer: StreetMapLayerKey, enabled: boolean) => void;
  publicLineCount?: number;
  visiblePublicLineCount?: number;
  publicSubstationCount?: number;
  visiblePublicSubstationCount?: number;
  fccTowerCount?: number;
  visibleFccTowerCount?: number;
  fccLinkCount?: number;
  visibleFccLinkCount?: number;
  utilityOwnerCount?: number;
  structureCount?: number;
  spliceClosureCount?: number;
  opgwRouteCount?: number;
  assumedOpgwRouteCount?: number;
  plannedOpgwRouteCount?: number;
  verifiedOpgwRouteCount?: number;
  opgwCableSectionCount?: number;
  opgwSpanSegmentCount?: number;
  opgwSplicePointCount?: number;
  patchPanelCount?: number;
  availableStrandCount?: number;
  criticalRidingCircuitCount?: number;
  outageImpactCount?: number;
  openOpgwWorkOrderCount?: number;
  spanInspectionIssueCount?: number;
  opgwRoutes?: OpgwRouteFeature[];
  opgwCableSections?: OpgwCableSectionFeature[];
  opgwSplicePoints?: OpgwSplicePointFeature[];
  focusedOpgwRouteId?: string;
  focusedOpgwSectionId?: string;
  focusedOpgwSplicePointId?: string;
  dataWarnings?: Record<string, string>;
  transmissionLineOwnerCounts?: Array<{ owner: string; count: number }>;
  visibleTransmissionLineOwners?: Record<string, boolean>;
  substationOwnerCounts?: Array<{ owner: string; count: number }>;
  visibleSubstationOwners?: Record<string, boolean>;
  fccTowerOwnerCounts?: Array<{ owner: string; count: number }>;
  visibleFccTowerOwners?: Record<string, boolean>;
  fccLinkOwnerCounts?: Array<{ owner: string; count: number }>;
  visibleFccLinkOwners?: Record<string, boolean>;
  fccFrequencyBandCounts?: Array<{ frequencyBand: string; count: number }>;
  visibleFccFrequencyBands?: Record<string, boolean>;
  onTransmissionLineOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllTransmissionLineOwnersChange?: (enabled: boolean) => void;
  onSubstationOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllSubstationOwnersChange?: (enabled: boolean) => void;
  onFccTowerOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllFccTowerOwnersChange?: (enabled: boolean) => void;
  onFccLinkOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllFccLinkOwnersChange?: (enabled: boolean) => void;
  onFccFrequencyBandChange?: (frequencyBand: string, enabled: boolean) => void;
  onAllFccFrequencyBandsChange?: (enabled: boolean) => void;
  onFocusOpgwRoute?: (routeId: string) => void;
  onFocusOpgwSection?: (sectionId: string) => void;
  onFocusOpgwSplicePoint?: (splicePointId: string) => void;
  onClearOpgwFocus?: () => void;
};

const layerRows: Array<{ key: StreetMapLayerKey; label: string; note: string; badges?: string[] }> = [
  { key: "publicTransmissionLines", label: "HIFLD transmission lines", note: "Public HIFLD line geometry grouped by HIFLD OWNER, close OSM line owner/operator matches, and explicit line-name owner tokens", badges: ["Public", "Owner buckets"] },
  { key: "publicSubstations", label: "Verified-owner substation nodes", note: "Open-source substation nodes grouped by public source fields or close OSM owner/operator matches", badges: ["Public", "Owner buckets"] },
  { key: "fccUtilityTowers", label: "FCC utility tower nodes", note: "Public FCC ULS utility licensee microwave tower/site records", badges: ["Public", "FCC ULS", "Nodes"] },
  { key: "fccMicrowaveLinks", label: "FCC microwave path links", note: "Public FCC ULS point-to-point microwave paths grouped by owner and path frequency", badges: ["Public", "FCC ULS", "Frequency"] },
  { key: "transmissionStructures", label: "Transmission structures", note: "Synthetic demo structure points sampled from public line geometry", badges: ["Synthetic", "Demo"] },
  { key: "spliceClosures", label: "Splice closures", note: "Synthetic demo splice closures mounted on synthetic structures", badges: ["Synthetic", "Demo"] },
];

const opgwLayerRows: Array<{ key: StreetMapLayerKey; label: string; note: string; badges: string[] }> = [
  { key: "publicTransmissionLines", label: "Public Transmission Lines", note: "Public HIFLD reference corridors only; not proof of OPGW.", badges: ["Public", "Read-only"] },
  { key: "publicSubstations", label: "Verified-Owner Substations", note: "Public substation points with verified open-source owner buckets.", badges: ["Public"] },
  { key: "transmissionStructures", label: "Transmission Structures", note: "Synthetic structure points used to define OPGW spans.", badges: ["Synthetic", "Structures"] },
  { key: "assumedOpgwRoutes", label: "Synthetic OPGW Assumptions", note: "Synthetic assumptions generated from transmission corridors.", badges: ["Synthetic", "Assumed"] },
  { key: "opgwRoutes", label: "OPGW Routes", note: "High-level OPGW route records associated with transmission corridors.", badges: ["Route"] },
  { key: "opgwCableSections", label: "Planned OPGW Cable Sections", note: "Continuous cable sections from splice point to splice point.", badges: ["Cable sections"] },
  { key: "verifiedOpgwFiber", label: "Verified OPGW Cable Sections", note: "Only sections explicitly marked as as-built verified.", badges: ["Verified only"] },
  { key: "opgwSpanSegments", label: "OPGW Span Segments", note: "Structure-to-structure span segments linked to parent cable sections.", badges: ["Spans"] },
  { key: "opgwSplicePoints", label: "Splice Points", note: "Synthetic splice, transition, tap, and substation termination points.", badges: ["Splice points"] },
  { key: "existingFiberSplices", label: "Existing Fiber Splices", note: "Read-only synthetic-existing or verified splice continuity nodes.", badges: ["Existing", "Read-only"] },
  { key: "proposedFiberSplices", label: "Proposed Fiber Splices", note: "Editable proposed splice layer for engineering preview.", badges: ["Proposed", "Editable"] },
  { key: "compareSpliceLayers", label: "Compare Existing vs Proposed", note: "Shows existing and proposed splice layers together for review.", badges: ["Compare"] },
  { key: "spliceClosures", label: "Splice Closures", note: "Synthetic closures at terminal and junction structures.", badges: ["Synthetic", "Splices"] },
  { key: "patchPanels", label: "Patch Panels", note: "Synthetic termination panels at structures and nodes.", badges: ["Synthetic", "Panels"] },
  { key: "fiberStrandsLayer", label: "Fiber Strands", note: "Strand records belong to cable sections in this engineering view.", badges: ["Strands"] },
  { key: "fiberAssignments", label: "Fiber Assignments", note: "Synthetic service assignments on OPGW cable sections.", badges: ["Assignments"] },
  { key: "availableStrandCapacity", label: "Available Strand Capacity", note: "Capacity coloring from synthetic strand records.", badges: ["Capacity"] },
  { key: "criticalRidingCircuits", label: "Critical Riding Circuits", note: "Synthetic SEL ICON, C37.94, DTT, Protection, and SCADA assignments.", badges: ["Critical"] },
  { key: "opgwOutageImpact", label: "Outage Impact", note: "Synthetic high-risk routes, sections, and spans.", badges: ["Impact"] },
  { key: "opgwOpenWorkOrders", label: "Open Work Orders", note: "Synthetic work-order indicators tied to OPGW spans.", badges: ["Work"] },
  { key: "opgwSpanInspectionIssues", label: "Span Inspection Issues", note: "Synthetic span inspection or midspan issue highlights.", badges: ["Inspection"] },
];

export function MapLayerControlPanel({
  layers,
  onLayerChange,
  publicLineCount = 0,
  visiblePublicLineCount = publicLineCount,
  publicSubstationCount = 0,
  visiblePublicSubstationCount = publicSubstationCount,
  fccTowerCount = 0,
  visibleFccTowerCount = fccTowerCount,
  fccLinkCount = 0,
  visibleFccLinkCount = fccLinkCount,
  utilityOwnerCount = 0,
  structureCount = 0,
  spliceClosureCount = 0,
  opgwRouteCount = 0,
  assumedOpgwRouteCount = 0,
  plannedOpgwRouteCount = 0,
  verifiedOpgwRouteCount = 0,
  opgwCableSectionCount = 0,
  opgwSpanSegmentCount = 0,
  opgwSplicePointCount = 0,
  patchPanelCount = 0,
  availableStrandCount = 0,
  criticalRidingCircuitCount = 0,
  outageImpactCount = 0,
  openOpgwWorkOrderCount = 0,
  spanInspectionIssueCount = 0,
  opgwRoutes = [],
  opgwCableSections = [],
  opgwSplicePoints = [],
  focusedOpgwRouteId,
  focusedOpgwSectionId,
  focusedOpgwSplicePointId,
  dataWarnings,
  transmissionLineOwnerCounts = [],
  visibleTransmissionLineOwners = {},
  substationOwnerCounts = [],
  visibleSubstationOwners = {},
  fccTowerOwnerCounts = [],
  visibleFccTowerOwners = {},
  fccLinkOwnerCounts = [],
  visibleFccLinkOwners = {},
  fccFrequencyBandCounts = [],
  visibleFccFrequencyBands = {},
  onTransmissionLineOwnerChange,
  onAllTransmissionLineOwnersChange,
  onSubstationOwnerChange,
  onAllSubstationOwnersChange,
  onFccTowerOwnerChange,
  onAllFccTowerOwnersChange,
  onFccLinkOwnerChange,
  onAllFccLinkOwnersChange,
  onFccFrequencyBandChange,
  onAllFccFrequencyBandsChange,
  onFocusOpgwRoute,
  onFocusOpgwSection,
  onFocusOpgwSplicePoint,
  onClearOpgwFocus,
}: MapLayerControlPanelProps) {
  const counts: Partial<Record<StreetMapLayerKey, number>> = {
    publicTransmissionLines: publicLineCount,
    publicSubstations: publicSubstationCount,
    fccUtilityTowers: fccTowerCount,
    fccMicrowaveLinks: fccLinkCount,
    transmissionStructures: structureCount,
    spliceClosures: spliceClosureCount,
  };
  const visibleLineOwnerCount = transmissionLineOwnerCounts.filter(({ owner }) => visibleTransmissionLineOwners[owner] !== false).length;
  const visibleSubstationOwnerCount = substationOwnerCounts.filter(({ owner }) => visibleSubstationOwners[owner] !== false).length;
  const visibleFccTowerOwnerCount = fccTowerOwnerCounts.filter(({ owner }) => visibleFccTowerOwners[owner] !== false).length;
  const visibleFccLinkOwnerCount = fccLinkOwnerCounts.filter(({ owner }) => visibleFccLinkOwners[owner] !== false).length;
  const visibleFccFrequencyBandCount = fccFrequencyBandCounts.filter(({ frequencyBand }) => visibleFccFrequencyBands[frequencyBand] !== false).length;
  return (
    <aside className="street-layer-control-panel" aria-label="Street-level layer and drawing controls">
      <div className="street-panel-title"><Layers size={16} />Street Map Layers</div>
      <div className="street-layer-grid">
        {layerRows.map((layer) => (
          <div className={`street-layer-group ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <label className={`street-layer-toggle ${layers[layer.key] ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={layers[layer.key]}
                onChange={(event) => onLayerChange?.(layer.key, event.currentTarget.checked)}
              />
              <span>
                <strong>
                  {layer.label}
                  {counts[layer.key] !== undefined ? <em>{counts[layer.key]}</em> : null}
                </strong>
                <small>{dataWarningForLayer(layer.key, dataWarnings) || layer.note}</small>
                {layer.badges?.length ? (
                  <span className="street-layer-badges">
                    {layer.badges.map((badge) => <b key={badge}>{badge}</b>)}
                  </span>
                ) : null}
              </span>
            </label>
            {layer.key === "publicTransmissionLines" && layers.publicTransmissionLines ? (
              <OwnerSublayerList
                title="Transmission owner sublayers"
                visibleCount={visiblePublicLineCount}
                totalCount={publicLineCount}
                visibleOwnerCount={visibleLineOwnerCount}
                totalOwnerCount={transmissionLineOwnerCounts.length}
                ownerCounts={transmissionLineOwnerCounts}
                visibleOwners={visibleTransmissionLineOwners}
                onOwnerChange={onTransmissionLineOwnerChange}
                onAllOwnersChange={onAllTransmissionLineOwnersChange}
              />
            ) : null}
            {layer.key === "publicSubstations" && layers.publicSubstations ? (
              <OwnerSublayerList
                title="Substation owner sublayers"
                visibleCount={visiblePublicSubstationCount}
                totalCount={publicSubstationCount}
                visibleOwnerCount={visibleSubstationOwnerCount}
                totalOwnerCount={substationOwnerCounts.length}
                ownerCounts={substationOwnerCounts}
                visibleOwners={visibleSubstationOwners}
                onOwnerChange={onSubstationOwnerChange}
                onAllOwnersChange={onAllSubstationOwnersChange}
              />
            ) : null}
            {layer.key === "fccUtilityTowers" && layers.fccUtilityTowers ? (
              <OwnerSublayerList
                title="FCC tower owner sublayers"
                visibleCount={visibleFccTowerCount}
                totalCount={fccTowerCount}
                visibleOwnerCount={visibleFccTowerOwnerCount}
                totalOwnerCount={fccTowerOwnerCounts.length}
                ownerCounts={fccTowerOwnerCounts}
                visibleOwners={visibleFccTowerOwners}
                onOwnerChange={onFccTowerOwnerChange}
                onAllOwnersChange={onAllFccTowerOwnersChange}
              />
            ) : null}
            {layer.key === "fccMicrowaveLinks" && layers.fccMicrowaveLinks ? (
              <OwnerSublayerList
                title="FCC link owner sublayers"
                visibleCount={visibleFccLinkCount}
                totalCount={fccLinkCount}
                visibleOwnerCount={visibleFccLinkOwnerCount}
                totalOwnerCount={fccLinkOwnerCounts.length}
                ownerCounts={fccLinkOwnerCounts}
                visibleOwners={visibleFccLinkOwners}
                onOwnerChange={onFccLinkOwnerChange}
                onAllOwnersChange={onAllFccLinkOwnersChange}
              />
            ) : null}
            {layer.key === "fccMicrowaveLinks" && layers.fccMicrowaveLinks ? (
              <FrequencySublayerList
                title="Path frequency sublayers"
                visibleCount={visibleFccLinkCount}
                totalCount={fccLinkCount}
                visibleFrequencyBandCount={visibleFccFrequencyBandCount}
                totalFrequencyBandCount={fccFrequencyBandCounts.length}
                frequencyBandCounts={fccFrequencyBandCounts}
                visibleFrequencyBands={visibleFccFrequencyBands}
                onFrequencyBandChange={onFccFrequencyBandChange}
                onAllFrequencyBandsChange={onAllFccFrequencyBandsChange}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="street-layer-section-heading">
        <span>Synthetic OPGW Fiber</span>
        <em>{opgwRouteCount} routes</em>
      </div>
      <div className="street-layer-grid">
        {opgwLayerRows.map((layer) => (
          <div className={`street-layer-group ${layers[layer.key] ? "active" : ""}`} key={layer.key}>
            <label className={`street-layer-toggle ${layers[layer.key] ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={layers[layer.key]}
                onChange={(event) => onLayerChange?.(layer.key, event.currentTarget.checked)}
              />
              <span>
                <strong>
                  {layer.label}
                  <em>{opgwCountForLayer(layer.key, {
                    publicLineCount,
                    publicSubstationCount,
                    assumedOpgwRouteCount,
                    plannedOpgwRouteCount,
                    verifiedOpgwRouteCount,
                    opgwCableSectionCount,
                    opgwSpanSegmentCount,
                    opgwSplicePointCount,
                    structureCount,
                    spliceClosureCount,
                    patchPanelCount,
                    availableStrandCount,
                    criticalRidingCircuitCount,
                    outageImpactCount,
                    openOpgwWorkOrderCount,
                    spanInspectionIssueCount,
                  })}</em>
                </strong>
                <small>{dataWarningForLayer(layer.key, dataWarnings) || layer.note}</small>
                <span className="street-layer-badges">
                  {layer.badges.map((badge) => <b key={badge}>{badge}</b>)}
                </span>
              </span>
            </label>
            {layer.key === "opgwRoutes" ? (
              <OpgwRouteSublayerTree
                routes={opgwRoutes}
                cableSections={opgwCableSections}
                splicePoints={opgwSplicePoints}
                cableSectionsVisible={layers.opgwCableSections}
                focusedRouteId={focusedOpgwRouteId}
                focusedSectionId={focusedOpgwSectionId}
                focusedSplicePointId={focusedOpgwSplicePointId}
                onFocusRoute={onFocusOpgwRoute}
                onFocusSection={onFocusOpgwSection}
                onFocusSplicePoint={onFocusOpgwSplicePoint}
                onClearFocus={onClearOpgwFocus}
                onLayerChange={onLayerChange}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="street-layer-warning">
        Synthetic planning assumption only. Not active fiber. Requires engineer/as-built verification.
        <small>Conversion workflow: synthetic assumption -&gt; planned OPGW -&gt; designed -&gt; work order -&gt; as-built verified.</small>
      </div>
      <div className="street-map-todo-note">
        Dashboard map is limited to public HIFLD transmission-line references, verified-owner public substation nodes, public FCC ULS utility tower/site records, public FCC ULS microwave path links, close OpenStreetMap owner/operator matches, and synthetic demo planning layers. FCC records are public license/path references only; OPGW cables, strand capacity, assignments, splice closures, patch panels, critical circuits, and outage-impact overlays are synthetic/demo records unless imported and verified later.
      </div>
    </aside>
  );
}

function OwnerSublayerList({
  title,
  visibleCount,
  totalCount,
  visibleOwnerCount,
  totalOwnerCount,
  ownerCounts,
  visibleOwners,
  onOwnerChange,
  onAllOwnersChange,
}: {
  title: string;
  visibleCount: number;
  totalCount: number;
  visibleOwnerCount: number;
  totalOwnerCount: number;
  ownerCounts: Array<{ owner: string; count: number }>;
  visibleOwners: Record<string, boolean>;
  onOwnerChange?: (owner: string, enabled: boolean) => void;
  onAllOwnersChange?: (enabled: boolean) => void;
}) {
  return (
    <div className="street-owner-sublayers" aria-label={title}>
      <div className="street-owner-sublayer-heading">
        <span>
          {title}
          <small>{visibleCount} of {totalCount} assets shown / {visibleOwnerCount} of {totalOwnerCount} owners</small>
        </span>
        <span className="street-owner-sublayer-actions">
          <button type="button" onClick={() => onAllOwnersChange?.(true)}>All</button>
          <button type="button" onClick={() => onAllOwnersChange?.(false)}>None</button>
        </span>
      </div>
      <div className="street-owner-sublayer-list">
        {ownerCounts.map(({ owner, count }) => (
          <label className="street-owner-sublayer-toggle" key={owner}>
            <input
              type="checkbox"
              checked={visibleOwners[owner] !== false}
              onChange={(event) => onOwnerChange?.(owner, event.currentTarget.checked)}
            />
            <span>{owner}</span>
            <em>{count}</em>
          </label>
        ))}
      </div>
    </div>
  );
}

function FrequencySublayerList({
  title,
  visibleCount,
  totalCount,
  visibleFrequencyBandCount,
  totalFrequencyBandCount,
  frequencyBandCounts,
  visibleFrequencyBands,
  onFrequencyBandChange,
  onAllFrequencyBandsChange,
}: {
  title: string;
  visibleCount: number;
  totalCount: number;
  visibleFrequencyBandCount: number;
  totalFrequencyBandCount: number;
  frequencyBandCounts: Array<{ frequencyBand: string; count: number }>;
  visibleFrequencyBands: Record<string, boolean>;
  onFrequencyBandChange?: (frequencyBand: string, enabled: boolean) => void;
  onAllFrequencyBandsChange?: (enabled: boolean) => void;
}) {
  return (
    <div className="street-owner-sublayers" aria-label={title}>
      <div className="street-owner-sublayer-heading">
        <span>
          {title}
          <small>{visibleCount} of {totalCount} links shown / {visibleFrequencyBandCount} of {totalFrequencyBandCount} frequency groups</small>
        </span>
        <span className="street-owner-sublayer-actions">
          <button type="button" onClick={() => onAllFrequencyBandsChange?.(true)}>All</button>
          <button type="button" onClick={() => onAllFrequencyBandsChange?.(false)}>None</button>
        </span>
      </div>
      <div className="street-owner-sublayer-list">
        {frequencyBandCounts.map(({ frequencyBand, count }) => (
          <label className="street-owner-sublayer-toggle" key={frequencyBand}>
            <input
              type="checkbox"
              checked={visibleFrequencyBands[frequencyBand] !== false}
              onChange={(event) => onFrequencyBandChange?.(frequencyBand, event.currentTarget.checked)}
            />
            <span>{frequencyBand}</span>
            <em>{count}</em>
          </label>
        ))}
      </div>
    </div>
  );
}

function OpgwRouteSublayerTree({
  routes,
  cableSections,
  splicePoints,
  cableSectionsVisible,
  focusedRouteId,
  focusedSectionId,
  focusedSplicePointId,
  onFocusRoute,
  onFocusSection,
  onFocusSplicePoint,
  onClearFocus,
  onLayerChange,
}: {
  routes: OpgwRouteFeature[];
  cableSections: OpgwCableSectionFeature[];
  splicePoints: OpgwSplicePointFeature[];
  cableSectionsVisible: boolean;
  focusedRouteId?: string;
  focusedSectionId?: string;
  focusedSplicePointId?: string;
  onFocusRoute?: (routeId: string) => void;
  onFocusSection?: (sectionId: string) => void;
  onFocusSplicePoint?: (splicePointId: string) => void;
  onClearFocus?: () => void;
  onLayerChange?: (layer: StreetMapLayerKey, enabled: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const sectionsByRoute = useMemo(() => {
    const grouped = new Map<string, OpgwCableSectionFeature[]>();
    for (const section of cableSections) {
      const routeId = section.properties.opgwRouteId;
      const existing = grouped.get(routeId) || [];
      existing.push(section);
      grouped.set(routeId, existing);
    }
    return grouped;
  }, [cableSections]);
  const splicePointById = useMemo(() => new Map(splicePoints.map((splicePoint) => [splicePoint.properties.splicePointId, splicePoint])), [splicePoints]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const allRouteRows = useMemo(() => routes
    .map((route) => ({
      route,
      sections: (sectionsByRoute.get(route.properties.opgwRouteId) || []).sort((a, b) => a.properties.cableSectionId.localeCompare(b.properties.cableSectionId, undefined, { numeric: true })),
    }))
    .sort((a, b) => b.sections.length - a.sections.length || a.route.properties.transmissionLineId.localeCompare(b.route.properties.transmissionLineId)), [routes, sectionsByRoute]);
  const searchedRouteRows = useMemo(() => {
    if (!normalizedSearchQuery) return allRouteRows;
    return allRouteRows.flatMap(({ route, sections }) => {
      const routeMatches = opgwRouteSearchText(route).includes(normalizedSearchQuery);
      const matchingSections = sections.filter((section) => {
        const fromPoint = splicePointById.get(section.properties.fromSplicePointId);
        const toPoint = splicePointById.get(section.properties.toSplicePointId);
        return opgwSectionSearchText(section, fromPoint, toPoint).includes(normalizedSearchQuery);
      });
      if (!routeMatches && !matchingSections.length) return [];
      return [{ route, sections: routeMatches ? sections : matchingSections }];
    });
  }, [allRouteRows, normalizedSearchQuery, splicePointById]);
  const focusedRowIndex = focusedRouteId ? allRouteRows.findIndex(({ route }) => route.properties.opgwRouteId === focusedRouteId) : -1;
  const focusedRouteRow = focusedRowIndex >= 0 ? allRouteRows[focusedRowIndex] : undefined;
  const limitedSearchRows = searchedRouteRows.slice(0, 12);
  const routeRows = normalizedSearchQuery
    ? limitedSearchRows
    : focusedRowIndex >= 12
    ? [allRouteRows[focusedRowIndex], ...allRouteRows.slice(0, 11)]
    : allRouteRows.slice(0, 12);
  const hasFocus = Boolean(focusedRouteId || focusedSectionId || focusedSplicePointId);
  const shownRouteIds = new Set(routeRows.map(({ route }) => route.properties.opgwRouteId));
  if (!normalizedSearchQuery && focusedRouteRow && !shownRouteIds.has(focusedRouteRow.route.properties.opgwRouteId)) {
    routeRows.unshift(focusedRouteRow);
  }
  const searchMatchLabel = normalizedSearchQuery
    ? `${searchedRouteRows.length} of ${routes.length} route lines matched`
    : `${routeRows.length} of ${routes.length} route lines shown`;

  return (
    <div className="street-opgw-route-sublayers" aria-label="OPGW route transmission-line and cable-section sublayers">
      <div className="street-owner-sublayer-heading">
        <span>
          OPGW transmission line sublayers
          <small>{searchMatchLabel} / cable sections are {cableSectionsVisible ? "visible" : "hidden"}{hasFocus ? " / visibility filter active" : ""}</small>
        </span>
        {hasFocus ? (
          <span className="street-owner-sublayer-actions">
            <button type="button" onClick={onClearFocus}>Show all</button>
          </span>
        ) : null}
      </div>
      <label className="street-opgw-sublayer-search" style={opgwSublayerSearchStyle}>
        <Search size={13} />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder="Search line, route, section, splice"
          aria-label="Search OPGW transmission line sublayers"
          style={opgwSublayerSearchInputStyle}
        />
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery("")} title="Clear OPGW sublayer search" style={opgwSublayerSearchButtonStyle}>
            <X size={12} />
          </button>
        ) : null}
      </label>
      <div className="street-opgw-route-list">
        {routeRows.length ? routeRows.map(({ route, sections }, index) => {
          const properties = route.properties;
          const isRouteFocused = focusedRouteId === properties.opgwRouteId && !focusedSectionId;
          const isActiveRoute = focusedRouteId === properties.opgwRouteId || sections.some((section) => section.properties.cableSectionId === focusedSectionId || section.properties.fromSplicePointId === focusedSplicePointId || section.properties.toSplicePointId === focusedSplicePointId);
          const focusedSectionIndex = sections.findIndex((section) => section.properties.cableSectionId === focusedSectionId || section.properties.fromSplicePointId === focusedSplicePointId || section.properties.toSplicePointId === focusedSplicePointId);
          const sectionRows = normalizedSearchQuery
            ? sections.slice(0, 8)
            : focusedSectionIndex >= 8
            ? [
                sections[focusedSectionIndex],
                ...sections.slice(0, 7),
              ].filter((section, sectionIndex, pinnedSections): section is OpgwCableSectionFeature => Boolean(section) && pinnedSections.findIndex((candidate) => candidate?.properties.cableSectionId === section.properties.cableSectionId) === sectionIndex)
            : sections.slice(0, 8);
          return (
            <details className={`street-opgw-route-node ${isActiveRoute ? "is-isolated" : ""}`} key={properties.opgwRouteId} open={index === 0 || isActiveRoute}>
              <summary>
                <span>
                  <strong>{properties.transmissionLineId}</strong>
                  <small>{properties.routeName}</small>
                </span>
                <em>{sections.length} sections</em>
              </summary>
              <div className="street-opgw-route-meta">
                <span>{properties.routeStatus}</span>
                <span>{properties.routeMiles.toFixed(1)} mi</span>
                <span>{properties.totalFiberCount}F</span>
              </div>
              <div className="street-opgw-route-actions">
                <button
                  type="button"
                  className={`street-opgw-filter-button ${isRouteFocused ? "active" : ""}`}
                  onClick={() => onFocusRoute?.(properties.opgwRouteId)}
                >
                  {isRouteFocused ? "Line isolated" : "Only this line"}
                </button>
              </div>
              <div className="street-opgw-section-heading">Cable sections from splice to splice</div>
              <div className="street-opgw-section-list">
                {sectionRows.map((section) => {
                  const sectionProperties = section.properties;
                  const isSectionFocused = focusedSectionId === sectionProperties.cableSectionId;
                  const isSpliceFocusedInSection = sectionProperties.fromSplicePointId === focusedSplicePointId || sectionProperties.toSplicePointId === focusedSplicePointId;
                  const fromPoint = splicePointById.get(sectionProperties.fromSplicePointId);
                  const toPoint = splicePointById.get(sectionProperties.toSplicePointId);
                  return (
                    <div className={`street-opgw-section-node ${isSectionFocused || isSpliceFocusedInSection ? "is-isolated" : ""}`} key={sectionProperties.cableSectionId}>
                      <span className="street-opgw-section-copy">
                        <strong>{sectionProperties.cableSectionId}</strong>
                        <span>{sectionProperties.fromSplicePointId} to {sectionProperties.toSplicePointId}</span>
                        <small>{sectionProperties.fromStructureNumber} to {sectionProperties.toStructureNumber} / {sectionProperties.routeMiles.toFixed(2)} mi / {sectionProperties.installStatus}</small>
                        {isSectionFocused ? (
                          <small style={opgwSectionSpliceNoteStyle}>
                            Isolated section splice points: {splicePointLabel(fromPoint, sectionProperties.fromSplicePointId)} and {splicePointLabel(toPoint, sectionProperties.toSplicePointId)}
                          </small>
                        ) : null}
                        <span className="street-opgw-splice-endpoint-list" aria-label={`Splice point endpoints for ${sectionProperties.cableSectionId}`}>
                          <SplicePointEndpoint
                            label="A splice point"
                            splicePointId={sectionProperties.fromSplicePointId}
                            fallbackStructureNumber={sectionProperties.fromStructureNumber}
                            splicePoint={fromPoint}
                            isFocused={focusedSplicePointId === sectionProperties.fromSplicePointId}
                            onFocus={onFocusSplicePoint}
                          />
                          <SplicePointEndpoint
                            label="Z splice point"
                            splicePointId={sectionProperties.toSplicePointId}
                            fallbackStructureNumber={sectionProperties.toStructureNumber}
                            splicePoint={toPoint}
                            isFocused={focusedSplicePointId === sectionProperties.toSplicePointId}
                            onFocus={onFocusSplicePoint}
                          />
                        </span>
                      </span>
                      <button
                        type="button"
                        className={`street-opgw-filter-button section ${isSectionFocused ? "active" : ""}`}
                        onClick={() => {
                          onFocusSection?.(sectionProperties.cableSectionId);
                          onLayerChange?.("opgwSplicePoints", true);
                        }}
                      >
                        {isSectionFocused ? "Section isolated" : "Only section"}
                      </button>
                    </div>
                  );
                })}
                {sections.length > sectionRows.length ? <span className="street-opgw-section-more">+{sections.length - sectionRows.length} more splice-to-splice sections in this route</span> : null}
              </div>
            </details>
          );
        }) : (
          <div className="street-opgw-no-results" style={opgwNoResultsStyle}>
            No OPGW transmission line sublayers match "{searchQuery.trim()}".
          </div>
        )}
      </div>
    </div>
  );
}

const opgwSublayerSearchStyle = {
  display: "grid",
  gridTemplateColumns: "15px minmax(0,1fr) auto",
  alignItems: "center",
  gap: "6px",
  minHeight: "32px",
  padding: "6px 7px",
  border: "1px solid rgba(105,215,228,.18)",
  borderRadius: "7px",
  background: "rgba(5,17,22,.62)",
  color: "rgba(215,255,251,.86)",
} satisfies CSSProperties;

const opgwSublayerSearchInputStyle = {
  minWidth: 0,
  border: 0,
  outline: 0,
  background: "transparent",
  color: "var(--dash-text)",
  fontSize: "11px",
  fontWeight: 720,
} satisfies CSSProperties;

const opgwSublayerSearchButtonStyle = {
  display: "inline-grid",
  placeItems: "center",
  width: "20px",
  height: "20px",
  border: "1px solid rgba(238,252,251,.12)",
  borderRadius: "6px",
  background: "rgba(238,252,251,.06)",
  color: "#d7fffb",
  cursor: "pointer",
} satisfies CSSProperties;

const opgwNoResultsStyle = {
  padding: "10px 8px",
  border: "1px dashed rgba(238,252,251,.16)",
  borderRadius: "7px",
  color: "var(--dash-muted)",
  fontSize: "10px",
  fontWeight: 720,
  lineHeight: 1.35,
} satisfies CSSProperties;

const opgwSectionSpliceNoteStyle = {
  color: "#fff4cf",
  fontWeight: 820,
} satisfies CSSProperties;

function splicePointLabel(splicePoint: OpgwSplicePointFeature | undefined, fallbackId: string) {
  if (!splicePoint) return fallbackId;
  return `${splicePoint.properties.splicePointId} (${splicePoint.properties.structureNumber})`;
}

function opgwRouteSearchText(route: OpgwRouteFeature) {
  const properties = route.properties;
  return [
    properties.opgwRouteId,
    properties.transmissionLineId,
    properties.routeName,
    properties.fromSubstationId,
    properties.toSubstationId,
    properties.fromStructureId,
    properties.toStructureId,
    properties.voltageClass,
    properties.routeStatus,
    properties.syntheticConfidence,
    properties.notes,
  ].filter(Boolean).join(" ").toLowerCase();
}

function opgwSectionSearchText(section: OpgwCableSectionFeature, fromPoint?: OpgwSplicePointFeature, toPoint?: OpgwSplicePointFeature) {
  const properties = section.properties;
  return [
    properties.cableSectionId,
    properties.opgwRouteId,
    properties.transmissionLineId,
    properties.fromSplicePointId,
    properties.toSplicePointId,
    properties.fromStructureId,
    properties.toStructureId,
    properties.fromStructureNumber,
    properties.toStructureNumber,
    properties.fromSubstationId,
    properties.toSubstationId,
    properties.manufacturer,
    properties.installStatus,
    properties.syntheticConfidence,
    properties.notes,
    opgwSplicePointSearchText(fromPoint),
    opgwSplicePointSearchText(toPoint),
  ].filter(Boolean).join(" ").toLowerCase();
}

function opgwSplicePointSearchText(splicePoint?: OpgwSplicePointFeature) {
  if (!splicePoint) return "";
  const properties = splicePoint.properties;
  return [
    properties.splicePointId,
    properties.opgwRouteId,
    properties.transmissionLineId,
    properties.structureId,
    properties.structureNumber,
    properties.substationId,
    properties.spliceType,
    properties.closureId,
    properties.status,
    properties.syntheticConfidence,
    properties.notes,
  ].filter(Boolean).join(" ");
}

function SplicePointEndpoint({
  label,
  splicePointId,
  fallbackStructureNumber,
  splicePoint,
  isFocused,
  onFocus,
}: {
  label: string;
  splicePointId: string;
  fallbackStructureNumber: string;
  splicePoint?: OpgwSplicePointFeature;
  isFocused: boolean;
  onFocus?: (splicePointId: string) => void;
}) {
  const properties = splicePoint?.properties;
  return (
    <button
      type="button"
      className={`street-opgw-splice-endpoint ${isFocused ? "active" : ""}`}
      onClick={() => onFocus?.(splicePointId)}
    >
      <span>{label}</span>
      <strong>{splicePointId}</strong>
      <small>{properties?.structureNumber || fallbackStructureNumber} / {properties?.spliceType || "splice point"} / {properties?.status || "synthetic"}</small>
    </button>
  );
}

function opgwCountForLayer(
  layer: StreetMapLayerKey,
  counts: {
    publicLineCount: number;
    publicSubstationCount: number;
    assumedOpgwRouteCount: number;
    plannedOpgwRouteCount: number;
    verifiedOpgwRouteCount: number;
    opgwCableSectionCount: number;
    opgwSpanSegmentCount: number;
    opgwSplicePointCount: number;
    structureCount: number;
    spliceClosureCount: number;
    patchPanelCount: number;
    availableStrandCount: number;
    criticalRidingCircuitCount: number;
    outageImpactCount: number;
    openOpgwWorkOrderCount: number;
    spanInspectionIssueCount: number;
  },
) {
  if (layer === "publicTransmissionLines") return counts.publicLineCount;
  if (layer === "publicSubstations") return counts.publicSubstationCount;
  if (layer === "transmissionStructures") return counts.structureCount;
  if (layer === "assumedOpgwRoutes") return counts.assumedOpgwRouteCount;
  if (layer === "opgwRoutes") return counts.assumedOpgwRouteCount + counts.plannedOpgwRouteCount + counts.verifiedOpgwRouteCount;
  if (layer === "plannedOpgwFiber") return counts.plannedOpgwRouteCount;
  if (layer === "verifiedOpgwFiber") return counts.verifiedOpgwRouteCount;
  if (layer === "opgwCableSections") return counts.opgwCableSectionCount;
  if (layer === "opgwSpanSegments") return counts.opgwSpanSegmentCount;
  if (layer === "opgwSplicePoints") return counts.opgwSplicePointCount;
  if (layer === "existingFiberSplices") return counts.opgwSplicePointCount;
  if (layer === "proposedFiberSplices") return counts.opgwSplicePointCount;
  if (layer === "compareSpliceLayers") return counts.opgwSplicePointCount;
  if (layer === "spliceClosures") return counts.spliceClosureCount;
  if (layer === "patchPanels") return counts.patchPanelCount;
  if (layer === "fiberStrandsLayer") return counts.availableStrandCount;
  if (layer === "fiberAssignments") return counts.criticalRidingCircuitCount;
  if (layer === "availableStrandCapacity") return counts.availableStrandCount;
  if (layer === "criticalRidingCircuits") return counts.criticalRidingCircuitCount;
  if (layer === "opgwOutageImpact") return counts.outageImpactCount;
  if (layer === "opgwOpenWorkOrders") return counts.openOpgwWorkOrderCount;
  if (layer === "opgwSpanInspectionIssues") return counts.spanInspectionIssueCount;
  return 0;
}

function dataWarningForLayer(layer: StreetMapLayerKey, warnings?: Record<string, string>) {
  if (layer === "publicTransmissionLines") return warnings?.publicLines;
  if (layer === "publicSubstations") return warnings?.publicSubstations;
  if (layer === "fccUtilityTowers") return warnings?.fccUtilityTowers;
  if (layer === "fccMicrowaveLinks") return warnings?.fccMicrowaveLinks;
  if (layer === "transmissionStructures") return warnings?.structures;
  if (layer === "assumedOpgwRoutes" || layer === "plannedOpgwFiber" || layer === "verifiedOpgwFiber" || layer === "opgwRoutes" || layer === "opgwCableSections" || layer === "opgwSpanSegments" || layer === "opgwSplicePoints" || layer === "existingFiberSplices" || layer === "proposedFiberSplices" || layer === "compareSpliceLayers" || layer === "fiberStrandsLayer" || layer === "availableStrandCapacity" || layer === "opgwOutageImpact" || layer === "opgwOpenWorkOrders" || layer === "opgwSpanInspectionIssues") return warnings?.opgwCables || warnings?.fiberStrands || warnings?.fiberAssignments || warnings?.syntheticServices;
  if (layer === "spliceClosures") return warnings?.spliceClosures;
  if (layer === "patchPanels") return warnings?.patchPanels;
  if (layer === "criticalRidingCircuits") return warnings?.fiberAssignments;
  return "";
}
