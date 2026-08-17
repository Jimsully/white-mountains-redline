import type { ReconciliationArtifact, ReconciliationDecision } from "@/types/reconciliation";
import type { AcceptedTrailSource } from "@/types/segment-construction";

export type DecisionExport = { decisions?: ReconciliationDecision[] } | ReconciliationDecision[];

export function acceptedTrailSourcesFromReconciliation(artifact: ReconciliationArtifact, decisionExport: DecisionExport): AcceptedTrailSource[] {
  const decisions = Array.isArray(decisionExport) ? decisionExport : decisionExport.decisions ?? [];
  return decisions
    .filter((decision) => decision.decision === "accepted")
    .map((decision) => toAcceptedTrailSource(artifact, decision))
    .filter((source): source is AcceptedTrailSource => Boolean(source));
}

function toAcceptedTrailSource(artifact: ReconciliationArtifact, decision: ReconciliationDecision): AcceptedTrailSource | undefined {
  const result = artifact.results.find((item) => item.item.itemKey === decision.inventoryItemKey);
  if (!result) return undefined;
  const candidate = result.candidates.find((item) => item.sourceTrailNormalizedName === decision.selectedCandidateNormalizedName) ?? result.candidates[0];
  if (!candidate) return undefined;
  const group = artifact.sourceTrailGroups.find((item) => item.normalizedName === candidate.sourceTrailNormalizedName);
  if (!group) return undefined;
  return {
    itemKey: result.item.itemKey,
    trailDisplayName: result.item.displayName,
    trailNormalizedName: result.item.normalizedName,
    sourceTrailDisplayName: group.displayName,
    sourceTrailNormalizedName: group.normalizedName,
    sourceProvider: group.sourceProvider,
    sourceFeatureIds: group.sourceFeatureIds,
    sourceGisMiles: group.totalGisMiles,
    geometry: group.geometry,
    reconciliation: {
      decisionTimestamp: decision.reviewTimestamp,
      selectedCandidateNormalizedName: decision.selectedCandidateNormalizedName,
      evidence: candidate.evidence,
    },
    warnings: group.geometry.coordinates.length > 1 ? ["multiple_source_components_require_topology_review"] : [],
  };
}