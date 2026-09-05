# Predeploy Database Checklist

Use this before applying migrations or exposing a Supabase project publicly. The migrations remain authoritative.

Current status: the original production cutover and migrations 001-013 are complete. Unchecked items below remain a reusable verification list for future deployments. Migration 014 is the next pending additive hardening migration.

## Migration Chain

- [ ] Explicitly designate the production Supabase project before cutover; do not assume any existing project is production.
- [ ] Apply migrations 001 through 014 in order to a disposable clean Supabase/PostgreSQL instance.
- [ ] Verify migrations 001 through 013 remain applied in the designated production project and migration 014 is the only expected pending repository migration before deployment.
- [ ] Confirm PostGIS extension is available in `extensions`.
- [ ] Confirm every migration/function reference to hosted Supabase PostGIS uses the `extensions` schema explicitly for extension functions and geometry types; do not rely on `extensions` being present in `search_path`.
- [x] Historical recovery completed: the first M8D-C attempt applied 001-002 and stopped at migration 003; the PostGIS compatibility fix was reviewed and migrations 003-013 were later applied successfully.
- [ ] Confirm migration 007 is present because later reviewed GPS evidence and evidence-backed completion flow depend on `completion_evidence` and activity matching persistence.
- [ ] Confirm migration 009 is present because production account/profile/activity ownership and privacy depend on its RLS/grant hardening.
- [ ] Confirm migration 010 applies after 007 because `segment_completions.completion_evidence_id` references `completion_evidence`.
- [ ] Confirm no local-only/demo publication or activity-matching artifacts are loaded into production.
- [ ] Confirm the hosted app remains noindex until production Supabase is ready, real non-demo published data is loaded, smoke tests pass, and `PUBLIC_INDEXING_ENABLED=true` is intentionally set only on the approved production deployment.
- [ ] Confirm migration 011 applies after migrations 007, 009, and 010 and adds only M7D-A materialization objects.
- [ ] Confirm migration 012 applies after migration 011 and adds only the internal date helper plus sanitized list/confirm RPCs, with no table, FK, RLS, or direct table-grant changes.
- [ ] Confirm migration 013 applies after migration 012 and changes only `trail_segment_api` reloptions plus trail-network relation privileges.
- [ ] Confirm migration 014 applies after migration 013 and changes only the public projection definition/grants, retaining verified-only predicates and owner-rights/security-barrier behavior.
- [x] Migrations 011-013 passed production verification and application/account acceptance.
- [ ] Apply migration 014 through the normal reviewed process and verify the public projection exposes only its documented minimal column allowlist.

## Public Trail API

- [ ] Verify `trail_segment_api` returns only rows where both segment and parent trail are `verified` and `human_verified`.
- [ ] Verify clients receive GeoJSON coordinates and do not need PostGIS WKB/hex.
- [ ] Confirm `trail_segment_api` has `security_invoker = false` and `security_barrier = true`.
- [ ] Confirm anon/authenticated can `SELECT` only `trail_segment_api`; direct `trails` and `trail_segments` PostgREST requests are denied.
- [ ] Confirm anon/authenticated can `SELECT public.trail_segment_api`.
- [ ] Confirm anon/authenticated cannot directly `SELECT public.trails`.
- [ ] Confirm anon/authenticated cannot directly `SELECT public.trail_segments`.
- [ ] Confirm `service_role` retains the administrative/publication access required by service-controlled loaders.
- [ ] Confirm the runtime defect found on clean migrations 001-012 is closed: anon/authenticated cannot retrieve internal base-table columns such as `verification_notes`, publication fingerprints, timestamps, or raw `geom`.
- [ ] After migration 014, confirm anon/authenticated also cannot retrieve `provenance`, `source_ref`, `source_feature_ids`, `reviewed_at`, or `geometry_manually_modified` from `trail_segment_api`.

## Segment Completion Security

