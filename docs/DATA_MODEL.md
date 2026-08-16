# Data Model

## Core distinction: trail vs segment
A named trail is not the atomic completion unit. The atomic unit is a **segment** bounded by stable junctions/endpoints. This prevents partial hikes from incorrectly completing an entire named trail.

## `trails`
Canonical named route concept: name, slug, region, source/provenance, verification state.

## `trail_segments`
The completion unit: stable segment key, parent trail, miles, LineString geometry, provenance, verification notes/status.

## `activities`
A user's hike/import: date, title, source, optional GPS geometry, total distance, notes, trip-report URL.

## `segment_completions`
Join between user and segment. It records completion date, method, linked activity, optional confidence, notes. Unique per user+segment.

## Provenance rules
Every imported trail/segment must retain enough source metadata to answer:
- Where did this geometry/name come from?
- When was it last reviewed?
- Was it manually altered?
- Which challenge inventory record does it correspond to?

Do not use `verified` as a synonym for "came from an authoritative source." Verification means the **specific challenge segment identity, endpoints, and geometry** have been reviewed for this product.
