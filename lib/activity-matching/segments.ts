import type { SegmentConstructionArtifact, SegmentCandidate, SegmentReviewDecision } from "@/types/segment-construction";
import { SEGMENT_CONSTRUCTION_ALGORITHM_VERSION } from "@/types/segment-construction";
import type { EligibleMatchingSegment, SegmentConstructionDecisionExport } from "@/types/activity-matching";

export type EligibleSegmentResolution = {
  eligibleSegments: EligibleMatchingSegment[];
  errors: string[];
  warnings: string[];
};

export function resolveEligibleMatchingSegments(artifact: SegmentConstructionArtifact, decisionExport: SegmentConstructionDecisionExport): EligibleSegmentResolution {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (artifact.metadata.algorithmVersion !== SEGMENT_CONSTRUCTION_ALGORITHM_VERSION) errors.push(`Unsupported segment-construction artifact version: ${artifact.metadata.algorithmVersion}`);
  if (decisionExport.algorithmVersion !== artifact.metadata.algorithmVersion) errors.push("Segment decision export algorithm version does not match the segment-construction artifact.");
  if (decisionExport.sourceArtifact?.generatedAt !== artifact.metadata.generatedAt) errors.push("Segment decision export was produced from a different segment-construction artifact timestamp.");
  if (decisionExport.sourceArtifact?.algorithmVersion !== artifact.metadata.algorithmVersion) errors.push("Segment decision export source artifact algorithm version is stale.");
  if (decisionExport.sourceArtifact?.demoOnly !== artifact.metadata.demoOnly) errors.push("Segment decision export demo/private identity does not match the segment-construction artifact.");

  const junctionKeys = new Set(artifact.junctionCandidates.map((junction) => junction.key));
  const segmentKeys = new Set(artifact.segmentCandidates.map((segment) => segment.key));
  const decisions = new Map<string, SegmentReviewDecision>();
  for (const decision of decisionExport.decisions) {
    const decisionKey = `${decision.targetType}:${decision.targetKey}`;
    if (decisions.has(decisionKey)) errors.push(`Duplicate segment-construction decision for ${decisionKey}.`);
    decisions.set(decisionKey, decision);
    if (decision.targetType === "junction" && !junctionKeys.has(decision.targetKey)) errors.push(`Decision references unknown junction ${decision.targetKey}.`);
    if (decision.targetType === "segment" && !segmentKeys.has(decision.targetKey)) errors.push(`Decision references unknown segment ${decision.targetKey}.`);
  }

  const eligibleSegments: EligibleMatchingSegment[] = [];
  for (const segment of artifact.segmentCandidates) {
    const segmentDecision = decisions.get(`segment:${segment.key}`);
    const startDecision = decisions.get(`junction:${segment.startJunctionKey}`);
    const endDecision = decisions.get(`junction:${segment.endJunctionKey}`);
    if (!junctionKeys.has(segment.startJunctionKey)) errors.push(`Segment ${segment.key} references unknown start junction ${segment.startJunctionKey}.`);
    if (!junctionKeys.has(segment.endJunctionKey)) errors.push(`Segment ${segment.key} references unknown end junction ${segment.endJunctionKey}.`);
    if (!segmentDecision || !startDecision || !endDecision) {
      warnings.push(`Segment ${segment.key} is not eligible because it is missing an explicit segment/start/end acceptance decision.`);
      continue;
    }
    if (segmentDecision.decision !== "accepted" || startDecision.decision !== "accepted" || endDecision.decision !== "accepted") continue;
    eligibleSegments.push(segmentToEligible(segment, artifact.metadata.algorithmVersion, segmentDecision, startDecision, endDecision, decisionExport));
  }

  return { eligibleSegments, errors, warnings };
}

export function requireEligibleMatchingSegments(artifact: SegmentConstructionArtifact, decisionExport: SegmentConstructionDecisionExport): EligibleMatchingSegment[] {
  const resolution = resolveEligibleMatchingSegments(artifact, decisionExport);
  if (resolution.errors.length) throw new Error(`Accepted segment input failed integrity validation:\n${resolution.errors.join("\n")}`);
  return resolution.eligibleSegments;
}

function segmentToEligible(segment: SegmentCandidate, segmentConstructionAlgorithmVersion: string, segmentDecision: SegmentReviewDecision, startJunctionDecision: SegmentReviewDecision, endJunctionDecision: SegmentReviewDecision, decisionExport: SegmentConstructionDecisionExport): EligibleMatchingSegment {
  return {
    segmentKey: segment.key,
    parentInventoryItemKey: segment.parentInventoryItemKey,
    trailDisplayName: segment.trailDisplayName,
    trailNormalizedName: segment.trailNormalizedName,
    startJunctionKey: segment.startJunctionKey,
    endJunctionKey: segment.endJunctionKey,
    geometry: segment.geometry,
    calculatedMeters: segment.calculatedMeters,
    sourceFeatureIds: segment.sourceFeatureIds,
    sourceProvider: segment.sourceProvider,
    segmentConstructionAlgorithmVersion,
    sourceSegmentCandidate: segment,
    approvalEvidence: {
      segmentDecision,
      startJunctionDecision,
      endJunctionDecision,
      decisionArtifactAlgorithmVersion: decisionExport.algorithmVersion,
      sourceSegmentArtifact: decisionExport.sourceArtifact ?? {},
    },
  };
}