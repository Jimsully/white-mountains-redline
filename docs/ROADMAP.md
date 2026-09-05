# Roadmap

## M0 Foundation - COMPLETE
Established the Next.js/TypeScript scaffold, demo trail UI, MapLibre integration, repository abstraction, Supabase migration baseline, and non-navigation demo-data guardrails.

## M1 Source data plumbing / USFS pilot - COMPLETE
Added deterministic USFS source download/normalization, broad raw staging artifacts, optional service-role staging load, source provenance, and Supabase API projection hardening.

## M2 Challenge reconciliation - COMPLETE
Added local challenge-inventory validation, source-to-inventory reconciliation artifacts, admin review tooling, private artifact guards, and committed demo reconciliation output.

## M3 Segment construction + topology review - COMPLETE
Added topology-aware segment candidate construction, junction/segment review decisions, deterministic demo segment-construction artifacts, and admin topology review tooling.

## M4 Historical activity matching - COMPLETE
Added conservative GPS activity normalization and matching against accepted topology candidates, evidence review tooling, private metadata redaction, and demo activity matching fixtures without creating completions.

## M5 Verified segment publication - COMPLETE
Added the verified publication gate between topology-approved segment construction and production `trails` / `trail_segments`, including canonical region review, deterministic production keys, verified-only public data access, service-role-only publication loading, and activity matching from the verified network.

## M6 Accounts + user persistence - COMPLETE
Added authenticated user accounts, durable user profile state, and private ownership boundaries for account and activity persistence.

## M7 User completion workflow + activity evidence promotion - COMPLETE
Completed authenticated manual completion security, persisted user completion state, synchronized map/list segment selection, controlled reviewed-evidence materialization, sanitized authenticated evidence reads, explicit owner confirmation, account evidence-confirmation UI, Migration 013 public trail projection hardening, disposable local Supabase runtime acceptance, service-role publication regression acceptance, reviewed-evidence runtime acceptance, production migration/application acceptance, and GitHub CI coverage. GPS evidence, strong matches, and accepted evidence remain distinct from completion until explicit user confirmation.

## M8 Public trail pages / website / SEO - COMPLETE
M8A - real public trail detail foundation - COMPLETE.
M8B - public trail directory/search/navigation - COMPLETE. Authenticated directory progress filters remain later polish; the directory currently stays public-only.
M8C - SEO/indexing foundation - COMPLETE.
M8D - production hosting and site integration - COMPLETE:

- M8D-A - Redline hosting readiness - COMPLETE.
- M8D-B - portfolio integration/cross-linking - COMPLETE.
- M8D-C - production deployment/cutover - COMPLETE following human-operated production acceptance. The live site is `https://trails.jamesscottsullivan.com`; production authentication passed with a brand-new email address.

M8E - responsive/accessibility/design polish - COMPLETE. Closeout corrected production/demo labeling, mobile viewport and scroll behavior, touch targets, contrast/focus treatment, progress/filter semantics, map loading/fallback affordances, public projection minimization, and hosted-production repository fail-closed behavior. Minor post-deploy viewport polish is tracked separately from the milestone.

M8E remains complete at the repository milestone level. Its September 5, 2026 production rollout acceptance is not complete: migration 014 is applied to the documented linked Supabase project, but that project has no trail data and the live Vercel production deployment still serves the previous demo repository. Do not merge/deploy the fail-closed M8E application until the production Supabase identity/data and Vercel Production environment are reconciled.

## M9 Full challenge inventory + edition/versioning
Introduce the complete privately verified challenge inventory, public-safe challenge editions, segment lineage, and historical versioning.

## M10 Planner / orphan segment optimization
Add planning tools for remaining segments, orphan cleanup, route grouping, and optimization once verified production data exists.
