import type { EligibleMatchingSegment } from "@/types/activity-matching";
import type { TrailSegment, SourceProvider, TrailRegion } from "@/types/trails";
import type { VerifiedNetworkArtifact, VerifiedPublishedSegment } from "@/types/publication";

export function verifiedNetworkToTrailSegments(artifact: VerifiedNetworkArtifact): TrailSegment[] {
  return artifact.trailSegments.map(verifiedSegmentToTrailSegment);
}

export function verifiedSegmentToTrailSegment(segment: VerifiedPublishedSegment): TrailSegment {
  return {
    id: segment.id,
    slug: segment.slug,
    trailId: segment.trailId,
    trailName: segment.trailName,
    segmentName: segment.segmentName,
    region: toTrailRegion(segment.region),
    miles: segment.miles,
    completed: false,
    coordinates: toCoordinateTuples(segment.coordinates),
    dataStatus: segment.dataStatus,
    verificationStatus: segment.verificationStatus,
    provenance: {
      provider: toSourceProvider(segment.sourceProvider),
      dataset: "verified publication artifact",
      sourceFeatureIds: segment.sourceFeatureIds,
      manuallyModified: false,
      notes: "Verified publication gate output. NOT FOR NAVIGATION in demo mode; completion state is not created by publication.",
    },
  };
}

export function verifiedNetworkToEligibleMatchingSegments(artifact: VerifiedNetworkArtifact): EligibleMatchingSegment[] {
  return artifact.trailSegments.map((segment) => ({
    segmentKey: segment.productionSegmentKey,
    parentInventoryItemKey: segment.provenance.parentInventoryItemKey,
    trailDisplayName: segment.trailName,
    trailNormalizedName: segment.provenance.sourceSegmentCandidate.trailNormalizedName,
    startJunctionKey: segment.provenance.startJunctionKey,
    endJunctionKey: segment.provenance.endJunctionKey,
    geometry: { type: "LineString", coordinates: segment.coordinates },
    calculatedMeters: segment.provenance.sourceSegmentCandidate.calculatedMeters,
    sourceFeatureIds: segment.sourceFeatureIds,
    sourceProvider: segment.sourceProvider,
    segmentConstructionAlgorithmVersion: segment.provenance.segmentConstructionAlgorithmVersion,
    sourceSegmentCandidate: segment.provenance.sourceSegmentCandidate,
    approvalEvidence: {
      segmentDecision: segment.provenance.upstreamDecisions.segmentDecision,
      startJunctionDecision: segment.provenance.upstreamDecisions.startJunctionDecision,
      endJunctionDecision: segment.provenance.upstreamDecisions.endJunctionDecision,
      decisionArtifactAlgorithmVersion: segment.provenance.segmentConstructionAlgorithmVersion,
      sourceSegmentArtifact: segment.provenance.sourceSegmentArtifact,
    },
  }));
}

function toSourceProvider(value: string): SourceProvider {
  return value === "USFS" || value === "OSM" || value === "manual" || value === "demo" ? value : "other";
}

function toTrailRegion(value: string): TrailRegion {
  return value === "Franconia-Pemigewasset" || value === "Presidential Range" || value === "Carter-Moriah" || value === "Sandwich Range" || value === "Waterville Valley" ? value : "Other";
}

function toCoordinateTuples(coordinates: VerifiedPublishedSegment["coordinates"]): [number, number][] {
  return coordinates.map((coordinate) => [coordinate[0], coordinate[1]]);
}
