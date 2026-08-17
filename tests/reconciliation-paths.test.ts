import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatInventoryPathForArtifact, getReconciliationOutputPath, isDemoInventoryPath } from "@/lib/reconciliation/paths";

describe("reconciliation inventory path classification", () => {
  const root = path.resolve("/repo");

  it("treats only files under data/demo as demo inventory", () => {
    expect(isDemoInventoryPath(path.join(root, "data", "demo", "challenge-inventory.demo.csv"), root)).toBe(true);
    expect(formatInventoryPathForArtifact(path.join(root, "data", "demo", "challenge-inventory.demo.csv"), root)).toBe(path.join("data", "demo", "challenge-inventory.demo.csv"));
  });

  it("does not classify arbitrary .demo.csv files as demo inventory", () => {
    const privatePath = path.join(root, "data", "local", "challenge-inventory", "private.demo.csv");
    expect(isDemoInventoryPath(privatePath, root)).toBe(false);
    expect(formatInventoryPathForArtifact(privatePath, root)).toBe("local/private inventory path omitted");
    expect(getReconciliationOutputPath(privatePath, root, 123)).toBe(path.join(root, "data", "generated", "reconciliation", "reconciliation.local.123.json"));
  });
});
