import { describe, expect, it } from "vitest";
import { buildReviewDecision, findCandidateByKey, notesByItemFromDecisions, parseStoredDecisions, selectedCandidateKeyForResult } from "@/lib/reconciliation/review-state";
import type { ReconciliationItemResult } from "@/types/reconciliation";

const result: ReconciliationItemResult = {
  item: { itemKey: "demo", displayName: "Demo Trail", normalizedName: "DEMO", reviewStatus: "candidate_found" },
  status: "needs_review",
  candidates: [
    { inventoryItemKey: "demo", sourceTrailNormalizedName: "FIRST", sourceTrailDisplayName: "First", score: 80, evidence: { exactNormalizedName: false, normalizedSimilarity: 0.8, tokenOverlap: 0.5, sourceFeatureCount: 1, sourceGisMiles: 1.1, sourceFeatureIds: ["1"], reasons: ["fixture"] } },
    { inventoryItemKey: "demo", sourceTrailNormalizedName: "SECOND", sourceTrailDisplayName: "Second", score: 70, evidence: { exactNormalizedName: false, normalizedSimilarity: 0.7, tokenOverlap: 0.5, sourceFeatureCount: 1, sourceGisMiles: 2.2, sourceFeatureIds: ["2"], reasons: ["fixture"] } },
  ],
};

describe("reconciliation review state", () => {
  it("ignores malformed stored decision data", () => {
    expect(parseStoredDecisions("not json")).toEqual({});
    expect(parseStoredDecisions(JSON.stringify({ bad: { decision: "accepted" } }))).toEqual({});
  });

  it("selects the top candidate by default and can resolve a selected candidate", () => {
    expect(selectedCandidateKeyForResult(result)).toBe("FIRST");
    expect(findCandidateByKey(result, "SECOND")?.evidence.sourceFeatureIds).toEqual(["2"]);
    expect(findCandidateByKey(result, "MISSING")?.sourceTrailNormalizedName).toBe("FIRST");
  });

  it("keeps notes item-specific and includes them in exported decisions", () => {
    const first = buildReviewDecision({ itemKey: "one", candidate: result.candidates[0], decision: "accepted", notes: "first note", reviewTimestamp: "2026-01-01T00:00:00Z" });
    const second = buildReviewDecision({ itemKey: "two", candidate: result.candidates[1], decision: "needs_review", notes: "second note", reviewTimestamp: "2026-01-02T00:00:00Z" });
    expect(notesByItemFromDecisions({ one: first, two: second })).toEqual({ one: "first note", two: "second note" });
    expect(first.selectedSourceFeatureIds).toEqual(["1"]);
    expect(second.notes).toBe("second note");
  });
});
