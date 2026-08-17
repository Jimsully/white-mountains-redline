#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const shim = path.resolve(__dirname, "tsx-windows-shim.cjs").replace(/\\/g, "/");
const cli = path.resolve(__dirname, "..", "node_modules", "tsx", "dist", "cli.cjs");
const existingOptions = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : "";
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: `${existingOptions}--require=${shim}` },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);