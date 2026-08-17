#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join("data", "generated", "reconciliation");
const SOURCE_PATH = path.join("data", "staging", "usfs", "franconia-pemi", "source-features.json");
const args = process.argv.slice(2);
const inventoryArgIndex = args.indexOf("--inventory");
if (inventoryArgIndex === -1 || !args[inventoryArgIndex + 1]) { console.error("Usage: npm run data:reconcile -- --inventory <path>"); process.exit(1); }
const inventoryPath = path.resolve(args[inventoryArgIndex + 1]);
const demoOnly = inventoryPath.includes(`${path.sep}data${path.sep}demo${path.sep}`) || inventoryPath.endsWith(".demo.csv");
const csv = fs.readFileSync(inventoryPath, "utf8");
const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const features = source.features;
const validation = validateInventory(csv, demoOnly ? "DEMO reconciliation inventory" : undefined);
if (validation.errors.length) { console.error(validation.errors.join("\n")); process.exit(1); }
const groups = groupFeatures(features);
const results = validation.items.map((item) => matchItem(item, groups));
const summary = summarize(results, groups);
const candidateGroupNames = new Set(results.flatMap((result) => result.candidates.map((candidate) => candidate.sourceTrailNormalizedName)));
const artifactGroups = groups.filter((group) => candidateGroupNames.has(group.normalizedName));
const artifact = {
  metadata: {
    generatedAt: new Date().toISOString(),
    demoOnly,
    inventoryPath: demoOnly ? path.relative(process.cwd(), inventoryPath) : "local/private inventory path omitted",
    sourceFeatureCount: features.length,
    sourceTrailGroupCount: groups.length,
    warning: demoOnly ? "DEMO DATA ONLY. Not a White Mountain Guide inventory, not navigation, not challenge verified." : "Local/private inventory-derived output. Do not commit.",
  },
  summary,
  results,
  sourceTrailGroups: artifactGroups,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, demoOnly ? "demo-reconciliation.json" : `reconciliation.local.${Date.now()}.json`);
fs.writeFileSync(outFile, `${JSON.stringify(artifact)}\n`);
console.log(`Inventory items: ${summary.inventoryItemCount}`);
console.log(`Exact matches: ${summary.exactMatchCount}`);
console.log(`Candidate found: ${summary.candidateFoundCount}`);
console.log(`Unmatched: ${summary.unmatchedCount}`);
console.log(`Ambiguous: ${summary.ambiguousCount}`);
console.log(`Source trail groups: ${summary.sourceTrailGroupCount}`);
console.log(`Output: ${outFile}`);

function validateInventory(csv, editionLabel) {
  const rows = parseCsv(csv);
  const errors = [];
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  const indexes = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const required of ["item_key", "name"]) if (indexes[required] === undefined) errors.push(`Missing required column: ${required}`);
  const seen = new Set(), counts = new Map(), items = [];
  if (!errors.length) rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    const itemKey = clean(row[indexes.item_key] ?? ""), displayName = clean(row[indexes.name] ?? "");
    if (!itemKey) errors.push(`Row ${rowNumber}: item_key is required.`);
    if (!displayName) errors.push(`Row ${rowNumber}: name is required.`);
    if (itemKey && seen.has(itemKey)) errors.push(`Row ${rowNumber}: duplicate item_key '${itemKey}'.`);
    seen.add(itemKey);
    if (itemKey && displayName) {
      const normalizedName = normalizeName(displayName);
      counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
      items.push({ itemKey, displayName, normalizedName, regionHint: clean(row[indexes.region_hint] ?? "") || undefined, editionLabel, sourceNotes: clean(row[indexes.notes] ?? "") || undefined, reviewStatus: "unreviewed" });
    }
  });
  return { items, errors, duplicateNormalizedNames: [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name) };
}
function groupFeatures(features) {
  const map = new Map();
  for (const feature of features) {
    if (!feature.trailName) continue;
    const normalized = normalizeName(feature.trailName);
    if (!normalized) continue;
    map.set(normalized, [...(map.get(normalized) ?? []), feature]);
  }
  return [...map.entries()].map(([normalizedName, grouped]) => {
    const names = [...new Set(grouped.map((feature) => feature.trailName).filter(Boolean))].sort();
    const lines = grouped.flatMap((feature) => feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates);
    const coords = lines.flat();
    return { displayName: names[0] ?? normalizedName, normalizedName, sourceFeatureCount: grouped.length, sourceFeatureIds: grouped.map((feature) => feature.sourceFeatureId).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), totalGisMiles: round(grouped.reduce((sum, feature) => sum + (feature.gisMiles ?? 0), 0)), bbox: [Math.min(...coords.map(([x]) => x)), Math.min(...coords.map(([, y]) => y)), Math.max(...coords.map(([x]) => x)), Math.max(...coords.map(([, y]) => y))], geometry: { type: "MultiLineString", coordinates: lines }, sourceProvider: "USFS", originalSourceNames: names };
  }).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}
