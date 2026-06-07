import type { FiberSplice, SyntheticService } from "@/lib/types/assets";
import {
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
  return data.fiberSplices.map((connection) => ({
    ...connection,
    layerType: connection.status === "existing" ? "existing" : "proposed",
    syntheticFlag: true,
    readOnly: connection.status === "existing",
    notes: connection.notes || "Synthetic demo splice connection.",
  }));
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
  const proposedConnections = matrices.proposedMatrix.connections;
  const duplicateActive = findDuplicateActiveStrands([...matrices.existingMatrix.connections, ...proposedConnections]);
  const continuityWarnings = matrices.view.continuityPaths.flatMap((path) => path.warningSummary);
  return {
    splicePointId: matrices.view.splicePoint.properties.splicePointId,
    spliceClosureId: matrices.view.closure?.properties.id || matrices.view.splicePoint.properties.closureId,
    validForDemoPreview: duplicateActive.length === 0,
    persisted: false,
    syntheticFlag: true,
    proposedConnectionCount: proposedConnections.length,
    duplicateActiveStrandWarnings: duplicateActive,
    continuityWarnings,
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

function findDuplicateActiveStrands(rows: FiberSplice[]) {
  const seen = new Set<string>();
  const warnings: string[] = [];
  rows
    .filter((row) => row.status === "existing" || row.status === "planned" || row.status === "proposed")
    .forEach((row) => {
      const key = `${row.fromCableId}:${row.fromStrandNumber}`;
      if (seen.has(key)) warnings.push(`Strand ${key} appears in multiple active/proposed splice rows.`);
      seen.add(key);
    });
  return warnings;
}
