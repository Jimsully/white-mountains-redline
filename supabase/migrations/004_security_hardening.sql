-- White Mountains Redline: security hardening for API view and staging RPC.
-- The staging RPC intentionally remains invoker-rights; do not convert it to SECURITY DEFINER.

revoke execute on function public.load_source_trail_feature_batch(jsonb, jsonb) from public;
revoke execute on function public.load_source_trail_feature_batch(jsonb, jsonb) from anon;
revoke execute on function public.load_source_trail_feature_batch(jsonb, jsonb) from authenticated;
grant execute on function public.load_source_trail_feature_batch(jsonb, jsonb) to service_role;

revoke all privileges on table public.trail_segment_api from public;
revoke all privileges on table public.trail_segment_api from anon;
revoke all privileges on table public.trail_segment_api from authenticated;
grant select on table public.trail_segment_api to anon;
grant select on table public.trail_segment_api to authenticated;

comment on function public.load_source_trail_feature_batch(jsonb, jsonb) is
  'Staging-only raw source loader. Execute is restricted to service_role for controlled server-side/admin import tooling. Never expose the service-role key to browser code. Function is intentionally invoker-rights, not SECURITY DEFINER.';

comment on view public.trail_segment_api is
  'Read-only application projection for public trail segments. SELECT is granted to anon/authenticated; mutation privileges are revoked. Uses security_invoker so base table RLS policies continue to apply. Exposes LineString coordinates via ST_AsGeoJSON; clients do not parse PostGIS WKB.';
