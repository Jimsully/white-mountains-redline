import type { ReconciliationArtifact, ReconciliationDecision } from "@/types/reconciliation";
import type { AcceptedTrailSource } from "@/types/segment-construction";

export type DecisionExport = { decisions?: ReconciliationDecision[] } | ReconciliationDecision[];
export type AcceptedTrailSourceResolution = { acceptedTrailSources: AcceptedTrailSource[]; errors: string[] };

export function resolveAcceptedTrailSourcesFromReconciliation(artifact: ReconciliationArtifact, decisionExport: DecisionExport): AcceptedTrailSourceResolution {
  const decisions = Array.isArray(decisionExport) ? decisionExport : decisionExport.decisions ?? [];
  const acceptedTrailSources: AcceptedTrailSource[] = [];
  const errors: string[] = [];

  for (const decision of decisions.filter((item) => item.decision === "accepted")) {
    const resolved = toAcceptedTrailSource(artifact, decision);
    if (typeof resolved === "string") errors.push(resolved);
    else acceptedTrailSources.push(resolved);
  }
  return { acceptedTrailSources, errors };
}

export function acceptedTrailSourcesFromReconciliation(artifact: ReconciliationArtifact, decisionExport: DecisionExport): AcceptedTrailSource[] {
  const result = resolveAcceptedTrailSourcesFromReconciliation(artifact, decisionExport);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  return result.acceptedTrailSources;
}

function toAcceptedTrailSource(artifact: ReconciliationArtifact, decision: ReconciliationDecision): AcceptedTrailSource | string {
  const prefix = `accepted decision ${decision.inventoryItemKey}`;
  const result = artifact.results.find((item) => item.item.itemKey === decision.inventoryItemKey);
  if (!result) return `${prefix}: inventory item not found`;
  if (!decision.selectedCandidateNormalizedName) return `${prefix}: selectedCandidateNormalizedName is required`;
  const candidate = result.candidates.find((item) => item.sourceTrailNormalizedName === decision.selectedCandidateNormalizedName);
  if (!candidate) return `${prefix}: selected candidate '${decision.selectedCandidateNormalizedName}' not found`;
  const group = artifact.sourceTrailGroups.find((item) => item.normalizedName === candidate.sourceTrailNormalizedName);
  if (!group) return `${prefix}: source trail group '${candidate.sourceTrailNormalizedName}' not found`;
  const candidateFeatureIds = new Set(candidate.evidence.sourceFeatureIds);
  const groupFeatureIds = new Set(group.sourceFeatureIds);
  const selectedFeatureIds = decision.selectedSourceFeatureIds ?? [];
  const selectedFeatureIdSet = new Set(selectedFeatureIds);
  if (!sameSet(candidateFeatureIds, groupFeatureIds)) return `${prefix}: selected candidate/source group feature IDs do not agree`;
  if (!sameSet(selectedFeatureIdSet, candidateFeatureIds)) return `${prefix}: selectedSourceFeatureIds must exactly match the selected candidate/source group feature IDs`;

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
    reconciliation: { decisionTimestamp: decision.reviewTimestamp, selectedCandidateNormalizedName: decision.selectedCandidateNormalizedName, evidence: candidate.evidence },
    warnings: group.geometry.coordinates.length > 1 ? ["multiple_source_components_require_topology_review", "component_source_feature_provenance_is_coarse"] : ["component_source_feature_provenance_is_coarse"],
    componentProvenance: group.geometry.coordinates.map((coordinates) => ({ componentKey: componentFingerprint(coordinates), sourceFeatureIds: group.sourceFeatureIds, provenancePrecision: "coarse" as const })),
  };
}

function sameSet(a: Set<string>, b: Set<string>) {
  return a.size === b.size && Array.from(a).every((value) => b.has(value));
}

function componentFingerprint(coordinates: number[][]) {
  const forward = coordinates.map((point) => `${round(point[0])},${round(point[1])}`).join(";");
  const reverse = coordinates.slice().reverse().map((point) => `${round(point[0])},${round(point[1])}`).join(";");
  return forward < reverse ? forward : reverse;
}

function round(value: number) {
  return Math.round(value * 10000000) / 10000000;
}