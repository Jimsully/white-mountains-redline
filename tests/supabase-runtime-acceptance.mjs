import assert from "node:assert/strict";

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const anonKey = requiredEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const publicColumns = [
  "id",
  "slug",
  "segment_name",
  "miles",
  "data_status",
  "verification_status",
  "trail_id",
  "trail_slug",
  "trail_name",
  "trail_region",
  "coordinates",
].sort();

const privateProjectionFields = [
  "provenance",
  "source_ref",
  "source_feature_ids",
  "reviewed_at",
  "verification_notes",
  "publication_artifact_fingerprint",
  "geometry_manually_modified",
];

const publicationResult = await request("/rest/v1/rpc/load_verified_publication_batch", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    trails_payload: [{
      production_trail_key: "qa-public-trail-v1",
      slug: "qa-public-trail",
      name: "QA Public Trail",
      region: "presidential",
      source_label: "QA controlled source",
      source_ref: "private-trail-ref",
      reviewed_at: "2026-09-05T12:00:00Z",
      provenance: { privateNote: "must not be public" },
    }],
    segments_payload: [{
      trail_production_key: "qa-public-trail-v1",
      segment_key: "qa-public-segment-v1",
      segment_name: "QA Public Segment",
      miles: 1.25,
      source_label: "QA controlled source",
      source_ref: "private-segment-ref",
      source_feature_ids: ["private-source-feature"],
      reviewed_at: "2026-09-05T12:00:00Z",
      provenance: { privateNote: "must not be public" },
      coordinates: [[-71.5, 44.0], [-71.49, 44.01]],
    }],
    run_payload: {
      algorithm_version: "qa-publication-v1",
      generated_at: "2026-09-05T12:00:00Z",
      artifact_fingerprint: "qa-publication-runtime-acceptance-v1",
      demo_only: false,
      diagnostics: {},
      artifact_identity: { test: true },
    },
  },
});
assert.equal(publicationResult.response.status, 200, publicationResult.text);
assert.equal(publicationResult.json.trails, 1);
assert.equal(publicationResult.json.trail_segments, 1);

const projection = await request("/rest/v1/trail_segment_api?select=*", { key: anonKey });
assert.equal(projection.response.status, 200, projection.text);
assert.equal(projection.json.length, 1, "Only the fully verified segment and parent should be public.");
assert.deepEqual(Object.keys(projection.json[0]).sort(), publicColumns);
assert.equal(projection.json[0].slug, "qa-public-segment-v1");
assert.equal(projection.json[0].data_status, "verified");
assert.equal(projection.json[0].verification_status, "human_verified");
const segmentId = projection.json[0].id;

for (const field of privateProjectionFields) {
  const deniedField = await request(`/rest/v1/trail_segment_api?select=${field}`, { key: anonKey });
  assert.equal(deniedField.response.status, 400, `Expected ${field} to be absent from the public projection.`);
}

for (const relation of ["trails", "trail_segments"]) {
  const deniedBaseRead = await request(`/rest/v1/${relation}?select=*`, { key: anonKey });
  assert.ok([401, 403].includes(deniedBaseRead.response.status), `Anonymous ${relation} read unexpectedly succeeded.`);
}

const deniedAnonWrite = await request("/rest/v1/trail_segments", {
  method: "POST",
  key: anonKey,
  body: {},
});
assert.ok([401, 403].includes(deniedAnonWrite.response.status), "Anonymous trail write unexpectedly succeeded.");

const userA = await createUser("a");
const userB = await createUser("b");
const tokenA = await signIn(userA.email, userA.password);
const tokenB = await signIn(userB.email, userB.password);

const ownCompletion = await request("/rest/v1/segment_completions?select=id,user_id,segment_id,completion_method", {
  method: "POST",
  key: anonKey,
  token: tokenA,
  headers: { Prefer: "return=representation" },
  body: { user_id: userA.id, segment_id: segmentId, completed_on: "2026-09-01", notes: null },
});
assert.equal(ownCompletion.response.status, 201, ownCompletion.text);
assert.equal(ownCompletion.json.length, 1);
assert.equal(ownCompletion.json[0].user_id, userA.id);
assert.equal(ownCompletion.json[0].completion_method, "manual");

const userACompletions = await request("/rest/v1/segment_completions?select=user_id,segment_id,completion_method", {
  key: anonKey,
  token: tokenA,
});
assert.equal(userACompletions.response.status, 200, userACompletions.text);
assert.equal(userACompletions.json.length, 1);

const userBCompletionsBeforeEvidence = await request("/rest/v1/segment_completions?select=user_id,segment_id,completion_method", {
  key: anonKey,
  token: tokenB,
});
assert.equal(userBCompletionsBeforeEvidence.response.status, 200, userBCompletionsBeforeEvidence.text);
assert.equal(userBCompletionsBeforeEvidence.json.length, 0, "A user must not see another user's completion.");

const deniedForeignCompletion = await request("/rest/v1/segment_completions", {
  method: "POST",
  key: anonKey,
  token: tokenB,
  body: { user_id: userA.id, segment_id: segmentId },
});
assert.equal(deniedForeignCompletion.response.status, 403, deniedForeignCompletion.text);

const deniedRawEvidence = await request("/rest/v1/completion_evidence?select=*", {
  key: anonKey,
  token: tokenA,
});
assert.ok([401, 403].includes(deniedRawEvidence.response.status), "Authenticated raw evidence read unexpectedly succeeded.");

