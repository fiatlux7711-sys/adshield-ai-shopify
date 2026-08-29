# AdShield AI — Shopify MVP

A read-only embedded Shopify app that scans product marketing copy for advertising/compliance risk and produces a prioritized audit report.

## What is already built

- Shopify React Router embedded-app architecture
- App Bridge / Shopify admin navigation
- Minimal `read_products` access scope
- Product catalog pagination via Admin GraphQL
- Deterministic risk engine covering health claims, guarantees, superiority, urgency/scarcity, free offers, environmental claims, U.S. origin claims, earnings claims, and results/testimonial claims
- Risk scoring and severity classification
- Audit history persisted with Prisma
- Audit detail reports with evidence, explanation, and recommended action
- Optional AI enhancement through Vercel AI Gateway using `spacexai/grok-4.6`
- Mandatory Shopify privacy-compliance webhook endpoints
- App-uninstalled and scope-update webhook handlers
- AdShield AI logo included in `/public/adshield-ai-logo.jpg`
- Read-only MVP: the app never edits merchant content automatically

## Important product positioning

AdShield AI is a **risk-screening and workflow tool**. It should never claim that content is "legally approved," "compliant," or "illegal." A clean scan means only that the enabled checks did not identify a risk.

## Run it in a Shopify development store

1. Install Shopify CLI: `npm install -g @shopify/cli@latest`
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and set at least `DATABASE_URL=file:dev.sqlite`
4. Link the project: `shopify app config link`
   (requires an interactive browser login — see `docs/DEV_STORE_MILESTONE.md`)
5. Prepare Prisma: `npx prisma generate && npx prisma migrate dev`
6. Optional AI: set `AI_GATEWAY_API_KEY` in `.env`
7. Run: `shopify app dev`, then press `p` and install on your development store

Then work through `docs/DEV_STORE_MILESTONE.md`, which contains the
six-product acceptance test.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm test` | Vitest suite |
| `npm run typecheck` | React Router typegen + `tsc --noEmit` |
| `npm run build` | Production build |
| `npm run a11y` | axe-core WCAG 2.1 AA audit (needs a running server) |
| `npm run licenses` | Third-party license inventory |
| `npm run db:gen-pg` | Regenerate the PostgreSQL schema from the dev schema |
| `npm run db:check-pg` | Fail if the two schemas have drifted |
| `npm run db:migrate:pg` | `prisma migrate deploy` against PostgreSQL |

## How a scan runs

Scans run as background jobs. The dashboard action persists a `QUEUED`
`AuditRun` and returns immediately; an in-process worker
(`app/lib/audit-queue.server.ts`) performs the scan, writes results
incrementally, and the report page polls for progress. A web request is never
held open for a catalogue scan.

The worker is **single-instance only** — jobs are held in memory and do not
survive a restart. See `docs/PRODUCTION_DATABASE.md` before running more than
one instance.

## Documentation

| Document | Contents |
| --- | --- |
| `SHOPIFY_BUILD_STATUS.md` | What is verified, what is not, and how it was verified |
| `docs/DEV_STORE_MILESTONE.md` | Dev-store install and six-product acceptance test |
| `docs/PRODUCTION_DATABASE.md` | PostgreSQL cutover, backups, restore drill |
| `docs/PRICING_PROPOSAL.md` | Pricing options awaiting owner approval |
| `docs/APP_STORE_LISTING.draft.md` | Listing copy and reviewer instructions |
| `docs/legal/` | Privacy, Terms, Retention drafts (not counsel-reviewed) |
| `THIRD_PARTY_LICENSES.md` | Dependency license inventory |

## Production requirements before App Store submission

This package is an MVP codebase, **not a claim that the app is already deployed, published, approved, or billing merchants**.

Before public release:

- move persistence to a managed production database such as PostgreSQL for multi-instance hosting;
- add a background job queue for large catalogs and scheduled scans;
- finalize and implement Shopify billing only after pricing approval;
- add Privacy Policy, Terms, support details, retention policy, and security/incident procedures;
- test mandatory privacy webhooks including invalid-HMAC behavior;
- run accessibility, performance, uninstall-hygiene, and App Store review checks;
- deploy to an HTTPS production host and verify the live app on a dev store;
- create the App Store listing and submit through Shopify review.

## Recommended v0.2

- product-update webhook ingestion
- background queue and continuous monitoring
- “new risks since last scan” dashboard
- custom rules and approved-claims library
- CSV/PDF export
- merchant-approved rewrite suggestions
- external ad-platform connectors where permissions allow

## Security posture

- Never commit `.env` or secrets.
- Keep Shopify scopes least-privilege.
- Do not log access tokens, session tokens, or unnecessary merchant/customer data.
- AI prompts should contain only data necessary for the audit.
