import fs from "node:fs";
import path from "node:path";
import type { ReconciliationArtifact } from "@/types/reconciliation";

export const PRIVATE_ARTIFACT_PRODUCTION_ERROR = "Private reconciliation artifacts are local-development only until authenticated admin access is implemented.";

export function loadReconciliationArtifact(demoArtifact: ReconciliationArtifact, env: NodeJS.ProcessEnv = process.env): ReconciliationArtifact {
  const artifactPath = env.RECONCILIATION_ARTIFACT_PATH;
  if (artifactPath && env.NODE_ENV === "production") throw new Error(PRIVATE_ARTIFACT_PRODUCTION_ERROR);

  const artifact = artifactPath
    ? JSON.parse(fs.readFileSync(path.resolve(artifactPath), "utf8")) as unknown
    : demoArtifact;

  if (!isReconciliationArtifactShape(artifact)) throw new Error("RECONCILIATION_ARTIFACT_PATH does not contain a reconciliation artifact.");

  return {
    ...artifact,
    metadata: {
      ...artifact.metadata,
      inventoryPath: artifact.metadata.demoOnly ? artifact.metadata.inventoryPath : "local/private inventory path omitted",
    },
  };
}

export function isReconciliationArtifactShape(value: unknown): value is ReconciliationArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReconciliationArtifact>;
  return Boolean(candidate.metadata)
    && typeof candidate.metadata?.generatedAt === "string"
    && typeof candidate.metadata?.demoOnly === "boolean"
    && Boolean(candidate.summary)
    && typeof candidate.summary?.inventoryItemCount === "number"
    && Array.isArray(candidate.results)
    && Array.isArray(candidate.sourceTrailGroups);
}