import type { FiberSplice, SyntheticService } from "@/lib/types/assets";
import {
  buildClosureToSplicePointId,
  buildSpliceManagerView,
  traceSyntheticService,
  type FiberContinuityData,
  type SpliceManagerViewModel,
} from "@/lib/opgw/continuityEngine";

export type SpliceMatrixLayer = "existing" | "proposed";

export type SpliceMatrixRecord = {
  spliceMatrixId: string;
  splicePointId: string;
  spliceClosureId?: string;
  matrixName: string;
  matrixVersion: string;
  layerType: SpliceMatrixLayer;
  status: "read_only" | "editable_demo" | "validation_preview" | "approved_preview" | "commit_preview";
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  committedAt?: string;
  supersededByMatrixId?: string;
  syntheticFlag: true;
  notes: string;
  connections: FiberSplice[];
};

const DEMO_NOW = "2026-06-07T00:00:00Z";
const FIBER_COLORS = ["Blue", "Orange", "Green", "Brown", "Slate", "White", "Red", "Black", "Yellow", "Violet", "Rose", "Aqua"];

export function matricesForSplicePoint(splicePointId: string, data: FiberContinuityData) {
  const view = buildSpliceManagerView(splicePointId, data);
  if (!view) return null;
  return {
    view,
    existingMatrix: makeMatrix(view, "existing"),
    proposedMatrix: makeMatrix(view, "proposed"),
  };
}

export function allSpliceMatrices(data: FiberContinuityData) {
  return data.opgwSplicePoints.flatMap((point) => {
    const matrices = matricesForSplicePoint(point.properties.splicePointId, data);
    return matrices ? [withoutConnections(matrices.existingMatrix), withoutConnections(matrices.proposedMatrix)] : [];
  });
}

export function findSpliceMatrix(matrixId: string, data: FiberContinuityData) {
  const normalizedId = decodeURIComponent(matrixId);
  for (const point of data.opgwSplicePoints) {
    const matrices = matricesForSplicePoint(point.properties.splicePointId, data);
    if (!matrices) continue;
    if (matrices.existingMatrix.spliceMatrixId === normalizedId) return matrices.existingMatrix;
    if (matrices.proposedMatrix.spliceMatrixId === normalizedId) return matrices.proposedMatrix;
  }
  return null;
}

export function allSpliceConnections(data: FiberContinuityData) {
  const closureToPoint = buildClosureToSplicePointId(data.opgwSplicePoints);
  return data.fiberSplices.map((connection) => {
    const splicePointId = closureToPoint.get(connection.spliceClosureId);
    const layerType = connection.status === "existing" ? "existing" : "proposed";
    const service = data.syntheticServices.find((item) => item.primaryPathAssignmentId === connection.assignmentId || item.backupPathAssignmentId === connection.assignmentId);
    return {
      ...connection,
      spliceConnectionId: connection.id,
      spliceMatrixId: splicePointId ? `MATRIX-${splicePointId}-${layerType.toUpperCase()}` : undefined,
      splicePointId,
      spliceClosureId: connection.spliceClosureId,
      fromCableSectionId: connection.fromCableId,
      fromStrandId: strandIdFor(connection.fromCableId, connection.fromStrandNumber),
      fromBufferTube: tubeNumber(connection.fromStrandNumber),
      fromStrandColor: strandColor(connection.fromStrandNumber),
      toCableSectionId: connection.toCableId,
      toStrandId: strandIdFor(connection.toCableId, connection.toStrandNumber),
      toBufferTube: tubeNumber(connection.toStrandNumber),
      toStrandColor: strandColor(connection.toStrandNumber),
      serviceId: service?.serviceId,
      connectionStatus: connection.status === "faulted" ? "faulted" : connection.spliceType === "open" ? "open" : connection.spliceType === "termination" ? "terminated" : connection.spliceType === "spare" ? "spare" : "connected",
      layerType,
      lossEstimateDb: connection.lossDb ?? 0,
      testResultDb: connection.status === "faulted" ? undefined : Number(((connection.lossDb ?? 0.06) + 0.01).toFixed(3)),
      syntheticFlag: true,
      readOnly: connection.status === "existing",
      notes: connection.notes || "Synthetic demo splice connection.",
    };
  });
}

export function findSyntheticService(serviceId: string, data: FiberContinuityData) {
  return data.syntheticServices.find((service) => service.serviceId === decodeURIComponent(serviceId));
}

