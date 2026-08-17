import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptedTrailSourcesFromReconciliation, resolveAcceptedTrailSourcesFromReconciliation } from "@/lib/segment-construction/accepted-sources";
import { getSegmentConstructionOutputPath, isDemoSegmentInput } from "@/lib/segment-construction/paths";
import { buildSegmentDecision, buildSegmentDecisionExport, parseStoredSegmentDecisions } from "@/lib/segment-construction/review-state";
import { runSegmentConstruction } from "@/lib/segment-construction/run-segment-construction";
import { loadSegmentConstructionArtifact, PRIVATE_SEGMENT_ARTIFACT_PRODUCTION_ERROR } from "@/lib/segment-construction/server-artifact";
import type { ReconciliationArtifact, ReconciliationDecision } from "@/types/reconciliation";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";

const demoArtifact: SegmentConstructionArtifact = {
  metadata: { generatedAt: "2026-01-01T00:00:00Z", demoOnly: true, algorithmVersion: "segment-construction-v1", warning: "demo", reconciliationArtifactPath: "data/generated/reconciliation/demo-reconciliation.json", decisionsPath: "data/demo/reconciliation-decisions.demo.json" },
  tolerances: { endpointSnapToleranceMeters: 12, intersectionToleranceMeters: 8, junctionDeduplicationToleranceMeters: 1, sameTrailAutoConnectToleranceMeters: 1, geometryLengthEpsilonMeters: 0.25, minimumSegmentLengthMeters: 20 },
  acceptedTrailSources: [],
  junctionCandidates: [],
  segmentCandidates: [],
  diagnostics: { acceptedTrailSourceCount: 0, junctionCandidateCount: 0, exactIntersectionCount: 0, nearIntersectionWarningCount: 0, sameTrailNearConnectionWarningCount: 0, segmentCandidateCount: 0, shortSegmentWarningCount: 0, disconnectedComponentCount: 0, coarseSourceComponentBoundaryCount: 0, excessiveSpreadJunctionCount: 0, sameTrailSourceBoundarySnapCount: 0, sameTrailSourceBoundarySnapMeters: 0, maxSameTrailSourceBoundarySnapMeters: 0, inputGeometryMeters: 0, outputGeometryMeters: 0, lengthDeltaMeters: 0, inputGeometryMiles: 0, outputSegmentMiles: 0, lengthDeltaMiles: 0, warnings: [], integrityWarnings: [], integrityErrors: [] },
};

function reconciliationArtifact(featureIds = ["source-1"]): ReconciliationArtifact {
  return {
    metadata: { generatedAt: "2026-01-01T00:00:00Z", demoOnly: true, sourceFeatureCount: featureIds.length, sourceTrailGroupCount: 1, warning: "demo" },
    summary: { inventoryItemCount: 1, exactMatchCount: 1, candidateFoundCount: 1, unmatchedCount: 0, ambiguousCount: 0, sourceTrailGroupCount: 1 },
    results: [{
      item: { itemKey: "alpha", displayName: "Alpha Trail", normalizedName: "ALPHA", reviewStatus: "candidate_found" },
      candidates: [{ inventoryItemKey: "alpha", sourceTrailNormalizedName: "ALPHA", sourceTrailDisplayName: "Alpha Trail", score: 100, evidence: { exactNormalizedName: true, normalizedSimilarity: 1, tokenOverlap: 1, sourceFeatureCount: featureIds.length, sourceGisMiles: 1.2, sourceFeatureIds: featureIds, reasons: ["fixture"] } }],
      status: "exact",
    }],
    sourceTrailGroups: [{ displayName: "Alpha Trail", normalizedName: "ALPHA", sourceFeatureCount: featureIds.length, sourceFeatureIds: featureIds, totalGisMiles: 1.2, bbox: [0, 0, 1, 1], geometry: { type: "MultiLineString", coordinates: [[[0, 0], [0.001, 0]]] }, sourceProvider: "fixture", originalSourceNames: ["Alpha Trail"] }],
  };
}

function acceptedDecision(overrides: Partial<ReconciliationDecision> = {}): ReconciliationDecision {
  return { inventoryItemKey: "alpha", selectedCandidateNormalizedName: "ALPHA", selectedSourceFeatureIds: ["source-1"], decision: "accepted", reviewTimestamp: "2026-01-01T00:00:00Z", ...overrides };
}

let tempRoot = "";
const repoRoot = process.cwd();

beforeEach(() => { tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wmr-segments-")); });
afterEach(() => { if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true }); });

