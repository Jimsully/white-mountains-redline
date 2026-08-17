#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function normalizeTrailName(name) {
  const replacements = new Map([["MT", "MOUNT"], ["MTN", "MOUNTAIN"], ["RD", "ROAD"], ["&", "AND"]]);
  const tokens = name.trim().toUpperCase().replace(/&/g, " AND ").replace(/[.'’]/g, "").replace(/[-_/]/g, " ").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map((token) => replacements.get(token) ?? token);
  while (tokens.at(-1) === "TRAIL") tokens.pop();
  return tokens.join(" ");
}

function parseCsv(csv) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i], next = csv[i + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && next === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  row.push(cell); rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

function validate(csv) {
  const rows = parseCsv(csv);
  const errors = [];
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  const indexes = Object.fromEntries(header.map((column, index) => [column, index]));
  for (const required of ["item_key", "name"]) if (indexes[required] === undefined) errors.push(`Missing required column: ${required}`);
  const seen = new Set();
  const normalizedCounts = new Map();
  let count = 0;
  if (!errors.length) rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    const key = (row[indexes.item_key] ?? "").replace(/\s+/g, " ").trim();
    const name = (row[indexes.name] ?? "").replace(/\s+/g, " ").trim();
    if (!key) errors.push(`Row ${rowNumber}: item_key is required.`);
    if (!name) errors.push(`Row ${rowNumber}: name is required.`);
    if (key && seen.has(key)) errors.push(`Row ${rowNumber}: duplicate item_key '${key}'.`);
    seen.add(key);
    if (key && name) { count += 1; const normalized = normalizeTrailName(name); normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1); }
  });
  const duplicates = [...normalizedCounts.entries()].filter(([, value]) => value > 1).map(([key]) => key);
  return { errors, count, duplicates };
}

const inputPath = process.argv[2];
if (!inputPath) { console.error("Usage: npm run data:inventory:validate -- <path>"); process.exit(1); }
const absolute = path.resolve(inputPath);
const result = validate(fs.readFileSync(absolute, "utf8"));
if (result.errors.length) { console.error(result.errors.join("\n")); process.exit(1); }
console.log(`Inventory file: ${absolute}`);
console.log(`Total inventory items: ${result.count}`);
console.log(`Duplicate normalized names: ${result.duplicates.length ? result.duplicates.join(", ") : "none"}`);

