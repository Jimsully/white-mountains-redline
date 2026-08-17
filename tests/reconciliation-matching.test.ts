import { describe, expect, it } from "vitest";
import type { SourceTrailFeature } from "@/types/trails";
import { groupSourceTrailFeatures } from "@/lib/reconciliation/source-groups";
import { matchChallengeItems } from "@/lib/reconciliation/candidate-matching";
import { buildDecisionExport } from "@/lib/reconciliation/artifact";

const features: SourceTrailFeature[] = [
  { id: "usfs-1", sourceProvider: "USFS", sourceDataset: "fixture", sourceFeatureId: "1", sourceUrl: "service", importedAt: "2026-01-01T00:00:00Z", originalProperties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, reconciliationStatus: "raw", trailName: "FRANCONIA RIDGE", gisMiles: 1.5 },
  { id: "usfs-2", sourceProvider: "USFS", sourceDataset: "fixture", sourceFeatureId: "2", sourceUrl: "service", importedAt: "2026-01-01T00:00:00Z", originalProperties: {}, geometry: { type: "LineString", coordinates: [[1, 1], [2, 2]] }, reconciliationStatus: "raw", trailName: "FRANCONIA RIDGE", gisMiles: 2 },
  { id: "usfs-3", sourceProvider: "USFS", sourceDataset: "fixture", sourceFeatureId: "3", sourceUrl: "service", importedAt: "2026-01-01T00:00:00Z", originalProperties: {}, geometry: { type: "LineString", coordinates: [[5, 5], [6, 6]] }, reconciliationStatus: "raw", trailName: "GARFIELD RIDGE", gisMiles: 3 },
  { id: "usfs-4", sourceProvider: "USFS", sourceDataset: "fixture", sourceFeatureId: "4", sourceUrl: "service", importedAt: "2026-01-01T00:00:00Z", originalProperties: {}, geometry: { type: "LineString", coordinates: [[7, 7], [8, 8]] }, reconciliationStatus: "raw", trailName: "FRANCONIA BROOK", gisMiles: 1 },
];

describe("source grouping and candidate matching", () => {
  it("groups source trail features by normalized trail name", () => {
    const groups = groupSourceTrailFeatures(features);
    const franconia = groups.find((group) => group.normalizedName === "FRANCONIA RIDGE");
    expect(groups).toHaveLength(3);
    expect(franconia?.sourceFeatureCount).toBe(2);
    expect(franconia?.sourceFeatureIds).toEqual(["1", "2"]);
    expect(franconia?.totalGisMiles).toBe(3.5);
    expect(franconia?.bbox).toEqual([0, 0, 2, 2]);
  });

  it("finds exact, ambiguous, fuzzy, region-hinted, and unmatched candidates", () => {
    const groups = groupSourceTrailFeatures(features);
    const results = matchChallengeItems([
      { itemKey: "exact", displayName: "Franconia Ridge Trail", normalizedName: "FRANCONIA RIDGE", reviewStatus: "unreviewed" },
      { itemKey: "ambiguous", displayName: "Franconia Trail", normalizedName: "FRANCONIA", reviewStatus: "unreviewed" },
      { itemKey: "fuzzy", displayName: "Garfield Ridge Tr", normalizedName: "GARFIELD RIDGE TR", reviewStatus: "unreviewed", regionHint: "Franconia-Pemigewasset" },
      { itemKey: "unmatched", displayName: "Imaginary Path", normalizedName: "IMAGINARY PATH", reviewStatus: "unreviewed" },
    ], groups);

    expect(results.find((result) => result.item.itemKey === "exact")?.status).toBe("exact");
    expect(results.find((result) => result.item.itemKey === "ambiguous")?.status).toBe("ambiguous");
    expect(results.find((result) => result.item.itemKey === "fuzzy")?.candidates[0].sourceTrailNormalizedName).toBe("GARFIELD RIDGE");
    const fuzzyEvidence = results.find((result) => result.item.itemKey === "fuzzy")?.candidates[0].evidence;
    expect(fuzzyEvidence?.regionHintCompatible).toBeUndefined();
    expect(fuzzyEvidence?.reasons).toContain("Region hint available; geographic compatibility not yet evaluated");
    expect(results.find((result) => result.item.itemKey === "unmatched")?.status).toBe("unmatched");
  });

  it("exports prototype decision structure without promotion", () => {
    const exported = buildDecisionExport([{ inventoryItemKey: "exact", selectedCandidateNormalizedName: "FRANCONIA RIDGE", selectedSourceFeatureIds: ["1", "2"], decision: "accepted", reviewTimestamp: "2026-01-01T00:00:00Z", notes: "fixture" }]);
    expect(exported.warning).toContain("not a verified trail segment");
    expect(exported.decisions[0].selectedSourceFeatureIds).toEqual(["1", "2"]);
  });
});
