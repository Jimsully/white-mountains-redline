import crypto from "node:crypto";
import type { PublicationCandidateSegment, PublicationCandidateTrail } from "@/types/publication";
import { PRODUCTION_SEGMENT_KEY_VERSION, PRODUCTION_TRAIL_KEY_VERSION } from "@/types/publication";
import { sha256Fingerprint } from "@/lib/canonical-json";

export function stableHash(parts: unknown[], length = 16) {
  return crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, length);
}

export function stableUuid(parts: unknown[]) {
  const hex = stableHash(parts, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function stableArtifactFingerprint(value: unknown) {
  return sha256Fingerprint(value);
}

export function productionTrailKeyFor(trail: Pick<PublicationCandidateTrail, "parentInventoryItemKey" | "trailNormalizedName">) {
  return `trail_${stableHash([PRODUCTION_TRAIL_KEY_VERSION, trail.parentInventoryItemKey, trail.trailNormalizedName])}`;
}

export function productionSegmentKeyFor(trailProductionKey: string, segment: Pick<PublicationCandidateSegment, "candidateSegmentKey" | "startJunctionKey" | "endJunctionKey" | "geometry">) {
  return `segment_${stableHash([PRODUCTION_SEGMENT_KEY_VERSION, trailProductionKey, segment.candidateSegmentKey, segment.startJunctionKey, segment.endJunctionKey, segment.geometry.coordinates])}`;
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trail";
}
