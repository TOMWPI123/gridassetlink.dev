"use client";

import Link from "next/link";
import { Cable, GitCompareArrows, Route, Search, ShieldAlert } from "lucide-react";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";

const MAX_CABLE_CHOICES = 18;

export function OpgwCableMenu({ rows }: { rows: JsonRecord[] }) {
  const cables = useMemo(() => rows.filter((row) => typeof row.cable_id === "string" && String(row.cable_id).startsWith("SYN-OPGW")), [rows]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const selected = useMemo(() => cables.find((row) => row.cable_id === selectedId) || cables[0], [cables, selectedId]);
  const visibleChoices = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const source = normalizedQuery
      ? cables.filter((row) => cableSearchText(row).includes(normalizedQuery))
      : cables;
    return source.slice(0, MAX_CABLE_CHOICES);
  }, [cables, deferredQuery]);
  if (!cables.length || !selected) return null;

  const cableId = String(selected.cable_id);
  const continuityHref = String(selected.open_href || `/opgw/cables/${encodeURIComponent(cableId)}`);
  const spliceHref = typeof selected.splice_manager_href === "string" ? selected.splice_manager_href : "";

  return (
    <section className="panel opgw-cable-menu">
      <div className="panel-header">
        <div>
          <strong>Open Cable Continuity</strong>
          <div className="subtle">Pick an OPGW cable and open its continuity, splicing, and carried-service view.</div>
        </div>
        <span className="badge planned">{cables.length.toLocaleString()} synthetic cables</span>
      </div>
      <div className="panel-body opgw-cable-menu-body">
        <label className="opgw-cable-picker">
          <span><Search size={15} /> Cable menu</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cable, route, line, or status"
          />
        </label>
        <div className="opgw-cable-choice-grid" aria-label="Filtered OPGW cable choices">
          {visibleChoices.map((row) => {
            const id = String(row.cable_id);
            const active = id === cableId;
            return (
              <button
                className={`opgw-cable-choice ${active ? "active" : ""}`}
                key={id}
                type="button"
                onClick={() => startTransition(() => setSelectedId(id))}
              >
                <strong>{displayValue(row.cable_name || row.route_name || id)}</strong>
                <span>{displayValue(row.fiber_count)}F / {displayValue(row.status)}</span>
              </button>
            );
          })}
        </div>
        <div className="subtle">{isPending ? "Updating selected cable..." : `Showing ${visibleChoices.length.toLocaleString()} of ${cables.length.toLocaleString()} cables. Search narrows the interactive list for smoother clicks.`}</div>
        <div className="opgw-cable-menu-stats">
          <div><span>Route</span><strong>{displayValue(selected.route_name || selected.cable_name)}</strong></div>
          <div><span>Fiber</span><strong>{displayValue(selected.fiber_count)}F</strong></div>
          <div><span>Miles</span><strong>{displayValue(selected.route_miles)}</strong></div>
          <div><span>Available</span><strong>{displayValue(selected.available_strands)}</strong></div>
          <div><span>Assigned</span><strong>{displayValue(selected.assigned_strands)}</strong></div>
          <div><span>Services</span><strong>{displayValue(selected.services_carried || selected.assignments)}</strong></div>
          <div><span>Splices</span><strong>{displayValue(selected.splice_closures)}</strong></div>
        </div>
        <div className="opgw-cable-menu-actions">
          <Link href={continuityHref}><Cable size={15} />Open Cable</Link>
          <Link href={continuityHref}><Route size={15} />Full Continuity</Link>
          {spliceHref ? <Link href={spliceHref}><GitCompareArrows size={15} />Splicing</Link> : null}
          <Link href={`/fiber-trace?cable=${encodeURIComponent(cableId)}`}><Route size={15} />Fiber Trace</Link>
          <Link href={`/outage-impact?cable=${encodeURIComponent(cableId)}`}><ShieldAlert size={15} />Outage Impact</Link>
        </div>
      </div>
    </section>
  );
}

function cableSearchText(row: JsonRecord): string {
  return [
    row.cable_id,
    row.cable_name,
    row.route_name,
    row.line_id,
    row.line_name,
    row.status,
    row.fiber_count,
  ].map((value) => displayValue(value).toLowerCase()).join(" ");
}
