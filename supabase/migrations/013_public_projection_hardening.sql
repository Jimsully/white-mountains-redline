-- Milestone 7D public projection hardening.
-- Runtime testing proved Supabase default public-schema ACLs can expose base
-- trail relation columns through PostgREST even when RLS limits rows.
-- Keep browser roles on the curated projection only.

alter view public.trail_segment_api
  set (
    security_invoker = false,
    security_barrier = true
  );

revoke all privileges
  on table public.trails
  from public, anon, authenticated;

revoke all privileges
  on table public.trail_segments
  from public, anon, authenticated;

revoke all privileges
  on table public.trail_segment_api
  from public, anon, authenticated;

grant select
  on table public.trail_segment_api
  to anon, authenticated;
