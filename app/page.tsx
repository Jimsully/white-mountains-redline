import { RedlineApp } from "@/app/redline/RedlineApp";
import { createTrailRepository } from "@/lib/repositories";

export default async function HomePage() {
  const repository = createTrailRepository();
  const segments = await repository.listSegments();

  return <RedlineApp initialSegments={segments} />;
}
