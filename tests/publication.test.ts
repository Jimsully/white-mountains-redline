import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VerifiedNetworkArtifact } from "@/types/publication";
import { PUBLICATION_ALGORITHM_VERSION } from "@/types/publication";
import { buildVerifiedNetworkArtifact, runPublicationBuild, validateVerifiedNetworkArtifact } from "@/lib/publication/builder";
import { buildPublicationLoadPayload } from "@/lib/publication/loader";
import { loadPublicationArtifact, PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR } from "@/lib/publication/server-artifact";
import { verifiedNetworkToEligibleMatchingSegments, verifiedNetworkToTrailSegments } from "@/lib/publication/adapters";
import { buildActivityMatchArtifact } from "@/lib/activity-matching/matcher";
import { parseNormalizedActivities } from "@/lib/activity-matching/activities";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";
import type { SegmentConstructionDecisionExport } from "@/types/activity-matching";
import { runActivityMatchingFromVerifiedNetwork } from "@/lib/activity-matching/run-activity-matching";
import { buildPublicationDecisionExport, mergePublicationDecisionOverrides } from "@/lib/publication/review-state";

const root = process.cwd();
const segmentArtifact = JSON.parse(fs.readFileSync(path.join(root, "data/generated/segments/demo-segment-construction.json"), "utf8")) as SegmentConstructionArtifact;
const segmentDecisions = JSON.parse(fs.readFileSync(path.join(root, "data/demo/segment-construction-decisions.demo.json"), "utf8")) as SegmentConstructionDecisionExport;
const publicationDecisions = JSON.parse(fs.readFileSync(path.join(root, "data/demo/publication-decisions.demo.json"), "utf8"));

function demoArtifact(overrides: Partial<Parameters<typeof buildVerifiedNetworkArtifact>[0]> = {}) {
  return buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true, ...overrides });
}

function productionArtifact() {
  const artifact = cloneArtifact(demoArtifact());
  artifact.metadata.demoOnly = false;
  if (artifact.metadata.publicationDecisionExport?.sourceArtifact) artifact.metadata.publicationDecisionExport.sourceArtifact.demoOnly = false;
  if (artifact.metadata.publicationDecisionExport?.sourceSegmentDecisions?.sourceArtifact) artifact.metadata.publicationDecisionExport.sourceSegmentDecisions.sourceArtifact.demoOnly = false;
  for (const segment of artifact.candidateSegments) segment.sourceSegmentArtifact.demoOnly = false;
  for (const segment of artifact.trailSegments) segment.provenance.sourceSegmentArtifact.demoOnly = false;
  return artifact;
}

function cloneArtifact(artifact: VerifiedNetworkArtifact): VerifiedNetworkArtifact {
  return JSON.parse(JSON.stringify(artifact)) as VerifiedNetworkArtifact;
}

function withTempArtifact(artifact: VerifiedNetworkArtifact, callback: (artifactPath: string, tempRoot: string) => void) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "publication-artifact-"));
  const artifactPath = path.join(tempRoot, "artifact.json");
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  try { callback(artifactPath, tempRoot); } finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
}

