"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getBrowserMapStyle } from "@/lib/map/basemap-style";
import { startupMapErrorMessage } from "@/lib/map/map-load-errors";
import { cameraDurationForReducedMotion } from "@/lib/map/segment-bounds";
import { configureMapLibreWorker } from "@/lib/map/maplibre-worker";
import type { TrailDetail, TrailSegment } from "@/types/trails";

type Props = {
  trail: TrailDetail;
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
        segmentName: segment.segmentName,
      },
      geometry: { type: "LineString", coordinates: segment.coordinates },
    })),
  };
}

export function TrailDetailMap({ trail }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const data = useMemo(() => toGeoJSON(trail.segments), [trail.segments]);
  const mapStyle = useMemo(() => getBrowserMapStyle(), []);
  const [mapError, setMapError] = useState<string | null>(mapStyle.ok ? null : mapStyle.message);
  const mapLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    configureMapLibreWorker(maplibregl);
    if (!mapStyle.ok) return;

    const center = trail.bounds
      ? [(trail.bounds[0] + trail.bounds[2]) / 2, (trail.bounds[1] + trail.bounds[3]) / 2] as [number, number]
      : [-71.65, 44.14] as [number, number];

    const map = new maplibregl.Map({
      container: containerRef.current,
      center,
      zoom: 11,
      attributionControl: false,
      style: mapStyle.style,
    });

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
      map.addSource("trail-detail-segments", { type: "geojson", data });
      map.addLayer({
        id: "trail-detail-casing",
        type: "line",
        source: "trail-detail-segments",
        paint: {
          "line-color": "#151817",
          "line-width": 8,
          "line-opacity": 0.72,
        },
      });
      map.addLayer({
        id: "trail-detail-lines",
        type: "line",
        source: "trail-detail-segments",
        paint: {
          "line-color": ["case", ["==", ["get", "completed"], true], "#d94a3a", "#f4f1e8"],
          "line-width": 5,
          "line-opacity": 0.96,
        },
      });

      if (trail.bounds) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        map.fitBounds([[trail.bounds[0], trail.bounds[1]], [trail.bounds[2], trail.bounds[3]]], {
          padding: window.innerWidth <= 700 ? 38 : 72,
          maxZoom: 14,
          duration: cameraDurationForReducedMotion(reducedMotion),
        });
      }
    });

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.resize());
    resizeObserver?.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [data, mapStyle, trail.bounds]);

  return (
    <figure className="trailDetailMap" aria-label={`${trail.name} verified trail segment map`}>
      <div className="mapBadge">NOT FOR NAVIGATION</div>
      {mapError ? <div className="mapError" role="status">{mapError}</div> : null}
      <div ref={containerRef} className="trailDetailMapCanvas" />
      <figcaption>
        Verified public segment geometry for completion tracking context only. Use official sources for navigation.
      </figcaption>
    </figure>
  );
}
