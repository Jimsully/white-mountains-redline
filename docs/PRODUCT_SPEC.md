# Product Specification — White Mountains Redline

## Product promise
A focused, independent White Mountains trail-completion tracker that makes redlining visual, measurable, shareable, and easier to plan.

## Primary user
A hiker attempting to walk every eligible trail/segment in a defined White Mountains challenge dataset.

## MVP jobs to be done
1. See the eligible trail network on one interactive map.
2. Instantly distinguish completed and unfinished segments.
3. Mark a segment complete manually.
4. Track mileage, segment count, and regional progress.
5. Search trails and open a permanent public trail page.
6. Import a GPX activity and review suggested completed segments.
7. Link a completion/activity to a trip report or photography page.
8. Share a public progress profile/map.

## Visual language
- Editorial/outdoors rather than generic SaaS.
- Warm paper background, charcoal ink, one red accent.
- Completed lines are red; incomplete lines are light neutral.
- The map is the product, not decoration.
- Mobile interaction must work with one hand after a hike.

## Initial screens
### 1. Redline map
Split desktop layout: progress/selection panel + map. Mobile becomes stacked panel + map.

### 2. Trail detail
Indexable page with verified factual data, original text, segment status, related activities, original photos/trip reports, and links back to the map.

### 3. Activity import/review
Upload GPX -> parse -> candidate segment matches -> user confirms/rejects -> completion records saved.

### 4. Public profile
Username, total completion %, regional completion, latest trips, shareable map.

### 5. Planner (post-MVP)
Prioritize unfinished segments and group nearby orphan segments into efficient outing candidates.

## Non-goals for MVP
- Turn-by-turn navigation.
- Offline topo navigation.
- Replacing the White Mountain Guide.
- Reproducing AMC map artwork or prose.
- Social feed, comments, follower graph.

## Success metrics
- User can update completion in <10 seconds.
- 100% of published segments have provenance and verification status.
- GPX candidate matching dramatically reduces manual marking while requiring human confirmation.
- Public trail pages generate organic entries into jamesscottsullivan.com.

## Publication Gate Product Rule
Overall redline progress is based on the published challenge dataset and user completion state. Reconciliation, topology approval, publication verification, activity evidence, and completion confirmation are separate states.

