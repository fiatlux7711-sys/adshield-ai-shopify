import { describe, expect, it } from "vitest";
import { assertProductionEnvironment, resolveShopifyEnv } from "./env.server";

describe("production environment", () => {
  it("does not require production variables in development", () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: "development" })).not.toThrow();
  });

  it("fails closed when a required production variable is missing", () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("requires an HTTPS production app URL", () => {
    expect(() => assertProductionEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db/example",
      SHOPIFY_API_KEY: "key",
      SHOPIFY_API_SECRET: "secret",
      SHOPIFY_APP_URL: "http://example.com",
    })).toThrow(/HTTPS/);
  });
});

describe("resolveShopifyEnv — whitespace hardening", () => {
  // Regression coverage for a real production incident: the embedded app
  // returned 401 on every authenticated request while session-token
  // exchange itself succeeded. Root cause class: a credential stored with
  // incidental whitespace passes any "is it set" check but produces a
  // byte-different HMAC secret, so JWT signature verification fails on
  // every request. These tests assert the value actually used to construct
  // the Shopify app is trimmed, not just checked for presence.

  it("trims a trailing newline from SHOPIFY_API_SECRET (the exact shape of a copy-pasted dashboard value)", () => {
    const result = resolveShopifyEnv({ SHOPIFY_API_SECRET: "shpss_realsecretvalue\n" } as NodeJS.ProcessEnv);
    expect(result.apiSecretKey).toBe("shpss_realsecretvalue");
  });

  it("trims leading/trailing spaces from SHOPIFY_API_KEY", () => {
    const result = resolveShopifyEnv({ SHOPIFY_API_KEY: "  2a6c6d5ce2677cb3234760273ba28f53  " } as NodeJS.ProcessEnv);
    expect(result.apiKey).toBe("2a6c6d5ce2677cb3234760273ba28f53");
  });

  it("trims SHOPIFY_APP_URL so a stray trailing space can't create a redirect/callback mismatch", () => {
    const result = resolveShopifyEnv({ SHOPIFY_APP_URL: "https://adshield-ai.onrender.com \n" } as NodeJS.ProcessEnv);
    expect(result.appUrl).toBe("https://adshield-ai.onrender.com");
  });

  it("trims each scope in a comma-separated SCOPES value", () => {
    const result = resolveShopifyEnv({ SCOPES: " read_products , read_orders " } as NodeJS.ProcessEnv);
    expect(result.scopes).toEqual(["read_products", "read_orders"]);
  });

  it("does not throw and falls back to empty string when SHOPIFY_API_SECRET is unset", () => {
    const result = resolveShopifyEnv({} as NodeJS.ProcessEnv);
    expect(result.apiSecretKey).toBe("");
    expect(result.appUrl).toBe("");
  });

  it("treats a whitespace-only value the same as unset, rather than passing through blank padding", () => {
    const result = resolveShopifyEnv({ SHOPIFY_API_SECRET: "   " } as NodeJS.ProcessEnv);
    expect(result.apiSecretKey).toBe("");
  });

  it("passes a correctly-formatted value through unchanged", () => {
    const result = resolveShopifyEnv({
      SHOPIFY_API_KEY: "2a6c6d5ce2677cb3234760273ba28f53",
      SHOPIFY_API_SECRET: "shpss_realsecretvalue",
      SHOPIFY_APP_URL: "https://adshield-ai.onrender.com",
      SCOPES: "read_products",
    } as NodeJS.ProcessEnv);
    expect(result).toMatchObject({
      apiKey: "2a6c6d5ce2677cb3234760273ba28f53",
      apiSecretKey: "shpss_realsecretvalue",
      appUrl: "https://adshield-ai.onrender.com",
      scopes: ["read_products"],
    });
  });
});
