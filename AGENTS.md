# AGENTS.md — White Mountains Redline

## Mission
Build an independent, excellent White Mountains trail-completion tracker for jamesscottsullivan.com. It is a redlining/progress product first, not a general-purpose navigation app.

## Non-negotiables
1. Never present demo/unverified geometry as navigationally accurate.
2. Never copy AMC guide prose or map artwork into the repo.
3. Every production trail segment must retain source provenance and verification status.
4. The completion unit is a segment, not merely a named trail.
5. GPX matching must require user confirmation until explicitly changed by product decision.
6. Keep public pages indexable and fast; do not make login necessary to browse the trail database.
7. Completed trail color is the product's red accent; unfinished geometry stays visually subordinate.
8. Mobile usability is a first-class requirement.

## Current stack
- Next.js App Router / TypeScript
- MapLibre GL JS
- Supabase/Postgres/PostGIS (schema in `supabase/migrations`)

## Working style
- Before large changes, read `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, and `docs/DATA_MODEL.md`.
- Prefer small, reviewable commits.
- Add tests for geometry/progress logic when a test framework is introduced.
- Do not invent source trail facts. Add placeholders marked `demo`/`unverified` instead.
- Keep accessibility: keyboard reachable controls, adequate target sizes, labels, reduced-motion friendly transitions.

## Next Codex task
Implement Milestone 1 data plumbing without claiming the pilot dataset is verified:
1. Add a server-side trail repository abstraction with demo and Supabase adapters.
2. Add region/search filtering to the map.
3. Add a staging schema or script for imported GeoJSON with provenance.
4. Add unit tests for progress calculation and segment filtering.
5. Keep the existing prototype operational while data work progresses.
