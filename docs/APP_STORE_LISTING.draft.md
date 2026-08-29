# Shopify App Store listing — draft

> **DRAFT. Not submitted, and not submittable yet.** The blockers in
> "Before this can be submitted" below are real and unmet. Submission is one
> of the approval gates in the handoff and will not happen without your
> explicit go-ahead.

Every claim here is written to survive Shopify review *and* the product's own
positioning rule: AdShield AI screens for **potential** risk and never states
that anything is legally compliant or approved.

## App name

```
AdShield AI
```

## Tagline (≤ 62 chars)

```
Spot risky product claims before you advertise them
```

Alternatives:
- `Screen product copy for advertising-compliance risk` (51)
- `Find marketing claims that may need substantiation` (50)

Deliberately avoids "compliance guaranteed", "stay compliant", "legal" — all
of which would overstate what the app does.

## Short description (≤ 120 chars)

```
Scan product titles, descriptions and SEO copy for marketing claims that may
need review or substantiation.
```

## Long description

> **Know which product claims deserve a second look — before you spend on ads.**
>
> AdShield AI reads your product titles, descriptions, SEO fields and tags,
> and flags marketing language that commonly attracts advertising-compliance
> scrutiny: health and disease claims, absolute guarantees, superiority
> claims, urgency and scarcity, "free" offers, environmental claims,
> country-of-origin claims, earnings claims, and results-based testimonials.
>
> For every flag you get the exact phrase from your own copy, a plain-English
> explanation of why it may warrant review, and a suggested safer direction.
> You decide what to change — AdShield AI never edits your products.
>
> **How it works**
> 1. Install and run your first scan. No configuration required.
> 2. AdShield AI reads your catalogue using Shopify's Admin API.
> 3. You get a Store Readiness Score and a prioritized list of findings.
> 4. Open any flagged product to see the evidence and recommended action.
>
> **Built to be safe by default**
> - Read-only. AdShield AI requests only `read_products` and never modifies
>   your store content.
> - No customer, order, or payment data is requested or stored.
> - Deterministic rule screening always runs; optional AI review is an
>   enhancement, and the app works fully without it.
>
> **What AdShield AI is not**
> AdShield AI is a risk-screening and workflow tool. It is not a law firm, it
> does not provide legal advice, and it does not certify compliance. A clean
> scan means only that the checks enabled at that time did not identify a
> risk — it is not legal approval. For high-risk claims, consult a qualified
> professional.

## Key benefits (3 bullets)

1. **See the evidence, not just a score** — every finding quotes the exact
   phrase from your own product copy.
2. **Read-only by design** — least-privilege `read_products` access, and your
   product content is never modified.
3. **Works without AI** — deterministic rules always run; AI review is
   optional and degrades safely.

## Category

Primary: Store management → Product management
Secondary: Marketing → Advertising

## Search terms

`compliance`, `product copy`, `advertising claims`, `marketing risk`,
`claim substantiation`, `product audit`, `ad review`, `copy review`

## Pricing section

**Blocked.** Cannot be written until pricing is approved — see
`docs/PRICING_PROPOSAL.md`. The listing must state plan limits, trial length,
and cancellation behaviour exactly as implemented.

## Required URLs

| Field | Value | Status |
| --- | --- | --- |
| Privacy policy | `[URL]` | ❌ draft only, not published |
| Terms of service | `[URL]` | ❌ draft only, not published |
| Support email | `[EMAIL]` | ❌ not set up |
| Support/documentation URL | `[URL]` | ❌ not built |

## Screenshots needed (1600×900)

Cannot be produced until the app runs on the dev store with the six test
products. Planned set:

1. Dashboard with Store Readiness Score and a completed scan.
2. Audit report — summary counts plus the findings list.
3. A single flagged product showing evidence, explanation, and recommended action.
4. The clean-control product showing "no risk identified by enabled checks".
5. Settings, showing the read-only scope and AI status.

Screenshots must show real output from a real scan. Do not mock them.

---

# Instructions for the Shopify reviewer

> Fill in the bracketed values once the app is deployed and the test store
> exists.

**Test store:** `[STORE].myshopify.com`
**Install link:** `[URL]`
**Credentials:** not required — the app needs no separate account.

**What the app does:** reads product marketing copy via the Admin GraphQL API
and reports advertising-compliance *risk signals*. It is read-only and makes
no writes to the store.

**Scope justification:** `read_products` only. The app reads product title,
description, SEO title, SEO description, tags, and status — the fields that
carry marketing claims. It requests no customer, order, or payment scopes
because it never uses that data.

**To reproduce the core flow (about 2 minutes):**

1. Open the app from the store admin. It loads embedded.
2. The test store already contains six products created for review:

   | Product | Expected result |
   | --- | --- |
   | `Cures back pain` | Flagged CRITICAL — health/disease claim |
   | `Guaranteed results` | Flagged HIGH — absolute guarantee |
   | `100% eco-friendly` | Flagged HIGH — broad environmental claim |
   | `Only 2 left` | Flagged MEDIUM — scarcity/urgency |
   | `Make $5,000/month` | Flagged CRITICAL — earnings claim |
   | `Stainless steel water bottle…` | No findings — clean control |

3. Click **Run compliance scan** on the dashboard. The scan runs in the
   background; the report page shows live progress and updates itself.
4. When it completes, the report lists each flagged product with the exact
   phrase matched, why it may need review, and a suggested action.
5. Open **Audit history** to confirm the run persisted, and **Settings** to
   see the requested scope and AI status.

**Privacy webhooks:** `customers/data_request`, `customers/redact`, and
`shop/redact` are implemented. The app stores no customer personal data, so
the customer-scoped webhooks acknowledge with nothing to return or erase;
`shop/redact` deletes the shop's audit runs, audit items, installation record,
and sessions. Webhook requests with an invalid HMAC are rejected with 401
(verified).

**Note on claims language:** the app deliberately never tells a merchant that
content is compliant, approved, or illegal. A clean result is presented as
"no enabled rule detected a risk". This is intentional positioning, not an
omission.

---

# Before this can be submitted

Unmet, and each is a hard blocker:

- [ ] App installed and verified on a development store
- [ ] End-to-end scan of the six products verified live
- [ ] Production host live over HTTPS
- [ ] Production PostgreSQL live, with a tested restore
- [ ] Privacy policy and terms reviewed by counsel and **published**
- [ ] Support email and support page live
- [ ] Pricing approved; billing tested with a real test charge
- [ ] Screenshots captured from real scan output
- [ ] Embedded-page accessibility audited in a real session
- [ ] Error monitoring live
- [ ] Backups configured and restore-drilled

Submission also requires your explicit approval — it is an approval gate.
