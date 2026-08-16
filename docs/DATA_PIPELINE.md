# Data Pipeline

White Mountains Redline keeps source GIS data, challenge concepts, and verified public completion segments separate.

```text
USFS raw feature
    ↓
staging/source feature
    ↓
normalization/reconciliation
    ↓
challenge trail
    ↓
junction-to-junction challenge segment
    ↓
human verification
    ↓
public production layer
```

## 1. USFS raw feature
The importer queries the USDA Forest Service National Forest System Trails ArcGIS service:

`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0`

The current development command uses an approximate Franconia/Pemigewasset ingestion envelope:

- west: -71.95
- south: 43.75
- east: -71.35
- north: 44.35

This envelope is only a practical ingestion boundary. It is not a canonical region definition and not a challenge boundary.

## 2. Staging/source feature
Downloaded features are normalized into `SourceTrailFeature` records and written to `data/staging/usfs/franconia-pemi/`. In Supabase, the equivalent persistence layer is `import_batches` plus `source_trail_features`.

Each source feature retains original properties, source provider, dataset, source feature ID, source URL, import timestamp, geometry in EPSG:4326, optional region hint, and reconciliation status.

## 3. Normalization/reconciliation
Normalization makes source data easier to inspect, but it does not make challenge claims. Reconciliation is the later human/product step that decides whether and how source features map to a challenge trail concept.

## 4. Challenge trail
A challenge trail is a product concept, not a raw GIS record. Its identity must be reviewed against the legally approved challenge inventory/version.

## 5. Junction-to-junction challenge segment
Completion is tracked by segment, not merely by trail name. A segment must have stable endpoints and enough provenance to show which source feature or features contributed to its geometry.

## 6. Human verification
Human verification confirms challenge identity, endpoints, geometry, and provenance. Authoritative-source geometry is not equivalent to challenge verification.

## 7. Public production layer
Only verified production challenge segments should be presented as part of the public completion layer. Demo geometry and raw source GIS must remain visibly marked as not for navigation and not challenge verified.
