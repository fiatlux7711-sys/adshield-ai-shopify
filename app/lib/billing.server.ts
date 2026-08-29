import { logger } from "./logger.server";

/**
 * Shopify billing configuration.
 *
 * ⚠️  BILLING IS DISABLED AND UNAPPROVED.
 *
 * Nothing here charges a merchant. `billingEnabled()` returns false unless
 * ADSHIELD_BILLING_ENABLED === "true" AND a plan set has been marked
 * approved, and no route calls `require`/`request` yet. The prices below are
 * BENCHMARK PLACEHOLDERS from the handoff for discussion — they are not
 * approved prices and must not be presented to a merchant or published in an
 * App Store listing until the owner approves them explicitly.
 *
 * Turning billing on is a deliberate, reviewed change:
 *   1. Owner approves final prices, trial length, and plan limits.
 *   2. Update PLANS below and set approved: true.
 *   3. Set ADSHIELD_BILLING_ENABLED=true in the environment.
 *   4. Test against a development store with a test charge BEFORE production.
 *
 * See docs/PRICING_PROPOSAL.md.
 */

export type PlanId = "starter" | "growth" | "scale";

export type Plan = {
  id: PlanId;
  /** Name shown to merchants and registered with Shopify. */
  name: string;
  /** Benchmark only — NOT an approved price. */
  amount: number;
  currencyCode: "USD";
  interval: "EVERY_30_DAYS";
  trialDays: number;
  /** Maximum products scanned per audit run on this plan. */
  productLimit: number;
  /** Maximum scans per calendar month. */
  scansPerMonth: number;
  features: string[];
};

/**
 * Set to true only after the owner has approved these exact prices, trial
 * length, and limits. While false, billing cannot be enabled at all.
 */
export const PRICING_APPROVED = false;

export const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: "Starter",
    amount: 49,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 14,
    productLimit: 250,
    scansPerMonth: 10,
    features: [
      "Up to 250 products per scan",
      "10 scans per month",
      "Deterministic compliance rule screening",
      "Audit history and evidence-level reports",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    amount: 99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 14,
    productLimit: 1000,
    scansPerMonth: 60,
    features: [
      "Up to 1,000 products per scan",
      "60 scans per month",
      "AI-assisted review of higher-risk claims",
      "Everything in Starter",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    amount: 199,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 14,
    productLimit: 5000,
    scansPerMonth: 300,
    features: [
      "Up to 5,000 products per scan",
      "300 scans per month",
      "Priority scan queue",
      "Everything in Growth",
    ],
  },
] as const;

export const DEFAULT_PLAN_ID: PlanId = "starter";

/**
 * Billing is off unless BOTH the environment opts in AND pricing has been
 * approved in code. The double gate means a stray environment variable
 * cannot start charging merchants on unapproved prices.
 */
export function billingEnabled(): boolean {
  const envOptIn = process.env.ADSHIELD_BILLING_ENABLED === "true";
  if (envOptIn && !PRICING_APPROVED) {
    logger.warn("billing.blocked_unapproved_pricing", {
      reason: "ADSHIELD_BILLING_ENABLED is true but PRICING_APPROVED is false",
    });
    return false;
  }
  return envOptIn && PRICING_APPROVED;
}

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/**
 * Effective limits for a shop. While billing is disabled every shop gets the
 * default plan's limits — no merchant is gated behind a paywall that has not
 * been approved, and no merchant is charged.
 */
export function limitsForShop(planId: string | null | undefined): Pick<Plan, "productLimit" | "scansPerMonth"> {
  if (!billingEnabled()) {
    const plan = getPlan(DEFAULT_PLAN_ID);
    return { productLimit: plan.productLimit, scansPerMonth: plan.scansPerMonth };
  }
  const plan = PLANS.find((p) => p.id === planId) ?? getPlan(DEFAULT_PLAN_ID);
  return { productLimit: plan.productLimit, scansPerMonth: plan.scansPerMonth };
}

/**
 * Shape consumed by shopifyApp({ billing }) once billing is switched on.
 * Exported now so the config can be reviewed and tested before activation;
 * it is deliberately NOT wired into shopify.server.ts yet.
 */
export function shopifyBillingConfig() {
  return Object.fromEntries(
    PLANS.map((plan) => [
      plan.name,
      {
        amount: plan.amount,
        currencyCode: plan.currencyCode,
        interval: plan.interval,
        trialDays: plan.trialDays,
      },
    ]),
  );
}
