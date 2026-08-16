-- White Mountains Redline: API projections and staging load helpers.
-- This migration preserves historical migrations and adds the contract used by the app repository.

create extension if not exists postgis with schema extensions;

alter table public.trail_segments
  add column if not exists verification_status text not null default 'needs_reconciliation'
    check (verification_status in ('demo','raw_source','needs_reconciliation','reconciled','human_verified','retired')),
  add column if not exists provenance jsonb not null default '{}'::jsonb,
  add column if not exists source_feature_ids text[] not null default '{}',
  add column if not exists geometry_manually_modified boolean not null default false,
  add column if not exists reviewed_at timestamptz;

alter table public.trails
  add column if not exists verification_status text not null default 'needs_reconciliation'
    check (verification_status in ('demo','raw_source','needs_reconciliation','reconciled','human_verified','retired')),
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.source_trail_features
  add column if not exists source_query_url text,
  add column if not exists source_record_ref text,
  add column if not exists gis_miles numeric;

create or replace view public.trail_segment_api
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
  (st_asgeojson(s.geom)::jsonb -> 'coordinates') as coordinates
from public.trail_segments s
join public.trails t on t.id = s.trail_id;

comment on view public.trail_segment_api is
  'Read-only application projection for public trail segments. Uses security_invoker so base table RLS policies continue to apply. Exposes LineString coordinates via ST_AsGeoJSON; clients do not parse PostGIS WKB.';

create or replace function public.load_source_trail_feature_batch(
  p_batch jsonb,
  p_features jsonb
)
returns table(import_batch_id bigint, upserted_count integer)
language plpgsql
as $$
declare
  v_batch_id bigint;
  v_feature jsonb;
  v_count integer := 0;
begin
  insert into public.import_batches (
    source_provider,
    source_dataset,
    source_url,
    requested_envelope,
    requested_fields,
    feature_count,
    named_feature_count,
    unnamed_feature_count,
    unique_trail_name_count,
    malformed_feature_count,
    summary,
    notes
  ) values (
    p_batch->>'sourceProvider',
    p_batch->>'sourceDataset',
    p_batch->>'sourceUrl',
    case when p_batch ? 'envelopeGeoJson'
      then st_setsrid(st_geomfromgeojson((p_batch->'envelopeGeoJson')::text), 4326)
      else null
    end,
    coalesce(array(select jsonb_array_elements_text(p_batch->'requestedFields')), '{}'),
    coalesce((p_batch->>'featureCount')::integer, 0),
    coalesce((p_batch->>'namedFeatureCount')::integer, 0),
    coalesce((p_batch->>'unnamedFeatureCount')::integer, 0),
    coalesce((p_batch->>'uniqueTrailNameCount')::integer, 0),
    coalesce((p_batch->>'malformedFeatureCount')::integer, 0),
    coalesce(p_batch->'summary', '{}'::jsonb),
    p_batch->>'notes'
  ) returning id into v_batch_id;

  for v_feature in select * from jsonb_array_elements(p_features)
  loop
    insert into public.source_trail_features (
      import_batch_id,
      source_provider,
      source_dataset,
      source_feature_id,
      source_url,
      source_query_url,
      source_record_ref,
      imported_at,
      original_properties,
      geom,
      region_hint,
      reconciliation_status,
      trail_name,
      segment_length,
      gis_miles
    ) values (
      v_batch_id,
      v_feature->>'sourceProvider',
      v_feature->>'sourceDataset',
      v_feature->>'sourceFeatureId',
      v_feature->>'sourceUrl',
      v_feature->>'sourceQueryUrl',
      v_feature->>'sourceRecordRef',
      coalesce((v_feature->>'importedAt')::timestamptz, now()),
      coalesce(v_feature->'originalProperties', '{}'::jsonb),
      st_setsrid(st_geomfromgeojson((v_feature->'geometry')::text), 4326),
      v_feature->>'regionHint',
      coalesce(v_feature->>'reconciliationStatus', 'raw'),
      v_feature->>'trailName',
      nullif(v_feature->>'segmentLength', '')::numeric,
      nullif(v_feature->>'gisMiles', '')::numeric
    )
    on conflict (source_provider, source_dataset, source_feature_id)
    do update set
      import_batch_id = excluded.import_batch_id,
      source_url = excluded.source_url,
      source_query_url = excluded.source_query_url,
      source_record_ref = excluded.source_record_ref,
      imported_at = excluded.imported_at,
      original_properties = excluded.original_properties,
      geom = excluded.geom,
      region_hint = excluded.region_hint,
      reconciliation_status = excluded.reconciliation_status,
      trail_name = excluded.trail_name,
      segment_length = excluded.segment_length,
      gis_miles = excluded.gis_miles,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  import_batch_id := v_batch_id;
  upserted_count := v_count;
  return next;
end;
$$;

comment on function public.load_source_trail_feature_batch(jsonb, jsonb) is
  'Staging-only loader for raw source trail features. Creates import_batches and upserts source_trail_features. It never creates trails or trail_segments and never marks data verified.';
