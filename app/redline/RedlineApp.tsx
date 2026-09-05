"use client";

import { useCallback, useMemo, useState } from "react";
import { markManualCompletionAction, removeCompletionAction } from "@/lib/completions/actions";
import { RedlineMap } from "@/components/RedlineMap";
import { ProgressPanel } from "@/components/ProgressPanel";
import { defaultTrailFilters, filterTrailSegments, getAvailableRegions } from "@/lib/trail-filters";
import type { TrailFilters } from "@/lib/trail-filters";
import type { CompletionMode, SelectionOrigin } from "@/types/completion";
import type { TrailSegment } from "@/types/trails";

type Props = {
  initialSegments: TrailSegment[];
  completionMode: CompletionMode;
};

export function RedlineApp({ initialSegments, completionMode }: Props) {
  const [segments, setSegments] = useState<TrailSegment[]>(initialSegments);
  const [filters, setFilters] = useState<TrailFilters>(defaultTrailFilters);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [pendingSegmentId, setPendingSegmentId] = useState<string | null>(null);
  const [selectionOrigin, setSelectionOrigin] = useState<SelectionOrigin>("initial");
  const [focusRequest, setFocusRequest] = useState(0);
  const visibleSegments = useMemo(() => filterTrailSegments(segments, filters), [segments, filters]);
  const [selectedId, setSelectedId] = useState(initialSegments[0]?.id);
  const availableRegions = useMemo(() => getAvailableRegions(segments), [segments]);
  const selected = useMemo(
    () => visibleSegments.find((segment) => segment.id === selectedId),
    [visibleSegments, selectedId],
  );

  const setSegmentCompleted = useCallback((id: string, completed: boolean) => {
    setSegments((current) => current.map((segment) =>
      segment.id === id ? { ...segment, completed } : segment,
    ));
  }, []);

  const toggleSegment = useCallback((id: string) => {
    if (pendingSegmentId !== null) return;

    const segment = segments.find((item) => item.id === id);
    if (!segment) return;

    setCompletionError(null);

    if (completionMode === "demo") {
      setSegmentCompleted(id, !segment.completed);
      return;
    }

    if (completionMode !== "authenticated") {
      setCompletionError(completionMode === "anonymous" ? "Sign in to save progress." : "Completion saving is unavailable in this environment.");
      return;
    }

    setPendingSegmentId(id);
    void (async () => {
      const result = segment.completed
        ? await removeCompletionAction(id)
        : await markManualCompletionAction({ segmentId: id });

      if (result.ok) {
        setSegmentCompleted(id, !segment.completed);
        setCompletionError(null);
      } else {
        setCompletionError(result.message);
      }
      setPendingSegmentId(null);
    })();
  }, [completionMode, pendingSegmentId, segments, setSegmentCompleted]);

  const selectSegment = useCallback((id: string, origin: SelectionOrigin) => {
    setSelectedId(id);
    setSelectionOrigin(origin);
    if (origin === "list") setFocusRequest((current) => current + 1);
  }, []);

  const updateFilters = useCallback((nextFilters: TrailFilters) => {
    setFilters(nextFilters);
    const nextVisible = filterTrailSegments(segments, nextFilters);
    if (!nextVisible.some((segment) => segment.id === selectedId)) {
      setSelectedId(nextVisible[0]?.id);
      setSelectionOrigin("filter");
    }
  }, [segments, selectedId]);

  return (
    <main className="appShell">
      <ProgressPanel
        segments={segments}
        visibleSegments={visibleSegments}
        selected={selected}
        selectedId={selectedId}
        selectionOrigin={selectionOrigin}
        onSelectSegment={selectSegment}
        onToggle={toggleSegment}
        filters={filters}
        onFiltersChange={updateFilters}
        availableRegions={availableRegions}
        completionMode={completionMode}
        completionError={completionError}
        completionPending={pendingSegmentId !== null}
      />
      <RedlineMap
        segments={visibleSegments}
        selectedId={selectedId}
        focusRequest={focusRequest}
        onSelect={selectSegment}
        demoOnly={completionMode === "demo"}
      />
    </main>
  );
}
