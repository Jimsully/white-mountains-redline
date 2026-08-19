import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maplibreDist = path.join(root, "node_modules", "maplibre-gl", "dist");
const publicDir = path.join(root, "public", "vendor", "maplibre");
const requiredFiles = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

async function assertSourceExists(file) {
  const source = path.join(maplibreDist, file);
  try {
    await stat(source);
  } catch (error) {
    throw new Error(`Missing MapLibre worker asset ${source}. Run npm install before preparing worker assets.`, { cause: error });
  }
  return source;
}

await mkdir(publicDir, { recursive: true });

for (const file of requiredFiles) {
  const source = await assertSourceExists(file);
  const destination = path.join(publicDir, file);
  await copyFile(source, destination);
}

console.log(`Prepared MapLibre worker assets in ${path.relative(root, publicDir)}`);
