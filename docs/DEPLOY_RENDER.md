# Deploy AdShield AI to Render

## Before deployment

1. Use the repository root containing `render.yaml`.
2. Confirm the intended Shopify app client ID is selected.
3. Create a Render Blueprint from the repository. Render will create the web service and PostgreSQL database.
4. Set the secret environment variables in Render:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_APP_URL` using the final Render HTTPS origin with no trailing path
   - `ADSHIELD_LEGAL_OWNER`
   - `ADSHIELD_SUPPORT_EMAIL`
   - `ADSHIELD_MAILING_ADDRESS`
5. Keep `ADSHIELD_AI_ENABLED=false` for the free beta unless the AI vendor, disclosure, DPA, cost limits, and privacy language have been approved.

## Shopify configuration

Replace every `https://example.invalid` entry in the selected Shopify TOML config with the exact Render origin. Auth callbacks must remain on the paths already declared. Then run:

```bash
npm ci
npm run db:check-pg
npm run db:generate:pg
npx prisma db push --schema prisma/schema.postgresql.prisma
npm run typecheck
npm test
npm run build
shopify app config use adshield-ai
shopify app deploy
```

Deploying the web service and deploying Shopify app configuration are separate operations. Both must succeed.

## Live acceptance test

1. Confirm `GET /healthz` returns `200` and `{ "status": "ok" }`.
2. Confirm `/privacy`, `/terms`, and `/support` render the verified identity.
3. Install on a development store and confirm embedded navigation remains inside Shopify Admin.
4. Run a scan, open its report, and verify audit history.
5. Attempt a second scan while one is active and confirm no duplicate starts.
6. Trigger all configured webhooks through Shopify CLI; invalid HMAC requests must return `401`.
7. Uninstall and reinstall, then confirm authentication works.
8. Verify shop redaction deletes only the target shop's sessions, installation, runs, and items.
9. Repeat isolation checks on a second development store.

Do not submit the App Store listing until every acceptance result is recorded with its date, environment, and evidence.
