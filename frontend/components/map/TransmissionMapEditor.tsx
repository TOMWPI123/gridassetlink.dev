"use client";

import { AlertTriangle, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MapVisibility, TransmissionMap, TransmissionMapType } from "@/lib/types/assets";

type TransmissionMapEditorProps = {
  open: boolean;
  onCancel: () => void;
  onSave: (map: TransmissionMap) => void;
};

const mapTypes: TransmissionMapType[] = ["public_reference", "internal_planning", "synthetic", "proposed"];
const visibilityOptions: MapVisibility[] = ["private", "team", "public"];

export function TransmissionMapEditor({ open, onCancel, onSave }: TransmissionMapEditorProps) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("New England");
  const [description, setDescription] = useState("");
  const [voltageClasses, setVoltageClasses] = useState("115, 230");
  const [source, setSource] = useState("Manual planning entry");
  const [visibility, setVisibility] = useState<MapVisibility>("private");
  const [mapType, setMapType] = useState<TransmissionMapType>("internal_planning");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Map name is required.");
    if (!region.trim()) errors.push("Region is required.");
    if (!parseVoltageClasses(voltageClasses).length) errors.push("Add at least one voltage class.");
    return errors;
  }, [name, region, voltageClasses]);

  if (!open) return null;

  function handleSave() {
    setSubmitted(true);
    if (validationErrors.length) return;
    const now = new Date().toISOString();
    onSave({
      id: slugify(name) || `custom-map-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || "Custom transmission planning map.",
      region: region.trim(),
      voltageClasses: parseVoltageClasses(voltageClasses),
      mapType,
      visibility,
      source: source.trim() || "Manual planning entry",
      createdAt: now,
      updatedAt: now,
      notes: notes.trim() || undefined,
    });
    setName("");
    setDescription("");
    setNotes("");
    setSubmitted(false);
  }

  return (
    <aside className="map-editor-panel" aria-label="Create transmission map workflow">
      <div className="map-editor-heading">
        <div>
          <strong>Create Transmission Map</strong>
          <span>New map defaults to private planning visibility.</span>
        </div>
        <button className="telecom-map-icon-button" type="button" onClick={onCancel} title="Cancel map editor"><X size={15} /></button>
      </div>
      <div className="map-editor-grid">
        <TextField label="Map name" value={name} onChange={setName} />
        <TextField label="Region" value={region} onChange={setRegion} />
        <TextField label="Voltage classes" value={voltageClasses} onChange={setVoltageClasses} />
        <TextField label="Source" value={source} onChange={setSource} />
        <SelectField label="Map type" value={mapType} options={mapTypes} onChange={(value) => setMapType(value as TransmissionMapType)} />
        <SelectField label="Visibility" value={visibility} options={visibilityOptions} onChange={(value) => setVisibility(value as MapVisibility)} />
      </div>
      <label className="map-editor-field wide">
        <span>Description</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className="map-editor-field wide">
        <span>Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {visibility === "public" ? (
        <div className="public-visibility-warning"><AlertTriangle size={15} />Public visibility should only expose public reference data and never private telecom topology.</div>
      ) : null}
      {submitted && validationErrors.length ? <ValidationList errors={validationErrors} /> : null}
      <div className="map-editor-actions">
        <button className="telecom-map-button primary" type="button" onClick={handleSave}><Save size={15} />Save Map</button>
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="map-editor-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ValidationList({ errors }: { errors: string[] }) {
  return (
    <div className="map-validation-list">
      {errors.map((error) => <span key={error}>{error}</span>)}
    </div>
  );
}

function parseVoltageClasses(value: string) {
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
