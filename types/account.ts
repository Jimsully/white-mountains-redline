export type UserProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  isPublic: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  is_public: boolean;
  created_at: string | null;
  updated_at?: string | null;
};

export type ProfileUpdateInput = {
  displayName: string | null;
  username: string | null;
  isPublic: boolean;
};

export type ProfileValidationResult =
  | { ok: true; value: ProfileUpdateInput }
  | { ok: false; field: "displayName" | "username" | "isPublic"; message: string };

const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

export function validateUsername(value: string | null | undefined) {
  const username = value?.trim() ?? "";
  if (!username) return { ok: true as const, value: null };
  if (username !== username.toLowerCase()) return { ok: false as const, message: "Username must be lowercase." };
  if (!usernamePattern.test(username)) {
    return { ok: false as const, message: "Username must be 3-32 lowercase letters, numbers, hyphens, or underscores, and start with a letter or number." };
  }
  return { ok: true as const, value: username };
}

export function validateProfileUpdate(form: FormData): ProfileValidationResult {
  const displayNameValue = stringField(form.get("displayName")).trim();
  if (displayNameValue.length > 120) return { ok: false, field: "displayName", message: "Display name must be 120 characters or fewer." };

  const username = validateUsername(stringField(form.get("username")));
  if (!username.ok) return { ok: false, field: "username", message: username.message };

  const isPublicValue = form.get("isPublic");
  return {
    ok: true,
    value: {
      displayName: displayNameValue.length > 0 ? displayNameValue : null,
      username: username.value,
      isPublic: isPublicValue === "on",
    },
  };
}

export function profileUpdatePayload(userId: string, input: ProfileUpdateInput) {
  return {
    id: userId,
    display_name: input.displayName,
    username: input.username,
    is_public: input.isPublic,
  };
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
