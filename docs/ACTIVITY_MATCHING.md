# Activity Matching

Milestone 4 introduces local historical activity-to-segment matching. It answers which human-approved prototype segment-construction candidates a GPS trace may support as completion evidence.

Lifecycle:

raw GIS -> reconciliation -> segment construction -> approved canonical matching segment -> historical GPS activity -> algorithmic match candidate -> human-reviewed completion evidence -> future SegmentCompletion

Core boundaries:

- GPS trace geometry is evidence, not canonical trail geometry.
- A `strong_candidate` is not a completion.
- Accepting completion evidence does not create a production `SegmentCompletion` row.
- Activity matching only uses explicitly accepted segment candidates whose start and end junctions are also explicitly accepted.
- Missing or stale segment-construction decision exports fail; the matcher does not fall back to proposed topology.

Local inputs:

- Demo activities live in `data/demo/activities/` and are committed synthetic fixtures only.
- Real activity files belong in `data/local/activities/`, which is ignored except `.gitkeep`.
- Private generated artifacts are written as `data/generated/activity-matching/activity-matching.local.<timestamp>.json` and are ignored.

Admin artifact loading:

`/admin/activity-matching` shows the committed demo artifact by default. `ACTIVITY_MATCHING_ARTIFACT_PATH` can point at a local private artifact for development. Private artifacts are blocked when `NODE_ENV === "production"` until authenticated admin access exists.

Privacy:

Historical activity data is user-location history. Do not commit real GPS traces, OAuth tokens, service credentials, or private artifact paths. Future user-facing activity privacy should default to private unless a user explicitly shares it.

CLI:

```bash
npm run data:activity:validate -- data/demo/activities
npm run data:activity:match -- --segments data/generated/segments/demo-segment-construction.json --segment-decisions data/demo/segment-construction-decisions.demo.json --activities data/demo/activities
```

The v1 matcher samples canonical segment geometry at configured meter intervals and measures each sample's distance to the activity trace. It does not define completion by counting GPS points near a trail.

## Matcher Integrity

Activity edges longer than maximumInterpolatedActivityEdgeMeters are treated as GPS evidence gaps. The endpoint points remain evidence, but the matcher does not interpolate across that distance and call it observed traversal.

Strong candidates use stricter proximity thresholds (strongMaximumMedianDistanceMeters and strongMaximumP95DistanceMeters) than general review candidates. A high-coverage nearby parallel trace that misses those strong thresholds is held for 
eeds_review rather than treated as complete-quality evidence.

Strong candidates also require one activity trace component to satisfy the coverage and endpoint requirements on its own. Separate GPX 	rkseg components can produce useful union evidence, but they cannot silently combine into strong traversal continuity.

The spatial prefilter expands latitude and longitude independently using meter-aware conversion at the relevant latitude. It is intentionally conservative: false positives are acceptable because full scoring follows; false negatives are not.

Activity identity is stable when a source activity ID exists: the key is derived from the activity-key version, source, and source activity ID, not mutable title or filename text. Without a source ID, fallback identity uses source, start time, and an orientation-stable geometry fingerprint.


## Final Integrity Corrections

Each match now stores componentEvidence records with per-component coverage, endpoint distances, median/p95/max sample distance, and uncovered gap ratio. estStrongComponentIndex is set only when one same activity component independently satisfies every strong threshold; coverage from one component cannot be combined with endpoint or proximity evidence from another.

Admin map previews are rendered from the shared trusted-trace helper used by scoring. Edges longer than maximumInterpolatedActivityEdgeMeters are split and shown as dashed evidence gaps instead of continuous traversed lines.

Artifact-level ignoredActivityEdgeCount counts unique ignored activity edges once per activity. Per-match ignoredLongActivityEdgeCount remains available as evidence, but global diagnostics are not multiplied by the number of segments scored.

Match evidence keeps both awActivityTraceLengthMeters and 	rustedActivityEvidenceLengthMeters; raw length may include GPS gaps that were not used as continuous traversal evidence.

Private generated and loaded artifacts redact filesystem provenance from activity sourceMetadata, including obvious Windows/POSIX absolute paths and nested path-like metadata keys, while preserving ordinary safe metadata.
