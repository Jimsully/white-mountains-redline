import { describe, expect, it } from "vitest";
import path from "node:path";
import type { ActivityRecord, EligibleMatchingSegment, SegmentConstructionDecisionExport } from "@/types/activity-matching";
import type { SegmentConstructionArtifact, SegmentCandidate } from "@/types/segment-construction";
import { ACTIVITY_MATCHING_ALGORITHM_VERSION } from "@/types/activity-matching";
import { SEGMENT_CONSTRUCTION_ALGORITHM_VERSION } from "@/types/segment-construction";
import { parseGpxActivity, parseNormalizedActivities } from "@/lib/activity-matching/activities";
import { DEFAULT_ACTIVITY_MATCHING_CONFIG } from "@/lib/activity-matching/config";
import { sampleLine } from "@/lib/activity-matching/geometry";
import { buildActivityMatchArtifact, stableMatchKey } from "@/lib/activity-matching/matcher";
import { isDemoActivityMatchingInput } from "@/lib/activity-matching/paths";
import { PRIVATE_ACTIVITY_MATCHING_ARTIFACT_PRODUCTION_ERROR, loadActivityMatchArtifact } from "@/lib/activity-matching/server-artifact";
import { buildActivityMatchDecision, buildActivityMatchDecisionExport, parseStoredActivityMatchDecisions } from "@/lib/activity-matching/review-state";
import { resolveEligibleMatchingSegments } from "@/lib/activity-matching/segments";

const config = { ...DEFAULT_ACTIVITY_MATCHING_CONFIG, coverageSampleIntervalMeters: 25 };
const lineA = [[-71, 44], [-70.995, 44], [-70.99, 44]];
const lineB = [[-70.99, 44], [-70.985, 44], [-70.98, 44]];
const curvedLine = [[-71, 44], [-70.996, 44.004], [-70.992, 44], [-70.988, 44.004], [-70.984, 44]];

function activity(id: string, coordinates: number[][] | number[][][], type: "LineString" | "MultiLineString" = "LineString"): ActivityRecord {
  const geometry = type === "LineString" ? { type, coordinates } : { type, coordinates };
  return parseNormalizedActivities(JSON.stringify({ source: "demo", sourceActivityId: id, title: id, startTime: "2026-01-01T00:00:00Z", geometry }))[0];
}

function eligible(segmentKey: string, coordinates: number[][]): EligibleMatchingSegment {
  const segment = segmentCandidate(segmentKey, coordinates);
  return {
    segmentKey,
    parentInventoryItemKey: "inventory-a",
    trailDisplayName: segment.trailDisplayName,
    trailNormalizedName: segment.trailNormalizedName,
    startJunctionKey: segment.startJunctionKey,
    endJunctionKey: segment.endJunctionKey,
    geometry: segment.geometry,
    calculatedMeters: segment.calculatedMeters,
    sourceFeatureIds: segment.sourceFeatureIds,
    sourceProvider: segment.sourceProvider,
    segmentConstructionAlgorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION,
    sourceSegmentCandidate: segment,
  };
}

function segmentCandidate(key: string, coordinates: number[][]): SegmentCandidate {
  return {
    key,
    parentInventoryItemKey: "inventory-a",
    trailDisplayName: "Demo Trail",
    trailNormalizedName: "DEMO TRAIL",
    startJunctionKey: `${key}-start`,
    endJunctionKey: `${key}-end`,
    geometry: { type: "LineString", coordinates },
    calculatedMiles: 0.7,
    calculatedMeters: 1113,
    sourceFeatureIds: [key],
    sourceProvider: "demo",
    sourceReconciliation: { evidenceFeatureIds: [key] },
    geometryModification: { splitFromAcceptedSource: true, snappedToJunction: false, componentIndex: 0, sourceComponentKey: key, sourceFeatureProvenancePrecision: "exact", startMeasureMeters: 0, endMeasureMeters: 1113 },
    reviewStatus: "proposed",
    warningFlags: [],
  };
}

