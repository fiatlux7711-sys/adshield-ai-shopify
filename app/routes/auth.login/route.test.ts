import { beforeEach, describe, expect, it, vi } from "vitest";

const login = vi.fn();
vi.mock("../../shopify.server", () => ({ login: (...args: unknown[]) => login(...args) }));

describe("auth/login route loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("trims a whitespace-padded SHOPIFY_API_KEY the same way shopify.server.ts does", async () => {
    process.env.SHOPIFY_API_KEY = "  2a6c6d5ce2677cb3234760273ba28f53\n";
    login.mockResolvedValue({});
    const { loader } = await import("./route");

    const result = await loader({ request: new Request("https://app.example/auth/login") } as any);
    expect(result.apiKey).toBe("2a6c6d5ce2677cb3234760273ba28f53");
  });
});
