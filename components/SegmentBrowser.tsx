"use client";

import { useEffect, useRef } from "react";
import type { TrailSegment } from "@/types/trails";
import type { SelectionOrigin } from "@/types/completion";

type Props = {
  segments: TrailSegment[];
  selectedId?: string;
  selectionOrigin: SelectionOrigin;
  onSelect: (id: string, origin: SelectionOrigin) => void;
};

export function SegmentBrowser({ segments, selectedId, selectionOrigin, onSelect }: Props) {
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!selectedId || selectionOrigin !== "map") return;
    const row = rowRefs.current.get(selectedId);
    if (!row) return;
    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [selectedId, selectionOrigin]);

  return (
    <div className="segmentBrowser" aria-label="Trail segments">
      {segments.length ? segments.map((segment) => {
        const selected = segment.id === selectedId;
        return (
          <button
            key={segment.id}
            ref={(node) => {
              if (node) rowRefs.current.set(segment.id, node);
              else rowRefs.current.delete(segment.id);
            }}
            type="button"
            className={rowClassName(segment.completed, selected)}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(segment.id, "list")}
          >
            <span className="segmentBrowserTitle">{segment.trailName}</span>
            <span className="segmentBrowserName">{segment.segmentName}</span>
            <span className="segmentBrowserMeta">
              <span>{segment.miles.toFixed(1)} mi</span>
              <span className={segment.completed ? "segmentState complete" : "segmentState open"}>{segment.completed ? "Completed" : "Open"}</span>
            </span>
          </button>
        );
      }) : <p className="muted">No visible segments match the current filters.</p>}
    </div>
  );
}

function rowClassName(completed: boolean, selected: boolean) {
  return ["segmentBrowserRow", completed ? "completed" : "open", selected ? "selected" : undefined].filter(Boolean).join(" ");
}