export function serviceOutageImpact(service: SyntheticService, data: FiberContinuityData) {
  const continuity = traceSyntheticService(service, data);
  return {
    serviceId: service.serviceId,
    serviceName: service.serviceName,
    criticality: service.criticality,
    protectionLevel: service.protectionLevel,
    operationalStatus: service.operationalStatus,
    syntheticFlag: true,
    impactedTransmissionLines: continuity.segments
      .map((segment) => segment.transmissionLineId)
      .filter((lineId): lineId is string => Boolean(lineId)),
    impactedCableSections: continuity.segments
      .filter((segment) => segment.objectType === "cable_section")
      .map((segment) => segment.objectId),
    impactedSplicePoints: continuity.segments
      .filter((segment) => segment.objectType === "splice_point")
      .map((segment) => segment.objectId),
    estimatedLossDb: continuity.totalEstimatedLossDb,
    warningSummary: continuity.warningSummary,
    notes: "Synthetic outage-impact preview only. Not authoritative for operations, protection, SCADA, restoration, or CEII analysis.",
  };
}

export function buildDemoMutationResponse(action: string, payload: unknown, view?: SpliceManagerViewModel) {
  return {
    action,
    demoMode: true,
    persisted: false,
    acceptedForPreview: true,
    syntheticFlag: true,
    splicePointId: view?.splicePoint.properties.splicePointId,
    spliceClosureId: view?.closure?.properties.id || view?.splicePoint.properties.closureId,
    warning: "Synthetic demo only. Existing splice data remains read-only and no operational or persistent network change was made.",
    payload,
    updatedAt: DEMO_NOW,
  };
}

export function validateProposedMatrix(splicePointId: string, data: FiberContinuityData, payload: unknown) {
  const matrices = matricesForSplicePoint(splicePointId, data);
  if (!matrices) return null;
  const proposedConnections = proposedConnectionsFromPayload(payload, matrices.proposedMatrix.connections);
  const duplicateActive = findDuplicateActiveStrands([...matrices.existingMatrix.connections, ...proposedConnections]);
  const validationIssues = validateProposedConnections(proposedConnections, matrices.existingMatrix.connections, matrices.view, data);
  const continuityWarnings = matrices.view.continuityPaths.flatMap((path) => path.warningSummary);
  return {
    splicePointId: matrices.view.splicePoint.properties.splicePointId,
    spliceClosureId: matrices.view.closure?.properties.id || matrices.view.splicePoint.properties.closureId,
    validForDemoPreview: duplicateActive.length === 0 && validationIssues.filter((issue) => issue.severity === "critical").length === 0,
    persisted: false,
    syntheticFlag: true,
    proposedConnectionCount: proposedConnections.length,
    duplicateActiveStrandWarnings: duplicateActive,
    validationIssues,
    continuityWarnings,
    validatedRules: [
      "A strand cannot have two active service assignments unless explicitly modeled as a branch splice.",
      "A strand cannot connect to retired, faulted, or superseded cable sections.",
      "A proposed splice cannot overwrite an existing splice until committed.",
      "Existing splice rows are read-only in this demo.",
      "Proposed continuity is a preview and is not shown as existing continuity.",
      "Synthetic services remain clearly labeled as demo data.",
    ],
    payload,
    message: "Validation is a synthetic preview. Proposed splices are not committed to existing continuity.",
  };
}

export function compareExistingProposed(splicePointId: string, data: FiberContinuityData) {
  const matrices = matricesForSplicePoint(splicePointId, data);
  if (!matrices) return null;
  const existingKeys = new Set(matrices.existingMatrix.connections.map(connectionKey));
  const proposedKeys = new Set(matrices.proposedMatrix.connections.map(connectionKey));
  return {
    splicePointId: matrices.view.splicePoint.properties.splicePointId,
    spliceClosureId: matrices.view.closure?.properties.id || matrices.view.splicePoint.properties.closureId,
    syntheticFlag: true,
    existingConnectionCount: matrices.existingMatrix.connections.length,
    proposedConnectionCount: matrices.proposedMatrix.connections.length,
    addedInProposed: matrices.proposedMatrix.connections.filter((row) => !existingKeys.has(connectionKey(row))),
    unchanged: matrices.proposedMatrix.connections.filter((row) => existingKeys.has(connectionKey(row))).length,
    existingWithoutProposedMatch: matrices.existingMatrix.connections.filter((row) => !proposedKeys.has(connectionKey(row))),
    affectedServices: matrices.view.services.map((service) => ({
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      layerType: service.layerType,
      criticality: service.criticality,
    })),
    warning: "Compare view is synthetic and does not alter existing splice records.",
  };
}

