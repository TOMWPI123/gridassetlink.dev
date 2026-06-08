"use client";

import Link from "next/link";
import { Cable, Network, Route, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { displayValue } from "@/lib/api";
import type { JsonRecord } from "@/types";

export function SubstationFiberSection({ rows }: { rows: JsonRecord[] }) {
  const substations = useMemo(
    () => rows.filter((row) => toNumber(row.patch_panel_count) > 0 || toNumber(row.fiber_assignment_count) > 0 || toNumber(row.fiber_cable_count) > 0),
    [rows],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = substations.find((row) => String(row.substation_code || row.id) === selectedId) || substations[0];
  if (!substations.length || !selected) return null;

  const substationId = String(selected.substation_code || selected.id);
  const patchPanelIds = splitList(selected.patch_panel_ids);
  const assignmentIds = splitList(selected.fiber_assignment_ids);
  const cableIds = splitList(selected.fiber_cable_ids);

  return (
    <section className="panel substation-fiber-section">
      <div className="panel-header">
        <div>
          <strong>Substation Fiber Patch Panels</strong>
          <div className="subtle">Open the patch panels, fiber assignments, and OPGW cables associated with each synthetic substation node.</div>
        </div>
        <span className="badge planned">{substations.length.toLocaleString()} substations linked</span>
      </div>
      <div className="panel-body substation-fiber-body">
        <div className="module-layer-note">
          Synthetic planning overlay only. Patch panels, OPGW cable associations, and fiber assignments do not represent real utility assets or verified field records.
        </div>
        <label className="opgw-cable-picker">
          <span><Search size={15} /> Substation fiber menu</span>
          <select value={substationId} onChange={(event) => setSelectedId(event.target.value)}>
            {substations.map((row) => {
              const id = String(row.substation_code || row.id);
              return (
                <option key={id} value={id}>
                  {displayValue(row.name || id)} / {displayValue(row.state)} / {displayValue(row.patch_panel_count)} panels / {displayValue(row.fiber_assignment_count)} assignments
                </option>
              );
            })}
          </select>
        </label>
        <div className="opgw-cable-menu-stats">
          <div><span>Substation</span><strong>{displayValue(selected.name || substationId)}</strong></div>
          <div><span>Patch panels</span><strong>{displayValue(selected.patch_panel_count)}</strong></div>
          <div><span>Panel ports</span><strong>{displayValue(selected.patch_panel_ports)}</strong></div>
          <div><span>Available ports</span><strong>{displayValue(selected.available_patch_panel_ports)}</strong></div>
          <div><span>Reserved ports</span><strong>{displayValue(selected.reserved_patch_panel_ports)}</strong></div>
          <div><span>Assignments</span><strong>{displayValue(selected.fiber_assignment_count)}</strong></div>
          <div><span>OPGW cables</span><strong>{displayValue(selected.fiber_cable_count)}</strong></div>
          <div><span>Services</span><strong>{displayValue(selected.fiber_assignment_services)}</strong></div>
        </div>
        <div className="opgw-cable-menu-actions">
          <Link href={`/patch-panels?substation=${encodeURIComponent(substationId)}`}><Network size={15} />View Patch Panels</Link>
          <Link href={`/fiber-assignments?substation=${encodeURIComponent(substationId)}`}><Cable size={15} />View Fiber Assignments</Link>
          <Link href={`/fiber-trace?substation=${encodeURIComponent(substationId)}`}><Route size={15} />Fiber Trace</Link>
          <Link href={`/outage-impact?substation=${encodeURIComponent(substationId)}`}><ShieldAlert size={15} />Outage Impact</Link>
        </div>
        <div className="substation-fiber-lists">
          <RecordList title="Patch panels" values={patchPanelIds} hrefFor={(value) => `/patch-panels/${encodeURIComponent(value)}`} />
          <RecordList title="Fiber assignments" values={assignmentIds} hrefFor={(value) => `/fiber-assignments?assignment=${encodeURIComponent(value)}`} />
          <RecordList title="OPGW cables" values={cableIds} hrefFor={(value) => `/opgw/cables/${encodeURIComponent(value)}`} />
        </div>
      </div>
    </section>
  );
}

function RecordList({ title, values, hrefFor }: { title: string; values: string[]; hrefFor: (value: string) => string }) {
  const visible = values.slice(0, 8);
  return (
    <div className="substation-fiber-list">
      <strong>{title}</strong>
      {visible.length ? (
        <div>
          {visible.map((value) => (
            <Link key={value} href={hrefFor(value)}>{value}</Link>
          ))}
          {values.length > visible.length ? <span className="subtle">+{values.length - visible.length} more in table</span> : null}
        </div>
      ) : (
        <span className="subtle">No linked synthetic records for this substation.</span>
      )}
    </div>
  );
}

function splitList(value: unknown): string[] {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}
