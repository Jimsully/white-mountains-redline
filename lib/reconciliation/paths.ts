import path from "node:path";

export function isDemoInventoryPath(inputPath: string, repositoryRoot = process.cwd()) {
  const resolvedInput = resolveFromRepositoryRoot(inputPath, repositoryRoot);
  const demoDir = path.resolve(repositoryRoot, "data", "demo");
  const relative = path.relative(demoDir, resolvedInput);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function getReconciliationOutputPath(inputPath: string, repositoryRoot = process.cwd(), timestamp = Date.now()) {
  const outputDir = path.resolve(repositoryRoot, "data", "generated", "reconciliation");
  if (isDemoInventoryPath(inputPath, repositoryRoot)) return path.join(outputDir, "demo-reconciliation.json");
  return path.join(outputDir, `reconciliation.local.${timestamp}.json`);
}

export function formatInventoryPathForArtifact(inputPath: string, repositoryRoot = process.cwd()) {
  if (!isDemoInventoryPath(inputPath, repositoryRoot)) return "local/private inventory path omitted";
  return path.relative(repositoryRoot, resolveFromRepositoryRoot(inputPath, repositoryRoot));
}

function resolveFromRepositoryRoot(inputPath: string, repositoryRoot: string) {
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);
}