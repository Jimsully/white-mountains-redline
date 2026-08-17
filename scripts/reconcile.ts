import { printReconciliationSummary, runReconciliation } from "../lib/reconciliation/run-reconciliation";

const args = process.argv.slice(2);
const inventoryArgIndex = args.indexOf("--inventory");
if (inventoryArgIndex === -1 || !args[inventoryArgIndex + 1]) {
  console.error("Usage: npm run data:reconcile -- --inventory <path>");
  process.exit(1);
}

try {
  printReconciliationSummary(runReconciliation({ inventoryPath: args[inventoryArgIndex + 1] }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}