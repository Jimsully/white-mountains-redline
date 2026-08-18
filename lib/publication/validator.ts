import { PRODUCTION_SEGMENT_KEY_VERSION, PRODUCTION_TRAIL_KEY_VERSION, PUBLICATION_ALGORITHM_VERSION, type PublicationCandidateSegment, type PublicationCandidateTrail, type PublicationDecision, type PublicationTrailMetadata, type VerifiedNetworkArtifact, type VerifiedPublishedSegment, type VerifiedPublishedTrail } from "@/types/publication";
import type { SegmentCandidate } from "@/types/segment-construction";
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

  validateDemoIdentity(artifact, errors);
  const canonicalSourceArtifact = validateCanonicalSourceArtifactIdentity(artifact, errors);
  validateUnique(artifact.candidateTrails.map((trail) => trail.candidateTrailKey), "candidate trail key", errors);
  validateUnique(artifact.candidateSegments.map((segment) => segment.candidateSegmentKey), "candidate segment key", errors);
  validateUnique(artifact.trailMetadata.map((metadata) => metadata.candidateTrailKey), "trail metadata candidate key", errors);
  validateUnique(artifact.trails.map((trail) => trail.id), "trail id", errors);
  validateUnique(artifact.trails.map((trail) => trail.productionTrailKey), "production trail key", errors);
  validateUnique(artifact.trails.map((trail) => trail.slug), "trail slug", errors);
  validateUnique(artifact.trailSegments.map((segment) => segment.id), "segment id", errors);
  validateUnique(artifact.trailSegments.map((segment) => segment.productionSegmentKey), "production segment key", errors);
  validateUnique(artifact.trailSegments.map((segment) => segment.slug), "segment slug", errors);

  const candidateTrailByKey = new Map(artifact.candidateTrails.map((trail) => [trail.candidateTrailKey, trail]));
  const candidateSegmentByKey = new Map(artifact.candidateSegments.map((segment) => [segment.candidateSegmentKey, segment]));
  const metadataByTrailKey = new Map(artifact.trailMetadata.map((metadata) => [metadata.candidateTrailKey, metadata]));
  const decisionsByKey = new Map<string, PublicationDecision>();
  const publishedTrailCandidateKeys = new Set<string>();
  const publishedSegmentCandidateKeys = new Set<string>();

  for (const metadata of artifact.trailMetadata) {
    if (!candidateTrailByKey.has(metadata.candidateTrailKey)) errors.push(`Trail metadata references unknown candidate trail ${metadata.candidateTrailKey}.`);
    if (!isTrailRegion(metadata.region)) errors.push(`Trail metadata has invalid region for ${metadata.candidateTrailKey}.`);
  }

  for (const trail of artifact.candidateTrails) validateCandidateTrail(trail, metadataByTrailKey.get(trail.candidateTrailKey), errors);
  for (const segment of artifact.candidateSegments) validateCandidateSegment(segment, candidateTrailByKey.get(segment.candidateTrailKey), canonicalSourceArtifact, errors);

  for (const decision of artifact.publicationDecisions) {
    const key = decisionKey(decision);
    if (decisionsByKey.has(key)) errors.push(`Duplicate publication decision for ${key}.`);
    decisionsByKey.set(key, decision);
    if (!isValidReviewTimestamp(decision.reviewTimestamp)) errors.push(`Publication decision ${key} is missing a valid review timestamp.`);
    if (decision.targetType === "trail" && !candidateTrailByKey.has(decision.targetKey)) errors.push(`Publication decision references unknown trail ${decision.targetKey}.`);
    if (decision.targetType === "segment" && !candidateSegmentByKey.has(decision.targetKey)) errors.push(`Publication decision references unknown segment ${decision.targetKey}.`);
  }

  const trailById = new Map(artifact.trails.map((trail) => [trail.id, trail]));
  const trailByProductionKey = new Map(artifact.trails.map((trail) => [trail.productionTrailKey, trail]));
  for (const trail of artifact.trails) {
    const candidateTrailKey = trail.provenance?.candidateTrailKey;
    if (candidateTrailKey) publishedTrailCandidateKeys.add(candidateTrailKey);
    validatePublishedTrail(trail, candidateTrailByKey.get(candidateTrailKey), metadataByTrailKey, decisionsByKey, errors);
  }

  for (const segment of artifact.trailSegments) {
    const candidateSegmentKey = segment.provenance?.candidateSegmentKey;
    if (candidateSegmentKey) publishedSegmentCandidateKeys.add(candidateSegmentKey);
    validatePublishedSegment(segment, candidateSegmentByKey.get(candidateSegmentKey), trailById, trailByProductionKey, decisionsByKey, errors);
  }

  for (const decision of artifact.publicationDecisions) {
    if (decision.decision === "rejected" || decision.decision === "needs_review") {
      const published = decision.targetType === "trail" ? publishedTrailCandidateKeys.has(decision.targetKey) : publishedSegmentCandidateKeys.has(decision.targetKey);
      if (published) errors.push(`${decisionKey(decision)} appears in published output despite ${decision.decision}.`);
    }
  }
  return errors;
}


