# Codex Database Context

Read this at the start of future database work. Migrations in `supabase/migrations/` are authoritative.

## Current State

Migrations 001-011 define the current database. M7A introduced the authenticated manual completion database boundary. M7B composes per-user completions into public trail segments at request time. M7C browser/map selection is complete and adds no database behavior. M7D-A now provides controlled reviewed-evidence materialization. M7D-B sanitized evidence read/confirmation RPCs and M7D-C evidence UI are future work.

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

`trail_segment_api` is the app read projection. It is verified-only and returns GeoJSON coordinates. It is `security_invoker`.

Outstanding audit: migrations grant anon/authenticated `SELECT` on `trail_segment_api`, but not explicit base-table `SELECT` on `trails` / `trail_segments`. Clean-bootstrap privilege behavior must be tested before deployment.

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

Authenticated activity mutation is column-limited: users cannot insert/update controlled `activity_key`, and cannot update `user_id`. M7D-B/C user evidence exposure and confirmation are not current schema.

## Security Definer Helpers

Current narrow `SECURITY DEFINER` helpers:
- `handle_new_auth_user_profile()` for auth trigger profile creation.
- `is_verified_published_segment(bigint)` for boolean segment eligibility inside completion INSERT RLS.

Both use fixed `search_path = ''` and fully qualified objects. Do not add broad helper frameworks.

## M7B Composition

Keep public trail reads separate from private completion reads:

```text
TrailRepository -> public TrailSegment[]
CompletionRepository -> current user's SegmentCompletion[]
applySegmentCompletions -> request-local completed flags
```

Do not join private completion state into `trail_segment_api`.

## Before Deployment

Static tests are not enough. Run live PostgreSQL/Supabase checks for RLS, grants, column-level activity privileges, migration 011 invoker-rights loader execution/atomicity/idempotency, accepted-evidence trigger behavior, `SECURITY DEFINER` execution, and `security_invoker` view behavior.
