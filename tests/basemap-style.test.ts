import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INVALID_MAP_STYLE_URL_MESSAGE,
  PRODUCTION_MAP_STYLE_REQUIRED_MESSAGE,
  resolveBrowserMapStyle,
} from "@/lib/map/basemap-style";
import { MAP_LOAD_ERROR_MESSAGE, startupMapErrorMessage } from "@/lib/map/map-load-errors";

describe("browser basemap style contract", () => {
  it("uses a configured provider-neutral HTTPS MapLibre style URL in production", () => {
    expect(resolveBrowserMapStyle({
      NODE_ENV: "production",
      NEXT_PUBLIC_MAP_STYLE_URL: "https://valid-provider.example/style.json",
    })).toEqual({
      ok: true,
      style: "https://valid-provider.example/style.json",
      source: "configured",
    });
  });

  it("allows normal public query keys in production style URLs", () => {
    expect(resolveBrowserMapStyle({
      NODE_ENV: "production",
      NEXT_PUBLIC_MAP_STYLE_URL: "https://valid-provider.example/style.json?key=public-browser-key",
    })).toEqual({
      ok: true,
      style: "https://valid-provider.example/style.json?key=public-browser-key",
      source: "configured",
    });
  });

  it("does not silently fall back to community OSM tiles in production", () => {
    expect(resolveBrowserMapStyle({ NODE_ENV: "production" })).toEqual({
      ok: false,
      message: PRODUCTION_MAP_STYLE_REQUIRED_MESSAGE,
    });
  });

  it("keeps local development usable with an explicitly development-only OSM fallback", () => {
    const result = resolveBrowserMapStyle({ NODE_ENV: "development" });

    expect(result.ok).toBe(true);
    if (!result.ok || typeof result.style === "string") throw new Error("Expected development raster style.");
    expect(result.source).toBe("development-osm-fallback");
    expect(result.style.sources["development-osm"]).toMatchObject({
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      attribution: "(c) OpenStreetMap contributors",
    });
  });

  it("fails safely for malformed configured style URLs in every environment", () => {
    expect(resolveBrowserMapStyle({
      NODE_ENV: "development",
      NEXT_PUBLIC_MAP_STYLE_URL: "not a url",
    })).toEqual({
      ok: false,
      message: INVALID_MAP_STYLE_URL_MESSAGE,
    });
    expect(resolveBrowserMapStyle({
      NODE_ENV: "production",
      NEXT_PUBLIC_MAP_STYLE_URL: "ftp://example.com/style.json",
    })).toEqual({
      ok: false,
      message: INVALID_MAP_STYLE_URL_MESSAGE,
    });
  });

  it.each([
    "http://example.com/style.json",
    "https://user:password@example.com/style.json",
    "https://localhost/style.json",
    "https://127.0.0.1/style.json",
    "https://[::1]/style.json",
    "https://10.20.30.40/style.json",
    "https://172.16.0.1/style.json",
    "https://172.31.255.255/style.json",
    "https://192.168.1.10/style.json",
    "https://169.254.1.10/style.json",
    "https://tiles.local/style.json",
  ])("rejects unsafe production style URL %s", (url) => {
    expect(resolveBrowserMapStyle({
      NODE_ENV: "production",
      NEXT_PUBLIC_MAP_STYLE_URL: url,
    })).toEqual({
      ok: false,
      message: INVALID_MAP_STYLE_URL_MESSAGE,
    });
  });

  it("keeps development configured URL validation permissive for local testing", () => {
    expect(resolveBrowserMapStyle({
      NODE_ENV: "development",
      NEXT_PUBLIC_MAP_STYLE_URL: "http://localhost:8080/style.json",
    })).toEqual({
      ok: true,
      style: "http://localhost:8080/style.json",
      source: "configured",
    });
  });

  it("routes every browser map surface through the shared resolver", () => {
    for (const file of ["components/RedlineMap.tsx", "components/TrailDetailMap.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('from "@/lib/map/basemap-style"');
      expect(source).toContain("getBrowserMapStyle()");
      expect(source).not.toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    }
  });
});

describe("map startup failure policy", () => {
  it("surfaces pre-load startup errors in production without technical details", () => {
    expect(startupMapErrorMessage({
      hasLoaded: false,
      nodeEnv: "production",
      errorMessage: "401 for https://tiles.example/style.json?key=secret",
    })).toBe(MAP_LOAD_ERROR_MESSAGE);
  });

  it("includes development-only technical detail for startup failures", () => {
    expect(startupMapErrorMessage({
      hasLoaded: false,
      nodeEnv: "development",
      errorMessage: "style failed to load",
    })).toBe("Map could not be loaded. style failed to load");
  });

  it("does not turn post-load transient events into fatal map errors", () => {
    expect(startupMapErrorMessage({
      hasLoaded: true,
      nodeEnv: "production",
      errorMessage: "tile timed out",
    })).toBeNull();
  });

  it("uses the same failure policy from both browser map surfaces", () => {
    for (const file of ["components/RedlineMap.tsx", "components/TrailDetailMap.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('from "@/lib/map/map-load-errors"');
      expect(source).toContain("startupMapErrorMessage");
      expect(source).toContain("setMapError(null)");
    }
  });
});
