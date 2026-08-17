import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSegmentDecision, buildSegmentDecisionExport, parseStoredSegmentDecisions } from "@/lib/segment-construction/review-state";
import { getSegmentConstructionOutputPath, isDemoSegmentInput } from "@/lib/segment-construction/paths";
import { loadSegmentConstructionArtifact, PRIVATE_SEGMENT_ARTIFACT_PRODUCTION_ERROR } from "@/lib/segment-construction/server-artifact";
import { runSegmentConstruction } from "@/lib/segment-construction/run-segment-construction";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";

const demoArtifact: SegmentConstructionArtifact = {
  metadata: { generatedAt: "2026-01-01T00:00:00Z", demoOnly: true, algorithmVersion: "segment-construction-v1", warning: "demo", reconciliationArtifactPath: "data/generated/reconciliation/demo-reconciliation.json", decisionsPath: "data/demo/reconciliation-decisions.demo.json" },
  tolerances: { endpointSnapToleranceMeters: 12, intersectionToleranceMeters: 8, minimumSegmentLengthMeters: 20 },
  acceptedTrailSources: [],
  junctionCandidates: [],
  segmentCandidates: [],
  diagnostics: { acceptedTrailSourceCount: 0, junctionCandidateCount: 0, exactIntersectionCount: 0, nearIntersectionWarningCount: 0, segmentCandidateCount: 0, shortSegmentWarningCount: 0, disconnectedComponentCount: 0, sourceFeatureBoundaryCount: 0, inputGeometryMiles: 0, outputSegmentMiles: 0, lengthDeltaMiles: 0, warnings: [] },
};

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