type SourceArtifactIdentity = { generatedAt: string; demoOnly: boolean; algorithmVersion: string };

function validateCanonicalSourceArtifactIdentity(artifact: VerifiedNetworkArtifact, errors: string[]): SourceArtifactIdentity | undefined {
  const sourceArtifact = artifact.metadata.publicationDecisionExport?.sourceArtifact;
  const segmentDecisionSourceArtifact = artifact.metadata.publicationDecisionExport?.sourceSegmentDecisions?.sourceArtifact;
  const canonical = readSourceArtifactIdentity(sourceArtifact, "metadata.publicationDecisionExport.sourceArtifact", errors);
  const decisionSource = readSourceArtifactIdentity(segmentDecisionSourceArtifact, "metadata.publicationDecisionExport.sourceSegmentDecisions.sourceArtifact", errors);
  if (canonical && decisionSource && !sourceArtifactIdentityMatches(decisionSource, canonical)) errors.push("Publication decision source artifact identity does not match segment-decision source artifact identity.");
  return canonical;
}

function readSourceArtifactIdentity(value: unknown, label: string, errors: string[]): SourceArtifactIdentity | undefined {
  if (!value || typeof value !== "object") {
    errors.push(`${label} is missing canonical SegmentConstruction artifact identity.`);
    return undefined;
  }
  const identity = value as Partial<SourceArtifactIdentity>;
  if (typeof identity.generatedAt !== "string" || identity.generatedAt.trim().length === 0) errors.push(`${label}.generatedAt is missing.`);
  if (typeof identity.demoOnly !== "boolean") errors.push(`${label}.demoOnly must be an explicit boolean.`);
  if (typeof identity.algorithmVersion !== "string" || identity.algorithmVersion.trim().length === 0) errors.push(`${label}.algorithmVersion is missing.`);
  if (typeof identity.generatedAt !== "string" || identity.generatedAt.trim().length === 0 || typeof identity.demoOnly !== "boolean" || typeof identity.algorithmVersion !== "string" || identity.algorithmVersion.trim().length === 0) return undefined;
  return { generatedAt: identity.generatedAt, demoOnly: identity.demoOnly, algorithmVersion: identity.algorithmVersion };
}

