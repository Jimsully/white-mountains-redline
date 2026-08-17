import { loadActivitiesFromPath } from "../lib/activity-matching/activities";

const args = process.argv.slice(2);
const inputArgIndex = args.indexOf("--input");
const inputPath = inputArgIndex === -1 ? args.find((arg) => !arg.startsWith("--")) : args[inputArgIndex + 1];
if (!inputPath) {
  console.error("Usage: npm run data:activity:normalize -- --input <path>");
  process.exit(1);
}

try {
  console.log(JSON.stringify({ activities: loadActivitiesFromPath(inputPath) }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}