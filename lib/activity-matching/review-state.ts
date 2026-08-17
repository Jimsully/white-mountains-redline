import type { ActivityMatchArtifact, ActivityMatchDecisionValue, ActivityMatchReviewDecision } from "@/types/activity-matching";

export function parseStoredActivityMatchDecisions(raw: string | null): Record<string, ActivityMatchReviewDecision> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isDecision(value)));
  } catch {
    if (process.env.NODE_ENV !== "production") console.warn("Ignoring malformed activity matching decision state.");
    return {};
  }
}

export function buildActivityMatchDecision(artifact: ActivityMatchArtifact, matchKey: string, decision: ActivityMatchDecisionValue, notes: string | undefined, reviewTimestamp: string): ActivityMatchReviewDecision {
  const match = artifact.matchCandidates.find((candidate) => candidate.key === matchKey);
  if (!match) throw new Error(`Cannot build decision for unknown match ${matchKey}.`);
  return {
    activityKey: match.activityKey,
    segmentKey: match.segmentKey,
    matchKey: match.key,
    decision,
    reviewTimestamp,
    notes: notes?.trim() || undefined,
    activityMatchingAlgorithmVersion: artifact.metadata.algorithmVersion,
    segmentConstructionAlgorithmVersion: match.evidence.segmentConstructionAlgorithmVersion,
    sourceArtifact: {
      generatedAt: artifact.metadata.generatedAt,
      demoOnly: artifact.metadata.demoOnly,
      algorithmVersion: artifact.metadata.algorithmVersion,
    },
  };
}

export function buildActivityMatchDecisionExport(artifact: ActivityMatchArtifact, decisions: ActivityMatchReviewDecision[]) {
  return {
    exportedAt: new Date().toISOString(),
    warning: "Prototype GPS evidence review decisions only. Accepted completion evidence is not a production SegmentCompletion row.",
    activityMatchingAlgorithmVersion: artifact.metadata.algorithmVersion,
    sourceArtifact: {
      generatedAt: artifact.metadata.generatedAt,
      demoOnly: artifact.metadata.demoOnly,
      algorithmVersion: artifact.metadata.algorithmVersion,
    },
    decisions,
  };
}

function isDecision(value: unknown): value is ActivityMatchReviewDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActivityMatchReviewDecision>;
  return typeof candidate.activityKey === "string"
    && typeof candidate.segmentKey === "string"
    && typeof candidate.matchKey === "string"
    && (candidate.decision === "accepted" || candidate.decision === "rejected" || candidate.decision === "needs_review")
    && typeof candidate.reviewTimestamp === "string"
    && typeof candidate.activityMatchingAlgorithmVersion === "string"
    && typeof candidate.segmentConstructionAlgorithmVersion === "string"
    && (candidate.notes === undefined || typeof candidate.notes === "string");
}