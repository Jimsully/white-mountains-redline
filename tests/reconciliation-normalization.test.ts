import { describe, expect, it } from "vitest";
import { normalizeTrailName, normalizedNameSimilarity, tokenOverlap } from "@/lib/reconciliation/name-normalization";

describe("normalizeTrailName", () => {
  it("normalizes case, whitespace, punctuation, suffixes, and abbreviations", () => {
    expect(normalizeTrailName("  Mt. Tecumseh Trail ")).toBe("MOUNT TECUMSEH");
    expect(normalizeTrailName("Greeley-Ponds TrAiL")).toBe("GREELEY PONDS");
    expect(normalizeTrailName("Lincoln Woods Rd")).toBe("LINCOLN WOODS ROAD");
    expect(normalizeTrailName("Webster & Jackson Trail")).toBe("WEBSTER AND JACKSON");
    expect(normalizeTrailName("Black Mtn. Pond Trail")).toBe("BLACK MOUNTAIN POND");
  });

  it("scores similarity and token overlap deterministically", () => {
    expect(normalizedNameSimilarity("FRANCONIA RIDGE", "FRANCONIA RIDGE")).toBe(1);
    expect(tokenOverlap("GARFIELD RIDGE", "FRANCONIA RIDGE")).toBe(0.5);
  });
});