function sourceArtifactIdentityMatches(value: unknown, canonical: SourceArtifactIdentity) {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<SourceArtifactIdentity>;
  return identity.generatedAt === canonical.generatedAt && identity.demoOnly === canonical.demoOnly && identity.algorithmVersion === canonical.algorithmVersion;
}
function validateDemoIdentity(artifact: VerifiedNetworkArtifact, errors: string[]) {
  const identities: Array<{ label: string; value: unknown }> = [
    { label: "artifact.metadata.demoOnly", value: artifact.metadata.demoOnly },
    { label: "metadata.publicationDecisionExport.sourceArtifact.demoOnly", value: artifact.metadata.publicationDecisionExport?.sourceArtifact?.demoOnly },
    { label: "metadata.publicationDecisionExport.sourceSegmentDecisions.sourceArtifact.demoOnly", value: artifact.metadata.publicationDecisionExport?.sourceSegmentDecisions?.sourceArtifact?.demoOnly },
    ...artifact.candidateSegments.map((segment) => ({ label: `candidateSegments.${segment.candidateSegmentKey}.sourceSegmentArtifact.demoOnly`, value: segment.sourceSegmentArtifact?.demoOnly })),
    ...artifact.trailSegments.map((segment) => ({ label: `trailSegments.${segment.id}.provenance.sourceSegmentArtifact.demoOnly`, value: segment.provenance?.sourceSegmentArtifact?.demoOnly })),
  ];
  const booleanValues: boolean[] = [];
  for (const identity of identities) {
    if (typeof identity.value !== "boolean") {
      errors.push(`${identity.label} must be an explicit boolean.`);
    } else {
      booleanValues.push(identity.value);
    }
  }
  if (booleanValues.length > 0 && booleanValues.some((value) => value !== booleanValues[0])) errors.push("Publication artifact demo/private identity is inconsistent across upstream lineage.");
}

function validateCandidateTrail(trail: PublicationCandidateTrail, metadata: PublicationTrailMetadata | undefined, errors: string[]) {
  const prefix = `Candidate trail ${trail.candidateTrailKey}`;
  if (!metadata) errors.push(`${prefix} is missing canonical trail metadata.`);
  if (metadata) {
    if (trail.canonicalDisplayName !== metadata.displayName) errors.push(`${prefix} canonical display name does not match trail metadata.`);
    if (trail.region !== metadata.region) errors.push(`${prefix} region does not match trail metadata.`);
  }
  if (!trail.parentInventoryItemKey) errors.push(`${prefix} is missing parent inventory identity.`);
  if (!trail.trailNormalizedName) errors.push(`${prefix} is missing normalized trail name.`);
  if (!trail.sourceProvider) errors.push(`${prefix} is missing source provider.`);
  if (!trail.sourceFeatureIds.length) errors.push(`${prefix} is missing source feature IDs.`);
  if (!trail.segmentCandidateKeys.length) errors.push(`${prefix} is missing segment candidate keys.`);
  if (!Number.isFinite(trail.calculatedMiles) || trail.calculatedMiles <= 0) errors.push(`${prefix} has invalid mileage.`);
}

function validateCandidateSegment(segment: PublicationCandidateSegment, trail: PublicationCandidateTrail | undefined, canonicalSourceArtifact: SourceArtifactIdentity | undefined, errors: string[]) {
  const prefix = `Candidate segment ${segment.candidateSegmentKey}`;
  if (!trail) errors.push(`${prefix} references unknown candidate trail ${segment.candidateTrailKey}.`);
  if (trail) {
    if (segment.parentInventoryItemKey !== trail.parentInventoryItemKey) errors.push(`${prefix} parent inventory identity does not match candidate trail.`);
    if (segment.trailNormalizedName !== trail.trailNormalizedName) errors.push(`${prefix} normalized trail name does not match candidate trail.`);
    if (segment.sourceProvider !== trail.sourceProvider) errors.push(`${prefix} source provider does not match candidate trail.`);
  }
  if (canonicalSourceArtifact && !sourceArtifactIdentityMatches(segment.sourceSegmentArtifact, canonicalSourceArtifact)) errors.push(`${prefix} source SegmentConstruction artifact identity does not match canonical reviewed source artifact.`);
  validateSegmentCandidateBinding(prefix, segment, segment.sourceSegmentCandidate, errors);
}

