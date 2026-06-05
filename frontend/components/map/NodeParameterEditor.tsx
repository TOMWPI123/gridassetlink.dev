"use client";

import { AlertTriangle, Save, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { EditableMapStatus, MapNode, MapVisibility, NodeParameters, Substation, TransmissionMap } from "@/lib/types/assets";

type NodeParameterEditorProps = {
  draft: MapNode | null;
  maps: TransmissionMap[];
  substations: Substation[];
  deviceIds: string[];
  circuitIds: string[];
  workOrderIds: string[];
  onChange: (draft: MapNode) => void;
  onCancel: () => void;
  onSave: (node: MapNode) => void;
};

const nodeTypes: NodeParameters["nodeType"][] = ["substation", "transmission_node", "telecom_node", "sel_icon_node", "fiber_node", "device_node", "circuit_endpoint", "load_node", "generation_node", "proposed_node"];
const statuses: EditableMapStatus[] = ["existing", "planned", "proposed", "retired", "unknown"];
const visibilityOptions: MapVisibility[] = ["private", "team", "public"];
type TelecomProtocol = NonNullable<NonNullable<NodeParameters["telecom"]>["protocol"]>;
type TimingSource = NonNullable<NonNullable<NodeParameters["telecom"]>["timingSource"]>;
type FiberType = NonNullable<NonNullable<NodeParameters["fiber"]>["fiberType"]>;
const protocols: TelecomProtocol[] = ["Ethernet", "C37.94", "T1", "E1", "SONET", "MPLS-TP", "DWDM", "OTN", "Other"];
const timingSources: TimingSource[] = ["PTP", "SyncE", "IRIG-B", "GPS", "Internal", "Unknown"];
const fiberTypes: FiberType[] = ["OPGW", "ADSS", "underground", "leased", "unknown"];

export function NodeParameterEditor({
  draft,
  maps,
  substations,
  deviceIds,
  circuitIds,
  workOrderIds,
  onChange,
  onCancel,
  onSave,
}: NodeParameterEditorProps) {
  const [submitted, setSubmitted] = useState(false);
  const validationErrors = useMemo(() => {
    if (!draft) return [];
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push("Node name is required.");
    if (!draft.transmissionMapId) errors.push("Assign the node to a transmission map.");
    if (draft.latitude === undefined || draft.longitude === undefined) errors.push("Latitude and longitude are required for street-level map placement.");
    if (!draft.nodeParameters.planning?.status) errors.push("Planning status is required.");
    return errors;
  }, [draft]);

  if (!draft) return null;

  function patch(update: Partial<MapNode>) {
    const current = draft as MapNode;
    onChange({ ...current, ...update });
  }

  function patchParameters(update: Partial<NodeParameters>) {
    const current = draft as MapNode;
    onChange({ ...current, nodeParameters: { ...current.nodeParameters, ...update } });
  }

  function patchTelecom(update: Partial<NonNullable<NodeParameters["telecom"]>>) {
    const current = draft as MapNode;
    patchParameters({ telecom: { ...current.nodeParameters.telecom, ...update } });
  }

  function patchElectrical(update: Partial<NonNullable<NodeParameters["electrical"]>>) {
    const current = draft as MapNode;
    patchParameters({ electrical: { ...current.nodeParameters.electrical, ...update } });
  }

  function patchFiber(update: Partial<NonNullable<NodeParameters["fiber"]>>) {
    const current = draft as MapNode;
    patchParameters({ fiber: { ...current.nodeParameters.fiber, ...update } });
  }

  function patchPlanning(update: Partial<NonNullable<NodeParameters["planning"]>>) {
    const current = draft as MapNode;
    patchParameters({ planning: { status: current.nodeParameters.planning?.status || "proposed", ...current.nodeParameters.planning, ...update } });
  }

  function handleSave() {
    setSubmitted(true);
    if (validationErrors.length) return;
    const current = draft as MapNode;
    onSave({
      ...current,
      nodeParameters: {
        ...current.nodeParameters,
        nodeId: current.id,
        nodeName: current.name,
        nodeType: current.nodeType,
      },
    });
    setSubmitted(false);
  }

  return (
    <aside className="node-parameter-editor" aria-label="Node parameter editor">
      <div className="map-editor-heading">
        <div>
          <strong>NodeParameterEditor</strong>
          <span>Add or edit street-level node parameters.</span>
        </div>
        <button className="telecom-map-icon-button" type="button" onClick={onCancel} title="Cancel node editor"><X size={15} /></button>
      </div>

      <div className="map-editor-grid">
        <TextField label="Node name" value={draft.name} onChange={(name) => patch({ name })} />
        <SelectField label="Node type" value={draft.nodeType} options={nodeTypes} onChange={(nodeType) => patch({ nodeType: nodeType as NodeParameters["nodeType"], nodeParameters: { ...draft.nodeParameters, nodeType: nodeType as NodeParameters["nodeType"] } })} />
        <SelectField label="Parent substation" value={draft.parentSubstationId || ""} options={["", ...substations.map((substation) => substation.id)]} onChange={(parentSubstationId) => patch({ parentSubstationId: parentSubstationId || undefined })} />
        <SelectField label="Transmission map" value={draft.transmissionMapId} options={maps.map((map) => map.id)} onChange={(transmissionMapId) => patch({ transmissionMapId })} />
        <NumberField label="Latitude" value={draft.latitude} onChange={(latitude) => patch({ latitude })} />
        <NumberField label="Longitude" value={draft.longitude} onChange={(longitude) => patch({ longitude })} />
        <SelectField label="Status" value={draft.status} options={statuses} onChange={(status) => patch({ status: status as EditableMapStatus })} />
        <SelectField label="Visibility" value={draft.visibility} options={visibilityOptions} onChange={(visibility) => patch({ visibility: visibility as MapVisibility })} />
      </div>

      <ParameterGroup title="Electrical Parameters">
        <NumberField label="Voltage kV" value={draft.nodeParameters.electrical?.voltageKv} onChange={(voltageKv) => patchElectrical({ voltageKv })} />
        <SelectField label="Phases" value={draft.nodeParameters.electrical?.phases || ""} options={["", "A", "B", "C", "ABC"]} onChange={(phases) => patchElectrical({ phases: phases as NonNullable<NodeParameters["electrical"]>["phases"] || undefined })} />
        <NumberField label="Load MW" value={draft.nodeParameters.electrical?.nominalLoadMw} onChange={(nominalLoadMw) => patchElectrical({ nominalLoadMw })} />
        <NumberField label="Transformer MVA" value={draft.nodeParameters.electrical?.transformerMva} onChange={(transformerMva) => patchElectrical({ transformerMva })} />
      </ParameterGroup>

      <ParameterGroup title="Telecom Parameters">
        <TextField label="Device type" value={draft.nodeParameters.telecom?.deviceType || ""} onChange={(deviceType) => patchTelecom({ deviceType })} />
        <TextField label="Vendor" value={draft.nodeParameters.telecom?.vendor || ""} onChange={(vendor) => patchTelecom({ vendor })} />
        <TextField label="Model" value={draft.nodeParameters.telecom?.model || ""} onChange={(model) => patchTelecom({ model })} />
        <TextField label="Rack" value={draft.nodeParameters.telecom?.rack || ""} onChange={(rack) => patchTelecom({ rack })} />
        <TextField label="Shelf" value={draft.nodeParameters.telecom?.shelf || ""} onChange={(shelf) => patchTelecom({ shelf })} />
        <TextField label="Slot" value={draft.nodeParameters.telecom?.slot || ""} onChange={(slot) => patchTelecom({ slot })} />
        <TextField label="Port" value={draft.nodeParameters.telecom?.port || ""} onChange={(port) => patchTelecom({ port })} />
        <TextField label="Service type" value={draft.nodeParameters.telecom?.serviceType || ""} onChange={(serviceType) => patchTelecom({ serviceType })} />
        <SelectField label="Protocol" value={draft.nodeParameters.telecom?.protocol || ""} options={["", ...protocols]} onChange={(protocol) => patchTelecom({ protocol: protocol as NonNullable<NodeParameters["telecom"]>["protocol"] || undefined })} />
        <NumberField label="Bandwidth Mbps" value={draft.nodeParameters.telecom?.bandwidthMbps} onChange={(bandwidthMbps) => patchTelecom({ bandwidthMbps })} />
        <SelectField label="Timing source" value={draft.nodeParameters.telecom?.timingSource || ""} options={["", ...timingSources]} onChange={(timingSource) => patchTelecom({ timingSource: timingSource as NonNullable<NodeParameters["telecom"]>["timingSource"] || undefined })} />
      </ParameterGroup>

      <ParameterGroup title="Fiber Parameters">
        <TextField label="Fiber cable ID" value={draft.nodeParameters.fiber?.fiberCableId || ""} onChange={(fiberCableId) => patchFiber({ fiberCableId })} />
        <SelectField label="Fiber type" value={draft.nodeParameters.fiber?.fiberType || ""} options={["", ...fiberTypes]} onChange={(fiberType) => patchFiber({ fiberType: fiberType as NonNullable<NodeParameters["fiber"]>["fiberType"] || undefined })} />
        <NumberField label="Strand count" value={draft.nodeParameters.fiber?.strandCount} onChange={(strandCount) => patchFiber({ strandCount })} />
        <TextField label="Assigned strands" value={(draft.nodeParameters.fiber?.assignedStrands || []).join(", ")} onChange={(value) => patchFiber({ assignedStrands: parseNumberList(value) })} />
        <TextField label="Splice closure" value={draft.nodeParameters.fiber?.spliceClosureId || ""} onChange={(spliceClosureId) => patchFiber({ spliceClosureId })} />
        <TextField label="Patch panel" value={draft.nodeParameters.fiber?.patchPanelId || ""} onChange={(patchPanelId) => patchFiber({ patchPanelId })} />
        <NumberField label="Loss dB" value={draft.nodeParameters.fiber?.lossDb} onChange={(lossDb) => patchFiber({ lossDb })} />
        <NumberField label="Distance miles" value={draft.nodeParameters.fiber?.distanceMiles} onChange={(distanceMiles) => patchFiber({ distanceMiles })} />
      </ParameterGroup>

      <ParameterGroup title="Planning Parameters">
        <SelectField label="Planning status" value={draft.nodeParameters.planning?.status || "proposed"} options={["existing", "planned", "proposed", "needs_review", "approved", "rejected"]} onChange={(status) => patchPlanning({ status: status as NonNullable<NodeParameters["planning"]>["status"] })} />
        <SelectField label="Priority" value={draft.nodeParameters.planning?.priority || ""} options={["", "low", "medium", "high", "critical"]} onChange={(priority) => patchPlanning({ priority: priority as NonNullable<NodeParameters["planning"]>["priority"] || undefined })} />
        <TextField label="Project ID" value={draft.nodeParameters.planning?.projectId || ""} onChange={(projectId) => patchPlanning({ projectId })} />
        <TextField label="Work order ID" value={draft.nodeParameters.planning?.workOrderId || ""} onChange={(workOrderId) => patchPlanning({ workOrderId })} />
        <TextField label="Target in-service" value={draft.nodeParameters.planning?.targetInServiceDate || ""} onChange={(targetInServiceDate) => patchPlanning({ targetInServiceDate })} />
      </ParameterGroup>

      <ParameterGroup title="Linked Assets">
        <ChecklistField label="Devices" options={deviceIds} values={draft.linkedDeviceIds} onChange={(linkedDeviceIds) => patch({ linkedDeviceIds })} />
        <ChecklistField label="Circuits" options={circuitIds} values={draft.linkedCircuitIds} onChange={(linkedCircuitIds) => patch({ linkedCircuitIds })} />
        <ChecklistField label="Work orders" options={workOrderIds} values={draft.linkedWorkOrderIds} onChange={(linkedWorkOrderIds) => patch({ linkedWorkOrderIds })} />
      </ParameterGroup>

      <label className="map-editor-field wide">
        <span>Planning notes</span>
        <textarea value={draft.nodeParameters.planning?.notes || ""} onChange={(event) => patchPlanning({ notes: event.target.value })} />
      </label>

      {draft.visibility === "public" ? <div className="public-visibility-warning"><AlertTriangle size={15} />Public node visibility must not expose internal telecom paths, protection settings, or CEII-restricted details.</div> : null}
      {submitted && validationErrors.length ? <div className="map-validation-list">{validationErrors.map((error) => <span key={error}>{error}</span>)}</div> : null}
      <div className="map-editor-actions">
        <button className="telecom-map-button primary" type="button" onClick={handleSave}><Save size={15} />Save Node</button>
        <button className="telecom-map-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </aside>
  );
}

function ParameterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="node-parameter-group">
      <h3>{title}</h3>
      <div className="map-editor-grid">{children}</div>
    </section>
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
        {options.map((option) => <option key={option || "none"} value={option}>{option || "None"}</option>)}
      </select>
    </label>
  );
}

function ChecklistField({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <div className="map-editor-field checklist-field">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option])}
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}

function parseNumberList(value: string) {
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
}
