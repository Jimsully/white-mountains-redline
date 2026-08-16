import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import fixture from "@/tests/fixtures/usfs-features.json";
import { buildSourceFeatureSummary, normalizeUsfsFeature } from "@/lib/importers/usfs-normalize";

const importedAt = "2026-08-16T00:00:00.000Z";

describe("normalizeUsfsFeature", () => {
  it("normalizes LineString and MultiLineString source features", () => {
    const collection = fixture as FeatureCollection;
    const normalized = collection.features
      .map((feature) => normalizeUsfsFeature(feature, importedAt))
      .filter((result) => result.feature)
      .map((result) => result.feature);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      id: "usfs-1001",
      sourceProvider: "USFS",
      trailName: "Fixture Ridge Trail",
      reconciliationStatus: "raw",
    });
    expect(normalized[1]?.geometry.type).toBe("MultiLineString");
    expect(normalized[1]?.segmentLength).toBe(2.5);
  });

  it("reports malformed or non-line geometry", () => {
    const collection = fixture as FeatureCollection;
    const result = normalizeUsfsFeature(collection.features[2], importedAt);

    expect(result.feature).toBeUndefined();
    expect(result.skippedReason).toContain("Unsupported geometry");
  });

  it("summarizes normalized source features", () => {
    const collection = fixture as FeatureCollection;
    const results = collection.features.map((feature) => normalizeUsfsFeature(feature, importedAt));
    const features = results.flatMap((result) => result.feature ? [result.feature] : []);
    const skipped = results.flatMap((result) => result.skippedReason ? [result.skippedReason] : []);
    const summary = buildSourceFeatureSummary(features, skipped);

    expect(summary.sourceFeatureCount).toBe(2);
    expect(summary.namedFeatureCount).toBe(2);
    expect(summary.uniqueTrailNameCount).toBe(2);
    expect(summary.totalSourceSegmentLength).toBe(3.75);
    expect(summary.malformedOrSkippedFeatureCount).toBe(1);
  });
});