const evidenceFingerprint = "b".repeat(64);
const evidenceKey = `evidence_${"c".repeat(64)}`;
const acceptedAt = "2026-09-05T13:00:00Z";
const evidenceLoad = await request("/rest/v1/rpc/load_reviewed_completion_evidence_batch", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    target_user_id: userB.id,
    run_payload: {
      loader_schema_version: "reviewed-evidence-loader-v1",
      evidence_key_version: "evidence-key-v1",
      demo_only: false,
      source_artifact: {
        demoOnly: false,
        generatedAt: "2026-09-05T13:00:00Z",
        algorithmVersion: "qa-activity-matching-v1",
      },
      activity_matching_algorithm_version: "qa-activity-matching-v1",
      artifact_fingerprint: evidenceFingerprint,
    },
    activities_payload: [{
      activity_key: "qa-activity-v1",
      title: "QA private activity",
      activity_date: "2026-09-02",
      source: "gpx",
      geometry: {
        type: "MultiLineString",
        coordinates: [[[-71.5, 44.0], [-71.49, 44.01]]],
      },
      distance_miles: 1.25,
    }],
    evidence_payload: [{
      evidence_key: evidenceKey,
      activity_key: "qa-activity-v1",
      segment_key: "qa-public-segment-v1",
      match_key: "qa-match-v1",
      decision: "accepted",
      evidence_source: "historical_gps",
      accepted_at: acceptedAt,
      evidence: {
        activityMatchingAlgorithmVersion: "qa-activity-matching-v1",
        segmentConstructionAlgorithmVersion: "qa-segment-construction-v1",
      },
      provenance: {
        loaderSchemaVersion: "reviewed-evidence-loader-v1",
        artifactFingerprint: evidenceFingerprint,
        matchKey: "qa-match-v1",
        activityKey: "qa-activity-v1",
        segmentKey: "qa-public-segment-v1",
        activityMatchingAlgorithmVersion: "qa-activity-matching-v1",
        segmentConstructionAlgorithmVersion: "qa-segment-construction-v1",
        classification: "strong_candidate",
        activityDate: "2026-09-02",
        reviewDecision: { status: "accepted", reviewTimestamp: acceptedAt },
      },
    }],
  },
});
assert.equal(evidenceLoad.response.status, 200, evidenceLoad.text);
assert.equal(evidenceLoad.json.activities_created, 1);
assert.equal(evidenceLoad.json.evidence_created, 1);

const userAEvidence = await request("/rest/v1/rpc/list_confirmable_completion_evidence", {
  method: "POST",
  key: anonKey,
  token: tokenA,
  body: {},
});
assert.equal(userAEvidence.response.status, 200, userAEvidence.text);
assert.equal(userAEvidence.json.length, 0, "A user must not see another user's confirmable evidence.");

const userBEvidence = await request("/rest/v1/rpc/list_confirmable_completion_evidence", {
  method: "POST",
  key: anonKey,
  token: tokenB,
  body: {},
});
assert.equal(userBEvidence.response.status, 200, userBEvidence.text);
assert.equal(userBEvidence.json.length, 1);
assert.deepEqual(Object.keys(userBEvidence.json[0]).sort(), [
  "accepted_at",
  "activity_date",
  "activity_title",
  "evidence_id",
  "evidence_source",
  "region",
  "segment_id",
  "segment_name",
  "trail_name",
]);

const userBStillIncomplete = await request("/rest/v1/segment_completions?select=id", {
  key: anonKey,
  token: tokenB,
});
assert.equal(userBStillIncomplete.response.status, 200, userBStillIncomplete.text);
assert.equal(userBStillIncomplete.json.length, 0, "Accepted evidence must not create completion automatically.");

const confirmation = await request("/rest/v1/rpc/confirm_completion_evidence", {
  method: "POST",
  key: anonKey,
  token: tokenB,
  body: { target_evidence_id: userBEvidence.json[0].evidence_id },
});
assert.equal(confirmation.response.status, 200, confirmation.text);
assert.deepEqual(confirmation.json, [{ status: "confirmed", segment_id: Number(segmentId) }]);

const userBCompletionsAfterConfirmation = await request("/rest/v1/segment_completions?select=user_id,segment_id,completion_method,completed_on", {
  key: anonKey,
  token: tokenB,
});
assert.equal(userBCompletionsAfterConfirmation.response.status, 200, userBCompletionsAfterConfirmation.text);
assert.deepEqual(userBCompletionsAfterConfirmation.json, [{
  user_id: userB.id,
  segment_id: Number(segmentId),
  completion_method: "gpx_match",
  completed_on: "2026-09-02",
}]);

console.log("Disposable Supabase runtime acceptance passed.");

async function createUser(label) {
  const email = `runtime-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const password = `Runtime-${label}-password-27`;
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: { email, password, email_confirm: true },
  });
  assert.equal(result.response.status, 200, result.text);
  return { id: result.json.id, email, password };
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    body: { email, password },
  });
  assert.equal(result.response.status, 200, result.text);
  assert.equal(typeof result.json.access_token, "string");
  return result.json.access_token;
}

async function request(path, { method = "GET", key, token = key, body, headers = {} }) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { response, text, json };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
