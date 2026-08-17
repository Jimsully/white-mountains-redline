#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const shim = path.resolve(__dirname, "tsx-windows-shim.cjs");
const result = spawnSync(process.execPath, ["--require", shim, "--import", "tsx", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);