import path from "node:path";

export const DEMO_SEGMENT_ARTIFACT_PATH = "data/generated/segments/demo-segment-construction.json";
export const DEMO_SEGMENT_DECISIONS_PATH = "data/demo/segment-construction-decisions.demo.json";
export const DEMO_PUBLICATION_DECISIONS_PATH = "data/demo/publication-decisions.demo.json";
export const DEMO_PUBLICATION_ARTIFACT_PATH = "data/generated/publication/demo-verified-network.json";
export const PRIVATE_PUBLICATION_PATH_OMITTED = "private path omitted";

export function isDemoPublicationInput(segmentArtifactPath: string, segmentDecisionsPath: string, publicationDecisionsPath: string, repositoryRoot: string) {
  return samePath(segmentArtifactPath, DEMO_SEGMENT_ARTIFACT_PATH, repositoryRoot)
    && samePath(segmentDecisionsPath, DEMO_SEGMENT_DECISIONS_PATH, repositoryRoot)
    && samePath(publicationDecisionsPath, DEMO_PUBLICATION_DECISIONS_PATH, repositoryRoot);
}

export function getPublicationOutputPath(segmentArtifactPath: string, segmentDecisionsPath: string, publicationDecisionsPath: string, repositoryRoot: string, timestamp = Date.now()) {
  if (isDemoPublicationInput(segmentArtifactPath, segmentDecisionsPath, publicationDecisionsPath, repositoryRoot)) return path.resolve(repositoryRoot, DEMO_PUBLICATION_ARTIFACT_PATH);
  return path.resolve(repositoryRoot, "data", "generated", "publication", `verified-network.local.${timestamp}.json`);
}

export function formatPublicationInputPathForArtifact(inputPath: string, repositoryRoot: string, demoOnly: boolean) {
  return demoOnly ? toPosix(path.relative(repositoryRoot, path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath))) : PRIVATE_PUBLICATION_PATH_OMITTED;
}

function samePath(inputPath: string, expectedRelativePath: string, repositoryRoot: string) {
  const actual = path.resolve(repositoryRoot, inputPath);
  const expected = path.resolve(repositoryRoot, expectedRelativePath);
  return actual === expected;
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}
