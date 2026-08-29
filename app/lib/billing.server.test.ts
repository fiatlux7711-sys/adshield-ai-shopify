import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests exist to make accidental activation loud. Billing must stay off
 * until the owner approves pricing; if someone flips an environment variable
 * or edits PRICING_APPROVED without the rest of the review, a test fails.
 */
describe("billing safety gates", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("ships with pricing NOT approved", async () => {
    const { PRICING_APPROVED } = await import("./billing.server");
    expect(PRICING_APPROVED).toBe(false);
  });

  it("is disabled by default", async () => {
    delete process.env.ADSHIELD_BILLING_ENABLED;
    const { billingEnabled } = await import("./billing.server");
    expect(billingEnabled()).toBe(false);
  });

  it("stays disabled even if the environment opts in, while pricing is unapproved", async () => {
    process.env.ADSHIELD_BILLING_ENABLED = "true";
    const { billingEnabled } = await import("./billing.server");
    // The double gate is the point: an env var alone must never start charging.
    expect(billingEnabled()).toBe(false);
  });

  it("does not gate any shop behind unapproved paid limits", async () => {
    process.env.ADSHIELD_BILLING_ENABLED = "true";
    const { limitsForShop, getPlan, DEFAULT_PLAN_ID } = await import("./billing.server");
    const fallback = getPlan(DEFAULT_PLAN_ID);

    // Even a shop claiming the top plan gets default limits while billing is off,
    // and a shop on no plan is not restricted below the default.
    expect(limitsForShop("scale")).toEqual({
      productLimit: fallback.productLimit,
      scansPerMonth: fallback.scansPerMonth,
    });
    expect(limitsForShop(null)).toEqual({
      productLimit: fallback.productLimit,
      scansPerMonth: fallback.scansPerMonth,
    });
  });

  it("is not wired into the Shopify app config yet", async () => {
    const source = await import("fs").then((fs) =>
      fs.readFileSync("app/shopify.server.ts", "utf8"),
    );
    expect(source).not.toMatch(/billing/i);
  });

  it("no route imports the billing module yet", async () => {
    const { execFileSync } = await import("child_process");
    const hits = execFileSync("bash", [
      "-c",
      "grep -rl 'billing.server' app/routes 2>/dev/null || true",
    ])
      .toString()
      .trim();
    expect(hits).toBe("");
  });
});

describe("plan definitions", () => {
  it("exposes three plans with trial days and explicit limits", async () => {
    const { PLANS } = await import("./billing.server");
    expect(PLANS.map((p) => p.id)).toEqual(["starter", "growth", "scale"]);
    for (const plan of PLANS) {
      expect(plan.trialDays).toBeGreaterThan(0);
      expect(plan.productLimit).toBeGreaterThan(0);
      expect(plan.scansPerMonth).toBeGreaterThan(0);
      expect(plan.currencyCode).toBe("USD");
    }
  });

  it("orders plans by ascending price and non-decreasing limits", async () => {
    const { PLANS } = await import("./billing.server");
    for (let i = 1; i < PLANS.length; i += 1) {
      expect(PLANS[i].amount).toBeGreaterThan(PLANS[i - 1].amount);
      expect(PLANS[i].productLimit).toBeGreaterThanOrEqual(PLANS[i - 1].productLimit);
    }
  });

  it("produces a Shopify billing config keyed by plan name", async () => {
    const { shopifyBillingConfig } = await import("./billing.server");
    const config = shopifyBillingConfig();
    expect(Object.keys(config)).toEqual(["Starter", "Growth", "Scale"]);
    expect(config.Starter).toMatchObject({ currencyCode: "USD", interval: "EVERY_30_DAYS" });
  });
});
