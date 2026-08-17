import crypto from "node:crypto";
import type { MultiLineString } from "geojson";
import type { ActivityMatchArtifact, ActivityMatchingConfig, ActivityRecord, EligibleMatchingSegment, SegmentMatchCandidate, SegmentMatchClassification, SegmentMatchEvidence } from "@/types/activity-matching";
import { ACTIVITY_MATCHING_ALGORITHM_VERSION } from "@/types/activity-matching";
import { DEFAULT_ACTIVITY_MATCHING_CONFIG } from "@/lib/activity-matching/config";
import { bboxForCoordinates, bboxForMultiLine, expandedBboxIntersects, longestFalseRun, median, minDistanceToTrace, multiLineLengthMeters, percentile, sampleLine } from "@/lib/activity-matching/geometry";
import { lineLengthMeters, round } from "@/lib/segment-construction/geometry";

export function buildActivityMatchArtifact(args: {
  activities: ActivityRecord[];
  eligibleSegments: EligibleMatchingSegment[];
  generatedAt?: string;
  demoOnly: boolean;
  segmentArtifactPath?: string;
  segmentDecisionsPath?: string;
  activitiesPath?: string;
  config?: ActivityMatchingConfig;
  integrityWarnings?: string[];
}): ActivityMatchArtifact {
  const config = args.config ?? DEFAULT_ACTIVITY_MATCHING_CONFIG;
  const matchCandidates: SegmentMatchCandidate[] = [];
  let pairsConsidered = 0;
  let bboxRejectedPairs = 0;
  let fullyScoredPairs = 0;

  for (const activity of args.activities) {
    const activityBbox = safeActivityBbox(activity.trace.geometry);
    for (const segment of args.eligibleSegments) {
      pairsConsidered += 1;
      const segmentBbox = bboxForCoordinates(segment.geometry.coordinates);
      if (!activityBbox || !expandedBboxIntersects(segmentBbox, activityBbox, config.candidateSearchRadiusMeters)) {
        bboxRejectedPairs += 1;
        continue;
      }
      fullyScoredPairs += 1;
      matchCandidates.push(scoreSegmentActivityPair(activity, segment, activityBbox, segmentBbox, config));
    }
  }

  const candidateActivityKeys = new Set(matchCandidates.filter(isPotentialEvidence).map((match) => match.activityKey));
  const candidateSegmentKeys = new Set(matchCandidates.filter(isPotentialEvidence).map((match) => match.segmentKey));
  const diagnostics = {
    activitiesLoaded: args.activities.length,
    eligibleSegmentCount: args.eligibleSegments.length,
    pairsConsidered,
    bboxRejectedPairs,
    fullyScoredPairs,
    strongCandidateCount: matchCandidates.filter((match) => match.classification === "strong_candidate").length,
    candidateCount: matchCandidates.filter((match) => match.classification === "candidate").length,
    needsReviewCount: matchCandidates.filter((match) => match.classification === "needs_review").length,
    insufficientCoverageCount: matchCandidates.filter((match) => match.classification === "insufficient_coverage").length,
    unmatchedActivityCount: args.activities.length - candidateActivityKeys.size,
    activitiesWithCandidateCount: candidateActivityKeys.size,
    segmentsWithCandidateCount: candidateSegmentKeys.size,
    integrityWarnings: args.integrityWarnings ?? [],
    integrityErrors: [] as string[],
  };

  const artifact: ActivityMatchArtifact = {
    metadata: {
      generatedAt: args.generatedAt ?? new Date().toISOString(),
      demoOnly: args.demoOnly,
      algorithmVersion: ACTIVITY_MATCHING_ALGORITHM_VERSION,
      warning: "DEMO DATA ONLY where demoOnly=true. GPS IS EVIDENCE, NOT CANONICAL GEOMETRY. NOT COMPLETION VERIFIED. NOT FOR NAVIGATION.",
      segmentArtifactPath: args.segmentArtifactPath,
      segmentDecisionsPath: args.segmentDecisionsPath,
      activitiesPath: args.activitiesPath,
    },
    config,
    activities: args.activities,
    eligibleSegments: args.eligibleSegments,
    matchCandidates,
    diagnostics,
  };
  artifact.diagnostics.integrityErrors = validateActivityMatchArtifact(artifact);
  if (artifact.diagnostics.integrityErrors.length) throw new Error(`Activity match artifact failed integrity validation:\n${artifact.diagnostics.integrityErrors.join("\n")}`);
  return artifact;
}

