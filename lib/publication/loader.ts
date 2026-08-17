import type { VerifiedNetworkArtifact } from "@/types/publication";

export type PublicationLoadPayload = {
  trails: Array<Record<string, unknown>>;
  trailSegments: Array<Record<string, unknown>>;
  auditRun: Record<string, unknown>;
};

export function buildPublicationLoadPayload(artifact: VerifiedNetworkArtifact, existingSegments: Array<{ segment_key: string; coordinates: unknown }> = []): PublicationLoadPayload {
  if (artifact.diagnostics.integrityErrors.length) throw new Error("Cannot load a publication artifact with integrity errors.");
  const existingGeometryByKey = new Map(existingSegments.map((segment) => [segment.segment_key, JSON.stringify(segment.coordinates)]));
  for (const segment of artifact.trailSegments) {
    const existing = existingGeometryByKey.get(segment.productionSegmentKey);
    if (existing && existing !== JSON.stringify(segment.coordinates)) throw new Error(`Refusing to overwrite different geometry for ${segment.productionSegmentKey}.`);
  }
  return {
    trails: artifact.trails.map((trail) => ({
      id: trail.id,
      slug: trail.slug,
      name: trail.name,
      region: trail.region,
      source_label: "verified publication artifact",
      source_ref: trail.productionTrailKey,
      data_status: trail.dataStatus,
      verification_status: trail.verificationStatus,
      provenance: trail.provenance,
    })),
    trailSegments: artifact.trailSegments.map((segment) => ({
      id: segment.id,
      trail_id: segment.trailId,
      segment_key: segment.productionSegmentKey,
      segment_name: segment.segmentName,
      miles: segment.miles,
      data_status: segment.dataStatus,
      verification_status: segment.verificationStatus,
      source_label: "verified publication artifact",
      source_ref: segment.productionSegmentKey,
      source_feature_ids: segment.sourceFeatureIds,
      provenance: segment.provenance,
      coordinates: segment.coordinates,
    })),
    auditRun: {
      algorithm_version: artifact.metadata.algorithmVersion,
      generated_at: artifact.metadata.generatedAt,
      demo_only: artifact.metadata.demoOnly,
      diagnostics: artifact.diagnostics,
    },
  };
}