function validatePublishedTrail(trail: VerifiedPublishedTrail, candidate: PublicationCandidateTrail | undefined, metadataByTrailKey: Map<string, PublicationTrailMetadata>, decisionsByKey: Map<string, PublicationDecision>, errors: string[]) {
  const prefix = `Trail ${trail.id}`;
  if (trail.dataStatus !== "verified") errors.push(`${prefix} is not verified.`);
  if (trail.verificationStatus !== "human_verified") errors.push(`${prefix} is not human verified.`);
  if (!trail.provenance) errors.push(`${prefix} is missing provenance.`);
  if (!candidate) {
    errors.push(`${prefix} references an unknown candidate trail.`);
    return;
  }
  const metadata = metadataByTrailKey.get(candidate.candidateTrailKey);
  if (!metadata) errors.push(`${prefix} is missing canonical trail metadata.`);
  if (metadata) {
    if (trail.name !== metadata.displayName) errors.push(`${prefix} name does not match canonical trail metadata.`);
    if (trail.region !== metadata.region) errors.push(`${prefix} region does not match canonical trail metadata.`);
  }
  if (!isTrailRegion(trail.region)) errors.push(`${prefix} has an invalid region.`);
  if (trail.normalizedName !== candidate.trailNormalizedName) errors.push(`${prefix} normalized name does not match candidate trail.`);
  if (trail.provenance.candidateTrailKey !== candidate.candidateTrailKey) errors.push(`${prefix} provenance candidate trail key does not match candidate.`);
  if (trail.provenance.parentInventoryItemKey !== candidate.parentInventoryItemKey) errors.push(`${prefix} provenance parent inventory identity does not match candidate.`);
  if (trail.provenance.sourceProvider !== candidate.sourceProvider) errors.push(`${prefix} provenance source provider does not match candidate.`);
  if (!sameStringSet(trail.sourceFeatureIds, candidate.sourceFeatureIds)) errors.push(`${prefix} source feature IDs do not match candidate trail.`);
  if (!sameStringSet(trail.provenance.sourceSegmentCandidateKeys, candidate.segmentCandidateKeys)) errors.push(`${prefix} source segment candidate keys do not match candidate trail.`);
  if (!Number.isFinite(trail.totalMiles) || !approxEqual(trail.totalMiles, candidate.calculatedMiles)) errors.push(`${prefix} mileage does not match candidate trail.`);
  const decision = decisionsByKey.get(`trail:${candidate.candidateTrailKey}`);
  if (!decision) errors.push(`${prefix} is missing a publication decision.`);
  if (decision?.decision !== "verified_for_publication") errors.push(`${prefix} is not verified for publication.`);
  if (decision && !deepEqual(trail.provenance.publicationDecision, decision)) errors.push(`${prefix} embedded publication decision does not match canonical publication decision.`);
  if (productionTrailKeyFor({ parentInventoryItemKey: candidate.parentInventoryItemKey, trailNormalizedName: candidate.trailNormalizedName }) !== trail.productionTrailKey) errors.push(`${prefix} has a non-deterministic production trail key.`);
}

