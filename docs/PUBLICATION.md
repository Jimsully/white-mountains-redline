# Verified Publication

Milestone 5 adds the publication gate between topology-approved segment construction and production `trails` / `trail_segments`.

Accepted reconciliation is not a published trail. Accepted segment construction is not a published trail segment. Human publication verification is a separate trail-level and segment-level decision, and it still does not create `SegmentCompletion` records.

## Inputs

The publication builder requires all of these inputs:

- a segment-construction artifact
- the segment-construction decision export proving each candidate segment and both endpoint junctions were accepted
- a publication decision export with explicit trail and segment decisions
- accepted reconciliation lineage retained through the source segment candidates

Publication decisions use `verified_for_publication`, `rejected`, or `needs_review`. A segment can publish only when both the parent trail and the segment are `verified_for_publication`.

## Outputs

The committed demo output is:

`data/generated/publication/demo-verified-network.json`

It is deterministic, demo-only, not AMC data, and not for navigation. It contains production-shaped verified trails and trail segments with `dataStatus: "verified"`, `verificationStatus: "human_verified"`, deterministic production keys, and `completed: false`.

Private/local publication decisions belong under ignored `data/local/publication/`. Private generated outputs use `data/generated/publication/*.local.*`.

## Commands

Build the demo verified network:

```sh
npm run data:publication:build -- --segments data/generated/segments/demo-segment-construction.json --segment-decisions data/demo/segment-construction-decisions.demo.json --publication-decisions data/demo/publication-decisions.demo.json
```

Run activity matching from the verified publication artifact:

```sh
npm run data:activity:match -- --verified-network data/generated/publication/demo-verified-network.json --activities data/demo/activities
```

## Admin Artifact Loading

`/admin/publication` defaults to the committed demo artifact in every environment. `PUBLICATION_ARTIFACT_PATH` may point to a private/local artifact only in local development. When `NODE_ENV === "production"`, configuring `PUBLICATION_ARTIFACT_PATH` fails with:

`Private publication artifacts are local-development only until authenticated admin access is implemented.`

The app must not silently fall back to demo when an operator explicitly provides a private path in production.

## Supabase Loading

`npm run data:publication:load` is a controlled server-side/admin command only. It requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must never be exposed to browser code or committed.

The loader upserts verified `trails` and `trail_segments` through the service-role-only `load_verified_publication_batch` RPC. Database IDs remain bigint surrogate keys; production identity is carried by `trails.production_trail_key` and `trail_segments.segment_key`. The RPC records a publication run/fingerprint and stores `publication_run_id` on each published row. It does not create activities, completion evidence, or `SegmentCompletion` records. It refuses geometry, parent-trail, region, or canonical identity conflicts for existing verified keys.

