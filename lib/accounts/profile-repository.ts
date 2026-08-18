import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow, ProfileUpdateInput, UserProfile } from "@/types/account";
import { sanitizeProfilePersistenceError } from "@/lib/accounts/errors";
import { mapProfileRow, profileUpdatePayload } from "@/types/account";

export class ProfileRepository {
  constructor(private readonly supabase: SupabaseClient, private readonly userId: string) {}

  async getProfile(): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, username, display_name, is_public, created_at, updated_at")
      .eq("id", this.userId)
      .maybeSingle();

    if (error) throw new Error("Profile lookup failed. Please try again.");
    return data ? mapProfileRow(data as ProfileRow) : null;
  }

  async ensureProfile(): Promise<UserProfile> {
    const existing = await this.getProfile();
    if (existing) return existing;

    const { data, error } = await this.supabase
      .from("profiles")
      .insert({ id: this.userId, is_public: false })
      .select("id, username, display_name, is_public, created_at, updated_at")
      .single();

    if (error) throw new Error("Profile creation failed. Please try again.");
    return mapProfileRow(data as ProfileRow);
  }

  async updateProfile(input: ProfileUpdateInput): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .upsert(profileUpdatePayload(this.userId, input), { onConflict: "id" })
      .select("id, username, display_name, is_public, created_at, updated_at")
      .single();

    if (error) throw new Error(sanitizeProfilePersistenceError(error["message"]));
    return mapProfileRow(data as ProfileRow);
  }
}
