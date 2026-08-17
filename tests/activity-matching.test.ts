import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ActivityRecord, EligibleMatchingSegment, SegmentConstructionDecisionExport } from "@/types/activity-matching";
import type { SegmentConstructionArtifact, SegmentCandidate } from "@/types/segment-construction";
import { ACTIVITY_MATCHING_ALGORITHM_VERSION } from "@/types/activity-matching";
import { SEGMENT_CONSTRUCTION_ALGORITHM_VERSION } from "@/types/segment-construction";
import { parseGpxActivity, parseNormalizedActivities } from "@/lib/activity-matching/activities";
import { DEFAULT_ACTIVITY_MATCHING_CONFIG } from "@/lib/activity-matching/config";
import { expandedBboxIntersects, sampleLine } from "@/lib/activity-matching/geometry";
import { sanitizePrivateActivityMetadata } from "@/lib/activity-matching/private-metadata";
import { PRIVATE_PATH_OMITTED } from "@/lib/activity-matching/paths";
import { buildTrustedActivityTraceEvidence } from "@/lib/activity-matching/trusted-trace";
import { buildActivityMatchArtifact, stableMatchKey } from "@/lib/activity-matching/matcher";
import { isDemoActivityMatchingInput } from "@/lib/activity-matching/paths";
import { PRIVATE_ACTIVITY_MATCHING_ARTIFACT_PRODUCTION_ERROR, loadActivityMatchArtifact } from "@/lib/activity-matching/server-artifact";
import { buildActivityMatchDecision, buildActivityMatchDecisionExport, parseStoredActivityMatchDecisions } from "@/lib/activity-matching/review-state";
import { resolveEligibleMatchingSegments } from "@/lib/activity-matching/segments";
import { runActivityMatching } from "@/lib/activity-matching/run-activity-matching";

const config = { ...DEFAULT_ACTIVITY_MATCHING_CONFIG, coverageSampleIntervalMeters: 25 };
const lineA = [[-71, 44], [-70.995, 44], [-70.99, 44]];
const lineB = [[-70.99, 44], [-70.985, 44], [-70.98, 44]];
const curvedLine = [[-71, 44], [-70.996, 44.004], [-70.992, 44], [-70.988, 44.004], [-70.984, 44]];

