export type TrailRegion =
  | "Franconia–Pemigewasset"
  | "Presidential Range"
  | "Carter–Moriah"
  | "Sandwich Range"
  | "Waterville Valley"
  | "Other";

export type TrailSegment = {
  id: string;
  slug: string;
  trailName: string;
  segmentName: string;
  region: TrailRegion;
  miles: number;
  elevationGainFt?: number;
  completed: boolean;
  coordinates: [number, number][];
  dataStatus: "demo" | "verified";
};
