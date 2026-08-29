import { describe, expect, it } from "vitest";
import { assertProductionEnvironment } from "./env.server";

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
