import { printActivityMatchingSummary, runActivityMatching, runActivityMatchingFromVerifiedNetwork } from "../lib/activity-matching/run-activity-matching";

const args = process.argv.slice(2);
const verifiedNetworkArgIndex = args.indexOf("--verified-network");
const segmentsArgIndex = args.indexOf("--segments");
const decisionsArgIndex = args.indexOf("--segment-decisions");
const activitiesArgIndex = args.indexOf("--activities");

if (activitiesArgIndex === -1 || !args[activitiesArgIndex + 1]) {
  console.error("Usage: npm run data:activity:match -- (--verified-network <verified-network-artifact-path> | --segments <segment-artifact-path> --segment-decisions <decision-path>) --activities <activity-path>");
  process.exit(1);
}

try {
  if (verifiedNetworkArgIndex !== -1) {
    if (!args[verifiedNetworkArgIndex + 1]) throw new Error("--verified-network requires an artifact path.");
    printActivityMatchingSummary(runActivityMatchingFromVerifiedNetwork({ verifiedNetworkPath: args[verifiedNetworkArgIndex + 1], activitiesPath: args[activitiesArgIndex + 1] }));
  } else {
    if (segmentsArgIndex === -1 || !args[segmentsArgIndex + 1] || decisionsArgIndex === -1 || !args[decisionsArgIndex + 1]) throw new Error("--segments and --segment-decisions are required when --verified-network is not supplied.");
    printActivityMatchingSummary(runActivityMatching({ segmentArtifactPath: args[segmentsArgIndex + 1], segmentDecisionsPath: args[decisionsArgIndex + 1], activitiesPath: args[activitiesArgIndex + 1] }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
