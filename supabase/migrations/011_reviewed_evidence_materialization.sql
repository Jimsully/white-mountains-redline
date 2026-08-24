-- Milestone 7D-A: controlled reviewed GPS evidence materialization.
-- Accepted evidence remains private evidence and never creates segment_completions.
-- The service-role key is only for controlled server-side/admin tooling and must
-- never be exposed to browser code.

alter table public.activities
  add column if not exists activity_key text;

create unique index if not exists activities_user_activity_key_key
  on public.activities(user_id, activity_key)
  where activity_key is not null;

alter table public.completion_evidence
  add column if not exists evidence_key text;

create unique index if not exists completion_evidence_user_evidence_key_key
  on public.completion_evidence(user_id, evidence_key)
  where evidence_key is not null;

-- Preserve owner RLS from migration 009 while preventing normal authenticated
-- callers from forging or rewriting controlled importer identities.
revoke all on public.activities from public, anon, authenticated;
grant select, delete on public.activities to authenticated;
grant insert (
  user_id,
  title,
  activity_date,
  source,
  geom,
  distance_miles,
  trip_report_url,
  notes
) on public.activities to authenticated;
grant update (
  title,
  activity_date,
  source,
  geom,
  distance_miles,
  trip_report_url,
  notes
) on public.activities to authenticated;
grant select, insert, update, delete on public.activities to service_role;

-- Raw evidence remains isolated from browser roles.
revoke all on public.completion_evidence from public, anon, authenticated;
grant select, insert, update, delete on public.completion_evidence to service_role;

-- The loader is invoker-rights. Make every privilege it requires explicit
-- instead of relying on Supabase project default grants.
grant usage on schema public, extensions to service_role;
grant usage, select on sequence public.activities_id_seq to service_role;
grant select on public.trails, public.trail_segments to service_role;
grant execute on function extensions.st_setsrid(extensions.geometry, integer) to service_role;
grant execute on function extensions.st_geomfromgeojson(text) to service_role;
grant execute on function extensions.geometrytype(extensions.geometry) to service_role;
grant execute on function extensions.st_isempty(extensions.geometry) to service_role;
grant execute on function extensions.st_isvalid(extensions.geometry) to service_role;
grant execute on function extensions.st_equals(extensions.geometry, extensions.geometry) to service_role;
create or replace function public.protect_accepted_completion_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.accepted_at is not null then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.evidence_key is distinct from old.evidence_key
      or new.segment_candidate_key is distinct from old.segment_candidate_key
      or new.evidence_source is distinct from old.evidence_source
      or new.evidence is distinct from old.evidence
      or new.provenance is distinct from old.provenance
      or new.accepted_at is distinct from old.accepted_at
      or new.created_at is distinct from old.created_at then
      raise exception 'Accepted completion evidence is immutable.';
    end if;

    if new.activity_id is distinct from old.activity_id
      and not (old.activity_id is not null and new.activity_id is null) then
      raise exception 'Accepted completion evidence activity identity cannot be relinked.';
    end if;
    if new.match_candidate_id is distinct from old.match_candidate_id
      and not (old.match_candidate_id is not null and new.match_candidate_id is null) then
      raise exception 'Accepted completion evidence match identity cannot be relinked.';
    end if;
    if new.future_trail_segment_id is distinct from old.future_trail_segment_id
      and not (old.future_trail_segment_id is not null and new.future_trail_segment_id is null) then
      raise exception 'Accepted completion evidence segment identity cannot be relinked.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_accepted_completion_evidence() from public;
revoke execute on function public.protect_accepted_completion_evidence() from anon;
revoke execute on function public.protect_accepted_completion_evidence() from authenticated;

drop trigger if exists completion_evidence_protect_accepted on public.completion_evidence;
create trigger completion_evidence_protect_accepted
  before update on public.completion_evidence
  for each row
  execute function public.protect_accepted_completion_evidence();

