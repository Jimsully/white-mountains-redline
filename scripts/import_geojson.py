"""Normalize a GeoJSON FeatureCollection into a reviewable staging JSON file.

This script deliberately does not guess that every source feature is a redline-eligible
segment. Reconciliation and human verification happen before production loading.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    if data.get("type") != "FeatureCollection":
        raise SystemExit("Expected GeoJSON FeatureCollection")

    normalized = []
    for index, feature in enumerate(data.get("features", []), start=1):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") not in {"LineString", "MultiLineString"}:
            continue
        props = feature.get("properties") or {}
        normalized.append(
            {
                "source_index": index,
                "source_id": props.get("OBJECTID") or props.get("id") or feature.get("id"),
                "source_name": props.get("TRAIL_NAME") or props.get("name") or props.get("NAME"),
                "geometry": geometry,
                "properties": props,
                "review_status": "needs_review",
            }
        )

    args.output.write_text(json.dumps(normalized, indent=2), encoding="utf-8")
    print(f"Wrote {len(normalized)} line features to {args.output}")


if __name__ == "__main__":
    main()