function denseLine(coordinates: number[][], stepsPerEdge = 8) {
  const points: number[][] = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    if (!points.length) points.push(start);
    for (let step = 1; step <= stepsPerEdge; step += 1) points.push([start[0] + (end[0] - start[0]) * (step / stepsPerEdge), start[1] + (end[1] - start[1]) * (step / stepsPerEdge)]);
  }
  return points;
}

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
    approvalEvidence: {
      segmentDecision: { targetType: "segment", targetKey: segment.key, decision: "accepted", reviewTimestamp: "2026-01-01T00:00:00.000Z" },
      startJunctionDecision: { targetType: "junction", targetKey: segment.startJunctionKey, decision: "accepted", reviewTimestamp: "2026-01-01T00:00:00.000Z" },
      endJunctionDecision: { targetType: "junction", targetKey: segment.endJunctionKey, decision: "accepted", reviewTimestamp: "2026-01-01T00:00:00.000Z" },
      decisionArtifactAlgorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION,
      sourceSegmentArtifact: { generatedAt: "2026-01-01T00:00:00.000Z", demoOnly: true, algorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION },
    },
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

  it("counts malformed GPX coordinates and unusable one-point segments deterministically", () => {
    const parsed = parseGpxActivity(`<gpx><trk><trkseg><trkpt lon="bad" lat="44"/><trkpt lon="-71" lat="44"/><trkpt lon="-70.99" lat="44"/></trkseg><trkseg><trkpt lon="-70.98" lat="44"/></trkseg></trk></gpx>`);
    expect(parsed.originalPointCount).toBe(4);
    expect(parsed.malformedPointCount).toBe(2);
    expect(parsed.normalizedPointCount).toBe(2);
  });

  it("parses normalized JSON and validates coordinate ranges", () => {
    const parsed = parseNormalizedActivities(JSON.stringify({ source: "demo", sourceActivityId: "abc", geometry: { type: "LineString", coordinates: [[-71, 44], [200, 44], [-70.99, 44]] } }))[0];
    expect(parsed.malformedPointCount).toBe(1);
    expect(parsed.normalizedPointCount).toBe(2);
    expect(() => parseNormalizedActivities(JSON.stringify({ geometry: { type: "LineString", coordinates: [[200, 44], [201, 44]] } }))).toThrow("Activity contains no usable track component with at least two valid points.");
  });

  it("stabilizes activity identity around source IDs and orientation-stable geometry", () => {
    const withIdA = parseNormalizedActivities(JSON.stringify({ source: "demo", sourceActivityId: "same", title: "first", geometry: { type: "LineString", coordinates: lineA } }))[0];
    const withIdB = parseNormalizedActivities(JSON.stringify({ source: "demo", sourceActivityId: "same", title: "second", geometry: { type: "MultiLineString", coordinates: [lineA] } }))[0];
    expect(withIdA.activityKey).toBe(withIdB.activityKey);
    const withoutIdA = parseNormalizedActivities(JSON.stringify({ source: "demo", startTime: "2026-01-01T00:00:00Z", title: "first", geometry: { type: "LineString", coordinates: lineA } }))[0];
    const withoutIdB = parseNormalizedActivities(JSON.stringify({ source: "demo", startTime: "2026-01-01T00:00:00Z", title: "second", geometry: { type: "LineString", coordinates: [...lineA].reverse() } }))[0];
    expect(withoutIdA.activityKey).toBe(withoutIdB.activityKey);
    const differentId = parseNormalizedActivities(JSON.stringify({ source: "demo", sourceActivityId: "different", geometry: { type: "LineString", coordinates: lineA } }))[0];
    expect(differentId.activityKey).not.toBe(withIdA.activityKey);
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
    const denseA = denseLine(lineA);
    expect(matchClass(activity("exact", denseA), first)).toBe("strong_candidate");
    expect(matchClass(activity("reverse", [...denseA].reverse()), first)).toBe("strong_candidate");
    expect(matchClass(activity("jitter", denseA.map(([x, y], index) => [x, y + (index % 2 ? 0.00004 : -0.00004)])), first)).toBe("strong_candidate");
    const adjacent = buildActivityMatchArtifact({ activities: [activity("adjacent", denseLine([...lineA, ...lineB.slice(1)]))], eligibleSegments: [first, second], demoOnly: true, config });
    expect(adjacent.matchCandidates.filter((match) => match.classification === "strong_candidate")).toHaveLength(2);
    expect(matchClass(activity("out-back", [denseA, [...denseA].reverse()], "MultiLineString"), first)).toBe("strong_candidate");
  });

  it("keeps partial, crossing, endpoint-missing, track-gap, and sparse cases conservative", () => {
    const segment = eligible("s1", lineA);
    expect(matchClass(activity("partial", [[-71, 44], [-70.995, 44]]), segment)).not.toBe("strong_candidate");
    expect(matchClass(activity("cross", [[-70.995, 43.995], [-70.995, 44.005]]), segment)).toBe("insufficient_coverage");
    expect(matchClass(activity("endpoint", [[-70.998, 44], [-70.99, 44]]), segment)).not.toBe("strong_candidate");
    expect(matchClass(activity("gap", [[[-71, 44], [-70.998, 44]], [[-70.992, 44], [-70.99, 44]]], "MultiLineString"), segment)).not.toBe("strong_candidate");
    expect(matchClass(activity("sparse", [[-71, 44], [-70.984, 44]]), eligible("curved", curvedLine))).not.toBe("strong_candidate");
  });

  it("keeps latitude-aware bbox expansion conservative", () => {
    const segmentBbox: [number, number, number, number] = [-71, 44, -71, 44.001];
    const thirtyMetersEastAt44 = 30 / (111_320 * Math.cos(44 * Math.PI / 180));
    expect(expandedBboxIntersects(segmentBbox, [-71 + thirtyMetersEastAt44, 44, -71 + thirtyMetersEastAt44, 44.001], 35)).toBe(true);
    expect(expandedBboxIntersects(segmentBbox, [-71 + thirtyMetersEastAt44 * 4, 44, -71 + thirtyMetersEastAt44 * 4, 44.001], 35)).toBe(false);
    const thirtyMetersNorth = 30 / 111_320;
    expect(expandedBboxIntersects(segmentBbox, [-71, 44.001 + thirtyMetersNorth, -71, 44.001 + thirtyMetersNorth], 35)).toBe(true);
    expect(expandedBboxIntersects(segmentBbox, [-71, 44.001 + thirtyMetersNorth * 4, -71, 44.001 + thirtyMetersNorth * 4], 35)).toBe(false);
  });

  it("treats nearby parallel routes as reviewable and rejects far pairs by bbox", () => {
    const segment = eligible("s1", lineA);
    expect(matchClass(activity("parallel", denseLine(lineA).map(([x, y]) => [x, y + 0.00022])), segment)).toBe("needs_review");
    const far = buildActivityMatchArtifact({ activities: [activity("far", [[-72, 45], [-72.01, 45]])], eligibleSegments: [segment], demoOnly: true, config });
    expect(far.diagnostics.bboxRejectedPairs).toBe(1);
    expect(far.matchCandidates).toHaveLength(0);
  });

  it("does not invent strong coverage across sparse GPS edges", () => {
    const segment = eligible("sparse-straight", [[-71, 44], [-70.9875, 44]]);
    const sparseForward = matchClass(activity("sparse-forward", [[-71, 44], [-70.9875, 44]]), segment);
    const sparseReverse = matchClass(activity("sparse-reverse", [[-70.9875, 44], [-71, 44]]), segment);
    expect(sparseForward).not.toBe("strong_candidate");
    expect(sparseReverse).toBe(sparseForward);
    expect(matchClass(activity("dense-forward", denseLine([[-71, 44], [-70.9875, 44]], 16)), segment)).toBe("strong_candidate");
  });

  it("requires the same component to carry coverage, endpoints, and proximity for strong traversal", () => {
    const segment = eligible("same-component", [[-71, 44], [-70.9875, 44]]);
    const dense = denseLine([[-71, 44], [-70.9875, 44]], 20);
    const componentA = dense.filter((_, index) => index < Math.floor(dense.length * 0.95));
    const componentB = [[-71, 44], [-70.9875, 44]];
    const artifact = buildActivityMatchArtifact({ activities: [activity("split-proof", [componentA, componentB], "MultiLineString")], eligibleSegments: [segment], demoOnly: true, config: { ...config, strongMaximumP95DistanceMeters: 30 } });
    const match = artifact.matchCandidates[0];
    expect(match.classification).not.toBe("strong_candidate");
    expect(match.evidence.bestStrongComponentIndex).toBeUndefined();
    expect(match.evidence.blockedStrongByComponentDiscontinuity).toBe(true);
  });

  it("does not let proximity from one component repair an offset coverage component", () => {
    const segment = eligible("component-proximity", [[-71, 44], [-70.9875, 44]]);
    const offsetFull = denseLine([[-71, 44.00018], [-70.9875, 44.00018]], 20);
    const endpointOnly = [[-71, 44], [-70.9875, 44]];
    const artifact = buildActivityMatchArtifact({ activities: [activity("offset-plus-endpoints", [offsetFull, endpointOnly], "MultiLineString")], eligibleSegments: [segment], demoOnly: true, config });
    expect(artifact.matchCandidates[0].classification).not.toBe("strong_candidate");
    expect(artifact.matchCandidates[0].evidence.bestStrongComponentIndex).toBeUndefined();
  });

  it("allows a self-contained qualifying component to remain strong in reverse", () => {
    const segment = eligible("self-contained", [[-71, 44], [-70.9875, 44]]);
    const dense = denseLine([[-71, 44], [-70.9875, 44]], 20);
    expect(matchClass(activity("self-contained-reverse", [[...dense].reverse(), [[-71.01, 44], [-71.011, 44]]], "MultiLineString"), segment)).toBe("strong_candidate");
  });

  it("requires one component to carry strong traversal continuity", () => {
    const segment = eligible("component", [[-71, 44], [-70.9875, 44]]);
    const discontinuous = buildActivityMatchArtifact({ activities: [activity("component-gap", [[[-71, 44], [-70.994, 44]], [[-70.9935, 44], [-70.9875, 44]]], "MultiLineString")], eligibleSegments: [segment], demoOnly: true, config: { ...config, maximumInterpolatedActivityEdgeMeters: 1000 } });
    expect(discontinuous.matchCandidates[0].classification).not.toBe("strong_candidate");
    expect(discontinuous.matchCandidates[0].evidence.blockedStrongByComponentDiscontinuity).toBe(true);
  });

  it("does not classify a nearby parallel canonical segment as strong", () => {
    const followed = eligible("followed", denseLine(lineA));
    const nearbyParallel = eligible("parallel-segment", denseLine(lineA).map(([x, y]) => [x, y + 0.00022]));
    const artifact = buildActivityMatchArtifact({ activities: [activity("parallel-canonical", denseLine(lineA))], eligibleSegments: [followed, nearbyParallel], demoOnly: true, config });
    expect(artifact.matchCandidates.find((match) => match.segmentKey === "followed")?.classification).toBe("strong_candidate");
    expect(artifact.matchCandidates.find((match) => match.segmentKey === "parallel-segment")?.classification).not.toBe("strong_candidate");
  });

  it("splits trusted render lines at ignored activity edges", () => {
    const evidence = buildTrustedActivityTraceEvidence({ type: "MultiLineString", coordinates: [[[-71, 44], [-70.999, 44], [-70.99, 44], [-70.989, 44]]] }, 120);
    expect(evidence.allLines).toHaveLength(2);
    expect(evidence.ignoredGaps).toHaveLength(1);
  });

  it("creates stable match keys and deterministic classifications", () => {
    const sourceActivity = activity("stable", lineA);
    const segment = eligible("s1", lineA);
    const match = buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [segment], demoOnly: true, config }).matchCandidates[0];
    expect(match.key).toBe(stableMatchKey(sourceActivity.activityKey, segment.segmentKey));
    expect(match.evidence.activityMatchingAlgorithmVersion).toBe(ACTIVITY_MATCHING_ALGORITHM_VERSION);
    expect(() => buildActivityMatchArtifact({ activities: [sourceActivity, sourceActivity], eligibleSegments: [segment], demoOnly: true, config })).toThrow("Duplicate activity key");
    expect(() => buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [segment, segment], demoOnly: true, config })).toThrow("Duplicate eligible segment key");
    const missingIdentitySegment = { ...segment, approvalEvidence: { ...segment.approvalEvidence, sourceSegmentArtifact: { algorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION } } };
    expect(() => buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [missingIdentitySegment], demoOnly: true, config })).toThrow("approval source artifact identity is incomplete");
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

  it("redacts private filesystem paths from source metadata", () => {
    const sourceActivity = activity("private-metadata", lineA);
    sourceActivity.sourceMetadata = { safe: "kept", originalPath: "C:\\Users\\James\\secret.gpx", nested: { exportFile: "/Users/james/private/export.json", label: "okay" } };
    const sanitized = sanitizePrivateActivityMetadata(sourceActivity);
    expect(sanitized.sourceMetadata.safe).toBe("kept");
    expect(sanitized.sourceMetadata.originalPath).toBe(PRIVATE_PATH_OMITTED);
    expect((sanitized.sourceMetadata.nested as Record<string, unknown>).exportFile).toBe(PRIVATE_PATH_OMITTED);
    expect((sanitized.sourceMetadata.nested as Record<string, unknown>).label).toBe("okay");
  });

  it("redacts private filesystem paths from loaded private artifacts", () => {
    const sourceActivity = activity("loaded-private-metadata", lineA);
    sourceActivity.sourceMetadata = { originalPath: "C:\\Users\\James\\secret.gpx", nested: { exportFile: "/Users/james/private/export.json" } };
    const artifact = buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [eligible("loaded-private", lineA)], demoOnly: false, config });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "activity-artifact-load-"));
    const artifactPath = path.join(tempDir, "artifact.json");
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const loaded = loadActivityMatchArtifact({} as never, { NODE_ENV: "development", ACTIVITY_MATCHING_ARTIFACT_PATH: artifactPath } as NodeJS.ProcessEnv);
    expect(loaded.activities[0].sourceMetadata.originalPath).toBe(PRIVATE_PATH_OMITTED);
    expect((loaded.activities[0].sourceMetadata.nested as Record<string, unknown>).exportFile).toBe(PRIVATE_PATH_OMITTED);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("ignores malformed localStorage and exports evidence decisions", () => {
    expect(parseStoredActivityMatchDecisions("not-json")).toEqual({});
    const artifact = buildActivityMatchArtifact({ activities: [activity("decision", lineA)], eligibleSegments: [eligible("s1", lineA)], demoOnly: true, config });
    const decision = buildActivityMatchDecision(artifact, artifact.matchCandidates[0].key, "accepted", " evidence ", "2026-01-01T00:00:00.000Z");
    expect(decision.notes).toBe("evidence");
    expect(buildActivityMatchDecisionExport(artifact, [decision]).decisions).toHaveLength(1);
  });
});