function makeMatrix(view: SpliceManagerViewModel, layerType: SpliceMatrixLayer): SpliceMatrixRecord {
  const splicePointId = view.splicePoint.properties.splicePointId;
  const connections = layerType === "existing" ? view.existingSplices : view.proposedSplices;
  return {
    spliceMatrixId: `MATRIX-${splicePointId}-${layerType.toUpperCase()}`,
    splicePointId,
    spliceClosureId: view.closure?.properties.id || view.splicePoint.properties.closureId,
    matrixName: `${splicePointId} ${layerType === "existing" ? "existing" : "proposed"} splice matrix`,
    matrixVersion: layerType === "existing" ? "existing-demo-v1" : "proposed-demo-v1",
    layerType,
    status: layerType === "existing" ? "read_only" : "editable_demo",
    createdBy: "synthetic-demo-generator",
    createdAt: DEMO_NOW,
    syntheticFlag: true,
    notes:
      layerType === "existing"
        ? "Synthetic-existing matrix. Read-only in this demo."
        : "Synthetic proposed matrix. Editable preview only until a future persistent backend is connected.",
    connections,
  };
}

function withoutConnections(matrix: SpliceMatrixRecord) {
  const { connections: _connections, ...summary } = matrix;
  return { ...summary, connectionCount: matrix.connections.length };
}

function connectionKey(row: FiberSplice) {
  return `${row.fromCableId}:${row.fromStrandNumber}->${row.toCableId}:${row.toStrandNumber}:${row.spliceType}`;
}

function strandIdFor(cableId: string, strandNumber: number) {
  return `${cableId}-STRAND-${String(strandNumber).padStart(3, "0")}`;
}

function tubeNumber(strandNumber: number) {
  return Math.max(1, Math.ceil(strandNumber / 12));
}

function strandColor(strandNumber: number) {
  return FIBER_COLORS[(Math.max(1, strandNumber) - 1) % FIBER_COLORS.length];
}

function endpointKeys(row: FiberSplice) {
  return [`${row.fromCableId}:${row.fromStrandNumber}`, `${row.toCableId}:${row.toStrandNumber}`];
}

function proposedConnectionsFromPayload(payload: unknown, fallback: FiberSplice[]) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const rawConnections = Array.isArray(record.proposedConnections) ? record.proposedConnections : undefined;
  if (!rawConnections) return fallback;
  return rawConnections
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row, index) => ({
      id: String(row.id || `PROP-PAYLOAD-${String(index + 1).padStart(3, "0")}`),
      spliceClosureId: String(row.spliceClosureId || record.spliceClosureId || ""),
      fromCableId: String(row.fromCableId || ""),
      fromStrandNumber: Number(row.fromStrandNumber || 0),
      toCableId: String(row.toCableId || ""),
      toStrandNumber: Number(row.toStrandNumber || 0),
      spliceType: normalizeSpliceType(row.spliceType),
      lossDb: typeof row.lossDb === "number" ? row.lossDb : Number(row.lossDb || 0),
      status: normalizeSpliceStatus(row.status),
      assignmentId: typeof row.assignmentId === "string" ? row.assignmentId : undefined,
      notes: typeof row.notes === "string" ? row.notes : "Submitted proposed splice row.",
    }));
}

function normalizeSpliceType(value: unknown): FiberSplice["spliceType"] {
  if (value === "straight_through" || value === "express" || value === "branch" || value === "patch" || value === "open" || value === "reserved" || value === "termination" || value === "spare") return value;
  return "straight_through";
}

function normalizeSpliceStatus(value: unknown): FiberSplice["status"] {
  if (value === "existing" || value === "planned" || value === "proposed" || value === "faulted") return value;
  return "proposed";
}