function validatePublishedSegment(segment: VerifiedPublishedSegment, candidate: PublicationCandidateSegment | undefined, trailById: Map<string, VerifiedPublishedTrail>, trailByProductionKey: Map<string, VerifiedPublishedTrail>, decisionsByKey: Map<string, PublicationDecision>, errors: string[]) {
  const prefix = `Segment ${segment.id}`;
  const trail = trailById.get(segment.trailId);
  const productionTrail = trailByProductionKey.get(segment.trailProductionKey);
  if (segment.dataStatus !== "verified") errors.push(`${prefix} is not verified.`);
  if (segment.verificationStatus !== "human_verified") errors.push(`${prefix} is not human verified.`);
  if (segment.completed !== false) errors.push(`${prefix} must not create completion state.`);
  if (!trail) errors.push(`${prefix} references unknown trail ${segment.trailId}.`);
  if (!productionTrail) errors.push(`${prefix} references an unknown parent production trail key.`);
  if (trail && trail.productionTrailKey !== segment.trailProductionKey) errors.push(`${prefix} parent production trail key does not match its trail.`);
  if (trail) {
    if (segment.trailName !== trail.name) errors.push(`${prefix} trail name does not match parent published trail.`);
    if (segment.region !== trail.region) errors.push(`${prefix} region does not match parent published trail.`);
  }
  if (!candidate) {
    errors.push(`${prefix} references an unknown publication candidate segment.`);
  } else {
    validatePublishedSegmentAgainstCandidate(prefix, segment, candidate, errors);
    if (trail && candidate.candidateTrailKey !== trail.provenance.candidateTrailKey) errors.push(`${prefix} candidate trail key does not match parent published trail.`);
    if (trail && productionSegmentKeyFor(segment.trailProductionKey, candidate) !== segment.productionSegmentKey) errors.push(`${prefix} has a non-deterministic production segment key.`);
  }
  if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) errors.push(`${prefix} has malformed geometry.`);
  validateCoordinates(prefix, segment.coordinates, errors);
  if (!Number.isFinite(segment.miles) || segment.miles <= 0) errors.push(`${prefix} has invalid mileage.`);
  if (Array.isArray(segment.coordinates) && segment.coordinates.length >= 2 && lineLengthMeters(segment.coordinates) <= 0) errors.push(`${prefix} has zero-length geometry.`);
  const segmentDecision = decisionsByKey.get(`segment:${segment.provenance?.candidateSegmentKey}`);
  const trailDecision = decisionsByKey.get(`trail:${segment.provenance?.candidateTrailKey}`);
  if (segmentDecision?.decision !== "verified_for_publication") errors.push(`${prefix} publication decision is not verified_for_publication.`);
  if (trailDecision?.decision !== "verified_for_publication") errors.push(`${prefix} parent trail publication decision is not verified_for_publication.`);
  if (segmentDecision && !deepEqual(segment.provenance.publicationDecision, segmentDecision)) errors.push(`${prefix} embedded segment publication decision does not match canonical publication decision.`);
  if (trailDecision && !deepEqual(segment.provenance.trailPublicationDecision, trailDecision)) errors.push(`${prefix} embedded trail publication decision does not match canonical publication decision.`);
  if (!isValidReviewTimestamp(segment.provenance?.publicationDecision.reviewTimestamp)) errors.push(`${prefix} publication review timestamp is missing or invalid.`);
  validateUpstreamDecisions(prefix, segment, candidate, errors);
  if (!segment.provenance?.sourceSegmentArtifact.generatedAt || typeof segment.provenance?.sourceSegmentArtifact.demoOnly !== "boolean" || !segment.provenance?.sourceSegmentArtifact.algorithmVersion) errors.push(`${prefix} source SegmentConstruction artifact identity is incomplete.`);
  if (candidate && segment.provenance.segmentConstructionAlgorithmVersion !== candidate.segmentConstructionAlgorithmVersion) errors.push(`${prefix} segment-construction algorithm version is stale.`);
}

