# Database Security Contract

The migrations remain authoritative. This document summarizes the intended current security boundary after migrations 001 through 010.

## Core Rules

- Public trail browsing does not require login.
- Private user state must be scoped to `auth.uid()`.
- GPS evidence is not completion.
- Strong GPS match is not completion.
- Accepted evidence is not completion.
- Only explicit user confirmation creates `segment_completions`.
- `service_role` keys are for controlled server-side/admin tooling only and must never be exposed to browser code.

## Public Trail Boundary

Public production trail data is available only through verified/human-reviewed rows:

- `trails.data_status = 'verified'`
- `trails.verification_status = 'human_verified'`
- `trail_segments.data_status = 'verified'`
- `trail_segments.verification_status = 'human_verified'`

Migration 008 recreates `trail_segment_api` as a verified-only `security_invoker` view and grants `SELECT` on that view to `anon` and `authenticated`.

Outstanding audit: clean-bootstrap behavior for `trail_segment_api` needs review because the view is `security_invoker` and migrations grant `SELECT` on the view, but do not explicitly grant anon/authenticated `SELECT` on base `trails` and `trail_segments`.

## Profiles

Migration 009 revokes broad profile access and defines role-targeted policies:
- anon can select only public profiles.
- authenticated users can select their own profile and public profiles.
- authenticated users can insert/update only their own profile.
- authenticated users cannot delete profiles directly.

The auth trigger `handle_new_auth_user_profile()` is `SECURITY DEFINER` only because inserts originate from `auth.users`. Direct execution is revoked from public roles.

## Activities

Migration 009 makes activities authenticated-owner-only:
- authenticated users can select/insert/update/delete only their own rows.
- update policies include both `USING` and `WITH CHECK`.
- anon has no activity access.

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

Migration 007 creates `completion_evidence`, but migration 009 and 010 keep raw evidence isolated:

- `revoke all on public.completion_evidence from public, anon, authenticated`
- related activity matching tables are also revoked from public roles
- service_role retains controlled access

M7D evidence confirmation is future work, not current schema.

## Service-Controlled RPCs

Current service-role-only RPCs:
- `load_source_trail_feature_batch(jsonb, jsonb)`
- `load_verified_publication_batch(jsonb, jsonb, jsonb)`

Both are controlled server-side/admin tooling. They must not be callable from browsers.

## Predeployment Requirement

Static migration-contract tests are helpful, but they do not prove live PostgreSQL behavior. Before deployment, run actual PostgreSQL/Supabase tests for RLS policies, grants, column-level insert privileges, `SECURITY DEFINER` execution, and view/base-table privilege behavior.