create or replace function public.load_reviewed_completion_evidence_batch(
  target_user_id uuid,
  run_payload jsonb,
  activities_payload jsonb,
  evidence_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  activity_item jsonb;
  evidence_item jsonb;
  line_item jsonb;
  position_item jsonb;
  longitude double precision;
  latitude double precision;
  expected_activity_geom extensions.geometry(MultiLineString, 4326);
  existing_activity_id bigint;
  resolved_activity_id bigint;
  resolved_segment_id bigint;
  existing_evidence_id uuid;
  activities_created integer := 0;
  activities_reused integer := 0;
  evidence_created integer := 0;
  evidence_already_loaded integer := 0;
begin
  if target_user_id is null then
    raise exception 'Reviewed evidence load requires a target auth user UUID.';
  end if;
  if jsonb_typeof(run_payload) is distinct from 'object'
    or jsonb_typeof(activities_payload) is distinct from 'array'
    or jsonb_typeof(evidence_payload) is distinct from 'array' then
    raise exception 'Reviewed evidence load payload has an invalid shape.';
  end if;
  if run_payload->>'loader_schema_version' is distinct from 'reviewed-evidence-loader-v1'
    or run_payload->>'evidence_key_version' is distinct from 'evidence-key-v1' then
    raise exception 'Reviewed evidence load version is missing or unsupported.';
  end if;
  if jsonb_typeof(run_payload->'demo_only') is distinct from 'boolean'
    or jsonb_typeof(run_payload->'source_artifact') is distinct from 'object'
    or jsonb_typeof(run_payload->'source_artifact'->'demoOnly') is distinct from 'boolean'
    or coalesce((run_payload->>'demo_only')::boolean, true)
    or coalesce((run_payload->'source_artifact'->>'demoOnly')::boolean, true) then
    raise exception 'Demo activity matching artifacts must not be materialized.';
  end if;
  if nullif(run_payload->>'activity_matching_algorithm_version', '') is null
    or nullif(run_payload->'source_artifact'->>'generatedAt', '') is null
    or run_payload->'source_artifact'->>'algorithmVersion' is distinct from run_payload->>'activity_matching_algorithm_version' then
    raise exception 'Reviewed evidence load algorithm identity is incomplete or inconsistent.';
  end if;
  if coalesce(run_payload->>'artifact_fingerprint', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Reviewed evidence load requires a canonical SHA-256 artifact fingerprint.';
  end if;

  if (select count(*) from jsonb_array_elements(activities_payload))
    <> (select count(distinct item->>'activity_key') from jsonb_array_elements(activities_payload) as payload(item)) then
    raise exception 'Reviewed evidence load contains duplicate activity keys.';
  end if;
  if (select count(*) from jsonb_array_elements(evidence_payload))
    <> (select count(distinct item->>'evidence_key') from jsonb_array_elements(evidence_payload) as payload(item)) then
    raise exception 'Reviewed evidence load contains duplicate evidence keys.';
  end if;

  for activity_item in select * from jsonb_array_elements(activities_payload) loop
    if jsonb_typeof(activity_item) is distinct from 'object'
      or activity_item ? 'user_id'
      or jsonb_typeof(activity_item->'activity_key') is distinct from 'string'
      or nullif(activity_item->>'activity_key', '') is null then
      raise exception 'Activity payload has an invalid or caller-controlled identity.';
    end if;
    if activity_item->>'source' is null
      or activity_item->>'source' not in ('gpx', 'strava', 'other') then
      raise exception 'Activity % has unsupported source.', activity_item->>'activity_key';
    end if;
    if (activity_item ? 'title' and jsonb_typeof(activity_item->'title') not in ('string', 'null'))
      or (activity_item ? 'activity_date' and jsonb_typeof(activity_item->'activity_date') not in ('string', 'null'))
      or (activity_item ? 'distance_miles' and jsonb_typeof(activity_item->'distance_miles') not in ('number', 'null')) then
      raise exception 'Activity % has malformed scalar fields.', activity_item->>'activity_key';
    end if;
    if jsonb_typeof(activity_item->'geometry') is distinct from 'object'
      or activity_item->'geometry'->>'type' is distinct from 'MultiLineString'
      or jsonb_typeof(activity_item->'geometry'->'coordinates') is distinct from 'array'
      or jsonb_array_length(activity_item->'geometry'->'coordinates') = 0 then
      raise exception 'Activity % requires MultiLineString geometry.', activity_item->>'activity_key';
    end if;

    for line_item in select * from jsonb_array_elements(activity_item->'geometry'->'coordinates') loop
      if jsonb_typeof(line_item) is distinct from 'array' or jsonb_array_length(line_item) < 2 then
        raise exception 'Activity % has a malformed trace component.', activity_item->>'activity_key';
      end if;
      for position_item in select * from jsonb_array_elements(line_item) loop
        if jsonb_typeof(position_item) is distinct from 'array'
          or jsonb_array_length(position_item) <> 2
          or jsonb_typeof(position_item->0) is distinct from 'number'
          or jsonb_typeof(position_item->1) is distinct from 'number' then
          raise exception 'Activity % requires two-dimensional numeric coordinates.', activity_item->>'activity_key';
        end if;
        longitude := (position_item->>0)::double precision;
        latitude := (position_item->>1)::double precision;
        if longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90 then
          raise exception 'Activity % has a coordinate outside longitude/latitude bounds.', activity_item->>'activity_key';
        end if;
      end loop;
    end loop;

    expected_activity_geom := extensions.st_setsrid(
      extensions.st_geomfromgeojson((activity_item->'geometry')::text),
      4326
    );
    if expected_activity_geom is null
      or extensions.geometrytype(expected_activity_geom) <> 'MULTILINESTRING'
      or extensions.st_isempty(expected_activity_geom)
      or not extensions.st_isvalid(expected_activity_geom) then
      raise exception 'Activity % geometry is invalid.', activity_item->>'activity_key';
    end if;
    if nullif(activity_item->>'distance_miles', '') is not null
      and ((activity_item->>'distance_miles')::numeric < 0 or (activity_item->>'distance_miles')::numeric > 99999.999) then
      raise exception 'Activity % distance is outside the supported range.', activity_item->>'activity_key';
    end if;

    existing_activity_id := null;
    select a.id into existing_activity_id
    from public.activities a
    where a.user_id = target_user_id
      and a.activity_key = activity_item->>'activity_key';

    if existing_activity_id is null then
      insert into public.activities(
        user_id,
        activity_key,
        title,
        activity_date,
        source,
        geom,
        distance_miles,
        trip_report_url,
        notes
      )
      values (
        target_user_id,
        activity_item->>'activity_key',
        activity_item->>'title',
        nullif(activity_item->>'activity_date', '')::date,
        activity_item->>'source',
        expected_activity_geom,
        nullif(activity_item->>'distance_miles', '')::numeric,
        null,
        null
      );
      activities_created := activities_created + 1;
    else
      perform 1
      from public.activities a
      where a.id = existing_activity_id
        and a.user_id = target_user_id
        and a.activity_key = activity_item->>'activity_key'
        and a.title is not distinct from activity_item->>'title'
        and a.activity_date is not distinct from nullif(activity_item->>'activity_date', '')::date
        and a.source = activity_item->>'source'
        and a.geom is not null
        and extensions.st_equals(a.geom, expected_activity_geom)
        and a.distance_miles is not distinct from nullif(activity_item->>'distance_miles', '')::numeric
        and a.trip_report_url is null
        and a.notes is null;
      if not found then
        raise exception 'Activity identity conflict for %.', activity_item->>'activity_key';
      end if;
      activities_reused := activities_reused + 1;
    end if;
  end loop;

  for evidence_item in select * from jsonb_array_elements(evidence_payload) loop
    if jsonb_typeof(evidence_item) is distinct from 'object'
      or evidence_item ? 'user_id'
      or jsonb_typeof(evidence_item->'evidence_key') is distinct from 'string'
      or jsonb_typeof(evidence_item->'activity_key') is distinct from 'string'
      or jsonb_typeof(evidence_item->'segment_key') is distinct from 'string'
      or jsonb_typeof(evidence_item->'match_key') is distinct from 'string'
      or coalesce(evidence_item->>'evidence_key', '') !~ '^evidence_[0-9a-f]{64}$'
      or nullif(evidence_item->>'activity_key', '') is null
      or nullif(evidence_item->>'segment_key', '') is null
      or nullif(evidence_item->>'match_key', '') is null then
      raise exception 'Completion evidence identity is incomplete or caller-controlled.';
    end if;
    if evidence_item->>'decision' is distinct from 'accepted'
      or evidence_item->>'evidence_source' is distinct from 'historical_gps'
      or jsonb_typeof(evidence_item->'evidence') is distinct from 'object'
      or jsonb_typeof(evidence_item->'provenance') is distinct from 'object' then
      raise exception 'Completion evidence % is not validated accepted historical GPS evidence.', evidence_item->>'evidence_key';
    end if;
    if jsonb_typeof(evidence_item->'accepted_at') is distinct from 'string'
      or nullif(evidence_item->>'accepted_at', '') is null then
      raise exception 'Completion evidence % is missing accepted_at.', evidence_item->>'evidence_key';
    end if;
    if evidence_item->'provenance'->>'loaderSchemaVersion' is distinct from 'reviewed-evidence-loader-v1'
      or evidence_item->'provenance'->>'artifactFingerprint' is distinct from run_payload->>'artifact_fingerprint'
      or evidence_item->'provenance'->>'matchKey' is distinct from evidence_item->>'match_key'
      or evidence_item->'provenance'->>'activityKey' is distinct from evidence_item->>'activity_key'
      or evidence_item->'provenance'->>'segmentKey' is distinct from evidence_item->>'segment_key'
      or evidence_item->'provenance'->>'activityMatchingAlgorithmVersion' is distinct from run_payload->>'activity_matching_algorithm_version'
      or evidence_item->'provenance'->>'activityMatchingAlgorithmVersion' is distinct from evidence_item->'evidence'->>'activityMatchingAlgorithmVersion'
      or evidence_item->'provenance'->>'segmentConstructionAlgorithmVersion' is distinct from evidence_item->'evidence'->>'segmentConstructionAlgorithmVersion'
      or nullif(evidence_item->'provenance'->>'classification', '') is null
      or evidence_item->'provenance'->'reviewDecision'->>'status' is distinct from 'accepted'
      or (evidence_item->'provenance'->'reviewDecision'->>'reviewTimestamp')::timestamptz
        is distinct from (evidence_item->>'accepted_at')::timestamptz then
      raise exception 'Completion evidence % provenance is inconsistent.', evidence_item->>'evidence_key';
    end if;

    resolved_activity_id := null;
    select a.id into resolved_activity_id
    from public.activities a
    where a.user_id = target_user_id
      and a.activity_key = evidence_item->>'activity_key';
    if resolved_activity_id is null then
      raise exception 'Completion evidence % references unknown owned activity %.', evidence_item->>'evidence_key', evidence_item->>'activity_key';
    end if;

    perform 1
    from public.activities a
    where a.id = resolved_activity_id
      and a.activity_date::text is not distinct from evidence_item->'provenance'->>'activityDate';
    if not found then
      raise exception 'Completion evidence % activity-date snapshot is inconsistent.', evidence_item->>'evidence_key';
    end if;

    resolved_segment_id := null;
    select s.id into resolved_segment_id
    from public.trail_segments s
    join public.trails t on t.id = s.trail_id
    where s.segment_key = evidence_item->>'segment_key'
      and s.data_status = 'verified'
      and s.verification_status = 'human_verified'
      and t.data_status = 'verified'
      and t.verification_status = 'human_verified';
    if resolved_segment_id is null then
      raise exception 'Completion evidence % references an unknown or unverified production segment %.', evidence_item->>'evidence_key', evidence_item->>'segment_key';
    end if;

    existing_evidence_id := null;
    select ce.id into existing_evidence_id
    from public.completion_evidence ce
    where ce.user_id = target_user_id
      and ce.evidence_key = evidence_item->>'evidence_key';

    if existing_evidence_id is null then
      insert into public.completion_evidence(
        user_id,
        evidence_key,
        match_candidate_id,
        activity_id,
        segment_candidate_key,
        future_trail_segment_id,
        evidence_source,
        evidence,
        accepted_at,
        provenance
      )
      values (
        target_user_id,
        evidence_item->>'evidence_key',
        null,
        resolved_activity_id,
        evidence_item->>'segment_key',
        resolved_segment_id,
        'historical_gps',
        evidence_item->'evidence',
        (evidence_item->>'accepted_at')::timestamptz,
        evidence_item->'provenance'
      );
      evidence_created := evidence_created + 1;
    else
      perform 1
      from public.completion_evidence ce
      where ce.id = existing_evidence_id
        and ce.user_id = target_user_id
        and ce.evidence_key = evidence_item->>'evidence_key'
        and ce.match_candidate_id is null
        and ce.activity_id = resolved_activity_id
        and ce.segment_candidate_key = evidence_item->>'segment_key'
        and ce.future_trail_segment_id = resolved_segment_id
        and ce.evidence_source = 'historical_gps'
        and ce.evidence = evidence_item->'evidence'
        and ce.accepted_at = (evidence_item->>'accepted_at')::timestamptz
        and ce.provenance = evidence_item->'provenance';
      if not found then
        raise exception 'Completion evidence identity conflict for %.', evidence_item->>'evidence_key';
      end if;
      evidence_already_loaded := evidence_already_loaded + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'artifact_fingerprint', run_payload->>'artifact_fingerprint',
    'activities_created', activities_created,
    'activities_reused', activities_reused,
    'evidence_created', evidence_created,
    'evidence_already_loaded', evidence_already_loaded
  );
end;
$$;

revoke execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) from anon;
revoke execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) to service_role;

comment on column public.activities.activity_key is
  'Validated activity-key-v2 identity managed by controlled import tooling. Normal authenticated callers cannot insert or update it.';
comment on column public.completion_evidence.evidence_key is
  'Versioned deterministic evidence-key-v1 identity scoped by user_id.';
comment on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) is
  'Service-role-only atomic M7D-A loader. Materializes private reviewed GPS evidence and never creates segment completions.';