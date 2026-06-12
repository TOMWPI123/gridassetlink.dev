"use client";

import Link from "next/link";
import { Archive, BookOpen, ClipboardList, Copy, Database, History, Map, Plus, RefreshCw, Save, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, canWrite, displayValue, formatLabel } from "@/lib/api";
import type { DesignAssetField, DesignAssetFieldType, DesignAssetGeometryType, DesignAssetMapPayload, DesignAssetRecord, DesignAssetType, DesignIssuedWorkOrderResult } from "@/lib/types/assets";
import type { JsonRecord } from "@/types";
import { DataTable } from "@/components/DataTable";

const defaultAdminFields: DesignAssetField[] = [
  { name: "object_name", label: "Object name", type: "string", required: true },
  { name: "category", label: "Category", type: "string" },
  { name: "status", label: "Status", type: "enum", enum_options: ["proposed", "planned", "active", "as_built"] },
  { name: "notes", label: "Notes", type: "textarea" },
];

const defaultAdminStyle = { color: "#55d6ff", radius: 8, lineWidth: 3, fillOpacity: 0.18 };
const defaultAdminPropertiesObject = { object_name: "Synthetic admin-created planning object", category: "database-admin", status: "planned", notes: "Synthetic/demo data only." };
const defaultFields = JSON.stringify(defaultAdminFields, null, 2);
const defaultStyle = JSON.stringify(defaultAdminStyle, null, 2);
const defaultPointGeometry = JSON.stringify({ type: "Point", coordinates: [-71.8023, 42.2626] }, null, 2);
const defaultLineGeometry = JSON.stringify({ type: "LineString", coordinates: [[-71.82, 42.25], [-71.78, 42.28]] }, null, 2);
const defaultProperties = JSON.stringify(defaultAdminPropertiesObject, null, 2);
const designRecordStatuses: DesignAssetRecord["status"][] = ["proposed", "planned", "in_review", "active", "as_built", "archived"];

const adminGuideCards = [
  {
    title: "Start with a design object",
    body: "Install the core schemas or choose a template, then create a synthetic record with the minimum fields needed for planning.",
    action: "Use templates",
  },
  {
    title: "Edit the living record",
    body: "Use the record browser to search, select, update properties, redraw geometry, duplicate similar assets, or archive stale assumptions.",
    action: "Open editor",
  },
  {
    title: "Use status as workflow",
    body: "Keep rough ideas as proposed, move reviewed designs to planned, use in_review for field/engineering review, and reserve as_built for verified closeout.",
    action: "Review statuses",
  },
  {
    title: "Issue field work",
    body: "Create work orders from selected records when a design needs site verification, installation, splicing, commissioning, or closeout evidence.",
    action: "Issue work order",
  },
  {
    title: "Materialize carefully",
    body: "Materialize only supported synthetic records into module tables after review. Materialization does not make an assumption real or verified.",
    action: "Use backend mapping",
  },
  {
    title: "Protect the data boundary",
    body: "Do not enter CEII, operational telecom, SCADA, relay/protection settings, credentials, or private fiber-route details.",
    action: "Synthetic only",
  },
] as const;

const serviceAssignmentGuideSteps = [
  {
    title: "1. Build both substation endpoints",
    body: "Create or select the A-end and Z-end substations, then add each substation LIU or patch panel as a design object with rack, panel, port count, and location fields.",
  },
  {
    title: "2. Insert devices at each end",
    body: "Add the endpoint devices, such as SEL ICON, relay, RTU, router, or switch records. Capture device name, type, manufacturer, substation, rack, device ports, and the LIU port each device lands on.",
  },
  {
    title: "3. Create the fiber cable and strands",
    body: "Add the cable route between the substations, then add strand records for the cable. Track fiber count, tube/color, strand number, strand status, A-end LIU, Z-end LIU, and whether each strand is available, reserved, assigned, or retired.",
  },
  {
    title: "4. Add splice closures and splice rows",
    body: "Place terminal or inline splice closures at each LIU transition, route junction, or structure. Enter splice rows from cable/strand to cable/strand so continuity can be traced from one LIU to the other.",
  },
  {
    title: "5. Assign the service",
    body: "Create a service or circuit record, select the devices and ports at both ends, choose the fiber strand pair or strand set, attach splice IDs, then save the fiber assignment as proposed or planned.",
  },
  {
    title: "6. Validate, issue work, then close out",
    body: "Review continuity, estimated loss, reserved strand conflicts, patch panel terminations, and required field evidence. Issue a work order, then move to as-built only after closeout review.",
  },
] as const;

const serviceAssignmentElements = [
  "A-end and Z-end substation records",
  "A-end and Z-end LIU or patch panel records",
  "Endpoint devices and device ports",
  "Fiber cable, route, segment, and strand records",
  "Splice closures, splice points, and splice matrix rows",
  "Circuit/service record with service type and criticality",
  "Fiber assignment with cable IDs, strand numbers, splice IDs, and status",
  "Continuity trace, loss estimate, work order, evidence, and closeout status",
] as const;

const serviceAssignmentExamples = [
  {
    circuitId: "87L-MA-WBS-AUB-101",
    service: "C37.94 / 87L protection service",
    devices: "WBS-SEL411L-01 port C37-1 to AUB-SEL411L-01 port C37-1",
    fiber: "WBS-LIU-01 ports 1-2 to AUB-LIU-01 ports 1-2 on SYN-OPGW-WBS-AUB-48F strands 1-2",
    splicing: "Terminal splice at WBS LIU, inline splice at WBS-AUB-JCT-01, terminal splice at AUB LIU",
    assignment: "Create a Protection fiber assignment, reserve strands 1-2, link splice rows, validate latency/loss, then issue a C37.94 turnup work order.",
  },
  {
    circuitId: "SCADA-MA-WOR-FRA-204",
    service: "SCADA Ethernet VLAN service",
    devices: "WOR-SW-01 Gi0/12 to FRA-RTU-01 Eth1",
    fiber: "WOR-LIU-02 ports 9-10 to FRA-LIU-01 ports 17-18 on SYN-ADSS-WOR-FRA-96F strands 37-38",
    splicing: "WOR terminal splice, pole-mounted splice case SC-WOR-014, FRA terminal splice",
    assignment: "Create an Ethernet service, set VLAN and QoS fields, assign strands 37-38, attach splice IDs, and generate a SCADA field verification work order.",
  },
  {
    circuitId: "DS1-MIG-MA-MIL-WBS-033",
    service: "Leased DS1 migration to private fiber",
    devices: "MIL-NID-01 DS1-1 to WBS-ICON-01 DS1-3",
    fiber: "MIL-LIU-01 ports 5-6 to WBS-LIU-03 ports 21-22 on SYN-OPGW-MIL-WBS-72F strands 11-12",
    splicing: "MIL terminal splice, midspan closure SC-MIL-WBS-022, WBS terminal splice",
    assignment: "Create a Leased migration service, reserve strands 11-12 as planned, track cutover window, and issue a migration work order with rollback evidence.",
  },
] as const;

type AdminDesignTemplate = {
  key: string;
  label: string;
  description: string;
  slug: string;
  typeName: string;
  geometryType: DesignAssetGeometryType;
  fields: DesignAssetField[];
  style: JsonRecord;
  recordPrefix: string;
  recordLabel: string;
  recordStatus: DesignAssetRecord["status"];
  properties: JsonRecord;
  geometry?: JsonRecord | null;
};

