import { summarizeActivities, loadActivitiesFromPath } from "../lib/activity-matching/activities";

const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!inputPath) {
  console.error("Usage: npm run data:activity:validate -- <path>");
  process.exit(1);
}

try {
  const summary = summarizeActivities(loadActivitiesFromPath(inputPath));
  console.log(`activity count: ${summary.activityCount}`);
  console.log(`track/component count: ${summary.trackComponentCount}`);
  console.log(`input GPS point count: ${summary.inputGpsPointCount}`);
  console.log(`retained point count: ${summary.retainedPointCount}`);
  console.log(`malformed/skipped points: ${summary.malformedPointCount}`);
  console.log(`activity date range: ${summary.activityStartDate ?? "unknown"} to ${summary.activityEndDate ?? "unknown"}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}