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
- `SupabaseTrailRepository` is selected only when `TRAIL_REPOSITORY=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the documented `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback are present.

This keeps the app buildable and browsable before a Supabase project exists, while preserving a stable contract for production trail reads.

## Supabase API contract
Migration 003 creates `public.trail_segment_api`, the REST projection used by `SupabaseTrailRepository`. Migration 013 hardens that projection as the public browser/auth client boundary.

The view:
- joins `trail_segments` to `trails`
- exposes explicit verification/provenance fields
- exposes LineString coordinates with `ST_AsGeoJSON(...)->'coordinates'`
- is read-only from the app's perspective
- runs as owner-rights with `security_invoker = false`
- uses `security_barrier = true`
- publishes only rows passing its explicit verified plus human-verified predicates

The public projection boundary is:

```text
public browser/auth client
        |
        v
trail_segment_api
(owner-rights, security_barrier)
        |
        v
verified/human_verified projection
```

Direct application-role access to `public.trails` and `public.trail_segments` is revoked. Owner-rights execution must not be described as relying on base-table RLS for public trail filtering. Do not point the REST adapter at raw PostGIS geometry columns or require the client to parse WKB/hex.

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
Approved M8D production architecture:

```text
jamesscottsullivan.com
  static portfolio

trails.jamesscottsullivan.com
  Next.js Redline application

Supabase
  backend/auth/database

External map provider
  configurable MapLibre basemap style service
```

The portfolio remains a separate static deployment. Do not merge it into the Redline Next.js app. Do not configure a `/redline` `basePath` or reverse proxy for M8D. Cross-linking belongs to M8D-B.

`NEXT_PUBLIC_SITE_URL` is the full public app base URL and may include a path prefix such as `/redline`. SEO canonicals and metadata route URLs must preserve that prefix; do not use auth URL helpers that collapse to `url.origin` for SEO URL construction.

M8C indexable route foundation:
- `/`
- `/trails`
- `/trails/[trailSlug]`

Filtered directory query URLs remain browseable but canonicalize to `/trails` and are `noindex, follow`. Account, login, auth, and admin routes are discouraged from indexing/crawling. Public indexing is enabled only for production HTTPS Supabase-backed public configuration with the server/build-only `PUBLIC_INDEXING_ENABLED=true` opt-in. If `VERCEL_ENV` exists, it must be `production`; Vercel Preview and Development deployments remain non-indexable even if the opt-in is copied there by mistake. Demo/runtime fallback must not advertise demo trail-detail URLs in the sitemap.

The production SEO/indexing contract is build-sensitive. Before a production `next build`, the intended deployment values must already be present for `NEXT_PUBLIC_SITE_URL`, `TRAIL_REPOSITORY=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAP_STYLE_URL`, and `PUBLIC_INDEXING_ENABLED`. Next metadata routes such as sitemap/robots are cached by default, root metadata reads environment/config assumptions, `generateStaticParams()` runs during build, browser maps read public build-time config, and trail static generation depends on repository/config state available at build time. Changing only runtime environment variables after the artifact is built must not be relied on to regenerate metadata assumptions, sitemap/robots behavior, browser map configuration, or the statically generated trail route inventory. Rebuild when production configuration changes materially, and do not promote/reuse artifacts across Preview, staging, and production when public app base URL, map style URL, repository mode, Supabase config, or public-indexing state differs materially. This requires only public Supabase configuration, not service-role credentials; robots/noindex remain indexing guidance, while authentication/RLS remain the security boundary.

Structured data is intentionally deferred until verified public trail records are paired with authored content rich enough to avoid semantic overclaiming.

Keep the interactive app useful without login; require login only to save personal progress.

## Basemap provider
Browser maps use MapLibre. The production basemap is provider-neutral application configuration through `NEXT_PUBLIC_MAP_STYLE_URL`, a hosted MapLibre style URL. The approved initial provider direction is MapTiler Cloud, but provider-specific behavior must not leak into unrelated application code.

The browser map credential, if the provider requires one, is public client configuration and should be domain-restricted with the provider where available. No server secret is required for map rendering. Production `NEXT_PUBLIC_MAP_STYLE_URL` must be a valid HTTPS public provider endpoint with no embedded username/password credentials and no localhost, loopback, private-network, link-local, or `.local` host.

