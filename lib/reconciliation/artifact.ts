import type { ReconciliationArtifact, ReconciliationDecision, ReconciliationItemResult, SourceTrailGroup } from "@/types/reconciliation";
import type { SourceTrailFeature } from "@/types/trails";
import { validateChallengeInventoryCsv } from "@/lib/reconciliation/inventory";
import { matchChallengeItems } from "@/lib/reconciliation/candidate-matching";
import { groupSourceTrailFeatures } from "@/lib/reconciliation/source-groups";

export function buildReconciliationArtifact(csv: string, features: SourceTrailFeature[], generatedAt: string, demoOnly: boolean): ReconciliationArtifact {
  const validation = validateChallengeInventoryCsv(csv, demoOnly ? "DEMO reconciliation inventory" : undefined);
  if (validation.errors.length) throw new Error(validation.errors.join("\n"));
  const sourceTrailGroups = groupSourceTrailFeatures(features);
  const results = matchChallengeItems(validation.items, sourceTrailGroups);
  return {
    metadata: {
      generatedAt,
      demoOnly,
      sourceFeatureCount: features.length,
      sourceTrailGroupCount: sourceTrailGroups.length,
      warning: demoOnly
        ? "DEMO DATA ONLY. Not a White Mountain Guide inventory, not navigation, not challenge verified."
        : "Local/private inventory-derived output. Do not commit unless it is demo/test data.",
    },
    summary: summarize(results, sourceTrailGroups),
    results,
    sourceTrailGroups,
  };
}

export function buildDecisionExport(decisions: ReconciliationDecision[]) {
  return {
    exportedAt: new Date().toISOString(),
    warning: "Prototype review decisions only. Accepted reconciliation is not a verified trail segment and is not promoted automatically.",
    decisions,
  };
}

function summarize(results: ReconciliationItemResult[], sourceTrailGroups: SourceTrailGroup[]) {
  const exactMatchCount = results.filter((result) => result.status === "exact").length;
  const unmatchedCount = results.filter((result) => result.status === "unmatched").length;
  const ambiguousCount = results.filter((result) => result.status === "ambiguous").length;
  return {
    inventoryItemCount: results.length,
    exactMatchCount,
    candidateFoundCount: results.length - unmatchedCount,
    unmatchedCount,
    ambiguousCount,
    sourceTrailGroupCount: sourceTrailGroups.length,
  };
}
