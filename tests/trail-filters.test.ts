import { describe, expect, it } from "vitest";
import { demoTrails } from "@/data/demo-trails";
import { filterTrailSegments } from "@/lib/trail-filters";

describe("filterTrailSegments", () => {
  it("filters by trail-name search", () => {
    const filtered = filterTrailSegments(demoTrails, { region: "all", query: "ridge", completion: "all" });

    expect(filtered.map((segment) => segment.id)).toEqual(["demo-1", "demo-2"]);
  });

  it("filters by completion state", () => {
    const completed = filterTrailSegments(demoTrails, { region: "all", query: "", completion: "completed" });
    const incomplete = filterTrailSegments(demoTrails, { region: "all", query: "", completion: "incomplete" });

    expect(completed).toHaveLength(2);
    expect(incomplete).toHaveLength(3);
    expect(completed.every((segment) => segment.completed)).toBe(true);
    expect(incomplete.every((segment) => !segment.completed)).toBe(true);
  });

  it("filters by region", () => {
    const filtered = filterTrailSegments(demoTrails, {
      region: "Presidential Range",
      query: "",
      completion: "all",
    });

    expect(filtered).toEqual([]);
  });
});
