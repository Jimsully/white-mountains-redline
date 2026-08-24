-- Milestone 7D-B: authenticated evidence confirmation boundary.
-- Accepted evidence remains evidence until the owning user explicitly confirms it.

create or replace function public.validated_completion_evidence_activity_date(evidence_provenance jsonb)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  activity_date_text text;
begin
  if jsonb_typeof(evidence_provenance) is distinct from 'object'
    or jsonb_typeof(evidence_provenance->'activityDate') is distinct from 'string' then
    return null;
  end if;

  activity_date_text := evidence_provenance->>'activityDate';
  if activity_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;

  begin
    return activity_date_text::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return null;
  end;
end;
$$;

revoke execute on function public.validated_completion_evidence_activity_date(jsonb) from public;
revoke execute on function public.validated_completion_evidence_activity_date(jsonb) from anon;
revoke execute on function public.validated_completion_evidence_activity_date(jsonb) from authenticated;
revoke execute on function public.validated_completion_evidence_activity_date(jsonb) from service_role;

comment on function public.validated_completion_evidence_activity_date(jsonb) is
  'Internal validator for the immutable M7D-A provenance.activityDate snapshot used by evidence-backed completion dates.';

create or replace function public.list_confirmable_completion_evidence()
returns table (
  evidence_id uuid,
  segment_id bigint,
  trail_name text,
  segment_name text,
  region text,
  evidence_source text,
  accepted_at timestamptz,
  activity_title text,
  activity_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ce.id as evidence_id,
    s.id as segment_id,
    t.name as trail_name,
    s.segment_name,
    t.region,
    ce.evidence_source,
    ce.accepted_at,
    a.title as activity_title,
    validated.activity_date
  from public.completion_evidence ce
  join public.trail_segments s on s.id = ce.future_trail_segment_id
  join public.trails t on t.id = s.trail_id
  left join public.activities a
    on a.id = ce.activity_id
    and a.user_id = (select auth.uid())
  cross join lateral (
    select public.validated_completion_evidence_activity_date(ce.provenance) as activity_date
  ) validated
  where (select auth.uid()) is not null
    and ce.user_id = (select auth.uid())
    and ce.accepted_at is not null
    and ce.future_trail_segment_id is not null
    and ce.evidence_source in ('historical_gps', 'gpx_import', 'connected_service')
    and validated.activity_date is not null
    and (ce.activity_id is null or a.id is not null)
    and s.data_status = 'verified'
    and s.verification_status = 'human_verified'
    and t.data_status = 'verified'
    and t.verification_status = 'human_verified'
    and not exists (
      select 1
      from public.segment_completions sc
      where sc.user_id = (select auth.uid())
        and sc.segment_id = ce.future_trail_segment_id
    )
  order by validated.activity_date desc, ce.accepted_at desc, ce.id;
$$;

revoke execute on function public.list_confirmable_completion_evidence() from public;
revoke execute on function public.list_confirmable_completion_evidence() from anon;
revoke execute on function public.list_confirmable_completion_evidence() from authenticated;
revoke execute on function public.list_confirmable_completion_evidence() from service_role;
grant execute on function public.list_confirmable_completion_evidence() to authenticated;

comment on function public.list_confirmable_completion_evidence() is
  'Authenticated owner-only sanitized M7D-B evidence projection. Raw evidence, provenance, geometry, and matching internals remain private.';

create or replace function public.confirm_completion_evidence(target_evidence_id uuid)
returns table (
  status text,
  segment_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_evidence_id uuid;
  evidence_segment_id bigint;
  evidence_activity_id bigint;
  immutable_activity_date date;
  existing_completion_segment_id bigint;
  existing_completion_evidence_id uuid;
  locked_segment_id bigint;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    status := 'not_confirmable';
    segment_id := null;
    return next;
    return;
  end if;

  select
    ce.id,
    ce.future_trail_segment_id,
    ce.activity_id,
    public.validated_completion_evidence_activity_date(ce.provenance)
  into
    owned_evidence_id,
    evidence_segment_id,
    evidence_activity_id,
    immutable_activity_date
  from public.completion_evidence ce
  left join public.activities a
    on a.id = ce.activity_id
    and a.user_id = current_user_id
  where ce.id = target_evidence_id
    and ce.user_id = current_user_id
    and ce.accepted_at is not null
    and ce.future_trail_segment_id is not null
    and ce.evidence_source in ('historical_gps', 'gpx_import', 'connected_service')
    and public.validated_completion_evidence_activity_date(ce.provenance) is not null
    and (ce.activity_id is null or a.id is not null);

  if owned_evidence_id is null then
    status := 'not_confirmable';
    segment_id := null;
    return next;
    return;
  end if;

  existing_completion_segment_id := null;
  existing_completion_evidence_id := null;
  select sc.segment_id, sc.completion_evidence_id
  into existing_completion_segment_id, existing_completion_evidence_id
  from public.segment_completions sc
  where sc.user_id = current_user_id
    and sc.segment_id = evidence_segment_id
  for update;

  if found then
    if existing_completion_evidence_id is not distinct from owned_evidence_id then
      status := 'already_confirmed';
    else
      status := 'already_completed';
    end if;
    segment_id := evidence_segment_id;
    return next;
    return;
  end if;

  locked_segment_id := null;
  select s.id
  into locked_segment_id
  from public.trail_segments s
  join public.trails t on t.id = s.trail_id
  where s.id = evidence_segment_id
    and s.data_status = 'verified'
    and s.verification_status = 'human_verified'
    and t.data_status = 'verified'
    and t.verification_status = 'human_verified'
  for share of s, t;

  if locked_segment_id is null then
    status := 'not_confirmable';
    segment_id := null;
    return next;
    return;
  end if;

  begin
    insert into public.segment_completions(
      user_id,
      segment_id,
      activity_id,
      completed_on,
      completion_method,
      match_confidence,
      notes,
      completion_evidence_id
    )
    values (
      current_user_id,
      evidence_segment_id,
      evidence_activity_id,
      immutable_activity_date,
      'gpx_match',
      null,
      null,
      owned_evidence_id
    );

    status := 'confirmed';
    segment_id := evidence_segment_id;
    return next;
    return;
  exception
    when unique_violation then
      existing_completion_segment_id := null;
      existing_completion_evidence_id := null;
      select sc.segment_id, sc.completion_evidence_id
      into existing_completion_segment_id, existing_completion_evidence_id
      from public.segment_completions sc
      where sc.user_id = current_user_id
        and (
          sc.segment_id = evidence_segment_id
          or sc.completion_evidence_id = owned_evidence_id
        )
      order by case when sc.segment_id = evidence_segment_id then 0 else 1 end
      limit 1
      for update;

      if found
        and existing_completion_segment_id = evidence_segment_id
        and existing_completion_evidence_id is not distinct from owned_evidence_id then
        status := 'already_confirmed';
        segment_id := evidence_segment_id;
        return next;
        return;
      end if;
      if found and existing_completion_segment_id = evidence_segment_id then
        status := 'already_completed';
        segment_id := evidence_segment_id;
        return next;
        return;
      end if;

      raise exception 'Evidence confirmation failed.';
    when foreign_key_violation then
      status := 'not_confirmable';
      segment_id := null;
      return next;
      return;
  end;
end;
$$;

revoke execute on function public.confirm_completion_evidence(uuid) from public;
revoke execute on function public.confirm_completion_evidence(uuid) from anon;
revoke execute on function public.confirm_completion_evidence(uuid) from authenticated;
revoke execute on function public.confirm_completion_evidence(uuid) from service_role;
grant execute on function public.confirm_completion_evidence(uuid) to authenticated;

comment on function public.confirm_completion_evidence(uuid) is
  'Explicit authenticated M7D-B confirmation boundary. Derives an owner-scoped gpx_match completion from accepted private evidence without exposing raw evidence.';
