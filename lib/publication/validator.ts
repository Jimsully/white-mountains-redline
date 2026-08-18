import { PRODUCTION_SEGMENT_KEY_VERSION, PRODUCTION_TRAIL_KEY_VERSION, PUBLICATION_ALGORITHM_VERSION, type PublicationDecision, type VerifiedNetworkArtifact } from "@/types/publication";
import { lineLengthMeters } from "@/lib/segment-construction/geometry";
import { productionSegmentKeyFor, productionTrailKeyFor } from "@/lib/publication/identity";
import { trailRegions } from "@/types/trails";

export function assertValidVerifiedNetworkArtifact(artifact: VerifiedNetworkArtifact) {
  const errors = validateVerifiedNetworkArtifact(artifact);
  if (errors.length) throw new Error(`Verified publication artifact failed integrity validation:\n${errors.join("\n")}`);
}

export function validateVerifiedNetworkArtifact(artifact: VerifiedNetworkArtifact) {
  const errors: string[] = [];
  if (!artifact || typeof artifact !== "object") return ["Verified publication artifact is not an object."];
  if (artifact.metadata.algorithmVersion !== PUBLICATION_ALGORITHM_VERSION) errors.push("Publication algorithm version is missing or stale.");
  if (artifact.metadata.productionTrailKeyVersion !== PRODUCTION_TRAIL_KEY_VERSION) errors.push("Production trail key version is missing or stale.");
  if (artifact.metadata.productionSegmentKeyVersion !== PRODUCTION_SEGMENT_KEY_VERSION) errors.push("Production segment key version is missing or stale.");

  const candidateTrailKeys = new Set(artifact.candidateTrails.map((trail) => trail.candidateTrailKey));
  const candidateSegmentByKey = new Map(artifact.candidateSegments.map((segment) => [segment.candidateSegmentKey, segment]));
  const metadataByTrailKey = new Map(artifact.trailMetadata.map((metadata) => [metadata.candidateTrailKey, metadata]));
  const decisionsByKey = new Map<string, PublicationDecision>();
  const publishedTrailCandidateKeys = new Set<string>();
  const publishedSegmentCandidateKeys = new Set<string>();

  validateUnique(artifact.trails.map((trail) => trail.id), "trail id", errors);
  validateUnique(artifact.trails.map((trail) => trail.productionTrailKey), "production trail key", errors);
  validateUnique(artifact.trails.map((trail) => trail.slug), "trail slug", errors);
  validateUnique(artifact.trailSegments.map((segment) => segment.id), "segment id", errors);
  validateUnique(artifact.trailSegments.map((segment) => segment.productionSegmentKey), "production segment key", errors);
  validateUnique(artifact.trailSegments.map((segment) => segment.slug), "segment slug", errors);

  for (const decision of artifact.publicationDecisions) {
    const key = decisionKey(decision);
    if (decisionsByKey.has(key)) errors.push(`Duplicate publication decision for ${key}.`);
    decisionsByKey.set(key, decision);
    if (!isValidReviewTimestamp(decision.reviewTimestamp)) errors.push(`Publication decision ${key} is missing a valid review timestamp.`);
    if (decision.targetType === "trail" && !candidateTrailKeys.has(decision.targetKey)) errors.push(`Publication decision references unknown trail ${decision.targetKey}.`);
    if (decision.targetType === "segment" && !candidateSegmentByKey.has(decision.targetKey)) errors.push(`Publication decision references unknown segment ${decision.targetKey}.`);
  }

  const trailById = new Map(artifact.trails.map((trail) => [trail.id, trail]));
  const trailByProductionKey = new Map(artifact.trails.map((trail) => [trail.productionTrailKey, trail]));
  for (const trail of artifact.trails) {
    const prefix = `Trail ${trail.id}`;
    publishedTrailCandidateKeys.add(trail.provenance?.candidateTrailKey);
    if (trail.dataStatus !== "verified") errors.push(`${prefix} is not verified.`);
    if (trail.verificationStatus !== "human_verified") errors.push(`${prefix} is not human verified.`);
    if (!trail.provenance) errors.push(`${prefix} is missing provenance.`);
    if (!candidateTrailKeys.has(trail.provenance?.candidateTrailKey)) errors.push(`${prefix} references an unknown candidate trail.`);
    if (!trail.provenance?.parentInventoryItemKey) errors.push(`${prefix} is missing parent inventory identity.`);
    if (!trail.provenance?.sourceProvider) errors.push(`${prefix} is missing source provider.`);
    if (!trail.sourceFeatureIds.length) errors.push(`${prefix} is missing source feature IDs.`);
    if (!metadataByTrailKey.has(trail.provenance?.candidateTrailKey)) errors.push(`${prefix} is missing canonical trail metadata.`);
    if (!trailRegions.includes(trail.region)) errors.push(`${prefix} has an invalid region.`);
    const decision = decisionsByKey.get(`trail:${trail.provenance?.candidateTrailKey}`);
    if (!decision) errors.push(`${prefix} is missing a publication decision.`);
    if (decision?.decision !== "verified_for_publication") errors.push(`${prefix} is not verified for publication.`);
    if (trail.provenance?.publicationDecision.decision !== "verified_for_publication") errors.push(`${prefix} embeds a non-verified publication decision.`);
    if (trail.provenance && productionTrailKeyFor({ parentInventoryItemKey: trail.provenance.parentInventoryItemKey, trailNormalizedName: trail.normalizedName }) !== trail.productionTrailKey) errors.push(`${prefix} has a non-deterministic production trail key.`);
  }

  for (const segment of artifact.trailSegments) {
    const prefix = `Segment ${segment.id}`;
    publishedSegmentCandidateKeys.add(segment.provenance?.candidateSegmentKey);
    const candidate = candidateSegmentByKey.get(segment.provenance?.candidateSegmentKey);
    const trail = trailById.get(segment.trailId);
    if (segment.dataStatus !== "verified") errors.push(`${prefix} is not verified.`);
    if (segment.verificationStatus !== "human_verified") errors.push(`${prefix} is not human verified.`);
    if (segment.completed !== false) errors.push(`${prefix} must not create completion state.`);
    if (!trail) errors.push(`${prefix} references unknown trail ${segment.trailId}.`);
    if (trail && trail.productionTrailKey !== segment.trailProductionKey) errors.push(`${prefix} parent production trail key does not match its trail.`);
    if (!trailByProductionKey.has(segment.trailProductionKey)) errors.push(`${prefix} references an unknown parent production trail key.`);
    if (!candidate) errors.push(`${prefix} references an unknown publication candidate segment.`);
    if (candidate && candidate.candidateSegmentKey !== segment.provenance.candidateSegmentKey) errors.push(`${prefix} candidate key does not match provenance.`);
    if (!segment.provenance) errors.push(`${prefix} is missing provenance.`);
    if (!segment.sourceFeatureIds.length) errors.push(`${prefix} is missing source feature IDs.`);
    if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) errors.push(`${prefix} has malformed geometry.`);
    validateCoordinates(prefix, segment.coordinates, errors);
    if (!Number.isFinite(segment.miles) || segment.miles <= 0) errors.push(`${prefix} has invalid mileage.`);
    if (Array.isArray(segment.coordinates) && segment.coordinates.length >= 2 && lineLengthMeters(segment.coordinates) <= 0) errors.push(`${prefix} has zero-length geometry.`);
    const segmentDecision = decisionsByKey.get(`segment:${segment.provenance?.candidateSegmentKey}`);
    const trailDecision = decisionsByKey.get(`trail:${segment.provenance?.candidateTrailKey}`);
    if (segmentDecision?.decision !== "verified_for_publication") errors.push(`${prefix} publication decision is not verified_for_publication.`);
    if (trailDecision?.decision !== "verified_for_publication") errors.push(`${prefix} parent trail publication decision is not verified_for_publication.`);
    if (!isValidReviewTimestamp(segment.provenance?.publicationDecision.reviewTimestamp)) errors.push(`${prefix} publication review timestamp is missing or invalid.`);
    if (segment.provenance?.publicationDecision.decision !== "verified_for_publication") errors.push(`${prefix} embeds a non-verified segment publication decision.`);
    if (segment.provenance?.trailPublicationDecision.decision !== "verified_for_publication") errors.push(`${prefix} embeds a non-verified trail publication decision.`);
    validateUpstreamDecisions(prefix, segment, candidate, errors);
    if (!segment.provenance?.sourceSegmentArtifact.generatedAt || typeof segment.provenance?.sourceSegmentArtifact.demoOnly !== "boolean" || !segment.provenance?.sourceSegmentArtifact.algorithmVersion) errors.push(`${prefix} source SegmentConstruction artifact identity is incomplete.`);
    if (candidate && segment.provenance?.segmentConstructionAlgorithmVersion !== candidate.segmentConstructionAlgorithmVersion) errors.push(`${prefix} segment-construction algorithm version is stale.`);
    if (candidate && productionSegmentKeyFor(segment.trailProductionKey, candidate) !== segment.productionSegmentKey) errors.push(`${prefix} has a non-deterministic production segment key.`);
  }

  for (const decision of artifact.publicationDecisions) {
    if (decision.decision === "rejected" || decision.decision === "needs_review") {
      const published = decision.targetType === "trail" ? publishedTrailCandidateKeys.has(decision.targetKey) : publishedSegmentCandidateKeys.has(decision.targetKey);
      if (published) errors.push(`${decisionKey(decision)} appears in published output despite ${decision.decision}.`);
    }
  }
  return errors;
}

