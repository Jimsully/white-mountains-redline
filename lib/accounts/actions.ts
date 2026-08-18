"use server";

import { redirect } from "next/navigation";
import { ProfileRepository } from "@/lib/accounts/profile-repository";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { validateProfileUpdate } from "@/types/account";

export async function updateProfileAction(formData: FormData) {
  const returnTo = safeRelativeRedirect(stringField(formData.get("returnTo")), "/account");
  const auth = await getAuthenticatedUser();
  if (!auth.supabase || auth.unavailable) redirect(`/login?status=unavailable&returnTo=${encodeURIComponent(returnTo)}`);
  if (!auth.user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);

  const validation = validateProfileUpdate(formData);
  if (!validation.ok) redirect(`${returnTo}?error=${encodeURIComponent(validation.message)}`);

  try {
    const repository = new ProfileRepository(auth.supabase, auth.user.id);
    await repository.updateProfile(validation.value);
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Profile update failed.")}`);
  }

  redirect(`${returnTo}?status=saved`);
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}
