import path from "node:path";
import { isDemoInventoryPath } from "@/lib/reconciliation/paths";

export function isDemoSegmentInput(reconciliationPath: string, decisionsPath: string, repositoryRoot = process.cwd()) {
  const resolvedReconciliation = resolveFromRoot(reconciliationPath, repositoryRoot);
  const resolvedDemoReconciliation = path.resolve(repositoryRoot, "data", "generated", "reconciliation", "demo-reconciliation.json");
  return resolvedReconciliation === resolvedDemoReconciliation && isDemoInventoryPath(decisionsPath, repositoryRoot);
}

export function getSegmentConstructionOutputPath(reconciliationPath: string, decisionsPath: string, repositoryRoot = process.cwd(), timestamp = Date.now()) {
  const outputDir = path.resolve(repositoryRoot, "data", "generated", "segments");
  if (isDemoSegmentInput(reconciliationPath, decisionsPath, repositoryRoot)) return path.join(outputDir, "demo-segment-construction.json");
  return path.join(outputDir, `segment-construction.local.${timestamp}.json`);
}

export function formatSegmentInputPathForArtifact(inputPath: string, repositoryRoot = process.cwd(), demoSafe = false) {
  return demoSafe ? path.relative(repositoryRoot, resolveFromRoot(inputPath, repositoryRoot)) : "local/private path omitted";
}

function resolveFromRoot(inputPath: string, repositoryRoot: string) {
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);
}