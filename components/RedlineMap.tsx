"use client";

import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TrailSegment } from "@/types/trails";

type Props = {
  segments: TrailSegment[];
  selectedId?: string;
  onSelect: (id: string) => void;
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
        selected: segment.id === undefined ? false : false,
        trailName: segment.trailName,
        segmentName: segment.segmentName,
      },
      geometry: { type: "LineString", coordinates: segment.coordinates },
    })),
  };
}

export function RedlineMap({ segments, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const data = useMemo(() => toGeoJSON(segments), [segments]);
  const dataRef = useRef(data);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [-71.65, 44.14],
      zoom: 10.4,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
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
        if (typeof id === "string") onSelect(id);
      });

      map.on("mouseenter", "trail-lines", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "trail-lines", () => { map.getCanvas().style.cursor = ""; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [onSelect]);

  useEffect(() => {
    dataRef.current = data;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource("trail-segments") as maplibregl.GeoJSONSource | undefined;
    source?.setData(data);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer("trail-lines")) return;
    map.setPaintProperty("trail-lines", "line-width", [
      "case", ["==", ["get", "id"], selectedId ?? ""], 7, 4,
    ]);
  }, [selectedId]);

  return (
    <div className="mapShell">
      <div className="mapBadge">PROTOTYPE · NOT FOR NAVIGATION</div>
      <div ref={containerRef} className="map" />
    </div>
  );
}