function validateUpstreamDecisions(prefix: string, segment: { provenance: { upstreamDecisions: { segmentDecision: { targetType: string; targetKey: string; decision: string }; startJunctionDecision: { targetType: string; targetKey: string; decision: string }; endJunctionDecision: { targetType: string; targetKey: string; decision: string } } } }, candidate: { candidateSegmentKey: string; startJunctionKey: string; endJunctionKey: string } | undefined, errors: string[]) {
  const upstream = segment.provenance.upstreamDecisions;
  if (upstream.segmentDecision.targetType !== "segment" || upstream.segmentDecision.decision !== "accepted") errors.push(`${prefix} upstream segment decision is not accepted.`);
  if (upstream.startJunctionDecision.targetType !== "junction" || upstream.startJunctionDecision.decision !== "accepted") errors.push(`${prefix} upstream start junction decision is not accepted.`);
  if (upstream.endJunctionDecision.targetType !== "junction" || upstream.endJunctionDecision.decision !== "accepted") errors.push(`${prefix} upstream end junction decision is not accepted.`);
  if (candidate && upstream.segmentDecision.targetKey !== candidate.candidateSegmentKey) errors.push(`${prefix} upstream segment decision target does not match candidate.`);
  if (candidate && upstream.startJunctionDecision.targetKey !== candidate.startJunctionKey) errors.push(`${prefix} upstream start junction decision target does not match candidate.`);
  if (candidate && upstream.endJunctionDecision.targetKey !== candidate.endJunctionKey) errors.push(`${prefix} upstream end junction decision target does not match candidate.`);
}

function validateCoordinates(prefix: string, coordinates: unknown, errors: string[]) {
  if (!Array.isArray(coordinates)) return;
  coordinates.forEach((coordinate, index) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2 || typeof coordinate[0] !== "number" || typeof coordinate[1] !== "number") {
      errors.push(`${prefix} has invalid coordinate ${index}.`);
      return;
    }
    const [lon, lat] = coordinate;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) errors.push(`${prefix} has non-finite coordinate ${index}.`);
    if (lon < -180 || lon > 180) errors.push(`${prefix} has out-of-range longitude at coordinate ${index}.`);
    if (lat < -90 || lat > 90) errors.push(`${prefix} has out-of-range latitude at coordinate ${index}.`);
  });
}

function validateUnique(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) errors.push(`Missing ${label}.`);
    if (seen.has(value)) errors.push(`Duplicate ${label} ${value}.`);
    seen.add(value);
  }
}

function decisionKey(decision: Pick<PublicationDecision, "targetType" | "targetKey">) {
  return `${decision.targetType}:${decision.targetKey}`;
}

function isValidReviewTimestamp(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

