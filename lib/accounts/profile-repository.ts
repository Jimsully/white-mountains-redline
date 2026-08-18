import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow, ProfileUpdateInput, UserProfile } from "@/types/account";
import { mapProfileRow, profileUpdatePayload } from "@/types/account";

export class ProfileRepository {
  constructor(private readonly supabase: SupabaseClient, private readonly userId: string) {}

  async getProfile(): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, username, display_name, is_public, created_at, updated_at")
      .eq("id", this.userId)
      .maybeSingle();

    if (error) throw new Error(`Profile lookup failed: ${error.message}`);
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

    if (error) throw new Error(`Profile creation failed: ${error.message}`);
    return mapProfileRow(data as ProfileRow);
  }

  async updateProfile(input: ProfileUpdateInput): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .upsert(profileUpdatePayload(this.userId, input), { onConflict: "id" })
      .select("id, username, display_name, is_public, created_at, updated_at")
      .single();

    if (error) throw new Error(readableProfileError(error.message));
    return mapProfileRow(data as ProfileRow);
  }
}

function readableProfileError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("profiles_username_format_chk")) return "Username does not match the required public format.";
  if (lower.includes("profiles_username_key") || lower.includes("duplicate key")) return "That username is already taken.";
  return message;
}