Local development may omit `NEXT_PUBLIC_MAP_STYLE_URL`; the shared map style resolver then uses a development-only OpenStreetMap community raster fallback with attribution. Production never silently falls back to OSM community tiles. Missing, malformed, invalid, or unavailable production map style configuration fails visibly in the map UI without crashing surrounding page content.

## CI and security hardening
GitHub Actions validates pull requests and pushes to `main` with `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The live USFS importer is excluded from CI so tests do not depend on an external service.

Migration 004 restricts `public.load_source_trail_feature_batch(jsonb, jsonb)` execution to `service_role` and keeps it as an invoker-rights function, not `SECURITY DEFINER`. The service-role key is only for controlled server-side/admin import tooling and must never be exposed to browser code or committed.

Migration 013 makes the public projection permission model explicit: browser roles (`anon` and `authenticated`) receive only `SELECT` on `public.trail_segment_api`, while direct application-role privileges on `public.trails` and `public.trail_segments` are revoked. The service-role key is reserved for controlled server-side/admin workflows.

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


## Activity Matching

Milestone 4 adds a local, review-first activity matching layer after segment construction: approved canonical matching segments plus historical GPS activity traces produce algorithmic match candidates and human-reviewed completion evidence. GPS traces are evidence, not canonical geometry; strong candidates are not completions; accepted evidence is not a production SegmentCompletion row. See docs/ACTIVITY_MATCHING.md.

Activity matching hardening: GPS edges beyond maximumInterpolatedActivityEdgeMeters are evidence gaps, separate activity components cannot combine into strong evidence, bbox matching is meter-aware, and source activity IDs dominate stable activity identity. See docs/ACTIVITY_MATCHING.md.

Milestone 4 final hardening stores explicit per-component componentEvidence, requires bestStrongComponentIndex for strong matches, renders trusted activity lines without ignored GPS gaps, redacts private filesystem metadata, and reports unique ignored activity edges. See docs/ACTIVITY_MATCHING.md.

## Publication Boundary
The public trail repository consumes TrailSegment-shaped records. Demo mode now adapts the committed verified network artifact into that shape, while Supabase reads from trail_segment_api, which is hardened to verified human-reviewed records only.


## Accounts And User Persistence
Milestone 6 adds Supabase SSR authentication without making trail browsing require login. Public routes keep using the trail repository abstraction; `/account` is the protected boundary for private profile state.

Auth/session code is centralized in `lib/supabase/*` and account/profile persistence is centralized in `lib/accounts/*`. Browser code receives only `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the documented `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback. The service-role key remains reserved for controlled server-side/admin import and publication tooling and must never appear in client components.

`proxy.ts` uses the current cookie-backed Supabase SSR pattern to refresh sessions, copies Supabase cache-protection headers, and no-ops when Supabase public config is absent, so CI and demo builds do not require credentials. Server routes verify users with `auth.getUser()` instead of trusting raw cookies; the proxy uses `auth.getClaims()` for request-time session refresh/validation. Production auth redirects require a configured HTTPS `NEXT_PUBLIC_SITE_URL`, while public Supabase trail reads remain available with only public API config.

M6 does not create `segment_completions`, mark segments completed from auth state, or promote activity evidence. M7 owns the completion mutation contract.

## Evidence Confirmation Boundary

M7D-A materializes reviewed GPS evidence into private owned activities and accepted `completion_evidence` without creating completions. Migration 012 implements M7D-B locally as two authenticated `SECURITY DEFINER` RPCs: a sanitized owner-only confirmable-evidence projection and an explicit confirmation operation that derives a `gpx_match` completion internally. Both use an empty search path, owner identity from `auth.uid()`, and the verified/human-reviewed segment-plus-parent publication gate. Confirmation takes only an opaque evidence UUID; it never accepts caller-controlled completion fields.

The evidence-backed completion date comes only from the immutable M7D-A `provenance.activityDate` snapshot. Raw evidence and matching internals remain unavailable to browser roles. M7D-C adds a separate authenticated SSR `CompletionEvidenceRepository` that wraps only the two M7D-B RPCs, plus an account-page client boundary for explicit confirmation. The repository accepts no user ID, and the action accepts only an opaque evidence UUID; database `auth.uid()` remains authoritative. Migrations 011/012 have not been applied live, and database-backed acceptance remains outstanding.
