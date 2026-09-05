# Current Database Schema

This document summarizes the repository schema produced by migrations 001 through 014. The migrations in `supabase/migrations/` remain authoritative; this file is a durable orientation aid for future sessions. Production hosted Supabase recovered from the historical migration-003 PostGIS lookup failure. The documented linked project is aligned through migration 014 after two clean disposable acceptance passes, but it currently contains no trail rows and the live Vercel application still serves the old demo repository. Application rollout acceptance is pending production project/data/environment reconciliation.

Hosted Supabase PostGIS is installed in `extensions` for this project. Migrations and durable SQL functions must schema-qualify PostGIS functions and types with `extensions`, rather than depending on migration or runtime `search_path`.

## Core Production Tables

### `public.profiles`
User profile rows owned by `auth.users(id)`.

Columns: `id`, `username`, `display_name`, `is_public`, `created_at`, `updated_at`.

Current constraints from migration 009:
- `username` is optional and must match `^[a-z0-9][a-z0-9_-]{2,31}$` when present.
- `display_name` is optional and limited to 120 characters.
- `is_public` defaults to `false`.

### `public.trails`
Published trail identity. A row is public production data only when both:
- `data_status = 'verified'`
- `verification_status = 'human_verified'`

Important columns include `id`, `slug`, `name`, `region`, source labels, `data_status`, `verification_status`, `provenance`, `production_trail_key`, `reviewed_at`, `publication_run_id`, and `publication_artifact_fingerprint`.

### `public.trail_segments`
The atomic redline completion unit. A row is public production data only when the segment and its parent trail are both `verified` and `human_verified`.

Important columns include `id`, `trail_id`, `segment_key`, `segment_name`, `miles`, `geom`, source labels, `verification_notes`, `data_status`, `verification_status`, `provenance`, `source_feature_ids`, `geometry_manually_modified`, `reviewed_at`, `publication_run_id`, and `publication_artifact_fingerprint`.

### `public.trail_segment_api`
Read-only application projection for public trail segments. Migration 013 hardens it to owner-rights (`security_invoker = false`) with `security_barrier = true` after clean local Supabase runtime testing proved anon PostgREST could bypass the projection and read internal base-table columns on `trails` and `trail_segments` under default public-schema ACLs. Migration 014 recreates it with an exact public-safe column allowlist.

It exposes only `id`, `slug`, `segment_name`, `miles`, publication statuses, parent trail ID/slug/name/region, and GeoJSON-derived `coordinates`. Internal provenance, source feature IDs, review metadata, and publication fingerprints remain on protected base tables. Clients must not parse PostGIS WKB/hex from base tables.

Because the view owner is expected to be `postgres`, base-table RLS is no longer the public read boundary for this projection. Public filtering depends on the view's explicit predicates: segment and parent trail must both have `data_status = 'verified'` and `verification_status = 'human_verified'`.

### `public.activities`
Private user activity rows. They are owned by `auth.users(id)`.

Columns include `id`, `user_id`, nullable controlled `activity_key`, `title`, `activity_date`, `source`, optional `geom`, `distance_miles`, `trip_report_url`, `notes`, and `created_at`. Migration 011 adds partial uniqueness on `(user_id, activity_key)` when the key is present. Authenticated users retain owner-scoped SELECT/DELETE and column-limited INSERT/UPDATE, but cannot insert or update `activity_key` or update `user_id`; the controlled loader uses `service_role`.

### `public.segment_completions`
Durable user completion rows. Unique per `(user_id, segment_id)`.

Current columns:
- `id`
- `user_id` references `auth.users(id) on delete cascade`
- `segment_id` references `public.trail_segments(id) on delete cascade`
- `activity_id` references `public.activities(id) on delete set null`
- `completed_on`
- `completion_method` default `'manual'`, check in `manual`, `gpx_match`, `admin`
- `match_confidence`, constrained to null or `0..1`
- `notes`, constrained to null or `<= 1000` characters
- `created_at`
- `completion_evidence_id` references `public.completion_evidence(id) on delete no action`

M7A grants authenticated users only manual insert/delete/select under RLS. Authenticated `UPDATE` is not allowed.

## Source And Pipeline Tables

### `public.import_batches`
Staging import run metadata for raw source loads.

### `public.source_trail_features`
Raw source GIS feature rows. These are evidence/staging records, not production challenge segments. Current source rows include original properties, source URLs, optional query/record refs, geometry, reconciliation status, source length fields, and `gis_miles`.

### Reconciliation Workspace Tables
Migration 005 creates future persistence for trail-level reconciliation: `challenge_editions`, `challenge_inventory_items`, `reconciliation_candidates`, and `reconciliation_decisions`.

Accepted reconciliation is not a verified trail segment.

### Segment Construction Workspace Tables
Migration 006 creates future persistence for topology review: `segment_construction_runs`, `junction_candidates`, `segment_candidates`, `junction_review_decisions`, and `segment_review_decisions`.

Accepted segment-construction candidates are not production `trail_segments`.

### Activity Matching And Evidence Tables
Migration 007 creates service-controlled activity matching persistence: `activity_match_runs`, `activity_segment_match_candidates`, `activity_segment_match_review_decisions`, and `completion_evidence`.

GPS activity geometry is evidence, not canonical trail geometry. Strong candidates and accepted evidence do not create `segment_completions`.

Migration 011 implements M7D-A controlled materialization. It adds nullable `completion_evidence.evidence_key` with partial uniqueness on `(user_id, evidence_key)`, protects accepted evidence from semantic mutation while allowing existing FK links to transition non-null to null during `ON DELETE SET NULL` cleanup, and adds the invoker-rights service-role-only `load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb)` RPC. The loader persists only owned activities and accepted private evidence.

Migration 012 adds no tables or FKs. It defines the internal `validated_completion_evidence_activity_date(jsonb)` helper, the authenticated owner-only sanitized `list_confirmable_completion_evidence()` RPC, and the explicit owner-only `confirm_completion_evidence(uuid)` RPC. Confirmation derives `completed_on` only from validated immutable `provenance.activityDate` and creates a `gpx_match` completion only after explicit user action. Raw evidence remains unavailable through table privileges or RPC output.

### Publication Tables
Migration 008 creates `publication_runs` and service-role publication loading. Publication records the verified network load/fingerprint and does not create user completion rows.

## Current M7B Composition Architecture

The public trail repository remains separate from private user completion state. M7B composes data per request:

```text
public TrailRepository
  -> verified TrailSegment[]

authenticated CompletionRepository
  -> current user's SegmentCompletion[]

applySegmentCompletions()
  -> TrailSegment[] with completed flags for that request
```

Private completion state must not be joined into public trail API queries or shared caches.

## M7D Status

M7D-A controlled reviewed-evidence materialization is implemented in migration 011. M7D-B's database authorization boundary is implemented in migration 012. Migration 013 implements the public projection hardening boundary: anon/authenticated may select `trail_segment_api`, but have no direct table privileges on `trails` or `trail_segments`; `service_role` remains administrative. Migrations 011-013 are deployed. Raw `completion_evidence` remains isolated from normal authenticated table access; user-facing RPCs expose only fixed sanitized data.

Accepted evidence remains evidence until the owner explicitly invokes confirmation. M7D-C application integration uses an authenticated SSR repository with only the two M7D-B RPCs, and the account action submits only the opaque evidence UUID. No schema or relationship changed for M7D-C. Production database/account acceptance has passed. Migration 014 narrows `trail_segment_api` to the exact fields required by public map, directory, and detail rendering while retaining internal provenance on protected base tables.
