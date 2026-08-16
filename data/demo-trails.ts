import type { TrailSegment } from "@/types/trails";

const demoProvenance = (id: string) => ({
  provider: "demo" as const,
  dataset: "scaffold schematic demo",
  sourceFeatureIds: [id],
  manuallyModified: false,
  notes: "Fictionalized scaffold geometry. NOT FOR NAVIGATION.",
});

// DEMO ONLY. Coordinates are intentionally simplified and are not suitable for navigation.
export const demoTrails: TrailSegment[] = [
  {
    id: "demo-1",
    slug: "sample-franconia-ridge-north",
    trailId: "demo-sample-ridge",
    trailName: "Sample Ridge Trail",
    segmentName: "North segment",
    region: "Franconia-Pemigewasset",
    miles: 2.7,
    elevationGainFt: 1550,
    completed: true,
    coordinates: [
      [-71.688, 44.143], [-71.681, 44.151], [-71.674, 44.157], [-71.667, 44.164]
    ],
    dataStatus: "demo",
    verificationStatus: "demo",
    provenance: demoProvenance("demo-1"),
  },
  {
    id: "demo-2",
    slug: "sample-franconia-ridge-south",
    trailId: "demo-sample-ridge",
    trailName: "Sample Ridge Trail",
    segmentName: "South segment",
    region: "Franconia-Pemigewasset",
    miles: 3.4,
    elevationGainFt: 980,
    completed: false,
    coordinates: [
      [-71.667, 44.164], [-71.655, 44.155], [-71.646, 44.147], [-71.637, 44.139]
    ],
    dataStatus: "demo",
    verificationStatus: "demo",
    provenance: demoProvenance("demo-2"),
  },
  {
    id: "demo-3",
    slug: "sample-notch-link",
    trailId: "demo-sample-notch-link",
    trailName: "Sample Notch Link",
    segmentName: "Trailhead to junction",
    region: "Franconia-Pemigewasset",
    miles: 1.9,
    elevationGainFt: 720,
    completed: true,
    coordinates: [
      [-71.715, 44.154], [-71.704, 44.157], [-71.692, 44.161], [-71.679, 44.164]
    ],
    dataStatus: "demo",
    verificationStatus: "demo",
    provenance: demoProvenance("demo-3"),
  },
  {
    id: "demo-4",
    slug: "sample-pemi-spur",
    trailId: "demo-sample-pemi-spur",
    trailName: "Sample Pemi Spur",
    segmentName: "Junction to viewpoint",
    region: "Franconia-Pemigewasset",
    miles: 2.2,
    elevationGainFt: 430,
    completed: false,
    coordinates: [
      [-71.637, 44.139], [-71.624, 44.134], [-71.611, 44.129], [-71.598, 44.124]
    ],
    dataStatus: "demo",
    verificationStatus: "demo",
    provenance: demoProvenance("demo-4"),
  },
  {
    id: "demo-5",
    slug: "sample-lincoln-woods",
    trailId: "demo-sample-valley",
    trailName: "Sample Valley Trail",
    segmentName: "Western segment",
    region: "Franconia-Pemigewasset",
    miles: 4.6,
    elevationGainFt: 250,
    completed: false,
    coordinates: [
      [-71.672, 44.102], [-71.651, 44.107], [-71.629, 44.111], [-71.607, 44.115]
    ],
    dataStatus: "demo",
    verificationStatus: "demo",
    provenance: demoProvenance("demo-5"),
  }
];
