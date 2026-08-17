import fs from "node:fs";
import path from "node:path";
import { validateChallengeInventoryCsv } from "../lib/reconciliation/inventory";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run data:inventory:validate -- <path>");
  process.exit(1);
}

const absolute = path.resolve(inputPath);
const result = validateChallengeInventoryCsv(fs.readFileSync(absolute, "utf8"));
if (result.errors.length) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

console.log(`Inventory file: ${absolute}`);
console.log(`Total inventory items: ${result.items.length}`);
console.log(`Duplicate normalized names: ${result.duplicateNormalizedNames.length ? result.duplicateNormalizedNames.join(", ") : "none"}`);