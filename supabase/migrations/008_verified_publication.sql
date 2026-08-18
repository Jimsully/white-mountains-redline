-- Milestone 5: verified publication gate and public read hardening.
-- Service-role publication loading is for controlled server-side/admin tooling only.
-- The service-role key must never be exposed to browser code.

create table if not exists public.publication_runs (
  id uuid primary key default gen_random_uuid(),
  algorithm_version text not null,
  generated_at timestamptz,
  artifact_fingerprint text not null,
  demo_only boolean not null default false,
  diagnostics jsonb not null default '{}'::jsonb,
  artifact_identity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (artifact_fingerprint)
);

alter table public.trails add column if not exists production_trail_key text;
alter table public.trails add column if not exists reviewed_at timestamptz;
alter table public.trails add column if not exists publication_run_id uuid references public.publication_runs(id);
alter table public.trails add column if not exists publication_artifact_fingerprint text;
create unique index if not exists trails_production_trail_key_key on public.trails(production_trail_key) where production_trail_key is not null;

alter table public.trail_segments add column if not exists publication_run_id uuid references public.publication_runs(id);
alter table public.trail_segments add column if not exists publication_artifact_fingerprint text;

alter table public.publication_runs enable row level security;
revoke all on table public.publication_runs from public, anon, authenticated;
grant select, insert on table public.publication_runs to service_role;

drop policy if exists "publication runs are service-role managed" on public.publication_runs;
create policy "publication runs are service-role managed"
  on public.publication_runs
  for all
  to service_role
  using (true)
  with check (true);

drop view if exists public.trail_segment_api;
create view public.trail_segment_api
with (security_invoker = true) as
select
  s.id::text as id,
  s.segment_key as slug,
  s.segment_key,
  s.segment_name,
  s.miles,
  s.data_status,
  s.verification_status,
  s.source_label,
  s.source_ref,
  s.source_feature_ids,
  s.geometry_manually_modified,
  s.reviewed_at,
  s.provenance,
  t.id::text as trail_id,
  t.slug as trail_slug,
  t.name as trail_name,
  t.region as trail_region,
  jsonb_build_object('type', 'LineString', 'coordinates', (st_asgeojson(s.geom)::jsonb -> 'coordinates')) as geom_geojson,
  (st_asgeojson(s.geom)::jsonb -> 'coordinates') as coordinates
from public.trail_segments s
join public.trails t on t.id = s.trail_id
where s.data_status = 'verified'
  and s.verification_status = 'human_verified'
  and t.data_status = 'verified'
  and t.verification_status = 'human_verified';

comment on view public.trail_segment_api is 'Read-only public API projection. Security-invoker view plus base table RLS only exposes trails/trail_segments that are verified and human_verified.';
revoke all on public.trail_segment_api from public, anon, authenticated;
grant select on public.trail_segment_api to anon, authenticated;

drop policy if exists "trails are public read" on public.trails;
drop policy if exists "segments are public read" on public.trail_segments;
drop policy if exists "verified trails are public read" on public.trails;
drop policy if exists "verified segments are public read" on public.trail_segments;

create policy "verified trails are public read"
  on public.trails
  for select
  to anon, authenticated
  using (data_status = 'verified' and verification_status = 'human_verified');

create policy "verified segments are public read"
  on public.trail_segments
  for select
  to anon, authenticated
  using (
    data_status = 'verified'
    and verification_status = 'human_verified'
    and exists (
      select 1
      from public.trails t
      where t.id = trail_segments.trail_id
        and t.data_status = 'verified'
        and t.verification_status = 'human_verified'
    )
  );

