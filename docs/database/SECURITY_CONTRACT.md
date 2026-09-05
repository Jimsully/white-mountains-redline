# Database Security Contract

The migrations remain authoritative. This document summarizes the repository security boundary after migrations 001 through 014. The historical migration-003 hosted PostGIS lookup failure was corrected; migrations 001-013 are deployed and accepted in production. Migration 014 is an additive projection-minimization hardening step pending normal reviewed deployment.

## Core Rules

- Public trail browsing does not require login.
- Private user state must be scoped to `auth.uid()`.
- GPS evidence is not completion.
- Strong GPS match is not completion.
- Accepted evidence is not completion.
- Only explicit user confirmation creates `segment_completions`.
- `service_role` keys are for controlled server-side/admin tooling only and must never be exposed to browser code.
- Hosted Supabase PostGIS lives in `extensions`; durable SQL must schema-qualify PostGIS functions and geometry types instead of depending on `search_path`.

## Public Trail Boundary

Public production trail data is available only through verified/human-reviewed rows:

- `trails.data_status = 'verified'`
- `trails.verification_status = 'human_verified'`
- `trail_segments.data_status = 'verified'`
- `trail_segments.verification_status = 'human_verified'`

Migration 008 recreates `trail_segment_api` as a verified-only view and grants `SELECT` on that view to `anon` and `authenticated`.

Clean local Supabase bootstrap/runtime inspection of migrations 001-012 proved the row-security gate passed but public projection isolation failed: default public-schema ACLs let anon/authenticated PostgREST requests hit `/rest/v1/trails` and `/rest/v1/trail_segments` directly and retrieve internal columns, including `verification_notes`, publication fingerprints, timestamps, and raw geometry. A synthetic internal `verification_notes` value was returned through anon PostgREST.

Migration 013 is the corrective boundary. It changes `trail_segment_api` to owner-rights with `security_invoker = false` and `security_barrier = true`, revokes all privileges on `trails`, `trail_segments`, and `trail_segment_api` from `PUBLIC`, `anon`, and `authenticated`, then grants only `SELECT` on `trail_segment_api` to `anon` and `authenticated`. It does not revoke `service_role`, alter default privileges, change table RLS policies, remove RLS, or change the view SELECT definition.

After migration 013, `trail_segment_api` is the only trail-network relation available to anon/authenticated application roles. Base `trails` and `trail_segments` are administrative/publication tables, not direct browser/API relations. Because the view owner is expected to be `postgres`, public filtering relies on the view's explicit verified-only predicates rather than base-table RLS during view execution.

Migration 014 retains that owner-rights/security-barrier/grant model and minimizes the view to the exact fields used by public rendering. Full provenance, source references and feature IDs, review timestamps, verification notes, and publication fingerprints are not browser-visible. The application repository also requests an explicit field allowlist and rejects any row outside the verified/human-verified gate as defense in depth.

## Profiles

Migration 009 revokes broad profile access and defines role-targeted policies:
- anon can select only public profiles.
- authenticated users can select their own profile and public profiles.
- authenticated users can insert/update only their own profile.
- authenticated users cannot delete profiles directly.

The auth trigger `handle_new_auth_user_profile()` is `SECURITY DEFINER` only because inserts originate from `auth.users`. Direct execution is revoked from public roles.

## Activities

Migration 009 makes activities owner-scoped through RLS. Migration 011 resets grants so authenticated users have table-level `SELECT`/`DELETE`, column-limited `INSERT` on user-owned activity fields, and column-limited `UPDATE` excluding `user_id` and controlled `activity_key`. Authenticated callers cannot forge or rewrite `activity-key-v2`; anon has no activity access. `service_role` retains deliberate loader privileges.

## Segment Completions

Migration 010 deliberately drops historical completion policies before creating final M7A policies, because PostgreSQL permissive RLS policies combine with OR semantics.

Authenticated users receive:
- table-level `SELECT`
- table-level `DELETE`
- column-level `INSERT` only on `user_id`, `segment_id`, `completed_on`, and `notes`

Authenticated users do not receive:
- table-level `INSERT`
- `UPDATE`
- insert privileges on `id`, `activity_id`, `completion_method`, `match_confidence`, `completion_evidence_id`, or `created_at`

The manual INSERT RLS policy requires:
- `auth.uid()` is not null
- `user_id = auth.uid()`
- `completion_method = 'manual'`
- `activity_id is null`
- `completion_evidence_id is null`
- `match_confidence is null`
- `public.is_verified_published_segment(segment_completions.segment_id)` returns true

