import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredAuditRun = {
  id: string;
  shop: string;
  status: string;
  totalItems: number;
  flaggedItems: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  overallScore: number;
  aiEnhanced: boolean;
  processedItems: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

type StoredAuditItem = {
  auditRunId: string;
  shop: string;
  resourceId: string;
  resourceTitle: string;
  riskScore: number;
  severity: string;
  issueCount: number;
  issuesJson: string;
};

let auditRuns: StoredAuditRun[];
let auditItems: StoredAuditItem[];
let nextId: number;

vi.mock("../db.server", () => {
  return {
    default: {
      auditRun: {
        create: vi.fn(async ({ data }: { data: Partial<StoredAuditRun> & { shop: string } }) => {
          const run: StoredAuditRun = {
            id: `run-${nextId++}`,
            shop: data.shop,
            status: data.status ?? "QUEUED",
            totalItems: 0,
            processedItems: 0,
            flaggedItems: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            overallScore: 100,
            aiEnhanced: false,
            errorMessage: null,
            startedAt: null,
            completedAt: null,
          };
          auditRuns.push(run);
          return run;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredAuditRun> }) => {
          const run = auditRuns.find((r) => r.id === where.id)!;
          Object.assign(run, data);
          return run;
        }),
      },
      auditItem: {
        create: vi.fn(async ({ data }: { data: StoredAuditItem }) => {
          auditItems.push(data);
          return data;
        }),
      },
    },
  };
});

const aiAuditProducts = vi.fn();
vi.mock("./ai-audit.server", () => ({ aiAuditProducts: (...args: unknown[]) => aiAuditProducts(...args) }));

function makeAdmin(pages: Array<{ nodes: any[]; hasNextPage: boolean; endCursor?: string | null }>) {
  let call = 0;
  return {
    graphql: vi.fn(async () => {
      const page = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return {
        json: async () => ({
          data: {
            products: {
              nodes: page.nodes,
              pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor ?? null },
            },
          },
        }),
      };
    }),
  };
}

function product(id: string, title: string, description = "") {
  return { id, title, description, status: "ACTIVE", tags: [], seo: null };
}

/** Creates the QUEUED run a real enqueue would have created, and returns its id. */
async function seedRun(shop: string): Promise<string> {
  const { createQueuedAuditRun } = await import("./product-scan.server");
  const run = await createQueuedAuditRun(shop);
  return run.id;
}

describe("processAuditRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditRuns = [];
    auditItems = [];
    nextId = 1;
    aiAuditProducts.mockResolvedValue(new Map());
    process.env.ADSHIELD_SCAN_LIMIT = "250";
  });

  it("paginates through multiple pages up to the requested limit", async () => {
    const { processAuditRun } = await import("./product-scan.server");
    const admin = makeAdmin([
      { nodes: [product("1", "A"), product("2", "B")], hasNextPage: true, endCursor: "c1" },
      { nodes: [product("3", "C")], hasNextPage: false },
    ]);

    const run = await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(run.totalItems).toBe(3);
    expect(auditItems).toHaveLength(3);
  });

  it("stops paginating once the configured scan limit is reached", async () => {
    process.env.ADSHIELD_SCAN_LIMIT = "2";
    const { processAuditRun } = await import("./product-scan.server");
    const admin = makeAdmin([
      { nodes: [product("1", "A"), product("2", "B")], hasNextPage: true, endCursor: "c1" },
      { nodes: [product("3", "C")], hasNextPage: false },
    ]);

    const run = await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    expect(admin.graphql).toHaveBeenCalledTimes(1);
    expect(run.totalItems).toBe(2);
  });

  it("marks the run FAILED and rethrows on a GraphQL error, without swallowing it", async () => {
    const { processAuditRun } = await import("./product-scan.server");
    const admin = {
      graphql: vi.fn(async () => ({
        json: async () => ({ errors: [{ message: "Throttled" }] }),
      })),
    };

    await expect(processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"))).rejects.toThrow(
      /Shopify GraphQL error/,
    );
    expect(auditRuns[0].status).toBe("FAILED");
  });

  it("tags every created run and item with the shop passed in (cross-shop isolation)", async () => {
    const { processAuditRun } = await import("./product-scan.server");
    const adminA = makeAdmin([{ nodes: [product("1", "A")], hasNextPage: false }]);
    const adminB = makeAdmin([{ nodes: [product("2", "B")], hasNextPage: false }]);

    await processAuditRun(adminA as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));
    await processAuditRun(adminB as any, "shop-b.myshopify.com", await seedRun("shop-b.myshopify.com"));

    expect(auditRuns.map((r) => r.shop)).toEqual([
      "shop-a.myshopify.com",
      "shop-b.myshopify.com",
    ]);
    expect(auditItems.every((item) => item.shop === auditRuns.find((r) => r.id === item.auditRunId)?.shop)).toBe(
      true,
    );
  });

  it("only sends the top 20 highest-risk products to AI review", async () => {
    const { processAuditRun } = await import("./product-scan.server");
    const nodes = Array.from({ length: 25 }, (_, i) =>
      product(`${i}`, `Product ${i}`, "This is 100% guaranteed to cure your migraine."),
    );
    const admin = makeAdmin([{ nodes, hasNextPage: false }]);

    await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    expect(aiAuditProducts).toHaveBeenCalledTimes(1);
    const candidates = aiAuditProducts.mock.calls[0][0] as unknown[];
    expect(candidates).toHaveLength(20);
  });

  it("does not send AI candidates for a clean catalog (riskScore 0)", async () => {
    const { processAuditRun } = await import("./product-scan.server");
    const admin = makeAdmin([{ nodes: [product("1", "Clean product", "Just a nice mug.")], hasNextPage: false }]);

    await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    const candidates = aiAuditProducts.mock.calls[0][0] as unknown[];
    expect(candidates).toHaveLength(0);
  });

  it("still completes the audit when the AI layer is unavailable (rule-only fallback)", async () => {
    aiAuditProducts.mockResolvedValue(new Map());
    const { processAuditRun } = await import("./product-scan.server");
    const admin = makeAdmin([
      { nodes: [product("1", "Risky", "100% guaranteed to cure your pain.")], hasNextPage: false },
    ]);

    const run = await processAuditRun(admin as any, "shop-a.myshopify.com", await seedRun("shop-a.myshopify.com"));

    expect(run.status).toBe("COMPLETE");
    expect(run.aiEnhanced).toBe(false);
    expect(run.flaggedItems).toBeGreaterThan(0);
  });
});
