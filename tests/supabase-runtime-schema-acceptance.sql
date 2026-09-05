\set ON_ERROR_STOP on

do $$
declare
  actual_columns text[];
  view_options text[];
  view_owner text;
begin
  select array_agg(column_name order by ordinal_position)
  into actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'trail_segment_api';

  if actual_columns is distinct from array[
    'id', 'slug', 'segment_name', 'miles', 'data_status',
    'verification_status', 'trail_id', 'trail_slug', 'trail_name',
    'trail_region', 'coordinates'
  ]::text[] then
    raise exception 'Unexpected trail_segment_api columns: %', actual_columns;
  end if;

  select c.reloptions, pg_get_userbyid(c.relowner)
  into view_options, view_owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'trail_segment_api'
    and c.relkind = 'v';

  if view_options is null
    or not ('security_invoker=false' = any(view_options))
    or not ('security_barrier=true' = any(view_options)) then
    raise exception 'Unexpected trail_segment_api reloptions: %', view_options;
  end if;

  if view_owner <> 'postgres' then
    raise exception 'Unexpected trail_segment_api owner: %', view_owner;
  end if;

  if not has_table_privilege('anon', 'public.trail_segment_api', 'SELECT')
    or not has_table_privilege('authenticated', 'public.trail_segment_api', 'SELECT') then
    raise exception 'Browser roles cannot select the public projection.';
  end if;

  if has_table_privilege('anon', 'public.trails', 'SELECT')
    or has_table_privilege('authenticated', 'public.trails', 'SELECT')
    or has_table_privilege('anon', 'public.trail_segments', 'SELECT')
    or has_table_privilege('authenticated', 'public.trail_segments', 'SELECT') then
    raise exception 'A browser role retains direct trail base-table access.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.load_verified_publication_batch(jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.load_reviewed_completion_evidence_batch(uuid,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'A service-role loader is unavailable.';
  end if;
end
$$;

insert into public.trails (
  slug,
  name,
  region,
  source_label,
  source_ref,
  data_status,
  verification_status,
  provenance,
  production_trail_key
) values (
  'qa-unverified-parent',
  'QA Unverified Parent',
  'presidential',
  'private QA source',
  'private-parent-ref',
  'unverified',
  'needs_reconciliation',
  '{"privateNote":"must not be public"}'::jsonb,
  'qa-unverified-parent-v1'
);

insert into public.trail_segments (
  trail_id,
  segment_key,
  segment_name,
  miles,
  geom,
  source_label,
  source_ref,
  verification_notes,
  data_status,
  verification_status,
  provenance,
  source_feature_ids
) select
  id,
  'qa-hidden-segment-v1',
  'QA Hidden Segment',
  1.000,
  extensions.st_setsrid(
    extensions.st_geomfromgeojson('{"type":"LineString","coordinates":[[-71.4,44.1],[-71.39,44.11]]}'),
    4326
  ),
  'private QA source',
  'private-segment-ref',
  'private review note',
  'verified',
  'human_verified',
  '{"privateNote":"must not be public"}'::jsonb,
  array['private-source-feature']::text[]
from public.trails
where production_trail_key = 'qa-unverified-parent-v1';
