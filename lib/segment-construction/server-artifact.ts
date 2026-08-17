import fs from "node:fs";
import path from "node:path";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";

export const PRIVATE_SEGMENT_ARTIFACT_PRODUCTION_ERROR = "Private segment construction artifacts are local-development only until authenticated admin access is implemented.";

export function loadSegmentConstructionArtifact(demoArtifact: SegmentConstructionArtifact, env: NodeJS.ProcessEnv = process.env): SegmentConstructionArtifact {
  const artifactPath = env.SEGMENT_CONSTRUCTION_ARTIFACT_PATH;
  if (artifactPath && env.NODE_ENV === "production") throw new Error(PRIVATE_SEGMENT_ARTIFACT_PRODUCTION_ERROR);
  const artifact = artifactPath ? JSON.parse(fs.readFileSync(path.resolve(artifactPath), "utf8")) as unknown : demoArtifact;
  if (!isSegmentConstructionArtifactShape(artifact)) throw new Error("SEGMENT_CONSTRUCTION_ARTIFACT_PATH does not contain a segment construction artifact.");
  return {
    ...artifact,
    metadata: {
      ...artifact.metadata,
      reconciliationArtifactPath: artifact.metadata.demoOnly ? artifact.metadata.reconciliationArtifactPath : "local/private path omitted",
      decisionsPath: artifact.metadata.demoOnly ? artifact.metadata.decisionsPath : "local/private path omitted",
    },
  };
}

export function isSegmentConstructionArtifactShape(value: unknown): value is SegmentConstructionArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SegmentConstructionArtifact>;
  return Boolean(candidate.metadata)
    && typeof candidate.metadata?.algorithmVersion === "string"
    && typeof candidate.metadata?.demoOnly === "boolean"
    && Boolean(candidate.diagnostics)
    && typeof candidate.diagnostics?.acceptedTrailSourceCount === "number"
    && Array.isArray(candidate.junctionCandidates)
    && Array.isArray(candidate.segmentCandidates)
    && Array.isArray(candidate.acceptedTrailSources);
}