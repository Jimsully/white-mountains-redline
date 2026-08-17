import fs from "node:fs";
import path from "node:path";
import type { ActivityMatchArtifact } from "@/types/activity-matching";
import { sanitizePrivateActivityMatchArtifact } from "@/lib/activity-matching/private-metadata";

export const PRIVATE_ACTIVITY_MATCHING_ARTIFACT_PRODUCTION_ERROR = "Private activity matching artifacts are local-development only until authenticated admin access is implemented.";

export function loadActivityMatchArtifact(demoArtifact: ActivityMatchArtifact, env: NodeJS.ProcessEnv = process.env): ActivityMatchArtifact {
  const artifactPath = env.ACTIVITY_MATCHING_ARTIFACT_PATH;
  if (artifactPath && env.NODE_ENV === "production") throw new Error(PRIVATE_ACTIVITY_MATCHING_ARTIFACT_PRODUCTION_ERROR);
  const artifact = artifactPath ? JSON.parse(fs.readFileSync(path.resolve(artifactPath), "utf8")) as unknown : demoArtifact;
  if (!isActivityMatchArtifactShape(artifact)) throw new Error("ACTIVITY_MATCHING_ARTIFACT_PATH does not contain an activity matching artifact.");
  return sanitizeArtifactPaths(artifact);
}

export function isActivityMatchArtifactShape(value: unknown): value is ActivityMatchArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActivityMatchArtifact>;
  return Boolean(candidate.metadata)
    && typeof candidate.metadata?.algorithmVersion === "string"
    && typeof candidate.metadata?.demoOnly === "boolean"
    && Array.isArray(candidate.activities)
    && Array.isArray(candidate.eligibleSegments)
    && Array.isArray(candidate.matchCandidates)
    && Boolean(candidate.diagnostics)
    && typeof candidate.diagnostics?.activitiesLoaded === "number";
}

function sanitizeArtifactPaths(artifact: ActivityMatchArtifact): ActivityMatchArtifact {
  return sanitizePrivateActivityMatchArtifact(artifact);
}