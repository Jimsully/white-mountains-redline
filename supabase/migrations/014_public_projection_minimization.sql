-- M8E: minimize the browser-visible trail projection.
-- Internal publication provenance remains on the base tables for controlled
-- service/admin workflows and is intentionally excluded from public REST.

drop view if exists public.trail_segment_api;

create view public.trail_segment_api
with (
  security_invoker = false,
  security_barrier = true
) as
select
  s.id::text as id,
  s.segment_key as slug,
  s.segment_name,
  s.miles,
  s.data_status,
  s.verification_status,
  t.id::text as trail_id,
  t.slug as trail_slug,
  t.name as trail_name,
  t.region as trail_region,
  (extensions.st_asgeojson(s.geom)::jsonb -> 'coordinates') as coordinates
from public.trail_segments s
join public.trails t on t.id = s.trail_id
where s.data_status = 'verified'
  and s.verification_status = 'human_verified'
  and t.data_status = 'verified'
  and t.verification_status = 'human_verified';

comment on view public.trail_segment_api is
  'Minimal read-only public trail projection. Exposes only fields required by public map/directory/detail rendering and filters to verified, human-reviewed segment and parent rows.';

revoke all privileges
  on table public.trail_segment_api
  from public, anon, authenticated;

grant select
  on table public.trail_segment_api
  to anon, authenticated;
