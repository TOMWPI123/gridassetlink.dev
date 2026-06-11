import type { FiberStrand, StrandContinuityRecord } from "@/lib/types/assets";

export function continuityRecordMatchesStrand(record: StrandContinuityRecord, strand: FiberStrand) {
  const directMatch = record.cableIds.includes(strand.cableId) && record.strandNumbers.includes(strand.strandNumber);
  if (directMatch) return true;
  return record.continuitySegments.some((segment) =>
    segment.cableId === strand.cableId && Boolean(segment.strandNumbers?.includes(strand.strandNumber)),
  );
}

export function findStrandContinuityRecord(strand: FiberStrand, records: StrandContinuityRecord[]) {
  if (strand.assignmentId) {
    const assignedStrandMatch = records.find((record) =>
      record.assignmentId === strand.assignmentId && continuityRecordMatchesStrand(record, strand),
    );
    if (assignedStrandMatch) return assignedStrandMatch;
    return records.find((record) => record.assignmentId === strand.assignmentId);
  }
  return records.find((record) => continuityRecordMatchesStrand(record, strand));
}

export function strandContinuityDashboardHref(record: StrandContinuityRecord) {
  return `/dashboard?drawer=layers&strandContinuity=${encodeURIComponent(record.id)}&hideDevices=1`;
}
