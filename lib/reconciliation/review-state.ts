import type { ReconciliationCandidate, ReconciliationDecision, ReconciliationDecisionValue, ReconciliationItemResult } from "@/types/reconciliation";

export function parseStoredDecisions(raw: string | null): Record<string, ReconciliationDecision> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isReconciliationDecision(value)));
  } catch {
    if (process.env.NODE_ENV !== "production") console.warn("Ignoring malformed reconciliation decision state.");
    return {};
  }
}

export function selectedCandidateKeyForResult(result?: ReconciliationItemResult) {
  return result?.candidates[0]?.sourceTrailNormalizedName;
}

export function findCandidateByKey(result: ReconciliationItemResult | undefined, candidateKey: string | undefined) {
  if (!result) return undefined;
  return result.candidates.find((candidate) => candidate.sourceTrailNormalizedName === candidateKey) ?? result.candidates[0];
}

export function notesByItemFromDecisions(decisions: Record<string, ReconciliationDecision>) {
  return Object.fromEntries(Object.entries(decisions).map(([itemKey, decision]) => [itemKey, decision.notes ?? ""]));
}

export function buildReviewDecision(args: {
  itemKey: string;
  candidate?: ReconciliationCandidate;
  decision: ReconciliationDecisionValue;
  notes?: string;
  reviewTimestamp: string;
}): ReconciliationDecision {
  return {
    inventoryItemKey: args.itemKey,
    selectedCandidateNormalizedName: args.candidate?.sourceTrailNormalizedName,
    selectedSourceFeatureIds: args.candidate?.evidence.sourceFeatureIds ?? [],
    decision: args.decision,
    reviewTimestamp: args.reviewTimestamp,
    notes: args.notes?.trim() || undefined,
  };
}

function isReconciliationDecision(value: unknown): value is ReconciliationDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReconciliationDecision>;
  return typeof candidate.inventoryItemKey === "string"
    && Array.isArray(candidate.selectedSourceFeatureIds)
    && candidate.selectedSourceFeatureIds.every((id) => typeof id === "string")
    && (candidate.decision === "accepted" || candidate.decision === "rejected" || candidate.decision === "needs_review")
    && typeof candidate.reviewTimestamp === "string"
    && (candidate.notes === undefined || typeof candidate.notes === "string")
    && (candidate.selectedCandidateNormalizedName === undefined || typeof candidate.selectedCandidateNormalizedName === "string");
}
