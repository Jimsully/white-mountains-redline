import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stableActivityKey } from "@/lib/activity-matching/activities";
import {
  buildReviewedEvidenceMaterialization,
  canonicalActivityMatchArtifactFingerprint,
  executeReviewedEvidenceMaterialization,
} from "@/lib/activity-matching/materialization";
import { stableMatchKey } from "@/lib/activity-matching/matcher";
import { buildActivityMatchDecision, buildActivityMatchDecisionExport } from "@/lib/activity-matching/review-state";
import type {
  ActivityMatchArtifact,
  ActivityMatchReviewDecisionExport,
  ActivitySource,
} from "@/types/activity-matching";

const root = process.cwd();
const targetUserId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-12-01T00:00:00.000Z");
const demoArtifact = JSON.parse(fs.readFileSync(path.join(root, "data/generated/activity-matching/demo-activity-matching.json"), "utf8")) as ActivityMatchArtifact;
const loaderScript = fs.readFileSync(path.join(root, "scripts/load-reviewed-evidence.ts"), "utf8");

function productionFixture(source: ActivitySource = "gpx") {
  const originalCandidate = demoArtifact.matchCandidates.find((candidate) => candidate.classification === "strong_candidate");
  if (!originalCandidate) throw new Error("Expected a strong demo candidate fixture.");
  const artifact = structuredClone(demoArtifact);
  const activity = artifact.activities.find((item) => item.activityKey === originalCandidate.activityKey);
  const segment = artifact.eligibleSegments.find((item) => item.segmentKey === originalCandidate.segmentKey);
  const candidate = artifact.matchCandidates.find((item) => item.key === originalCandidate.key);
  if (!activity || !segment || !candidate) throw new Error("Expected complete matching fixture references.");

  artifact.metadata = {
    ...artifact.metadata,
    generatedAt: "2026-08-20T12:00:00.000Z",
    demoOnly: false,
    segmentArtifactPath: "private path omitted",
    segmentDecisionsPath: "verified publication gate",
    activitiesPath: "private path omitted",
  };
  activity.source = source;
  activity.originalFilename = "private path omitted";
  activity.sourceMetadata = { sourcePath: "private path omitted", provider: "fixture" };
  activity.suppliedDistanceMeters = 1609.344;
  activity.activityKey = stableActivityKey(activity.source, activity.sourceActivityId, activity.startTime, activity.trace.geometry);
  segment.approvalEvidence.sourceSegmentArtifact = {
    ...segment.approvalEvidence.sourceSegmentArtifact,
    demoOnly: false,
  };
  candidate.activityKey = activity.activityKey;
  candidate.key = stableMatchKey(activity.activityKey, candidate.segmentKey);
  candidate.evidence.sourceActivityKey = activity.activityKey;
  artifact.activities = [activity];
  artifact.eligibleSegments = [segment];
  artifact.matchCandidates = [candidate];
  artifact.diagnostics = {
    ...artifact.diagnostics,
    activitiesLoaded: 1,
    eligibleSegmentCount: 1,
    pairsConsidered: 1,
    bboxRejectedPairs: 0,
    fullyScoredPairs: 1,
    strongCandidateCount: candidate.classification === "strong_candidate" ? 1 : 0,
    candidateCount: candidate.classification === "candidate" ? 1 : 0,
    needsReviewCount: candidate.classification === "needs_review" ? 1 : 0,
    insufficientCoverageCount: candidate.classification === "insufficient_coverage" ? 1 : 0,
    unmatchedActivityCount: 0,
    activitiesWithCandidateCount: 1,
    segmentsWithCandidateCount: 1,
    integrityWarnings: [],
    integrityErrors: [],
  };
  const decision = buildActivityMatchDecision(artifact, candidate.key, "accepted", "reviewed", "2026-08-21T12:00:00.000Z");
  const decisionExport = buildActivityMatchDecisionExport(artifact, [decision]) as ActivityMatchReviewDecisionExport;
  return { artifact, decisionExport, activity, candidate };
}

