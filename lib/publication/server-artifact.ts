import fs from "node:fs";
import path from "node:path";
import type { VerifiedNetworkArtifact } from "@/types/publication";
import { DEMO_PUBLICATION_ARTIFACT_PATH } from "@/lib/publication/paths";
import { assertValidVerifiedNetworkArtifact } from "@/lib/publication/validator";

export const PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR = "Private publication artifacts are local-development only until authenticated admin access is implemented.";

export function loadDefaultPublicationArtifact(repositoryRoot = process.cwd()): VerifiedNetworkArtifact {
  return readPublicationArtifact(path.resolve(repositoryRoot, DEMO_PUBLICATION_ARTIFACT_PATH));
}

export function loadPublicationArtifact(demoArtifact: VerifiedNetworkArtifact, env: NodeJS.ProcessEnv = process.env): VerifiedNetworkArtifact {
  const artifactPath = env.PUBLICATION_ARTIFACT_PATH;
  if (artifactPath && env.NODE_ENV === "production") throw new Error(PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR);
  const artifact = artifactPath ? readPublicationArtifact(path.resolve(artifactPath)) : demoArtifact;
  if (!isVerifiedNetworkArtifactShape(artifact)) throw new Error("PUBLICATION_ARTIFACT_PATH does not contain a verified network artifact.");
  assertValidVerifiedNetworkArtifact(artifact);
  return artifact;
}

export function isVerifiedNetworkArtifactShape(value: unknown): value is VerifiedNetworkArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VerifiedNetworkArtifact>;
  return Boolean(candidate.metadata)
    && candidate.metadata?.algorithmVersion === "publication-v1"
    && typeof candidate.metadata?.demoOnly === "boolean"
    && Array.isArray(candidate.publicationDecisions)
    && Array.isArray(candidate.trailMetadata)
    && Array.isArray(candidate.candidateTrails)
    && Array.isArray(candidate.candidateSegments)
    && Array.isArray(candidate.trails)
    && Array.isArray(candidate.trailSegments)
    && Boolean(candidate.diagnostics)
    && typeof candidate.diagnostics?.verifiedSegmentCount === "number";
}

function readPublicationArtifact(artifactPath: string): VerifiedNetworkArtifact {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as unknown;
  if (!isVerifiedNetworkArtifactShape(artifact)) throw new Error(`${artifactPath} does not contain a verified network artifact.`);
  assertValidVerifiedNetworkArtifact(artifact);
  return artifact;
}
