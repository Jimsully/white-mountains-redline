import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildReviewedEvidenceMaterialization,
  executeReviewedEvidenceMaterialization,
} from "@/lib/activity-matching/materialization";
import { isInsidePath } from "@/lib/activity-matching/paths";

async function main() {
  const args = process.argv.slice(2);
  const artifactPath = argumentValue(args, "--artifact");
  const decisionsPath = argumentValue(args, "--decisions");
  const userId = argumentValue(args, "--user-id");
  const shouldLoad = args.includes("--load");

  if (!artifactPath || !decisionsPath || !userId) {
    console.error("Usage: npm run data:activity:evidence:load -- --artifact <activity-match-artifact> --decisions <review-export> --user-id <auth-user-uuid> [--load]");
    process.exit(1);
  }

  try {
    if (shouldLoad && isKnownDemoPath(artifactPath)) {
      throw new Error("Committed demo activity matching artifacts must not be materialized.");
    }

    const artifact = JSON.parse(fs.readFileSync(path.resolve(artifactPath), "utf8")) as unknown;
    const decisionExport = JSON.parse(fs.readFileSync(path.resolve(decisionsPath), "utf8")) as unknown;
    const payload = buildReviewedEvidenceMaterialization({ artifact, decisionExport, targetUserId: userId });

    printSummary(payload.summary, shouldLoad ? "load requested" : "dry run");
    if (!shouldLoad) {
      await executeReviewedEvidenceMaterialization(payload, { load: false });
      console.log("dry run complete: zero network operations and zero database writes");
    } else {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --load. The service-role key is controlled server-side/admin tooling only and must never be exposed to browser code.");
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const outcome = await executeReviewedEvidenceMaterialization(payload, {
        load: true,
        verifyUser: async (targetUserId) => {
          const { data, error } = await supabase.auth.admin.getUserById(targetUserId);
          if (error || !data.user || data.user.id !== targetUserId) throw new Error("The selected auth user UUID does not exist.");
        },
        loadBatch: async (materialization) => {
          const { data, error } = await supabase.rpc("load_reviewed_completion_evidence_batch", {
            target_user_id: materialization.targetUserId,
            run_payload: materialization.run,
            activities_payload: materialization.activities,
            evidence_payload: materialization.evidence,
          });
          if (error) throw new Error("Supabase reviewed-evidence load failed.");
          return requireSafeLoadResult(data);
        },
      });
      if (outcome.mode !== "loaded") throw new Error("Reviewed-evidence load did not enter load mode.");
      printLoadResult(outcome.result);
      console.log("no SegmentCompletion records were created");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function argumentValue(values: string[], name: string) {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
}

function isKnownDemoPath(inputPath: string, repositoryRoot = process.cwd()) {
  const resolved = path.resolve(repositoryRoot, inputPath);
  return isInsidePath(resolved, path.resolve(repositoryRoot, "data", "demo"))
    || resolved === path.resolve(repositoryRoot, "data", "generated", "activity-matching", "demo-activity-matching.json");
}

function printSummary(summary: ReturnType<typeof buildReviewedEvidenceMaterialization>["summary"], mode: string) {
  console.log(`mode: ${mode}`);
  console.log(`accepted decisions: ${summary.acceptedDecisionCount}`);
  console.log(`rejected decisions: ${summary.rejectedDecisionCount}`);
  console.log(`needs-review decisions: ${summary.needsReviewDecisionCount}`);
  console.log(`activities required: ${summary.activitiesRequired}`);
  console.log(`evidence records: ${summary.evidenceCount}`);
  console.log(`artifact fingerprint: ${summary.artifactFingerprint}`);
  console.log(`serialized RPC payload bytes: ${summary.payloadBytes}`);
}
type SafeLoadResult = {
  artifact_fingerprint: string;
  activities_created: number;
  activities_reused: number;
  evidence_created: number;
  evidence_already_loaded: number;
};

function requireSafeLoadResult(value: unknown): SafeLoadResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supabase reviewed-evidence load returned an invalid result.");
  const result = value as Record<string, unknown>;
  const countFields = ["activities_created", "activities_reused", "evidence_created", "evidence_already_loaded"] as const;
  if (typeof result.artifact_fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(result.artifact_fingerprint)
    || countFields.some((field) => !Number.isInteger(result[field]) || (result[field] as number) < 0)) {
    throw new Error("Supabase reviewed-evidence load returned an invalid result.");
  }
  return result as SafeLoadResult;
}

function printLoadResult(result: SafeLoadResult) {
  console.log(`loaded artifact fingerprint: ${result.artifact_fingerprint}`);
  console.log(`activities created: ${result.activities_created}`);
  console.log(`activities reused: ${result.activities_reused}`);
  console.log(`evidence created: ${result.evidence_created}`);
  console.log(`evidence already loaded: ${result.evidence_already_loaded}`);
}
