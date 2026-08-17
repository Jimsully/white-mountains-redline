import path from "node:path";

export function isDemoInventoryPath(inputPath: string, repositoryRoot = process.cwd()) {
  const resolvedInput = path.resolve(inputPath).toLocaleLowerCase();
  const demoDir = path.resolve(repositoryRoot, "data", "demo").toLocaleLowerCase();
  return resolvedInput.startsWith(`${demoDir}${path.sep.toLocaleLowerCase()}`);
}

export function getReconciliationOutputPath(inputPath: string, repositoryRoot = process.cwd(), timestamp = Date.now()) {
  const outputDir = path.resolve(repositoryRoot, "data", "generated", "reconciliation");
  if (isDemoInventoryPath(inputPath, repositoryRoot)) return path.join(outputDir, "demo-reconciliation.json");
  return path.join(outputDir, `reconciliation.local.${timestamp}.json`);
}

export function formatInventoryPathForArtifact(inputPath: string, repositoryRoot = process.cwd()) {
  if (!isDemoInventoryPath(inputPath, repositoryRoot)) return "local/private inventory path omitted";
  return path.relative(repositoryRoot, path.resolve(inputPath));
}