function matchItem(item, groups) {
  const candidates = groups.map((group) => score(item, group)).filter((candidate) => candidate.score >= 45).sort((a, b) => b.score - a.score || a.sourceTrailDisplayName.localeCompare(b.sourceTrailDisplayName));
  return { item: { ...item, reviewStatus: candidates.length ? "candidate_found" : "unmatched" }, candidates, status: classify(candidates) };
}
function score(item, group) { const exact = item.normalizedName === group.normalizedName; const sim = similarity(item.normalizedName, group.normalizedName); const overlap = tokenOverlap(item.normalizedName, group.normalizedName); let score = Math.max(sim * 75, overlap * 70); const reasons = []; if (exact) { score = 100; reasons.push("Exact normalized-name match"); } else { if (sim >= 0.82) { score += 15; reasons.push("High normalized-name similarity"); } if (overlap >= 0.66) { score += 10; reasons.push("Strong token overlap"); } } if (item.regionHint) { score += 2; reasons.push("Region hint available for human review"); } if (!reasons.length) reasons.push("Weak fuzzy name similarity"); return { inventoryItemKey: item.itemKey, sourceTrailNormalizedName: group.normalizedName, sourceTrailDisplayName: group.displayName, score: Math.min(100, Math.round(score)), evidence: { exactNormalizedName: exact, normalizedSimilarity: round(sim), tokenOverlap: round(overlap), regionHintCompatible: item.regionHint ? true : undefined, sourceFeatureCount: group.sourceFeatureCount, sourceGisMiles: group.totalGisMiles, sourceFeatureIds: group.sourceFeatureIds, reasons } }; }
function summarize(results, groups) { const unmatchedCount = results.filter((r) => r.status === "unmatched").length; return { inventoryItemCount: results.length, exactMatchCount: results.filter((r) => r.status === "exact").length, candidateFoundCount: results.length - unmatchedCount, unmatchedCount, ambiguousCount: results.filter((r) => r.status === "ambiguous").length, sourceTrailGroupCount: groups.length }; }
function classify(candidates) { if (!candidates.length) return "unmatched"; if (candidates[0].evidence.exactNormalizedName && (candidates[1]?.score ?? 0) < 90) return "exact"; if (candidates.length > 1 && candidates[0].score - candidates[1].score < 12) return "ambiguous"; return "needs_review"; }
function parseCsv(csv) { const rows = []; let row = [], cell = "", quoted = false; for (let i = 0; i < csv.length; i += 1) { const char = csv[i], next = csv[i + 1]; if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; continue; } if (char === '"') { quoted = !quoted; continue; } if (!quoted && char === ",") { row.push(cell); cell = ""; continue; } if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && next === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; continue; } cell += char; } row.push(cell); rows.push(row); return rows.filter((cells) => cells.some((value) => value.length > 0)); }
function normalizeName(name) { const repl = new Map([["MT", "MOUNT"], ["MTN", "MOUNTAIN"], ["RD", "ROAD"], ["&", "AND"]]); const tokens = clean(name).toUpperCase().replace(/&/g, " AND ").replace(/[.'’]/g, "").replace(/[-_/]/g, " ").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map((token) => repl.get(token) ?? token); while (tokens.at(-1) === "TRAIL") tokens.pop(); return tokens.join(" "); }
function tokenOverlap(a, b) { const aa = new Set(a.split(" ").filter(Boolean)), bb = new Set(b.split(" ").filter(Boolean)); if (!aa.size || !bb.size) return 0; return [...aa].filter((t) => bb.has(t)).length / Math.max(aa.size, bb.size); }
function similarity(a, b) { if (a === b) return 1; const max = Math.max(a.length, b.length); return max ? 1 - lev(a, b) / max : 1; }
function lev(a, b) { const prev = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 0; i < a.length; i += 1) { const cur = [i + 1]; for (let j = 0; j < b.length; j += 1) cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)); prev.splice(0, prev.length, ...cur); } return prev[b.length]; }
function clean(v) { return String(v).replace(/\s+/g, " ").trim(); }
function round(v) { return Math.round(v * 1000) / 1000; }


