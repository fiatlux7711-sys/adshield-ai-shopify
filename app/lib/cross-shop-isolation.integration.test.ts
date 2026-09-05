import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Real-database integration tests for cross-shop isolation and duplicate
 * webhook delivery.
 *
 * Every other test in this repo mocks `db.server`, which proves the code
 * *calls* Prisma with the right arguments but cannot prove Prisma's actual
 * query execution respects shop scoping — a typo in a where clause, a
 * missing filter on a cascade, or an ordering bug in the transaction would
 * pass every mocked test and still leak data in production. This file runs
 * the real webhook handlers against a real SQLite database, applying the
 * project's actual migrations, with only Shopify authentication mocked.
 *
 * This still cannot fully substitute for the pending live two-store dev-
 * store test (a real Shopify session per shop, real network HMAC), but it
 * closes the gap between "the mock was called correctly" and "the database
 * actually ends up in the right state."
 */

const testDir = mkdtempSync(path.join(tmpdir(), "adshield-isolation-"));
const dbFile = path.join(testDir, "isolation.sqlite");
const databaseUrl = `file:${dbFile}`;

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (...args: unknown[]) => authenticateWebhook(...args) },
}));

let db: typeof import("../db.server").default;

const devSqlitePath = path.join(process.cwd(), "prisma", "dev.sqlite");
const devSqliteMtimeBefore = existsSync(devSqlitePath) ? statSync(devSqlitePath).mtimeMs : null;

beforeAll(() => {
  // Apply the project's real migrations against a throwaway file, so the
  // schema under test is exactly the shipped schema, not a hand-copy of it.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  process.env.DATABASE_URL = databaseUrl;
});

afterAll(async () => {
  await db?.$disconnect();

  // Regression guard: this file previously wrote to dev.sqlite instead of
  // the scratch database because @prisma/client's own ambient .env loading
  // silently overrode an explicitly-set process.env.DATABASE_URL. Fixed by
  // passing datasourceUrl explicitly in db.server.ts. If dev.sqlite's mtime
  // moved during this run, the isolation this file exists to prove is
  // broken again — fail loudly rather than let it pass on stale assertions.
  if (devSqliteMtimeBefore !== null) {
    const mtimeAfter = statSync(devSqlitePath).mtimeMs;
    if (mtimeAfter !== devSqliteMtimeBefore) {
      throw new Error(
        "prisma/dev.sqlite was modified during the cross-shop isolation integration " +
          "tests. This file is supposed to run entirely against a scratch database — " +
          "see the comment above this check for the prior root cause.",
      );
    }
  }

  rmSync(testDir, { recursive: true, force: true });
});

async function seedShop(shop: string) {
  const run = await db.auditRun.create({
    data: { shop, status: "COMPLETE", totalItems: 1, overallScore: 40 },
  });
  await db.auditItem.create({
    data: {
      auditRunId: run.id,
      shop,
      resourceId: `gid://shopify/Product/${shop}`,
      resourceTitle: "Make $5,000/month",
      riskScore: 35,
      severity: "CRITICAL",
      issueCount: 1,
      issuesJson: "[]",
    },
  });
  await db.shopInstallation.create({ data: { shop } });
  await db.session.create({
    data: { id: `session-${shop}`, shop, state: "active", isOnline: false, accessToken: "shpat_test" },
  });
  return run.id;
}

