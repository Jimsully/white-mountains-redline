# Data Pipeline

White Mountains Redline keeps source GIS data, challenge concepts, and verified public completion segments separate.

```text
USFS raw feature
    ↓
staging/source feature
    ↓
normalization/reconciliation
    ↓
challenge trail
    ↓
junction-to-junction challenge segment
    ↓
human verification
    ↓
public production layer
```

## 1. USFS raw feature
The importer queries the USDA Forest Service National Forest System Trails ArcGIS service:

`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0`

The current development command uses an approximate Franconia/Pemigewasset ingestion envelope:

- west: -71.95
- south: 43.75
- east: -71.35
- north: 44.35

This envelope is only a practical ingestion boundary. It is not a canonical region definition and not a challenge boundary.

## 2. Staging/source feature
Downloaded features are normalized into `SourceTrailFeature` records and written to `data/staging/usfs/franconia-pemi/`. In Supabase, the equivalent persistence layer is `import_batches` plus `source_trail_features`.

Each source feature retains original properties, source provider, dataset, source feature ID, canonical source URL, optional query URL/record ref, import timestamp, geometry in EPSG:4326, optional region hint, source length fields including `gis_miles` when available, and reconciliation status.

The raw import is intentionally broad. Snowmobile, XC, mountain-bike, climbing, and other trail records remain in staging. Later reconciliation decides whether any source feature belongs in a hiking/redlining challenge dataset.

## 3. Optional staging load
`npm run data:import:usfs -- --load` requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It calls `load_source_trail_feature_batch`, which creates an `import_batches` record and upserts `source_trail_features`.

The load path is staging-only. It never creates `trails`, never creates `trail_segments`, and never marks data verified.

## 4. Normalization/reconciliation
Normalization makes source data easier to inspect, but it does not make challenge claims. Reconciliation is the later human/product step that decides whether and how source features map to a challenge trail concept.

## 5. Challenge trail
A challenge trail is a product concept, not a raw GIS record. Its identity must be reviewed against the legally approved challenge inventory/version.

## 6. Junction-to-junction challenge segment
Completion is tracked by segment, not merely by trail name. A segment must have stable endpoints and enough provenance to show which source feature or features contributed to its geometry.

## 7. Human verification
Human verification confirms challenge identity, endpoints, geometry, and provenance. Authoritative-source geometry is not equivalent to challenge verification.

## 8. Public production layer
Only verified production challenge segments should be presented as part of the public completion layer. Demo geometry and raw source GIS must remain visibly marked as not for navigation and not challenge verified.

## 9. Trail-level reconciliation
Milestone 2 inserts an explicit trail-level reconciliation stage before production Trail creation:

```text
raw USFS source feature
    ↓
source trail group
    ↓
challenge inventory item
    ↓
reconciliation candidate
    ↓
human accepted trail-level match
    ↓
production Trail
    ↓
junction-to-junction TrailSegments
    ↓
human segment verification
    ↓
redline completion network
```

A real challenge inventory must be supplied from an ignored local path such as `data/local/challenge-inventory/`. Committed reconciliation artifacts must use demo/test inventory data only.

Accepted reconciliation is not a verified trail segment.

## 10. Segment construction
Milestone 3 inserts a topology construction stage after accepted trail-level reconciliation and before production Trail/TrailSegment publishing:

```text
raw source feature
    ->
source trail group
    ->
challenge inventory item
    ->
accepted trail-level reconciliation
    ->
accepted trail source geometry
    ->
junction candidates
    ->
segment candidates
    ->
human topology review
    ->
approved segment construction
    ->
production Trail / TrailSegments
    ->
human segment verification
    ->
completion network
```

The builder uses explicit meter tolerances, records provenance, and emits proposed candidates with review status. It does not publish verified trail segments automatically.


## Activity Matching

Milestone 4 adds a local, review-first activity matching layer after segment construction: approved canonical matching segments plus historical GPS activity traces produce algorithmic match candidates and human-reviewed completion evidence. GPS traces are evidence, not canonical geometry; strong candidates are not completions; accepted evidence is not a production SegmentCompletion row. See docs/ACTIVITY_MATCHING.md.

Activity matching hardening: GPS edges beyond maximumInterpolatedActivityEdgeMeters are evidence gaps, separate activity components cannot combine into strong evidence, bbox matching is meter-aware, and source activity IDs dominate stable activity identity. See docs/ACTIVITY_MATCHING.md.

Milestone 4 final hardening stores explicit per-component componentEvidence, requires estStrongComponentIndex for strong matches, renders trusted activity lines without ignored GPS gaps, redacts private filesystem metadata, and reports unique ignored activity edges. See docs/ACTIVITY_MATCHING.md.
