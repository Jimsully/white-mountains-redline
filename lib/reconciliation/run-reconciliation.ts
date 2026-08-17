import fs from "node:fs";
import path from "node:path";
import type { ReconciliationArtifact, SourceTrailGroup } from "@/types/reconciliation";
import type { SourceTrailFeature } from "@/types/trails";
import { buildReconciliationArtifact } from "@/lib/reconciliation/artifact";
import { formatInventoryPathForArtifact, getReconciliationOutputPath, isDemoInventoryPath } from "@/lib/reconciliation/paths";

const SOURCE_PATH = path.join("data", "staging", "usfs", "franconia-pemi", "source-features.json");

type ReconciliationRunOptions = {
  inventoryPath: string;
  repositoryRoot?: string;
  generatedAt?: string;
  timestamp?: number;
};

export type ReconciliationRunResult = {
  artifact: ReconciliationArtifact;
  outputPath: string;
};

export function runReconciliation(options: ReconciliationRunOptions): ReconciliationRunResult {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const inventoryPath = path.isAbsolute(options.inventoryPath) ? path.resolve(options.inventoryPath) : path.resolve(repositoryRoot, options.inventoryPath);
  const demoOnly = isDemoInventoryPath(inventoryPath, repositoryRoot);
  const outputPath = getReconciliationOutputPath(inventoryPath, repositoryRoot, options.timestamp);
  const generatedAt = options.generatedAt ?? getDefaultGeneratedAt(outputPath, demoOnly);
  const csv = fs.readFileSync(inventoryPath, "utf8");
  const source = JSON.parse(fs.readFileSync(path.resolve(repositoryRoot, SOURCE_PATH), "utf8")) as { features?: SourceTrailFeature[] };
  const features = source.features ?? [];
  const artifact = buildReconciliationArtifact(csv, features, generatedAt, demoOnly);
  artifact.metadata.inventoryPath = formatInventoryPathForArtifact(inventoryPath, repositoryRoot);
  artifact.sourceTrailGroups = sourceTrailGroupsReferencedByCandidates(artifact);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact)}\n`);
  return { artifact, outputPath };
}

export function printReconciliationSummary(result: ReconciliationRunResult) {
  const { artifact, outputPath } = result;
  console.log(`Inventory items: ${artifact.summary.inventoryItemCount}`);
  console.log(`Exact matches: ${artifact.summary.exactMatchCount}`);
  console.log(`Candidate found: ${artifact.summary.candidateFoundCount}`);
  console.log(`Unmatched: ${artifact.summary.unmatchedCount}`);
  console.log(`Ambiguous: ${artifact.summary.ambiguousCount}`);
  console.log(`Source feature count: ${artifact.metadata.sourceFeatureCount}`);
  console.log(`Source trail groups: ${artifact.summary.sourceTrailGroupCount}`);
  console.log(`Output: ${path.relative(process.cwd(), outputPath)}`);
}

function getDefaultGeneratedAt(outputPath: string, demoOnly: boolean) {
  if (demoOnly && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf8")) as Partial<ReconciliationArtifact>;
      if (typeof existing.metadata?.generatedAt === "string") return existing.metadata.generatedAt;
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

function sourceTrailGroupsReferencedByCandidates(artifact: ReconciliationArtifact): SourceTrailGroup[] {
  const referencedNames = new Set(artifact.results.flatMap((result) => result.candidates.map((candidate) => candidate.sourceTrailNormalizedName)));
  return artifact.sourceTrailGroups.filter((group) => referencedNames.has(group.normalizedName));
}