describe("verified publication gate", () => {
  it("publishes only explicitly verified trails and segments with production-shaped records", () => {
    const artifact = demoArtifact();
    expect(artifact.diagnostics.integrityErrors).toEqual([]);
    expect(artifact.diagnostics.candidateTrailCount).toBe(3);
    expect(artifact.diagnostics.candidateSegmentCount).toBe(4);
    expect(artifact.diagnostics.verifiedTrailCount).toBe(3);
    expect(artifact.diagnostics.verifiedSegmentCount).toBe(4);
    expect(artifact.publicationDecisions).toHaveLength(publicationDecisions.decisions.length);
    expect(artifact.trailSegments.every((segment) => segment.dataStatus === "verified" && segment.verificationStatus === "human_verified" && segment.completed === false)).toBe(true);
    expect(verifiedNetworkToTrailSegments(artifact)).toHaveLength(4);
  });

  it("requires matching source artifact and segment-decision lineage", () => {
    const stale = { ...publicationDecisions, sourceArtifact: { ...publicationDecisions.sourceArtifact, generatedAt: "stale" } };
    const artifact = buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions: stale, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true });
    expect(artifact.diagnostics.integrityErrors).toContain("Publication decisions were produced from a different segment-construction artifact timestamp.");
  });

  it("preserves rejected and needs-review decisions without publishing those records", () => {
    const firstTrail = publicationDecisions.decisions.find((decision: { targetType: string }) => decision.targetType === "trail");
    const firstSegment = publicationDecisions.decisions.find((decision: { targetType: string }) => decision.targetType === "segment");
    const mixed = { ...publicationDecisions, decisions: publicationDecisions.decisions.map((decision: { targetKey: string }) => decision.targetKey === firstTrail.targetKey ? { ...decision, decision: "needs_review" } : decision.targetKey === firstSegment.targetKey ? { ...decision, decision: "rejected" } : decision) };
    const artifact = buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions: mixed, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true });
    expect(artifact.publicationDecisions.find((decision) => decision.targetKey === firstTrail.targetKey)?.decision).toBe("needs_review");
    expect(artifact.publicationDecisions.find((decision) => decision.targetKey === firstSegment.targetKey)?.decision).toBe("rejected");
    expect(artifact.trails.some((trail) => trail.provenance.candidateTrailKey === firstTrail.targetKey)).toBe(false);
    expect(artifact.trailSegments.some((segment) => segment.provenance.candidateSegmentKey === firstSegment.targetKey)).toBe(false);
  });

  it("rejects runtime artifact tampering even when diagnostics claim no errors", () => {
    const artifact = demoArtifact();
    const tampered: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], verificationStatus: "needs_reconciliation" as never }, ...artifact.trailSegments.slice(1)], diagnostics: { ...artifact.diagnostics, integrityErrors: [] } };
    expect(() => verifiedNetworkToEligibleMatchingSegments(tampered)).toThrow("Verified publication artifact failed integrity validation");
    expect(() => buildPublicationLoadPayload({ ...tampered, metadata: { ...tampered.metadata, demoOnly: false } })).toThrow("Verified publication artifact failed integrity validation");
  });

  it("rejects published records with non-verified publication decisions", () => {
    const artifact = demoArtifact();
    const tampered: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], provenance: { ...artifact.trailSegments[0].provenance, publicationDecision: { ...artifact.trailSegments[0].provenance.publicationDecision, decision: "needs_review" } } }, ...artifact.trailSegments.slice(1)] };
    expect(validateVerifiedNetworkArtifact(tampered).some((error) => error.includes("embedded segment publication decision does not match canonical publication decision"))).toBe(true);
  });

  it("rejects tampered upstream topology decisions", () => {
    const artifact = demoArtifact();
    const tampered: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], provenance: { ...artifact.trailSegments[0].provenance, upstreamDecisions: { ...artifact.trailSegments[0].provenance.upstreamDecisions, startJunctionDecision: { ...artifact.trailSegments[0].provenance.upstreamDecisions.startJunctionDecision, decision: "rejected" } } } }, ...artifact.trailSegments.slice(1)] };
    expect(validateVerifiedNetworkArtifact(tampered).some((error) => error.includes("upstream start junction decision is not accepted"))).toBe(true);
  });

  it("validates malformed and out-of-range publication geometry", () => {
    const artifact = demoArtifact();
    const onePoint: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], coordinates: [artifact.trailSegments[0].coordinates[0]] }, ...artifact.trailSegments.slice(1)] };
    expect(validateVerifiedNetworkArtifact(onePoint)).toContain(`Segment ${artifact.trailSegments[0].id} has malformed geometry.`);
    const outOfRangeLon: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], coordinates: [[-181, 44], artifact.trailSegments[0].coordinates[1]] }, ...artifact.trailSegments.slice(1)] };
    expect(validateVerifiedNetworkArtifact(outOfRangeLon).some((error) => error.includes("out-of-range longitude"))).toBe(true);
    const outOfRangeLat: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], coordinates: [[-71, 91], artifact.trailSegments[0].coordinates[1]] }, ...artifact.trailSegments.slice(1)] };
    expect(validateVerifiedNetworkArtifact(outOfRangeLat).some((error) => error.includes("out-of-range latitude"))).toBe(true);
    const nonFinite: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], coordinates: [[Number.NaN, 44], artifact.trailSegments[0].coordinates[1]] }, ...artifact.trailSegments.slice(1)] };
    expect(validateVerifiedNetworkArtifact(nonFinite).some((error) => error.includes("non-finite coordinate"))).toBe(true);
  });

  it("rejects changing only the top-level demo flag before publication loading", () => {
    const artifact = demoArtifact();
    expect(artifact.diagnostics.integrityErrors).toEqual([]);
    const tampered = cloneArtifact(artifact);
    tampered.metadata.demoOnly = false;
    tampered.diagnostics.integrityErrors = [];
    expect(() => buildPublicationLoadPayload(tampered)).toThrow("Verified publication artifact failed integrity validation");
  });

  it("validates the default demo artifact before public adapter mapping", () => {
    const artifact = demoArtifact();
    const tampered = cloneArtifact(artifact);
    tampered.trailSegments[0].verificationStatus = "needs_reconciliation" as never;
    tampered.diagnostics.integrityErrors = [];
    expect(() => verifiedNetworkToTrailSegments(tampered)).toThrow("Verified publication artifact failed integrity validation");
    expect(() => loadPublicationArtifact(tampered, { NODE_ENV: "test" } as NodeJS.ProcessEnv)).toThrow("Verified publication artifact failed integrity validation");
  });

  it("rejects published segment geometry, mileage, and source-feature tampering", () => {
    const artifact = productionArtifact();
    const geometryTampered = cloneArtifact(artifact);
    geometryTampered.trailSegments[0].coordinates[0][0] += 0.000001;
    expect(validateVerifiedNetworkArtifact(geometryTampered).some((error) => error.includes("geometry does not match candidate geometry"))).toBe(true);
    expect(() => buildPublicationLoadPayload(geometryTampered)).toThrow("Verified publication artifact failed integrity validation");

    const mileageTampered = cloneArtifact(artifact);
    mileageTampered.trailSegments[0].miles += 0.01;
    expect(validateVerifiedNetworkArtifact(mileageTampered).some((error) => error.includes("mileage does not match candidate mileage"))).toBe(true);
    expect(() => buildPublicationLoadPayload(mileageTampered)).toThrow("Verified publication artifact failed integrity validation");

    const sourceTampered = cloneArtifact(artifact);
    sourceTampered.trailSegments[0].sourceFeatureIds = ["changed-source-feature"];
    expect(validateVerifiedNetworkArtifact(sourceTampered).some((error) => error.includes("source feature IDs do not match candidate"))).toBe(true);
    expect(() => buildPublicationLoadPayload(sourceTampered)).toThrow("Verified publication artifact failed integrity validation");
  });

  it("rejects published trail metadata tampering", () => {
    const artifact = productionArtifact();
    const regionTampered = cloneArtifact(artifact);
    regionTampered.trails[0].region = "Presidential Range";
    expect(validateVerifiedNetworkArtifact(regionTampered).some((error) => error.includes("region does not match canonical trail metadata"))).toBe(true);
    expect(() => buildPublicationLoadPayload(regionTampered)).toThrow("Verified publication artifact failed integrity validation");

    const nameTampered = cloneArtifact(artifact);
    nameTampered.trails[0].name = "Changed Trail Name";
    nameTampered.trailSegments = nameTampered.trailSegments.map((segment) => segment.trailId === nameTampered.trails[0].id ? { ...segment, trailName: "Changed Trail Name" } : segment);
    expect(validateVerifiedNetworkArtifact(nameTampered).some((error) => error.includes("name does not match canonical trail metadata"))).toBe(true);
    expect(() => buildPublicationLoadPayload(nameTampered)).toThrow("Verified publication artifact failed integrity validation");
  });

  it("rejects candidate and source-segment candidate binding tampering", () => {
    const artifact = productionArtifact();
    const candidateGeometryTampered = cloneArtifact(artifact);
    candidateGeometryTampered.candidateSegments[0].sourceSegmentCandidate.geometry.coordinates[0][0] += 0.000001;
    expect(validateVerifiedNetworkArtifact(candidateGeometryTampered).some((error) => error.includes("source segment candidate geometry does not match"))).toBe(true);

    const candidateFeatureTampered = cloneArtifact(artifact);
    candidateFeatureTampered.trailSegments[0].provenance.sourceSegmentCandidate.sourceFeatureIds = ["changed-source-feature"];
    expect(validateVerifiedNetworkArtifact(candidateFeatureTampered).some((error) => error.includes("source segment candidate source feature IDs do not match"))).toBe(true);
  });

  it("requires embedded publication decisions to match canonical decisions exactly", () => {
    const artifact = productionArtifact();
    const trailDecisionTampered = cloneArtifact(artifact);
    trailDecisionTampered.trails[0].provenance.publicationDecision.reviewTimestamp = "2026-08-17T00:00:01.000Z";
    expect(validateVerifiedNetworkArtifact(trailDecisionTampered).some((error) => error.includes("embedded publication decision does not match canonical publication decision"))).toBe(true);

    const segmentDecisionTampered = cloneArtifact(artifact);
    segmentDecisionTampered.trailSegments[0].provenance.trailPublicationDecision.notes = "changed";
    expect(validateVerifiedNetworkArtifact(segmentDecisionTampered).some((error) => error.includes("embedded trail publication decision does not match canonical publication decision"))).toBe(true);
  });

  it("rejects duplicate candidate and trail metadata identities", () => {
    const artifact = demoArtifact();
    const duplicateCandidateTrail = cloneArtifact(artifact);
    duplicateCandidateTrail.candidateTrails.push(cloneArtifact(artifact).candidateTrails[0]);
    expect(validateVerifiedNetworkArtifact(duplicateCandidateTrail).some((error) => error.includes("Duplicate candidate trail key"))).toBe(true);

    const duplicateCandidateSegment = cloneArtifact(artifact);
    duplicateCandidateSegment.candidateSegments.push(cloneArtifact(artifact).candidateSegments[0]);
    expect(validateVerifiedNetworkArtifact(duplicateCandidateSegment).some((error) => error.includes("Duplicate candidate segment key"))).toBe(true);

    const duplicateMetadata = cloneArtifact(artifact);
    duplicateMetadata.trailMetadata.push(cloneArtifact(artifact).trailMetadata[0]);
    expect(validateVerifiedNetworkArtifact(duplicateMetadata).some((error) => error.includes("Duplicate trail metadata candidate key"))).toBe(true);

    const unknownMetadata = cloneArtifact(artifact);
    unknownMetadata.trailMetadata = [{ ...unknownMetadata.trailMetadata[0], candidateTrailKey: "unknown-candidate-trail" }, ...unknownMetadata.trailMetadata.slice(1)];
    expect(validateVerifiedNetworkArtifact(unknownMetadata).some((error) => error.includes("Trail metadata references unknown candidate trail"))).toBe(true);
  });

  it("exports committed publication decisions plus local overrides", () => {
    const artifact = demoArtifact();
    const override = { ...artifact.publicationDecisions[0], decision: "needs_review" as const, notes: "local override" };
    const merged = mergePublicationDecisionOverrides(artifact.publicationDecisions, [override]);
    expect(merged).toHaveLength(7);
    expect(merged.find((decision) => decision.targetType === override.targetType && decision.targetKey === override.targetKey)).toEqual(override);
    expect(merged.filter((decision) => decision.decision === "verified_for_publication")).toHaveLength(6);
    expect(merged.map((decision) => `${decision.targetType}:${decision.targetKey}`)).toEqual([...merged.map((decision) => `${decision.targetType}:${decision.targetKey}`)].sort());

    const exported = buildPublicationDecisionExport(artifact, [override]);
    expect(exported.decisions).toEqual(merged);
  });
  it("blocks private publication artifacts in production", () => {
    expect(() => loadPublicationArtifact({} as never, { NODE_ENV: "production", PUBLICATION_ARTIFACT_PATH: "local.json" } as NodeJS.ProcessEnv)).toThrow(PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR);
  });

  it("builds deterministic output under harmless input reordering", () => {
    const shuffledSegments = { ...segmentArtifact, segmentCandidates: [...segmentArtifact.segmentCandidates].reverse() };
    const shuffledDecisions = { ...publicationDecisions, decisions: [...publicationDecisions.decisions].reverse(), trailMetadata: [...publicationDecisions.trailMetadata].reverse() };
    const first = demoArtifact();
    const second = buildVerifiedNetworkArtifact({ segmentArtifact: shuffledSegments, segmentDecisions, publicationDecisions: shuffledDecisions, generatedAt: first.metadata.generatedAt, demoOnly: true });
    expect(second.diagnostics.integrityErrors).toEqual([]);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("builds deterministic demo output inside the selected repository root", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "publication-runner-"));
    fs.mkdirSync(path.join(tempRoot, "data/generated/segments"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "data/demo"), { recursive: true });
    fs.copyFileSync(path.join(root, "data/generated/segments/demo-segment-construction.json"), path.join(tempRoot, "data/generated/segments/demo-segment-construction.json"));
    fs.copyFileSync(path.join(root, "data/demo/segment-construction-decisions.demo.json"), path.join(tempRoot, "data/demo/segment-construction-decisions.demo.json"));
    fs.copyFileSync(path.join(root, "data/demo/publication-decisions.demo.json"), path.join(tempRoot, "data/demo/publication-decisions.demo.json"));
    const result = runPublicationBuild({ segmentArtifactPath: "data/generated/segments/demo-segment-construction.json", segmentDecisionsPath: "data/demo/segment-construction-decisions.demo.json", publicationDecisionsPath: "data/demo/publication-decisions.demo.json", repositoryRoot: tempRoot, generatedAt: "2026-08-17T00:00:00.000Z" });
    expect(path.relative(tempRoot, result.outputPath).replace(/\\/g, "/")).toBe("data/generated/publication/demo-verified-network.json");
    expect(result.outputPath.startsWith(path.join(tempRoot, "data", "generated", "publication"))).toBe(true);
    expect(result.artifact.metadata.algorithmVersion).toBe(PUBLICATION_ALGORITHM_VERSION);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("builds service-role publication payloads without DB bigint IDs and rejects conflicts", () => {
    const artifact = productionArtifact();
    const payload = buildPublicationLoadPayload(artifact);
    expect(payload.trails).toHaveLength(3);
    expect(payload.trailSegments).toHaveLength(4);
    expect(payload.trails[0]).toHaveProperty("production_trail_key");
    expect(payload.trails[0]).not.toHaveProperty("id");
    expect(payload.trailSegments[0]).toHaveProperty("trail_production_key");
    expect(payload.trailSegments[0]).not.toHaveProperty("trail_id");
    expect(payload.trailSegments.some((segment) => Object.prototype.hasOwnProperty.call(segment, "completed"))).toBe(false);
    expect(() => buildPublicationLoadPayload(artifact, { segments: [{ segment_key: artifact.trailSegments[0].productionSegmentKey, trail_production_key: artifact.trailSegments[0].trailProductionKey, coordinates: [[0, 0], [1, 1]] }] })).toThrow("Refusing to overwrite different geometry");
    expect(() => buildPublicationLoadPayload(artifact, { trails: [{ production_trail_key: artifact.trails[0].productionTrailKey, slug: "changed", name: artifact.trails[0].name, region: artifact.trails[0].region }] })).toThrow("Refusing to overwrite conflicting trail identity");
  });

  it("refuses to build a DB payload from demo publication artifacts", () => {
    expect(() => buildPublicationLoadPayload(demoArtifact())).toThrow("Demo publication artifacts must not be loaded into Supabase.");
  });

  it("feeds activity matching from the verified network artifact", () => {
    const artifact = demoArtifact();
    const eligible = verifiedNetworkToEligibleMatchingSegments(artifact);
    const source = eligible[0];
    const activity = parseNormalizedActivities(JSON.stringify({ source: "demo", sourceActivityId: "published-network", geometry: { type: "LineString", coordinates: source.geometry.coordinates } }))[0];
    const matchArtifact = buildActivityMatchArtifact({ activities: [activity], eligibleSegments: eligible, demoOnly: true });
    expect(matchArtifact.diagnostics.eligibleSegmentCount).toBe(artifact.trailSegments.length);
    expect(matchArtifact.matchCandidates.some((match) => match.segmentKey === source.segmentKey && match.classification === "strong_candidate")).toBe(true);
  });

  it("runActivityMatchingFromVerifiedNetwork rejects tampered verified artifacts", () => {
    const artifact = demoArtifact();
    const tampered: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], verificationStatus: "needs_reconciliation" as never }, ...artifact.trailSegments.slice(1)], diagnostics: { ...artifact.diagnostics, integrityErrors: [] } };
    withTempArtifact(tampered, (artifactPath) => {
      expect(() => runActivityMatchingFromVerifiedNetwork({ verifiedNetworkPath: artifactPath, activitiesPath: path.join(root, "data/demo/activities"), repositoryRoot: root })).toThrow("Verified publication artifact failed integrity validation");
    });
  });

  it("retains Franconia-Pemigewasset through the public demo repository adapter", () => {
    const publicSegments = verifiedNetworkToTrailSegments(demoArtifact());
    expect(publicSegments).toHaveLength(4);
    expect(publicSegments.every((segment) => segment.region === "Franconia-Pemigewasset" && segment.completed === false)).toBe(true);
  });

  it("documents bigint-compatible verified-only SQL and service-role-only publication loading", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/008_verified_publication.sql"), "utf8");
    expect(sql).toContain("alter table public.trails add column if not exists production_trail_key text");
    expect(sql).toContain("alter table public.trails add column if not exists publication_run_id uuid");
    expect(sql).toContain("alter table public.trail_segments add column if not exists publication_run_id uuid");
    expect(sql).toContain("s.id::text as id");
    expect(sql).toContain("s.segment_key as slug");
    expect(sql).toContain("t.id::text as trail_id");
    expect(sql).not.toContain("s.slug");
    expect(sql).not.toContain("::uuid,");
    expect(sql).toContain("production_trail_key = trail_item->>'production_trail_key'");
    expect(sql).toContain("target_trail_id bigint");
    expect(sql).toContain("s.data_status = 'verified'");
    expect(sql).toContain("s.verification_status = 'human_verified'");
    expect(sql).toContain("t.data_status = 'verified'");
    expect(sql).toContain("t.verification_status = 'human_verified'");
    expect(sql).toContain("revoke execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) from anon");
    expect(sql).toContain("grant execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) to service_role");
    expect(sql).not.toMatch(/security\s+definer/i);
  });
});





