"use client";

import { useCallback, useMemo, useState } from "react";
import { RedlineMap } from "@/components/RedlineMap";
import { ProgressPanel } from "@/components/ProgressPanel";
import { demoTrails } from "@/data/demo-trails";
import type { TrailSegment } from "@/types/trails";

export default function HomePage() {
  const [segments, setSegments] = useState<TrailSegment[]>(demoTrails);
  const [selectedId, setSelectedId] = useState(demoTrails[0]?.id);
  const selected = useMemo(
    () => segments.find((segment) => segment.id === selectedId),
    [segments, selectedId],
  );

  const toggleSegment = useCallback((id: string) => {
    setSegments((current) => current.map((segment) =>
      segment.id === id ? { ...segment, completed: !segment.completed } : segment,
    ));
  }, []);

  const selectSegment = useCallback((id: string) => setSelectedId(id), []);

  return (
    <main className="appShell">
      <ProgressPanel segments={segments} selected={selected} onToggle={toggleSegment} />
      <RedlineMap segments={segments} selectedId={selectedId} onSelect={selectSegment} />
    </main>
  );
}
