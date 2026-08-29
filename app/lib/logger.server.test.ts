import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("logger redaction", () => {
  let out: string[];

  beforeEach(async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "debug";
    out = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void out.push(l));
    vi.spyOn(console, "warn").mockImplementation((l: string) => void out.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void out.push(l));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("redacts credential-shaped keys at the top level", async () => {
    const { logger } = await import("./logger.server");
    logger.info("test", { accessToken: "shpat_supersecret", shop: "a.myshopify.com" });

    expect(out[0]).not.toContain("shpat_supersecret");
    expect(out[0]).toContain("[redacted]");
    expect(out[0]).toContain("a.myshopify.com");
  });

  it("redacts credential-shaped keys nested inside objects", async () => {
    const { logger } = await import("./logger.server");
    logger.info("test", { session: { shop: "a", api_secret: "nested_secret" } });

    expect(out[0]).not.toContain("nested_secret");
    expect(out[0]).toContain("[redacted]");
  });

  it("reduces an Error to name and message without a stack trace", async () => {
    const { logger } = await import("./logger.server");
    const err = new Error("boom");
    logger.error("test", { error: err });

    expect(out[0]).toContain("boom");
    expect(out[0]).not.toContain("at Object");
    expect(out[0]).not.toContain(".test.ts:");
  });

  it("emits parseable JSON with a timestamp, level, and event", async () => {
    const { logger } = await import("./logger.server");
    logger.warn("audit.retrying", { runId: "run-1" });

    const parsed = JSON.parse(out[0]);
    expect(parsed.level).toBe("warn");
    expect(parsed.event).toBe("audit.retrying");
    expect(parsed.runId).toBe("run-1");
    expect(typeof parsed.ts).toBe("string");
  });

  it("suppresses output below the configured level", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "error";
    const { logger } = await import("./logger.server");
    logger.info("should not appear");
    logger.error("should appear");

    expect(out).toHaveLength(1);
    expect(out[0]).toContain("should appear");
  });
});

describe("merchantSafeError", () => {
  it("maps a GraphQL failure to a retry hint without leaking internals", async () => {
    const { merchantSafeError } = await import("./logger.server");
    const msg = merchantSafeError(
      new Error('Shopify GraphQL error: [{"message":"Throttled","extensions":{"cost":900}}]'),
    );

    expect(msg).not.toContain("Throttled");
    expect(msg).not.toContain("extensions");
    expect(msg).toMatch(/retry/i);
  });

  it("falls back to a generic message for any other failure", async () => {
    const { merchantSafeError } = await import("./logger.server");
    const msg = merchantSafeError(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    expect(msg).not.toContain("10.0.0.5");
    expect(msg).not.toContain("ECONNREFUSED");
  });
});