create or replace function public.load_verified_publication_batch(trails_payload jsonb, segments_payload jsonb, run_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
as $$
declare
  loaded_publication_run_id uuid;
  trail_item jsonb;
  segment_item jsonb;
  existing_trail_id bigint;
  existing_segment_id bigint;
  target_trail_id bigint;
  target_trail_key text;
  inserted_trails integer := 0;
  inserted_segments integer := 0;
begin
  if coalesce(run_payload->>'demo_only', 'false')::boolean then
    raise exception 'Demo publication artifacts must not be loaded into Supabase.';
  end if;
  if nullif(run_payload->>'artifact_fingerprint', '') is null then
    raise exception 'Publication run requires artifact_fingerprint.';
  end if;

  insert into public.publication_runs(algorithm_version, generated_at, artifact_fingerprint, demo_only, diagnostics, artifact_identity)
  values (
    run_payload->>'algorithm_version',
    nullif(run_payload->>'generated_at', '')::timestamptz,
    run_payload->>'artifact_fingerprint',
    false,
    coalesce(run_payload->'diagnostics', '{}'::jsonb),
    coalesce(run_payload->'artifact_identity', '{}'::jsonb)
  )
  on conflict (artifact_fingerprint) do update set
    algorithm_version = excluded.algorithm_version,
    generated_at = excluded.generated_at,
    demo_only = false,
    diagnostics = excluded.diagnostics,
    artifact_identity = excluded.artifact_identity
  returning id into loaded_publication_run_id;

  for trail_item in select * from jsonb_array_elements(trails_payload) loop
    if nullif(trail_item->>'production_trail_key', '') is null then
      raise exception 'Trail payload missing production_trail_key.';
    end if;

    select id into existing_trail_id
    from public.trails
    where production_trail_key = trail_item->>'production_trail_key';

    if existing_trail_id is not null then
      perform 1
      from public.trails
      where id = existing_trail_id
        and slug = trail_item->>'slug'
        and name = trail_item->>'name'
        and region = trail_item->>'region';
      if not found then
        raise exception 'Refusing to overwrite conflicting trail identity for %', trail_item->>'production_trail_key';
      end if;

      update public.trails set
        source_label = trail_item->>'source_label',
        source_ref = trail_item->>'source_ref',
        data_status = 'verified',
        verification_status = 'human_verified',
        reviewed_at = nullif(trail_item->>'reviewed_at', '')::timestamptz,
        publication_run_id = loaded_publication_run_id,
        publication_artifact_fingerprint = run_payload->>'artifact_fingerprint',
        provenance = coalesce(trail_item->'provenance', '{}'::jsonb)
      where id = existing_trail_id;
    else
      insert into public.trails(slug, name, region, source_label, source_ref, data_status, verification_status, provenance, production_trail_key, reviewed_at, publication_run_id, publication_artifact_fingerprint)
      values (
        trail_item->>'slug',
        trail_item->>'name',
        trail_item->>'region',
        trail_item->>'source_label',
        trail_item->>'source_ref',
        'verified',
        'human_verified',
        coalesce(trail_item->'provenance', '{}'::jsonb),
        trail_item->>'production_trail_key',
        nullif(trail_item->>'reviewed_at', '')::timestamptz,
        loaded_publication_run_id,
        run_payload->>'artifact_fingerprint'
      ) returning id into existing_trail_id;
    end if;
    inserted_trails := inserted_trails + 1;
  end loop;

  for segment_item in select * from jsonb_array_elements(segments_payload) loop
    target_trail_key := segment_item->>'trail_production_key';
    select id into target_trail_id from public.trails where production_trail_key = target_trail_key;
    if target_trail_id is null then
      raise exception 'Segment % references unknown production trail %', segment_item->>'segment_key', target_trail_key;
    end if;

    select id into existing_segment_id from public.trail_segments where segment_key = segment_item->>'segment_key';
    if existing_segment_id is not null then
      perform 1
      from public.trail_segments s
      where s.id = existing_segment_id
        and s.trail_id = target_trail_id
        and s.segment_name = segment_item->>'segment_name'
        and st_equals(s.geom, st_setsrid(st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', segment_item->'coordinates')::text), 4326));
      if not found then
        raise exception 'Refusing to overwrite conflicting verified segment identity for %', segment_item->>'segment_key';
      end if;

      update public.trail_segments set
        miles = (segment_item->>'miles')::numeric,
        source_label = segment_item->>'source_label',
        source_ref = segment_item->>'source_ref',
        source_feature_ids = coalesce(array(select jsonb_array_elements_text(segment_item->'source_feature_ids')), array[]::text[]),
        data_status = 'verified',
        verification_status = 'human_verified',
        reviewed_at = nullif(segment_item->>'reviewed_at', '')::timestamptz,
        publication_run_id = loaded_publication_run_id,
        publication_artifact_fingerprint = run_payload->>'artifact_fingerprint',
        provenance = coalesce(segment_item->'provenance', '{}'::jsonb)
      where id = existing_segment_id;
    else
      insert into public.trail_segments(trail_id, segment_key, segment_name, miles, geom, source_label, source_ref, source_feature_ids, data_status, verification_status, reviewed_at, publication_run_id, publication_artifact_fingerprint, provenance)
      values (
        target_trail_id,
        segment_item->>'segment_key',
        segment_item->>'segment_name',
        (segment_item->>'miles')::numeric,
        st_setsrid(st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', segment_item->'coordinates')::text), 4326),
        segment_item->>'source_label',
        segment_item->>'source_ref',
        coalesce(array(select jsonb_array_elements_text(segment_item->'source_feature_ids')), array[]::text[]),
        'verified',
        'human_verified',
        nullif(segment_item->>'reviewed_at', '')::timestamptz,
        loaded_publication_run_id,
        run_payload->>'artifact_fingerprint',
        coalesce(segment_item->'provenance', '{}'::jsonb)
      );
    end if;
    inserted_segments := inserted_segments + 1;
  end loop;

  return jsonb_build_object('publication_run_id', loaded_publication_run_id, 'trails', inserted_trails, 'trail_segments', inserted_segments);
end;
$$;

revoke execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) from public;
revoke execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) from anon;
revoke execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.load_verified_publication_batch(jsonb, jsonb, jsonb) to service_role;


