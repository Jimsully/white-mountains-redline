import crypto from "node:crypto";
import type { MultiLineString, Position } from "geojson";
import type { ActivityMatchArtifact, ActivityMatchingConfig, ActivityRecord, ComponentMatchEvidence, EligibleMatchingSegment, SegmentMatchCandidate, SegmentMatchClassification, SegmentMatchEvidence } from "@/types/activity-matching";
import { ACTIVITY_MATCHING_ALGORITHM_VERSION } from "@/types/activity-matching";
import { DEFAULT_ACTIVITY_MATCHING_CONFIG } from "@/lib/activity-matching/config";
import { bboxForCoordinates, bboxForMultiLine, expandedBboxIntersects, longestFalseRun, median, minDistanceToTrace, multiLineLengthMeters, percentile, sampleLine } from "@/lib/activity-matching/geometry";
import { buildTrustedActivityTraceEvidence, type TrustedActivityTraceEvidence } from "@/lib/activity-matching/trusted-trace";
import { distanceMeters, lineLengthMeters, round } from "@/lib/segment-construction/geometry";

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
  const trustedByActivity = new Map(args.activities.map((activity) => [activity.activityKey, buildTrustedActivityTraceEvidence(activity.trace.geometry, config.maximumInterpolatedActivityEdgeMeters)]));
  const matchCandidates: SegmentMatchCandidate[] = [];
  let pairsConsidered = 0;
  let bboxRejectedPairs = 0;
  let fullyScoredPairs = 0;

  for (const activity of args.activities) {
    const activityBbox = safeActivityBbox(activity.trace.geometry);
    const traceEvidence = trustedByActivity.get(activity.activityKey);
    for (const segment of args.eligibleSegments) {
      pairsConsidered += 1;
      const segmentBbox = bboxForCoordinates(segment.geometry.coordinates);
      if (!activityBbox || !traceEvidence || !expandedBboxIntersects(segmentBbox, activityBbox, config.candidateSearchRadiusMeters)) {
        bboxRejectedPairs += 1;
        continue;
      }
      fullyScoredPairs += 1;
      matchCandidates.push(scoreSegmentActivityPair(activity, segment, activityBbox, segmentBbox, config, traceEvidence));
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
    ignoredActivityEdgeCount: [...trustedByActivity.values()].reduce((sum, trace) => sum + trace.ignoredLongActivityEdgeCount, 0),
    componentDiscontinuityBlockedStrongCount: matchCandidates.filter((match) => match.evidence.blockedStrongByComponentDiscontinuity).length,
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

export function scoreSegmentActivityPair(activity: ActivityRecord, segment: EligibleMatchingSegment, activityBbox: [number, number, number, number], segmentBbox: [number, number, number, number], config: ActivityMatchingConfig, traceEvidence = buildTrustedActivityTraceEvidence(activity.trace.geometry, config.maximumInterpolatedActivityEdgeMeters)): SegmentMatchCandidate {
  const samples = sampleLine(segment.geometry.coordinates, config.coverageSampleIntervalMeters);
  const sampleDistances = samples.map((sample) => minDistanceToEvidence(sample, traceEvidence.allLines, traceEvidence.allPoints));
  const covered = sampleDistances.map((distance) => distance.distanceMeters <= config.matchedPointToleranceMeters);
  const coveredSampleCount = covered.filter(Boolean).length;
  const firstMatched = sampleDistances.find((distance, index) => covered[index])?.position;
  const lastMatched = [...sampleDistances].reverse().find((distance, reverseIndex) => covered[covered.length - 1 - reverseIndex])?.position;
  const distances = sampleDistances.map((distance) => distance.distanceMeters);
  const start = segment.geometry.coordinates[0];
  const end = segment.geometry.coordinates[segment.geometry.coordinates.length - 1];
  const startJunctionDistanceMeters = minDistanceToEvidence(start, traceEvidence.allLines, traceEvidence.allPoints).distanceMeters;
  const endJunctionDistanceMeters = minDistanceToEvidence(end, traceEvidence.allLines, traceEvidence.allPoints).distanceMeters;
  const longestUncoveredRunSamples = longestFalseRun(covered);
  const componentEvidence = buildComponentEvidence(samples, start, end, traceEvidence, config);
  const bestByCoverage = componentEvidence.reduce<ComponentMatchEvidence | undefined>((best, candidate) => !best || candidate.coverageRatio > best.coverageRatio ? candidate : best, undefined);
  const bestStrongComponent = componentEvidence.find((component) => satisfiesStrongComponentThresholds(component, config));

  const evidence: SegmentMatchEvidence = {
    canonicalSegmentLengthMeters: round(lineLengthMeters(segment.geometry.coordinates), 3),
    activityTraceLengthMeters: round(multiLineLengthMeters(activity.trace.geometry), 3),
    rawActivityTraceLengthMeters: round(multiLineLengthMeters(activity.trace.geometry), 3),
    trustedActivityEvidenceLengthMeters: traceEvidence.trustedLengthMeters,
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
    maximumActivityPointGapMeters: round(Math.max(0, ...traceEvidence.pointGapsMeters), 3),
    p95ActivityPointGapMeters: round(percentile(traceEvidence.pointGapsMeters, 0.95), 3),
    ignoredLongActivityEdgeCount: traceEvidence.ignoredLongActivityEdgeCount,
    componentEvidence,
    componentCoverageRatios: componentEvidence.map((component) => component.coverageRatio),
    bestSingleComponentCoverageRatio: bestByCoverage?.coverageRatio ?? 0,
    bestSingleComponentIndex: bestByCoverage?.componentIndex,
    bestStrongComponentIndex: bestStrongComponent?.componentIndex,
    singleComponentReachesBothEndpoints: componentEvidence.some((component) => component.startJunctionDistanceMeters <= config.endpointToleranceMeters && component.endJunctionDistanceMeters <= config.endpointToleranceMeters),
    blockedStrongByComponentDiscontinuity: false,
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
  evidence.blockedStrongByComponentDiscontinuity = satisfiesStrongUnionThresholds(evidence, config) && evidence.bestStrongComponentIndex === undefined;

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
  const activityKeys = new Set<string>();
  for (const activity of artifact.activities) {
    if (activityKeys.has(activity.activityKey)) errors.push(`Duplicate activity key ${activity.activityKey}.`);
    activityKeys.add(activity.activityKey);
  }
  const segmentKeys = new Set<string>();
  for (const segment of artifact.eligibleSegments) {
    if (segmentKeys.has(segment.segmentKey)) errors.push(`Duplicate eligible segment key ${segment.segmentKey}.`);
    segmentKeys.add(segment.segmentKey);
    validateApprovalEvidence(segment, errors);
  }
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
    if (match.classification !== classifyEvidence(match.evidence, artifact.config)) errors.push(`Match ${match.key} classification is not deterministic from evidence/config.`);
    if (match.classification === "strong_candidate" && !satisfiesStrongThresholds(match.evidence, artifact.config)) errors.push(`Strong candidate ${match.key} does not satisfy strong thresholds.`);
  }
  return errors;
}

export function stableMatchKey(activityKey: string, segmentKey: string) {
  return `activity_match_${crypto.createHash("sha1").update([ACTIVITY_MATCHING_ALGORITHM_VERSION, activityKey, segmentKey].join("|")).digest("hex").slice(0, 16)}`;
}

export function classifyEvidence(evidence: SegmentMatchEvidence, config: ActivityMatchingConfig): SegmentMatchClassification {
  if (satisfiesStrongThresholds(evidence, config)) return "strong_candidate";
  const endpointReached = Math.min(evidence.startJunctionDistanceMeters, evidence.endJunctionDistanceMeters) <= config.endpointToleranceMeters;
  if (evidence.segmentCoverageRatio >= config.strongCoverageRatio && endpointReached) return "needs_review";
  if (evidence.segmentCoverageRatio >= config.minimumCoverageRatio && evidence.medianSampleDistanceMeters <= config.matchedPointToleranceMeters) {
    if (evidence.blockedStrongByComponentDiscontinuity || evidence.ignoredLongActivityEdgeCount > 0) return "needs_review";
    if (evidence.medianSampleDistanceMeters > config.maximumMedianDistanceMeters || evidence.p95SampleDistanceMeters > config.maximumP95DistanceMeters) return "needs_review";
    return endpointReached && evidence.longestUncoveredGapRatio <= 0.45 ? "candidate" : "needs_review";
  }
  if (evidence.segmentCoverageRatio >= 0.35 || evidence.medianSampleDistanceMeters <= config.matchedPointToleranceMeters) return "needs_review";
  return "insufficient_coverage";
}

function buildComponentEvidence(samples: Position[], start: Position, end: Position, traceEvidence: TrustedActivityTraceEvidence, config: ActivityMatchingConfig): ComponentMatchEvidence[] {
  return traceEvidence.componentLines.map((lines, componentIndex) => {
    const points = traceEvidence.componentPoints[componentIndex] ?? [];
    const sampleDistances = samples.map((sample) => minDistanceToEvidence(sample, lines, points));
    const covered = sampleDistances.map((distance) => distance.distanceMeters <= config.matchedPointToleranceMeters);
    const distances = sampleDistances.map((distance) => distance.distanceMeters);
    return {
      componentIndex,
      coverageRatio: round(samples.length ? covered.filter(Boolean).length / samples.length : 0, 4),
      coveredSampleCount: covered.filter(Boolean).length,
      startJunctionDistanceMeters: minDistanceToEvidence(start, lines, points).distanceMeters,
      endJunctionDistanceMeters: minDistanceToEvidence(end, lines, points).distanceMeters,
      medianSampleDistanceMeters: round(median(distances), 3),
      p95SampleDistanceMeters: round(percentile(distances, 0.95), 3),
      maxSampleDistanceMeters: round(Math.max(...distances), 3),
      longestUncoveredGapRatio: round(samples.length ? longestFalseRun(covered) / samples.length : 0, 4),
    };
  });
}

function satisfiesStrongThresholds(evidence: SegmentMatchEvidence, config: ActivityMatchingConfig) {
  return satisfiesStrongUnionThresholds(evidence, config) && evidence.bestStrongComponentIndex !== undefined;
}

function satisfiesStrongUnionThresholds(evidence: SegmentMatchEvidence, config: ActivityMatchingConfig) {
  return evidence.segmentCoverageRatio >= config.strongCoverageRatio
    && evidence.startJunctionDistanceMeters <= config.endpointToleranceMeters
    && evidence.endJunctionDistanceMeters <= config.endpointToleranceMeters
    && evidence.medianSampleDistanceMeters <= config.strongMaximumMedianDistanceMeters
    && evidence.p95SampleDistanceMeters <= config.strongMaximumP95DistanceMeters
    && evidence.longestUncoveredGapRatio <= config.maximumGapRatio;
}

function satisfiesStrongComponentThresholds(evidence: ComponentMatchEvidence, config: ActivityMatchingConfig) {
  return evidence.coverageRatio >= config.strongCoverageRatio
    && evidence.startJunctionDistanceMeters <= config.endpointToleranceMeters
    && evidence.endJunctionDistanceMeters <= config.endpointToleranceMeters
    && evidence.medianSampleDistanceMeters <= config.strongMaximumMedianDistanceMeters
    && evidence.p95SampleDistanceMeters <= config.strongMaximumP95DistanceMeters
    && evidence.longestUncoveredGapRatio <= config.maximumGapRatio;
}

function isPotentialEvidence(match: SegmentMatchCandidate) {
  return match.classification === "strong_candidate" || match.classification === "candidate" || match.classification === "needs_review";
}

function safeActivityBbox(geometry: MultiLineString) {
  const coordinates = geometry.coordinates.flat();
  return coordinates.length ? bboxForMultiLine(geometry) : undefined;
}

function minDistanceToEvidence(point: Position, lines: Position[][], points: Position[]) {
  let best = Number.POSITIVE_INFINITY;
  let bestPosition: Position | undefined;
  for (const line of lines) {
    const candidate = minDistanceToTrace(point, { type: "MultiLineString", coordinates: [line] });
    if (candidate.distanceMeters < best) {
      best = candidate.distanceMeters;
      bestPosition = candidate.position;
    }
  }
  for (const evidencePoint of points) {
    const distance = distanceMeters(point, evidencePoint);
    if (distance < best) {
      best = distance;
      bestPosition = evidencePoint;
    }
  }
  return { distanceMeters: round(best, 3), position: bestPosition };
}

function validateApprovalEvidence(segment: EligibleMatchingSegment, errors: string[]) {
  const evidence = segment.approvalEvidence;
  if (!evidence) {
    errors.push(`Eligible segment ${segment.segmentKey} is missing approval evidence.`);
    return;
  }
  if (evidence.segmentDecision.targetType !== "segment" || evidence.segmentDecision.targetKey !== segment.segmentKey || evidence.segmentDecision.decision !== "accepted") errors.push(`Eligible segment ${segment.segmentKey} is missing an accepted segment decision.`);
  if (evidence.startJunctionDecision.targetType !== "junction" || evidence.startJunctionDecision.targetKey !== segment.startJunctionKey || evidence.startJunctionDecision.decision !== "accepted") errors.push(`Eligible segment ${segment.segmentKey} is missing an accepted start-junction decision.`);
  if (evidence.endJunctionDecision.targetType !== "junction" || evidence.endJunctionDecision.targetKey !== segment.endJunctionKey || evidence.endJunctionDecision.decision !== "accepted") errors.push(`Eligible segment ${segment.segmentKey} is missing an accepted end-junction decision.`);
  if (evidence.decisionArtifactAlgorithmVersion !== segment.segmentConstructionAlgorithmVersion) errors.push(`Eligible segment ${segment.segmentKey} approval decision version does not match segment construction version.`);
  if (!evidence.sourceSegmentArtifact.generatedAt || typeof evidence.sourceSegmentArtifact.demoOnly !== "boolean" || !evidence.sourceSegmentArtifact.algorithmVersion) errors.push(`Eligible segment ${segment.segmentKey} approval source artifact identity is incomplete.`);
  if (evidence.sourceSegmentArtifact.algorithmVersion !== segment.segmentConstructionAlgorithmVersion) errors.push(`Eligible segment ${segment.segmentKey} approval source artifact version does not match segment construction version.`);
}

function validateFiniteEvidence(matchKey: string, evidence: SegmentMatchEvidence, errors: string[]) {
  const numericFields: Array<keyof SegmentMatchEvidence> = [
    "canonicalSegmentLengthMeters",
    "activityTraceLengthMeters",
    "rawActivityTraceLengthMeters",
    "trustedActivityEvidenceLengthMeters",
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
    "maximumActivityPointGapMeters",
    "p95ActivityPointGapMeters",
    "ignoredLongActivityEdgeCount",
    "bestSingleComponentCoverageRatio",
  ];
  for (const field of numericFields) {
    const value = evidence[field];
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`Match ${matchKey} has non-finite evidence metric ${field}.`);
  }
  for (const value of evidence.componentCoverageRatios) if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`Match ${matchKey} has invalid component coverage.`);
  for (const component of evidence.componentEvidence) validateComponentEvidence(matchKey, component, errors);
  if (evidence.segmentCoverageRatio < 0 || evidence.segmentCoverageRatio > 1) errors.push(`Match ${matchKey} has coverage outside 0..1.`);
  if (evidence.longestUncoveredGapRatio < 0 || evidence.longestUncoveredGapRatio > 1) errors.push(`Match ${matchKey} has gap ratio outside 0..1.`);
  if (evidence.startJunctionDistanceMeters < 0 || evidence.endJunctionDistanceMeters < 0 || evidence.medianSampleDistanceMeters < 0 || evidence.p95SampleDistanceMeters < 0 || evidence.maxSampleDistanceMeters < 0) errors.push(`Match ${matchKey} has a negative distance metric.`);
}

function validateComponentEvidence(matchKey: string, component: ComponentMatchEvidence, errors: string[]) {
  const values = [component.coverageRatio, component.coveredSampleCount, component.startJunctionDistanceMeters, component.endJunctionDistanceMeters, component.medianSampleDistanceMeters, component.p95SampleDistanceMeters, component.maxSampleDistanceMeters, component.longestUncoveredGapRatio];
  if (!values.every((value) => Number.isFinite(value))) errors.push(`Match ${matchKey} has non-finite component evidence.`);
  if (component.coverageRatio < 0 || component.coverageRatio > 1 || component.longestUncoveredGapRatio < 0 || component.longestUncoveredGapRatio > 1) errors.push(`Match ${matchKey} has component ratios outside 0..1.`);
}