import fs from "node:fs";
import path from "node:path";
import type { ReconciliationArtifact } from "@/types/reconciliation";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";
import { acceptedTrailSourcesFromReconciliation, type DecisionExport } from "@/lib/segment-construction/accepted-sources";
import { buildSegmentConstructionArtifact } from "@/lib/segment-construction/topology";
import { formatSegmentInputPathForArtifact, getSegmentConstructionOutputPath, isDemoSegmentInput } from "@/lib/segment-construction/paths";

export type SegmentBuildOptions = {
  reconciliationPath: string;
  decisionsPath: string;
  repositoryRoot?: string;
  generatedAt?: string;
  timestamp?: number;
};

export type SegmentBuildResult = {
  artifact: SegmentConstructionArtifact;
  outputPath: string;
};

export function runSegmentConstruction(options: SegmentBuildOptions): SegmentBuildResult {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const reconciliationPath = resolveFromRoot(options.reconciliationPath, repositoryRoot);
  const decisionsPath = resolveFromRoot(options.decisionsPath, repositoryRoot);
  const demoOnly = isDemoSegmentInput(reconciliationPath, decisionsPath, repositoryRoot);
  const outputPath = getSegmentConstructionOutputPath(reconciliationPath, decisionsPath, repositoryRoot, options.timestamp);
  const generatedAt = options.generatedAt ?? getDefaultGeneratedAt(outputPath, demoOnly);
  const reconciliation = JSON.parse(fs.readFileSync(reconciliationPath, "utf8")) as ReconciliationArtifact;
  const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf8")) as DecisionExport;
  const acceptedTrailSources = acceptedTrailSourcesFromReconciliation(reconciliation, decisions);
  const artifact = buildSegmentConstructionArtifact({
    acceptedTrailSources,
    generatedAt,
    demoOnly,
    reconciliationArtifactPath: formatSegmentInputPathForArtifact(reconciliationPath, repositoryRoot, demoOnly),
    decisionsPath: formatSegmentInputPathForArtifact(decisionsPath, repositoryRoot, demoOnly),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact)}\n`);
  return { artifact, outputPath };
}

export function printSegmentConstructionSummary(result: SegmentBuildResult) {
  const { diagnostics } = result.artifact;
  console.log(`Accepted trail sources: ${diagnostics.acceptedTrailSourceCount}`);
  console.log(`Junction candidates: ${diagnostics.junctionCandidateCount}`);
  console.log(`Exact intersections: ${diagnostics.exactIntersectionCount}`);
  console.log(`Near-intersection warnings: ${diagnostics.nearIntersectionWarningCount}`);
  console.log(`Segment candidates: ${diagnostics.segmentCandidateCount}`);
  console.log(`Short-segment warnings: ${diagnostics.shortSegmentWarningCount}`);
  console.log(`Disconnected components: ${diagnostics.disconnectedComponentCount}`);
  console.log(`Input geometry miles: ${diagnostics.inputGeometryMiles}`);
  console.log(`Output segment miles: ${diagnostics.outputSegmentMiles}`);
  console.log(`Length delta miles: ${diagnostics.lengthDeltaMiles}`);
  console.log(`Integrity warnings: ${diagnostics.integrityWarnings.length}`);
  console.log(`Integrity errors: ${diagnostics.integrityErrors.length}`);
  console.log(`Output: ${path.relative(process.cwd(), result.outputPath)}`);
}

function getDefaultGeneratedAt(outputPath: string, demoOnly: boolean) {
  if (demoOnly && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf8")) as Partial<SegmentConstructionArtifact>;
      if (typeof existing.metadata?.generatedAt === "string") return existing.metadata.generatedAt;
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

function resolveFromRoot(inputPath: string, repositoryRoot: string) {
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);
}