function artifactForSegments(segments: SegmentCandidate[]): SegmentConstructionArtifact {
  const junctionKeys = new Set(segments.flatMap((segment) => [segment.startJunctionKey, segment.endJunctionKey]));
  return {
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z", demoOnly: true, algorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, warning: "demo" },
    tolerances: { endpointSnapToleranceMeters: 1, intersectionToleranceMeters: 1, junctionDeduplicationToleranceMeters: 1, sameTrailAutoConnectToleranceMeters: 1, geometryLengthEpsilonMeters: 1, minimumSegmentLengthMeters: 1 },
    acceptedTrailSources: [],
    junctionCandidates: [...junctionKeys].map((key) => ({ key, coordinate: [-71, 44], reasons: ["manual"], reviewStatus: "proposed", participatingTrailNormalizedNames: ["DEMO TRAIL"], participatingInventoryItemKeys: ["inventory-a"], sourceFeatureIds: [key], rawDetectedPoints: [[-71, 44]], maximumClusterSpreadMeters: 0, evidence: [] })),
    segmentCandidates: segments,
    diagnostics: { acceptedTrailSourceCount: 1, junctionCandidateCount: junctionKeys.size, exactIntersectionCount: 0, nearIntersectionWarningCount: 0, sameTrailNearConnectionWarningCount: 0, segmentCandidateCount: segments.length, shortSegmentWarningCount: 0, disconnectedComponentCount: 0, coarseSourceComponentBoundaryCount: 0, excessiveSpreadJunctionCount: 0, sameTrailSourceBoundarySnapCount: 0, sameTrailSourceBoundarySnapMeters: 0, maxSameTrailSourceBoundarySnapMeters: 0, inputGeometryMeters: 0, outputGeometryMeters: 0, lengthDeltaMeters: 0, inputGeometryMiles: 0, outputSegmentMiles: 0, lengthDeltaMiles: 0, warnings: [], integrityWarnings: [], integrityErrors: [] },
  };
}

function decisionsFor(artifact: SegmentConstructionArtifact): SegmentConstructionDecisionExport {
  return {
    algorithmVersion: artifact.metadata.algorithmVersion,
    sourceArtifact: { generatedAt: artifact.metadata.generatedAt, demoOnly: artifact.metadata.demoOnly, algorithmVersion: artifact.metadata.algorithmVersion },
    decisions: [
      ...artifact.junctionCandidates.map((junction) => ({ targetType: "junction" as const, targetKey: junction.key, decision: "accepted" as const, reviewTimestamp: "2026-01-01T00:00:00.000Z" })),
      ...artifact.segmentCandidates.map((segment) => ({ targetType: "segment" as const, targetKey: segment.key, decision: "accepted" as const, reviewTimestamp: "2026-01-01T00:00:00.000Z" })),
    ],
  };
}

function matchClass(sourceActivity: ActivityRecord, segment: EligibleMatchingSegment) {
  return buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [segment], demoOnly: true, config }).matchCandidates[0]?.classification;
}

describe("activity import and normalization", () => {
  it("parses GPX track segments without connecting gaps and preserves point metadata", () => {
    const parsed = parseGpxActivity(`<gpx><trk><name>Gap Test</name><trkseg><trkpt lon="-71" lat="44"><ele>10</ele><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lon="-70.99" lat="44"><ele>11</ele><time>2026-01-01T00:10:00Z</time></trkpt></trkseg><trkseg><trkpt lon="-70.98" lat="44"><time>2026-01-01T01:00:00Z</time></trkpt><trkpt lon="-70.97" lat="44"><time>2026-01-01T01:10:00Z</time></trkpt></trkseg></trk></gpx>`, "sample activity.gpx");
    expect(parsed.title).toBe("Gap Test");
    expect(parsed.trace.geometry.coordinates).toHaveLength(2);
    expect(parsed.trace.componentPointCounts).toEqual([2, 2]);
    expect(parsed.originalFilename).toBe("sample_activity.gpx");
    expect(parsed.trace.pointTimes?.[0][0]).toBe("2026-01-01T00:00:00Z");
  });

  it("counts malformed GPX coordinates deterministically", () => {
    const parsed = parseGpxActivity(`<gpx><trk><trkseg><trkpt lon="bad" lat="44"/><trkpt lon="-71" lat="44"/><trkpt lon="-70.99" lat="44"/></trkseg></trk></gpx>`);
    expect(parsed.originalPointCount).toBe(3);
    expect(parsed.malformedPointCount).toBe(1);
    expect(parsed.normalizedPointCount).toBe(2);
  });

  it("parses normalized JSON and creates stable activity keys", () => {
    const raw = JSON.stringify({ source: "demo", sourceActivityId: "abc", geometry: { type: "LineString", coordinates: lineA } });
    expect(parseNormalizedActivities(raw)[0].activityKey).toBe(parseNormalizedActivities(raw)[0].activityKey);
  });
});

describe("approved segment resolver", () => {
  it("requires explicit accepted segment and endpoint decisions", () => {
    const artifact = artifactForSegments([segmentCandidate("s1", lineA)]);
    const resolution = resolveEligibleMatchingSegments(artifact, decisionsFor(artifact));
    expect(resolution.errors).toEqual([]);
    expect(resolution.eligibleSegments).toHaveLength(1);
  });

  it("fails stale decision exports", () => {
    const artifact = artifactForSegments([segmentCandidate("s1", lineA)]);
    const decisions = decisionsFor(artifact);
    decisions.sourceArtifact = { ...decisions.sourceArtifact, generatedAt: "stale" };
    expect(resolveEligibleMatchingSegments(artifact, decisions).errors).toContain("Segment decision export was produced from a different segment-construction artifact timestamp.");
  });
});

