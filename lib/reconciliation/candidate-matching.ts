import { normalizedNameSimilarity, tokenOverlap } from "@/lib/reconciliation/name-normalization";
import type { ChallengeInventoryItem, ReconciliationCandidate, ReconciliationItemResult, SourceTrailGroup } from "@/types/reconciliation";

const MIN_CANDIDATE_SCORE = 45;

export function matchChallengeItems(items: ChallengeInventoryItem[], groups: SourceTrailGroup[]): ReconciliationItemResult[] {
  return items.map((item) => {
    const candidates = groups
      .map((group) => scoreCandidate(item, group))
      .filter((candidate) => candidate.score >= MIN_CANDIDATE_SCORE)
      .sort((a, b) => b.score - a.score || a.sourceTrailDisplayName.localeCompare(b.sourceTrailDisplayName));

    return {
      item: { ...item, reviewStatus: candidates.length ? "candidate_found" : "unmatched" },
      candidates,
      status: classifyCandidates(candidates),
    };
  });
}

export function scoreCandidate(item: ChallengeInventoryItem, group: SourceTrailGroup): ReconciliationCandidate {
  const exact = item.normalizedName === group.normalizedName;
  const similarity = normalizedNameSimilarity(item.normalizedName, group.normalizedName);
  const overlap = tokenOverlap(item.normalizedName, group.normalizedName);
  const regionHintCompatible = item.regionHint ? true : undefined;
  let score = Math.max(similarity * 75, overlap * 70);
  const reasons: string[] = [];

  if (exact) { score = 100; reasons.push("Exact normalized-name match"); }
  else {
    if (similarity >= 0.82) { score += 15; reasons.push("High normalized-name similarity"); }
    if (overlap >= 0.66) { score += 10; reasons.push("Strong token overlap"); }
  }
  if (item.regionHint) { score += 2; reasons.push("Region hint available for human review"); }
  if (!reasons.length) reasons.push("Weak fuzzy name similarity");

  return {
    inventoryItemKey: item.itemKey,
    sourceTrailNormalizedName: group.normalizedName,
    sourceTrailDisplayName: group.displayName,
    score: Math.min(100, Math.round(score)),
    evidence: {
      exactNormalizedName: exact,
      normalizedSimilarity: round(similarity),
      tokenOverlap: round(overlap),
      regionHintCompatible,
      sourceFeatureCount: group.sourceFeatureCount,
      sourceGisMiles: group.totalGisMiles,
      sourceFeatureIds: group.sourceFeatureIds,
      reasons,
    },
  };
}

function classifyCandidates(candidates: ReconciliationCandidate[]): ReconciliationItemResult["status"] {
  if (!candidates.length) return "unmatched";
  if (candidates[0].evidence.exactNormalizedName && (candidates[1]?.score ?? 0) < 90) return "exact";
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 12) return "ambiguous";
  return "needs_review";
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
