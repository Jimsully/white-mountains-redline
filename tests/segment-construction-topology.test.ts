import { describe, expect, it } from "vitest";
import type { AcceptedTrailSource, SegmentConstructionTolerances } from "@/types/segment-construction";
import { buildSegmentConstructionArtifact } from "@/lib/segment-construction/topology";
import { DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES } from "@/lib/segment-construction/config";

const tolerances: SegmentConstructionTolerances = { ...DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES, endpointSnapToleranceMeters: 15, intersectionToleranceMeters: 10, minimumSegmentLengthMeters: 20 };

function source(itemKey: string, name: string, coordinates: number[][] | number[][][], featureIds = [`${itemKey}-feature`]): AcceptedTrailSource {
  const multi = typeof coordinates[0][0] === "number" ? [coordinates as number[][]] : coordinates as number[][][];
  return {
    itemKey,
    trailDisplayName: name,
    trailNormalizedName: name.toUpperCase(),
    sourceTrailDisplayName: name,
    sourceTrailNormalizedName: name.toUpperCase(),
    sourceProvider: "demo",
    sourceFeatureIds: featureIds,
    sourceGisMiles: 0,
    geometry: { type: "MultiLineString", coordinates: multi },
    reconciliation: { decisionTimestamp: "2026-01-01T00:00:00Z", selectedCandidateNormalizedName: name.toUpperCase(), evidence: { exactNormalizedName: true, normalizedSimilarity: 1, tokenOverlap: 1, sourceFeatureCount: featureIds.length, sourceGisMiles: 0, sourceFeatureIds: featureIds, reasons: ["fixture"] } },
    warnings: [],
  };
}

function artifact(sources: AcceptedTrailSource[]) {
  return buildSegmentConstructionArtifact({ acceptedTrailSources: sources, generatedAt: "2026-01-01T00:00:00Z", demoOnly: true, tolerances });
}

describe("segment construction topology", () => {
  it("detects one shared crossing junction and splits both lines", () => {
    const result = artifact([
      source("a", "Alpha", [[0, 0], [0.002, 0]]),
      source("b", "Beta", [[0.001, -0.001], [0.001, 0.001]]),
    ]);
    const crossings = result.junctionCandidates.filter((junction) => junction.reasons.includes("cross_trail_intersection"));
    expect(crossings).toHaveLength(1);
    expect(result.segmentCandidates).toHaveLength(4);
  });

  it("handles a T junction as a shared split location", () => {
    const result = artifact([
      source("a", "Alpha", [[0, 0], [0.002, 0]]),
      source("b", "Beta", [[0.001, -0.001], [0.001, 0]]),
    ]);
    expect(result.junctionCandidates.some((junction) => junction.reasons.includes("cross_trail_intersection"))).toBe(true);
    expect(result.segmentCandidates.filter((segment) => segment.parentInventoryItemKey === "a")).toHaveLength(2);
  });

  it("creates endpoint junctions", () => {
    const result = artifact([source("a", "Alpha", [[0, 0], [0.001, 0]])]);
    expect(result.junctionCandidates.every((junction) => junction.reasons.includes("trail_endpoint"))).toBe(true);
    expect(result.junctionCandidates).toHaveLength(2);
  });

  it("does not make same-trail source boundaries automatic completion junctions", () => {
    const result = artifact([source("a", "Alpha", [[[0, 0], [0.001, 0]], [[0.001, 0], [0.002, 0]]], ["a-1", "a-2"])]);
    expect(result.junctionCandidates.some((junction) => junction.reasons.includes("same_trail_source_boundary"))).toBe(false);
    expect(result.diagnostics.sourceFeatureBoundaryCount).toBe(1);
  });

  it("flags a near miss inside tolerance without treating it as exact", () => {
    const result = artifact([
      source("a", "Alpha", [[0, 0], [0.001, 0]]),
      source("b", "Beta", [[0.00105, 0.00003], [0.00105, 0.001]]),
    ]);
    expect(result.diagnostics.nearIntersectionWarningCount).toBeGreaterThan(0);
    expect(result.junctionCandidates.some((junction) => junction.reasons.includes("ambiguous_near_intersection") && junction.reviewStatus === "needs_review")).toBe(true);
  });

  it("ignores near misses outside tolerance", () => {
    const result = artifact([
      source("a", "Alpha", [[0, 0], [0.001, 0]]),
      source("b", "Beta", [[0.0015, 0.0005], [0.0015, 0.001]])
    ]);
    expect(result.diagnostics.nearIntersectionWarningCount).toBe(0);
  });

  it("deduplicates multiple detections of the same junction", () => {
    const result = artifact([
      source("a", "Alpha", [[0, 0], [0.002, 0]]),
      source("b", "Beta", [[0.001, -0.001], [0.001, 0.001]]),
      source("c", "Gamma", [[0.001, -0.001], [0.001, 0.001]])
    ]);
    const crossingLike = result.junctionCandidates.filter((junction) => junction.reasons.includes("cross_trail_intersection"));
    expect(crossingLike).toHaveLength(1);
    expect(crossingLike[0].participatingInventoryItemKeys.sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps stable keys across repeat runs", () => {
    const sources = [source("a", "Alpha", [[0, 0], [0.002, 0]]), source("b", "Beta", [[0.001, -0.001], [0.001, 0.001]])];
    expect(artifact(sources).junctionCandidates.map((junction) => junction.key)).toEqual(artifact(sources).junctionCandidates.map((junction) => junction.key));
    expect(artifact(sources).segmentCandidates.map((segment) => segment.key)).toEqual(artifact(sources).segmentCandidates.map((segment) => segment.key));
  });

  it("does not generate zero-length segments and flags very short segments", () => {
    const result = artifact([
      source("a", "Alpha", [[0, 0], [0.0001, 0], [0.002, 0]]),
      source("b", "Beta", [[0.0001, -0.001], [0.0001, 0.001]])
    ]);
    expect(result.segmentCandidates.every((segment) => segment.calculatedMeters > 0)).toBe(true);
    expect(result.diagnostics.shortSegmentWarningCount).toBeGreaterThan(0);
  });

  it("retains source-feature provenance", () => {
    const result = artifact([source("a", "Alpha", [[0, 0], [0.001, 0]], ["source-1"])]);
    expect(result.segmentCandidates[0].sourceFeatureIds).toEqual(["source-1"]);
    expect(result.junctionCandidates.flatMap((junction) => junction.sourceFeatureIds)).toContain("source-1");
  });

  it("conserves input/output length apart from rounding", () => {
    const result = artifact([source("a", "Alpha", [[0, 0], [0.001, 0], [0.002, 0]])]);
    expect(Math.abs(result.diagnostics.lengthDeltaMiles)).toBeLessThan(0.0001);
  });

  it("reports disconnected MultiLineString components", () => {
    const result = artifact([source("a", "Alpha", [[[0, 0], [0.001, 0]], [[0.01, 0], [0.011, 0]]], ["a-1", "a-2"])]);
    expect(result.diagnostics.disconnectedComponentCount).toBe(1);
  });
});