# Activity Matching

Milestone 4 introduced local historical activity-to-segment matching. It answers which human-approved, published segments a GPS trace may support as completion evidence.

```text
raw GIS -> reconciliation -> segment construction -> verified publication -> historical GPS activity -> algorithmic match candidate -> human-reviewed completion evidence -> future explicit user confirmation -> SegmentCompletion
```

## Safety Rules

- GPS trace geometry is evidence, not canonical trail geometry.
- A strong candidate is not a completion.
- Accepting completion evidence does not create a production `SegmentCompletion` row.
- Demo geometry and activities are synthetic and NOT FOR NAVIGATION.
- Normal authenticated users do not receive raw matching evidence or provenance.

## Local Inputs

Demo activities live in `data/demo/activities/` and are committed synthetic fixtures. Real activity files belong in `data/local/activities/`, which is ignored except for `.gitkeep`.

Private generated and loaded artifacts redact filesystem provenance from `sourceMetadata`, including Windows/POSIX absolute paths and nested path-like keys. Ordinary safe metadata may remain in local artifacts, but M7D-A does not persist raw `sourceMetadata` or original filenames.

## Commands

```powershell
npm.cmd run data:activity:validate -- data/demo/activities
npm.cmd run data:activity:match -- --verified-network data/generated/publication/demo-verified-network.json --activities data/demo/activities
```

The unpublished topology input lane remains explicit legacy/development tooling. Normal matching uses the verified-network artifact so evidence stays downstream of the publication gate.

## Matcher Integrity

Activity edges longer than `maximumInterpolatedActivityEdgeMeters` are GPS evidence gaps. Endpoint points remain evidence, but the matcher does not interpolate across the gap and call it observed traversal.

Strong candidates require one activity trace component to satisfy coverage, endpoint, and proximity requirements on its own. Separate GPX `trkseg` components can provide useful union evidence, but cannot silently combine into strong traversal continuity.

The spatial prefilter expands latitude and longitude independently using meter-aware conversion. It is conservative because full scoring follows.

Activity identity uses `activity-key-v2`. When `sourceActivityId` exists, identity derives from version, source, and source ID. Otherwise it uses source, start time, and an orientation-stable geometry fingerprint.

Each match stores `componentEvidence`, raw and trusted trace lengths, ignored-edge diagnostics, stable algorithm versions, and a deterministic match key. Admin previews use the same trusted-trace gap handling as scoring.

## M7D-A Reviewed Evidence Materialization

Migration 011 and the controlled CLI materialize reviewed private evidence without creating completions:

```powershell
npm.cmd run data:activity:evidence:load -- --artifact <private-activity-match-artifact> --decisions <review-export.json> --user-id <auth-user-uuid>
```

The default is an offline dry run. It validates both artifacts, rejects demo/manual material, recomputes stable identities, reports the semantic SHA-256 fingerprint and serialized payload size, and performs no network operation.

Add `--load` only from controlled admin tooling. Load mode requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, verifies the exact auth user UUID through the Admin API, and invokes one atomic service-role-only RPC. The service-role key must never use a `NEXT_PUBLIC_` variable or enter browser code.

M7D-A persists only accepted decisions into owned `activities` and private `completion_evidence`. Rejected and needs-review decisions create nothing. It does not populate activity match run/candidate/decision tables and never inserts `segment_completions`.

Stable activity/evidence identities make exact reruns reusable. Existing rows are compared, not overwritten. A changed immutable semantic payload is a conflict. Review timestamps must be valid ISO timestamps and may be at most five minutes ahead of the loader clock. Evidence provenance includes an immutable `activityDate` snapshot for future confirmation; future completion dates must not be derived from mutable `activities.activity_date`.

## M7D-B Evidence Confirmation Boundary

Migration 012 implements the local database authorization boundary for future M7D-C UI. `list_confirmable_completion_evidence()` exposes only an owner-scoped sanitized projection; raw evidence, provenance, geometry, matching keys, metrics, and service metadata remain private. `confirm_completion_evidence(uuid)` requires explicit authenticated confirmation and derives every protected completion field internally.

Evidence-backed `completed_on` comes only from the immutable M7D-A `provenance.activityDate` snapshot after strict validation. It never falls back to mutable `activities.activity_date`, `accepted_at`, or the current date. A successful confirmation creates `SegmentCompletion(method = gpx_match)`; accepted evidence alone still creates no completion. Migration 012 has not been applied live.

## Future M7D-C

M7D-C account evidence UI, browser integration, and confirmation actions are not implemented.