describe("cross-shop isolation (real SQLite, real Prisma queries)", () => {
  const SHOP_A = "shop-a.myshopify.com";
  const SHOP_B = "shop-b.myshopify.com";

  beforeEach(async () => {
    vi.resetModules();
    authenticateWebhook.mockReset();
    ({ default: db } = await import("../db.server"));
    // Start each test from a clean slate.
    await db.auditItem.deleteMany({});
    await db.auditRun.deleteMany({});
    await db.shopInstallation.deleteMany({});
    await db.session.deleteMany({});
  });

  it("shop/redact for one shop deletes only that shop's rows, verified against real data", async () => {
    await seedShop(SHOP_A);
    await seedShop(SHOP_B);

    authenticateWebhook.mockResolvedValue({ shop: SHOP_A });
    const { action } = await import("../routes/webhooks.shop.redact");
    const response = await action({
      request: new Request("https://app.example/webhooks/shop/redact", { method: "POST" }),
    } as any);

    expect(response.status).toBe(200);

    // Shop A is gone.
    expect(await db.auditRun.count({ where: { shop: SHOP_A } })).toBe(0);
    expect(await db.auditItem.count({ where: { shop: SHOP_A } })).toBe(0);
    expect(await db.shopInstallation.count({ where: { shop: SHOP_A } })).toBe(0);
    expect(await db.session.count({ where: { shop: SHOP_A } })).toBe(0);

    // Shop B is completely untouched — this is the real assertion mocked
    // tests cannot make, since it depends on Prisma actually filtering by
    // shop rather than deleting everything.
    expect(await db.auditRun.count({ where: { shop: SHOP_B } })).toBe(1);
    expect(await db.auditItem.count({ where: { shop: SHOP_B } })).toBe(1);
    expect(await db.shopInstallation.count({ where: { shop: SHOP_B } })).toBe(1);
    expect(await db.session.count({ where: { shop: SHOP_B } })).toBe(1);
  });

  it("the audit-detail lookup cannot return shop B's run to shop A even with the correct id", async () => {
    const runIdA = await seedShop(SHOP_A);
    await seedShop(SHOP_B);

    // Same query shape as app/routes/app.audit.$auditId.tsx's loader.
    const asOwner = await db.auditRun.findFirst({ where: { id: runIdA, shop: SHOP_A } });
    const asOtherShop = await db.auditRun.findFirst({ where: { id: runIdA, shop: SHOP_B } });

    expect(asOwner).not.toBeNull();
    expect(asOtherShop).toBeNull();
  });

  it("suppresses a duplicate scan for the same shop but never across shops", async () => {
    const { createQueuedAuditRun, findInFlightAuditRun } = await import("./product-scan.server");

    const first = await createQueuedAuditRun(SHOP_A);
    expect(first.created).toBe(true);

    // Second submit while the first is still QUEUED: no new row, same run.
    const second = await createQueuedAuditRun(SHOP_A);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
    expect(await db.auditRun.count({ where: { shop: SHOP_A } })).toBe(1);

    // Shop B is unaffected by shop A's in-flight scan.
    const otherShop = await createQueuedAuditRun(SHOP_B);
    expect(otherShop.created).toBe(true);
    expect(await db.auditRun.count({ where: { shop: SHOP_B } })).toBe(1);

    // findInFlightAuditRun is likewise shop-scoped.
    expect((await findInFlightAuditRun(SHOP_A))!.id).toBe(first.run.id);
    expect((await findInFlightAuditRun(SHOP_B))!.id).toBe(otherShop.run.id);
  });

  it("allows a new scan once the previous one reached a terminal state", async () => {
    const { createQueuedAuditRun } = await import("./product-scan.server");

    const first = await createQueuedAuditRun(SHOP_A);
    await db.auditRun.update({ where: { id: first.run.id }, data: { status: "COMPLETE" } });

    // A finished scan must not block the merchant from running another.
    const second = await createQueuedAuditRun(SHOP_A);
    expect(second.created).toBe(true);
    expect(second.run.id).not.toBe(first.run.id);
  });

  it("firing shop/redact twice in a row is idempotent — no error, no effect on the second call", async () => {
    await seedShop(SHOP_A);
    authenticateWebhook.mockResolvedValue({ shop: SHOP_A });
    const { action } = await import("../routes/webhooks.shop.redact");

    const first = await action({
      request: new Request("https://app.example/webhooks/shop/redact", { method: "POST" }),
    } as any);
    const second = await action({
      request: new Request("https://app.example/webhooks/shop/redact", { method: "POST" }),
    } as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await db.auditRun.count({ where: { shop: SHOP_A } })).toBe(0);
  });

  it("app/uninstalled after shop/redact does not throw even though nothing is left to delete", async () => {
    await seedShop(SHOP_A);
    authenticateWebhook.mockResolvedValue({ shop: SHOP_A });
    const { action: redact } = await import("../routes/webhooks.shop.redact");
    await redact({ request: new Request("https://app.example/webhooks/shop/redact", { method: "POST" }) } as any);

    authenticateWebhook.mockResolvedValue({ shop: SHOP_A, session: { id: "session-shop-a.myshopify.com" } });
    const { action: uninstalled } = await import("../routes/webhooks.app.uninstalled");
    const response = await uninstalled({
      request: new Request("https://app.example/webhooks/app/uninstalled", { method: "POST" }),
    } as any);

    expect(response.status).toBe(200);
  });
});

describe("sanity: the scratch database really exists and is isolated from dev.sqlite", () => {
  it("wrote to a temp file, not the project's dev database", () => {
    expect(existsSync(dbFile)).toBe(true);
    expect(dbFile).not.toContain("dev.sqlite");
    expect(dbFile.startsWith(tmpdir())).toBe(true);
  });

  // The stronger guard — dev.sqlite's mtime must not move across the whole
  // file's run — lives in the top-level afterAll above, where it can see
  // the true before/after across every test in this file, not just the
  // tests in this describe block.
});
