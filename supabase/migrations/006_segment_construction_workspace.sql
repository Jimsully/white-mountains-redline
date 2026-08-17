-- Future persistence for Milestone 3 segment-construction review.
-- Accepted reconciliation, proposed junctions, and accepted segment-construction
-- candidates are not production trail_segments and are not human-verified completion units.

create table if not exists public.segment_construction_runs (
  id uuid primary key default gen_random_uuid(),
  algorithm_version text not null,
  reconciliation_artifact_ref text,
  decisions_ref text,
  source_feature_ids text[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.junction_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.segment_construction_runs(id) on delete cascade,
  candidate_key text not null,
  reasons text[] not null,
  review_status text not null default 'proposed' check (review_status in ('proposed', 'accepted', 'rejected', 'needs_review')),
  participating_inventory_item_keys text[] not null default '{}',
  participating_trail_normalized_names text[] not null default '{}',
  source_feature_ids text[] not null default '{}',
  geometry geometry(Point, 4326) not null,
  raw_detected_points jsonb not null default '[]'::jsonb,
  maximum_cluster_spread_meters numeric,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, candidate_key)
);

create table if not exists public.segment_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.segment_construction_runs(id) on delete cascade,
  candidate_key text not null,
  parent_inventory_item_key text not null,
  trail_display_name text not null,
  trail_normalized_name text not null,
  start_junction_key text not null,
  end_junction_key text not null,
  review_status text not null default 'proposed' check (review_status in ('proposed', 'accepted', 'rejected', 'needs_review')),
  calculated_miles numeric not null,
  source_provider text not null,
  source_feature_ids text[] not null default '{}',
  geometry geometry(LineString, 4326) not null,
  source_reconciliation jsonb not null default '{}'::jsonb,
  geometry_modification jsonb not null default '{}'::jsonb,
  warning_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(run_id, candidate_key)
);

create table if not exists public.junction_review_decisions (
  id uuid primary key default gen_random_uuid(),
  junction_candidate_id uuid not null references public.junction_candidates(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'rejected', 'needs_review')),
  notes text,
  reviewed_at timestamptz not null default now(),
  provenance jsonb not null default '{}'::jsonb
);

create table if not exists public.segment_review_decisions (
  id uuid primary key default gen_random_uuid(),
  segment_candidate_id uuid not null references public.segment_candidates(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'rejected', 'needs_review')),
  notes text,
  reviewed_at timestamptz not null default now(),
  provenance jsonb not null default '{}'::jsonb
);

alter table public.segment_construction_runs enable row level security;
alter table public.junction_candidates enable row level security;
alter table public.segment_candidates enable row level security;
alter table public.junction_review_decisions enable row level security;
alter table public.segment_review_decisions enable row level security;

revoke all on public.segment_construction_runs from anon, authenticated;
revoke all on public.junction_candidates from anon, authenticated;
revoke all on public.segment_candidates from anon, authenticated;
revoke all on public.junction_review_decisions from anon, authenticated;
revoke all on public.segment_review_decisions from anon, authenticated;