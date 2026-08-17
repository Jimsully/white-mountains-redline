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