The SELECT and DELETE policies require own rows only.

Duplicate completion protection remains the database unique constraint on `(user_id, segment_id)`.

## Verified Segment Helper

`public.is_verified_published_segment(target_segment_id bigint)` is:
- `LANGUAGE SQL`
- `STABLE`
- `SECURITY DEFINER`
- `SET search_path = ''`
- fully qualified
- read-only

It exists so authenticated users do not need broad base-table `SELECT` on `trails` and `trail_segments` merely to satisfy the completion authorization check. It exposes only a boolean for membership in the current verified/human-reviewed public network and accepts no user identity or completion provenance input.

Execution is revoked from `public`, `anon`, and `authenticated`, then granted explicitly to `authenticated`.

## Evidence Isolation

Migration 007 creates `completion_evidence`; migrations 009-012 keep raw evidence isolated:

- `revoke all on public.completion_evidence from public, anon, authenticated`
- related activity matching tables remain revoked from public roles
- `service_role` retains controlled access
- accepted evidence is protected from semantic update by migration 011
- nullable activity/match/segment FKs may only transition non-null to null for existing `ON DELETE SET NULL` cleanup

M7D-A can materialize reviewed private evidence through controlled tooling. Migration 012 does not grant authenticated table access to `completion_evidence`.

## Authenticated Evidence Confirmation RPCs

Migration 012 defines two user-facing `SECURITY DEFINER` functions with `SET search_path = ''` and fully qualified relations:

- `list_confirmable_completion_evidence()` derives identity only from `auth.uid()` and returns a fixed sanitized owner projection. It excludes raw evidence/provenance, geometry, matching internals, identifiers other than `evidence_id`/public segment identity, and any segment that already has an owner completion.
- `confirm_completion_evidence(uuid)` treats the UUID as an opaque lookup token, revalidates owner/activity/evidence/publication state, locks the verified segment and parent trail, and derives every completion field internally. It creates only `gpx_match` rows after explicit confirmation.

The immutable validated M7D-A `provenance.activityDate` snapshot is the sole source of evidence-backed `completed_on`; mutable activity dates and acceptance timestamps are not fallbacks. RPC execution is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then granted back only to `authenticated`. The internal date helper is revoked from every application role. Function-owner rights and all race/authorization behavior require live PostgreSQL verification before deployment.

Under the standard linked Supabase CLI `db push` path, migrations use the default `postgres` database role, so a clean migration 012 application is expected to create all three functions with `postgres` ownership. That role also created/owns the repository tables in a clean migration chain and therefore supplies the required table reads, completion insert, and row-lock authority. Custom `--db-url` roles, self-hosted ownership, or pre-existing function signatures can differ, so deployment must verify `pg_proc.proowner` and effective privileges rather than assuming this behavior.

M7D-C application and UI integration use only these two authenticated RPCs. Normal application code does not query `completion_evidence`, use `service_role`, or derive completion fields from browser input. The browser receives only the sanitized list projection and sends the opaque evidence UUID required for confirmation. Application authentication is defense in depth; database `auth.uid()` remains authoritative. Migrations 011/012 and database-backed M7D-C production acceptance are complete.

## Service-Controlled RPCs

Current service-role-only RPCs:
- `load_source_trail_feature_batch(jsonb, jsonb)`
- `load_verified_publication_batch(jsonb, jsonb, jsonb)`
- `load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb)`

These are controlled server-side/admin tooling. The M7D-A loader is invoker-rights, validates non-demo payloads, resolves verified production segment keys internally, compares stable identities without rewriting accepted rows, and returns safe counts only. Migration 011 explicitly grants `service_role` its required `public`/`extensions` schema usage, `activities` identity-sequence usage, `trails`/`trail_segments` reads, exact PostGIS function execution, and activity/evidence table mutations; it does not grant those loader dependencies to browser roles. Supabase `service_role` must retain its platform `BYPASSRLS` role property. These RPCs must not be callable from browsers.

## Predeployment Requirement

Static migration-contract tests are helpful, but they do not prove live PostgreSQL behavior. Before deployment, run actual PostgreSQL/Supabase tests for RLS policies, grants, column-level insert privileges, `SECURITY DEFINER` execution, view/base-table privilege behavior, and migration 014's exact public response columns.
