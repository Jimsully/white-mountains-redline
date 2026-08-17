import fs from "node:fs";
import type { VerifiedNetworkArtifact } from "@/types/publication";
import { buildPublicationLoadPayload } from "../lib/publication/loader";

const args = process.argv.slice(2);
const artifactArgIndex = args.indexOf("--artifact");

if (artifactArgIndex === -1 || !args[artifactArgIndex + 1]) {
  console.error("Usage: npm run data:publication:load -- --artifact <verified-network-artifact-path>");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for publication loading. The service-role key is only for controlled server-side/admin import tooling and must never be exposed to the browser.");
  process.exit(1);
}

try {
  const artifact = JSON.parse(fs.readFileSync(args[artifactArgIndex + 1], "utf8")) as VerifiedNetworkArtifact;
  const payload = buildPublicationLoadPayload(artifact);
  await postJson(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/load_verified_publication_batch`, {
    trails_payload: payload.trails,
    segments_payload: payload.trailSegments,
    run_payload: payload.auditRun,
  }, serviceRoleKey);
  console.log(`loaded verified trails: ${payload.trails.length}`);
  console.log(`loaded verified trail segments: ${payload.trailSegments.length}`);
  console.log("no activities, completion evidence, or SegmentCompletion records were created");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function postJson(url: string, body: unknown, serviceRoleKey: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase publication load failed: ${response.status} ${response.statusText} ${await response.text()}`);
}
