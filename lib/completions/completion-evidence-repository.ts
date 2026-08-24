import type { SupabaseClient } from "@supabase/supabase-js";
import { EVIDENCE_CONFIRM_FAILED, EVIDENCE_LIST_FAILED } from "@/lib/completions/errors";
import { isValidCanonicalUuid, isValidProductionSegmentId, normalizeCompletedOn } from "@/types/completion";
import type { CompletionEvidenceSource, ConfirmableCompletionEvidence, EvidenceConfirmationResult } from "@/types/completion";

const evidenceSources = new Set<CompletionEvidenceSource>(["historical_gps", "gpx_import", "connected_service"]);
const timestampPattern = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class CompletionEvidenceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listConfirmableEvidence(): Promise<ConfirmableCompletionEvidence[]> {
    const { data, error } = await this.supabase.rpc("list_confirmable_completion_evidence");
    if (error || !Array.isArray(data)) throw new Error(EVIDENCE_LIST_FAILED);

    try {
      return data.map(mapConfirmableEvidenceRow);
    } catch {
      throw new Error(EVIDENCE_LIST_FAILED);
    }
  }

  async confirmEvidence(evidenceId: string): Promise<EvidenceConfirmationResult> {
    if (!isValidCanonicalUuid(evidenceId)) throw new Error(EVIDENCE_CONFIRM_FAILED);

    const { data, error } = await this.supabase.rpc("confirm_completion_evidence", {
      target_evidence_id: evidenceId,
    });
    if (error || !Array.isArray(data) || data.length !== 1) throw new Error(EVIDENCE_CONFIRM_FAILED);

    try {
      return mapConfirmationRow(data[0]);
    } catch {
      throw new Error(EVIDENCE_CONFIRM_FAILED);
    }
  }
}

function mapConfirmableEvidenceRow(value: unknown): ConfirmableCompletionEvidence {
  const row = record(value);
  const evidenceId = requiredString(row.evidence_id);
  const segmentId = productionSegmentId(row.segment_id);
  const evidenceSource = requiredString(row.evidence_source);
  const activityDate = requiredString(row.activity_date);
  const acceptedAt = requiredString(row.accepted_at);

  if (!isValidCanonicalUuid(evidenceId)) throw new TypeError("Malformed evidence UUID");
  if (!evidenceSources.has(evidenceSource as CompletionEvidenceSource)) throw new TypeError("Malformed evidence source");
  if (normalizeCompletedOn(activityDate) !== activityDate) throw new TypeError("Malformed activity date");
  const acceptedAtMatch = timestampPattern.exec(acceptedAt);
  if (
    !acceptedAtMatch
    || normalizeCompletedOn(acceptedAtMatch[1]) !== acceptedAtMatch[1]
    || Number.isNaN(Date.parse(acceptedAt))
  ) {
    throw new TypeError("Malformed acceptance timestamp");
  }
  if (row.activity_title !== null && typeof row.activity_title !== "string") throw new TypeError("Malformed activity title");

  return {
    evidenceId,
    segmentId,
    trailName: requiredString(row.trail_name),
    segmentName: requiredString(row.segment_name),
    region: requiredString(row.region),
    evidenceSource: evidenceSource as CompletionEvidenceSource,
    acceptedAt,
    activityTitle: row.activity_title,
    activityDate,
  };
}

function mapConfirmationRow(value: unknown): EvidenceConfirmationResult {
  const row = record(value);
  const status = requiredString(row.status);

  if (status === "not_confirmable") {
    if (row.segment_id !== null) throw new TypeError("Malformed unavailable confirmation");
    return { status, segmentId: null };
  }

  if (status !== "confirmed" && status !== "already_confirmed" && status !== "already_completed") {
    throw new TypeError("Malformed confirmation status");
  }

  return { status, segmentId: productionSegmentId(row.segment_id) };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Malformed RPC row");
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== "string") throw new TypeError("Malformed RPC string");
  return value;
}

function productionSegmentId(value: unknown) {
  const segmentId = typeof value === "number"
    ? Number.isSafeInteger(value) && value > 0 ? String(value) : null
    : typeof value === "string" ? value : null;
  if (segmentId === null || !isValidProductionSegmentId(segmentId)) throw new TypeError("Malformed segment ID");
  return segmentId;
}
