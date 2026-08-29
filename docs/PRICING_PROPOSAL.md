# Pricing proposal — requires your approval

**Status: NOT APPROVED. Billing is disabled in code and no merchant can be
charged.** `PRICING_APPROVED = false` in `app/lib/billing.server.ts`, and
`billingEnabled()` returns false even if `ADSHIELD_BILLING_ENABLED=true`.
Nine tests enforce that. Nothing below is live.

The numbers here come from the handoff's benchmark range ($49 / $99 / $199).
They are a **starting point for your decision**, not a recommendation I can
make for you — I have not benchmarked competitors or tested willingness to
pay, and the handoff explicitly says not to treat these as final.

## Proposed structure: flat tiers

Flat tiers fit this product better than per-scan or per-AI-call pricing:

- Merchants buy **risk reduction**, not compute. Metered pricing makes the
  value abstract and the bill unpredictable.
- Usage-based pricing creates a perverse incentive: it discourages scanning,
  which is exactly the behaviour the product exists to encourage.
- Compliance buyers budget annually and prefer a predictable line item.

| | Starter | Growth | Scale |
| --- | --- | --- | --- |
| Benchmark price / month | $49 | $99 | $199 |
| Products per scan | 250 | 1,000 | 5,000 |
| Scans per month | 10 | 60 | 300 |
| AI-assisted review | — | ✅ | ✅ |
| Priority scan queue | — | — | ✅ |
| Trial | 14 days | 14 days | 14 days |

## What you need to decide

1. **The three prices.** Benchmark competitors first — the handoff asks for
   this and I have not done it.
2. **Trial length.** 14 days is proposed. A compliance review cycle can be
   slower than that; 30 days may convert better.
3. **The limits.** Products-per-scan and scans-per-month are guesses. They
   should be set from real catalogue-size data once merchants are using it.
4. **What happens at the limit.** Options: block the scan, scan the first N
   products and say so, or allow it and prompt an upgrade. Blocking is the
   most honest; silently truncating is the worst and should be avoided.
5. **What happens after cancellation.** Proposal: audit history stays
   readable for 30 days, then is deleted. This must match the Data Retention
   policy exactly.

## Constraints that are not negotiable

Per the handoff, whatever you choose must have:

- No surprise charges, and no dark patterns.
- Trial start and end dates shown clearly before the trial begins.
- Plan limits stated plainly before purchase, not in fine print.
- Cancellation behaviour stated before purchase.
- Shopify's native billing API — never a third-party payment flow.
- A test charge against a development store **before** production.

## What is already built

- `app/lib/billing.server.ts` — plan definitions, limits, and the config
  shape `shopifyApp({ billing })` expects.
- Double activation gate: environment opt-in **and** `PRICING_APPROVED`.
- `limitsForShop()` returns default-plan limits while billing is off, so no
  merchant is gated behind an unapproved paywall.
- Tests asserting billing is off, is not wired into `shopify.server.ts`, and
  is not imported by any route.

## To activate later

1. You approve prices, trial, and limits.
2. Update `PLANS`, set `PRICING_APPROVED = true`.
3. Wire `billing: shopifyBillingConfig()` into `shopifyApp()`.
4. Add the plan-selection UI and `billing.require()` guards.
5. Update the Terms and Refund/Cancellation policy to match exactly.
6. Test a charge on a development store.
7. Only then set `ADSHIELD_BILLING_ENABLED=true` in production.

I will not do step 2 or step 7 without your explicit instruction.
