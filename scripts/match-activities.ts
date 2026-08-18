import { printActivityMatchingSummary, runActivityMatching, runActivityMatchingFromVerifiedNetwork } from "../lib/activity-matching/run-activity-matching";

const args = process.argv.slice(2);
const verifiedNetworkArgIndex = args.indexOf("--verified-network");
const legacySegmentsArgIndex = args.indexOf("--legacy-topology-segments");
const legacyDecisionsArgIndex = args.indexOf("--legacy-segment-decisions");
const activitiesArgIndex = args.indexOf("--activities");

if (activitiesArgIndex === -1 || !args[activitiesArgIndex + 1]) {
  console.error("Usage: npm run data:activity:match -- --verified-network <verified-network-artifact-path> --activities <activity-path>");
  console.error("Legacy/dev only: npm run data:activity:match -- --legacy-topology-segments <segment-artifact-path> --legacy-segment-decisions <decision-path> --activities <activity-path>");
  process.exit(1);
}

try {
  if (verifiedNetworkArgIndex !== -1) {
    if (!args[verifiedNetworkArgIndex + 1]) throw new Error("--verified-network requires an artifact path.");
    printActivityMatchingSummary(runActivityMatchingFromVerifiedNetwork({ verifiedNetworkPath: args[verifiedNetworkArgIndex + 1], activitiesPath: args[activitiesArgIndex + 1] }));
  } else {
    if (legacySegmentsArgIndex === -1 || !args[legacySegmentsArgIndex + 1] || legacyDecisionsArgIndex === -1 || !args[legacyDecisionsArgIndex + 1]) throw new Error("The unpublished topology lane is legacy/dev only. Use --verified-network for normal Milestone 5 activity matching, or pass --legacy-topology-segments and --legacy-segment-decisions explicitly.");
    printActivityMatchingSummary(runActivityMatching({ segmentArtifactPath: args[legacySegmentsArgIndex + 1], segmentDecisionsPath: args[legacyDecisionsArgIndex + 1], activitiesPath: args[activitiesArgIndex + 1] }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