const adminDesignTemplates: AdminDesignTemplate[] = [
  {
    key: "pole",
    label: "Distribution pole",
    description: "Point record with make-ready and attachment fields.",
    slug: "design-admin-pole",
    typeName: "Design admin pole",
    geometryType: "point",
    fields: [
      { name: "pole_id", label: "Pole ID", type: "string", required: true },
      { name: "road_name", label: "Road name", type: "string" },
      { name: "structure_type", label: "Structure type", type: "enum", enum_options: ["tangent", "angle", "deadend", "riser", "terminal"] },
      { name: "attachment_status", label: "Attachment status", type: "enum", enum_options: ["proposed", "make_ready", "ready", "installed"] },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    style: { color: "#67e8f9", radius: 7, fillOpacity: 0.24 },
    recordPrefix: "DESIGN-POLE",
    recordLabel: "Synthetic design pole",
    recordStatus: "proposed",
    properties: { pole_id: "DESIGN-POLE-001", road_name: "Demo Road", structure_type: "tangent", attachment_status: "proposed", notes: "Synthetic/demo pole only." },
    geometry: { type: "Point", coordinates: [-71.8023, 42.2626] },
  },
  {
    key: "splice",
    label: "Splice closure",
    description: "Point record for planned splice or closure work.",
    slug: "design-admin-splice",
    typeName: "Design admin splice closure",
    geometryType: "point",
    fields: [
      { name: "splice_point_id", label: "Splice point ID", type: "string", required: true },
      { name: "closure_type", label: "Closure type", type: "enum", enum_options: ["aerial_opgw_splice", "tap_splice", "terminal_splice", "handhole", "patch_panel_terminal"] },
      { name: "connected_cable_ids", label: "Connected cable IDs", type: "json" },
      { name: "splice_status", label: "Splice status", type: "enum", enum_options: ["proposed", "planned", "installed", "tested"] },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    style: { color: "#f59e0b", radius: 8, fillOpacity: 0.28 },
    recordPrefix: "DESIGN-SPLICE",
    recordLabel: "Synthetic design splice closure",
    recordStatus: "proposed",
    properties: { splice_point_id: "DESIGN-SPLICE-001", closure_type: "tap_splice", connected_cable_ids: [], splice_status: "proposed", notes: "Synthetic/demo splice only." },
    geometry: { type: "Point", coordinates: [-71.798, 42.268] },
  },
  {
    key: "fiber-span",
    label: "Fiber span",
    description: "Line record for planned ADSS, OPGW, or lateral fiber.",
    slug: "design-admin-fiber-span",
    typeName: "Design admin fiber span",
    geometryType: "line",
    fields: [
      { name: "cable_id", label: "Cable ID", type: "string", required: true },
      { name: "fiber_count", label: "Fiber count", type: "integer", required: true },
      { name: "fiber_type", label: "Fiber type", type: "enum", enum_options: ["ADSS", "OPGW", "underground", "building_lateral"] },
      { name: "a_end", label: "A-end", type: "string" },
      { name: "z_end", label: "Z-end", type: "string" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    style: { color: "#22c55e", lineWidth: 4 },
    recordPrefix: "DESIGN-FIBER",
    recordLabel: "Synthetic design fiber span",
    recordStatus: "planned",
    properties: { cable_id: "DESIGN-FIBER-001", fiber_count: 48, fiber_type: "ADSS", a_end: "A-end demo node", z_end: "Z-end demo node", notes: "Synthetic/demo fiber only." },
    geometry: { type: "LineString", coordinates: [[-71.82, 42.25], [-71.78, 42.28]] },
  },
  {
    key: "work-package",
    label: "Work package",
    description: "Table-only design object for grouped field/design scope.",
    slug: "design-admin-work-package",
    typeName: "Design admin work package",
    geometryType: "table_only",
    fields: [
      { name: "package_id", label: "Package ID", type: "string", required: true },
      { name: "scope_type", label: "Scope type", type: "enum", enum_options: ["fiber_build", "splice", "make_ready", "commissioning", "inspection"] },
      { name: "priority", label: "Priority", type: "enum", enum_options: ["low", "normal", "high", "critical"] },
      { name: "affected_assets", label: "Affected assets", type: "json" },
      { name: "acceptance_criteria", label: "Acceptance criteria", type: "textarea" },
    ],
    style: {},
    recordPrefix: "DESIGN-WORK-PKG",
    recordLabel: "Synthetic design work package",
    recordStatus: "planned",
    properties: { package_id: "DESIGN-WORK-PKG-001", scope_type: "fiber_build", priority: "normal", affected_assets: [], acceptance_criteria: "Synthetic/demo scope only." },
    geometry: null,
  },
  {
    key: "patch-panel",
    label: "Patch panel",
    description: "Table-only termination inventory with port planning fields.",
    slug: "design-admin-patch-panel",
    typeName: "Design admin patch panel",
    geometryType: "table_only",
    fields: [
      { name: "panel_id", label: "Panel ID", type: "string", required: true },
      { name: "location_id", label: "Location ID", type: "string" },
      { name: "port_count", label: "Port count", type: "integer" },
      { name: "connector_type", label: "Connector type", type: "enum", enum_options: ["LC", "SC", "ST", "FC", "Unknown"] },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    style: {},
    recordPrefix: "DESIGN-PANEL",
    recordLabel: "Synthetic design patch panel",
    recordStatus: "planned",
    properties: { panel_id: "DESIGN-PANEL-001", location_id: "DEMO-SUB", port_count: 48, connector_type: "LC", notes: "Synthetic/demo patch panel only." },
    geometry: null,
  },
];

export function AdminDatabasePage() {
  const [payload, setPayload] = useState<DesignAssetMapPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [typeSlug, setTypeSlug] = useState("admin-map-object");
  const [typeName, setTypeName] = useState("Admin map object");
  const [geometryType, setGeometryType] = useState<DesignAssetType["geometry_type"]>("point");
  const [fieldsText, setFieldsText] = useState(defaultFields);
  const [styleText, setStyleText] = useState(defaultStyle);
  const [fieldDrafts, setFieldDrafts] = useState<DesignAssetField[]>(defaultAdminFields);
  const [styleDraft, setStyleDraft] = useState({ color: defaultAdminStyle.color, radius: String(defaultAdminStyle.radius), lineWidth: String(defaultAdminStyle.lineWidth), fillOpacity: String(defaultAdminStyle.fillOpacity) });
  const [selectedTypeSlug, setSelectedTypeSlug] = useState("");
  const [recordKey, setRecordKey] = useState(`ADMIN-OBJECT-${Date.now().toString(36).toUpperCase()}`);
  const [recordLabel, setRecordLabel] = useState("Admin-created planning object");
  const [recordStatus, setRecordStatus] = useState<DesignAssetRecord["status"]>("planned");
  const [propertiesText, setPropertiesText] = useState(defaultProperties);
  const [propertyDraft, setPropertyDraft] = useState<Record<string, string>>(propertiesToAdminFieldDraft(defaultAdminFields, defaultAdminPropertiesObject));
  const [geometryText, setGeometryText] = useState(defaultPointGeometry);
  const [issuingRecordId, setIssuingRecordId] = useState<number | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordStatusFilter, setRecordStatusFilter] = useState("open");
  const [editLabel, setEditLabel] = useState("");
  const [editStatus, setEditStatus] = useState<DesignAssetRecord["status"]>("planned");
  const [editPropertiesText, setEditPropertiesText] = useState("{}");
  const [editPropertyDraft, setEditPropertyDraft] = useState<Record<string, string>>({});
  const [editGeometryText, setEditGeometryText] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [recordEvents, setRecordEvents] = useState<JsonRecord[]>([]);
  const writable = canWrite();
  const assetTypes = payload?.asset_types || [];
  const records = payload?.records || [];
  const activeType = useMemo(
    () => assetTypes.find((item) => item.slug === selectedTypeSlug) || assetTypes[0],
    [assetTypes, selectedTypeSlug],
  );
  const mapRecords = records.filter((record) => record.geometry || record.geometry_json);
  const workLinkedRecords = records.filter((record) => designRecordWorkOrderNumber(record));
  const selectedRecord = records.find((record) => record.id === selectedRecordId) || records[0] || null;
  const activeFields = useMemo(() => adminFieldsForType(activeType), [activeType]);
  const selectedRecordType = useMemo(
    () => selectedRecord ? assetTypes.find((item) => item.id === selectedRecord.asset_type_id || item.slug === selectedRecord.asset_type_slug) || null : null,
    [assetTypes, selectedRecord?.asset_type_id, selectedRecord?.asset_type_slug],
  );
  const selectedRecordFields = useMemo(() => adminFieldsForType(selectedRecordType), [selectedRecordType]);
  const filteredRecords = useMemo(
    () => records.filter((record) => {
      if (recordStatusFilter === "open" && record.status === "archived") return false;
      if (recordStatusFilter === "work_linked" && !designRecordWorkOrderNumber(record)) return false;
      if (recordStatusFilter === "needs_work_order" && designRecordWorkOrderNumber(record)) return false;
      if (!["all", "open", "work_linked", "needs_work_order"].includes(recordStatusFilter) && record.status !== recordStatusFilter) return false;
      if (!recordSearch.trim()) return true;
      const haystack = [
        record.display_label,
        record.record_key,
        record.asset_type_display_name || record.asset_type_slug || "",
        record.status,
        JSON.stringify(record.properties || record.properties_json || {}),
      ].join(" ").toLowerCase();
      return haystack.includes(recordSearch.trim().toLowerCase());
    }),
    [recordSearch, recordStatusFilter, records],
  );
  const queueRecords = filteredRecords.filter((record) => record.status !== "archived").slice(0, 8);

  async function load() {
    setBusy("Loading database admin");
    setMessage("");
    try {
      const next = await apiFetch<DesignAssetMapPayload>("/api/design-assets/map-records");
      setPayload(next);
      setSelectedTypeSlug((current) => current || next.asset_types?.[0]?.slug || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load admin database records.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!activeType) return;
    if (activeType.geometry_type === "table_only") setGeometryText("");
    if (activeType.geometry_type === "point") setGeometryText(defaultPointGeometry);
    if (activeType.geometry_type === "line") setGeometryText(defaultLineGeometry);
    const defaults = Object.fromEntries(activeFields.map((field) => [field.name, field.default ?? ""]));
    setPropertyDraft(propertiesToAdminFieldDraft(activeFields, defaults));
    setPropertiesText(JSON.stringify(adminFieldDraftToProperties(activeFields, propertiesToAdminFieldDraft(activeFields, defaults)), null, 2));
  }, [activeType?.slug, activeType?.geometry_type, activeFields]);

  useEffect(() => {
    if (!selectedRecord) return;
    setEditLabel(selectedRecord.display_label);
    setEditStatus(selectedRecord.status);
    setEditPropertiesText(JSON.stringify(selectedRecord.properties || selectedRecord.properties_json || {}, null, 2));
    setEditPropertyDraft(propertiesToAdminFieldDraft(selectedRecordFields, selectedRecord.properties || selectedRecord.properties_json || {}));
    setEditGeometryText(selectedRecord.geometry || selectedRecord.geometry_json ? JSON.stringify(selectedRecord.geometry || selectedRecord.geometry_json, null, 2) : "");
    setEditNotes(selectedRecord.notes || "");
  }, [selectedRecord, selectedRecordFields]);

  useEffect(() => {
    if (!selectedRecord?.id) {
      setRecordEvents([]);
      return;
    }
    let cancelled = false;
    apiFetch<JsonRecord[]>(`/api/design-assets/records/${selectedRecord.id}/events`)
      .then((events) => {
        if (!cancelled) setRecordEvents(events.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setRecordEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecord?.id]);

  function updateSchemaField(index: number, patch: Partial<DesignAssetField>) {
    setFieldDrafts((current) => {
      const next = current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field);
      setFieldsText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function updateSchemaFieldType(index: number, nextType: DesignAssetFieldType) {
    setFieldDrafts((current) => {
      const next = current.map((field, fieldIndex) => {
        if (fieldIndex !== index) return field;
        return {
          ...field,
          type: nextType,
          enum_options: nextType === "enum" ? field.enum_options?.length ? field.enum_options : ["proposed", "planned", "active"] : [],
        };
      });
      setFieldsText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function addSchemaField() {
    setFieldDrafts((current) => {
      const next = [...current, blankAdminField(current.length + 1)];
      setFieldsText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function removeSchemaField(index: number) {
    setFieldDrafts((current) => {
      const next = current.filter((_, fieldIndex) => fieldIndex !== index);
      setFieldsText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function updateStyleDraft(patch: Partial<typeof styleDraft>) {
    setStyleDraft((current) => {
      const next = { ...current, ...patch };
      setStyleText(JSON.stringify(buildAdminStyle(next), null, 2));
      return next;
    });
  }

  function loadAdvancedSchemaFallback() {
    try {
      const parsedFields = JSON.parse(fieldsText) as DesignAssetField[];
      if (!Array.isArray(parsedFields)) throw new Error("Advanced field backup must be a list.");
      const parsedStyle = JSON.parse(styleText) as Record<string, unknown>;
      setFieldDrafts(parsedFields);
      setStyleDraft(styleToAdminDraft(parsedStyle));
      setMessage("Loaded the advanced schema backup into the visual object type builder.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the advanced schema backup.");
    }
  }

  function updateCreateProperty(fieldName: string, value: string) {
    setPropertyDraft((current) => {
      const next = { ...current, [fieldName]: value };
      setPropertiesText(JSON.stringify(adminFieldDraftToProperties(activeFields, next), null, 2));
      return next;
    });
  }

  function updateEditProperty(fieldName: string, value: string) {
    setEditPropertyDraft((current) => {
      const next = { ...current, [fieldName]: value };
      setEditPropertiesText(JSON.stringify({ ...(selectedRecord?.properties || selectedRecord?.properties_json || {}), ...adminFieldDraftToProperties(selectedRecordFields, next) }, null, 2));
      return next;
    });
  }

  async function createType() {
    setBusy("Creating object type");
    setMessage("");
    try {
      const created = await apiFetch<DesignAssetType>("/api/design-assets/asset-types", {
        method: "POST",
        body: JSON.stringify({
          slug: typeSlug,
          display_name: typeName,
          description: "Admin-created schema-backed planning object type. Synthetic/demo records only.",
          geometry_type: geometryType,
          fields: fieldDrafts,
          searchable_fields: adminSearchableFields(fieldDrafts),
          map_style: buildAdminStyle(styleDraft),
          status: "active",
        }),
      });
      setSelectedTypeSlug(created.slug);
      setMessage(`Created object type ${created.display_name}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create object type.");
    } finally {
      setBusy("");
    }
  }

  async function createRecord() {
    if (!activeType) return;
    setBusy("Creating database object");
    setMessage("");
    try {
      const geometry = activeType.geometry_type === "table_only" ? null : JSON.parse(geometryText);
      const properties = adminFieldDraftToProperties(activeFields, propertyDraft);
      const created = await apiFetch<DesignAssetRecord>("/api/design-assets/records", {
        method: "POST",
        body: JSON.stringify({
          asset_type_slug: activeType.slug,
          record_key: recordKey,
          display_label: recordLabel,
          status: recordStatus,
          properties,
          geometry,
          source: "synthetic_demo",
          visibility: "synthetic-demo",
          notes: "Created from Administration > Database Admin. Synthetic/demo planning data only.",
        }),
      });
      setMessage(`Created ${created.display_label}. Map geometry records appear on the dashboard Design-mode planning assets layer.`);
      setRecordKey(`ADMIN-OBJECT-${Date.now().toString(36).toUpperCase()}`);
      setSelectedRecordId(created.id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create record.");
    } finally {
      setBusy("");
    }
  }

  async function installCoreSchemas() {
    setBusy("Installing core schemas");
    setMessage("");
    try {
      const result = await apiFetch<JsonRecord>("/api/design-assets/module-blueprints/core-telecom-rebuild/install", {
        method: "POST",
        body: JSON.stringify({ mode: "upsert" }),
      });
      setMessage(`Installed core rebuild schemas: ${String(result.created_asset_types || 0)} created, ${String(result.updated_asset_types || 0)} updated.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not install core schemas.");
    } finally {
      setBusy("");
    }
  }

  function applyTemplate(template: AdminDesignTemplate) {
    const suffix = Date.now().toString(36).toUpperCase();
    setTypeSlug(template.slug);
    setTypeName(template.typeName);
    setGeometryType(template.geometryType);
    setFieldsText(JSON.stringify(template.fields, null, 2));
    setStyleText(JSON.stringify(template.style, null, 2));
    setFieldDrafts(template.fields);
    setStyleDraft(styleToAdminDraft(template.style));
    setRecordKey(`${template.recordPrefix}-${suffix}`);
    setRecordLabel(template.recordLabel);
    setRecordStatus(template.recordStatus);
    setPropertiesText(JSON.stringify({ ...template.properties, source_status: "synthetic_demo" }, null, 2));
    setPropertyDraft(propertiesToAdminFieldDraft(template.fields, { ...template.properties, source_status: "synthetic_demo" }));
    setGeometryText(template.geometry ? JSON.stringify(template.geometry, null, 2) : "");
    const existing = assetTypes.find((assetType) => assetType.slug === template.slug);
    if (existing) {
      setSelectedTypeSlug(existing.slug);
      setMessage(`Loaded ${template.label} template and selected the existing ${existing.display_name} schema.`);
    } else {
      setMessage(`Loaded ${template.label} template. Create the object type, then create records from it.`);
    }
  }

  async function updateSelectedRecord(statusOverride?: DesignAssetRecord["status"]) {
    if (!selectedRecord) return;
    setBusy("Saving design record");
    setMessage("");
    try {
      const geometry = selectedRecord.geometry_type === "table_only" || !editGeometryText.trim() ? null : JSON.parse(editGeometryText);
      const currentProperties = selectedRecord.properties || selectedRecord.properties_json || {};
      const editedProperties = selectedRecordFields.length ? adminFieldDraftToProperties(selectedRecordFields, editPropertyDraft) : {};
      const updated = await apiFetch<DesignAssetRecord>(`/api/design-assets/records/${selectedRecord.id}`, {
        method: "PUT",
        body: JSON.stringify({
          display_label: editLabel,
          status: statusOverride || editStatus,
          properties: { ...currentProperties, ...editedProperties },
          geometry,
          notes: editNotes,
        }),
      });
      setSelectedRecordId(updated.id);
      setMessage(`Saved ${updated.display_label}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save design record.");
    } finally {
      setBusy("");
    }
  }

  async function duplicateSelectedRecord() {
    if (!selectedRecord) return;
    setBusy("Duplicating design record");
    setMessage("");
    try {
      const suffix = Date.now().toString(36).toUpperCase();
      const copiedProperties = stripWorkOrderProperties(selectedRecord.properties || selectedRecord.properties_json || {});
      const duplicated = await apiFetch<DesignAssetRecord>("/api/design-assets/records", {
        method: "POST",
        body: JSON.stringify({
          asset_type_slug: selectedRecord.asset_type_slug,
          asset_type_id: selectedRecord.asset_type_id,
          record_key: `${selectedRecord.record_key}-COPY-${suffix}`.slice(0, 160),
          display_label: `${selectedRecord.display_label} copy`.slice(0, 180),
          status: "proposed",
          properties: copiedProperties,
          geometry: selectedRecord.geometry || selectedRecord.geometry_json || null,
          source: "synthetic_demo",
          visibility: selectedRecord.visibility || "synthetic-demo",
          notes: `Copied from ${selectedRecord.record_key}. Synthetic/demo planning record only.`,
        }),
      });
      setSelectedRecordId(duplicated.id);
      setMessage(`Duplicated ${selectedRecord.display_label}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not duplicate design record.");
    } finally {
      setBusy("");
    }
  }

  async function archiveSelectedRecord() {
    if (!selectedRecord) return;
    if (!window.confirm(`Archive ${selectedRecord.display_label}?`)) return;
    setBusy("Archiving design record");
    setMessage("");
    try {
      await apiFetch<DesignAssetRecord>(`/api/design-assets/records/${selectedRecord.id}`, { method: "DELETE" });
      setMessage(`Archived ${selectedRecord.display_label}.`);
      setSelectedRecordId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not archive design record.");
    } finally {
      setBusy("");
    }
  }

  async function issueWorkOrder(record: DesignAssetRecord) {
    setIssuingRecordId(record.id);
    setBusy("Issuing work order");
    setMessage("");
    try {
      const result = await apiFetch<DesignIssuedWorkOrderResult>(`/api/design-assets/records/${record.id}/issue-work-order`, {
        method: "POST",
        body: JSON.stringify({
          title: `Design work: ${record.display_label}`,
          work_type: "design_database_work",
          priority: "normal",
          status: "issued",
        }),
      });
      setMessage(`Issued ${result.work_order.work_order_number || "work order"} with ${result.tasks.length} task${result.tasks.length === 1 ? "" : "s"} from ${record.display_label}.`);
      setSelectedRecordId(result.record.id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not issue work order.");
    } finally {
      setBusy("");
      setIssuingRecordId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="eyebrowless-title">Database Administration</h1>
          <div className="subtle">Create no-account schemas and synthetic/demo records for any database object. Map records appear on the dashboard Design-mode planning assets layer.</div>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={() => void load()} title="Refresh"><RefreshCw size={16} /></button>
          <Link className="button primary" href="/dashboard?drawer=design"><Map size={16} />Open Map Design Layer</Link>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <strong>Administration boundary</strong>
            <div className="subtle">The backend uses a no-account demo engineer for edits. Keep all records synthetic/demo unless imported and verified later.</div>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="panel-body">
          <div className="metric-grid">
            <div className="metric-card"><div className="subtle">Object types</div><div className="metric-value">{assetTypes.length.toLocaleString()}</div></div>
            <div className="metric-card"><div className="subtle">Design records</div><div className="metric-value">{records.length.toLocaleString()}</div></div>
            <div className="metric-card"><div className="subtle">Map-visible records</div><div className="metric-value">{mapRecords.length.toLocaleString()}</div></div>
            <div className="metric-card"><div className="subtle">Work-linked records</div><div className="metric-value">{workLinkedRecords.length.toLocaleString()}</div></div>
          </div>
          {message ? <p className="badge active" style={{ marginTop: 12 }}>{busy ? `${busy}... ` : ""}{message}</p> : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <strong>Design database guide</strong>
            <div className="subtle">A quick playbook for using GridAssetLink as an editable design database and work-order system.</div>
          </div>
          <BookOpen size={18} />
        </div>
        <div className="panel-body">
          <div className="admin-guide-grid">
            {adminGuideCards.map((card, index) => (
              <article key={card.title}>
                <div className="admin-guide-index">{index + 1}</div>
                <div>
                  <strong>{card.title}</strong>
                  <span>{card.body}</span>
                  <small>{card.action}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="admin-guide-actions">
            <Link className="button" href="/dashboard?drawer=guide"><BookOpen size={15} />Open no-code guide</Link>
            <Link className="button" href="/dashboard?drawer=design"><Map size={15} />Open map design mode</Link>
            <Link className="button" href="/work-orders"><ClipboardList size={15} />View work orders</Link>
            <Link className="button" href="/import-export"><Upload size={15} />Import / Export</Link>
          </div>
          <div className="admin-service-guide">
            <div>
              <strong>Assign a service from one substation LIU to another</strong>
              <span>Use this sequence when inserting endpoint devices, reserving strands, building the splice path, and assigning a circuit or service across synthetic planning fiber.</span>
            </div>
            <div className="admin-service-flow">
              {serviceAssignmentGuideSteps.map((step) => (
                <article key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </article>
              ))}
            </div>
            <div className="admin-service-elements">
              <strong>Capture these required elements</strong>
              <ul>
                {serviceAssignmentElements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="admin-circuit-examples">
              <strong>Example synthetic circuit assignments</strong>
              <div>
                {serviceAssignmentExamples.map((example) => (
                  <article key={example.circuitId}>
                    <div>
                      <strong>{example.circuitId}</strong>
                      <span>{example.service}</span>
                    </div>
                    <dl>
                      <div><dt>Devices</dt><dd>{example.devices}</dd></div>
                      <div><dt>Fiber</dt><dd>{example.fiber}</dd></div>
                      <div><dt>Splicing</dt><dd>{example.splicing}</dd></div>
                      <div><dt>Assignment</dt><dd>{example.assignment}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <strong>How to change the database</strong>
            <div className="subtle">Use this admin workflow for any synthetic planning object you want available in the app and on the map.</div>
          </div>
          <Database size={18} />
        </div>
        <div className="panel-body">
          <div className="admin-workflow-grid">
            <article><strong>1. Create or install schemas</strong><span>Install the core TelecomNE schemas or define a custom object type with fields, validation hints, and map style.</span></article>
            <article><strong>2. Add records</strong><span>Use guide buttons, templates, forms, and map drawing tools. Point, line, and polygon records appear on the dashboard Design Mode layer.</span></article>
            <article><strong>3. Review on dashboard</strong><span>Open `/dashboard?drawer=design`, enable Design Mode, draw/edit geometry, and search the editable planning asset layer.</span></article>
            <article><strong>4. Issue and close work</strong><span>Issue work orders from living design records, track field tasks, then update records to planned, active, or as-built after verification.</span></article>
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>All admin-created data remains synthetic/demo unless a later import workflow explicitly marks it verified. Do not enter CEII, SCADA, relay/protection, operational telecom, credentials, or private fiber-route data.</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <strong>Recommended design/edit improvements</strong>
            <div className="subtle">Templates and guide actions reduce manual entry and make common design objects consistent before they become work orders or module records.</div>
          </div>
          <Upload size={18} />
        </div>
        <div className="panel-body">
          <div className="admin-template-grid">
            {adminDesignTemplates.map((template) => (
              <button type="button" key={template.key} onClick={() => applyTemplate(template)}>
                <strong>{template.label}</strong>
                <span>{template.description}</span>
                <small>{template.geometryType === "table_only" ? "database only" : `${template.geometryType} map object`}</small>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <strong>Living database work queue</strong>
            <div className="subtle">Any schema-backed planning object can issue tracked work. The record stores the latest work-order link in its properties.</div>
          </div>
          <ClipboardList size={18} />
        </div>
        <div className="panel-body">
          <div className="admin-work-order-grid">
            {queueRecords.map((record) => {
              const workOrderNumber = designRecordWorkOrderNumber(record);
              const workOrderId = designRecordWorkOrderId(record);
              return (
                <article key={record.id}>
                  <div>
                    <strong>{record.display_label}</strong>
                    <span>{record.asset_type_display_name || record.asset_type_slug} / {record.status}</span>
                  </div>
                  <small>{record.record_key}</small>
                  <button className="button" type="button" onClick={() => setSelectedRecordId(record.id)}>Edit record</button>
                  {workOrderNumber ? (
                    <Link className="button" href={workOrderId ? `/work-orders/${workOrderId}` : "/work-orders"}>Open {workOrderNumber}</Link>
                  ) : (
                    <button className="button primary" type="button" onClick={() => void issueWorkOrder(record)} disabled={!writable || Boolean(busy)}>
                      {issuingRecordId === record.id ? "Issuing..." : "Issue Work Order"}
                    </button>
                  )}
                </article>
              );
            })}
            {!queueRecords.length ? <p className="subtle">No living database records are available yet. Create a database object first.</p> : null}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <strong>Record browser and editor</strong>
            <div className="subtle">Search, filter, edit, duplicate, archive, and review design records from one place.</div>
          </div>
          <History size={18} />
        </div>
        <div className="panel-body">
          <div className="admin-record-toolbar">
            <input className="input" value={recordSearch} onChange={(event) => setRecordSearch(event.currentTarget.value)} placeholder="Search label, key, type, status, or properties" />
            <select className="select" value={recordStatusFilter} onChange={(event) => setRecordStatusFilter(event.currentTarget.value)}>
              <option value="open">Open records</option>
              <option value="all">All records</option>
              <option value="work_linked">Has work order</option>
              <option value="needs_work_order">Needs work order</option>
              {designRecordStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
            </select>
            <span className="subtle">{filteredRecords.length.toLocaleString()} matching records</span>
          </div>
          <div className="admin-record-control-grid">
            <div className="admin-record-browser-list">
              {filteredRecords.slice(0, 18).map((record) => {
                const workOrderNumber = designRecordWorkOrderNumber(record);
                return (
                  <button type="button" key={record.id} className={selectedRecord?.id === record.id ? "active" : ""} onClick={() => setSelectedRecordId(record.id)}>
                    <strong>{record.display_label}</strong>
                    <span>{record.asset_type_display_name || record.asset_type_slug} / {record.status}{workOrderNumber ? ` / ${workOrderNumber}` : ""}</span>
                    <small>{record.record_key}</small>
                  </button>
                );
              })}
              {!filteredRecords.length ? <p className="subtle">No records match the current filters.</p> : null}
            </div>
            <div className="admin-record-editor">
              {selectedRecord ? (
                <>
                  <div className="admin-record-editor-heading">
                    <div>
                      <strong>{selectedRecord.display_label}</strong>
                      <span>{selectedRecord.record_key} / {selectedRecord.asset_type_display_name || selectedRecord.asset_type_slug}</span>
                    </div>
                    <div className="toolbar">
                      {designRecordWorkOrderNumber(selectedRecord) ? <Link className="button" href={designRecordWorkOrderId(selectedRecord) ? `/work-orders/${designRecordWorkOrderId(selectedRecord)}` : "/work-orders"}>Open {designRecordWorkOrderNumber(selectedRecord)}</Link> : null}
                      <Link className="button" href="/dashboard?drawer=design"><Map size={15} />Map</Link>
                    </div>
                  </div>
                  <div className="admin-status-strip">
                    {designRecordStatuses.filter((status) => status !== "archived").map((status) => (
                      <button type="button" key={status} className={editStatus === status ? "active" : ""} onClick={() => setEditStatus(status)}>{formatLabel(status)}</button>
                    ))}
                  </div>
                  <div className="form-grid">
                    <label><span className="field-label">Display label</span><input className="input" value={editLabel} onChange={(event) => setEditLabel(event.currentTarget.value)} /></label>
                    <label><span className="field-label">Status</span><select className="select" value={editStatus} onChange={(event) => setEditStatus(event.currentTarget.value as DesignAssetRecord["status"])}>
                      {designRecordStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                    </select></label>
                    <div className="form-grid-wide">
                      <AdminPropertyEditor fields={selectedRecordFields} draft={editPropertyDraft} onChange={updateEditProperty} emptyText="This record type has no configured form fields yet. Use the Type Designer or dashboard Guide to add a richer schema." />
                    </div>
                    {selectedRecord.geometry_type !== "table_only" ? (
                      <div className="form-grid-wide">
                        <AdminGeometryControls geometryType={selectedRecord.geometry_type} geometryText={editGeometryText} onChange={setEditGeometryText} />
                      </div>
                    ) : null}
                    <details className="form-grid-wide admin-advanced-raw">
                      <summary>Advanced raw snapshot</summary>
                      <p className="subtle">Read-only backup for troubleshooting. Normal edits use the form controls above.</p>
                      <label><span className="field-label">Properties snapshot</span><textarea className="textarea admin-editor-json" value={editPropertiesText} readOnly /></label>
                      {selectedRecord.geometry_type !== "table_only" ? <label><span className="field-label">Geometry snapshot</span><textarea className="textarea admin-editor-json" value={editGeometryText} readOnly /></label> : null}
                    </details>
                    <label className="form-grid-wide"><span className="field-label">Notes</span><textarea className="textarea" value={editNotes} onChange={(event) => setEditNotes(event.currentTarget.value)} /></label>
                  </div>
                  <div className="toolbar admin-record-actions">
                    <button className="button primary" type="button" onClick={() => void updateSelectedRecord()} disabled={!writable || Boolean(busy)}><Save size={15} />Save changes</button>
                    <button className="button" type="button" onClick={() => void duplicateSelectedRecord()} disabled={!writable || Boolean(busy)}><Copy size={15} />Duplicate</button>
                    <button className="button" type="button" onClick={() => void issueWorkOrder(selectedRecord)} disabled={!writable || Boolean(busy)}><ClipboardList size={15} />Issue work order</button>
                    <button className="button" type="button" onClick={() => void archiveSelectedRecord()} disabled={!writable || Boolean(busy)}><Archive size={15} />Archive</button>
                  </div>
                  <div className="admin-event-list">
                    <div className="field-label">Recent history</div>
                    {recordEvents.map((event) => (
                      <div key={String(event.id)}>
                        <strong>{formatLabel(displayValue(event.event_type))}</strong>
                        <span>{displayValue(event.event_time)} / user {displayValue(event.actor_user_id)}</span>
                      </div>
                    ))}
                    {!recordEvents.length ? <p className="subtle">No event history loaded for this record.</p> : null}
                  </div>
                </>
              ) : (
                <p className="subtle">Select a record to edit it.</p>
              )}
            </div>
          </div>
        </div>
      </section>
      {!writable ? (
        <div className="badge red">This no-account demo is currently read-only. Check backend write settings before editing database objects.</div>
      ) : null}
      <div className="admin-database-grid">
        <section className="panel">
          <div className="panel-header"><strong>Create object type</strong><button className="button" type="button" onClick={() => void installCoreSchemas()} disabled={Boolean(busy)}><Upload size={15} />Install core schemas</button></div>
          <div className="panel-body form-grid">
            <label><span className="field-label">Slug</span><input className="input" value={typeSlug} onChange={(event) => setTypeSlug(event.currentTarget.value)} /></label>
            <label><span className="field-label">Display name</span><input className="input" value={typeName} onChange={(event) => setTypeName(event.currentTarget.value)} /></label>
            <label><span className="field-label">Geometry</span><select className="select" value={geometryType} onChange={(event) => setGeometryType(event.currentTarget.value as DesignAssetType["geometry_type"])}>
              <option value="point">Point map object</option>
              <option value="line">Line or route object</option>
              <option value="polygon">Polygon object</option>
              <option value="table_only">Database only</option>
            </select></label>
            <div className="form-grid-wide admin-schema-builder">
              <div className="admin-fieldset-heading">
                <strong>Form fields</strong>
                <span>These fields become the no-code editor for every record of this object type.</span>
              </div>
              {fieldDrafts.map((field, index) => (
                <div className="admin-schema-field-row" key={`${field.name}-${index}`}>
                  <div className="admin-schema-field-header">
                    <strong>{field.label || `Field ${index + 1}`}</strong>
                    <button className="button" type="button" onClick={() => removeSchemaField(index)} disabled={fieldDrafts.length <= 1}>Remove</button>
                  </div>
                  <div className="form-grid">
                    <label><span className="field-label">Label</span><input className="input" value={field.label || ""} onChange={(event) => {
                      const label = event.currentTarget.value;
                      updateSchemaField(index, { label, name: field.name || adminFieldNameFromLabel(label) });
                    }} /></label>
                    <label><span className="field-label">Field name</span><input className="input" value={field.name || ""} onChange={(event) => updateSchemaField(index, { name: adminFieldNameFromLabel(event.currentTarget.value) })} /></label>
                    <label><span className="field-label">Type</span><select className="select" value={field.type} onChange={(event) => updateSchemaFieldType(index, event.currentTarget.value as DesignAssetFieldType)}>
                      {adminFieldTypeOptions.map((fieldType) => <option key={fieldType} value={fieldType}>{formatLabel(fieldType)}</option>)}
                    </select></label>
                    <label><span className="field-label">Required</span><select className="select" value={field.required ? "true" : "false"} onChange={(event) => updateSchemaField(index, { required: event.currentTarget.value === "true" })}>
                      <option value="false">Optional</option>
                      <option value="true">Required</option>
                    </select></label>
                    <label><span className="field-label">Default</span><input className="input" value={adminDefaultText(field)} onChange={(event) => updateSchemaField(index, { default: adminDefaultFromText(field.type, event.currentTarget.value) })} /></label>
                    <label><span className="field-label">Help text</span><input className="input" value={field.help_text || ""} onChange={(event) => updateSchemaField(index, { help_text: event.currentTarget.value })} /></label>
                    {field.type === "enum" ? <label className="form-grid-wide"><span className="field-label">Options</span><input className="input" value={(field.enum_options || []).join(", ")} onChange={(event) => updateSchemaField(index, { enum_options: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label> : null}
                  </div>
                </div>
              ))}
              <button className="button" type="button" onClick={addSchemaField}><Plus size={15} />Add field</button>
            </div>
            <div className="form-grid-wide admin-style-builder">
              <div className="admin-fieldset-heading">
                <strong>Map style</strong>
                <span>Choose how this object appears on the dashboard map.</span>
              </div>
              <div className="form-grid">
                <label><span className="field-label">Color</span><input className="input" type="color" value={styleDraft.color} onChange={(event) => updateStyleDraft({ color: event.currentTarget.value })} /></label>
                <label><span className="field-label">Point radius</span><input className="input" type="number" min="2" max="24" value={styleDraft.radius} onChange={(event) => updateStyleDraft({ radius: event.currentTarget.value })} /></label>
                <label><span className="field-label">Line width</span><input className="input" type="number" min="1" max="16" value={styleDraft.lineWidth} onChange={(event) => updateStyleDraft({ lineWidth: event.currentTarget.value })} /></label>
                <label><span className="field-label">Fill opacity</span><input className="input" type="number" min="0" max="1" step="0.05" value={styleDraft.fillOpacity} onChange={(event) => updateStyleDraft({ fillOpacity: event.currentTarget.value })} /></label>
              </div>
            </div>
            <details className="form-grid-wide admin-advanced-raw">
              <summary>Advanced schema backup</summary>
              <p className="subtle">Optional fallback for exported schemas. Use the visual field builder for normal database updates.</p>
              <label><span className="field-label">Field definitions backup</span><textarea className="textarea" value={fieldsText} onChange={(event) => setFieldsText(event.currentTarget.value)} /></label>
              <label><span className="field-label">Map style backup</span><textarea className="textarea" value={styleText} onChange={(event) => setStyleText(event.currentTarget.value)} /></label>
              <button className="button" type="button" onClick={loadAdvancedSchemaFallback}>Load backup into builder</button>
            </details>
            <button className="button primary" type="button" onClick={() => void createType()} disabled={Boolean(busy) || !writable}><Plus size={16} />Create object type</button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><strong>Create database object</strong><Database size={17} /></div>
          <div className="panel-body form-grid">
            <label><span className="field-label">Object type</span><select className="select" value={activeType?.slug || ""} onChange={(event) => setSelectedTypeSlug(event.currentTarget.value)}>
              {assetTypes.map((type) => <option key={type.slug} value={type.slug}>{type.display_name}</option>)}
            </select></label>
            <label><span className="field-label">Record key</span><input className="input" value={recordKey} onChange={(event) => setRecordKey(event.currentTarget.value)} /></label>
            <label><span className="field-label">Display label</span><input className="input" value={recordLabel} onChange={(event) => setRecordLabel(event.currentTarget.value)} /></label>
            <label><span className="field-label">Status</span><select className="select" value={recordStatus} onChange={(event) => setRecordStatus(event.currentTarget.value as DesignAssetRecord["status"])}>
              {["proposed", "planned", "in_review", "active", "as_built"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select></label>
            <div className="form-grid-wide">
              <AdminPropertyEditor fields={activeFields} draft={propertyDraft} onChange={updateCreateProperty} emptyText="Select or create an object type with form fields before adding records." />
            </div>
            {activeType?.geometry_type !== "table_only" ? (
              <div className="form-grid-wide">
                <AdminGeometryControls geometryType={activeType?.geometry_type || "point"} geometryText={geometryText} onChange={setGeometryText} />
              </div>
            ) : null}
            <details className="form-grid-wide admin-advanced-raw">
              <summary>Advanced raw snapshot</summary>
              <p className="subtle">Read-only preview of what the form will save. Everyday updates should use the fields above.</p>
              <label><span className="field-label">Properties snapshot</span><textarea className="textarea" value={propertiesText} readOnly /></label>
              {activeType?.geometry_type !== "table_only" ? <label><span className="field-label">Geometry snapshot</span><textarea className="textarea" value={geometryText} readOnly /></label> : null}
            </details>
            <button className="button primary" type="button" onClick={() => void createRecord()} disabled={Boolean(busy) || !writable || !activeType}><Plus size={16} />Create database object</button>
          </div>
        </section>
      </div>
      <DataTable
        rows={filteredRecords.map((record) => ({ ...record, map_visible: Boolean(record.geometry || record.geometry_json), latest_work_order_number: designRecordWorkOrderNumber(record), living_database_status: designRecordLivingStatus(record), dashboard_view: "/dashboard?drawer=design" }) as unknown as JsonRecord)}
        columns={["display_label", "asset_type_display_name", "record_key", "status", "living_database_status", "latest_work_order_number", "geometry_type", "map_visible", "visibility", "dashboard_view"]}
        filterField="asset_type_display_name"
      />
    </>
  );
}

const adminFieldTypeOptions: DesignAssetFieldType[] = ["string", "textarea", "number", "integer", "boolean", "date", "enum", "json"];

function AdminPropertyEditor({ fields, draft, onChange, emptyText }: { fields: DesignAssetField[]; draft: Record<string, string>; onChange: (fieldName: string, value: string) => void; emptyText: string }) {
  if (!fields.length) {
    return <p className="subtle">{emptyText}</p>;
  }
  return (
    <div className="admin-property-editor">
      <div className="admin-fieldset-heading">
        <strong>Database fields</strong>
        <span>Use these controls to update the record. The app handles the stored structure behind the scenes.</span>
      </div>
      <div className="admin-property-grid">
        {fields.map((field) => <AdminPropertyInput key={field.name} field={field} value={draft[field.name] || ""} onChange={(value) => onChange(field.name, value)} />)}
      </div>
    </div>
  );
}

function AdminPropertyInput({ field, value, onChange }: { field: DesignAssetField; value: string; onChange: (value: string) => void }) {
  const label = `${field.label || formatLabel(field.name)}${field.required ? " *" : ""}`;
  const helpText = field.help_text || (field.type === "json" ? "Enter one item per line or separate items with commas." : "");
  if (field.type === "textarea" || field.type === "json") {
    return (
      <label className="admin-property-field">
        <span className="field-label">{field.type === "json" ? `${label} list` : label}</span>
        <textarea className="textarea" value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={helpText} />
        {helpText ? <small>{helpText}</small> : null}
      </label>
    );
  }
  if (field.type === "enum") {
    return (
      <label className="admin-property-field">
        <span className="field-label">{label}</span>
        <select className="select" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
          <option value="">Select...</option>
          {(field.enum_options || []).map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
        </select>
        {helpText ? <small>{helpText}</small> : null}
      </label>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="admin-property-field">
        <span className="field-label">{label}</span>
        <select className="select" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
          <option value="">Select...</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        {helpText ? <small>{helpText}</small> : null}
      </label>
    );
  }
  return (
    <label className="admin-property-field">
      <span className="field-label">{label}</span>
      <input className="input" type={field.type === "number" || field.type === "integer" ? "number" : field.type === "date" ? "date" : "text"} value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={helpText} />
      {helpText ? <small>{helpText}</small> : null}
    </label>
  );
}

function AdminGeometryControls({ geometryType, geometryText, onChange }: { geometryType: DesignAssetGeometryType; geometryText: string; onChange: (value: string) => void }) {
  if (geometryType === "table_only") return null;
  const draft = adminGeometryDraft(geometryType, geometryText);
  if (geometryType === "point") {
    return (
      <div className="admin-geometry-editor">
        <div className="admin-fieldset-heading">
          <strong>Map location</strong>
          <span>Enter the synthetic point location or edit it on the dashboard map.</span>
        </div>
        <div className="form-grid">
          <label><span className="field-label">Longitude</span><input className="input" type="number" step="0.000001" value={draft.longitude} onChange={(event) => onChange(adminPointGeometryText(event.currentTarget.value, draft.latitude))} /></label>
          <label><span className="field-label">Latitude</span><input className="input" type="number" step="0.000001" value={draft.latitude} onChange={(event) => onChange(adminPointGeometryText(draft.longitude, event.currentTarget.value))} /></label>
        </div>
      </div>
    );
  }
  if (geometryType === "line") {
    return (
      <div className="admin-geometry-editor">
        <div className="admin-fieldset-heading">
          <strong>Route endpoints</strong>
          <span>Set a simple synthetic line here, or use dashboard map drawing for detailed routes.</span>
        </div>
        <div className="form-grid">
          <label><span className="field-label">A-end longitude</span><input className="input" type="number" step="0.000001" value={draft.aLongitude} onChange={(event) => onChange(adminLineGeometryText(event.currentTarget.value, draft.aLatitude, draft.zLongitude, draft.zLatitude))} /></label>
          <label><span className="field-label">A-end latitude</span><input className="input" type="number" step="0.000001" value={draft.aLatitude} onChange={(event) => onChange(adminLineGeometryText(draft.aLongitude, event.currentTarget.value, draft.zLongitude, draft.zLatitude))} /></label>
          <label><span className="field-label">Z-end longitude</span><input className="input" type="number" step="0.000001" value={draft.zLongitude} onChange={(event) => onChange(adminLineGeometryText(draft.aLongitude, draft.aLatitude, event.currentTarget.value, draft.zLatitude))} /></label>
          <label><span className="field-label">Z-end latitude</span><input className="input" type="number" step="0.000001" value={draft.zLatitude} onChange={(event) => onChange(adminLineGeometryText(draft.aLongitude, draft.aLatitude, draft.zLongitude, event.currentTarget.value))} /></label>
        </div>
      </div>
    );
  }
  return (
    <div className="admin-geometry-editor">
      <div className="admin-fieldset-heading">
        <strong>Area placement</strong>
        <span>Create a simple synthetic rectangle. Use dashboard map drawing for detailed boundaries.</span>
      </div>
      <div className="form-grid">
        <label><span className="field-label">Center longitude</span><input className="input" type="number" step="0.000001" value={draft.longitude} onChange={(event) => onChange(adminPolygonGeometryText(event.currentTarget.value, draft.latitude, draft.width, draft.height))} /></label>
        <label><span className="field-label">Center latitude</span><input className="input" type="number" step="0.000001" value={draft.latitude} onChange={(event) => onChange(adminPolygonGeometryText(draft.longitude, event.currentTarget.value, draft.width, draft.height))} /></label>
        <label><span className="field-label">Width degrees</span><input className="input" type="number" step="0.001" value={draft.width} onChange={(event) => onChange(adminPolygonGeometryText(draft.longitude, draft.latitude, event.currentTarget.value, draft.height))} /></label>
        <label><span className="field-label">Height degrees</span><input className="input" type="number" step="0.001" value={draft.height} onChange={(event) => onChange(adminPolygonGeometryText(draft.longitude, draft.latitude, draft.width, event.currentTarget.value))} /></label>
      </div>
    </div>
  );
}

function designRecordWorkOrderNumber(record: DesignAssetRecord): string {
  const value = (record.properties || record.properties_json || {}).latest_work_order_number;
  return typeof value === "string" ? value : "";
}

function designRecordWorkOrderId(record: DesignAssetRecord): number | null {
  const value = (record.properties || record.properties_json || {}).latest_work_order_id;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function designRecordLivingStatus(record: DesignAssetRecord): string {
  const value = (record.properties || record.properties_json || {}).living_database_status;
  return typeof value === "string" && value.trim() ? value : "design_record";
}

function stripWorkOrderProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const next = { ...properties };
  [
    "linked_work_order_ids",
    "linkedWorkOrderIds",
    "latest_work_order_id",
    "latestWorkOrderId",
    "latest_work_order_number",
    "latestWorkOrderNumber",
    "work_order_status",
    "workOrderStatus",
    "living_database_status",
    "livingDatabaseStatus",
  ].forEach((key) => delete next[key]);
  return next;
}

function adminFieldsForType(assetType?: DesignAssetType | null): DesignAssetField[] {
  return assetType?.fields?.length ? assetType.fields : assetType?.fields_json?.length ? assetType.fields_json : [];
}

function blankAdminField(index: number): DesignAssetField {
  return { name: `field_${index}`, label: `Field ${index}`, type: "string", required: false };
}

function adminFieldNameFromLabel(value: string) {
  const name = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!name) return "";
  return /^[a-z_]/.test(name) ? name.slice(0, 80) : `field_${name}`.slice(0, 80);
}

function adminDefaultText(field: DesignAssetField) {
  if (field.default === undefined || field.default === null) return "";
  if (field.type === "json") return Array.isArray(field.default) ? field.default.join(", ") : typeof field.default === "object" ? Object.entries(field.default as Record<string, unknown>).map(([key, value]) => `${key}: ${String(value)}`).join("\n") : String(field.default);
  if (field.type === "boolean") return field.default === true ? "true" : field.default === false ? "false" : "";
  return String(field.default);
}

function adminDefaultFromText(type: DesignAssetFieldType, value: string) {
  if (!value.trim()) return undefined;
  if (type === "integer") return Number.parseInt(value, 10);
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true";
  if (type === "json") return parseAdminStructuredValue(value);
  return value;
}

function propertiesToAdminFieldDraft(fields: DesignAssetField[], properties: Record<string, unknown>) {
  return Object.fromEntries(fields.map((field) => [field.name, stringifyAdminFieldValue(properties[field.name] ?? field.default ?? "", field)]));
}

function stringifyAdminFieldValue(value: unknown, field: DesignAssetField) {
  if (value === undefined || value === null) return "";
  if (field.type === "json") {
    if (Array.isArray(value)) return value.map((item) => String(item)).join("\n");
    if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${String(item)}`).join("\n");
    return String(value);
  }
  if (field.type === "boolean") return value === true ? "true" : value === false ? "false" : "";
  return String(value);
}

function adminFieldDraftToProperties(fields: DesignAssetField[], draft: Record<string, string>) {
  const properties: Record<string, unknown> = {};
  fields.forEach((field) => {
    const value = draft[field.name];
    if (value === undefined || value === "") {
      if (field.required) properties[field.name] = value || "";
      return;
    }
    if (field.type === "integer") {
      properties[field.name] = Number.parseInt(value, 10);
      return;
    }
    if (field.type === "number") {
      properties[field.name] = Number(value);
      return;
    }
    if (field.type === "boolean") {
      properties[field.name] = value === "true";
      return;
    }
    if (field.type === "json") {
      properties[field.name] = parseAdminStructuredValue(value);
      return;
    }
    properties[field.name] = value;
  });
  return properties;
}

function parseAdminStructuredValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  const lines = trimmed.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  if (trimmed.includes(",")) return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  if (trimmed.includes(":")) {
    const entries = lines.map((line) => line.split(":").map((item) => item.trim()));
    if (entries.every((entry) => entry.length >= 2 && entry[0])) {
      return Object.fromEntries(entries.map(([key, ...rest]) => [key, rest.join(":")]));
    }
  }
  return [trimmed];
}

function adminSearchableFields(fields: DesignAssetField[]) {
  const preferred = fields.filter((field) => ["string", "textarea", "enum"].includes(field.type)).map((field) => field.name).slice(0, 8);
  return preferred.length ? preferred : ["name", "object_name", "status", "notes"];
}

function buildAdminStyle(style: { color: string; radius: string; lineWidth: string; fillOpacity: string }) {
  return {
    color: style.color || defaultAdminStyle.color,
    radius: Number.parseFloat(style.radius) || defaultAdminStyle.radius,
    lineWidth: Number.parseFloat(style.lineWidth) || defaultAdminStyle.lineWidth,
    fillOpacity: Number.parseFloat(style.fillOpacity) || 0,
  };
}

function styleToAdminDraft(style: Record<string, unknown>) {
  return {
    color: typeof style.color === "string" ? style.color : defaultAdminStyle.color,
    radius: String(typeof style.radius === "number" ? style.radius : defaultAdminStyle.radius),
    lineWidth: String(typeof style.lineWidth === "number" ? style.lineWidth : defaultAdminStyle.lineWidth),
    fillOpacity: String(typeof style.fillOpacity === "number" ? style.fillOpacity : defaultAdminStyle.fillOpacity),
  };
}

function adminGeometryDraft(geometryType: DesignAssetGeometryType, geometryText: string) {
  const fallback = geometryType === "line"
    ? { aLongitude: "-71.82", aLatitude: "42.25", zLongitude: "-71.78", zLatitude: "42.28", longitude: "-71.80", latitude: "42.26", width: "0.04", height: "0.03" }
    : { aLongitude: "-71.82", aLatitude: "42.25", zLongitude: "-71.78", zLatitude: "42.28", longitude: "-71.8023", latitude: "42.2626", width: "0.04", height: "0.03" };
  try {
    const geometry = JSON.parse(geometryText) as { type?: string; coordinates?: unknown };
    if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
      const [lon, lat] = geometry.coordinates as [number, number];
      return { ...fallback, longitude: adminNumberText(lon), latitude: adminNumberText(lat) };
    }
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
      const coordinates = geometry.coordinates as [number, number][];
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first && last) {
        return { ...fallback, aLongitude: adminNumberText(first[0]), aLatitude: adminNumberText(first[1]), zLongitude: adminNumberText(last[0]), zLatitude: adminNumberText(last[1]) };
      }
    }
    if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
      const ring = (geometry.coordinates as [number, number][][])[0] || [];
      if (ring.length) {
        const lons = ring.map((coordinate) => coordinate[0]).filter(Number.isFinite);
        const lats = ring.map((coordinate) => coordinate[1]).filter(Number.isFinite);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        return {
          ...fallback,
          longitude: adminNumberText((minLon + maxLon) / 2),
          latitude: adminNumberText((minLat + maxLat) / 2),
          width: adminNumberText(maxLon - minLon),
          height: adminNumberText(maxLat - minLat),
        };
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function adminNumberText(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(6))) : "";
}

function adminCoordinate(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function adminPointGeometryText(longitude: string, latitude: string) {
  return JSON.stringify({ type: "Point", coordinates: [adminCoordinate(longitude), adminCoordinate(latitude)] }, null, 2);
}

function adminLineGeometryText(aLongitude: string, aLatitude: string, zLongitude: string, zLatitude: string) {
  return JSON.stringify({ type: "LineString", coordinates: [[adminCoordinate(aLongitude), adminCoordinate(aLatitude)], [adminCoordinate(zLongitude), adminCoordinate(zLatitude)]] }, null, 2);
}

function adminPolygonGeometryText(longitude: string, latitude: string, width: string, height: string) {
  const centerLon = adminCoordinate(longitude);
  const centerLat = adminCoordinate(latitude);
  const halfWidth = Math.max(adminCoordinate(width), 0.001) / 2;
  const halfHeight = Math.max(adminCoordinate(height), 0.001) / 2;
  const ring = [
    [centerLon - halfWidth, centerLat - halfHeight],
    [centerLon + halfWidth, centerLat - halfHeight],
    [centerLon + halfWidth, centerLat + halfHeight],
    [centerLon - halfWidth, centerLat + halfHeight],
    [centerLon - halfWidth, centerLat - halfHeight],
  ];
  return JSON.stringify({ type: "Polygon", coordinates: [ring] }, null, 2);
}
