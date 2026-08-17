# Reconciliation

Milestone 2 builds a trail-level reconciliation workspace. It answers:

> Given one trail name from a private challenge inventory, which raw USFS trail feature or group of features most likely represents it?

It does not create verified completion segments.

## Data/IP rule
Do not commit an AMC White Mountain Guide-derived inventory to this public repository. Real inventory files belong in `data/local/challenge-inventory/`, which is ignored by git.

Committed inventory files are limited to:
- `data/templates/challenge-inventory.csv`: input template
- `data/demo/challenge-inventory.demo.csv`: clearly marked demo data only

The demo inventory is not a White Mountain Guide inventory and does not claim challenge membership.

## Pipeline

```text
raw USFS source feature
    ->
source trail group
    ->
challenge inventory item
    ->
reconciliation candidate
    ->
human accepted trail-level match
    ->
production Trail
    ->
junction-to-junction TrailSegments
    ->
human segment verification
    ->
redline completion network
```

Accepted reconciliation is not a verified trail segment. It is only a human trail-level match between an inventory item and raw source feature group evidence. Segment construction and segment verification happen later.

## Inventory validation

```bash
npm run data:inventory:validate -- data/templates/challenge-inventory.csv
```

The validator accepts arbitrary local paths. It parses CSV, requires `item_key` and `name`, reports duplicate `item_key` values with row numbers, normalizes whitespace, and reports duplicate normalized names. It never copies the supplied inventory into a committed path.

Recommended private location:

`data/local/challenge-inventory/`

## Name normalization
The matcher preserves display names and separately computes normalized names. It handles case, whitespace, punctuation, hyphens, apostrophes, `TRAIL` suffixes, `MT`/`MOUNT`, `MTN`/`MOUNTAIN`, `RD`/`ROAD`, and `&`/`AND`.

Normalization is intentionally conservative. It should help identify likely matches without changing trail identity.

## Source grouping
Raw USFS features are grouped by normalized source trail name. A group preserves:
- source display/original names
- normalized name
- source feature IDs
- source feature count
- total GIS miles
- bounding box
- MultiLineString representation
- source provider/provenance

Geometries are not destructively merged.

## Candidate scoring
Candidate evidence is inspectable and deterministic. It includes exact normalized-name matches, normalized-name similarity, token overlap, region hint presence, feature count, GIS miles, and source feature IDs.

Region hints are human review context only. They are not geographic compatibility evidence and do not add score until explicit boundaries or region rules are introduced.

Scores are candidate-generation aids only. No candidate automatically becomes verified.

## Reconciliation CLI

```bash
npm run data:reconcile -- --inventory data/demo/challenge-inventory.demo.csv
```

The CLI validates the inventory, loads committed staged USFS source data, groups source features, ranks candidates, prints summary counts, and writes JSON under `data/generated/reconciliation/`.

Demo output may be committed only when the input inventory path is under `data/demo/`. A filename ending in `.demo.csv` somewhere else is still private. Real local inventory-derived output is written as `*.local.*`, ignored, and records `local/private inventory path omitted` instead of the original absolute path.

## Review workspace
Open `/admin/reconciliation` in development. By default it loads the committed demo reconciliation artifact. To review a private local artifact, set the server-only `RECONCILIATION_ARTIFACT_PATH` environment variable before starting Next.js; do not use `NEXT_PUBLIC_*` for this path. Private artifacts are local-development only until authenticated admin access exists. If `RECONCILIATION_ARTIFACT_PATH` is configured while `NODE_ENV=production`, the page fails safely with `Private reconciliation artifacts are local-development only until authenticated admin access is implemented.` rather than falling back to demo.

PowerShell example:

```powershell
$env:RECONCILIATION_ARTIFACT_PATH="C:\Users\james\Documents\Codex\2026-08-16\white-mountains-redline-work\data\generated\reconciliation\reconciliation.local.123.json"
npm run dev
```

The private inventory path is never sent to the browser. The page is a source reconciliation workspace, not a public redlining page. It is marked:

`SOURCE RECONCILIATION WORKSPACE * NOT FOR NAVIGATION * NOT CHALLENGE VERIFIED`

Prototype review decisions are stored in browser `localStorage`. Exported JSON contains the inventory item key, selected candidate normalized name, selected source feature IDs, decision, timestamp, and optional notes.

Review decisions are not authoritative and are never silently promoted into `trails` or `trail_segments`.

## Future persistence
Migration 005 adds tables for future persisted reconciliation:
- `challenge_editions`
- `challenge_inventory_items`
- `reconciliation_candidates`
- `reconciliation_decisions`

Public app users do not have mutation access. These tables are for controlled admin/review workflows.

## Segment construction handoff
Milestone 3 consumes only accepted reconciliation decisions as `AcceptedTrailSource` inputs for topology construction. This handoff still does not create verified production segments.

Accepted reconciliation != verified segment. Proposed junction != verified junction. Accepted segment-construction candidate != published completion segment.

See `docs/SEGMENT_CONSTRUCTION.md` for the junction/segment candidate lifecycle.