- [ ] Confirm authenticated users can `SELECT` only their own `segment_completions`.
- [ ] Confirm authenticated users can `DELETE` only their own `segment_completions`.
- [ ] Confirm authenticated users have column-level `INSERT` only on `user_id`, `segment_id`, `completed_on`, `notes`.
- [ ] Confirm authenticated users cannot insert `id`, `activity_id`, `completion_method`, `match_confidence`, `completion_evidence_id`, or `created_at`.
- [ ] Confirm authenticated users cannot `UPDATE` `segment_completions`.
- [ ] Confirm direct authenticated attempts to insert `gpx_match` or `admin` completions fail.
- [ ] Confirm direct authenticated attempts to complete another user's row fail.
- [ ] Confirm direct authenticated attempts to complete unverified/retired/unpublished segments fail.
- [ ] Confirm duplicate `(user_id, segment_id)` completion attempts hit the unique invariant.

## Verified Segment Helper

- [ ] Confirm `public.is_verified_published_segment(bigint)` is `SECURITY DEFINER`, `STABLE`, `LANGUAGE SQL`, and `SET search_path = ''`.
- [ ] Confirm it reads only fully qualified `public.trail_segments` and `public.trails`.
- [ ] Confirm it returns true only for verified/human-reviewed segment plus verified/human-reviewed parent trail.
- [ ] Confirm execute is revoked from `public`, `anon`, and `authenticated`, then granted to `authenticated`.
- [ ] Confirm it does not expose user identity or completion provenance controls.

## Evidence Boundary

- [ ] Confirm `completion_evidence` has no direct anon/authenticated table access.
- [ ] Confirm activity matching tables have no direct anon/authenticated table access.
- [ ] Confirm `load_reviewed_completion_evidence_batch` is executable only by `service_role` and remains invoker-rights.
- [ ] Confirm demo payloads, stale/unverified segment keys, and semantic identity conflicts roll back the complete batch.
- [ ] Confirm accepted evidence semantic updates and FK relinking fail, while existing non-null FK links can become null through `ON DELETE SET NULL`.
- [ ] Confirm loader results contain counts/fingerprint only, never geometry, evidence, or provenance.
- [ ] Confirm the internal activity-date helper rejects malformed dates and is not executable by application roles.
- [ ] Confirm the list/confirm RPCs are executable by `authenticated` only and expose no raw evidence, provenance, geometry, matching keys, metrics, or service metadata.
- [ ] Confirm the M7D-C application calls only the two sanitized RPCs and never queries raw `completion_evidence`.
- [ ] Confirm evidence confirmation submits only the opaque evidence UUID and does not accept caller-controlled completion semantics.

## Profile And Activity RLS

- [ ] Confirm public profile reads expose only `is_public = true`.
- [ ] Confirm authenticated users can read/update only their own private profile.
- [ ] Confirm activities remain owner-scoped through RLS.
- [ ] Confirm authenticated activity INSERT/UPDATE grants are column-limited and exclude `activity_key`; UPDATE also excludes `user_id`.
- [ ] Confirm activity UPDATE policies include both `USING` and `WITH CHECK`.

## Service Role Tooling

- [ ] Confirm `load_source_trail_feature_batch` execute is `service_role`-only and remains invoker-rights.
- [ ] Confirm `load_verified_publication_batch` execute is `service_role`-only.
- [ ] Confirm `load_reviewed_completion_evidence_batch` execute is `service_role`-only and the CLI verifies an exact auth UUID before one atomic RPC.
- [ ] Confirm the service role has migration-defined schema, activity identity-sequence, trail base-table read, PostGIS execute, and activity/evidence mutation privileges required by the invoker-rights loader.
- [ ] Confirm the deployed Supabase `service_role` retains `BYPASSRLS`; the loader does not add service-role RLS policies or use `SECURITY DEFINER`.
- [ ] Confirm service-role keys are not committed, not in browser env vars, and not reachable from client components.

## Runtime Tests Required

