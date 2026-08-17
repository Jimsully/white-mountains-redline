import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runReconciliation } from "@/lib/reconciliation/run-reconciliation";

const repoRoot = process.cwd();
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wmr-reconcile-"));
  fs.mkdirSync(path.join(tempRoot, "data", "demo"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "data", "staging", "usfs", "franconia-pemi"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "data", "demo", "challenge-inventory.demo.csv"), path.join(tempRoot, "data", "demo", "challenge-inventory.demo.csv"));
  fs.copyFileSync(path.join(repoRoot, "data", "staging", "usfs", "franconia-pemi", "source-features.json"), path.join(tempRoot, "data", "staging", "usfs", "franconia-pemi", "source-features.json"));
});

afterEach(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("reconciliation CLI runner", () => {
  it("uses the shared matcher and normalizer for demo reconciliation without writing tracked generated data", () => {
    const trackedOutput = path.join(repoRoot, "data", "generated", "reconciliation", "demo-reconciliation.json");
    const trackedBefore = fs.readFileSync(trackedOutput, "utf8");

    const result = runReconciliation({
      inventoryPath: "data/demo/challenge-inventory.demo.csv",
      repositoryRoot: tempRoot,
      generatedAt: "2026-01-01T00:00:00.000Z",
      timestamp: 123,
    });

    expect(path.basename(result.outputPath)).toBe("demo-reconciliation.json");
    expect(path.relative(tempRoot, result.outputPath).startsWith("data")).toBe(true);
    expect(path.relative(repoRoot, result.outputPath).startsWith("..")).toBe(true);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(fs.readFileSync(trackedOutput, "utf8")).toBe(trackedBefore);
    expect(result.artifact.summary.inventoryItemCount).toBe(6);
    expect(result.artifact.summary.exactMatchCount).toBe(6);
    expect(result.artifact.results.find((item) => item.item.itemKey === "demo-mount-tecumseh")?.candidates[0].sourceTrailDisplayName).toBe("MT TECUMSEH");
    expect(result.artifact.metadata.inventoryPath).toBe(path.join("data", "demo", "challenge-inventory.demo.csv"));
  });
});