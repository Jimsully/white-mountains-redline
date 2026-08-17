import fs from "node:fs";
import path from "node:path";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";
import type { ActivityMatchArtifact, SegmentConstructionDecisionExport } from "@/types/activity-matching";
import { loadActivitiesFromPath, summarizeActivities } from "@/lib/activity-matching/activities";
import { buildActivityMatchArtifact } from "@/lib/activity-matching/matcher";
import { getActivityMatchingOutputPath, formatActivityMatchingInputPathForArtifact, isDemoActivityMatchingInput } from "@/lib/activity-matching/paths";
import { resolveEligibleMatchingSegments } from "@/lib/activity-matching/segments";

export type ActivityMatchingRunResult = {
  artifact: ActivityMatchArtifact;
  outputPath: string;
  activitySummary: ReturnType<typeof summarizeActivities>;
};

export function runActivityMatching(args: { segmentArtifactPath: string; segmentDecisionsPath: string; activitiesPath: string; repositoryRoot?: string; generatedAt?: string }): ActivityMatchingRunResult {
  const repositoryRoot = args.repositoryRoot ?? process.cwd();
  const segmentArtifactPath = resolveFromRoot(args.segmentArtifactPath, repositoryRoot);
  const segmentDecisionsPath = resolveFromRoot(args.segmentDecisionsPath, repositoryRoot);
  const activitiesPath = resolveFromRoot(args.activitiesPath, repositoryRoot);
  const segmentArtifact = JSON.parse(fs.readFileSync(segmentArtifactPath, "utf8")) as SegmentConstructionArtifact;
  const segmentDecisions = JSON.parse(fs.readFileSync(segmentDecisionsPath, "utf8")) as SegmentConstructionDecisionExport;
  const segmentResolution = resolveEligibleMatchingSegments(segmentArtifact, segmentDecisions);
  if (segmentResolution.errors.length) throw new Error(`Accepted segment input failed integrity validation:\n${segmentResolution.errors.join("\n")}`);

  const activities = loadActivitiesFromPath(activitiesPath);
  const demoOnly = isDemoActivityMatchingInput(args.segmentArtifactPath, args.segmentDecisionsPath, args.activitiesPath, repositoryRoot);
  const artifact = buildActivityMatchArtifact({
    activities,
    eligibleSegments: segmentResolution.eligibleSegments,
    generatedAt: args.generatedAt ?? (demoOnly ? "2026-08-17T00:00:00.000Z" : undefined),
    demoOnly,
    segmentArtifactPath: formatActivityMatchingInputPathForArtifact(args.segmentArtifactPath, repositoryRoot, demoOnly),
    segmentDecisionsPath: formatActivityMatchingInputPathForArtifact(args.segmentDecisionsPath, repositoryRoot, demoOnly),
    activitiesPath: formatActivityMatchingInputPathForArtifact(args.activitiesPath, repositoryRoot, demoOnly),
    integrityWarnings: segmentResolution.warnings,
  });
  if (!demoOnly && Object.values(artifact.metadata).some((value) => typeof value === "string" && value.includes(path.sep))) throw new Error("Private source path leaked into activity matching metadata.");

  const outputPath = getActivityMatchingOutputPath(args.segmentArtifactPath, args.segmentDecisionsPath, args.activitiesPath, repositoryRoot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return { artifact, outputPath, activitySummary: summarizeActivities(activities) };
}

export function printActivityMatchingSummary(result: ActivityMatchingRunResult) {
  const { artifact, outputPath } = result;
  console.log(`activities loaded: ${artifact.diagnostics.activitiesLoaded}`);
  console.log(`eligible segments: ${artifact.diagnostics.eligibleSegmentCount}`);
  console.log(`activity/segment pairs considered: ${artifact.diagnostics.pairsConsidered}`);
  console.log(`bbox-rejected pairs: ${artifact.diagnostics.bboxRejectedPairs}`);
  console.log(`fully scored pairs: ${artifact.diagnostics.fullyScoredPairs}`);
  console.log(`strong candidates: ${artifact.diagnostics.strongCandidateCount}`);
  console.log(`candidates: ${artifact.diagnostics.candidateCount}`);
  console.log(`needs-review candidates: ${artifact.diagnostics.needsReviewCount}`);
  console.log(`insufficient matches: ${artifact.diagnostics.insufficientCoverageCount}`);
  console.log(`unmatched activities: ${artifact.diagnostics.unmatchedActivityCount}`);
  console.log(`activities with at least one candidate: ${artifact.diagnostics.activitiesWithCandidateCount}`);
  console.log(`segments with at least one candidate: ${artifact.diagnostics.segmentsWithCandidateCount}`);
  console.log(`integrity warnings: ${artifact.diagnostics.integrityWarnings.length}`);
  console.log(`integrity errors: ${artifact.diagnostics.integrityErrors.length}`);
  console.log(`output: ${path.relative(process.cwd(), outputPath)}`);
}

function resolveFromRoot(inputPath: string, repositoryRoot: string) {
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);
}