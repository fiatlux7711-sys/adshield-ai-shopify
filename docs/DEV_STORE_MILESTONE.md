# Milestone 1 — install on the dev store and audit the six test products

This is the first milestone: **AdShield AI installed on a Shopify development
store and successfully auditing six controlled test products end-to-end.**

Everything in this repo up to this point is verified at the source and test
level only. Nothing below has been executed against Shopify.

## Why this can't be completed from the Claude session

`shopify app config link` and `shopify app dev` both require an interactive
browser login to Shopify. The remote session running Claude is non-interactive:

```
$ npx shopify app config link
Flag not specified: --client-id
This flag is required in non-interactive terminal environments.
```

So the link and install must be driven by you. Everything else is ready.

## Step 1 — link to the existing app (do not create a new one)

From an interactive terminal in this repo:

```bash
npx shopify app config link
```

Choose **Organization: Omnipresent technologies**, **App: AdShield AI**. Do not
create a duplicate app.

This writes `client_id` into `shopify.app.toml` and creates `.shopify/`. Commit
the updated `shopify.app.toml`; `.shopify/` is local state.

> Alternatively, paste the AdShield AI **Client ID** from the Partner Dashboard
> into a message and Claude can link non-interactively with
> `npx shopify app config link --client-id <id>`. The Client ID is a public
> app identifier, not a secret — but never paste the **API secret**.

## Step 2 — verify the link

```bash
grep client_id shopify.app.toml   # must be non-empty
ls -la .shopify
```

## Step 3 — run the dev server

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx shopify app dev
```

Let the CLI update the application URL and redirect URLs. Do not hand-edit them.

## Step 4 — create the six test products

In the development store, create products with this copy. The first five must
be flagged; the sixth must come back clean.

| # | Product title | Expected category | Expected severity |
| --- | --- | --- | --- |
| 1 | `Cures back pain` | `health_claim` | CRITICAL |
| 2 | `Guaranteed results` | `guarantee_claim` | HIGH |
| 3 | `100% eco-friendly` | `environmental_claim` | HIGH |
| 4 | `Only 2 left` | `scarcity_urgency` | MEDIUM |
| 5 | `Make $5,000/month` | `earnings_claim` | CRITICAL |
| 6 | `Stainless steel water bottle with a 24 hour vacuum seal and a lifetime warranty.` | — | PASS |

These exact strings are pinned as automated tests in
`app/lib/acceptance-fixtures.test.ts`, which passes against the rules engine
today (22 assertions). The dev-store run confirms the same behavior through the
real Shopify GraphQL + persistence path.

> Product 5 originally returned **PASS** — the earnings rule had no pattern for
> "make $X". That was found and fixed while writing these fixtures. Without the
> fixture it would have surfaced as a silent miss during this milestone.

## Step 5 — acceptance checklist

Install / auth:
- [ ] App installs successfully
- [ ] Opens embedded in Shopify Admin
- [ ] No redirect loop, no iframe/CSP error
- [ ] Only `read_products` requested

Audit:
- [ ] Products 1–5 flagged with the categories and severities above
- [ ] Product 6 produces **no** issues (no invented findings)
- [ ] Evidence quotes the merchant's own text
- [ ] Audit run completes; history persists; detail page renders
- [ ] Store Readiness Score calculates

Webhooks (`shopify app webhook trigger`, plus an uninstall/reinstall cycle):
- [ ] `app/uninstalled` · `app/scopes_update`
- [ ] `customers/data_request` · `customers/redact` · `shop/redact`
- [ ] Invalid HMAC rejected
- [ ] Duplicate delivery is safe

Mobile:
- [ ] Dashboard usable at small width in Shopify mobile admin
- [ ] No horizontal overflow; tap targets accessible

## After this milestone passes

Only then: PostgreSQL, background queue, continuous monitoring, product-level
and bulk audit actions, billing, production hosting, and App Store materials —
in that order, per the handoff.
