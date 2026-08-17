import { normalizeTrailName } from "@/lib/reconciliation/name-normalization";
import type { ChallengeInventoryItem } from "@/types/reconciliation";

export type InventoryValidationResult = {
  items: ChallengeInventoryItem[];
  errors: string[];
  duplicateNormalizedNames: string[];
};

export function validateChallengeInventoryCsv(csv: string, editionLabel?: string): InventoryValidationResult {
  const rows = parseCsv(csv);
  const errors: string[] = [];
  if (!rows.length) return { items: [], errors: ["CSV is empty."], duplicateNormalizedNames: [] };

  const header = rows[0].map((cell) => cell.trim());
  const indexes = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const required of ["item_key", "name"]) {
    if (indexes[required] === undefined) errors.push(`Missing required column: ${required}`);
  }
  if (errors.length) return { items: [], errors, duplicateNormalizedNames: [] };

  const seenKeys = new Set<string>();
  const normalizedCounts = new Map<string, number>();
  const items: ChallengeInventoryItem[] = [];

  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (row.every((cell) => !cell.trim())) return;
    const itemKey = clean(row[indexes.item_key] ?? "");
    const displayName = clean(row[indexes.name] ?? "");
    const regionHint = clean(row[indexes.region_hint] ?? "") || undefined;
    const sourceNotes = clean(row[indexes.notes] ?? "") || undefined;

    if (!itemKey) errors.push(`Row ${rowNumber}: item_key is required.`);
    if (!displayName) errors.push(`Row ${rowNumber}: name is required.`);
    if (itemKey && seenKeys.has(itemKey)) errors.push(`Row ${rowNumber}: duplicate item_key '${itemKey}'.`);
    seenKeys.add(itemKey);

    if (itemKey && displayName) {
      const normalizedName = normalizeTrailName(displayName);
      normalizedCounts.set(normalizedName, (normalizedCounts.get(normalizedName) ?? 0) + 1);
      items.push({
        itemKey,
        displayName,
        normalizedName,
        regionHint,
        editionLabel,
        sourceNotes,
        reviewStatus: "unreviewed",
      });
    }
  });

  const duplicateNormalizedNames = [...normalizedCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  return { items, errors, duplicateNormalizedNames };
}

export function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