describe("activity matching classifier", () => {
  it("samples endpoints deterministically", () => {
    const samples = sampleLine(lineA, 10000);
    expect(samples[0]).toEqual(lineA[0]);
    expect(samples[samples.length - 1]).toEqual(lineA[lineA.length - 1]);
  });

  it("classifies exact, reverse, jitter, adjacent, and out-and-back traversals as strong", () => {
    const first = eligible("s1", lineA);
    const second = eligible("s2", lineB);
    expect(matchClass(activity("exact", lineA), first)).toBe("strong_candidate");
    expect(matchClass(activity("reverse", [...lineA].reverse()), first)).toBe("strong_candidate");
    expect(matchClass(activity("jitter", lineA.map(([x, y], index) => [x, y + (index % 2 ? 0.00004 : -0.00004)])), first)).toBe("strong_candidate");
    const adjacent = buildActivityMatchArtifact({ activities: [activity("adjacent", [...lineA, ...lineB.slice(1)])], eligibleSegments: [first, second], demoOnly: true, config });
    expect(adjacent.matchCandidates.filter((match) => match.classification === "strong_candidate")).toHaveLength(2);
    expect(matchClass(activity("out-back", [lineA, [...lineA].reverse()], "MultiLineString"), first)).toBe("strong_candidate");
  });

  it("keeps partial, crossing, endpoint-missing, track-gap, and sparse cases conservative", () => {
    const segment = eligible("s1", lineA);
    expect(matchClass(activity("partial", [[-71, 44], [-70.995, 44]]), segment)).not.toBe("strong_candidate");
    expect(matchClass(activity("cross", [[-70.995, 43.995], [-70.995, 44.005]]), segment)).toBe("insufficient_coverage");
    expect(matchClass(activity("endpoint", [[-70.998, 44], [-70.99, 44]]), segment)).not.toBe("strong_candidate");
    expect(matchClass(activity("gap", [[[-71, 44], [-70.998, 44]], [[-70.992, 44], [-70.99, 44]]], "MultiLineString"), segment)).not.toBe("strong_candidate");
    expect(matchClass(activity("sparse", [[-71, 44], [-70.984, 44]]), eligible("curved", curvedLine))).not.toBe("strong_candidate");
  });

  it("treats nearby parallel routes as reviewable and rejects far pairs by bbox", () => {
    const segment = eligible("s1", lineA);
    expect(matchClass(activity("parallel", lineA.map(([x, y]) => [x, y + 0.00022])), segment)).toBe("needs_review");
    const far = buildActivityMatchArtifact({ activities: [activity("far", [[-72, 45], [-72.01, 45]])], eligibleSegments: [segment], demoOnly: true, config });
    expect(far.diagnostics.bboxRejectedPairs).toBe(1);
    expect(far.matchCandidates).toHaveLength(0);
  });

  it("creates stable match keys and deterministic classifications", () => {
    const sourceActivity = activity("stable", lineA);
    const segment = eligible("s1", lineA);
    const match = buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [segment], demoOnly: true, config }).matchCandidates[0];
    expect(match.key).toBe(stableMatchKey(sourceActivity.activityKey, segment.segmentKey));
    expect(match.evidence.activityMatchingAlgorithmVersion).toBe(ACTIVITY_MATCHING_ALGORITHM_VERSION);
  });
});

describe("activity matching privacy and review state", () => {
  it("classifies only the committed demo lane as demo-safe", () => {
    const root = path.resolve("/repo");
    expect(isDemoActivityMatchingInput("data/generated/segments/demo-segment-construction.json", "data/demo/segment-construction-decisions.demo.json", "data/demo/activities", root)).toBe(true);
    expect(isDemoActivityMatchingInput("data/generated/segments/demo-segment-construction.json", "data/demo/segment-construction-decisions.demo.json", "data/demo-private/activities", root)).toBe(false);
  });

  it("blocks private activity artifacts in production", () => {
    expect(() => loadActivityMatchArtifact({} as never, { NODE_ENV: "production", ACTIVITY_MATCHING_ARTIFACT_PATH: "local.json" } as NodeJS.ProcessEnv)).toThrow(PRIVATE_ACTIVITY_MATCHING_ARTIFACT_PRODUCTION_ERROR);
  });

  it("ignores malformed localStorage and exports evidence decisions", () => {
    expect(parseStoredActivityMatchDecisions("not-json")).toEqual({});
    const artifact = buildActivityMatchArtifact({ activities: [activity("decision", lineA)], eligibleSegments: [eligible("s1", lineA)], demoOnly: true, config });
    const decision = buildActivityMatchDecision(artifact, artifact.matchCandidates[0].key, "accepted", " evidence ", "2026-01-01T00:00:00.000Z");
    expect(decision.notes).toBe("evidence");
    expect(buildActivityMatchDecisionExport(artifact, [decision]).decisions).toHaveLength(1);
  });
});