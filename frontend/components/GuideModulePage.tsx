"use client";

import Link from "next/link";
import { BookOpen, Cable, ClipboardList, Database, GitBranch, Map, PanelTop, Plus, Route, Save, Split, TableProperties, Upload, Waypoints } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, canWrite } from "@/lib/api";
import { databaseIntegrationParameterGroups, databaseObjectInteractionPaths } from "@/lib/databaseIntegrationGuide";
import type { DesignAssetField, DesignAssetGeoJsonGeometry, DesignAssetGeometryType, DesignAssetRecord } from "@/lib/types/assets";

type GuideAssetType = {
  slug: string;
  display_name: string;
  description: string;
  geometry_type: DesignAssetGeometryType;
  fields: DesignAssetField[];
  searchable_fields: string[];
  map_style: Record<string, unknown>;
};

type GuideRecord = {
  asset_type_slug: string;
  record_key: string;
  display_label: string;
  status: DesignAssetRecord["status"];
  properties: Record<string, unknown>;
  geometry?: DesignAssetGeoJsonGeometry | null;
  source: "synthetic_demo";
  visibility: "synthetic-demo";
  notes: string;
};

type GuideWorkflow = {
  title: string;
  module: string;
  moduleHref: string;
  summary: string;
  buttons: string[];
  steps: string[];
  requiredFields: string[];
  validation: string[];
};

type ImplementationGuidePhase = {
  title: string;
  summary: string;
  steps: string[];
  deliverables: string[];
};

type ImplementationGuideDomain = {
  name: string;
  objects: string[];
  rule: string;
};

type ImplementationGuideWorkflow = {
  name: string;
  records: string[];
  review: string[];
};

type ImplementationGuideApiSurface = {
  area: string;
  routes: string[];
};

type ImplementationGuidePayload = {
  title: string;
  version: string;
  purpose: string;
  disclaimer: string;
  no_account_mode: {
    enabled: boolean;
    summary: string;
    rules: string[];
  };
  fresh_start_phases: ImplementationGuidePhase[];
  database_domains: ImplementationGuideDomain[];
  core_workflows: ImplementationGuideWorkflow[];
  api_surfaces: ImplementationGuideApiSurface[];
  handoff_checklist: string[];
};

const guideObjectTypes = [
  {
    title: "Pole or support structure",
    href: "/distribution-fiber",
    icon: Waypoints,
    fields: ["pole ID", "road or route", "structure type", "attachment status", "slack loop", "connected span IDs", "notes"],
    result: "A clickable planning point that can receive fiber, splices, slack, and work orders.",
  },
  {
    title: "Fiber span or cable section",
    href: "/fiber-cables",
    icon: Cable,
    fields: ["cable ID", "A-end", "Z-end", "fiber count", "fiber type", "owner/status", "route geometry", "associated splice points"],
    result: "A planned route record that can generate strands and carry services.",
  },
  {
    title: "Fiber strand",
    href: "/fiber-strand-table",
    icon: TableProperties,
    fields: ["cable ID", "strand number", "tube/color", "status", "assignment ID", "A/Z termination", "continuity notes"],
    result: "A reserveable or assignable strand row for service planning.",
  },
  {
    title: "Splice closure and splice rows",
    href: "/splice-matrix",
    icon: Split,
    fields: ["closure ID", "structure or LIU", "from cable/strand", "to cable/strand", "splice type", "loss", "existing/proposed status"],
    result: "A traceable splice matrix that supports resplicing without overwriting existing continuity.",
  },
  {
    title: "Patch panel or LIU",
    href: "/patch-panels",
    icon: PanelTop,
    fields: ["panel ID", "substation/site", "rack", "port count", "connector type", "cable IDs", "port-to-strand map"],
    result: "A termination inventory where devices and fiber assignments land.",
  },
  {
    title: "Device, port, circuit, or service",
    href: "/devices",
    icon: Route,
    fields: ["device ID", "device type", "port", "service ID", "service type", "A/Z endpoints", "strand set", "criticality"],
    result: "A service assignment that ties devices, LIUs, strands, splices, and work orders together.",
  },
] as const;

