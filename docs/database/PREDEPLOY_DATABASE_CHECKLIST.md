# Predeploy Database Checklist

Use this before applying migrations or exposing a Supabase project publicly. The migrations remain authoritative.

## Migration Chain

- [ ] Apply migrations 001 through 010 in order to a disposable clean Supabase/PostgreSQL instance.
- [ ] Confirm PostGIS extension is available in `extensions`.
- [ ] Confirm migration 010 applies after 007 because `segment_completions.completion_evidence_id` references `completion_evidence`.
- [ ] Confirm no local-only/demo publication artifacts are loaded into production.

## Public Trail API

- [ ] Verify `trail_segment_api` returns only rows where both segment and parent trail are `verified` and `human_verified`.
- [ ] Verify clients receive GeoJSON coordinates and do not need PostGIS WKB/hex.
- [ ] Audit clean-bootstrap privileges for `trail_segment_api`: it is `security_invoker`, and migrations explicitly grant `SELECT` on the view but not explicit anon/authenticated `SELECT` on underlying `trails` / `trail_segments`.
- [ ] Decide whether to add explicit base-table grants, change view security strategy, or otherwise document the Supabase default privilege requirement before production.

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
- [ ] Confirm service_role-only evidence/admin workflows are not exposed to browser code.
- [ ] Confirm M7D evidence confirmation/read RPCs are not assumed to exist until implemented and reviewed.

## Profile And Activity RLS

- [ ] Confirm public profile reads expose only `is_public = true`.
- [ ] Confirm authenticated users can read/update only their own private profile.
- [ ] Confirm activities are owner-only for select/insert/update/delete.
- [ ] Confirm activity UPDATE policies include both `USING` and `WITH CHECK`.

## Service Role Tooling

- [ ] Confirm `load_source_trail_feature_batch` execute is service_role-only and remains invoker-rights.
- [ ] Confirm `load_verified_publication_batch` execute is service_role-only.
- [ ] Confirm service-role keys are not committed, not in browser env vars, and not reachable from client components.

## Runtime Tests Required

- [ ] Run actual PostgreSQL/Supabase RLS tests; static SQL text tests are not enough.
- [ ] Test grants with anon, authenticated user A, authenticated user B, and service_role.
- [ ] Test column-level insert privileges through PostgREST/Supabase client.
- [ ] Test account deletion/cascade behavior for profiles, activities, completions, and evidence.
- [ ] Test evidence deletion blocked when referenced by `segment_completions.completion_evidence_id`.