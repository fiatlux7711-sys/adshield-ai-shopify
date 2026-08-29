# AdShield AI Shopify build status

Last updated at the end of the Claude working session on branch
`claude/complete-477s7z`.

**Nothing in this project has been installed on a Shopify store, deployed,
released, billed, or submitted for review.** Everything marked verified below
was verified in this container, and the evidence is stated. Everything else is
explicitly listed as unverified.

## Verified in this environment

### Build and test pipeline
- [x] `npm install`, `npx prisma generate`, `npx prisma migrate dev` run clean
- [x] `npm run typecheck` — zero errors
- [x] `npm run build` — clean client + server build
- [x] `npm test` — **102/102 passing** across 15 files

### Verified against a running server (`npm start` on the built output)
- [x] `GET /healthz` → `200 {"status":"ok","database":"ok"}`, `cache-control: no-store`
- [x] `GET /app` with no session → `410` (not served)
- [x] `POST /webhooks/app/uninstalled` with a bogus HMAC → **`401` rejected**
- [x] `GET /webhooks/customers/test` → `404` (test files are not routes)

### Verified with axe-core in Chromium (WCAG 2.1 A/AA, 1280px and 360px)
- [x] Landing page: no violations, no horizontal overflow
- [ ] Embedded admin pages: **not audited** — needs a real Shopify session

## Real bugs found and fixed this session

1. **`Make $5,000/month` was not detected.** The earnings rule had no pattern
   for "make $X" and returned PASS on one of the six acceptance products.
   Found by pinning the acceptance fixtures as tests. Fixed, with
   false-positive guards so ordinary copy (`makes 2 servings`) is not flagged.
2. **Scans held the HTTP request open.** The dashboard action awaited the full
   catalogue scan inline. Replaced with a background queue.
3. **The database URL was hardcoded** to `file:dev.sqlite`, making a
   production database impossible without a code change. Now `DATABASE_URL`.
4. **No page had a `<title>`.** No route exported `meta`. WCAG 2.4.2 fail.
5. **Button contrast 4.42:1**, below the 4.5:1 AA minimum.
6. **Test files were registered as live routes** by `flatRoutes()`.
7. **`app.tsx` did not compile** — used a nonexistent `<s-app-nav>` element and
   an unsupported `embedded` prop on `AppProvider`.
8. **Live-region gap** — polled scan progress was silent to screen readers.

## Built but deliberately inactive

- **Billing** — plans, limits, and Shopify billing config exist, behind a
  double gate (`ADSHIELD_BILLING_ENABLED` **and** `PRICING_APPROVED`).
  `PRICING_APPROVED` ships `false`; nine tests enforce that no merchant can be
  charged. Not wired into `shopify.server.ts`; no route imports it.
- **PostgreSQL** — schema generated from the dev schema (drift-checked by a
  test), migration scripts, and a cutover/backup runbook. **Nothing
  provisioned, nothing spent.**

## Not verified — requires action outside this session

- [ ] **Linked to the Shopify app.** Blocked: `shopify app config link` needs an
      interactive browser login. Confirmed empirically — with `--client-id` it
      still fails at the auth step (`HTTP 403` from the authorization service,
      no CLI session in this container). No Client ID value can bypass this.
- [ ] Installed on a development store
- [ ] End-to-end audit of the six acceptance products against live Shopify data
- [ ] Live webhook delivery (valid HMAC, duplicate delivery, uninstall lifecycle)
- [ ] Mobile UI in real Shopify admin
- [ ] Embedded-page accessibility
- [ ] AI Gateway connectivity (no key has been used)
- [ ] Production database provisioned; backup restore drill performed
- [ ] Production host deployed
- [ ] Error monitoring live
- [ ] Pricing approved; billing tested with a real test charge
- [ ] Legal documents reviewed by counsel and published
- [ ] Support email and support page live
- [ ] Screenshots captured from real scan output
- [ ] App Store listing submitted
- [ ] Shopify review passed

## Known limitations, stated plainly

- The audit queue is **in-process**. It fixes the request-timeout bug and is
  correct for a single instance, but jobs live in memory and do not survive a
  restart. Running more than one instance requires a real broker first —
  otherwise instances will recover each other's in-flight runs at startup.
- `npm audit` reports 13 high-severity advisories, all in dev/build tooling
  (Prisma CLI, GraphQL codegen). Fixing them requires forced breaking
  downgrades; none is in shipped runtime code.
- Audit history is retained indefinitely while the app stays installed. No
  scheduled purge exists yet, so no retention window may be published.
- Legal documents are drafts with placeholders and are not counsel-reviewed.

## Next step

`docs/DEV_STORE_MILESTONE.md` — link the app, install it on the development
store, and run the six-product acceptance test. Everything else follows that.
