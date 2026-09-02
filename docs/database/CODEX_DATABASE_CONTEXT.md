# Codex Database Context

Read this at the start of future database work. Migrations in `supabase/migrations/` are authoritative.

## Current State

Migrations 001-013 define the repository database contract. In the first production deployment attempt for hosted Supabase project `white-mountains-redline`, migrations 001 and 002 applied, then migration 003 failed before completion because hosted Supabase PostGIS was installed in `extensions` and an unqualified PostGIS function call did not resolve through the migration session `search_path`. Migrations 003-013 remain pending until the compatibility fix is reviewed and production migration history is verified. M7A introduced authenticated manual completion security. M7B composes private completions per request, and M7C map/list selection adds no database behavior. M7D-A materializes reviewed private evidence without completions. M7D-B provides sanitized owner reads plus explicit owner confirmation. M7D-C implements the local authenticated SSR repository, server action, and account evidence UI, and its database-backed runtime acceptance has passed on disposable local Supabase. Migration 013 implements the public projection hardening boundary and has passed clean-bootstrap/runtime acceptance locally.

## Hard Product Rules

- Segment, not trail, is the completion unit.
- GPS evidence is not completion.
- Strong GPS match is not completion.
- Accepted evidence is not completion.
- Only explicit confirmation creates `segment_completions`.
- Demo/raw/review geometry is not for navigation.

## Public Data Boundary

Public production trail data requires both parent `trails` and child `trail_segments` to have:

```text
data_status = 'verified'
verification_status = 'human_verified'
```

`trail_segment_api` is the app read projection. It is verified-only and returns GeoJSON coordinates. Migration 013 sets it to owner-rights (`security_invoker = false`) with `security_barrier = true`.

Hosted Supabase installs PostGIS in the `extensions` schema for this project. Migration SQL and durable database functions must schema-qualify PostGIS extension functions and geometry types, for example `extensions.st_asgeojson(...)`, `extensions.st_geomfromgeojson(...)`, `extensions.st_setsrid(...)`, and `extensions.geometry(...)`. Do not add `extensions` to hardened `SECURITY DEFINER` `search_path` settings to make these calls resolve; keep extension references fully qualified.

Clean local Supabase runtime testing of migrations 001-012 proved anon PostgREST could bypass the projection and read internal `trails`/`trail_segments` columns under default public-schema ACLs. Migration 013 revokes direct base-table privileges from `PUBLIC`, `anon`, and `authenticated`, normalizes view privileges, grants only view `SELECT` to anon/authenticated, and preserves `service_role`. Since the view owner is expected to be `postgres`, public filtering now depends on the view's explicit verified-only predicates for both segment and parent trail.

## Private User Data Boundary

Profiles are public only when `is_public = true`; users own their private profile. Activities are authenticated owner-only. Completion rows are authenticated owner-only.

M7A authenticated completion privileges:
- `SELECT` own rows
- `DELETE` own rows
- column-level `INSERT` only on `user_id`, `segment_id`, `completed_on`, `notes`
- no authenticated `UPDATE`

The INSERT policy also requires:
- own `user_id`
- default/manual completion only
- no activity, evidence, or confidence fields
- verified published segment via `public.is_verified_published_segment(segment_id)`

## Completion Evidence Boundary

`completion_evidence` and activity matching tables remain service/admin controlled. Raw evidence JSON and provenance are not exposed to authenticated users. Migration 011 adds user-scoped stable `activity_key`/`evidence_key` identities, accepted-evidence immutability, and the invoker-rights service-role-only `load_reviewed_completion_evidence_batch` RPC. The loader persists owned activities and accepted private evidence only; it never creates `segment_completions`.

Authenticated activity mutation is column-limited: users cannot insert/update controlled `activity_key`, and cannot update `user_id`.

Migration 012 exposes no raw table access. `list_confirmable_completion_evidence()` returns only sanitized owner data. `confirm_completion_evidence(uuid)` derives ownership from `auth.uid()`, revalidates accepted GPS evidence and the verified segment/parent gate, locks publication rows, and inserts only a derived `gpx_match` completion after explicit confirmation. Evidence-backed `completed_on` comes only from validated immutable `provenance.activityDate`. Deleting/unmarking the completion does not consume evidence.

## Security Definer Helpers

Current narrow `SECURITY DEFINER` boundaries:
- `handle_new_auth_user_profile()` for auth trigger profile creation.
- `is_verified_published_segment(bigint)` for boolean segment eligibility inside completion INSERT RLS.
- `list_confirmable_completion_evidence()` for sanitized owner evidence reads.
- `confirm_completion_evidence(uuid)` for explicit owner confirmation.

They use fixed `search_path = ''` and fully qualified objects. The date validator is internal and revoked from application roles. Do not add broad helper frameworks.

M7D-C application code uses `CompletionEvidenceRepository` with the authenticated SSR Supabase client and no caller user ID. It calls only the two RPCs above, validates response shapes, preserves bigint segment IDs as strings, and exposes only the fixed sanitized projection. The confirmation action reads only `evidenceId`; all ownership, publication, date, and completion semantics remain database-derived. Manual mark/unmark and evidence confirmation refresh both `/` and `/account` as applicable.

## M7B Composition

Keep public trail reads separate from private completion reads:

```text
TrailRepository -> public TrailSegment[]
CompletionRepository -> current user's SegmentCompletion[]
applySegmentCompletions -> request-local completed flags
```

Do not join private completion state into `trail_segment_api`.

## Before Deployment

Static tests are not enough. Run live PostgreSQL/Supabase checks for RLS, grants, migration 011 loader behavior, accepted-evidence immutability, M7D-B ownership/enumeration/date/race/FK behavior, `SECURITY DEFINER` owner rights, and migration 013 owner-rights view behavior.

Migration 013 public-projection hardening has passed disposable local runtime acceptance.

Local acceptance included two clean migrations 001-013 bootstraps, verified
trail_segment_api ownership/reloptions and privilege boundaries, anon and
authenticated PostgREST isolation, service-role verified-publication loading,
and M7D-A reviewed-evidence materialization.

This acceptance was local/disposable only. Migration 003 has not successfully
applied to production, migrations 003-013 remain pending, and production
predeploy/deployment checks remain outstanding.
