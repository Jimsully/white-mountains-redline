import path from "node:path";

export function isDemoActivityMatchingInput(segmentArtifactPath: string, segmentDecisionsPath: string, activitiesPath: string, repositoryRoot = process.cwd()) {
  const resolvedSegments = resolveFromRoot(segmentArtifactPath, repositoryRoot);
  const resolvedDecisions = resolveFromRoot(segmentDecisionsPath, repositoryRoot);
  const resolvedActivities = resolveFromRoot(activitiesPath, repositoryRoot);
  return resolvedSegments === path.resolve(repositoryRoot, "data", "generated", "segments", "demo-segment-construction.json")
    && resolvedDecisions === path.resolve(repositoryRoot, "data", "demo", "segment-construction-decisions.demo.json")
    && isInsidePath(resolvedActivities, path.resolve(repositoryRoot, "data", "demo", "activities"));
}

export function getActivityMatchingOutputPath(segmentArtifactPath: string, segmentDecisionsPath: string, activitiesPath: string, repositoryRoot = process.cwd(), timestamp = Date.now()) {
  const outputDir = path.resolve(repositoryRoot, "data", "generated", "activity-matching");
  if (isDemoActivityMatchingInput(segmentArtifactPath, segmentDecisionsPath, activitiesPath, repositoryRoot)) return path.join(outputDir, "demo-activity-matching.json");
  return path.join(outputDir, `activity-matching.local.${timestamp}.json`);
}

export function formatActivityMatchingInputPathForArtifact(inputPath: string, repositoryRoot = process.cwd(), demoSafe = false) {
  return demoSafe ? path.relative(repositoryRoot, resolveFromRoot(inputPath, repositoryRoot)) : "local/private path omitted";
}

export function isInsidePath(candidatePath: string, parentPath: string) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveFromRoot(inputPath: string, repositoryRoot: string) {
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);
}