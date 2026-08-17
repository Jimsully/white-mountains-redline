import fs from "node:fs";
import path from "node:path";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";
import type { SegmentConstructionDecisionExport } from "@/types/activity-matching";
import {
  PRODUCTION_SEGMENT_KEY_VERSION,
  PRODUCTION_TRAIL_KEY_VERSION,
  PUBLICATION_ALGORITHM_VERSION,
  type PublicationCandidateSegment,
  type PublicationCandidateTrail,
  type PublicationDecision,
  type PublicationDecisionExport,
  type VerifiedNetworkArtifact,
  type VerifiedPublishedSegment,
  type VerifiedPublishedTrail,
} from "@/types/publication";
import { resolveEligibleMatchingSegments } from "@/lib/activity-matching/segments";
import { lineLengthMeters, metersToMiles, round } from "@/lib/segment-construction/geometry";
import { stableHash, stableUuid, slugify } from "@/lib/publication/identity";
import { formatPublicationInputPathForArtifact, getPublicationOutputPath, isDemoPublicationInput } from "@/lib/publication/paths";

export type PublicationBuildResult = { artifact: VerifiedNetworkArtifact; outputPath: string };

export function runPublicationBuild(args: { segmentArtifactPath: string; segmentDecisionsPath: string; publicationDecisionsPath: string; repositoryRoot?: string; generatedAt?: string; timestamp?: number }): PublicationBuildResult {
  const repositoryRoot = args.repositoryRoot ?? process.cwd();
  const segmentArtifactPath = resolveFromRoot(args.segmentArtifactPath, repositoryRoot);
  const segmentDecisionsPath = resolveFromRoot(args.segmentDecisionsPath, repositoryRoot);
  const publicationDecisionsPath = resolveFromRoot(args.publicationDecisionsPath, repositoryRoot);
  const segmentArtifact = JSON.parse(fs.readFileSync(segmentArtifactPath, "utf8")) as SegmentConstructionArtifact;
  const segmentDecisions = JSON.parse(fs.readFileSync(segmentDecisionsPath, "utf8")) as SegmentConstructionDecisionExport;
  const publicationDecisions = JSON.parse(fs.readFileSync(publicationDecisionsPath, "utf8")) as PublicationDecisionExport;
  const demoOnly = isDemoPublicationInput(args.segmentArtifactPath, args.segmentDecisionsPath, args.publicationDecisionsPath, repositoryRoot);
  const outputPath = getPublicationOutputPath(args.segmentArtifactPath, args.segmentDecisionsPath, args.publicationDecisionsPath, repositoryRoot, args.timestamp);
  const artifact = buildVerifiedNetworkArtifact({
    segmentArtifact,
    segmentDecisions,
    publicationDecisions,
    generatedAt: args.generatedAt ?? getDefaultGeneratedAt(outputPath, demoOnly),
    demoOnly,
    segmentArtifactPath: formatPublicationInputPathForArtifact(segmentArtifactPath, repositoryRoot, demoOnly),
    segmentDecisionsPath: formatPublicationInputPathForArtifact(segmentDecisionsPath, repositoryRoot, demoOnly),
    publicationDecisionsPath: formatPublicationInputPathForArtifact(publicationDecisionsPath, repositoryRoot, demoOnly),
  });
  if (artifact.diagnostics.integrityErrors.length) throw new Error(`Publication artifact failed integrity validation:\n${artifact.diagnostics.integrityErrors.join("\n")}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return { artifact, outputPath };
}

export function buildVerifiedNetworkArtifact(args: { segmentArtifact: SegmentConstructionArtifact; segmentDecisions: SegmentConstructionDecisionExport; publicationDecisions: PublicationDecisionExport; generatedAt?: string; demoOnly: boolean; segmentArtifactPath?: string; segmentDecisionsPath?: string; publicationDecisionsPath?: string }): VerifiedNetworkArtifact {
  const warnings: string[] = [];
  const integrityErrors: string[] = [];
  const segmentResolution = resolveEligibleMatchingSegments(args.segmentArtifact, args.segmentDecisions);
  integrityErrors.push(...segmentResolution.errors);
  warnings.push(...segmentResolution.warnings);
  validatePublicationDecisionExport(args, integrityErrors);

  const { candidateTrails, candidateSegments } = buildCandidates(segmentResolution.eligibleSegments);
  const trailDecisionByKey = decisionMap(args.publicationDecisions.decisions, "trail", integrityErrors);
  const segmentDecisionByKey = decisionMap(args.publicationDecisions.decisions, "segment", integrityErrors);
  const knownTrailKeys = new Set(candidateTrails.map((trail) => trail.candidateTrailKey));
  const knownSegmentKeys = new Set(candidateSegments.map((segment) => segment.candidateSegmentKey));
  for (const decision of args.publicationDecisions.decisions) {
    if (decision.targetType === "trail" && !knownTrailKeys.has(decision.targetKey)) integrityErrors.push(`Publication decision references unknown trail ${decision.targetKey}.`);
    if (decision.targetType === "segment" && !knownSegmentKeys.has(decision.targetKey)) integrityErrors.push(`Publication decision references unknown segment ${decision.targetKey}.`);
  }

  const rejectedTrailCount = candidateTrails.filter((trail) => trailDecisionByKey.get(trail.candidateTrailKey)?.decision === "rejected").length;
  const needsReviewTrailCount = candidateTrails.filter((trail) => trailDecisionByKey.get(trail.candidateTrailKey)?.decision === "needs_review" || !trailDecisionByKey.has(trail.candidateTrailKey)).length;
  const rejectedSegmentCount = candidateSegments.filter((segment) => segmentDecisionByKey.get(segment.candidateSegmentKey)?.decision === "rejected").length;
  const needsReviewSegmentCount = candidateSegments.filter((segment) => segmentDecisionByKey.get(segment.candidateSegmentKey)?.decision === "needs_review" || !segmentDecisionByKey.has(segment.candidateSegmentKey)).length;
  const unresolvedUpstreamDependencyCount = segmentResolution.warnings.length;

  const trails: VerifiedPublishedTrail[] = [];
  const trailByCandidate = new Map<string, VerifiedPublishedTrail>();
  for (const trail of candidateTrails) {
    const decision = trailDecisionByKey.get(trail.candidateTrailKey);
    if (decision?.decision !== "verified_for_publication") continue;
    const published = publishTrail(trail, decision, candidateSegments.filter((segment) => segment.candidateTrailKey === trail.candidateTrailKey));
    trails.push(published);
    trailByCandidate.set(trail.candidateTrailKey, published);
  }

  const trailSegments: VerifiedPublishedSegment[] = [];
  for (const segment of candidateSegments) {
    const segmentDecision = segmentDecisionByKey.get(segment.candidateSegmentKey);
    const trailDecision = trailDecisionByKey.get(segment.candidateTrailKey);
    const trail = trailByCandidate.get(segment.candidateTrailKey);
    if (segmentDecision?.decision !== "verified_for_publication") continue;
    if (!trail || trailDecision?.decision !== "verified_for_publication") {
      integrityErrors.push(`Segment ${segment.candidateSegmentKey} is verified but its parent trail is not verified for publication.`);
      continue;
    }
    trailSegments.push(publishSegment(segment, trail, segmentDecision, trailDecision));
  }

  const artifact: VerifiedNetworkArtifact = {
    metadata: {
      generatedAt: args.generatedAt ?? new Date().toISOString(),
      demoOnly: args.demoOnly,
      algorithmVersion: PUBLICATION_ALGORITHM_VERSION,
      productionTrailKeyVersion: PRODUCTION_TRAIL_KEY_VERSION,
      productionSegmentKeyVersion: PRODUCTION_SEGMENT_KEY_VERSION,
      warning: "DEMO DATA ONLY where demoOnly=true. VERIFIED PUBLICATION GATE OUTPUT IS NOT AMC DATA AND NOT FOR NAVIGATION. USER COMPLETION RECORDS ARE NOT CREATED HERE.",
      segmentArtifactPath: args.segmentArtifactPath,
      segmentDecisionsPath: args.segmentDecisionsPath,
      publicationDecisionsPath: args.publicationDecisionsPath,
    },
    candidateTrails: sortBy(candidateTrails, (trail) => trail.candidateTrailKey),
    candidateSegments: sortBy(candidateSegments, (segment) => segment.candidateSegmentKey),
    trails: sortBy(trails, (trail) => trail.productionTrailKey),
    trailSegments: sortBy(trailSegments, (segment) => segment.productionSegmentKey),
    diagnostics: {
      candidateTrailCount: candidateTrails.length,
      candidateSegmentCount: candidateSegments.length,
      verifiedTrailCount: trails.length,
      verifiedSegmentCount: trailSegments.length,
      rejectedTrailCount,
      rejectedSegmentCount,
      needsReviewTrailCount,
      needsReviewSegmentCount,
      unresolvedUpstreamDependencyCount,
      totalPublishedMiles: round(trailSegments.reduce((sum, segment) => sum + segment.miles, 0), 6),
      warnings,
      integrityErrors,
    },
  };
  artifact.diagnostics.integrityErrors.push(...validateVerifiedNetworkArtifact(artifact));
  return artifact;
}

export function validateVerifiedNetworkArtifact(artifact: VerifiedNetworkArtifact) {
  const errors: string[] = [];
  if (artifact.metadata.algorithmVersion !== PUBLICATION_ALGORITHM_VERSION) errors.push("Publication algorithm version is missing or stale.");
  if (artifact.metadata.productionTrailKeyVersion !== PRODUCTION_TRAIL_KEY_VERSION) errors.push("Production trail key version is missing or stale.");
  if (artifact.metadata.productionSegmentKeyVersion !== PRODUCTION_SEGMENT_KEY_VERSION) errors.push("Production segment key version is missing or stale.");
  const trailIds = new Set(artifact.trails.map((trail) => trail.id));
  const segmentKeys = new Set<string>();
  for (const trail of artifact.trails) {
    if (trail.dataStatus !== "verified" || trail.verificationStatus !== "human_verified") errors.push(`Trail ${trail.id} is not human verified.`);
  }
  for (const segment of artifact.trailSegments) {
    if (segment.completed !== false) errors.push(`Segment ${segment.id} must not create completion state.`);
    if (segment.dataStatus !== "verified" || segment.verificationStatus !== "human_verified") errors.push(`Segment ${segment.id} is not human verified.`);
    if (!trailIds.has(segment.trailId)) errors.push(`Segment ${segment.id} references unknown trail ${segment.trailId}.`);
    if (segmentKeys.has(segment.productionSegmentKey)) errors.push(`Duplicate production segment key ${segment.productionSegmentKey}.`);
    segmentKeys.add(segment.productionSegmentKey);
    if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) errors.push(`Segment ${segment.id} has malformed geometry.`);
  }
  return errors;
}

export function printPublicationSummary(result: PublicationBuildResult) {
  const { diagnostics } = result.artifact;
  console.log(`candidate trails: ${diagnostics.candidateTrailCount}`);
  console.log(`candidate segments: ${diagnostics.candidateSegmentCount}`);
  console.log(`verified trails: ${diagnostics.verifiedTrailCount}`);
  console.log(`verified segments: ${diagnostics.verifiedSegmentCount}`);
  console.log(`rejected trails: ${diagnostics.rejectedTrailCount}`);
  console.log(`rejected segments: ${diagnostics.rejectedSegmentCount}`);
  console.log(`needs-review trails: ${diagnostics.needsReviewTrailCount}`);
  console.log(`needs-review segments: ${diagnostics.needsReviewSegmentCount}`);
  console.log(`unresolved upstream dependencies: ${diagnostics.unresolvedUpstreamDependencyCount}`);
  console.log(`published miles: ${diagnostics.totalPublishedMiles}`);
  console.log(`warnings: ${diagnostics.warnings.length}`);
  console.log(`integrity errors: ${diagnostics.integrityErrors.length}`);
  console.log(`output: ${path.relative(process.cwd(), result.outputPath)}`);
}

function buildCandidates(eligibleSegments: ReturnType<typeof resolveEligibleMatchingSegments>["eligibleSegments"]) {
  const trailMap = new Map<string, PublicationCandidateTrail>();
  const candidateSegments: PublicationCandidateSegment[] = eligibleSegments.map((eligible) => {
    const candidateTrailKey = stableCandidateTrailKey(eligible.parentInventoryItemKey, eligible.trailNormalizedName);
    const upstreamDecisions = {
      segmentDecision: eligible.approvalEvidence.segmentDecision,
      startJunctionDecision: eligible.approvalEvidence.startJunctionDecision,
      endJunctionDecision: eligible.approvalEvidence.endJunctionDecision,
    };
    const candidate: PublicationCandidateSegment = {
      candidateSegmentKey: eligible.segmentKey,
      candidateTrailKey,
      parentInventoryItemKey: eligible.parentInventoryItemKey,
      trailDisplayName: eligible.trailDisplayName,
      trailNormalizedName: eligible.trailNormalizedName,
      startJunctionKey: eligible.startJunctionKey,
      endJunctionKey: eligible.endJunctionKey,
      geometry: eligible.geometry,
      calculatedMiles: round(metersToMiles(lineLengthMeters(eligible.geometry.coordinates)), 6),
      calculatedMeters: round(lineLengthMeters(eligible.geometry.coordinates), 3),
      sourceFeatureIds: [...eligible.sourceFeatureIds].sort(),
      sourceProvider: eligible.sourceProvider,
      segmentConstructionAlgorithmVersion: eligible.segmentConstructionAlgorithmVersion,
      sourceSegmentArtifact: eligible.approvalEvidence.sourceSegmentArtifact,
      sourceSegmentCandidate: eligible.sourceSegmentCandidate,
      upstreamDecisions,
    };
    const existingTrail = trailMap.get(candidateTrailKey);
    if (existingTrail) {
      existingTrail.sourceFeatureIds = [...new Set([...existingTrail.sourceFeatureIds, ...candidate.sourceFeatureIds])].sort();
      existingTrail.segmentCandidateKeys.push(candidate.candidateSegmentKey);
      existingTrail.calculatedMiles = round(existingTrail.calculatedMiles + candidate.calculatedMiles, 6);
    } else {
      trailMap.set(candidateTrailKey, {
        candidateTrailKey,
        parentInventoryItemKey: candidate.parentInventoryItemKey,
        trailDisplayName: candidate.trailDisplayName,
        trailNormalizedName: candidate.trailNormalizedName,
        sourceProvider: candidate.sourceProvider,
        sourceFeatureIds: [...candidate.sourceFeatureIds],
        calculatedMiles: candidate.calculatedMiles,
        segmentCandidateKeys: [candidate.candidateSegmentKey],
      });
    }
    return candidate;
  });
  return { candidateTrails: [...trailMap.values()].map((trail) => ({ ...trail, segmentCandidateKeys: trail.segmentCandidateKeys.sort() })), candidateSegments };
}

function publishTrail(trail: PublicationCandidateTrail, decision: PublicationDecision, segments: PublicationCandidateSegment[]): VerifiedPublishedTrail {
  const productionTrailKey = `trail_${stableHash([PRODUCTION_TRAIL_KEY_VERSION, trail.parentInventoryItemKey, trail.trailNormalizedName])}`;
  return {
    id: stableUuid(["trail", productionTrailKey]),
    productionTrailKey,
    productionTrailKeyVersion: PRODUCTION_TRAIL_KEY_VERSION,
    slug: slugify(`${trail.trailDisplayName}-${productionTrailKey.slice(-6)}`),
    name: trail.trailDisplayName,
    normalizedName: trail.trailNormalizedName,
    region: "White Mountains",
    dataStatus: "verified",
    verificationStatus: "human_verified",
    totalMiles: trail.calculatedMiles,
    sourceFeatureIds: [...trail.sourceFeatureIds],
    provenance: {
      publicationAlgorithmVersion: PUBLICATION_ALGORITHM_VERSION,
      candidateTrailKey: trail.candidateTrailKey,
      parentInventoryItemKey: trail.parentInventoryItemKey,
      sourceProvider: trail.sourceProvider,
      sourceSegmentCandidateKeys: [...trail.segmentCandidateKeys],
      publicationDecision: decision,
      acceptedReconciliationLineage: segments.map((segment) => segment.sourceSegmentCandidate.sourceReconciliation),
    },
  };
}

function publishSegment(segment: PublicationCandidateSegment, trail: VerifiedPublishedTrail, decision: PublicationDecision, trailDecision: PublicationDecision): VerifiedPublishedSegment {
  const productionSegmentKey = `segment_${stableHash([PRODUCTION_SEGMENT_KEY_VERSION, trail.productionTrailKey, segment.candidateSegmentKey, segment.startJunctionKey, segment.endJunctionKey, segment.geometry.coordinates])}`;
  return {
    id: stableUuid(["segment", productionSegmentKey]),
    productionSegmentKey,
    productionSegmentKeyVersion: PRODUCTION_SEGMENT_KEY_VERSION,
    slug: slugify(`${segment.trailDisplayName}-${segment.startJunctionKey}-${segment.endJunctionKey}-${productionSegmentKey.slice(-6)}`),
    trailId: trail.id,
    trailName: trail.name,
    segmentName: `${segment.trailDisplayName}: ${segment.startJunctionKey} to ${segment.endJunctionKey}`,
    region: trail.region,
    miles: segment.calculatedMiles,
    completed: false,
    coordinates: segment.geometry.coordinates,
    dataStatus: "verified",
    verificationStatus: "human_verified",
    sourceFeatureIds: [...segment.sourceFeatureIds],
    sourceProvider: segment.sourceProvider,
    provenance: {
      publicationAlgorithmVersion: PUBLICATION_ALGORITHM_VERSION,
      candidateSegmentKey: segment.candidateSegmentKey,
      candidateTrailKey: segment.candidateTrailKey,
      parentInventoryItemKey: segment.parentInventoryItemKey,
      startJunctionKey: segment.startJunctionKey,
      endJunctionKey: segment.endJunctionKey,
      segmentConstructionAlgorithmVersion: segment.segmentConstructionAlgorithmVersion,
      sourceSegmentArtifact: segment.sourceSegmentArtifact,
      publicationDecision: decision,
      trailPublicationDecision: trailDecision,
      upstreamDecisions: segment.upstreamDecisions,
      sourceSegmentCandidate: segment.sourceSegmentCandidate,
      acceptedReconciliationLineage: segment.sourceSegmentCandidate.sourceReconciliation,
    },
  };
}

function validatePublicationDecisionExport(args: { segmentArtifact: SegmentConstructionArtifact; segmentDecisions: SegmentConstructionDecisionExport; publicationDecisions: PublicationDecisionExport }, errors: string[]) {
  const decisions = args.publicationDecisions;
  if (decisions.algorithmVersion !== PUBLICATION_ALGORITHM_VERSION) errors.push(`Unsupported publication decision version: ${decisions.algorithmVersion}`);
  if (decisions.sourceArtifact?.generatedAt !== args.segmentArtifact.metadata.generatedAt) errors.push("Publication decisions were produced from a different segment-construction artifact timestamp.");
  if (decisions.sourceArtifact?.algorithmVersion !== args.segmentArtifact.metadata.algorithmVersion) errors.push("Publication decisions reference a stale segment-construction algorithm version.");
  if (decisions.sourceArtifact?.demoOnly !== args.segmentArtifact.metadata.demoOnly) errors.push("Publication decisions demo/private identity does not match the segment-construction artifact.");
  if (decisions.sourceSegmentDecisions?.algorithmVersion !== args.segmentDecisions.algorithmVersion) errors.push("Publication decisions reference a stale segment decision version.");
  if (decisions.sourceSegmentDecisions?.sourceArtifact?.generatedAt !== args.segmentDecisions.sourceArtifact?.generatedAt) errors.push("Publication decisions reference a different segment decision source artifact.");
}

function decisionMap(decisions: PublicationDecision[], type: "trail" | "segment", errors: string[]) {
  const map = new Map<string, PublicationDecision>();
  for (const decision of decisions.filter((item) => item.targetType === type)) {
    if (map.has(decision.targetKey)) errors.push(`Duplicate publication decision for ${type}:${decision.targetKey}.`);
    map.set(decision.targetKey, decision);
  }
  return map;
}

function stableCandidateTrailKey(parentInventoryItemKey: string, trailNormalizedName: string) {
  return `candidate_trail_${stableHash([parentInventoryItemKey, trailNormalizedName])}`;
}

function sortBy<T>(values: T[], key: (value: T) => string) {
  return [...values].sort((a, b) => key(a).localeCompare(key(b)));
}

function getDefaultGeneratedAt(outputPath: string, demoOnly: boolean) {
  if (demoOnly && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf8")) as Partial<VerifiedNetworkArtifact>;
      if (typeof existing.metadata?.generatedAt === "string") return existing.metadata.generatedAt;
    } catch {
      return "2026-08-17T00:00:00.000Z";
    }
  }
  return demoOnly ? "2026-08-17T00:00:00.000Z" : new Date().toISOString();
}

function resolveFromRoot(inputPath: string, repositoryRoot: string) {
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);
}




