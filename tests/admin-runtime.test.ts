import { notFound } from "next/navigation";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "@/app/admin/layout";
import { proxy } from "@/proxy";
import { isAdminRoutePath, isAdminToolsRuntimeAvailable, shouldBlockAdminRoute } from "@/lib/admin/runtime";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("admin runtime protection", () => {
  it("allows admin tools in local development semantics", () => {
    expect(isAdminToolsRuntimeAvailable({ NODE_ENV: "development" })).toBe(true);
    expect(shouldBlockAdminRoute("/admin/reconciliation", { NODE_ENV: "development" })).toBe(false);

    vi.stubEnv("NODE_ENV", "development");

    expect(AdminLayout({ children: "admin content" })).toBe("admin content");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("denies admin tools in production semantics", () => {
    expect(isAdminToolsRuntimeAvailable({ NODE_ENV: "production" })).toBe(false);
    expect(shouldBlockAdminRoute("/admin/reconciliation", { NODE_ENV: "production" })).toBe(true);

    vi.stubEnv("NODE_ENV", "production");

    expect(() => AdminLayout({ children: "admin content" })).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("blocks Vercel Preview because preview builds run production semantics", () => {
    expect(isAdminToolsRuntimeAvailable({ NODE_ENV: "production" })).toBe(false);
    expect(shouldBlockAdminRoute("/admin/publication", { NODE_ENV: "production" })).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(() => AdminLayout({ children: "preview admin content" })).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("covers the shared /admin route boundary", () => {
    expect(isAdminRoutePath("/admin")).toBe(true);
    expect(isAdminRoutePath("/admin/segments")).toBe(true);
    expect(isAdminRoutePath("/admin/activity-matching")).toBe(true);
    expect(isAdminRoutePath("/admin/publication")).toBe(true);
    expect(isAdminRoutePath("/trails")).toBe(false);
    expect(shouldBlockAdminRoute("/trails", { NODE_ENV: "production" })).toBe(false);
  });

  it("rewrites production admin requests before the route tree renders", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await proxy(new NextRequest("http://localhost/admin/segments"));

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost/_not-found");
  });

  it("does not provide a production opt-in bypass", () => {
    expect(isAdminToolsRuntimeAvailable({ NODE_ENV: "production" })).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_ENABLED", "true");
    vi.stubEnv("ADMIN_PASSWORD", "local-secret");
    vi.stubEnv("ADMIN_EMAIL_ALLOWLIST", "admin@example.com");
    vi.stubEnv("ADMIN_ROLE", "admin");

    expect(() => AdminLayout({ children: "bypassed admin content" })).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
