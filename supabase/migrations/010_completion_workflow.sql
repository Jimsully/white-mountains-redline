-- Milestone 7A: authenticated manual SegmentCompletion boundary.
-- GPS/activity evidence remains evidence only; evidence promotion RPCs are not
-- introduced in this migration.

alter table public.segment_completions
  add column if not exists completion_evidence_id uuid
    references public.completion_evidence(id)
    on delete no action;

create unique index if not exists segment_completions_completion_evidence_id_key
  on public.segment_completions(completion_evidence_id)
  where completion_evidence_id is not null;

alter table public.segment_completions
  drop constraint if exists segment_completions_match_confidence_range_chk;

alter table public.segment_completions
  add constraint segment_completions_match_confidence_range_chk
  check (match_confidence is null or (match_confidence between 0 and 1));

alter table public.segment_completions
  drop constraint if exists segment_completions_notes_length_chk;

alter table public.segment_completions
  add constraint segment_completions_notes_length_chk
  check (notes is null or char_length(notes) <= 1000);

alter table public.segment_completions enable row level security;

-- SECURITY DEFINER is intentionally narrow here: normal authenticated users
-- should not need base-table SELECT on trails/trail_segments merely to satisfy
-- this completion authorization check. The function exposes only a boolean for
-- membership in the verified human-reviewed public network, performs no writes,
-- uses a fixed search_path with fully-qualified objects, and accepts no user or
-- completion provenance inputs.
create or replace function public.is_verified_published_segment(target_segment_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trail_segments s
    join public.trails t on t.id = s.trail_id
    where s.id = target_segment_id
      and s.data_status = 'verified'
      and s.verification_status = 'human_verified'
      and t.data_status = 'verified'
      and t.verification_status = 'human_verified'
  );
$$;

revoke execute on function public.is_verified_published_segment(bigint) from public;
revoke execute on function public.is_verified_published_segment(bigint) from anon;
revoke execute on function public.is_verified_published_segment(bigint) from authenticated;
grant execute on function public.is_verified_published_segment(bigint) to authenticated;
-- Drop every historical or M7-draft completion policy name so permissive RLS
-- policies cannot combine into a broader effective authorization state.
drop policy if exists "users read own completions" on public.segment_completions;
drop policy if exists "users create own completions" on public.segment_completions;
drop policy if exists "users update own completions" on public.segment_completions;
drop policy if exists "users delete own completions" on public.segment_completions;
drop policy if exists "authenticated can read own completions" on public.segment_completions;
drop policy if exists "authenticated can manually create own completions" on public.segment_completions;
drop policy if exists "authenticated can delete own completions" on public.segment_completions;

revoke all on public.segment_completions from public, anon, authenticated;
grant select, delete on public.segment_completions to authenticated;
grant insert (user_id, segment_id, completed_on, notes)
  on public.segment_completions
  to authenticated;
grant select, insert, update, delete on public.segment_completions to service_role;

create policy "authenticated can read own completions"
  on public.segment_completions
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy "authenticated can manually create own completions"
  on public.segment_completions
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and completion_method = 'manual'
    and activity_id is null
    and completion_evidence_id is null
    and match_confidence is null
    and public.is_verified_published_segment(
      segment_completions.segment_id
    )
  );

create policy "authenticated can delete own completions"
  on public.segment_completions
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

-- M7A intentionally keeps completion evidence isolated from normal
-- authenticated table access. Evidence confirmation/read RPCs are deferred.
revoke all on public.activity_match_runs from public, anon, authenticated;
revoke all on public.activity_segment_match_candidates from public, anon, authenticated;
revoke all on public.activity_segment_match_review_decisions from public, anon, authenticated;
revoke all on public.completion_evidence from public, anon, authenticated;