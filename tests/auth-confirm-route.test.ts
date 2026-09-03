import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAuthRuntimeConfig: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signInWithOtp: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseAuthRuntimeConfig: mocks.getSupabaseAuthRuntimeConfig,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { GET as oauthCallbackGET } from "@/app/auth/callback/route";
import { GET as emailConfirmGET } from "@/app/auth/confirm/route";
import { signInWithMagicLinkAction } from "@/app/login/actions";

const runtime = {
  url: "https://project.supabase.co",
  publishableKey: "sb_publishable_test",
  keySource: "publishable" as const,
  siteUrl: "https://trails.jamesscottsullivan.com",
};

function request(url: string) {
  return new Request(url) as Parameters<typeof emailConfirmGET>[0];
}

function supabaseClient() {
  return {
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      signInWithOtp: mocks.signInWithOtp,
    },
  };
}

describe("email auth confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseAuthRuntimeConfig.mockReturnValue(runtime);
    mocks.createServerSupabaseClient.mockResolvedValue(supabaseClient());
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "server-only" } }, error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: "oauth" } }, error: null });
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  });

  it("verifies a token_hash with a supported email OTP type and redirects to the safe returnTo", async () => {
    const response = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=email&returnTo=%2Faccount%3Ftab%3Devidence"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-123", type: "email" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/account?tab=evidence");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["signup", "magiclink"] as const)("accepts %s token_hash confirmations for template compatibility", async (type) => {
    await emailConfirmGET(request(`https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=${type}`));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-123", type });
  });

  it("rejects a missing token_hash without calling Supabase verification", async () => {
    const response = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?type=email&returnTo=%2Faccount"));

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/login?status=auth-error&returnTo=%2Faccount");
  });

  it.each([
    "https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123",
    "https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=recovery",
  ])("rejects missing or unsupported OTP type without verification: %s", async (url) => {
    const response = await emailConfirmGET(request(url));

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/login?status=auth-error&returnTo=%2Faccount");
  });

  it("redirects to an auth error when token verification fails", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: new Error("expired") });

    const response = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=email&returnTo=%2Faccount"));

    expect(response.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/login?status=auth-error&returnTo=%2Faccount");
  });

  it("does not include the token_hash in success or failure redirect URLs", async () => {
    const success = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=secret-hash&type=email"));
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: new Error("expired") });
    const failure = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=secret-hash&type=email"));

    expect(success.headers.get("location")).not.toContain("secret-hash");
    expect(failure.headers.get("location")).not.toContain("secret-hash");
  });

  it("sanitizes external or malformed returnTo values before redirecting", async () => {
    const external = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=email&returnTo=https%3A%2F%2Fevil.example%2Faccount"));
    const malformed = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=email&returnTo=%2F%255Cevil"));

    expect(external.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/account");
    expect(malformed.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/account");
  });

  it("returns the existing unavailable response when Supabase auth runtime config is missing", async () => {
    mocks.getSupabaseAuthRuntimeConfig.mockReturnValue(null);

    const response = await emailConfirmGET(request("https://trails.jamesscottsullivan.com/auth/confirm?token_hash=hash-123&type=email"));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Authentication is unavailable in this environment.");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("keeps the OAuth callback on authorization-code exchange", async () => {
    const response = await oauthCallbackGET(request("https://trails.jamesscottsullivan.com/auth/callback?code=oauth-code&returnTo=%2Faccount"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://trails.jamesscottsullivan.com/account");
  });

  it("uses the server-side email confirmation redirect contract for magic-link requests", async () => {
    const formData = new FormData();
    formData.set("email", "redliner@example.com");
    formData.set("returnTo", "/account?tab=evidence");

    await expect(signInWithMagicLinkAction(formData)).rejects.toMatchObject({
      url: "/login?status=magic-link-sent&returnTo=%2Faccount%3Ftab%3Devidence",
    });

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "redliner@example.com",
      options: {
        emailRedirectTo: "https://trails.jamesscottsullivan.com/auth/confirm?returnTo=%2Faccount%3Ftab%3Devidence",
      },
    });
  });

  it("keeps the production HTTPS site URL in generated email redirects", async () => {
    const formData = new FormData();
    formData.set("email", "redliner@example.com");
    formData.set("returnTo", "/account");

    await expect(signInWithMagicLinkAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toMatch(/^https:\/\/trails\.jamesscottsullivan\.com\/auth\/confirm\?/);
  });
});
