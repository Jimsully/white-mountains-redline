# White Mountains Redline

Independent White Mountains trail-completion tracker intended to live alongside `jamesscottsullivan.com`.

## What is included now
- Next.js 16 App Router scaffold.
- MapLibre interactive map.
- Trail repository abstraction with demo and Supabase adapters.
- Demo trail segment completion toggles, filtering, and progress calculation.
- Public map, trail directory, and trail detail routes with SEO metadata guarded against demo indexing.
- Supabase/PostGIS production schema, raw source GIS staging schema, and read-only API projection view.
- Repeatable USFS ArcGIS importer for a Franconia/Pemigewasset pilot ingestion envelope.
- Product, architecture, data-model, data-pipeline, IP/data, and roadmap docs.
- `AGENTS.md` for Codex.
- Zero-install offline visual prototype in `prototype/index.html`.

**Important:** All trail geometry shipped in the code scaffold is intentionally simplified demo geometry and is not for navigation. Any USFS data downloaded by the importer is raw source GIS only; it is not an AMC White Mountain Guide challenge inventory and is not human verified for redline completion.

## Run the Next.js app
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

The package versions were selected for August 2026: Next.js 16.3.1 and MapLibre GL JS 6.4.0. Review/update dependencies before a later production deployment.

## Validate
```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Repository adapter
The app loads trail segments through `createTrailRepository()`.

Default behavior uses the demo adapter and requires no Supabase credentials. To opt into Supabase reads, set:

```bash
TRAIL_REPOSITORY=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The Supabase adapter reads from `public.trail_segment_api`, a read-only projection view created by migration 003 and hardened by migration 013. Browser roles (`anon` and `authenticated`) read verified trail network records through that view only; they do not have direct privileges on `public.trails` or `public.trail_segments`. The view runs as owner-rights with `security_barrier=true`, and its explicit verified plus human-verified predicates are the public publication boundary. Service-controlled/admin workflows retain separate privileges. Clients never parse PostGIS WKB/hex.

## Public URLs and indexing
`NEXT_PUBLIC_SITE_URL` is the full public app base URL, not just an origin. It may include a path prefix such as `https://jamesscottsullivan.com/redline`. M8C does not choose the final production host or configure reverse-proxy/basePath behavior.

Public indexing is enabled only when all of these are true:

- `NODE_ENV=production`
- `NEXT_PUBLIC_SITE_URL` is a valid HTTPS URL
- `TRAIL_REPOSITORY=supabase`
- `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present

Production SEO/indexing configuration is a build-time deployment input. Before running a production `next build`, set the intended production `NEXT_PUBLIC_SITE_URL`, `TRAIL_REPOSITORY=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and the supported public Supabase publishable/anon key variable. A build without the intended full public app base URL, including any path prefix, is invalid for promotion. Do not promote or reuse production artifacts across different public app base URLs, repository modes, or public indexing configurations. Changing only runtime environment variables after a build must not be relied on to regenerate metadata assumptions, sitemap/robots behavior, or the statically generated trail route inventory; rebuild the application when production configuration changes materially. Service-role credentials are not required for this public SEO build contract.

Demo/local browsing remains usable, but robots metadata, `robots.txt`, and `sitemap.xml` err toward noindex behavior unless that deterministic configuration gate passes. The sitemap includes `/`, `/trails`, and verified public trail-detail URLs only in the safe Supabase-backed production configuration. Query-state directory URLs such as `/trails?q=...` and `/trails?region=...` canonicalize to `/trails` and are marked `noindex, follow`.

Structured data is intentionally deferred until authored public trail content is rich enough to avoid overclaiming hiking-trail/place semantics.

## Import raw USFS source data
Download and write deterministic staging artifacts only:

```bash
npm run data:import:usfs
```