describe("activity matching runner", () => {
  it("writes private outputs only inside a temp root with omitted metadata", () => {
    const repositoryRoot = process.cwd();
    const trackedArtifactPath = path.join(repositoryRoot, "data", "generated", "activity-matching", "demo-activity-matching.json");
    const before = fs.readFileSync(trackedArtifactPath, "utf8");
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "activity-matching-runner-"));
    fs.mkdirSync(path.join(tempRoot, "private", "activities"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "data", "generated", "activity-matching"), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, "data", "generated", "segments", "demo-segment-construction.json"), path.join(tempRoot, "private", "segments.json"));
    fs.copyFileSync(path.join(repositoryRoot, "data", "demo", "segment-construction-decisions.demo.json"), path.join(tempRoot, "private", "decisions.json"));
    fs.copyFileSync(path.join(repositoryRoot, "data", "demo", "activities", "synthetic-activity-fixtures.demo.json"), path.join(tempRoot, "private", "activities", "fixture.json"));
    const result = runActivityMatching({ segmentArtifactPath: "private/segments.json", segmentDecisionsPath: "private/decisions.json", activitiesPath: "private/activities", repositoryRoot: tempRoot, generatedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.outputPath.startsWith(path.join(tempRoot, "data", "generated", "activity-matching"))).toBe(true);
    expect(result.artifact.metadata.segmentArtifactPath).toBe("private path omitted");
    expect(result.artifact.metadata.segmentDecisionsPath).toBe("private path omitted");
    expect(result.artifact.metadata.activitiesPath).toBe("private path omitted");
    expect(fs.readFileSync(trackedArtifactPath, "utf8")).toBe(before);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("does not multiply artifact ignored-edge diagnostics by scored segment count", () => {
    const sourceActivity = activity("one-gap-many-segments", [[[-71, 44], [-70.999, 44], [-70.99, 44], [-70.989, 44]]], "MultiLineString");
    const first = eligible("diag-a", [[-71, 44], [-70.989, 44]]);
    const second = eligible("diag-b", [[-71, 44.00001], [-70.989, 44.00001]]);
    const result = buildActivityMatchArtifact({ activities: [sourceActivity], eligibleSegments: [first, second], demoOnly: true, config });
    expect(result.matchCandidates).toHaveLength(2);
    expect(result.matchCandidates.reduce((sum, match) => sum + match.evidence.ignoredLongActivityEdgeCount, 0)).toBe(2);
    expect(result.diagnostics.ignoredActivityEdgeCount).toBe(1);
  });
});
