import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { admin: (...args: unknown[]) => authenticateAdmin(...args) },
}));

let out: string[];

describe("app/ layout route loader (the route that returned 401 in the reported production incident)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LOG_LEVEL = "debug";
    process.env.SHOPIFY_API_KEY = "2a6c6d5ce2677cb3234760273ba28f53";
    out = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void out.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void out.push(l));
  });

  it("returns a trimmed apiKey and logs a non-secret success event on a successful authenticated request", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-a.myshopify.com" } });
    const { loader } = await import("./app");

    const result = await loader({ request: new Request("https://app.example/app") } as any);

    expect(result).toEqual({ apiKey: "2a6c6d5ce2677cb3234760273ba28f53" });
    const events = out.map((l) => JSON.parse(l));
    expect(events.some((e) => e.event === "app.auth_ok" && e.shop === "shop-a.myshopify.com")).toBe(true);
  });

  it("trims a whitespace-padded SHOPIFY_API_KEY the same way shopify.server.ts does", async () => {
    process.env.SHOPIFY_API_KEY = "  2a6c6d5ce2677cb3234760273ba28f53\n";
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-a.myshopify.com" } });
    const { loader } = await import("./app");

    const result = await loader({ request: new Request("https://app.example/app") } as any);
    expect(result).toEqual({ apiKey: "2a6c6d5ce2677cb3234760273ba28f53" });
  });

  it("passes a redirect Response straight through and logs it as a redirect, not an error", async () => {
    const redirect = new Response(null, { status: 302 });
    authenticateAdmin.mockRejectedValue(redirect);
    const { loader } = await import("./app");

    await expect(loader({ request: new Request("https://app.example/app") } as any)).rejects.toBe(redirect);

    const events = out.map((l) => JSON.parse(l));
    expect(events.some((e) => e.event === "app.auth_redirect")).toBe(true);
    expect(events.some((e) => e.level === "error")).toBe(false);
  });

  it("logs a session-token verification failure (the exact reported symptom) at error level without leaking the token", async () => {
    const err = new Error("Invalid session token signature");
    authenticateAdmin.mockRejectedValue(err);
    const { loader } = await import("./app");

    const sensitiveUrl = "https://app.example/app?shop=shop-a.myshopify.com&session=super-secret-session-id";
    await expect(loader({ request: new Request(sensitiveUrl) } as any)).rejects.toBe(err);

    const events = out.map((l) => JSON.parse(l));
    const failure = events.find((e) => e.event === "app.auth_failed");
    expect(failure).toBeDefined();
    expect(failure.level).toBe("error");
    expect(failure.error.message).toBe("Invalid session token signature");

    const joined = out.join("\n");
    expect(joined).not.toContain("super-secret-session-id");
  });
});
