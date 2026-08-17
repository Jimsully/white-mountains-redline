import path from "node:path";
import { describe, expect, it } from "vitest";
import { runReconciliation } from "@/lib/reconciliation/run-reconciliation";

describe("reconciliation CLI runner", () => {
  it("uses the shared matcher and normalizer for demo reconciliation", () => {
    const result = runReconciliation({
      inventoryPath: "data/demo/challenge-inventory.demo.csv",
      repositoryRoot: process.cwd(),
      generatedAt: "2026-01-01T00:00:00.000Z",
      timestamp: 123,
    });

    expect(path.basename(result.outputPath)).toBe("demo-reconciliation.json");
    expect(result.artifact.summary.inventoryItemCount).toBe(6);
    expect(result.artifact.summary.exactMatchCount).toBe(6);
    expect(result.artifact.results.find((item) => item.item.itemKey === "demo-mount-tecumseh")?.candidates[0].sourceTrailDisplayName).toBe("MT TECUMSEH");
    expect(result.artifact.metadata.inventoryPath).toBe(path.join("data", "demo", "challenge-inventory.demo.csv"));
  });
});
