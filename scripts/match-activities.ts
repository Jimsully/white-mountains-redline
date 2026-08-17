import { printActivityMatchingSummary, runActivityMatching } from "../lib/activity-matching/run-activity-matching";

const args = process.argv.slice(2);
const segmentsArgIndex = args.indexOf("--segments");
const decisionsArgIndex = args.indexOf("--segment-decisions");
const activitiesArgIndex = args.indexOf("--activities");
if (segmentsArgIndex === -1 || !args[segmentsArgIndex + 1] || decisionsArgIndex === -1 || !args[decisionsArgIndex + 1] || activitiesArgIndex === -1 || !args[activitiesArgIndex + 1]) {
  console.error("Usage: npm run data:activity:match -- --segments <segment-artifact-path> --segment-decisions <decision-path> --activities <activity-path>");
  process.exit(1);
}

try {
  printActivityMatchingSummary(runActivityMatching({ segmentArtifactPath: args[segmentsArgIndex + 1], segmentDecisionsPath: args[decisionsArgIndex + 1], activitiesPath: args[activitiesArgIndex + 1] }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}