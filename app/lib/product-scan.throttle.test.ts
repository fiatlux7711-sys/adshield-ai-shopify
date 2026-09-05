import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the live failure observed on the development store:
 *
 *   audit.failed error: Shopify GraphQL error: [{"message":"Throttled"}]
 *
 * A throttle is Shopify telling us to slow down, not a reason to abandon the
 * scan. Before this fix any errors array was fatal, and the queue then
 * restarted the whole scan from page 1 — re-spending the quota that caused
 * the throttle in the first place.
 */

let auditRuns: any[];
let auditItems: any[];
let nextId: number;

vi.mock("../db.server", () => ({
  default: {
    auditRun: {
      findFirst: vi.fn(async ({ where }: any) => {
        const wanted: string[] = where.status.in;
        return auditRuns.find((r) => r.shop === where.shop && wanted.includes(r.status)) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const run = { id: `run-${nextId++}`, ...data, totalItems: 0, processedItems: 0 };
        auditRuns.push(run);
        return run;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const run = auditRuns.find((r) => r.id === where.id)!;
        Object.assign(run, data);
        return run;
      }),
    },
    auditItem: { create: vi.fn(async ({ data }: any) => { auditItems.push(data); return data; }) },
  },
}));

vi.mock("./ai-audit.server", () => ({ aiAuditProducts: vi.fn(async () => new Map()) }));

function product(id: string) {
  return { id, title: `Product ${id}`, description: "", status: "ACTIVE", tags: [], seo: null };
}

const THROTTLED = {
  errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
  extensions: { cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 20, restoreRate: 50 } } },
};

function okPage(nodes: any[], hasNextPage = false, endCursor: string | null = null, available = 900) {
  return {
    data: { products: { nodes, pageInfo: { hasNextPage, endCursor } } },
    extensions: { cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: available, restoreRate: 50 } } },
  };
}

async function seedRun(shop: string) {
  const { createQueuedAuditRun } = await import("./product-scan.server");
  return (await createQueuedAuditRun(shop)).run.id;
}

describe("GraphQL throttle handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    auditRuns = [];
    auditItems = [];
    nextId = 1;
    process.env.ADSHIELD_SCAN_LIMIT = "250";
    process.env.LOG_LEVEL = "silent";
  });

  it("recovers from a throttle and completes the scan instead of failing", async () => {
    const responses = [THROTTLED, okPage([product("1"), product("2")])];
    let call = 0;
    const admin = {
      graphql: vi.fn(async () => ({ json: async () => responses[Math.min(call++, responses.length - 1)] })),
    };

    const { processAuditRun } = await import("./product-scan.server");
    const run = await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(run.status).toBe("COMPLETE");
    expect(run.totalItems).toBe(2);
  }, 30_000);

  it("does not lose already-fetched pages when a later page is throttled", async () => {
    const responses = [
      okPage([product("1")], true, "cursor-1", 900),
      THROTTLED,
      okPage([product("2")], false, null, 900),
    ];
    let call = 0;
    const admin = {
      graphql: vi.fn(async () => ({ json: async () => responses[Math.min(call++, responses.length - 1)] })),
    };

    const { processAuditRun } = await import("./product-scan.server");
    const run = await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    // Page 1 is not re-fetched: both products land exactly once.
    expect(run.totalItems).toBe(2);
    expect(auditItems.map((i) => i.resourceId).sort()).toEqual(["1", "2"]);
  }, 30_000);

  it("still fails fast on a non-throttle GraphQL error, without retrying", async () => {
    const admin = {
      graphql: vi.fn(async () => ({
        json: async () => ({ errors: [{ message: "Field 'bogus' doesn't exist" }] }),
      })),
    };

    const { processAuditRun } = await import("./product-scan.server");
    await expect(
      processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com")),
    ).rejects.toThrow(/doesn't exist/);

    // A schema error is not transient — retrying would just repeat it.
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt cap rather than looping forever", async () => {
    const admin = { graphql: vi.fn(async () => ({ json: async () => THROTTLED })) };

    const { processAuditRun } = await import("./product-scan.server");
    await expect(
      processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com")),
    ).rejects.toThrow(/Throttled/);

    expect(admin.graphql).toHaveBeenCalledTimes(5);
  }, 60_000);

  it("handles a client that throws on throttle instead of returning errors", async () => {
    let call = 0;
    const admin = {
      graphql: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("Request failed: Throttled");
        return { json: async () => okPage([product("1")]) };
      }),
    };

    const { processAuditRun } = await import("./product-scan.server");
    const run = await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    expect(run.status).toBe("COMPLETE");
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  }, 30_000);
});
