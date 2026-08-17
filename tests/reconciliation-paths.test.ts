import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatInventoryPathForArtifact, getReconciliationOutputPath, isDemoInventoryPath } from "@/lib/reconciliation/paths";

describe("reconciliation inventory path classification", () => {
  const root = path.resolve("/repo");

  it("treats only files genuinely under data/demo as demo inventory", () => {
    const demoPath = path.join(root, "data", "demo", "challenge-inventory.demo.csv");
    expect(isDemoInventoryPath(demoPath, root)).toBe(true);
    expect(isDemoInventoryPath(path.join(root, "data", "demo", "nested", "fixture.csv"), root)).toBe(true);
    expect(formatInventoryPathForArtifact(demoPath, root)).toBe(path.join("data", "demo", "challenge-inventory.demo.csv"));
  });

  it("does not classify sibling or arbitrary .demo.csv paths as demo inventory", () => {
    const privatePath = path.join(root, "data", "local", "challenge-inventory", "private.demo.csv");
    expect(isDemoInventoryPath(privatePath, root)).toBe(false);
    expect(isDemoInventoryPath(path.join(root, "data", "demo-private", "file.csv"), root)).toBe(false);
    expect(formatInventoryPathForArtifact(privatePath, root)).toBe("local/private inventory path omitted");
    expect(getReconciliationOutputPath(privatePath, root, 123)).toBe(path.join(root, "data", "generated", "reconciliation", "reconciliation.local.123.json"));
  });

  it("lets native path semantics decide case sensitivity", () => {
    const mixedCasePath = path.join(root, "data", "Demo", "file.csv");
    const expected = process.platform === "win32";
    expect(isDemoInventoryPath(mixedCasePath, root)).toBe(expected);
  });
});