# Production database — cutover, backup, and restore

**Status: prepared, not provisioned.** Nothing here has been run against a real
managed database. No infrastructure has been created and nothing has been
spent. This document is the runbook for when you provision.

## Why the change

SQLite is the development default and is not suitable for production here:

- It is a single file on one machine's disk, so it cannot be shared by more
  than one app instance and does not survive an ephemeral container.
- It has no managed backups, point-in-time recovery, or failover.
- Concurrent writes serialize on a single writer lock, which the background
  scan worker will contend with under real load.

## How the schemas are managed

`prisma/schema.prisma` (SQLite) is the **single source of truth for the data
model**. The PostgreSQL schema is generated from it:

```bash
npm run db:gen-pg      # regenerate prisma/schema.postgresql.prisma
npm run db:check-pg    # fail if it has drifted (also enforced by npm test)
```

Edit models only in `prisma/schema.prisma`, then regenerate. `npm test`
includes a drift check, so the two cannot silently diverge.

## Connection configuration

The connection string is read from `DATABASE_URL` (it used to be hardcoded to
`file:dev.sqlite`, which made switching databases impossible without a code
change). Set it per environment — never commit it:

```
local:      file:dev.sqlite
production: postgresql://USER:PASSWORD@HOST:5432/adshield?sslmode=require
```

Store the production value in the host's secret manager, not in `.env`, not in
the repo, and not in chat.

## Cutover

1. **Provision** managed PostgreSQL (16+). Enable automated daily backups and
   point-in-time recovery. Require TLS (`sslmode=require`).
2. **Restrict access** to the app host's network/VPC. Do not expose it publicly.
3. **Create a least-privilege application role** — `SELECT/INSERT/UPDATE/DELETE`
   on the app schema. Do not run the app as the owner/superuser. Run migrations
   as a separate, higher-privileged role.
4. **Set `DATABASE_URL`** in the host's secret manager.
5. **Apply migrations:**
   ```bash
   npm run db:generate:pg
   npm run db:migrate:pg
   ```
   `migrate deploy` applies committed migrations only and never prompts or
   resets — the correct command for production. Never run `migrate dev` or
   `migrate reset` against production.
6. **Verify** before sending traffic:
   ```bash
   curl -fsS https://<host>/healthz    # expect {"status":"ok","database":"ok"}
   ```
7. **Migrate existing dev data only if you actually want it.** Development audit
   history is throwaway; the clean path is to start production empty and have
   each merchant run a fresh scan.

## Backups — must be tested, not assumed

A backup that has never been restored is not a backup. Before launch:

1. Confirm the provider's automated backup schedule and retention.
2. Perform a **restore drill** into a scratch database.
3. Run `npx prisma migrate status --schema prisma/schema.postgresql.prisma`
   against the restored copy and confirm it reports up to date.
4. Record the measured restore time — that is your real RTO.
5. Re-run the drill whenever the schema changes materially.

Do not publish any backup or availability claim in the Privacy Policy, Terms,
or App Store listing until this drill has actually been performed.

## Deletion and backups interact

`shop/redact` deletes merchant rows from the live database, but those rows may
persist in backups until they age out of retention. The Privacy Policy and
Data Retention drafts both flag this as an open item — state the real retention
window there once it is known.

## Known gap: the background worker

The audit queue (`app/lib/audit-queue.server.ts`) is an **in-process** worker.
Moving to PostgreSQL removes the shared-storage blocker for running more than
one app instance, but the queue itself is still per-process: jobs are held in
memory, do not survive a restart, and are not distributed.

Before running more than one instance, replace the queue with a real broker
(pg-boss keeps it in PostgreSQL; Redis/BullMQ or SQS are alternatives). The
`AuditRun` row is already the durable source of truth for job state and
`recoverInterruptedRuns()` already reconciles orphans, so the change is
contained to `enqueueAuditRun` and the drain loop.

Running multiple instances **before** that swap would mean each instance
recovers (and fails) the other's in-flight runs at startup.
