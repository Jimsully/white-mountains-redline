# White Mountains Redline

Independent White Mountains trail-completion tracker intended to live alongside `jamesscottsullivan.com`.

## What is included now
- Next.js 16 App Router scaffold.
- MapLibre interactive map.
- Trail repository abstraction with demo and Supabase adapters.
- Demo trail segment completion toggles, filtering, and progress calculation.
- Indexable demo trail route.
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

The Supabase adapter reads from `public.trail_segment_api`, a read-only projection view created by migration 003. The view joins `trails` and `trail_segments`, exposes LineString coordinates via `ST_AsGeoJSON`, and uses `security_invoker` so base table RLS policies continue to apply. Clients never parse PostGIS WKB/hex.

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