export function scoreSegmentActivityPair(activity: ActivityRecord, segment: EligibleMatchingSegment, activityBbox: [number, number, number, number], segmentBbox: [number, number, number, number], config: ActivityMatchingConfig): SegmentMatchCandidate {
  const samples = sampleLine(segment.geometry.coordinates, config.coverageSampleIntervalMeters);
  const sampleDistances = samples.map((sample) => minDistanceToTrace(sample, activity.trace.geometry));
  const covered = sampleDistances.map((distance) => distance.distanceMeters <= config.matchedPointToleranceMeters);
  const coveredSampleCount = covered.filter(Boolean).length;
  const firstMatched = sampleDistances.find((distance, index) => covered[index])?.position;
  const lastMatched = [...sampleDistances].reverse().find((distance, reverseIndex) => covered[covered.length - 1 - reverseIndex])?.position;
  const distances = sampleDistances.map((distance) => distance.distanceMeters);
  const startJunctionDistanceMeters = minDistanceToTrace(segment.geometry.coordinates[0], activity.trace.geometry).distanceMeters;
  const endJunctionDistanceMeters = minDistanceToTrace(segment.geometry.coordinates[segment.geometry.coordinates.length - 1], activity.trace.geometry).distanceMeters;
  const longestUncoveredRunSamples = longestFalseRun(covered);

  const evidence: SegmentMatchEvidence = {
    canonicalSegmentLengthMeters: round(lineLengthMeters(segment.geometry.coordinates), 3),
    activityTraceLengthMeters: round(multiLineLengthMeters(activity.trace.geometry), 3),
    segmentSampleCount: samples.length,
    coveredSampleCount,
    segmentCoverageRatio: round(samples.length ? coveredSampleCount / samples.length : 0, 4),
    startJunctionDistanceMeters,
    endJunctionDistanceMeters,
    medianSampleDistanceMeters: round(median(distances), 3),
    p95SampleDistanceMeters: round(percentile(distances, 0.95), 3),
    maxSampleDistanceMeters: round(Math.max(...distances), 3),
    longestUncoveredRunSamples,
    longestUncoveredGapRatio: round(samples.length ? longestUncoveredRunSamples / samples.length : 0, 4),
    sourceActivityKey: activity.activityKey,
    sourceActivityId: activity.sourceActivityId,
    segmentCandidateKey: segment.segmentKey,
    segmentConstructionAlgorithmVersion: segment.segmentConstructionAlgorithmVersion,
    activityMatchingAlgorithmVersion: ACTIVITY_MATCHING_ALGORITHM_VERSION,
    firstMatchedActivityPosition: firstMatched,
    lastMatchedActivityPosition: lastMatched,
    activityBbox,
    segmentBbox,
  };

  return {
    key: stableMatchKey(activity.activityKey, segment.segmentKey),
    activityKey: activity.activityKey,
    segmentKey: segment.segmentKey,
    trailDisplayName: segment.trailDisplayName,
    classification: classifyEvidence(evidence, config),
    evidence,
    reviewStatus: "unreviewed",
  };
}

export function validateActivityMatchArtifact(artifact: ActivityMatchArtifact): string[] {
  const errors: string[] = [];
  const activityKeys = new Set(artifact.activities.map((activity) => activity.activityKey));
  const segmentKeys = new Set(artifact.eligibleSegments.map((segment) => segment.segmentKey));
  const seenPairs = new Set<string>();
  if (artifact.metadata.algorithmVersion !== ACTIVITY_MATCHING_ALGORITHM_VERSION) errors.push("Activity matching algorithm version is missing or stale.");
  for (const match of artifact.matchCandidates) {
    if (!activityKeys.has(match.activityKey)) errors.push(`Match ${match.key} references unknown activity ${match.activityKey}.`);
    if (!segmentKeys.has(match.segmentKey)) errors.push(`Match ${match.key} references unknown segment ${match.segmentKey}.`);
    const pairKey = `${match.activityKey}:${match.segmentKey}`;
    if (seenPairs.has(pairKey)) errors.push(`Duplicate activity/segment match pair ${pairKey}.`);
    seenPairs.add(pairKey);
    if (match.key !== stableMatchKey(match.activityKey, match.segmentKey)) errors.push(`Match ${match.key} has an unstable key.`);
    if (!match.evidence.activityMatchingAlgorithmVersion || !match.evidence.segmentConstructionAlgorithmVersion) errors.push(`Match ${match.key} is missing algorithm versions.`);
    validateFiniteEvidence(match.key, match.evidence, errors);
    if (match.classification === "strong_candidate" && !satisfiesStrongThresholds(match.evidence, artifact.config)) errors.push(`Strong candidate ${match.key} does not satisfy strong thresholds.`);
  }
  return errors;
}