function materialize(source: ActivitySource = "gpx") {
  const fixture = productionFixture(source);
  return {
    ...fixture,
    payload: buildReviewedEvidenceMaterialization({
      artifact: fixture.artifact,
      decisionExport: fixture.decisionExport,
      targetUserId,
      now,
    }),
  };
}

describe("reviewed evidence materialization", () => {
  it("requires both artifact and review decisions plus an explicit UUID owner", () => {
    const fixture = productionFixture();
    expect(() => buildReviewedEvidenceMaterialization({ artifact: undefined, decisionExport: fixture.decisionExport, targetUserId, now })).toThrow("invalid shape");
    expect(() => buildReviewedEvidenceMaterialization({ artifact: fixture.artifact, decisionExport: undefined, targetUserId, now })).toThrow("review-decision export");
    expect(() => buildReviewedEvidenceMaterialization({ artifact: fixture.artifact, decisionExport: fixture.decisionExport, targetUserId: "not-a-user", now })).toThrow("exact auth user UUID");
  });

  it("maps an accepted decision to one private activity and evidence payload", () => {
    const { payload, activity, candidate } = materialize();
    expect(payload.summary).toMatchObject({ acceptedDecisionCount: 1, activitiesRequired: 1, evidenceCount: 1 });
    expect(payload.activities[0]).toEqual({
      activity_key: activity.activityKey,
      title: activity.title,
      activity_date: "2026-01-01",
      source: "gpx",
      geometry: activity.trace.geometry,
      distance_miles: 1,
    });
    expect(payload.evidence[0]).toMatchObject({
      activity_key: activity.activityKey,
      segment_key: candidate.segmentKey,
      match_key: candidate.key,
      decision: "accepted",
      evidence_source: "historical_gps",
      accepted_at: "2026-08-21T12:00:00.000Z",
      evidence: candidate.evidence,
    });
    expect(payload.evidence[0].provenance.activityDate).toBe("2026-01-01");
    expect(JSON.stringify(payload.evidence[0].provenance)).not.toMatch(/filename|sourcePath|private path omitted/i);
  });

  it("does not materialize rejected or needs-review decisions", () => {
    for (const decision of ["rejected", "needs_review"] as const) {
      const fixture = productionFixture();
      fixture.decisionExport.decisions[0].decision = decision;
      const payload = buildReviewedEvidenceMaterialization({ artifact: fixture.artifact, decisionExport: fixture.decisionExport, targetUserId, now });
      expect(payload.activities).toEqual([]);
      expect(payload.evidence).toEqual([]);
      expect(payload.summary.acceptedDecisionCount).toBe(0);
    }
  });

  it("rejects duplicate and stale review decisions", () => {
    const duplicate = productionFixture();
    duplicate.decisionExport.decisions.push(structuredClone(duplicate.decisionExport.decisions[0]));
    expect(() => buildReviewedEvidenceMaterialization({ artifact: duplicate.artifact, decisionExport: duplicate.decisionExport, targetUserId, now })).toThrow("Duplicate review decision");

    const conflictingDuplicate = productionFixture();
    const conflictingDecision = structuredClone(conflictingDuplicate.decisionExport.decisions[0]);
    conflictingDecision.decision = "rejected";
    conflictingDuplicate.decisionExport.decisions.push(conflictingDecision);
    expect(() => buildReviewedEvidenceMaterialization({ artifact: conflictingDuplicate.artifact, decisionExport: conflictingDuplicate.decisionExport, targetUserId, now })).toThrow("Duplicate review decision");

    const stale = productionFixture();
    stale.decisionExport.decisions[0].segmentKey = "segment_stale";
    expect(() => buildReviewedEvidenceMaterialization({ artifact: stale.artifact, decisionExport: stale.decisionExport, targetUserId, now })).toThrow("does not match its activity/segment candidate identity");

    const wrongArtifact = productionFixture();
    wrongArtifact.decisionExport.sourceArtifact.generatedAt = "2026-08-20T12:00:01.000Z";
    expect(() => buildReviewedEvidenceMaterialization({ artifact: wrongArtifact.artifact, decisionExport: wrongArtifact.decisionExport, targetUserId, now })).toThrow("identity does not match");
  });

  it("rejects demo artifacts, nested demo lineage, demo activities, and accepted manual activities", () => {
    const demo = productionFixture();
    demo.artifact.metadata.demoOnly = true;
    expect(() => buildReviewedEvidenceMaterialization({ artifact: demo.artifact, decisionExport: demo.decisionExport, targetUserId, now })).toThrow("Demo activity matching artifacts");

    const nested = productionFixture();
    nested.artifact.eligibleSegments[0].approvalEvidence.sourceSegmentArtifact.demoOnly = true;
    expect(() => buildReviewedEvidenceMaterialization({ artifact: nested.artifact, decisionExport: nested.decisionExport, targetUserId, now })).toThrow("non-demo upstream artifact identity");

    const demoSource = productionFixture();
    demoSource.artifact.activities[0].source = "demo";
    expect(() => buildReviewedEvidenceMaterialization({ artifact: demoSource.artifact, decisionExport: demoSource.decisionExport, targetUserId, now })).toThrow("Demo activity");

    expect(() => materialize("manual")).toThrow("cannot produce historical GPS evidence");
  });

  it("maps supported historical source values deterministically", () => {
    expect(materialize("gpx").payload.activities[0].source).toBe("gpx");
    expect(materialize("strava_export").payload.activities[0].source).toBe("strava");
    expect(materialize("normalized_json").payload.activities[0].source).toBe("other");
    expect(materialize("coros_export").payload.activities[0].source).toBe("other");
  });

  it("validates activity dates, geometry, distance, and future review timestamps", () => {
    const badDate = productionFixture();
    badDate.artifact.activities[0].startTime = "2026-02-30T00:00:00Z";
    badDate.artifact.activities[0].activityKey = stableActivityKey(badDate.artifact.activities[0].source, badDate.artifact.activities[0].sourceActivityId, badDate.artifact.activities[0].startTime, badDate.artifact.activities[0].trace.geometry);
    badDate.artifact.matchCandidates[0].activityKey = badDate.artifact.activities[0].activityKey;
    badDate.artifact.matchCandidates[0].key = stableMatchKey(badDate.artifact.activities[0].activityKey, badDate.artifact.matchCandidates[0].segmentKey);
    badDate.artifact.matchCandidates[0].evidence.sourceActivityKey = badDate.artifact.activities[0].activityKey;
    badDate.decisionExport = buildActivityMatchDecisionExport(badDate.artifact, [buildActivityMatchDecision(badDate.artifact, badDate.artifact.matchCandidates[0].key, "accepted", undefined, "2026-08-21T12:00:00.000Z")]) as ActivityMatchReviewDecisionExport;
    expect(() => buildReviewedEvidenceMaterialization({ artifact: badDate.artifact, decisionExport: badDate.decisionExport, targetUserId, now })).toThrow("invalid startTime calendar date");

    const badGeometry = productionFixture();
    badGeometry.artifact.activities[0].trace.geometry.coordinates = [[[-181, 44], [-71, 44]]];
    expect(() => buildReviewedEvidenceMaterialization({ artifact: badGeometry.artifact, decisionExport: badGeometry.decisionExport, targetUserId, now })).toThrow("invalid coordinate");

    const unsupportedSource = productionFixture();
    unsupportedSource.artifact.activities[0].source = "untrusted" as never;
    expect(() => buildReviewedEvidenceMaterialization({ artifact: unsupportedSource.artifact, decisionExport: unsupportedSource.decisionExport, targetUserId, now })).toThrow("unsupported source");

    const nonFiniteDistance = productionFixture();
    nonFiniteDistance.artifact.activities[0].suppliedDistanceMeters = Number.POSITIVE_INFINITY;
    expect(() => buildReviewedEvidenceMaterialization({ artifact: nonFiniteDistance.artifact, decisionExport: nonFiniteDistance.decisionExport, targetUserId, now })).toThrow("invalid suppliedDistanceMeters");

    const threeDimensional = productionFixture();
    threeDimensional.artifact.activities[0].trace.geometry.coordinates[0][0] = [-71, 44, 500];
    expect(() => buildReviewedEvidenceMaterialization({ artifact: threeDimensional.artifact, decisionExport: threeDimensional.decisionExport, targetUserId, now })).toThrow("two-dimensional coordinates");

    const malformedTimestamp = productionFixture();
    malformedTimestamp.decisionExport.decisions[0].reviewTimestamp = "not-a-timestamp";
    expect(() => buildReviewedEvidenceMaterialization({ artifact: malformedTimestamp.artifact, decisionExport: malformedTimestamp.decisionExport, targetUserId, now })).toThrow("malformed");

    const atSkewLimit = productionFixture();
    atSkewLimit.decisionExport.decisions[0].reviewTimestamp = "2026-12-01T00:05:00.000Z";
    expect(() => buildReviewedEvidenceMaterialization({ artifact: atSkewLimit.artifact, decisionExport: atSkewLimit.decisionExport, targetUserId, now })).not.toThrow();

    const future = productionFixture();
    future.decisionExport.decisions[0].reviewTimestamp = "2026-12-01T00:05:01.000Z";
    expect(() => buildReviewedEvidenceMaterialization({ artifact: future.artifact, decisionExport: future.decisionExport, targetUserId, now })).toThrow("materially in the future");
  });

  it("fingerprints semantic content while excluding volatile paths and generation time", () => {
    const first = productionFixture().artifact;
    const second = structuredClone(first);
    second.metadata.generatedAt = "2026-08-22T12:00:00.000Z";
    second.metadata.activitiesPath = "C:\\private\\different.gpx";
    second.metadata.segmentArtifactPath = "/private/different.json";
    second.activities[0].originalFilename = "different.gpx";
    second.activities[0].sourceMetadata = { sourcePath: "C:\\different" };
    expect(canonicalActivityMatchArtifactFingerprint(second)).toBe(canonicalActivityMatchArtifactFingerprint(first));
    second.config.endpointToleranceMeters += 1;
    expect(canonicalActivityMatchArtifactFingerprint(second)).not.toBe(canonicalActivityMatchArtifactFingerprint(first));
  });

  it("keeps evidence identity independent of review time while treating acceptedAt as immutable payload", () => {
    const first = productionFixture();
    const second = productionFixture();
    second.decisionExport.exportedAt = "2026-11-01T00:00:00.000Z";
    second.decisionExport.decisions[0].reviewTimestamp = "2026-08-22T12:00:00.000Z";
    const firstPayload = buildReviewedEvidenceMaterialization({ artifact: first.artifact, decisionExport: first.decisionExport, targetUserId, now });
    const secondPayload = buildReviewedEvidenceMaterialization({ artifact: second.artifact, decisionExport: second.decisionExport, targetUserId, now });
    expect(secondPayload.summary.artifactFingerprint).toBe(firstPayload.summary.artifactFingerprint);
    expect(secondPayload.evidence[0].evidence_key).toBe(firstPayload.evidence[0].evidence_key);
    expect(secondPayload.evidence[0].accepted_at).not.toBe(firstPayload.evidence[0].accepted_at);
  });

  it("performs no network callbacks in dry-run mode", async () => {
    const { payload } = materialize();
    const verifyUser = vi.fn(async () => undefined);
    const loadBatch = vi.fn(async () => ({ ok: true }));
    await expect(executeReviewedEvidenceMaterialization(payload, { load: false, verifyUser, loadBatch })).resolves.toEqual({ mode: "dry_run" });
    expect(verifyUser).not.toHaveBeenCalled();
    expect(loadBatch).not.toHaveBeenCalled();
    expect(payload.summary.payloadBytes).toBeGreaterThan(0);
  });

  it("keeps service credentials and database details out of CLI output", () => {
    expect(loaderScript).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(loaderScript).toContain("return requireSafeLoadResult(data)");
    expect(loaderScript).not.toMatch(/Supabase reviewed-evidence load failed[^";]*error\.message/);
    expect(loaderScript).not.toContain("JSON.stringify(outcome.result)");
    expect(loaderScript.match(/\.rpc\(/g)).toHaveLength(1);
  });
});