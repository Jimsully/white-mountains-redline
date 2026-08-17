# Architecture

## Front end
- Next.js App Router + TypeScript.
- MapLibre GL JS for interactive rendering.
- Server-rendered/indexable trail pages where possible.
- Client components only for map interaction, filters, and optimistic completion toggles.
- Trail data enters UI through the repository layer; UI components do not import demo data directly.
- Overall progress is calculated from the full loaded challenge/demo dataset. Filters affect map visibility and show secondary filtered progress only.

## Trail repository layer
`createTrailRepository()` selects a `TrailRepository` adapter:

- `DemoTrailRepository` is the default and keeps the prototype operational without credentials.
- `SupabaseTrailRepository` is selected only when `TRAIL_REPOSITORY=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present.

This keeps the app buildable and browsable before a Supabase project exists, while preserving a stable contract for production trail reads.

## Supabase API contract
Migration 003 creates `public.trail_segment_api`, the REST projection used by `SupabaseTrailRepository`.

The view:
- joins `trail_segments` to `trails`
- exposes explicit verification/provenance fields
- exposes LineString coordinates with `ST_AsGeoJSON(...)->'coordinates'`
- is read-only from the app's perspective
- uses `security_invoker = true` so RLS policies on base tables apply to view reads

Do not point the REST adapter at raw PostGIS geometry columns or require the client to parse WKB/hex.

## Backend
- Supabase Auth for accounts.
- PostgreSQL + PostGIS for trail/activity geometry.
- Row-level security for private user activity/completion data.
- Public, read-only verified trail geometry.
- Public, read-only raw source staging tables for inspection and reconciliation.

## Data pipeline
1. Acquire public/open trail linework (USFS as a primary government source; OSM as a reconciliation/enrichment source subject to its license).
2. Store raw source records in `import_batches` and `source_trail_features` with source properties, geometry, import metadata, and reconciliation status.
3. Clip/filter only for ingestion or review convenience. Do not treat an ingestion envelope as a canonical challenge region.
4. Normalize names and source IDs into staging records.
5. Reconcile geometry against the challenge inventory.
6. Split trails into stable challenge segments at meaningful junctions/endpoints.
7. Store source provenance on every segment, including raw source feature IDs and manual modification state.
8. Human-verify before setting `data_status = verified` or `verification_status = human_verified`.
9. Publish only verified geometry to the production challenge layer.

Authoritative-source geometry is not equivalent to challenge verification. An imported USFS line is raw source evidence until a human review confirms challenge identity, endpoints, and geometry.

## USFS importer
`npm run data:import:usfs` queries the USDA Forest Service ArcGIS service using deterministic `objectid ASC` ordering, offset pagination, and the service's `exceededTransferLimit` signal. It writes deterministic staging artifacts under `data/staging/usfs/franconia-pemi/` and does not require Supabase credentials.

`npm run data:import:usfs -- --load` requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It calls the migration-003 staging RPC to create one import batch and upsert raw `source_trail_features`. This mode is staging-only and does not create production trails or trail segments.

The raw source layer intentionally remains broad. Snowmobile, XC, mountain-bike, climbing, and other trail features are not filtered out during ingestion; later reconciliation decides challenge membership.

## GPX matching v1
- Parse uploaded GPX to a MultiLineString.
- Candidate generation: spatial index query for segments within a conservative buffer of the activity.
- Score each candidate using segment coverage, activity proximity, endpoint proximity, and optional direction/time continuity.
- Never auto-complete silently in MVP. Show suggested matches with confidence and require user confirmation.

## GPX matching v2
Use map-matching/graph continuity so overlapping trails, road walks, switchbacks, and nearby parallel trails are handled more reliably.

## SEO / website integration
Preferred production URL: `jamesscottsullivan.com/redline` if the existing site stack can host/proxy Next.js cleanly. Otherwise use `trails.jamesscottsullivan.com` and cross-link strongly.

Indexable routes:
- `/redline`
- `/trails/[slug]`
- `/regions/[slug]`
- `/redliners/[username]`

Keep the interactive app useful without login; require login only to save personal progress.

## Basemap warning
The scaffold uses OpenStreetMap's standard raster tiles for local development only. Before public launch, select a production-appropriate tile/style provider and comply with its terms and attribution requirements.

## CI and security hardening
GitHub Actions validates pull requests and pushes to `main` with `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The live USFS importer is excluded from CI so tests do not depend on an external service.

Migration 004 restricts `public.load_source_trail_feature_batch(jsonb, jsonb)` execution to `service_role` and keeps it as an invoker-rights function, not `SECURITY DEFINER`. The service-role key is only for controlled server-side/admin import tooling and must never be exposed to browser code or committed.

Migration 004 also makes the intended `public.trail_segment_api` permission explicit: `SELECT` for `anon` and `authenticated`, with mutation privileges revoked.

## Reconciliation workspace
Milestone 2 adds a development/admin route at `/admin/reconciliation`. It is not part of the public redlining experience and is marked not for navigation and not challenge verified. The route consumes committed demo reconciliation JSON so CI and local development do not require a private inventory.

Reconciliation flow:

```text
raw USFS source feature
  -> source trail group
  -> challenge inventory item
  -> reconciliation candidate
  -> human accepted trail-level match
  -> production Trail
  -> junction-to-junction TrailSegments
  -> human segment verification
  -> redline completion network
```

Accepted reconciliation is not a verified trail segment. Prototype decisions stay in browser localStorage and can be exported as JSON for later review.

## Segment Construction Workspace
Milestone 3 adds a development/admin route at `/admin/segments`. It consumes committed demo segment-construction JSON and is marked not for navigation and not segment verified. Private local artifacts can be loaded only through server-only `SEGMENT_CONSTRUCTION_ARTIFACT_PATH`; production private loading fails until authenticated admin access exists.

Segment construction flow:

```text
raw source feature
  -> source trail group
  -> challenge inventory item
  -> accepted trail-level reconciliation
  -> accepted trail source geometry
  -> junction candidates
  -> segment candidates
  -> human topology review
  -> approved segment construction
  -> production Trail / TrailSegments
  -> human segment verification
  -> completion network
```

Accepted reconciliation is not a verified segment. A proposed junction is not a verified junction. An accepted segment-construction candidate is not a published completion segment.