export function stableMatchKey(activityKey: string, segmentKey: string) {
  return `activity_match_${crypto.createHash("sha1").update([ACTIVITY_MATCHING_ALGORITHM_VERSION, activityKey, segmentKey].join("|")).digest("hex").slice(0, 16)}`;
}

function classifyEvidence(evidence: SegmentMatchEvidence, config: ActivityMatchingConfig): SegmentMatchClassification {
  if (satisfiesStrongThresholds(evidence, config)) return "strong_candidate";
  const endpointReached = Math.min(evidence.startJunctionDistanceMeters, evidence.endJunctionDistanceMeters) <= config.endpointToleranceMeters;
  if (evidence.segmentCoverageRatio >= config.minimumCoverageRatio && evidence.medianSampleDistanceMeters <= config.matchedPointToleranceMeters) {
    if (evidence.medianSampleDistanceMeters > config.maximumMedianDistanceMeters || evidence.p95SampleDistanceMeters > config.maximumP95DistanceMeters) return "needs_review";
    return endpointReached && evidence.longestUncoveredGapRatio <= 0.45 ? "candidate" : "needs_review";
  }
  if (evidence.segmentCoverageRatio >= 0.35 || evidence.medianSampleDistanceMeters <= config.matchedPointToleranceMeters) return "needs_review";
  return "insufficient_coverage";
}

function satisfiesStrongThresholds(evidence: SegmentMatchEvidence, config: ActivityMatchingConfig) {
  return evidence.segmentCoverageRatio >= config.strongCoverageRatio
    && evidence.startJunctionDistanceMeters <= config.endpointToleranceMeters
    && evidence.endJunctionDistanceMeters <= config.endpointToleranceMeters
    && evidence.medianSampleDistanceMeters <= config.maximumMedianDistanceMeters
    && evidence.p95SampleDistanceMeters <= config.maximumP95DistanceMeters
    && evidence.longestUncoveredGapRatio <= config.maximumGapRatio;
}

function isPotentialEvidence(match: SegmentMatchCandidate) {
  return match.classification === "strong_candidate" || match.classification === "candidate" || match.classification === "needs_review";
}

function safeActivityBbox(geometry: MultiLineString) {
  const coordinates = geometry.coordinates.flat();
  return coordinates.length ? bboxForMultiLine(geometry) : undefined;
}

function validateFiniteEvidence(matchKey: string, evidence: SegmentMatchEvidence, errors: string[]) {
  const numericFields: Array<keyof SegmentMatchEvidence> = [
    "canonicalSegmentLengthMeters",
    "activityTraceLengthMeters",
    "segmentSampleCount",
    "coveredSampleCount",
    "segmentCoverageRatio",
    "startJunctionDistanceMeters",
    "endJunctionDistanceMeters",
    "medianSampleDistanceMeters",
    "p95SampleDistanceMeters",
    "maxSampleDistanceMeters",
    "longestUncoveredRunSamples",
    "longestUncoveredGapRatio",
  ];
  for (const field of numericFields) {
    const value = evidence[field];
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`Match ${matchKey} has non-finite evidence metric ${field}.`);
  }
  if (evidence.segmentCoverageRatio < 0 || evidence.segmentCoverageRatio > 1) errors.push(`Match ${matchKey} has coverage outside 0..1.`);
  if (evidence.longestUncoveredGapRatio < 0 || evidence.longestUncoveredGapRatio > 1) errors.push(`Match ${matchKey} has gap ratio outside 0..1.`);
  if (evidence.startJunctionDistanceMeters < 0 || evidence.endJunctionDistanceMeters < 0 || evidence.medianSampleDistanceMeters < 0 || evidence.p95SampleDistanceMeters < 0 || evidence.maxSampleDistanceMeters < 0) errors.push(`Match ${matchKey} has a negative distance metric.`);
}