const guideWorkflows: GuideWorkflow[] = [
  {
    title: "Add fiber to a pole",
    module: "Distribution Network",
    moduleHref: "/distribution-fiber",
    summary: "Use this when a new ADSS, lateral, or distribution fiber route attaches to a synthetic pole/support.",
    buttons: ["Guide", "Create related examples", "Open Design records", "New object", "Draw point", "Save object", "Issue work order"],
    steps: [
      "Open Dashboard > Guide and create the distribution pole/span examples, or open Database Admin and choose the Distribution pole template.",
      "Create or select the pole record, then fill pole ID, road name, structure type, attachment status, and slack-loop notes.",
      "Create a fiber span record that references the pole as the A-end, Z-end, or pass-through support.",
      "Add cable IDs and strand count to the span, then create or reserve strand records in Fiber Strand Table.",
      "Issue a work order for make-ready, attachment, slack storage, field verification, or closeout evidence.",
    ],
    requiredFields: ["pole_id", "road_name", "structure_type", "attachment_status", "connected_cable_ids", "slack_loop_length", "work_order_scope"],
    validation: ["Pole has a unique ID.", "Fiber span references valid endpoints.", "Slack is marked synthetic/demo.", "No strand is double-assigned."],
  },
  {
    title: "Add a span between two poles",
    module: "Fiber Cables",
    moduleHref: "/fiber-cables",
    summary: "Create a line object for a planned cable/span and use route endpoints to connect it to structures.",
    buttons: ["Design Mode", "Line or route object", "Draw line", "Finish drawing", "Save object", "Materialize selected to backend"],
    steps: [
      "Use the Type Designer line template or the Fiber span template in Database Admin.",
      "Enter cable ID, A-end structure, Z-end structure, fiber type, fiber count, and install status.",
      "Draw the line on the dashboard or enter route endpoints in Admin.",
      "Add strand rows for the cable after the span is reviewed.",
      "Only materialize the span when it should become a planned module record.",
    ],
    requiredFields: ["cable_id", "a_end_structure_id", "z_end_structure_id", "fiber_type", "fiber_count", "route_status"],
    validation: ["A-end and Z-end exist.", "Route geometry is present.", "Fiber count matches generated strand count.", "Assumption status is not treated as active fiber."],
  },
  {
    title: "Resplice an existing service",
    module: "Splice Matrix",
    moduleHref: "/splice-matrix",
    summary: "Keep the existing splice matrix intact and add proposed rows next to it for engineering review.",
    buttons: ["Guide", "Splicing and resplicing", "Create related examples", "Open Splice Matrix", "Issue work order"],
    steps: [
      "Select the splice closure or splice point on the map.",
      "Open the interactive splicing diagram or Splice Matrix module.",
      "Copy the affected existing rows into proposed rows instead of overwriting them.",
      "Set splice type, from/to cables, from/to strands, proposed loss, and affected services.",
      "Issue a work order with cutover, test, rollback, and evidence tasks.",
    ],
    requiredFields: ["splice_closure_id", "from_cable_id", "from_strand", "to_cable_id", "to_strand", "splice_type", "affected_service_ids", "proposed_loss_db"],
    validation: ["Existing rows remain read-only.", "Proposed rows are clearly marked.", "Affected services are linked.", "Work order includes field test evidence."],
  },
  {
    title: "Add a device, port, strand, and service",
    module: "Devices and Circuits",
    moduleHref: "/devices",
    summary: "Model a complete service assignment from endpoint device to LIU, fiber strand, splice path, and opposite endpoint.",
    buttons: ["Open database admin", "Patch panel template", "Device endpoint template", "Service assignment", "Fiber Trace"],
    steps: [
      "Create both substations/sites and both LIU or patch-panel records.",
      "Create endpoint devices and ports, then capture the LIU port each device lands on.",
      "Create or select cable and strand records, then reserve a strand pair or strand set.",
      "Attach splice IDs so continuity can be traced end-to-end.",
      "Create a service or circuit record with service type, criticality, endpoint devices, ports, strand IDs, and status.",
    ],
    requiredFields: ["a_end_device", "z_end_device", "a_end_port", "z_end_port", "a_end_liu_port", "z_end_liu_port", "strand_numbers", "splice_ids", "service_type"],
    validation: ["Endpoint ports are captured.", "Strands are reserved or assigned.", "Splice IDs exist.", "Continuity and loss are reviewed."],
  },
  {
    title: "Import data and turn it into editable records",
    module: "Import / Export",
    moduleHref: "/import-export",
    summary: "Use imports for public or synthetic data, then review records before materializing them into module tables.",
    buttons: ["Import / Export", "Validate", "Open database admin", "Install core schemas", "Capture module rows", "Replay selected snapshots"],
    steps: [
      "Import or validate CSV/GeoJSON through the Import / Export module.",
      "Keep public reference data separate from synthetic planning records.",
      "Use Database Admin to create object types for the imported fields you need to edit.",
      "Capture module snapshots when you need to preserve module data in Design Mode.",
      "Replay or materialize only reviewed synthetic/demo records.",
    ],
    requiredFields: ["source_name", "source_type", "validation_status", "record_count", "object_type", "materialization_mode", "review_notes"],
    validation: ["Source is public or synthetic.", "No CEII/private telecom data is entered.", "Validation status is captured.", "Materialization happens after review."],
  },
  {
    title: "Issue a work order from a design record",
    module: "Work Orders",
    moduleHref: "/work-orders",
    summary: "Turn any living design record into field or engineering work while keeping it linked to the original database object.",
    buttons: ["Record browser", "Issue work order", "Open work order", "Field closeout", "Save changes"],
    steps: [
      "Select the record in Database Admin or dashboard Design Mode.",
      "Confirm status, affected assets, required evidence, and work scope.",
      "Click Issue work order to generate default review, verification, closeout, and engineering tasks.",
      "Use the work order page for assignment, field notes, evidence, and closeout.",
      "After engineering review, update the design record status to planned, active, or as-built as appropriate.",
    ],
    requiredFields: ["record_key", "work_type", "priority", "assigned_scope", "required_evidence", "closeout_status", "engineering_review"],
    validation: ["Work order links back to source record.", "Evidence requirements are clear.", "As-built status is not set before review.", "Synthetic/data boundary remains visible."],
  },
  {
    title: "Make edits to living data safely",
    module: "Database Admin",
    moduleHref: "/admin/database",
    summary: "Use a proposed change package when you need to correct or update an existing module record without directly overwriting reviewed data.",
    buttons: ["Guide Module", "Stage live-data edit", "Open Design records", "Issue work order", "Save changes", "Materialize selected to backend"],
    steps: [
      "Find the existing record in its module and copy its stable record ID or display key.",
      "Open this Guide module and use Stage live-data edit with the target module, record ID, requested change, rollback plan, and evidence requirements.",
      "Open Dashboard Design Mode or Database Admin to review the proposed change package.",
      "Issue a work order when field verification, photos, redlines, tests, or approvals are needed.",
      "After review and closeout, materialize only the approved synthetic/demo change into the appropriate module table.",
    ],
    requiredFields: ["target_module", "target_record_id", "change_type", "requested_change", "rollback_plan", "evidence_required", "approval_status"],
    validation: ["Target record is referenced.", "Existing values are preserved for rollback.", "Review and evidence are required.", "Materialization happens only after approval."],
  },
];

