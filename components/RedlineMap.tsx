"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getBrowserMapStyle } from "@/lib/map/basemap-style";
import { startupMapErrorMessage } from "@/lib/map/map-load-errors";
import { configureMapLibreWorker } from "@/lib/map/maplibre-worker";
import { cameraDurationForReducedMotion, getSegmentBounds } from "@/lib/map/segment-bounds";
import type { SelectionOrigin } from "@/types/completion";
import type { TrailSegment } from "@/types/trails";

type Props = {
  segments: TrailSegment[];
  selectedId?: string;
  focusRequest: number;
  onSelect: (id: string, origin: SelectionOrigin) => void;
};

function toGeoJSON(segments: TrailSegment[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: segments.map((segment) => ({
      type: "Feature",
      id: segment.id,
      properties: {
        id: segment.id,
        completed: segment.completed,
        trailName: segment.trailName,
        segmentName: segment.segmentName,
      },
      geometry: { type: "LineString", coordinates: segment.coordinates },
    })),
  };
}

export function RedlineMap({ segments, selectedId, focusRequest, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const data = useMemo(() => toGeoJSON(segments), [segments]);
  const mapStyle = useMemo(() => getBrowserMapStyle(), []);
  const dataRef = useRef(data);
  const [mapError, setMapError] = useState<string | null>(mapStyle.ok ? null : mapStyle.message);
  const [mapReady, setMapReady] = useState(false);
  const mapLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    configureMapLibreWorker(maplibregl);
    if (!mapStyle.ok) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [-71.65, 44.14],
      zoom: 10.4,
      attributionControl: false,
      style: mapStyle.style,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("error", (event) => {
      const message = startupMapErrorMessage({
        hasLoaded: mapLoadedRef.current,
        nodeEnv: process.env.NODE_ENV,
        errorMessage: event.error?.message,
      });
      if (message) setMapError(message);
    });

    map.on("load", () => {
      mapLoadedRef.current = true;
      setMapError(null);
      map.addSource("trail-segments", { type: "geojson", data: dataRef.current });

      map.addLayer({
        id: "trail-casing",
        type: "line",
        source: "trail-segments",
        paint: {
          "line-color": "#151817",
          "line-width": 7,
          "line-opacity": 0.65,
        },
      });

      map.addLayer({
        id: "trail-lines",
        type: "line",
        source: "trail-segments",
        paint: {
          "line-color": ["case", ["==", ["get", "completed"], true], "#d94a3a", "#dad8cf"],
          "line-width": 4,
          "line-opacity": 0.96,
        },
      });

      map.on("click", "trail-lines", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelect(id, "map");
      });

      map.on("mouseenter", "trail-lines", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "trail-lines", () => { map.getCanvas().style.cursor = ""; });
      setMapReady(true);
    });

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.resize());
    resizeObserver?.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
      setMapReady(false);
    };
  }, [mapStyle, onSelect]);

  useEffect(() => {
    dataRef.current = data;
    const map = mapRef.current;
    if (!mapReady || !map?.isStyleLoaded()) return;
    const source = map.getSource("trail-segments") as maplibregl.GeoJSONSource | undefined;
    source?.setData(data);
  }, [data, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.isStyleLoaded() || !map.getLayer("trail-lines")) return;
    map.setPaintProperty("trail-lines", "line-width", [
      "case", ["==", ["get", "id"], selectedId ?? ""], 7, 4,
    ]);
  }, [mapReady, selectedId]);

  useEffect(() => {
    if (!focusRequest || !selectedId) return;
    const map = mapRef.current;
    if (!mapReady || !map?.isStyleLoaded()) return;
    const segment = segments.find((item) => item.id === selectedId);
    if (!segment) return;
    const bounds = getSegmentBounds(segment.coordinates);
    if (!bounds) return;
    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
      padding: window.innerWidth <= 800 ? 32 : 64,
      maxZoom: 14.5,
      duration: cameraDurationForReducedMotion(reducedMotion),
    });
  }, [focusRequest, mapReady, segments, selectedId]);

  return (
    <div className="mapShell">
      <div className="mapBadge">PROTOTYPE · NOT FOR NAVIGATION</div>
      {mapError ? <div className="mapError" role="status">{mapError}</div> : null}
      <div ref={containerRef} className="map" />
    </div>
  );
}
