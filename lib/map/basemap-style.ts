import type { StyleSpecification } from "maplibre-gl";

type MapStyleEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_MAP_STYLE_URL?: string;
};

export type BrowserMapStyleResult =
  | { ok: true; style: string | StyleSpecification; source: "configured" | "development-osm-fallback" }
  | { ok: false; message: string };

export const PRODUCTION_MAP_STYLE_REQUIRED_MESSAGE =
  "Production map rendering requires NEXT_PUBLIC_MAP_STYLE_URL configured to a hosted MapLibre style URL.";

export const INVALID_MAP_STYLE_URL_MESSAGE =
  "NEXT_PUBLIC_MAP_STYLE_URL must be a valid production-safe MapLibre style URL.";

export function getBrowserMapStyle(): BrowserMapStyleResult {
  return resolveBrowserMapStyle({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  });
}

export function resolveBrowserMapStyle(env: MapStyleEnv = process.env): BrowserMapStyleResult {
  const configuredStyleUrl = clean(env.NEXT_PUBLIC_MAP_STYLE_URL);
  if (configuredStyleUrl) {
    return isValidMapStyleUrl(configuredStyleUrl, env.NODE_ENV === "production")
      ? { ok: true, style: configuredStyleUrl, source: "configured" }
      : { ok: false, message: INVALID_MAP_STYLE_URL_MESSAGE };
  }

  if (env.NODE_ENV === "production") {
    return { ok: false, message: PRODUCTION_MAP_STYLE_REQUIRED_MESSAGE };
  }

  return { ok: true, style: developmentOsmRasterStyle(), source: "development-osm-fallback" };
}

function developmentOsmRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      "development-osm": {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "(c) OpenStreetMap contributors",
      },
    },
    layers: [{ id: "development-osm", type: "raster", source: "development-osm" }],
  };
}

function isValidMapStyleUrl(value: string, production: boolean) {
  try {
    const url = new URL(value);
    if (production) return isValidProductionMapStyleUrl(url);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidProductionMapStyleUrl(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (isLocalHostname(url.hostname)) return false;
  if (isPrivateIpv4(url.hostname)) return false;
  return true;
}

function isLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.endsWith(".localhost") || host.endsWith(".local");
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet, index) => !Number.isInteger(octet) || octet < 0 || octet > 255 || parts[index] !== String(octet))) {
    return false;
  }

  const [a, b] = octets;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 127;
}

function clean(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
