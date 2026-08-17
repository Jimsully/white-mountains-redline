import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VerifiedNetworkArtifact } from "@/types/publication";
import { PUBLICATION_ALGORITHM_VERSION } from "@/types/publication";
import { buildVerifiedNetworkArtifact, validateVerifiedNetworkArtifact, runPublicationBuild } from "@/lib/publication/builder";
import { buildPublicationLoadPayload } from "@/lib/publication/loader";
import { loadPublicationArtifact, PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR } from "@/lib/publication/server-artifact";
import { verifiedNetworkToEligibleMatchingSegments, verifiedNetworkToTrailSegments } from "@/lib/publication/adapters";
import { buildActivityMatchArtifact } from "@/lib/activity-matching/matcher";
import { parseNormalizedActivities } from "@/lib/activity-matching/activities";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";
import type { SegmentConstructionDecisionExport } from "@/types/activity-matching";

const root = process.cwd();
const segmentArtifact = JSON.parse(fs.readFileSync(path.join(root, "data/generated/segments/demo-segment-construction.json"), "utf8")) as SegmentConstructionArtifact;
const segmentDecisions = JSON.parse(fs.readFileSync(path.join(root, "data/demo/segment-construction-decisions.demo.json"), "utf8")) as SegmentConstructionDecisionExport;
const publicationDecisions = JSON.parse(fs.readFileSync(path.join(root, "data/demo/publication-decisions.demo.json"), "utf8"));

function demoArtifact() {
  return buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true });
}

describe("verified publication gate", () => {
  it("publishes only explicitly verified trails and segments with production-shaped records", () => {
    const artifact = demoArtifact();
    expect(artifact.diagnostics.integrityErrors).toEqual([]);
    expect(artifact.diagnostics.candidateTrailCount).toBe(3);
    expect(artifact.diagnostics.candidateSegmentCount).toBe(4);
    expect(artifact.diagnostics.verifiedTrailCount).toBe(3);
    expect(artifact.diagnostics.verifiedSegmentCount).toBe(4);
    expect(artifact.trailSegments.every((segment) => segment.dataStatus === "verified" && segment.verificationStatus === "human_verified" && segment.completed === false)).toBe(true);
    expect(verifiedNetworkToTrailSegments(artifact)).toHaveLength(4);
  });

  it("requires matching source artifact and segment-decision lineage", () => {
    const stale = { ...publicationDecisions, sourceArtifact: { ...publicationDecisions.sourceArtifact, generatedAt: "stale" } };
    const artifact = buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions: stale, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true });
    expect(artifact.diagnostics.integrityErrors).toContain("Publication decisions were produced from a different segment-construction artifact timestamp.");
  });

  it("does not allow verified segments beneath unverified parent trails", () => {
    const trailDecision = publicationDecisions.decisions.find((decision: { targetType: string }) => decision.targetType === "trail");
    const mixed = { ...publicationDecisions, decisions: publicationDecisions.decisions.map((decision: { targetKey: string }) => decision.targetKey === trailDecision.targetKey ? { ...decision, decision: "needs_review" } : decision) };
    const artifact = buildVerifiedNetworkArtifact({ segmentArtifact, segmentDecisions, publicationDecisions: mixed, generatedAt: "2026-08-17T00:00:00.000Z", demoOnly: true });
    expect(artifact.diagnostics.integrityErrors.some((error) => error.includes("parent trail is not verified"))).toBe(true);
  });

  it("validates malformed publication geometry", () => {
    const artifact = demoArtifact();
    const malformed: VerifiedNetworkArtifact = { ...artifact, trailSegments: [{ ...artifact.trailSegments[0], coordinates: [artifact.trailSegments[0].coordinates[0]] }] };
    expect(validateVerifiedNetworkArtifact(malformed)).toContain(`Segment ${artifact.trailSegments[0].id} has malformed geometry.`);
  });

  it("blocks private publication artifacts in production", () => {
    expect(() => loadPublicationArtifact({} as never, { NODE_ENV: "production", PUBLICATION_ARTIFACT_PATH: "local.json" } as NodeJS.ProcessEnv)).toThrow(PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR);
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

  it("builds service-role publication payloads and rejects geometry conflicts", () => {
    const artifact = demoArtifact();
    const payload = buildPublicationLoadPayload(artifact);
    expect(payload.trails).toHaveLength(3);
    expect(payload.trailSegments).toHaveLength(4);
    expect(payload.trailSegments.some((segment) => Object.prototype.hasOwnProperty.call(segment, "completed"))).toBe(false);
    expect(() => buildPublicationLoadPayload(artifact, [{ segment_key: artifact.trailSegments[0].productionSegmentKey, coordinates: [[0, 0], [1, 1]] }])).toThrow("Refusing to overwrite different geometry");
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
  it("documents verified-only public SQL and service-role-only publication loading", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/008_verified_publication.sql"), "utf8");
    expect(sql).toContain("s.data_status = 'verified'");
    expect(sql).toContain("s.verification_status = 'human_verified'");
    expect(sql).toContain("t.data_status = 'verified'");
    expect(sql).toContain("t.verification_status = 'human_verified'");
    expect(sql).toContain("revoke execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) from anon");
    expect(sql).toContain("grant execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) to service_role");
    expect(sql).not.toMatch(/security\s+definer/i);
  });
});



