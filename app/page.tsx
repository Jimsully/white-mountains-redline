import type { Metadata } from "next";
import { RedlineApp } from "@/app/redline/RedlineApp";
import { CompletionRepository } from "@/lib/completions/completion-repository";
import { applySegmentCompletions } from "@/lib/completions/composition";
import { createTrailRepositoryRuntime } from "@/lib/repositories";
import { homeMetadata } from "@/lib/seo/metadata";
import { getSupabaseAuthRuntimeConfig } from "@/lib/supabase/config";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const metadata: Metadata = homeMetadata();

export default async function HomePage() {
  const runtime = createTrailRepositoryRuntime();
  const segments = await runtime.repository.listSegments();

  if (runtime.mode === "demo") {
    return <RedlineApp initialSegments={segments} completionMode="demo" />;
  }

  const authConfigured = getSupabaseAuthRuntimeConfig() !== null;
  if (!authConfigured) {
    return <RedlineApp initialSegments={segments} completionMode="unavailable" />;
  }

  const auth = await getAuthenticatedUser();
  if (!auth.supabase || !auth.user) {
    return <RedlineApp initialSegments={segments} completionMode="anonymous" />;
  }

  const completionRepository = new CompletionRepository(auth.supabase, auth.user.id);
  const completions = await completionRepository.listOwnCompletions();
  const personalizedSegments = applySegmentCompletions(segments, completions);

  return <RedlineApp initialSegments={personalizedSegments} completionMode="authenticated" />;
}
