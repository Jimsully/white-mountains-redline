import fs from "node:fs";
import path from "node:path";
import demoArtifact from "@/data/generated/reconciliation/demo-reconciliation.json";
import { ReconciliationWorkspace } from "@/app/admin/reconciliation/ReconciliationWorkspace";
import type { ReconciliationArtifact } from "@/types/reconciliation";

export const metadata = {
  title: "Source Reconciliation Workspace",
  robots: { index: false, follow: false },
};

export default function AdminReconciliationPage() {
  return <ReconciliationWorkspace artifact={loadReconciliationArtifact()} />;
}

function loadReconciliationArtifact(): ReconciliationArtifact {
  const artifactPath = process.env.RECONCILIATION_ARTIFACT_PATH;
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

function isReconciliationArtifactShape(value: unknown): value is ReconciliationArtifact {
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
