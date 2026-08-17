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
Read-only REST projection for the app repository. It returns application fields plus GeoJSON LineString coordinates derived in SQL. It uses `security_invoker` so RLS on `trails` and `trail_segments` remains authoritative.

## `activities`
A user's hike/import: date, title, source, optional GPS geometry, total distance, notes, trip-report URL.

## `segment_completions`
Join between user and segment. It records completion date, method, linked activity, optional confidence, notes. Unique per user+segment.

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
