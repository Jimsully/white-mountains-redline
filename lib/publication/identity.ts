import crypto from "node:crypto";

export function stableHash(parts: unknown[], length = 16) {
  return crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, length);
}

export function stableUuid(parts: unknown[]) {
  const hex = stableHash(parts, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trail";
}
