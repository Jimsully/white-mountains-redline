import { printSegmentConstructionSummary, runSegmentConstruction } from "../lib/segment-construction/run-segment-construction";

const args = process.argv.slice(2);
const reconciliationArgIndex = args.indexOf("--reconciliation");
const decisionsArgIndex = args.indexOf("--decisions");
if (reconciliationArgIndex === -1 || !args[reconciliationArgIndex + 1] || decisionsArgIndex === -1 || !args[decisionsArgIndex + 1]) {
  console.error("Usage: npm run data:segments:build -- --reconciliation <artifact-path> --decisions <decision-path>");
  process.exit(1);
}

try {
  printSegmentConstructionSummary(runSegmentConstruction({ reconciliationPath: args[reconciliationArgIndex + 1], decisionsPath: args[decisionsArgIndex + 1] }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}