import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processAuditRun = vi.fn();
vi.mock("./product-scan.server", () => ({
  processAuditRun: (...args: unknown[]) => processAuditRun(...args),
}));

type Row = { id: string; status: string; errorMessage: string | null };
let rows: Row[] = [];

const dbMock = {
  auditRun: {
    update: vi.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const ids: string[] = where.id.in;
      for (const row of rows) if (ids.includes(row.id)) Object.assign(row, data);
      return { count: ids.length };
    }),
    findMany: vi.fn(async ({ where }: any) => {
      const wanted: string[] = where.status.in;
      return rows.filter((r) => wanted.includes(r.status)).map((r) => ({ id: r.id }));
    }),
  },
};
vi.mock("../db.server", () => ({ default: dbMock }));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("audit queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    rows = [];
    processAuditRun.mockReset();
    delete process.env.ADSHIELD_MAX_CONCURRENT_SCANS;
    delete process.env.ADSHIELD_SCAN_MAX_ATTEMPTS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs an enqueued job through processAuditRun with the right shop and run id", async () => {
    processAuditRun.mockResolvedValue({});
    const { configureAuditQueue, enqueueAuditRun } = await import("./audit-queue.server");
    const admin = { graphql: vi.fn() };
    configureAuditQueue(async () => admin);

    enqueueAuditRun("run-1", "shop-a.myshopify.com");
    await flush();
    await flush();

    expect(processAuditRun).toHaveBeenCalledWith(admin, "shop-a.myshopify.com", "run-1");
  });

  it("resolves a fresh admin client per job rather than reusing a request-scoped one", async () => {
    processAuditRun.mockResolvedValue({});
    const { configureAuditQueue, enqueueAuditRun } = await import("./audit-queue.server");
    const resolver = vi.fn(async () => ({ graphql: vi.fn() }));
    configureAuditQueue(resolver);

    enqueueAuditRun("run-1", "shop-a.myshopify.com");
    enqueueAuditRun("run-2", "shop-b.myshopify.com");
    await flush();
    await flush();
    await flush();

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenCalledWith("shop-a.myshopify.com");
    expect(resolver).toHaveBeenCalledWith("shop-b.myshopify.com");
  });

  it("does not exceed the configured concurrency limit", async () => {
    process.env.ADSHIELD_MAX_CONCURRENT_SCANS = "2";
    let inFlight = 0;
    let peak = 0;
    processAuditRun.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });

    const { configureAuditQueue, enqueueAuditRun } = await import("./audit-queue.server");
    configureAuditQueue(async () => ({ graphql: vi.fn() }));

    for (let i = 0; i < 6; i += 1) enqueueAuditRun(`run-${i}`, "shop-a.myshopify.com");
    await new Promise((r) => setTimeout(r, 80));

    expect(processAuditRun).toHaveBeenCalledTimes(6);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("marks the run failed when no worker has been configured", async () => {
    rows = [{ id: "run-1", status: "QUEUED", errorMessage: null }];
    const { enqueueAuditRun } = await import("./audit-queue.server");

    enqueueAuditRun("run-1", "shop-a.myshopify.com");
    await flush();
    await flush();

    expect(rows[0].status).toBe("FAILED");
    expect(processAuditRun).not.toHaveBeenCalled();
  });

  it("retries a throttling failure and succeeds on a later attempt", async () => {
    process.env.ADSHIELD_SCAN_MAX_ATTEMPTS = "3";
    rows = [{ id: "run-1", status: "QUEUED", errorMessage: null }];
    processAuditRun
      .mockRejectedValueOnce(new Error("Shopify GraphQL error: Throttled"))
      .mockResolvedValueOnce({});

    const { configureAuditQueue, enqueueAuditRun } = await import("./audit-queue.server");
    configureAuditQueue(async () => ({ graphql: vi.fn() }));

    enqueueAuditRun("run-1", "shop-a.myshopify.com");
    await new Promise((r) => setTimeout(r, 1400));

    expect(processAuditRun).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient failure", async () => {
    process.env.ADSHIELD_SCAN_MAX_ATTEMPTS = "3";
    processAuditRun.mockRejectedValue(new TypeError("cannot read property of undefined"));

    const { configureAuditQueue, enqueueAuditRun } = await import("./audit-queue.server");
    configureAuditQueue(async () => ({ graphql: vi.fn() }));

    enqueueAuditRun("run-1", "shop-a.myshopify.com");
    await new Promise((r) => setTimeout(r, 200));

    expect(processAuditRun).toHaveBeenCalledTimes(1);
  });

  it("recovers runs orphaned by a restart instead of leaving them spinning", async () => {
    rows = [
      { id: "run-1", status: "RUNNING", errorMessage: null },
      { id: "run-2", status: "QUEUED", errorMessage: null },
      { id: "run-3", status: "COMPLETE", errorMessage: null },
    ];
    const { recoverInterruptedRuns } = await import("./audit-queue.server");

    const recovered = await recoverInterruptedRuns();

    expect(recovered).toBe(2);
    expect(rows.find((r) => r.id === "run-1")!.status).toBe("FAILED");
    expect(rows.find((r) => r.id === "run-2")!.status).toBe("FAILED");
    expect(rows.find((r) => r.id === "run-3")!.status).toBe("COMPLETE");
  });

  it("reports zero recovered when nothing was interrupted", async () => {
    rows = [{ id: "run-1", status: "COMPLETE", errorMessage: null }];
    const { recoverInterruptedRuns } = await import("./audit-queue.server");
    expect(await recoverInterruptedRuns()).toBe(0);
    expect(dbMock.auditRun.updateMany).not.toHaveBeenCalled();
  });
});
