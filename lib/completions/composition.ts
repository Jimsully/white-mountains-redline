import type { TrailSegment } from "@/types/trails";
import type { SegmentCompletion } from "@/types/completion";

export function applySegmentCompletions(segments: TrailSegment[], completions: SegmentCompletion[]): TrailSegment[] {
  const currentIds = new Set(segments.map((segment) => segment.id));
  const completedIds = new Set(
    completions
      .map((completion) => completion.segmentId)
      .filter((segmentId) => currentIds.has(segmentId)),
  );

  return segments.map((segment) => ({ ...segment, completed: completedIds.has(segment.id) }));
}