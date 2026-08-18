import type { PublicationDecision, PublicationDecisionExport, PublicationDecisionValue, PublicationTargetType, VerifiedNetworkArtifact } from "@/types/publication";
import { PUBLICATION_ALGORITHM_VERSION } from "@/types/publication";

export function parseStoredPublicationDecisions(value: string | null): Record<string, PublicationDecision> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const output: Record<string, PublicationDecision> = {};
    for (const [key, decision] of Object.entries(parsed as Record<string, unknown>)) {
      if (isPublicationDecision(decision)) output[key] = decision;
    }
    return output;
  } catch {
    return {};
  }
}

export function buildPublicationDecision(targetType: PublicationTargetType, targetKey: string, decision: PublicationDecisionValue, notes: string, reviewTimestamp: string): PublicationDecision {
  const output: PublicationDecision = { targetType, targetKey, decision, reviewTimestamp };
  const trimmed = notes.trim();
  if (trimmed) output.notes = trimmed;
  return output;
}

export function buildPublicationDecisionExport(artifact: VerifiedNetworkArtifact, decisions: PublicationDecision[]): PublicationDecisionExport {
  return {
    exportedAt: new Date().toISOString(),
    warning: "Publication decisions can create production trail/trail_segments only after controlled service-role loading. They never create SegmentCompletion records.",
    algorithmVersion: PUBLICATION_ALGORITHM_VERSION,
    sourceArtifact: artifact.metadata.publicationDecisionExport?.sourceArtifact,
    sourceSegmentDecisions: artifact.metadata.publicationDecisionExport?.sourceSegmentDecisions,
    trailMetadata: [...artifact.trailMetadata].sort((a, b) => a.candidateTrailKey.localeCompare(b.candidateTrailKey)),
    decisions: [...decisions].sort((a, b) => `${a.targetType}:${a.targetKey}`.localeCompare(`${b.targetType}:${b.targetKey}`)),
  };
}

function isPublicationDecision(value: unknown): value is PublicationDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicationDecision>;
  return (candidate.targetType === "trail" || candidate.targetType === "segment")
    && typeof candidate.targetKey === "string"
    && (candidate.decision === "verified_for_publication" || candidate.decision === "rejected" || candidate.decision === "needs_review")
    && typeof candidate.reviewTimestamp === "string";
}
