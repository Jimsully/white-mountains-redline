export type CompletionMode = "authenticated" | "anonymous" | "demo" | "unavailable";
export type SelectionOrigin = "initial" | "filter" | "list" | "map";

export type CompletionMethod = "manual" | "gpx_match" | "admin";

export type CompletionEvidenceSource = "historical_gps" | "gpx_import" | "connected_service";

export type ConfirmableCompletionEvidence = {
  evidenceId: string;
  segmentId: string;
  trailName: string;
  segmentName: string;
  region: string;
  evidenceSource: CompletionEvidenceSource;
  acceptedAt: string;
  activityTitle: string | null;
  activityDate: string;
};

export type EvidenceConfirmationStatus = "confirmed" | "already_confirmed" | "already_completed" | "not_confirmable";

export type EvidenceConfirmationResult =
  | { status: "not_confirmable"; segmentId: null }
  | { status: Exclude<EvidenceConfirmationStatus, "not_confirmable">; segmentId: string };

export type SegmentCompletion = {
  id: string;
  segmentId: string;
  completedOn: string | null;
  completionMethod: CompletionMethod;
  createdAt: string;
};

export type SegmentCompletionRow = {
  id: string | number;
  segment_id: string | number;
  completed_on: string | null;
  completion_method: CompletionMethod;
  created_at: string;
};

export type ManualCompletionInput = {
  segmentId: string;
  completedOn?: string | null;
  notes?: string | null;
};

export type ValidatedManualCompletionInput = {
  segmentId: string;
  completedOn: string | null;
  notes: string | null;
};

export type CompletionValidationResult =
  | { ok: true; value: ValidatedManualCompletionInput }
  | { ok: false; message: string };

const positiveDecimalPattern = /^[1-9][0-9]*$/;
const maxPostgresBigint = BigInt("9223372036854775807");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mapSegmentCompletionRow(row: SegmentCompletionRow): SegmentCompletion {
  return {
    id: String(row.id),
    segmentId: String(row.segment_id),
    completedOn: row.completed_on,
    completionMethod: row.completion_method,
    createdAt: row.created_at,
  };
}

export function validateManualCompletionInput(input: ManualCompletionInput): CompletionValidationResult {
  if (!isValidProductionSegmentId(input.segmentId)) {
    return { ok: false, message: "Invalid segment completion request." };
  }

  const completedOn = normalizeCompletedOn(input.completedOn);
  if (completedOn === undefined) {
    return { ok: false, message: "Invalid completion date." };
  }

  const notes = normalizeCompletionNotes(input.notes);
  if (notes === undefined) {
    return { ok: false, message: "Completion notes must be 1000 characters or fewer." };
  }

  return { ok: true, value: { segmentId: input.segmentId, completedOn, notes } };
}

export function isValidProductionSegmentId(value: string) {
  if (!positiveDecimalPattern.test(value)) return false;
  return BigInt(value) <= maxPostgresBigint;
}

export function isValidCanonicalUuid(value: string) {
  return canonicalUuidPattern.test(value);
}

export function normalizeCompletedOn(value: string | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  if (!datePattern.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export function normalizeCompletionNotes(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 1000) return undefined;
  return trimmed;
}