const guideModuleAssetTypes: GuideAssetType[] = [
  {
    slug: "guide-module-playbook",
    display_name: "Guide module playbook",
    description: "Synthetic guide module records that document how to add information through the UI.",
    geometry_type: "table_only",
    searchable_fields: ["workflow", "module", "status", "summary"],
    map_style: {},
    fields: [
      { name: "workflow", label: "Workflow", type: "string", required: true },
      { name: "module", label: "Module", type: "string", required: true },
      { name: "summary", label: "Summary", type: "textarea" },
      { name: "ui_buttons", label: "UI buttons", type: "json" },
      { name: "required_fields", label: "Required fields", type: "json" },
      { name: "validation_checks", label: "Validation checks", type: "json" },
      { name: "status", label: "Status", type: "enum", enum_options: ["guide", "proposed", "planned", "reviewed"], required: true },
    ],
  },
  {
    slug: "guide-live-pole-insert",
    display_name: "Guide live pole insertion",
    description: "Staged synthetic design record for inserting a new pole/support into a preexisting pole line.",
    geometry_type: "point",
    searchable_fields: ["pole_line_id", "new_pole_id", "insert_between", "cable_id", "status"],
    map_style: { color: "#22c55e", radius: 8, fillOpacity: 0.26 },
    fields: [
      { name: "pole_line_id", label: "Pole line ID", type: "string", required: true },
      { name: "new_pole_id", label: "New pole ID", type: "string", required: true },
      { name: "insert_between", label: "Insert between", type: "string", required: true },
      { name: "cable_id", label: "Cable ID", type: "string" },
      { name: "latitude", label: "Latitude", type: "number" },
      { name: "longitude", label: "Longitude", type: "number" },
      { name: "status", label: "Status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
      { name: "review_notes", label: "Review notes", type: "textarea" },
    ],
  },
  {
    slug: "guide-live-span-split",
    display_name: "Guide split span section",
    description: "Staged synthetic span records created when a new pole is inserted into an existing pole line.",
    geometry_type: "table_only",
    searchable_fields: ["original_span_id", "new_span_id", "a_end", "z_end", "cable_id"],
    map_style: {},
    fields: [
      { name: "original_span_id", label: "Original span ID", type: "string", required: true },
      { name: "new_span_id", label: "New span ID", type: "string", required: true },
      { name: "a_end", label: "A-end", type: "string", required: true },
      { name: "z_end", label: "Z-end", type: "string", required: true },
      { name: "cable_id", label: "Cable ID", type: "string" },
      { name: "edit_status", label: "Edit status", type: "enum", enum_options: ["proposed", "planned", "field_verify"], required: true },
    ],
  },
  {
    slug: "guide-live-splice-insert",
    display_name: "Guide splice insertion",
    description: "Staged synthetic splice closure or splice point insertion on a cable/span.",
    geometry_type: "point",
    searchable_fields: ["splice_id", "cable_id", "pole_id", "splice_type", "status"],
    map_style: { color: "#f59e0b", radius: 9, fillOpacity: 0.32 },
    fields: [
      { name: "splice_id", label: "Splice ID", type: "string", required: true },
      { name: "cable_id", label: "Cable ID", type: "string", required: true },
      { name: "pole_id", label: "Pole or structure ID", type: "string" },
      { name: "splice_type", label: "Splice type", type: "enum", enum_options: ["straight_through", "tap", "branch", "terminal", "resplice"], required: true },
      { name: "affected_strands", label: "Affected strands", type: "json" },
      { name: "affected_services", label: "Affected services", type: "json" },
      { name: "status", label: "Status", type: "enum", enum_options: ["proposed", "planned", "in_review", "as_built"], required: true },
    ],
  },
  {
    slug: "guide-live-splice-row",
    display_name: "Guide proposed splice row",
    description: "Staged synthetic splice matrix row for proposed splice/resplice work.",
    geometry_type: "table_only",
    searchable_fields: ["splice_id", "from_cable_id", "from_strand", "to_cable_id", "to_strand", "row_status"],
    map_style: {},
    fields: [
      { name: "splice_id", label: "Splice ID", type: "string", required: true },
      { name: "from_cable_id", label: "From cable ID", type: "string", required: true },
      { name: "from_strand", label: "From strand", type: "integer", required: true },
      { name: "to_cable_id", label: "To cable ID", type: "string", required: true },
      { name: "to_strand", label: "To strand", type: "integer", required: true },
      { name: "splice_type", label: "Splice type", type: "string" },
      { name: "estimated_loss_db", label: "Estimated loss dB", type: "number" },
      { name: "row_status", label: "Row status", type: "enum", enum_options: ["existing_reference", "proposed", "approved", "installed"], required: true },
    ],
  },
  {
    slug: "guide-live-data-edit",
    display_name: "Guide live data edit package",
    description: "Safe staged change record for editing existing living data through review/work-order workflow.",
    geometry_type: "table_only",
    searchable_fields: ["target_module", "target_record_id", "change_type", "approval_status"],
    map_style: {},
    fields: [
      { name: "target_module", label: "Target module", type: "string", required: true },
      { name: "target_record_id", label: "Target record ID", type: "string", required: true },
      { name: "change_type", label: "Change type", type: "enum", enum_options: ["add", "modify", "retire", "resplice", "field_correct"], required: true },
      { name: "requested_change", label: "Requested change", type: "textarea", required: true },
      { name: "approval_status", label: "Approval status", type: "enum", enum_options: ["draft", "needs_review", "approved_for_work", "rejected", "closed"], required: true },
      { name: "rollback_plan", label: "Rollback plan", type: "textarea" },
      { name: "evidence_required", label: "Evidence required", type: "json" },
    ],
  },
];

function guideModuleRecords(): GuideRecord[] {
  return guideWorkflows.map((workflow, index) => ({
    asset_type_slug: "guide-module-playbook",
    record_key: `GUIDE-MODULE-${String(index + 1).padStart(2, "0")}`,
    display_label: workflow.title,
    status: "planned",
    properties: {
      workflow: workflow.title,
      module: workflow.module,
      summary: workflow.summary,
      ui_buttons: workflow.buttons,
      required_fields: workflow.requiredFields,
      validation_checks: workflow.validation,
      status: "guide",
      synthetic_data_notice: "Guide module records are synthetic/demo planning records only.",
    },
    geometry: null,
    source: "synthetic_demo",
    visibility: "synthetic-demo",
    notes: "Created from the Guide module. This is documentation-as-data for no-code database edits.",
  }));
}

const defaultPoleInsertDraft = {
  poleLineId: "SYN-POLE-LINE-WBS-001",
  existingAEndPoleId: "SYN-PL-WBS-001-P014",
  existingZEndPoleId: "SYN-PL-WBS-001-P015",
  originalSpanId: "SYN-SPAN-WBS-014-015",
  newPoleId: "SYN-PL-WBS-001-P014A",
  cableId: "SYN-ADSS-WBS-FDR-144F",
  latitude: "42.2626",
  longitude: "-71.8023",
  reason: "Insert intermediate support for synthetic fiber slack and splice planning.",
};

const defaultSpliceInsertDraft = {
  spliceId: "SYN-SPLICE-WBS-014A",
  cableId: "SYN-ADSS-WBS-FDR-144F",
  poleId: "SYN-PL-WBS-001-P014A",
  spliceType: "tap",
  affectedStrands: "1, 2, 3, 4",
  affectedServices: "SCADA-WBS-FDR-101",
  latitude: "42.2626",
  longitude: "-71.8023",
  reason: "Add proposed splice case for synthetic tap/branch design.",
};

const defaultLiveEditDraft = {
  targetModule: "Distribution Network",
  targetRecordId: "SYN-PL-WBS-001-P014",
  changeType: "field_correct",
  requestedChange: "Update synthetic pole attachment status and add slack loop note after field review.",
  rollbackPlan: "Keep previous values in history and revert to prior attachment/slack fields if engineering review rejects this change.",
  evidenceRequired: "field photo, redline sketch, continuity test",
};

function buildGuideActionRecords(
  action: "pole-insert" | "splice-insert" | "live-edit",
  poleInsertDraft: typeof defaultPoleInsertDraft,
  spliceInsertDraft: typeof defaultSpliceInsertDraft,
  liveEditDraft: typeof defaultLiveEditDraft,
): GuideRecord[] {
  const now = Date.now().toString(36).toUpperCase();
  if (action === "pole-insert") {
    const insertBetween = `${poleInsertDraft.existingAEndPoleId} -> ${poleInsertDraft.existingZEndPoleId}`;
    const splitSpanA = `${poleInsertDraft.originalSpanId}-A-${safeRecordKeyPart(poleInsertDraft.newPoleId)}`;
    const splitSpanZ = `${poleInsertDraft.originalSpanId}-${safeRecordKeyPart(poleInsertDraft.newPoleId)}-Z`;
    return [
      {
        asset_type_slug: "guide-live-pole-insert",
        record_key: `GUIDE-POLE-INSERT-${safeRecordKeyPart(poleInsertDraft.newPoleId)}-${now}`,
        display_label: `Insert ${poleInsertDraft.newPoleId} into ${poleInsertDraft.poleLineId}`,
        status: "proposed",
        properties: {
          pole_line_id: poleInsertDraft.poleLineId,
          new_pole_id: poleInsertDraft.newPoleId,
          insert_between: insertBetween,
          cable_id: poleInsertDraft.cableId,
          latitude: Number.parseFloat(poleInsertDraft.latitude),
          longitude: Number.parseFloat(poleInsertDraft.longitude),
          status: "proposed",
          review_notes: poleInsertDraft.reason,
          original_span_id: poleInsertDraft.originalSpanId,
          split_span_ids: [splitSpanA, splitSpanZ],
          edit_rule: "stage_new_pole_and_split_span_records_before_materialization",
        },
        geometry: guidePointGeometry(poleInsertDraft.longitude, poleInsertDraft.latitude),
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Proposed pole insertion. Does not overwrite the existing pole line until reviewed and materialized.",
      },
      {
        asset_type_slug: "guide-live-span-split",
        record_key: `GUIDE-SPAN-SPLIT-A-${safeRecordKeyPart(poleInsertDraft.newPoleId)}-${now}`,
        display_label: `Split span ${poleInsertDraft.existingAEndPoleId} to ${poleInsertDraft.newPoleId}`,
        status: "proposed",
        properties: {
          original_span_id: poleInsertDraft.originalSpanId,
          new_span_id: splitSpanA,
          a_end: poleInsertDraft.existingAEndPoleId,
          z_end: poleInsertDraft.newPoleId,
          cable_id: poleInsertDraft.cableId,
          edit_status: "proposed",
          replaces_part_of_span: poleInsertDraft.originalSpanId,
        },
        geometry: null,
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "First proposed split-span segment created by inserting a pole into an existing pole line.",
      },
      {
        asset_type_slug: "guide-live-span-split",
        record_key: `GUIDE-SPAN-SPLIT-Z-${safeRecordKeyPart(poleInsertDraft.newPoleId)}-${now}`,
        display_label: `Split span ${poleInsertDraft.newPoleId} to ${poleInsertDraft.existingZEndPoleId}`,
        status: "proposed",
        properties: {
          original_span_id: poleInsertDraft.originalSpanId,
          new_span_id: splitSpanZ,
          a_end: poleInsertDraft.newPoleId,
          z_end: poleInsertDraft.existingZEndPoleId,
          cable_id: poleInsertDraft.cableId,
          edit_status: "proposed",
          replaces_part_of_span: poleInsertDraft.originalSpanId,
        },
        geometry: null,
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Second proposed split-span segment created by inserting a pole into an existing pole line.",
      },
      {
        asset_type_slug: "guide-live-data-edit",
        record_key: `GUIDE-CHANGE-POLE-INSERT-${safeRecordKeyPart(poleInsertDraft.newPoleId)}-${now}`,
        display_label: `Review pole insertion ${poleInsertDraft.newPoleId}`,
        status: "proposed",
        properties: {
          target_module: "Distribution Network",
          target_record_id: poleInsertDraft.originalSpanId,
          change_type: "add",
          requested_change: `Insert ${poleInsertDraft.newPoleId} between ${insertBetween} and split ${poleInsertDraft.originalSpanId}.`,
          approval_status: "needs_review",
          rollback_plan: "Reject/delete proposed insertion records and keep original span active if review fails.",
          evidence_required: ["field photo", "make-ready review", "as-built pole location", "span continuity validation"],
        },
        geometry: null,
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Review package for a safe pole-line edit.",
      },
    ];
  }

  if (action === "splice-insert") {
    const strands = parseGuideList(spliceInsertDraft.affectedStrands);
    const services = parseGuideList(spliceInsertDraft.affectedServices);
    const spliceRows = strands.slice(0, 12).map((strand, index): GuideRecord => ({
      asset_type_slug: "guide-live-splice-row",
      record_key: `GUIDE-SPLICE-ROW-${safeRecordKeyPart(spliceInsertDraft.spliceId)}-${String(index + 1).padStart(2, "0")}-${now}`,
      display_label: `${spliceInsertDraft.spliceId} proposed strand ${strand}`,
      status: "proposed",
      properties: {
        splice_id: spliceInsertDraft.spliceId,
        from_cable_id: spliceInsertDraft.cableId,
        from_strand: Number.parseInt(strand, 10) || index + 1,
        to_cable_id: spliceInsertDraft.cableId,
        to_strand: Number.parseInt(strand, 10) || index + 1,
        splice_type: spliceInsertDraft.spliceType,
        estimated_loss_db: 0.06,
        row_status: "proposed",
        affected_services: services,
      },
      geometry: null,
      source: "synthetic_demo",
      visibility: "synthetic-demo",
      notes: "Proposed splice matrix row. Existing splice rows should remain unchanged until approval.",
    }));
    return [
      {
        asset_type_slug: "guide-live-splice-insert",
        record_key: `GUIDE-SPLICE-INSERT-${safeRecordKeyPart(spliceInsertDraft.spliceId)}-${now}`,
        display_label: `Insert splice ${spliceInsertDraft.spliceId} on ${spliceInsertDraft.cableId}`,
        status: "proposed",
        properties: {
          splice_id: spliceInsertDraft.spliceId,
          cable_id: spliceInsertDraft.cableId,
          pole_id: spliceInsertDraft.poleId,
          splice_type: spliceInsertDraft.spliceType,
          affected_strands: strands,
          affected_services: services,
          latitude: Number.parseFloat(spliceInsertDraft.latitude),
          longitude: Number.parseFloat(spliceInsertDraft.longitude),
          status: "proposed",
          review_notes: spliceInsertDraft.reason,
          edit_rule: "create_proposed_splice_rows_without_overwriting_existing_matrix",
        },
        geometry: guidePointGeometry(spliceInsertDraft.longitude, spliceInsertDraft.latitude),
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Proposed splice insertion. Review in Splice Matrix before issuing field work.",
      },
      ...spliceRows,
      {
        asset_type_slug: "guide-live-data-edit",
        record_key: `GUIDE-CHANGE-SPLICE-${safeRecordKeyPart(spliceInsertDraft.spliceId)}-${now}`,
        display_label: `Review splice insertion ${spliceInsertDraft.spliceId}`,
        status: "proposed",
        properties: {
          target_module: "Splice Matrix",
          target_record_id: spliceInsertDraft.spliceId,
          change_type: "resplice",
          requested_change: `Insert ${spliceInsertDraft.spliceType} splice ${spliceInsertDraft.spliceId} on ${spliceInsertDraft.cableId}.`,
          approval_status: "needs_review",
          rollback_plan: "Remove proposed splice rows and keep existing splice matrix active if review fails.",
          evidence_required: ["splice photo", "splice sheet", "loss test", "affected service validation"],
        },
        geometry: null,
        source: "synthetic_demo",
        visibility: "synthetic-demo",
        notes: "Review package for proposed splice work.",
      },
    ];
  }

  return [
    {
      asset_type_slug: "guide-live-data-edit",
      record_key: `GUIDE-LIVE-EDIT-${safeRecordKeyPart(liveEditDraft.targetRecordId)}-${now}`,
      display_label: `Edit ${liveEditDraft.targetModule} record ${liveEditDraft.targetRecordId}`,
      status: "proposed",
      properties: {
        target_module: liveEditDraft.targetModule,
        target_record_id: liveEditDraft.targetRecordId,
        change_type: liveEditDraft.changeType,
        requested_change: liveEditDraft.requestedChange,
        approval_status: "draft",
        rollback_plan: liveEditDraft.rollbackPlan,
        evidence_required: parseGuideList(liveEditDraft.evidenceRequired),
        edit_rule: "stage_change_before_modifying_living_or_materialized_data",
      },
      geometry: null,
      source: "synthetic_demo",
      visibility: "synthetic-demo",
      notes: "Safe staged change package for living data. Review, approve, and materialize only after verification.",
    },
  ];
}

function guideActionLabel(action: "pole-insert" | "splice-insert" | "live-edit") {
  if (action === "pole-insert") return "Pole insertion";
  if (action === "splice-insert") return "Splice insertion";
  return "Live-data edit";
}

function safeRecordKeyPart(value: string) {
  const part = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return part || "RECORD";
}

function parseGuideList(value: string) {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function guidePointGeometry(longitude: string, latitude: string): DesignAssetGeoJsonGeometry {
  const lon = Number.parseFloat(longitude);
  const lat = Number.parseFloat(latitude);
  return { type: "Point", coordinates: [Number.isFinite(lon) ? lon : -71.8023, Number.isFinite(lat) ? lat : 42.2626] };
}

export function GuideModulePage() {
  const writable = canWrite();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [poleInsertDraft, setPoleInsertDraft] = useState(defaultPoleInsertDraft);
  const [spliceInsertDraft, setSpliceInsertDraft] = useState(defaultSpliceInsertDraft);
  const [liveEditDraft, setLiveEditDraft] = useState(defaultLiveEditDraft);
  const [implementationGuide, setImplementationGuide] = useState<ImplementationGuidePayload | null>(null);
  const [implementationGuideError, setImplementationGuideError] = useState("");
  const starterRecordCount = useMemo(() => guideModuleRecords().length, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ImplementationGuidePayload>("/api/implementation-guide")
      .then((payload) => {
        if (!cancelled) setImplementationGuide(payload);
      })
      .catch((error) => {
        if (!cancelled) setImplementationGuideError(error instanceof Error ? error.message : "Could not load backend implementation guide.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createGuideRecords() {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiFetch<{ created_records?: number; updated_records?: number; created_asset_types?: number; updated_asset_types?: number }>("/api/design-assets/blueprint/import", {
        method: "POST",
        body: JSON.stringify({
          blueprint_version: "gridassetlink-guide-module-v1",
          synthetic_data_notice: "Guide module records are synthetic/demo planning records only.",
          mode: "upsert",
          asset_types: guideModuleAssetTypes,
          records: guideModuleRecords(),
        }),
      });
      setMessage(`Guide module records saved: ${result.created_records || 0} created, ${result.updated_records || 0} updated, ${result.created_asset_types || 0} schemas created, ${result.updated_asset_types || 0} schemas updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create guide module records.");
    } finally {
      setBusy(false);
    }
  }

  function updatePoleInsert(field: keyof typeof defaultPoleInsertDraft, value: string) {
    setPoleInsertDraft((current) => ({ ...current, [field]: value }));
  }

  function updateSpliceInsert(field: keyof typeof defaultSpliceInsertDraft, value: string) {
    setSpliceInsertDraft((current) => ({ ...current, [field]: value }));
  }

  function updateLiveEdit(field: keyof typeof defaultLiveEditDraft, value: string) {
    setLiveEditDraft((current) => ({ ...current, [field]: value }));
  }

  async function runGuideAction(action: "pole-insert" | "splice-insert" | "live-edit") {
    setActionBusy(action);
    setMessage("");
    try {
      const records = buildGuideActionRecords(action, poleInsertDraft, spliceInsertDraft, liveEditDraft);
      const result = await apiFetch<{ created_records?: number; updated_records?: number; created_asset_types?: number; updated_asset_types?: number }>("/api/design-assets/blueprint/import", {
        method: "POST",
        body: JSON.stringify({
          blueprint_version: "gridassetlink-guide-actions-v1",
          synthetic_data_notice: "Guide action records stage synthetic/demo database edits only.",
          mode: "upsert",
          asset_types: guideModuleAssetTypes,
          records,
        }),
      });
      setMessage(`${guideActionLabel(action)} staged: ${result.created_records || 0} created, ${result.updated_records || 0} updated. Open Dashboard Design Mode to review the records and issue work orders.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not run ${guideActionLabel(action)}.`);
    } finally {
      setActionBusy("");
    }
  }

  return (
    <>
      <div className="page-header guide-module-header">
        <div>
          <h1 className="eyebrowless-title">Guide Module</h1>
          <div className="subtle">No-code playbook for adding and editing synthetic GridAssetLink database information.</div>
        </div>
        <div className="toolbar">
          <button className="button primary" type="button" onClick={() => void createGuideRecords()} disabled={!writable || busy}>
            <Save size={16} />{busy ? "Saving..." : `Create ${starterRecordCount} guide records`}
          </button>
          <Link className="button" href="/dashboard?drawer=guide"><BookOpen size={16} />Dashboard Guide</Link>
          <Link className="button" href="/admin/database"><Database size={16} />Database Admin</Link>
        </div>
      </div>

      <section className="panel guide-module-safety">
        <div className="panel-body">
          <strong>Synthetic/demo data boundary</strong>
          <span>Use this module for synthetic planning data and UI-driven edits only. Make edits to living data by staging proposed Design Mode records, issuing work orders, and reviewing closeout before materialization. Do not enter CEII, SCADA, relay/protection settings, operational telecom access, credentials, or private fiber-route details.</span>
          {message ? <span className="badge active">{message}</span> : null}
          {!writable ? <span className="badge red">This no-account demo is currently read-only. Check backend write settings before creating guide records.</span> : null}
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>Define these parameters before database integration</strong>
            <div className="subtle">Use this checklist whenever you add poles, spans, splices, strands, patch panels, devices, services, imports, or custom objects.</div>
          </div>
          <Database size={18} />
        </div>
        <div className="panel-body">
          <div className="guide-integration-grid">
            {databaseIntegrationParameterGroups.map((group) => (
              <article key={group.title}>
                <strong>{group.title}</strong>
                <span>{group.description}</span>
                <div className="guide-chip-list">{group.requiredParameters.map((parameter) => <span key={parameter}>{parameter}</span>)}</div>
                <ul>{group.interactionTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="guide-integration-paths">
            <strong>How database objects interact with the rest of the tool</strong>
            <div>
              {databaseObjectInteractionPaths.map((path) => (
                <article key={path.title}>
                  <strong>{path.title}</strong>
                  <span>{path.summary}</span>
                  <div className="guide-chip-list">{path.linkedObjects.map((object) => <span key={object}>{object}</span>)}</div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>{implementationGuide?.title || "Backend Product Implementation Guide"}</strong>
            <div className="subtle">Loaded from <code>/api/implementation-guide</code> so the product handoff can be served and versioned by the backend.</div>
          </div>
          <BookOpen size={18} />
        </div>
        <div className="panel-body">
          {implementationGuide ? (
            <div className="guide-implementation">
              <div className="guide-implementation-hero">
                <div>
                  <span className="field-label">Version</span>
                  <strong>{implementationGuide.version}</strong>
                  <p>{implementationGuide.purpose}</p>
                </div>
                <div>
                  <span className="field-label">No-account mode</span>
                  <strong>{implementationGuide.no_account_mode.enabled ? "Enabled" : "Disabled"}</strong>
                  <p>{implementationGuide.no_account_mode.summary}</p>
                </div>
              </div>
              <div className="guide-action-review">
                <strong>Data boundary</strong>
                <span>{implementationGuide.disclaimer}</span>
              </div>
              <div className="guide-chip-list">
                {implementationGuide.no_account_mode.rules.map((rule) => <span key={rule}>{rule}</span>)}
              </div>
              <div className="guide-implementation-section">
                <h2>Fresh-start build phases</h2>
                <div className="guide-implementation-phase-list">
                  {implementationGuide.fresh_start_phases.map((phase) => (
                    <article key={phase.title}>
                      <strong>{phase.title}</strong>
                      <span>{phase.summary}</span>
                      <div className="guide-workflow-columns">
                        <div>
                          <strong>Steps</strong>
                          <ol>{phase.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                        </div>
                        <div>
                          <strong>Deliverables</strong>
                          <ul>{phase.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}</ul>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div className="guide-implementation-section">
                <h2>Database domains</h2>
                <div className="guide-implementation-grid">
                  {implementationGuide.database_domains.map((domain) => (
                    <article key={domain.name}>
                      <strong>{domain.name}</strong>
                      <span>{domain.rule}</span>
                      <div className="guide-chip-list">{domain.objects.map((object) => <span key={object}>{object}</span>)}</div>
                    </article>
                  ))}
                </div>
              </div>
              <div className="guide-implementation-section">
                <h2>Core workflows and backend APIs</h2>
                <div className="guide-implementation-grid">
                  {implementationGuide.core_workflows.map((workflow) => (
                    <article key={workflow.name}>
                      <strong>{workflow.name}</strong>
                      <span>Records to create</span>
                      <div className="guide-chip-list">{workflow.records.map((record) => <span key={record}>{record}</span>)}</div>
                      <span>Review checks</span>
                      <ul>{workflow.review.map((item) => <li key={item}>{item}</li>)}</ul>
                    </article>
                  ))}
                  {implementationGuide.api_surfaces.map((surface) => (
                    <article key={surface.area}>
                      <strong>{surface.area} API</strong>
                      <ul>{surface.routes.map((route) => <li key={route}><code>{route}</code></li>)}</ul>
                    </article>
                  ))}
                </div>
              </div>
              <div className="guide-implementation-section">
                <h2>Product handoff checklist</h2>
                <div className="guide-checklist-grid">
                  {implementationGuide.handoff_checklist.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
              <div className="guide-module-flow">
                <article>
                  <strong>Backend markdown</strong>
                  <span>Open <code>/api/implementation-guide/markdown</code> when you need a plain-text implementation package for handoff notes, release packets, or external documentation.</span>
                </article>
                <article>
                  <strong>Repository documentation</strong>
                  <span>The same implementation story is also captured in <code>docs/product_implementation_guide.md</code> for developers working directly from the repo.</span>
                </article>
              </div>
            </div>
          ) : (
            <p className="subtle">{implementationGuideError || "Loading backend implementation guide..."}</p>
          )}
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>Guided database actions</strong>
            <div className="subtle">Use these forms to stage common edits without writing records by hand. Each action creates proposed Design Mode records for review.</div>
          </div>
          <Plus size={18} />
        </div>
        <div className="panel-body">
          <div className="guide-action-grid">
            <article>
              <div className="guide-action-heading">
                <Waypoints size={18} />
                <div>
                  <strong>Insert a pole into a preexisting pole line</strong>
                  <span>Creates the proposed pole plus two split-span records so the old span is not overwritten.</span>
                </div>
              </div>
              <div className="guide-action-form">
                <label><span className="field-label">Pole line ID</span><input className="input" value={poleInsertDraft.poleLineId} onChange={(event) => updatePoleInsert("poleLineId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Existing A-end pole</span><input className="input" value={poleInsertDraft.existingAEndPoleId} onChange={(event) => updatePoleInsert("existingAEndPoleId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Existing Z-end pole</span><input className="input" value={poleInsertDraft.existingZEndPoleId} onChange={(event) => updatePoleInsert("existingZEndPoleId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Original span ID</span><input className="input" value={poleInsertDraft.originalSpanId} onChange={(event) => updatePoleInsert("originalSpanId", event.currentTarget.value)} /></label>
                <label><span className="field-label">New pole ID</span><input className="input" value={poleInsertDraft.newPoleId} onChange={(event) => updatePoleInsert("newPoleId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Cable ID</span><input className="input" value={poleInsertDraft.cableId} onChange={(event) => updatePoleInsert("cableId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Latitude</span><input className="input" type="number" step="0.000001" value={poleInsertDraft.latitude} onChange={(event) => updatePoleInsert("latitude", event.currentTarget.value)} /></label>
                <label><span className="field-label">Longitude</span><input className="input" type="number" step="0.000001" value={poleInsertDraft.longitude} onChange={(event) => updatePoleInsert("longitude", event.currentTarget.value)} /></label>
                <label className="guide-action-wide"><span className="field-label">Reason</span><textarea className="textarea" value={poleInsertDraft.reason} onChange={(event) => updatePoleInsert("reason", event.currentTarget.value)} /></label>
              </div>
              <div className="guide-action-review">
                <strong>What this stages</strong>
                <span>New pole record, split span A-to-new, split span new-to-Z, review checks, and work-order-ready notes.</span>
              </div>
              <button className="button primary" type="button" onClick={() => void runGuideAction("pole-insert")} disabled={!writable || Boolean(actionBusy)}>
                <Plus size={15} />{actionBusy === "pole-insert" ? "Staging..." : "Stage pole insertion"}
              </button>
            </article>

            <article>
              <div className="guide-action-heading">
                <Split size={18} />
                <div>
                  <strong>Insert splice work on a cable/span</strong>
                  <span>Creates a proposed splice point and associated proposed splice rows for engineering review.</span>
                </div>
              </div>
              <div className="guide-action-form">
                <label><span className="field-label">Splice ID</span><input className="input" value={spliceInsertDraft.spliceId} onChange={(event) => updateSpliceInsert("spliceId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Cable ID</span><input className="input" value={spliceInsertDraft.cableId} onChange={(event) => updateSpliceInsert("cableId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Pole or structure ID</span><input className="input" value={spliceInsertDraft.poleId} onChange={(event) => updateSpliceInsert("poleId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Splice type</span><select className="select" value={spliceInsertDraft.spliceType} onChange={(event) => updateSpliceInsert("spliceType", event.currentTarget.value)}>
                  <option value="straight_through">Straight through</option>
                  <option value="tap">Tap</option>
                  <option value="branch">Branch</option>
                  <option value="terminal">Terminal</option>
                  <option value="resplice">Resplice</option>
                </select></label>
                <label><span className="field-label">Affected strands</span><input className="input" value={spliceInsertDraft.affectedStrands} onChange={(event) => updateSpliceInsert("affectedStrands", event.currentTarget.value)} /></label>
                <label><span className="field-label">Affected services</span><input className="input" value={spliceInsertDraft.affectedServices} onChange={(event) => updateSpliceInsert("affectedServices", event.currentTarget.value)} /></label>
                <label><span className="field-label">Latitude</span><input className="input" type="number" step="0.000001" value={spliceInsertDraft.latitude} onChange={(event) => updateSpliceInsert("latitude", event.currentTarget.value)} /></label>
                <label><span className="field-label">Longitude</span><input className="input" type="number" step="0.000001" value={spliceInsertDraft.longitude} onChange={(event) => updateSpliceInsert("longitude", event.currentTarget.value)} /></label>
                <label className="guide-action-wide"><span className="field-label">Reason</span><textarea className="textarea" value={spliceInsertDraft.reason} onChange={(event) => updateSpliceInsert("reason", event.currentTarget.value)} /></label>
              </div>
              <div className="guide-action-review">
                <strong>What this stages</strong>
                <span>Proposed splice point, proposed row package, affected strands/services, loss/evidence placeholders, and work-order-ready notes.</span>
              </div>
              <button className="button primary" type="button" onClick={() => void runGuideAction("splice-insert")} disabled={!writable || Boolean(actionBusy)}>
                <Plus size={15} />{actionBusy === "splice-insert" ? "Staging..." : "Stage splice insertion"}
              </button>
            </article>

            <article>
              <div className="guide-action-heading">
                <Database size={18} />
                <div>
                  <strong>Stage a safe edit to living data</strong>
                  <span>Creates a proposed change package instead of directly overwriting module or as-built records.</span>
                </div>
              </div>
              <div className="guide-action-form">
                <label><span className="field-label">Target module</span><input className="input" value={liveEditDraft.targetModule} onChange={(event) => updateLiveEdit("targetModule", event.currentTarget.value)} /></label>
                <label><span className="field-label">Target record ID</span><input className="input" value={liveEditDraft.targetRecordId} onChange={(event) => updateLiveEdit("targetRecordId", event.currentTarget.value)} /></label>
                <label><span className="field-label">Change type</span><select className="select" value={liveEditDraft.changeType} onChange={(event) => updateLiveEdit("changeType", event.currentTarget.value)}>
                  <option value="add">Add</option>
                  <option value="modify">Modify</option>
                  <option value="retire">Retire</option>
                  <option value="resplice">Resplice</option>
                  <option value="field_correct">Field correction</option>
                </select></label>
                <label className="guide-action-wide"><span className="field-label">Requested change</span><textarea className="textarea" value={liveEditDraft.requestedChange} onChange={(event) => updateLiveEdit("requestedChange", event.currentTarget.value)} /></label>
                <label className="guide-action-wide"><span className="field-label">Rollback plan</span><textarea className="textarea" value={liveEditDraft.rollbackPlan} onChange={(event) => updateLiveEdit("rollbackPlan", event.currentTarget.value)} /></label>
                <label className="guide-action-wide"><span className="field-label">Evidence required</span><input className="input" value={liveEditDraft.evidenceRequired} onChange={(event) => updateLiveEdit("evidenceRequired", event.currentTarget.value)} /></label>
              </div>
              <div className="guide-action-review">
                <strong>What this stages</strong>
                <span>Draft change request, target record reference, approval gate, rollback plan, and evidence checklist.</span>
              </div>
              <button className="button primary" type="button" onClick={() => void runGuideAction("live-edit")} disabled={!writable || Boolean(actionBusy)}>
                <Plus size={15} />{actionBusy === "live-edit" ? "Staging..." : "Stage live-data edit"}
              </button>
            </article>
          </div>
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>How information gets added</strong>
            <div className="subtle">Think of every database edit as a small, reviewable design record.</div>
          </div>
          <Plus size={18} />
        </div>
        <div className="panel-body">
          <div className="guide-module-flow">
            {[
              ["1. Pick a module", "Start from the page that owns the thing you are designing: poles, fiber, splices, patch panels, devices, services, or work orders."],
              ["2. Pick or create an object type", "Use a template or Type Designer to define the fields users should fill in. This creates the form."],
              ["3. Add a record", "Fill the generated fields, draw or enter map placement, and save the object as proposed or planned."],
              ["4. Link related records", "Connect cable IDs, strand numbers, splice IDs, device ports, LIU ports, services, and work orders."],
              ["5. Review and issue work", "Validate conflicts, reserve resources, issue a work order, and keep evidence attached to the work."],
              ["6. Materialize after review", "Only write supported design records into module tables after engineering review. Synthetic assumptions are not active assets."],
            ].map(([title, body]) => (
              <article key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>Objects you can add</strong>
            <div className="subtle">Use these as checklists when adding information to the living database.</div>
          </div>
          <Database size={18} />
        </div>
        <div className="panel-body">
          <div className="guide-object-grid">
            {guideObjectTypes.map(({ title, href, icon: Icon, fields, result }) => (
              <article key={title}>
                <div className="module-icon"><Icon size={18} /></div>
                <div>
                  <strong>{title}</strong>
                  <span>{result}</span>
                </div>
                <div className="guide-chip-list">
                  {fields.map((field) => <span key={field}>{field}</span>)}
                </div>
                <Link className="button" href={href}>Open module</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>Step-by-step workflows</strong>
            <div className="subtle">Each workflow names the exact information to capture and the UI buttons to use.</div>
          </div>
          <GitBranch size={18} />
        </div>
        <div className="panel-body">
          <div className="guide-workflow-list">
            {guideWorkflows.map((workflow) => (
              <article key={workflow.title}>
                <div className="guide-workflow-heading">
                  <div>
                    <strong>{workflow.title}</strong>
                    <span>{workflow.summary}</span>
                  </div>
                  <Link className="button" href={workflow.moduleHref}>Open {workflow.module}</Link>
                </div>
                <div className="guide-workflow-columns">
                  <div>
                    <strong>Buttons to use</strong>
                    <div className="guide-chip-list">{workflow.buttons.map((button) => <span key={button}>{button}</span>)}</div>
                  </div>
                  <div>
                    <strong>Information to capture</strong>
                    <div className="guide-chip-list">{workflow.requiredFields.map((field) => <span key={field}>{field}</span>)}</div>
                  </div>
                </div>
                <div className="guide-workflow-columns">
                  <div>
                    <strong>Steps</strong>
                    <ol>{workflow.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  </div>
                  <div>
                    <strong>Review checks</strong>
                    <ul>{workflow.validation.map((check) => <li key={check}>{check}</li>)}</ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel guide-module-section">
        <div className="panel-header">
          <div>
            <strong>Quick links for adding information</strong>
            <div className="subtle">Use these modules when you want to enter, inspect, trace, or assign records.</div>
          </div>
          <Map size={18} />
        </div>
        <div className="panel-body">
          <div className="guide-quick-link-grid">
            <Link className="module-card" href="/dashboard?drawer=design"><span className="module-icon"><Map size={18} /></span><span><span className="field-label">Map editing</span><strong>Dashboard Design Mode</strong><span className="subtle">Draw records and edit fields from the map.</span></span></Link>
            <Link className="module-card" href="/admin/database"><span className="module-icon"><Database size={18} /></span><span><span className="field-label">Database</span><strong>Database Admin</strong><span className="subtle">Create object types, records, work orders, and templates.</span></span></Link>
            <Link className="module-card" href="/fiber-strand-table"><span className="module-icon"><TableProperties size={18} /></span><span><span className="field-label">Strands</span><strong>Fiber Strand Table</strong><span className="subtle">Reserve, assign, release, and view continuity.</span></span></Link>
            <Link className="module-card" href="/splice-matrix"><span className="module-icon"><Split size={18} /></span><span><span className="field-label">Splicing</span><strong>Splice Matrix</strong><span className="subtle">View existing/proposed rows and resplice paths.</span></span></Link>
            <Link className="module-card" href="/work-orders"><span className="module-icon"><ClipboardList size={18} /></span><span><span className="field-label">Work</span><strong>Work Orders</strong><span className="subtle">Issue field work and track closeout evidence.</span></span></Link>
            <Link className="module-card" href="/import-export"><span className="module-icon"><Upload size={18} /></span><span><span className="field-label">Import</span><strong>Import / Export</strong><span className="subtle">Validate public or synthetic datasets before use.</span></span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
