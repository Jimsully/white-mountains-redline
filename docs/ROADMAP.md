# Roadmap

## M0 Foundation — COMPLETE
Established the Next.js/TypeScript scaffold, demo trail UI, MapLibre integration, repository abstraction, Supabase migration baseline, and non-navigation demo-data guardrails.

## M1 Source data plumbing / USFS pilot — COMPLETE
Added deterministic USFS source download/normalization, broad raw staging artifacts, optional service-role staging load, source provenance, and Supabase API projection hardening.

## M2 Challenge reconciliation — COMPLETE
Added local challenge-inventory validation, source-to-inventory reconciliation artifacts, admin review tooling, private artifact guards, and committed demo reconciliation output.

## M3 Segment construction + topology review — COMPLETE
Added topology-aware segment candidate construction, junction/segment review decisions, deterministic demo segment-construction artifacts, and admin topology review tooling.

## M4 Historical activity matching — COMPLETE
Added conservative GPS activity normalization and matching against accepted topology candidates, evidence review tooling, private metadata redaction, and demo activity matching fixtures without creating completions.

## M5 Verified segment publication — COMPLETE
Added the verified publication gate between topology-approved segment construction and production `trails` / `trail_segments`, including canonical region review, deterministic production keys, verified-only public data access, service-role-only publication loading, and activity matching from the verified network.

## M6 Accounts + user persistence — COMPLETE
Added authenticated user accounts, durable user profile state, and private ownership boundaries for account and activity persistence.

## M7 User completion workflow + activity evidence promotion — IN PROGRESS
M7A manual completion security, M7B persisted manual completion, and M7C segment browsing with synchronized map selection are complete. M7C passed manual localhost acceptance. M7D-A now provides controlled service-role materialization of reviewed private GPS evidence into owned activities and accepted completion evidence. M7D-B sanitized evidence read/confirmation RPCs and M7D-C evidence UI are not implemented; M7E scroll-active selection remains optional later polish. GPS evidence remains evidence and does not become completion without explicit user confirmation.

## M8 Public trail pages / website / SEO
Expand public trail browsing, static trail pages, search/indexing polish, and website integration for jamesscottsullivan.com.

## M9 Full challenge inventory + edition/versioning
Introduce the complete privately verified challenge inventory, public-safe challenge editions, segment lineage, and historical versioning.

## M10 Planner / orphan segment optimization
Add planning tools for remaining segments, orphan cleanup, route grouping, and optimization once verified production data exists.