- [ ] Run actual PostgreSQL/Supabase RLS tests; static SQL text tests are not enough.
- [ ] Test grants with anon, authenticated user A, authenticated user B, and `service_role`.
- [ ] Test column-level insert privileges through PostgREST/Supabase client.
- [ ] Test account deletion/cascade behavior for profiles, activities, completions, and evidence.
- [ ] Test evidence deletion blocked when referenced by `segment_completions.completion_evidence_id`.
- [ ] Test migration 011 exact reruns, activity/evidence conflicts, full rollback, accepted-evidence trigger behavior, and verified parent/segment resolution in real PostgreSQL.
- [ ] List own confirmable evidence and prove foreign evidence is absent.
- [ ] Deny direct raw evidence reads for anon/authenticated callers.
- [ ] Prove a foreign evidence UUID is indistinguishable from a nonexistent UUID.
- [ ] Confirm eligible evidence creates the exact `gpx_match` row and `completed_on` equals immutable `provenance.activityDate`.
- [ ] Prove changing `activities.activity_date` cannot affect the confirmation date.
- [ ] Reject manual evidence; accept `historical_gps`, `gpx_import`, and `connected_service` using fixtures for each available source.
- [ ] Reject stale/unverified segments and evidence whose parent trail is unverified.
- [ ] Verify null/deleted activity behavior, and reject an activity owned by another user.
- [ ] Retry the same evidence and classify it as already confirmed.
- [ ] Classify an existing manual completion and a completion from different evidence as already completed.
- [ ] Race two confirmations of the same evidence, two evidence rows for one segment, and manual versus evidence completion.
- [ ] Unmark by deleting only the completion; prove evidence remains, reappears, and can be explicitly reconfirmed.
- [ ] Verify activity `ON DELETE SET NULL`, segment deletion behavior, evidence `ON DELETE NO ACTION`, and account cascades.
- [ ] Verify authenticated RPC execution, anon denial, and that normal confirmation does not require `service_role`.
- [ ] Query `pg_proc.proowner` for all three migration-012 functions; a clean standard Supabase CLI deployment is expected to show `postgres`, never an application/browser role.
- [ ] Verify that owner can select `completion_evidence`, `activities`, `trail_segments`, `trails`, and `segment_completions`; insert `segment_completions`; invoke the internal helper; and acquire the required row locks.
- [ ] Repeat ownership checks for custom `--db-url` or self-hosted deployment paths instead of assuming standard hosted behavior.
- [ ] Race activity/evidence/segment/account deletion against confirmation and verify only safe serial outcomes or `not_confirmable` for expected FK failures.
- [ ] Exercise RLS and GRANT behavior through actual Supabase/PostgREST, not only direct SQL or static tests.
- [ ] Run migration 013 runtime acceptance on disposable/local Supabase: migrations 001-013 apply from zero, a second clean reset also succeeds, view reloptions are correct, anon/authenticated view SELECT succeeds, anon/authenticated direct `trails` and `trail_segments` reads are denied, verified fixtures remain visible, unverified fixtures are hidden, verified segments with unverified parents are hidden, base internal columns cannot be retrieved through PostgREST, anon/auth write attempts fail, service-role publication behavior remains functional, and application tests/build remain green.

## M7D-C Database-Backed Acceptance

- [ ] Use a disposable/local Supabase instance with migrations 001-012 and controlled QA-owned evidence; do not fabricate production evidence.
- [ ] Confirm an authenticated account sees only its own sanitized confirmable evidence and foreign evidence remains invisible.
- [ ] Confirm Mark complete invokes the confirmation RPC, removes the evidence row, and updates authenticated progress.
- [ ] Confirm an existing manual completion is preserved and produces the benign already-completed outcome.
- [ ] Confirm unmark deletes only the completion, leaves evidence intact, and allows eligible evidence to return.
- [ ] Confirm `not_confirmable` is non-specific and does not enumerate foreign, deleted, malformed, or unpublished evidence.
- [ ] Inspect browser/network application payloads and confirm no raw evidence fields appear beyond the fixed sanitized RPC contract and opaque UUID.
- [ ] Treat automated M7D-C repository/action/UI tests as necessary but not a substitute for this database-backed acceptance.
