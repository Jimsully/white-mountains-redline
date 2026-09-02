# Data Model

## Core distinction: trail vs segment
A named trail is not the atomic completion unit. The atomic unit is a **segment** bounded by stable junctions/endpoints. This prevents partial hikes from incorrectly completing an entire named trail.

## Raw source data
`import_batches` records each ingestion run: provider, dataset, URL, requested envelope, requested fields, import timestamp, summary counts, and notes.

`source_trail_features` stores individual source GIS records exactly as source evidence. Each row keeps provider, dataset, source feature ID, canonical source URL, optional query URL/record reference, import timestamp, original properties as JSONB, EPSG:4326 geometry, optional region hint, reconciliation status, source length fields, and `gis_miles` when provided.

Raw source features are not production challenge segments. A USFS source line can be authoritative for its own dataset and still be unverified for this product's challenge semantics.

## `trails`
Canonical named route concept: name, slug, region, source/provenance, data status, and verification state.

## `trail_segments`
The completion unit: stable segment key, parent trail, miles, LineString geometry, provenance, source feature IDs, manual geometry modification flag, verification notes/status, and data status.

A production segment must retain provenance sufficient to answer:
- Where did this geometry come from?
- Which raw source feature or features contributed to it?
- Was the geometry manually modified?
- When was it reviewed?
- What is the verification state?

## `trail_segment_api`
Read-only REST projection for the app repository. It returns application fields plus GeoJSON LineString coordinates derived in SQL. Migration 013 hardens it as an owner-rights, `security_barrier` public projection with explicit verified plus human-verified predicates. Browser roles may select this projection only; they must not directly select `trails` or `trail_segments`.

## `activities`
A user's hike/import: date, title, source, optional GPS geometry, total distance, notes, trip-report URL.

## `segment_completions`
Join between user and segment. It records completion date, method, linked activity, optional confidence, notes. Unique per user+segment.

M7D-B adds no columns or relationships. Its database RPC boundary creates an evidence-backed row only after explicit authenticated confirmation, with `completion_method = 'gpx_match'`, null confidence/notes, and `completed_on` derived only from the immutable validated `completion_evidence.provenance.activityDate` snapshot. Accepted evidence without confirmation remains evidence, not completion. Raw evidence stays private; the read RPC returns only a fixed sanitized owner projection.

M7D-C adds application types for that fixed projection and confirmation result, not new persistence. Dates remain serializable strings and production bigint segment IDs remain validated decimal strings. The SSR repository validates the complete sanitized projection, while the client account section receives only the opaque evidence ID and fields it displays: trail/segment names, region, evidence source, optional activity title, and immutable activity date. It does not receive the unused segment ID or acceptance timestamp, raw evidence, or matching internals.

## TypeScript domain concepts
- `SourceTrailFeature`: raw source GIS feature, original attributes, raw geometry, source URLs/record refs, and reconciliation status.
- `Trail`: named route concept after reconciliation.
- `TrailSegment`: junction-to-junction completion unit with challenge provenance.
- `DataStatus`: publication/data lifecycle such as `demo`, `unverified`, `verified`, or `retired`.
- `VerificationStatus`: product review state such as `raw_source`, `needs_reconciliation`, `reconciled`, or `human_verified`.
- `SourceProvenance`: provider, dataset, source IDs, source URL, import/review metadata, and manual-modification flag.

## Provenance rules
Every imported trail/segment must retain enough source metadata to answer:
- Where did this geometry/name come from?
- When was it last reviewed?
- Was it manually altered?
- Which challenge inventory record does it correspond to?

Do not use `verified` as a synonym for "came from an authoritative source." Verification means the **specific challenge segment identity, endpoints, and geometry** have been reviewed for this product.

## Reconciliation model
Milestone 2 introduces challenge inventory and trail-level reconciliation concepts that are separate from raw source features and production trail segments.

- `ChallengeEdition`: version/edition container for a private inventory.
- `ChallengeInventoryItem`: one private inventory row with stable key, display name, normalized name, optional region hint, notes, and review status.
- `SourceTrailGroup`: non-destructive grouping of raw source features by normalized source name.
- `ReconciliationCandidate`: scored possible source group match for an inventory item.
- `ReconciliationDecision`: human review decision such as accepted, rejected, or needs review.

Migration 005 creates future persistence tables for these concepts. An accepted reconciliation decision does not create a production Trail and is not a verified junction-to-junction TrailSegment.

## Segment Construction Model
Milestone 3 adds segment-construction concepts separate from production `TrailSegment`:

- `AcceptedTrailSource`: accepted trail-level reconciliation evidence and source geometry.
- `JunctionCandidate`: proposed endpoint, crossing, near-miss, manual, or source-boundary topology point with review state.
- `SegmentCandidate`: proposed junction-to-junction LineString with calculated miles, source feature IDs, split metadata, warnings, and review state.
- `SegmentConstructionArtifact`: deterministic JSON output containing accepted sources, junction candidates, segment candidates, tolerances, algorithm version, and diagnostics.
- `SegmentReviewDecision`: prototype review decision for a junction or segment candidate.

These records are review artifacts. They are not production `trails`, not production `trail_segments`, and not human-verified completion units.


## Activity Matching

Milestone 4 adds a local, review-first activity matching layer after segment construction: approved canonical matching segments plus historical GPS activity traces produce algorithmic match candidates and human-reviewed completion evidence. GPS traces are evidence, not canonical geometry; strong candidates are not completions; accepted evidence is not a production SegmentCompletion row. See docs/ACTIVITY_MATCHING.md.

Activity matching hardening: GPS edges beyond maximumInterpolatedActivityEdgeMeters are evidence gaps, separate activity components cannot combine into strong evidence, bbox matching is meter-aware, and source activity IDs dominate stable activity identity. See docs/ACTIVITY_MATCHING.md.

Milestone 4 final hardening stores explicit per-component componentEvidence, requires bestStrongComponentIndex for strong matches, renders trusted activity lines without ignored GPS gaps, redacts private filesystem metadata, and reports unique ignored activity edges. See docs/ACTIVITY_MATCHING.md.

## Publication State
Production trail data requires both data_status = 'verified' and verification_status = 'human_verified' on the parent trails row and child trail_segments row. Publication decisions are separate from reconciliation, topology decisions, activity evidence, and segment_completions.


## Accounts And Profiles
`profiles` is the durable public-safe user profile table. It is owned by `auth.users(id)` and stores only `username`, `display_name`, `is_public`, and timestamps. It does not store email, tokens, raw JWTs, provider secrets, or arbitrary auth metadata.

Migration 009 changes the default profile privacy to `is_public = false`, adds `updated_at`, and enforces optional lowercase username plus 120-character display-name limits at the database boundary. Profile creation is idempotent through a narrowly scoped auth trigger.

Profile rows are separate from activities, activity evidence, and completions. A signed-in user is not the same as a completed segment.

## Account RLS Boundary
Profiles are public only when `is_public = true`; authenticated users can read and update only their own private profile. Activities are private user rows with authenticated owner-only select/insert/update/delete policies. Activity updates use both `USING` and `WITH CHECK` to prevent ownership changes.

M6 revokes authenticated mutation privileges on `segment_completions` and leaves `completion_evidence` service/admin controlled. Historical own completion reads can remain for compatibility, but M6 application code must not write completions or promote GPS evidence.
