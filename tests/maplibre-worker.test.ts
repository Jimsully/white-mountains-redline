import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configureMapLibreWorker, MAPLIBRE_WORKER_URL } from "@/lib/map/maplibre-worker";

describe("MapLibre worker configuration", () => {
  it("sets the same-origin generated worker URL", () => {
    const configured: string[] = [];

    configureMapLibreWorker({
      getWorkerUrl: () => undefined,
      setWorkerUrl: (value) => configured.push(value),
    });

    expect(configured).toEqual(["/vendor/maplibre/maplibre-gl-worker.mjs"]);
    expect(MAPLIBRE_WORKER_URL).toBe("/vendor/maplibre/maplibre-gl-worker.mjs");
  });

  it("does not reset an already configured worker URL", () => {
    const configured: string[] = [];

    configureMapLibreWorker({
      getWorkerUrl: () => MAPLIBRE_WORKER_URL,
      setWorkerUrl: (value) => configured.push(value),
    });

    expect(configured).toEqual([]);
  });

  it("prepares the worker and its module dependency from the installed package", () => {
    execFileSync(process.execPath, ["scripts/prepare-maplibre-worker.mjs"], { stdio: "pipe" });

    expect(existsSync(path.join("public", "vendor", "maplibre", "maplibre-gl-worker.mjs"))).toBe(true);
    expect(existsSync(path.join("public", "vendor", "maplibre", "maplibre-gl-shared.mjs"))).toBe(true);
  });
});
