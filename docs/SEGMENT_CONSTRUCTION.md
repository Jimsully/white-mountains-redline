# Segment Construction

Milestone 3 converts human-accepted trail-level reconciliation evidence into proposed junction-to-junction topology candidates.

It does not create production `Trail` or `TrailSegment` records, and it does not verify any completion segment.

## Lifecycle

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

Explicit boundaries:

- accepted reconciliation != verified segment
- proposed junction != verified junction
- accepted segment-construction candidate != published completion segment

## Inputs

The segment builder accepts:

```bash
npm run data:segments:build -- \
  --reconciliation data/generated/reconciliation/demo-reconciliation.json \
  --decisions data/demo/reconciliation-decisions.demo.json
```

Only accepted reconciliation decisions become `AcceptedTrailSource` records. Accepted decisions must explicitly identify a selected candidate and selected source feature IDs whose set exactly matches the selected candidate/source group in the reconciliation artifact; stale or inconsistent decisions fail deterministically instead of falling back to a first candidate. Private paths are omitted from generated metadata. Only committed demo inputs may write `data/generated/segments/demo-segment-construction.json`; private runs write ignored `segment-construction.local.*.json` files.

## Topology Model

The domain model is separate from production `TrailSegment` and includes:

- `AcceptedTrailSource`
- `JunctionCandidate`
- `SegmentCandidate`
- `SegmentConstructionArtifact`
- `SegmentReviewDecision`

Every candidate keeps source feature IDs, reconciliation evidence, calculated geometry length, algorithm version, review status, and warning flags. Component-level source-feature provenance is currently coarse: each constructed component carries the full accepted source-feature set until human review can assign finer attribution.

## Tolerances

Topology decisions use centralized meter tolerances in `lib/segment-construction/config.ts`:

- `endpointSnapToleranceMeters`
- `intersectionToleranceMeters`
- `junctionDeduplicationToleranceMeters`
- `sameTrailAutoConnectToleranceMeters`
- `geometryLengthEpsilonMeters`
- `minimumSegmentLengthMeters`

`intersectionToleranceMeters` remains the broader point-on-line/topology-review threshold. `junctionDeduplicationToleranceMeters`, `sameTrailAutoConnectToleranceMeters`, and `geometryLengthEpsilonMeters` are intentionally tighter so numerical noise can be handled without hiding real topology decisions. These are conservative tuning parameters for review, not universal truths.

## Detection Rules

The builder proposes junction candidates from trail endpoints and cross-trail intersections. Near misses inside the configured tolerance become `ambiguous_near_intersection` candidates with measured distance and `needs_review` status.

Coarse same-trail source component boundaries are recorded in diagnostics but are not automatic completion segment boundaries. Same-trail components are auto-joined only when endpoints are within `sameTrailAutoConnectToleranceMeters`; any source-boundary snap is reported with distance diagnostics. Components that are farther apart than that small tolerance but within the broader topology tolerance are preserved as separate topology components and reported as `same_trail_component_near_connection` review warnings. They should only become split points when they also correspond to real topology or later manual review.

Exact crossing detections are deduplicated only within `junctionDeduplicationToleranceMeters`, not the broader intersection tolerance, so distinct nearby crossings remain separate candidates. Review-only `ambiguous_near_intersection` and excessive-spread clusters remain diagnostics/review candidates and are not used as interior split points before review. Endpoint junctions still bound each source line so review-only interior candidates cannot make an input component disappear. Candidate keys are deterministic and include `SEGMENT_CONSTRUCTION_ALGORITHM_VERSION`, stable participating evidence, reason context, source component fingerprints, and quantized coordinates. Rebuilding unchanged input should preserve keys even if unchanged connected source components arrive in a different order.

## Review Workspace

`/admin/segments` displays the committed demo segment-construction artifact. A private local artifact can be loaded in development with server-only `SEGMENT_CONSTRUCTION_ARTIFACT_PATH`.

Private artifact loading is blocked in production until authenticated admin access exists. The route is noindex/nofollow and visibly marked:

`SEGMENT CONSTRUCTION WORKSPACE * NOT FOR NAVIGATION * NOT SEGMENT VERIFIED`

Prototype decisions remain in localStorage and can be exported as `segment-construction-decisions.prototype.json`. Exported decisions do not publish production segments. The builder runs a topology integrity validator and fails before writing an artifact when hard invariants are violated.

## Activity Matching

Milestone 4 adds a local, review-first activity matching layer after segment construction: approved canonical matching segments plus historical GPS activity traces produce algorithmic match candidates and human-reviewed completion evidence. GPS traces are evidence, not canonical geometry; strong candidates are not completions; accepted evidence is not a production SegmentCompletion row. See docs/ACTIVITY_MATCHING.md.

Activity matching hardening: GPS edges beyond maximumInterpolatedActivityEdgeMeters are evidence gaps, separate activity components cannot combine into strong evidence, bbox matching is meter-aware, and source activity IDs dominate stable activity identity. See docs/ACTIVITY_MATCHING.md.

Milestone 4 final hardening stores explicit per-component componentEvidence, requires estStrongComponentIndex for strong matches, renders trusted activity lines without ignored GPS gaps, redacts private filesystem metadata, and reports unique ignored activity edges. See docs/ACTIVITY_MATCHING.md.
