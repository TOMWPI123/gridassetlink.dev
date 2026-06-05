"use client";

import { AlertTriangle, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { EditableMapStatus, MapVisibility, Substation } from "@/lib/types/assets";

type SubstationEditorProps = {
  draft: Substation | null;
  onChange: (draft: Substation) => void;
  onCancel: () => void;
  onSave: (substation: Substation) => void;
};

const statuses: EditableMapStatus[] = ["existing", "planned", "proposed", "retired", "unknown"];
const visibilityOptions: MapVisibility[] = ["private", "team", "public"];

export function SubstationEditor({ draft, onChange, onCancel, onSave }: SubstationEditorProps) {
  const [submitted, setSubmitted] = useState(false);
  const validationErrors = useMemo(() => {
    if (!draft) return [];
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push("Substation name is required.");
    if (draft.latitude === undefined || draft.longitude === undefined) errors.push("Latitude and longitude are required for street-level map placement.");
    return errors;
  }, [draft]);

  if (!draft) return null;

  function patch(update: Partial<Substation>) {
    const current = draft as Substation;
    onChange({ ...current, ...update });
  }

  function handleSave() {
    setSubmitted(true);
    if (validationErrors.length) return;
    onSave(draft as Substation);
    setSubmitted(false);
  }

  return (
    <aside className="map-editor-panel" aria-label="Create substation workflow">
      <div className="map-editor-heading">
        <div>
          <strong>Create Substation</strong>
          <span>Street-level coordinates are lat/lon only.</span>
        </div>
        <button className="telecom-map-icon-button" type="button" onClick={onCancel} title="Cancel substation editor"><X size={15} /></button>
      </div>
      <div className="map-editor-grid">
        <TextField label="Name" value={draft.name} onChange={(name) => patch({ name })} />
        <TextField label="Abbreviation" value={draft.abbreviation || ""} onChange={(abbreviation) => patch({ abbreviation })} />
        <TextField label="State" value={draft.state || ""} onChange={(state) => patch({ state })} />
        <TextField label="County" value={draft.county || ""} onChange={(county) => patch({ county })} />
        <TextField label="City" value={draft.city || ""} onChange={(city) => patch({ city })} />
        <TextField label="Voltage classes" value={(draft.voltageKv || []).join(", ")} onChange={(value) => patch({ voltageKv: parseNumberList(value) })} />
        <NumberField label="Latitude" value={draft.latitude} onChange={(latitude) => patch({ latitude })} />
        <NumberField label="Longitude" value={draft.longitude} onChange={(longitude) => patch({ longitude })} />
        <SelectField label="Status" value={draft.status} options={statuses} onChange={(status) => patch({ status: status as EditableMapStatus })} />
        <SelectField label="Visibility" value={draft.visibility} options={visibilityOptions} onChange={(visibility) => patch({ visibility: visibility as MapVisibility })} />
      </div>
      <LinkedIds label="Connected lines" values={draft.connectedTransmissionLineIds || []} onChange={(connectedTransmissionLineIds) => patch({ connectedTransmissionLineIds })} />
      <LinkedIds label="Connected devices" values={draft.connectedDeviceIds || []} onChange={(connectedDeviceIds) => patch({ connectedDeviceIds })} />
      <LinkedIds label="Connected circuits" values={draft.connectedCircuitIds || []} onChange={(connectedCircuitIds) => patch({ connectedCircuitIds })} />
      <label className="map-editor-field wide">
        <span>Notes</span>
        <textarea value={draft.notes || ""} onChange={(event) => patch({ notes: event.target.value })} />
      </label>
      {draft.visibility === "public" ? (
        <div className="public-visibility-warning"><AlertTriangle size={15} />Public substations should only expose public-reference records approved for disclosure.</div>
      ) : null}
      {submitted && validationErrors.length ? <div className="map-validation-list">{validationErrors.map((error) => <span key={error}>{error}</span>)}</div> : null}
      <div className="map-editor-actions">
        <button className="telecom-map-button primary" type="button" onClick={handleSave}><Save size={15} />Save Substation</button>
        <button className="telecom-map-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </aside>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="map-editor-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return (
    <label className="map-editor-field">
      <span>{label}</span>
      <input value={value ?? ""} type="number" step="0.000001" onChange={(event) => onChange(event.target.value ? Number(event.target.value) : undefined)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="map-editor-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function LinkedIds({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <label className="map-editor-field wide">
      <span>{label}</span>
      <input value={values.join(", ")} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
    </label>
  );
}

function parseNumberList(value: string) {
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
}
