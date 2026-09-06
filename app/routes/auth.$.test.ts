import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { admin: (...args: unknown[]) => authenticateAdmin(...args) },
}));

let out: string[];

describe("auth/* catch-all route (OAuth start / callback / session-token exchange)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LOG_LEVEL = "debug";
    out = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void out.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void out.push(l));
  });

  it("delegates to authenticate.admin and logs a non-secret success event", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-a.myshopify.com" } });
    const { loader } = await import("./auth.$");

    const result = await loader({
      request: new Request("https://app.example/auth/callback?shop=shop-a.myshopify.com"),
    } as any);

    expect(result).toBeNull();
    const events = out.map((l) => JSON.parse(l));
    expect(events.some((e) => e.event === "auth.request_ok" && e.shop === "shop-a.myshopify.com")).toBe(true);
  });

  it("passes a redirect Response straight through and logs it as a redirect, not an error", async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: "https://shop.example/admin/oauth/authorize" } });
    authenticateAdmin.mockRejectedValue(redirect);
    const { loader } = await import("./auth.$");

    await expect(
      loader({ request: new Request("https://app.example/auth?shop=shop-a.myshopify.com") } as any),
    ).rejects.toBe(redirect);

    const events = out.map((l) => JSON.parse(l));
    expect(events.some((e) => e.event === "auth.request_redirect" && e.status === 302)).toBe(true);
    expect(events.some((e) => e.level === "error")).toBe(false);
  });

  it("logs a real thrown error at error level and still rethrows it", async () => {
    const err = new Error("token exchange failed");
    authenticateAdmin.mockRejectedValue(err);
    const { loader } = await import("./auth.$");

    await expect(
      loader({ request: new Request("https://app.example/auth/session-token?shop=shop-a.myshopify.com") } as any),
    ).rejects.toBe(err);

    const events = out.map((l) => JSON.parse(l));
    const failure = events.find((e) => e.event === "auth.request_failed");
    expect(failure).toBeDefined();
    expect(failure.level).toBe("error");
    expect(failure.error.message).toBe("token exchange failed");
  });

  it("never logs the request's query string, so an id_token/hmac/session value in the URL cannot leak into logs", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-a.myshopify.com" } });
    const { loader } = await import("./auth.$");

    const sensitiveUrl =
      "https://app.example/auth/session-token?shop=shop-a.myshopify.com&id_token=eyJhbGciOiJIUzI1NiJ9.super-secret-payload.sig&hmac=deadbeef&session=abc123session";
    await loader({ request: new Request(sensitiveUrl) } as any);

    const joined = out.join("\n");
    expect(joined).not.toContain("id_token");
    expect(joined).not.toContain("super-secret-payload");
    expect(joined).not.toContain("deadbeef");
    expect(joined).not.toContain("abc123session");
  });
});
