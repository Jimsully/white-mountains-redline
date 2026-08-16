import { createTrailRepository } from "@/lib/repositories";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const repository = createTrailRepository();
  const segments = await repository.listSegments();
  return segments.map((trail) => ({ slug: trail.slug }));
}

export default async function TrailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const repository = createTrailRepository();
  const trail = await repository.getSegmentBySlug(slug);
  if (!trail) notFound();

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ letterSpacing: ".16em", fontSize: 12 }}>DEMO TRAIL PAGE</p>
      <h1>{trail.trailName}</h1>
      <p>{trail.segmentName}</p>
      <p><strong>{trail.miles.toFixed(1)} miles</strong> · {trail.region}</p>
      <p>This route is prototype data and is not intended for navigation.</p>
      <p>Production pages will hold verified trail facts, original descriptions, completion status, trip reports, photographs, and internal links back into jamesscottsullivan.com.</p>
    </main>
  );
}