Download, write staging artifacts, and load raw source features into Supabase staging tables:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
npm run data:import:usfs -- --load
```

`--load` requires a service-role key in the environment. Do not expose or commit that key. The loader creates an `import_batches` record and upserts `source_trail_features`; it never creates `trails`, never creates `trail_segments`, and never marks source data verified.

The importer uses the ArcGIS query API for the USDA Forest Service National Forest System Trails service and an approximate Franconia/Pemigewasset ingestion envelope. The envelope is not a canonical region boundary.

Generated staging files are written to:

`data/staging/usfs/franconia-pemi/`

Those files are broad source GIS artifacts only. Snowmobile, XC, mountain-bike, climbing, and other trail records remain in the raw layer so later reconciliation can decide what belongs in a hiking/redlining challenge dataset.

## Preview without npm
Open `prototype/index.html` directly in a browser. This prototype uses only HTML/CSS/JS and contains no real trail geography.

## Recommended production sequence
1. Build/import raw source trail datasets into staging.
2. Reconcile source features against a legally reviewed challenge inventory.
3. Split reviewed routes into stable junction-to-junction completion segments.
4. Human-verify segment identity, endpoints, geometry, and provenance.
5. Create Supabase project and apply `supabase/migrations`.
6. Replace demo mode with verified production reads when enough reviewed data exists.
7. Add authentication/persistence.
8. Add GPX matching with human confirmation.
9. Integrate into `jamesscottsullivan.com` via `/redline` or a subdomain.

## Naming
"White Mountains Redline" is a working independent name. Do not imply AMC sponsorship or endorsement.

## CI and Security Notes
GitHub Actions runs `npm ci`, tests, typecheck, lint, and build on pull requests and pushes to `main`. CI intentionally does not run the live USFS importer because validation must not depend on external GIS service availability.

The Supabase service-role key is only for controlled server-side/admin import tooling such as `npm run data:import:usfs -- --load`. It must never be exposed to browser code, committed to the repository, or placed in `NEXT_PUBLIC_*` variables.

## Challenge Inventory Reconciliation
Milestone 2 adds private inventory validation, deterministic source grouping/matching, and an admin review workspace at `/admin/reconciliation`.

Real guide-derived inventory files must stay local under `data/local/challenge-inventory/` and are ignored by git. The committed demo inventory is demo data only and is not a White Mountain Guide inventory.

Run the demo reconciliation:

```bash
npm run data:inventory:validate -- data/demo/challenge-inventory.demo.csv
npm run data:reconcile -- --inventory data/demo/challenge-inventory.demo.csv
```

Accepted reconciliation is not a verified trail segment. It is only a trail-level review decision; production Trail and junction-to-junction TrailSegment creation come later.

## Segment Construction
Milestone 3 adds proposed topology construction from accepted reconciliation decisions. It does not create verified production `TrailSegment` records.

Run the demo segment build:

```bash
npm run data:segments:build -- --reconciliation data/generated/reconciliation/demo-reconciliation.json --decisions data/demo/reconciliation-decisions.demo.json
```

Open `/admin/segments` in development to review demo junction and segment candidates. Private segment artifacts may be loaded only with server-side `SEGMENT_CONSTRUCTION_ARTIFACT_PATH` during local development; production loading is blocked until authenticated admin access exists.

Accepted reconciliation != verified segment. Proposed junction != verified junction. Accepted segment-construction candidate != published completion segment.


## Activity Matching

Milestone 4 adds local GPS evidence matching for accepted prototype segment-construction candidates. Demo-only commands:

`ash
npm run data:activity:validate -- data/demo/activities
npm run data:activity:match -- --segments data/generated/segments/demo-segment-construction.json --segment-decisions data/demo/segment-construction-decisions.demo.json --activities data/demo/activities
` 

GPS traces are evidence, not canonical trail geometry. Strong candidates are not completions, and accepted completion evidence does not create production SegmentCompletion rows. Real activity files belong in ignored data/local/activities/; private activity artifacts are blocked in production admin loading until authenticated admin access exists.

Activity matching hardening: GPS edges beyond maximumInterpolatedActivityEdgeMeters are evidence gaps, separate activity components cannot combine into strong evidence, bbox matching is meter-aware, and source activity IDs dominate stable activity identity. See docs/ACTIVITY_MATCHING.md.

Milestone 4 final hardening stores explicit per-component componentEvidence, requires estStrongComponentIndex for strong matches, renders trusted activity lines without ignored GPS gaps, redacts private filesystem metadata, and reports unique ignored activity edges. See docs/ACTIVITY_MATCHING.md.

## Verified Publication Gate
Milestone 5 adds 
pm run data:publication:build and the /admin/publication workspace. Demo publication output lives at data/generated/publication/demo-verified-network.json, is clearly NOT FOR NAVIGATION, and does not create SegmentCompletion records. Supabase publication loading requires server-side service-role credentials only.