function validateProposedConnections(
  proposedRows: FiberSplice[],
  existingRows: FiberSplice[],
  view: SpliceManagerViewModel,
  data: FiberContinuityData,
) {
  const issues: Array<{ rule: string; severity: "info" | "warning" | "critical"; message: string; rowId?: string }> = [];
  const validCableSectionIds = new Set(data.opgwCableSections.map((section) => section.properties.cableSectionId));
  const validCableIds = new Set(data.opgwCables.map((cable) => cable.properties.id));
  const retiredOrFaultedSections = new Set(
    data.opgwCableSections
      .filter((section) => ["faulted", "retired", "superseded"].includes(section.properties.installStatus))
      .map((section) => section.properties.cableSectionId),
  );
  const existingConnectionKeys = new Set(existingRows.map(connectionKey));
  const existingEndpoints = new Map<string, FiberSplice>();
  existingRows.forEach((row) => endpointKeys(row).forEach((key) => existingEndpoints.set(key, row)));

  if (!proposedRows.length) {
    issues.push({ rule: "proposed_matrix_editable", severity: "warning", message: "No proposed splice rows were submitted for validation." });
  }

  proposedRows.forEach((row) => {
    const rowId = row.id;
    if (row.status === "existing") {
      issues.push({ rule: "existing_read_only", severity: "critical", rowId, message: `${rowId} is marked existing. Existing splice rows are read-only in this demo.` });
    }
    if (!row.fromCableId || !row.toCableId || row.fromStrandNumber < 1 || row.toStrandNumber < 1) {
      issues.push({ rule: "complete_required_fields", severity: "critical", rowId, message: `${rowId} is missing cable or strand information.` });
    }
    [row.fromCableId, row.toCableId].forEach((cableOrSectionId) => {
      if (!validCableSectionIds.has(cableOrSectionId) && !validCableIds.has(cableOrSectionId)) {
        issues.push({ rule: "valid_cable_reference", severity: "critical", rowId, message: `${rowId} references unknown cable or cable section ${cableOrSectionId}.` });
      }
      if (retiredOrFaultedSections.has(cableOrSectionId)) {
        issues.push({ rule: "no_retired_or_faulted_section", severity: "critical", rowId, message: `${rowId} references retired, faulted, or superseded cable section ${cableOrSectionId}.` });
      }
    });
    if (existingConnectionKeys.has(connectionKey(row))) {
      issues.push({ rule: "proposed_duplicate_existing", severity: "info", rowId, message: `${rowId} matches an existing splice row and will be treated as unchanged until committed.` });
    }
    endpointKeys(row).forEach((key) => {
      const existingRow = existingEndpoints.get(key);
      if (existingRow && existingRow.spliceType !== "branch" && row.spliceType !== "branch" && connectionKey(existingRow) !== connectionKey(row)) {
        issues.push({ rule: "no_overwrite_existing_until_commit", severity: "critical", rowId, message: `${rowId} uses active existing endpoint ${key}; use a branch splice or commit workflow before replacing existing continuity.` });
      }
    });
    if (row.spliceType === "open") {
      issues.push({ rule: "open_splice_breaks_continuity", severity: "warning", rowId, message: `${rowId} is open and will be shown as broken/incomplete proposed continuity.` });
    }
    if (row.spliceType === "termination") {
      issues.push({ rule: "termination_requires_patch_panel_review", severity: "info", rowId, message: `${rowId} is a proposed termination and should be reviewed against patch-panel port assignments before commit.` });
    }
    if (row.spliceType === "spare") {
      issues.push({ rule: "spare_marker_not_continuity", severity: "info", rowId, message: `${rowId} marks a proposed spare strand and is not treated as active continuity.` });
    }
    if (row.status === "faulted") {
      issues.push({ rule: "faulted_splice_warning", severity: "warning", rowId, message: `${rowId} is marked faulted for demo review.` });
    }
  });

  if (view.continuityPaths.some((path) => path.totalTransmissionLines > 1)) {
    issues.push({ rule: "cross_line_trace_supported", severity: "info", message: "At least one affected synthetic service crosses multiple transmission lines; validate end-to-end continuity before field work." });
  }
  issues.push({ rule: "synthetic_boundary", severity: "info", message: "Validation is synthetic/demo only and does not prove real utility fiber, SCADA, relay, protection, or telecom routing." });
  return issues;
}

function findDuplicateActiveStrands(rows: FiberSplice[]) {
  const seen = new Map<string, FiberSplice[]>();
  const warnings: string[] = [];
  rows
    .filter((row) => row.status === "existing" || row.status === "planned" || row.status === "proposed")
    .forEach((row) => {
      Array.from(new Set(endpointKeys(row))).forEach((key) => {
        const existingRows = seen.get(key) || [];
        if (existingRows.some((existingRow) => existingRow.id !== row.id && existingRow.spliceType !== "branch" && row.spliceType !== "branch")) {
          warnings.push(`Strand ${key} appears in multiple active/proposed splice rows.`);
        }
        seen.set(key, [...existingRows, row]);
      });
    });
  return Array.from(new Set(warnings));
}
