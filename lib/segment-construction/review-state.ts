import { SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, type SegmentReviewDecision, type SegmentDecisionValue, type SegmentConstructionArtifact } from "@/types/segment-construction";

export function parseStoredSegmentDecisions(raw: string | null): Record<string, SegmentReviewDecision> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isDecision(value)));
  } catch {
    if (process.env.NODE_ENV !== "production") console.warn("Ignoring malformed segment construction decision state.");
    return {};
  }
}

export function buildSegmentDecision(targetType: "junction" | "segment", targetKey: string, decision: SegmentDecisionValue, notes: string | undefined, reviewTimestamp: string): SegmentReviewDecision {
  return { targetType, targetKey, decision, reviewTimestamp, notes: notes?.trim() || undefined };
}

export function buildSegmentDecisionExport(artifact: SegmentConstructionArtifact, decisions: SegmentReviewDecision[]) {
  return {
    exportedAt: new Date().toISOString(),
    warning: "Prototype topology review decisions only. Accepted segment-construction candidates are not published completion segments.",
    algorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION,
    sourceArtifact: {
      generatedAt: artifact.metadata.generatedAt,
      demoOnly: artifact.metadata.demoOnly,
      algorithmVersion: artifact.metadata.algorithmVersion,
    },
    decisions,
  };
}

function isDecision(value: unknown): value is SegmentReviewDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SegmentReviewDecision>;
  return (candidate.targetType === "junction" || candidate.targetType === "segment")
    && typeof candidate.targetKey === "string"
    && (candidate.decision === "accepted" || candidate.decision === "rejected" || candidate.decision === "needs_review")
    && typeof candidate.reviewTimestamp === "string"
    && (candidate.notes === undefined || typeof candidate.notes === "string");
}