describe("segment construction support", () => {
  it("classifies only committed demo inputs as demo-safe", () => {
    expect(isDemoSegmentInput(path.join(repoRoot, "data", "generated", "reconciliation", "demo-reconciliation.json"), path.join(repoRoot, "data", "demo", "reconciliation-decisions.demo.json"), repoRoot)).toBe(true);
    expect(isDemoSegmentInput(path.join(repoRoot, "data", "generated", "reconciliation", "demo-reconciliation.json"), path.join(repoRoot, "data", "demo-private", "decisions.json"), repoRoot)).toBe(false);
    expect(getSegmentConstructionOutputPath("private-recon.json", "private-decisions.json", repoRoot, 123)).toContain("segment-construction.local.123.json");
  });

  it("guards private segment artifacts in production", () => {
    expect(loadSegmentConstructionArtifact(demoArtifact, { NODE_ENV: "production" }).metadata.demoOnly).toBe(true);
    expect(() => loadSegmentConstructionArtifact(demoArtifact, { NODE_ENV: "production", SEGMENT_CONSTRUCTION_ARTIFACT_PATH: "private.json" })).toThrow(PRIVATE_SEGMENT_ARTIFACT_PRODUCTION_ERROR);
  });

  it("requires accepted reconciliation decisions to identify a consistent candidate", () => {
    const artifact = reconciliationArtifact();
    expect(resolveAcceptedTrailSourcesFromReconciliation(artifact, { decisions: [acceptedDecision({ selectedCandidateNormalizedName: undefined })] }).errors[0]).toContain("selectedCandidateNormalizedName is required");
    expect(resolveAcceptedTrailSourcesFromReconciliation(artifact, { decisions: [acceptedDecision({ selectedCandidateNormalizedName: "STALE" })] }).errors[0]).toContain("selected candidate 'STALE' not found");
    expect(() => acceptedTrailSourcesFromReconciliation(artifact, { decisions: [acceptedDecision({ selectedCandidateNormalizedName: "STALE" })] })).toThrow("selected candidate 'STALE' not found");
  });

  it("requires accepted decisions to select the full source-feature set", () => {
    const artifact = reconciliationArtifact(["source-1", "source-2"]);
    expect(resolveAcceptedTrailSourcesFromReconciliation(artifact, { decisions: [acceptedDecision({ selectedSourceFeatureIds: ["source-1"] })] }).errors[0]).toContain("must exactly match");
    expect(resolveAcceptedTrailSourcesFromReconciliation(artifact, { decisions: [acceptedDecision({ selectedSourceFeatureIds: ["source-1", "source-3"] })] }).errors[0]).toContain("must exactly match");
    const accepted = acceptedTrailSourcesFromReconciliation(artifact, { decisions: [acceptedDecision({ selectedSourceFeatureIds: ["source-2", "source-1"] })] });
    expect(accepted[0].sourceFeatureIds).toEqual(["source-1", "source-2"]);
  });

  it("marks accepted source component provenance as coarse", () => {
    const [source] = acceptedTrailSourcesFromReconciliation(reconciliationArtifact(), { decisions: [acceptedDecision()] });
    expect(source.sourceFeatureIds).toEqual(["source-1"]);
    expect(source.componentProvenance?.[0].sourceFeatureIds).toEqual(["source-1"]);
    expect(source.componentProvenance?.[0].provenancePrecision).toBe("coarse");
    expect(source.warnings).toContain("component_source_feature_provenance_is_coarse");
  });

  it("exports prototype review decisions with algorithm context", () => {
    const decision = buildSegmentDecision("segment", "segment_1", "accepted", "looks right", "2026-01-01T00:00:00Z");
    const exported = buildSegmentDecisionExport(demoArtifact, [decision]);
    expect(exported.warning).toContain("not published completion segments");
    expect(exported.decisions[0].notes).toBe("looks right");
    expect(parseStoredSegmentDecisions("not json")).toEqual({});
  });

  it("builds segment artifacts in a temp repository without mutating tracked generated data", () => {
    fs.mkdirSync(path.join(tempRoot, "data", "generated", "reconciliation"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "data", "demo"), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, "data", "generated", "reconciliation", "demo-reconciliation.json"), path.join(tempRoot, "data", "generated", "reconciliation", "demo-reconciliation.json"));
    fs.copyFileSync(path.join(repoRoot, "data", "demo", "reconciliation-decisions.demo.json"), path.join(tempRoot, "data", "demo", "reconciliation-decisions.demo.json"));
    const trackedOutput = path.join(repoRoot, "data", "generated", "segments", "demo-segment-construction.json");
    const trackedBefore = fs.existsSync(trackedOutput) ? fs.readFileSync(trackedOutput, "utf8") : "";
    const result = runSegmentConstruction({ repositoryRoot: tempRoot, reconciliationPath: "data/generated/reconciliation/demo-reconciliation.json", decisionsPath: "data/demo/reconciliation-decisions.demo.json", generatedAt: "2026-01-01T00:00:00Z" });
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(path.relative(tempRoot, result.outputPath).startsWith("data")).toBe(true);
    expect(fs.existsSync(trackedOutput) ? fs.readFileSync(trackedOutput, "utf8") : "").toBe(trackedBefore);
  });
});
