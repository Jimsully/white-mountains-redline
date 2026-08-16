# White Mountains Redline

Independent White Mountains trail-completion tracker intended to live alongside `jamesscottsullivan.com`.

## What is included now
- Next.js 16 App Router scaffold.
- MapLibre interactive map.
- Trail repository abstraction with demo and Supabase adapters.
- Demo trail segment completion toggles, filtering, and progress calculation.
- Indexable demo trail route.
- Supabase/PostGIS production schema plus raw source GIS staging schema.
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

The current Supabase adapter expects public read access to `trail_segments` joined to `trails`, and a GeoJSON projection column or view field named `geom_geojson`.

## Import raw USFS source data
```bash
npm run data:import:usfs
```

This uses the ArcGIS query API for the USDA Forest Service National Forest System Trails service and an approximate Franconia/Pemigewasset ingestion envelope. The envelope is not a canonical region boundary.

Generated staging files are written to:

`data/staging/usfs/franconia-pemi/`

Those files are source GIS artifacts only. Review and reconcile them before any production challenge segment is created.

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