function validatePublishedSegmentAgainstCandidate(prefix: string, segment: VerifiedPublishedSegment, candidate: PublicationCandidateSegment, errors: string[]) {
  if (segment.provenance.candidateSegmentKey !== candidate.candidateSegmentKey) errors.push(`${prefix} provenance candidate segment key does not match candidate.`);
  if (segment.provenance.candidateTrailKey !== candidate.candidateTrailKey) errors.push(`${prefix} provenance candidate trail key does not match candidate.`);
  if (segment.provenance.parentInventoryItemKey !== candidate.parentInventoryItemKey) errors.push(`${prefix} provenance parent inventory identity does not match candidate.`);
  if (segment.provenance.startJunctionKey !== candidate.startJunctionKey) errors.push(`${prefix} provenance start junction does not match candidate.`);
  if (segment.provenance.endJunctionKey !== candidate.endJunctionKey) errors.push(`${prefix} provenance end junction does not match candidate.`);
  if (segment.provenance.segmentConstructionAlgorithmVersion !== candidate.segmentConstructionAlgorithmVersion) errors.push(`${prefix} provenance segment-construction algorithm version does not match candidate.`);
  if (segment.sourceProvider !== candidate.sourceProvider) errors.push(`${prefix} source provider does not match candidate.`);
  if (!sameStringSet(segment.sourceFeatureIds, candidate.sourceFeatureIds)) errors.push(`${prefix} source feature IDs do not match candidate.`);
  if (!deepEqual(segment.coordinates, candidate.geometry.coordinates)) errors.push(`${prefix} geometry does not match candidate geometry.`);
  if (!approxEqual(segment.miles, candidate.calculatedMiles)) errors.push(`${prefix} mileage does not match candidate mileage.`);
  if (!deepEqual(segment.provenance.sourceSegmentArtifact, candidate.sourceSegmentArtifact)) errors.push(`${prefix} source SegmentConstruction artifact identity does not match candidate.`);
  validateSegmentCandidateBinding(`${prefix} embedded sourceSegmentCandidate`, candidate, segment.provenance.sourceSegmentCandidate, errors);
  if (!deepEqual(segment.provenance.acceptedReconciliationLineage, candidate.sourceSegmentCandidate.sourceReconciliation)) errors.push(`${prefix} accepted reconciliation lineage does not match candidate.`);
}

function validateSegmentCandidateBinding(prefix: string, candidate: PublicationCandidateSegment, source: SegmentCandidate, errors: string[]) {
  if (!source) {
    errors.push(`${prefix} is missing source segment candidate.`);
    return;
  }
  if (source.key !== candidate.candidateSegmentKey) errors.push(`${prefix} source segment candidate key does not match.`);
  if (source.parentInventoryItemKey !== candidate.parentInventoryItemKey) errors.push(`${prefix} source segment candidate parent inventory identity does not match.`);
  if (source.trailDisplayName !== candidate.trailDisplayName) errors.push(`${prefix} source segment candidate trail display name does not match.`);
  if (source.trailNormalizedName !== candidate.trailNormalizedName) errors.push(`${prefix} source segment candidate normalized name does not match.`);
  if (source.startJunctionKey !== candidate.startJunctionKey) errors.push(`${prefix} source segment candidate start junction does not match.`);
  if (source.endJunctionKey !== candidate.endJunctionKey) errors.push(`${prefix} source segment candidate end junction does not match.`);
  if (!deepEqual(source.geometry, candidate.geometry)) errors.push(`${prefix} source segment candidate geometry does not match.`);
  if (!approxEqual(source.calculatedMiles, candidate.calculatedMiles)) errors.push(`${prefix} source segment candidate miles do not match.`);
  if (!approxEqual(source.calculatedMeters, candidate.calculatedMeters, 0.001)) errors.push(`${prefix} source segment candidate meters do not match.`);
  if (!sameStringSet(source.sourceFeatureIds, candidate.sourceFeatureIds)) errors.push(`${prefix} source segment candidate source feature IDs do not match.`);
  if (source.sourceProvider !== candidate.sourceProvider) errors.push(`${prefix} source segment candidate source provider does not match.`);
  if (!deepEqual(source.sourceReconciliation, candidate.sourceSegmentCandidate.sourceReconciliation)) errors.push(`${prefix} source segment candidate reconciliation does not match.`);
  if (!deepEqual(source.geometryModification, candidate.sourceSegmentCandidate.geometryModification)) errors.push(`${prefix} source segment candidate geometry modification does not match.`);
}

function validateUpstreamDecisions(prefix: string, segment: VerifiedPublishedSegment, candidate: PublicationCandidateSegment | undefined, errors: string[]) {
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

function isTrailRegion(value: unknown) {
  return typeof value === "string" && (trailRegions as readonly string[]).includes(value);
}

function sameStringSet(left: string[], right: string[]) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function approxEqual(left: number, right: number, tolerance = 0.000001) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function deepEqual(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}






