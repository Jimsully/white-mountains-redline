import { stableArtifactFingerprint } from "@/lib/publication/identity";
import { assertValidVerifiedNetworkArtifact } from "@/lib/publication/validator";
import type { VerifiedNetworkArtifact } from "@/types/publication";

export type ExistingPublicationTrail = { production_trail_key: string; slug: string; name: string; region: string; source_ref?: string | null };
export type ExistingPublicationSegment = { segment_key: string; trail_production_key: string; coordinates: unknown; source_ref?: string | null };

export type PublicationLoadPayload = {
  trails: Array<Record<string, unknown>>;
  trailSegments: Array<Record<string, unknown>>;
  auditRun: Record<string, unknown>;
};

export function buildPublicationLoadPayload(artifact: VerifiedNetworkArtifact, existing: { trails?: ExistingPublicationTrail[]; segments?: ExistingPublicationSegment[] } = {}): PublicationLoadPayload {
  assertValidVerifiedNetworkArtifact(artifact);
  if (artifact.metadata.demoOnly) throw new Error("Demo publication artifacts must not be loaded into Supabase.");
  const artifactFingerprint = stableArtifactFingerprint(canonicalFingerprintPayload(artifact));
  validateExistingTrailConflicts(artifact, existing.trails ?? []);
  validateExistingSegmentConflicts(artifact, existing.segments ?? []);
  return {
    trails: artifact.trails.map((trail) => ({
      production_trail_key: trail.productionTrailKey,
      slug: trail.slug,
      name: trail.name,
      region: trail.region,
      source_label: "verified publication artifact",
      source_ref: trail.productionTrailKey,
      data_status: trail.dataStatus,
      verification_status: trail.verificationStatus,
      reviewed_at: trail.provenance.publicationDecision.reviewTimestamp,
      publication_artifact_fingerprint: artifactFingerprint,
      provenance: trail.provenance,
    })),
    trailSegments: artifact.trailSegments.map((segment) => ({
      trail_production_key: segment.trailProductionKey,
      segment_key: segment.productionSegmentKey,
      segment_name: segment.segmentName,
      miles: segment.miles,
      data_status: segment.dataStatus,
      verification_status: segment.verificationStatus,
      source_label: "verified publication artifact",
      source_ref: segment.productionSegmentKey,
      source_feature_ids: segment.sourceFeatureIds,
      reviewed_at: segment.provenance.publicationDecision.reviewTimestamp,
      publication_artifact_fingerprint: artifactFingerprint,
      provenance: segment.provenance,
      coordinates: segment.coordinates,
    })),
    auditRun: {
      algorithm_version: artifact.metadata.algorithmVersion,
      generated_at: artifact.metadata.generatedAt,
      artifact_fingerprint: artifactFingerprint,
      demo_only: artifact.metadata.demoOnly,
      diagnostics: artifact.diagnostics,
      artifact_identity: {
        productionTrailKeyVersion: artifact.metadata.productionTrailKeyVersion,
        productionSegmentKeyVersion: artifact.metadata.productionSegmentKeyVersion,
        publicationDecisionExport: artifact.metadata.publicationDecisionExport,
      },
    },
  };
}

function validateExistingTrailConflicts(artifact: VerifiedNetworkArtifact, existingTrails: ExistingPublicationTrail[]) {
  const incoming = new Map(artifact.trails.map((trail) => [trail.productionTrailKey, trail]));
  for (const existing of existingTrails) {
    const trail = incoming.get(existing.production_trail_key);
    if (!trail) continue;
    if (existing.slug !== trail.slug || existing.name !== trail.name || existing.region !== trail.region) throw new Error(`Refusing to overwrite conflicting trail identity for ${trail.productionTrailKey}.`);
  }
}

function validateExistingSegmentConflicts(artifact: VerifiedNetworkArtifact, existingSegments: ExistingPublicationSegment[]) {
  const incoming = new Map(artifact.trailSegments.map((segment) => [segment.productionSegmentKey, segment]));
  for (const existing of existingSegments) {
    const segment = incoming.get(existing.segment_key);
    if (!segment) continue;
    if (existing.trail_production_key !== segment.trailProductionKey) throw new Error(`Refusing to overwrite conflicting parent trail for ${segment.productionSegmentKey}.`);
    if (JSON.stringify(existing.coordinates) !== JSON.stringify(segment.coordinates)) throw new Error(`Refusing to overwrite different geometry for ${segment.productionSegmentKey}.`);
  }
}

function canonicalFingerprintPayload(artifact: VerifiedNetworkArtifact) {
  return {
    metadata: {
      algorithmVersion: artifact.metadata.algorithmVersion,
      productionTrailKeyVersion: artifact.metadata.productionTrailKeyVersion,
      productionSegmentKeyVersion: artifact.metadata.productionSegmentKeyVersion,
      publicationDecisionExport: artifact.metadata.publicationDecisionExport,
    },
    publicationDecisions: artifact.publicationDecisions,
    trailMetadata: artifact.trailMetadata,
    candidateTrails: artifact.candidateTrails,
    candidateSegments: artifact.candidateSegments,
    trails: artifact.trails,
    trailSegments: artifact.trailSegments,
  };
}
