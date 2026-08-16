"use client";

import { useCallback, useMemo, useState } from "react";
import { RedlineMap } from "@/components/RedlineMap";
import { ProgressPanel } from "@/components/ProgressPanel";
import { defaultTrailFilters, filterTrailSegments, getAvailableRegions } from "@/lib/trail-filters";
import type { TrailFilters } from "@/lib/trail-filters";
import type { TrailSegment } from "@/types/trails";

type Props = {
  initialSegments: TrailSegment[];
};

export function RedlineApp({ initialSegments }: Props) {
  const [segments, setSegments] = useState<TrailSegment[]>(initialSegments);
  const [filters, setFilters] = useState<TrailFilters>(defaultTrailFilters);
  const visibleSegments = useMemo(() => filterTrailSegments(segments, filters), [segments, filters]);
  const [selectedId, setSelectedId] = useState(initialSegments[0]?.id);
  const availableRegions = useMemo(() => getAvailableRegions(segments), [segments]);
  const selected = useMemo(
    () => visibleSegments.find((segment) => segment.id === selectedId),
    [visibleSegments, selectedId],
  );

  const toggleSegment = useCallback((id: string) => {
    setSegments((current) => current.map((segment) =>
      segment.id === id ? { ...segment, completed: !segment.completed } : segment,
    ));
  }, []);

  const selectSegment = useCallback((id: string) => setSelectedId(id), []);

  const updateFilters = useCallback((nextFilters: TrailFilters) => {
    setFilters(nextFilters);
    const nextVisible = filterTrailSegments(segments, nextFilters);
    if (!nextVisible.some((segment) => segment.id === selectedId)) {
      setSelectedId(nextVisible[0]?.id);
    }
  }, [segments, selectedId]);

  return (
    <main className="appShell">
      <ProgressPanel
        segments={visibleSegments}
        selected={selected}
        onToggle={toggleSegment}
        filters={filters}
        onFiltersChange={updateFilters}
        availableRegions={availableRegions}
        totalSegmentCount={segments.length}
      />
      <RedlineMap segments={visibleSegments} selectedId={selectedId} onSelect={selectSegment} />
    </main>
  );
}
