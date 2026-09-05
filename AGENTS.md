# AGENTS.md - White Mountains Redline

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
9. Do not commit guide-derived challenge inventories. Use `data/local/challenge-inventory/` for private local inventory inputs.
10. Accepted reconciliation is not a verified trail segment.
11. Proposed or accepted segment-construction candidates are not published completion segments.

## Current stack
- Next.js App Router / TypeScript
- MapLibre GL JS
- Supabase/Postgres/PostGIS (schema in `supabase/migrations`)
- Local CSV/JSON reconciliation and segment-construction tooling for admin review

## Working style
- Before large changes, read `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DATA_PIPELINE.md`, and `docs/RECONCILIATION.md` when present.
- Prefer small, reviewable commits.
- Add tests for geometry/progress/reconciliation/segment-construction logic when a test framework is introduced.
- Do not invent source trail facts. Add placeholders marked `demo`/`unverified` instead.
- Keep accessibility: keyboard reachable controls, adequate target sizes, labels, reduced-motion friendly transitions.

## Current Codex task focus
Milestones 0 through 8 are complete. The production site is live at `https://trails.jamesscottsullivan.com`; production database, account/authentication, public browsing, completion, evidence-confirmation, admin-blocking, and cutover acceptance have succeeded, including a brand-new email account. M9 remains Full challenge inventory + edition/versioning and is the next implementation milestone. Preserve the existing segment/completion identities and explicit confirmation boundary; GPS evidence, strong matches, and accepted evidence remain distinct from completion until explicit user confirmation.
