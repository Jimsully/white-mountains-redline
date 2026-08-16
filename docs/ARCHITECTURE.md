# Architecture

## Front end
- Next.js App Router + TypeScript.
- MapLibre GL JS for interactive rendering.
- Server-rendered/indexable trail pages where possible.
- Client components only for map interaction, filters, and optimistic completion toggles.
- Trail data enters UI through the repository layer; UI components do not import demo data directly.

## Trail repository layer
`createTrailRepository()` selects a `TrailRepository` adapter:

- `DemoTrailRepository` is the default and keeps the prototype operational without credentials.
- `SupabaseTrailRepository` is selected only when `TRAIL_REPOSITORY=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present.

This keeps the app buildable and browsable before a Supabase project exists, while preserving a stable seam for production trail reads.

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
`npm run data:import:usfs` queries the USDA Forest Service ArcGIS service using pagination and an approximate Franconia/Pemigewasset ingestion envelope. It writes deterministic staging artifacts under `data/staging/usfs/franconia-pemi/` and does not require Supabase credentials.

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
