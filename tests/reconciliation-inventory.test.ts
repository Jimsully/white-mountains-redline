import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateChallengeInventoryCsv } from "@/lib/reconciliation/inventory";

describe("validateChallengeInventoryCsv", () => {
  it("parses valid CSV and reports duplicate normalized names", () => {
    const result = validateChallengeInventoryCsv(readFileSync("tests/fixtures/reconciliation/inventory-valid.csv", "utf8"));
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].displayName).toBe("Mount Tecumseh Trail");
    expect(result.items[0].normalizedName).toBe("MOUNT TECUMSEH");
    expect(result.duplicateNormalizedNames).toEqual(["MOUNT TECUMSEH"]);
  });

  it("reports duplicate IDs and required field errors with row numbers", () => {
    const result = validateChallengeInventoryCsv(readFileSync("tests/fixtures/reconciliation/inventory-invalid.csv", "utf8"));
    expect(result.errors).toContain("Row 3: duplicate item_key 'one'.");
    expect(result.errors).toContain("Row 4: item_key is required.");
    expect(result.errors).toContain("Row 5: name is required.");
  });
});
