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
- AdShield AI logo included in `/public/adshield-ai-logo.png`
- Read-only MVP: the app never edits merchant content automatically

## Important product positioning

AdShield AI is a **risk-screening and workflow tool**. It should never claim that content is "legally approved," "compliant," or "illegal." A clean scan means only that the enabled checks did not identify a risk.

## Run it in a Shopify development store

1. Install Shopify CLI: `npm install -g @shopify/cli@latest`
2. Install dependencies: `npm install`
3. Link the project: `shopify app config link`
4. Prepare Prisma: `npx prisma generate && npx prisma migrate dev --name init`
5. Optional AI: copy `.env.example` to `.env` and set `AI_GATEWAY_API_KEY`.
6. Run: `shopify app dev`
7. Press `p` in Shopify CLI and install on your development store.

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
