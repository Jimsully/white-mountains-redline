const WORD_REPLACEMENTS = new Map([
  ["MT", "MOUNT"],
  ["MTN", "MOUNTAIN"],
  ["RD", "ROAD"],
  ["&", "AND"],
]);

export function normalizeTrailName(name: string) {
  const normalized = name
    .trim()
    .toLocaleUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[.'’]/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter(Boolean).map((token) => WORD_REPLACEMENTS.get(token) ?? token);
  while (tokens.at(-1) === "TRAIL") tokens.pop();
  return tokens.join(" ");
}

export function nameTokens(normalizedName: string) {
  return normalizedName.split(" ").filter(Boolean);
}

export function tokenOverlap(a: string, b: string) {
  const aTokens = new Set(nameTokens(a));
  const bTokens = new Set(nameTokens(b));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  return intersection / Math.max(aTokens.size, bTokens.size);
}

export function normalizedNameSimilarity(a: string, b: string) {
  if (a === b) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

function levenshtein(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}
