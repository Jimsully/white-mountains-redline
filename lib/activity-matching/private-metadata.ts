import type { ActivityMatchArtifact, ActivityRecord } from "@/types/activity-matching";
import { PRIVATE_PATH_OMITTED } from "@/lib/activity-matching/paths";

const PATH_KEY_PATTERN = /(path|filepath|directory|folder|filename|sourcefilename)/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const POSIX_ABSOLUTE_PATH_PATTERN = /^\/(Users|home|private|var|tmp|Volumes)\b/;

export function sanitizePrivateActivityMetadata(activity: ActivityRecord): ActivityRecord {
  return {
    ...activity,
    originalFilename: activity.originalFilename ? PRIVATE_PATH_OMITTED : undefined,
    sourceMetadata: sanitizeMetadataValue(activity.sourceMetadata) as Record<string, unknown>,
  };
}

export function sanitizePrivateActivityMatchArtifact(artifact: ActivityMatchArtifact): ActivityMatchArtifact {
  if (artifact.metadata.demoOnly) return artifact;
  return {
    ...artifact,
    metadata: {
      ...artifact.metadata,
      segmentArtifactPath: PRIVATE_PATH_OMITTED,
      segmentDecisionsPath: PRIVATE_PATH_OMITTED,
      activitiesPath: PRIVATE_PATH_OMITTED,
    },
    activities: artifact.activities.map(sanitizePrivateActivityMetadata),
  };
}

function sanitizeMetadataValue(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeMetadataValue(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeMetadataValue(childValue, childKey)]));
  if (typeof value !== "string") return value;
  if (shouldRedactMetadataString(key, value)) return PRIVATE_PATH_OMITTED;
  return value;
}

function shouldRedactMetadataString(key: string, value: string) {
  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) || POSIX_ABSOLUTE_PATH_PATTERN.test(value)) return true;
  if (!PATH_KEY_PATTERN.test(key)) return false;
  if (value.includes("/") || value.includes("\\")) return true;
  return false;
}