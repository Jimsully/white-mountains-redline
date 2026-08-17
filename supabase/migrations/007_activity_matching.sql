-- Future persistence for Milestone 4 activity-to-segment matching.
-- GPS activity geometry is evidence, not canonical trail geometry.
-- Strong candidates and accepted completion evidence do not write production segment_completions.

create table if not exists public.activity_match_runs (
  id uuid primary key default gen_random_uuid(),
  algorithm_version text not null,
  segment_construction_algorithm_version text not null,
  segment_artifact_ref text,
  segment_decisions_ref text,
  activity_source_ref text,
  provenance jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_segment_match_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.activity_match_runs(id) on delete cascade,
  activity_id bigint references public.activities(id) on delete set null,
  activity_key text not null,
  segment_candidate_key text not null,
  future_trail_segment_id bigint references public.trail_segments(id) on delete set null,
  match_key text not null,
  classification text not null check (classification in ('strong_candidate', 'candidate', 'needs_review', 'insufficient_coverage')),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'accepted', 'rejected', 'needs_review')),
  match_algorithm_version text not null,
  segment_construction_algorithm_version text not null,
  evidence jsonb not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, match_key),
  unique(run_id, activity_key, segment_candidate_key)
);

create table if not exists public.activity_segment_match_review_decisions (
  id uuid primary key default gen_random_uuid(),
  match_candidate_id uuid not null references public.activity_segment_match_candidates(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'rejected', 'needs_review')),
  notes text,
  reviewed_at timestamptz not null default now(),
  provenance jsonb not null default '{}'::jsonb
);

create table if not exists public.completion_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  match_candidate_id uuid references public.activity_segment_match_candidates(id) on delete set null,
  activity_id bigint references public.activities(id) on delete set null,
  segment_candidate_key text not null,
  future_trail_segment_id bigint references public.trail_segments(id) on delete set null,
  evidence_source text not null check (evidence_source in ('manual', 'historical_gps', 'gpx_import', 'connected_service')),
  evidence jsonb not null,
  accepted_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_match_runs enable row level security;
alter table public.activity_segment_match_candidates enable row level security;
alter table public.activity_segment_match_review_decisions enable row level security;
alter table public.completion_evidence enable row level security;

revoke all on public.activity_match_runs from public, anon, authenticated;
revoke all on public.activity_segment_match_candidates from public, anon, authenticated;
revoke all on public.activity_segment_match_review_decisions from public, anon, authenticated;
revoke all on public.completion_evidence from public, anon, authenticated;

grant select, insert, update, delete on public.activity_match_runs to service_role;
grant select, insert, update, delete on public.activity_segment_match_candidates to service_role;
grant select, insert, update, delete on public.activity_segment_match_review_decisions to service_role;
grant select, insert, update, delete on public.completion_evidence to service_role;