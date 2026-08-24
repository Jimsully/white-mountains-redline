# Database Relationships

This document summarizes current foreign keys and deletion behavior from migrations 001 through 011. Migrations remain authoritative.

## Auth Ownership

```text
auth.users
  -> profiles.id on delete cascade
  -> activities.user_id on delete cascade
  -> segment_completions.user_id on delete cascade
  -> completion_evidence.user_id on delete cascade
```

Profile, activity, completion, and evidence ownership are separate concepts. A signed-in user is not a completed segment.

## Trail Publication Graph

```text
publication_runs
  -> trails.publication_run_id
  -> trail_segments.publication_run_id

trails
  -> trail_segments.trail_id on delete cascade
```

Production public visibility requires verified/human-reviewed status on both the parent trail and child segment.

## Completion Graph

```text
auth.users
  -> segment_completions.user_id on delete cascade

trail_segments
  -> segment_completions.segment_id on delete cascade

activities
  -> segment_completions.activity_id on delete set null

completion_evidence
  -> segment_completions.completion_evidence_id on delete no action
```

Important implications:
- Deleting a user cascades their completions.
- Deleting a trail segment cascades related completions.
- Deleting an activity preserves completion rows but nulls `activity_id`.
- Deleting evidence referenced by a completion is blocked by `ON DELETE NO ACTION`.
- Authenticated users may not update `segment_completions`.

M7A currently supports authenticated manual completion only. GPS/evidence confirmation is future M7D work.

## Raw Source Import Graph

```text
import_batches
  -> source_trail_features.import_batch_id on delete set null
```

Raw source features are broad staging evidence. They are not verified challenge segments and do not create completions.

## Reconciliation Graph

```text
challenge_editions
  -> challenge_inventory_items.edition_id on delete cascade

challenge_inventory_items
  -> reconciliation_candidates.inventory_item_id on delete cascade
  -> reconciliation_decisions.inventory_item_id on delete cascade

reconciliation_candidates
  -> reconciliation_decisions.candidate_id on delete set null

auth.users
  -> reconciliation_decisions.decided_by on delete set null
```

Accepted reconciliation is trail-level evidence, not a production completion unit.

## Segment Construction Graph

```text
segment_construction_runs
  -> junction_candidates.run_id on delete cascade
  -> segment_candidates.run_id on delete cascade

junction_candidates
  -> junction_review_decisions.junction_candidate_id on delete cascade

segment_candidates
  -> segment_review_decisions.segment_candidate_id on delete cascade
```

Segment construction produces reviewed topology candidates. It does not publish production `trail_segments` by itself.

## Activity Matching And Evidence Graph

```text
activity_match_runs
  -> activity_segment_match_candidates.run_id on delete cascade

activities
  -> activity_segment_match_candidates.activity_id on delete set null
  -> completion_evidence.activity_id on delete set null

trail_segments
  -> activity_segment_match_candidates.future_trail_segment_id on delete set null
  -> completion_evidence.future_trail_segment_id on delete set null

activity_segment_match_candidates
  -> activity_segment_match_review_decisions.match_candidate_id on delete cascade
  -> completion_evidence.match_candidate_id on delete set null
```

Migration 011 adds user-scoped stable identities through `activities.activity_key` and `completion_evidence.evidence_key`; these are unique only when non-null for backward compatibility. M7D-A leaves `completion_evidence.match_candidate_id` null and does not populate the match-run tables.

After evidence is accepted, semantic fields are immutable. Existing nullable `activity_id`, `match_candidate_id`, and `future_trail_segment_id` links may transition from non-null to null so their `ON DELETE SET NULL` actions still work; they cannot be relinked. GPS traces, match candidates, and accepted evidence remain evidence and do not create `segment_completions` without explicit confirmation.

## API Projection Relationship

`trail_segment_api` joins `trail_segments` to `trails` and filters to the verified/human-reviewed publication gate. It returns GeoJSON-derived coordinates for the application repository.