import { printPublicationSummary, runPublicationBuild } from "../lib/publication/builder";

const args = process.argv.slice(2);
const segmentsArgIndex = args.indexOf("--segments");
const segmentDecisionsArgIndex = args.indexOf("--segment-decisions");
const publicationDecisionsArgIndex = args.indexOf("--publication-decisions");
const loadArgIndex = args.indexOf("--load");

if (loadArgIndex !== -1) {
  console.error("Publication build is file-only. Use npm run data:publication:load after reviewing the verified artifact.");
  process.exit(1);
}

if (segmentsArgIndex === -1 || !args[segmentsArgIndex + 1] || segmentDecisionsArgIndex === -1 || !args[segmentDecisionsArgIndex + 1] || publicationDecisionsArgIndex === -1 || !args[publicationDecisionsArgIndex + 1]) {
  console.error("Usage: npm run data:publication:build -- --segments <segment-artifact-path> --segment-decisions <segment-decision-path> --publication-decisions <publication-decision-path>");
  process.exit(1);
}

try {
  printPublicationSummary(runPublicationBuild({ segmentArtifactPath: args[segmentsArgIndex + 1], segmentDecisionsPath: args[segmentDecisionsArgIndex + 1], publicationDecisionsPath: args[publicationDecisionsArgIndex + 1] }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
