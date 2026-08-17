import { describe, expect, it } from "vitest";
import { loadReconciliationArtifact, PRIVATE_ARTIFACT_PRODUCTION_ERROR } from "@/lib/reconciliation/server-artifact";
import type { ReconciliationArtifact } from "@/types/reconciliation";

const demoArtifact: ReconciliationArtifact = {
  metadata: { generatedAt: "2026-01-01T00:00:00.000Z", demoOnly: true, sourceFeatureCount: 0, sourceTrailGroupCount: 0, warning: "demo", inventoryPath: "data/demo/demo.csv" },
  summary: { inventoryItemCount: 0, exactMatchCount: 0, candidateFoundCount: 0, unmatchedCount: 0, ambiguousCount: 0, sourceTrailGroupCount: 0 },
  results: [],
  sourceTrailGroups: [],
};

describe("reconciliation artifact server loader", () => {
  it("allows the committed demo artifact in production when no private path is configured", () => {
    expect(loadReconciliationArtifact(demoArtifact, { NODE_ENV: "production" }).metadata.inventoryPath).toBe("data/demo/demo.csv");
  });

  it("fails safely when a private artifact path is configured in production", () => {
    expect(() => loadReconciliationArtifact(demoArtifact, { NODE_ENV: "production", RECONCILIATION_ARTIFACT_PATH: "private.json" })).toThrow(PRIVATE_ARTIFACT_PRODUCTION_ERROR);
  });
});