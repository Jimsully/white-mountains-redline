# White Mountains Redline

Independent White Mountains trail-completion tracker intended to live alongside `jamesscottsullivan.com`.

## What is included now
- Next.js 16 App Router scaffold.
- MapLibre interactive map.
- Demo trail segment completion toggles and progress calculation.
- Indexable demo trail route.
- Supabase/PostGIS production schema.
- Data import starter script.
- Product, architecture, data-model, IP/data, and roadmap docs.
- `AGENTS.md` for Codex.
- Zero-install offline visual prototype in `prototype/index.html`.

**Important:** All trail geometry shipped in the code scaffold is intentionally simplified demo geometry and is not for navigation.

## Run the Next.js app
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

The package versions were selected for August 2026: Next.js 16.3.1 and MapLibre GL JS 6.4.0. Review/update dependencies before a later production deployment.

## Preview without npm
Open `prototype/index.html` directly in a browser. This prototype uses only HTML/CSS/JS and contains no real trail geography.

## Recommended production sequence
1. Build/verify the first regional trail-segment dataset.
2. Create Supabase project and apply `supabase/migrations/001_init.sql`.
3. Replace demo data via a repository abstraction.
4. Add authentication/persistence.
5. Add GPX matching with human confirmation.
6. Integrate into `jamesscottsullivan.com` via `/redline` or a subdomain.

## Naming
"White Mountains Redline" is a working independent name. Do not imply AMC sponsorship or endorsement.
