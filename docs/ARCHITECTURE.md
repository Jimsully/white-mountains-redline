# Architecture

## Front end
- Next.js App Router + TypeScript.
- MapLibre GL JS for interactive rendering.
- Server-rendered/indexable trail pages where possible.
- Client components only for map interaction and optimistic completion toggles.

## Backend
- Supabase Auth for accounts.
- PostgreSQL + PostGIS for trail/activity geometry.
- Row-level security for private user activity/completion data.
- Public, read-only verified trail geometry.

## Data pipeline
1. Acquire public/open trail linework (USFS as a primary government source; OSM as a reconciliation/enrichment source subject to its license).
2. Clip to White Mountains project bounds.
3. Normalize names and source IDs into staging records.
4. Reconcile geometry against the challenge inventory.
5. Split trails into stable challenge segments at meaningful junctions/endpoints.
6. Store source provenance on every segment.
7. Human-verify before setting `data_status = verified`.
8. Publish only verified geometry to the production challenge layer.

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
