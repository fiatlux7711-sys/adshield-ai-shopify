# AdShield AI Shopify build status

## Implemented and verified in this environment
- [x] React Router embedded Shopify app foundation
- [x] `read_products` least-privilege scope
- [x] Admin GraphQL product retrieval and pagination
- [x] compliance-rule audit engine
- [x] optional Vercel AI Gateway / Grok 4.6 review
- [x] Prisma audit persistence and history
- [x] embedded dashboard and report UI
- [x] app-uninstalled and scope-update webhooks
- [x] mandatory privacy-compliance endpoints
- [x] supplied AdShield AI logo
- [x] `npm install`, `npx prisma generate`, `npx prisma migrate dev --name init` run clean
- [x] `npm run typecheck` passes with zero errors
- [x] `npm run build` produces a clean client+server build
- [x] automated test suite added (vitest): 50/50 tests passing across rules,
      scoring, AI JSON parsing/fallback, pagination, GraphQL error handling,
      cross-shop isolation, route auth, and webhook HMAC-failure handling
- [x] fixed a real compile error: app.tsx/auth.login used a nonexistent
      `<s-app-nav>` element and an unsupported `embedded` prop on
      `AppProvider`; replaced with App Bridge's `NavMenu` and wired `apiKey`
      through both loaders
- [x] fixed a real production-routing bug: test files were being registered
      as live routes by `flatRoutes()`; excluded via `ignoredRouteFiles`

## Not yet externally verified
- [ ] linked to the owner's Shopify Dev Dashboard app — **blocked in this
      remote session**: `.shopify/` and `client_id` are absent, and
      `shopify app config link` requires an interactive browser login this
      non-interactive session cannot perform. Needs the user to either run
      it themselves in an interactive terminal, or supply the app's Client
      ID from the Partner Dashboard.
- [ ] installed/tested on the owner's Shopify dev store
- [ ] production database provisioned
- [ ] production host deployed
- [ ] billing activated
- [ ] App Store listing created
- [ ] Shopify review submitted/approved
