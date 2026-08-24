import crypto from "node:crypto";

export function canonicalSerialize(value: unknown): string {
  return serializeJsonValue(value, new Set<object>());
}

export function sha256Fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalSerialize(value)).digest("hex");
}

function serializeJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON only supports finite numbers.");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
  if (ancestors.has(value)) throw new TypeError("Canonical JSON does not support circular references.");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (Object.getOwnPropertySymbols(value).length || keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new TypeError("Canonical JSON arrays must be dense and contain no extra properties.");
      }
      return `[${value.map((entry) => serializeJsonValue(entry, ancestors)).join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length) {
      throw new TypeError("Canonical JSON only supports plain objects.");
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${serializeJsonValue(entry, ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
