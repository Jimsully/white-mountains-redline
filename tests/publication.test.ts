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

const root = process.cwd();
const segmentArtifact = JSON.parse(fs.readFileSync(path.join(root, "data/generated/segments/demo-segment-construction.json"), "utf8")) as SegmentConstructionArtifact;
const segmentDecisions = JSON.parse(fs.readFileSync(path.join(root, "data/demo/segment-construction-decisions.demo.json"), "utf8")) as SegmentConstructionDecisionExport;
const publicationDecisions = JSON.parse(fs.readFileSync(path.join(root, "data/demo/publication-decisions.demo.json"), "utf8"));

function demoArtifact(overrides: Partial<Parameters<typeof buildVerifiedNetworkArtifact>[0]> = {}) {
  return buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true, ...overrides });
}

function productionArtifact() {
  return { ...demoArtifact({ demoOnly: false }), metadata: { ...demoArtifact({ demoOnly: false }).metadata, demoOnly: false } };
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
    expect(validateVerifiedNetworkArtifact(tampered).some((error) => error.includes("non-verified segment publication decision"))).toBe(true);
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
