import { describe, expect, it } from "vitest";
import { demoTrails } from "@/data/demo-trails";
import { calculateProgress } from "@/lib/progress";

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
});
