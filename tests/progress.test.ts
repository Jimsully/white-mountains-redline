import { describe, expect, it } from "vitest";
import { demoTrails } from "@/data/demo-trails";
import { calculateProgress } from "@/lib/progress";
import { filterTrailSegments, hasActiveTrailFilters } from "@/lib/trail-filters";

describe("calculateProgress", () => {
  it("calculates mileage and segment completion", () => {
    const progress = calculateProgress(demoTrails);

    expect(progress.totalMiles).toBeCloseTo(14.8);
    expect(progress.completedMiles).toBeCloseTo(4.6);
    expect(progress.completedSegments).toBe(2);
    expect(progress.totalSegments).toBe(5);
    expect(progress.segmentPercent).toBe(40);
  });

  it("handles empty segment lists", () => {
    expect(calculateProgress([])).toEqual({
      totalMiles: 0,
      completedMiles: 0,
      completedSegments: 0,
      totalSegments: 0,
      mileagePercent: 0,
      segmentPercent: 0,
    });
  });

  it("keeps overall progress separate from filtered progress", () => {
    const filters = { region: "all" as const, query: "North segment", completion: "completed" as const };
    const visibleSegments = filterTrailSegments(demoTrails, filters);
    const overall = calculateProgress(demoTrails);
    const filtered = calculateProgress(visibleSegments);

    expect(hasActiveTrailFilters(filters)).toBe(true);
    expect(visibleSegments).toHaveLength(1);
    expect(filtered.mileagePercent).toBe(100);
    expect(overall.mileagePercent).toBeLessThan(100);
  });
});
