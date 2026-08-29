import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { admin: (...args: unknown[]) => authenticateAdmin(...args) },
}));

const dbMock = {
  shopInstallation: { upsert: vi.fn(async () => ({})) },
  auditRun: { findMany: vi.fn(async () => []) },
};
vi.mock("../db.server", () => ({ default: dbMock }));

const createQueuedAuditRun = vi.fn();
vi.mock("../lib/product-scan.server", () => ({
  createQueuedAuditRun: (...args: unknown[]) => createQueuedAuditRun(...args),
}));

const enqueueAuditRun = vi.fn();
vi.mock("../lib/audit-queue.server", () => ({
  enqueueAuditRun: (...args: unknown[]) => enqueueAuditRun(...args),
}));

describe("app/_index (dashboard) route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loader requires authentication and scopes queries to the session's shop", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-a.myshopify.com" } });
    const { loader } = await import("./app._index");
    await loader({ request: new Request("https://app.example/app") } as any);

    expect(authenticateAdmin).toHaveBeenCalledOnce();
    expect(dbMock.shopInstallation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shop: "shop-a.myshopify.com" } }),
    );
    expect(dbMock.auditRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shop: "shop-a.myshopify.com" } }),
    );
  });

  it("loader propagates an authentication failure without touching the database", async () => {
    authenticateAdmin.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    const { loader } = await import("./app._index");

    await expect(loader({ request: new Request("https://app.example/app") } as any)).rejects.toBeInstanceOf(
      Response,
    );
    expect(dbMock.shopInstallation.upsert).not.toHaveBeenCalled();
  });

  it("action enqueues a scan for the authenticated shop and redirects immediately", async () => {
    authenticateAdmin.mockResolvedValue({ admin: { graphql: vi.fn() }, session: { shop: "shop-a.myshopify.com" } });
    createQueuedAuditRun.mockResolvedValue({ id: "run-1" });

    const { action } = await import("./app._index");
    const form = new FormData();
    form.set("intent", "scan");
    const response = await action({ request: new Request("https://app.example/app", { method: "POST", body: form }) } as any);

    expect(createQueuedAuditRun).toHaveBeenCalledWith("shop-a.myshopify.com");
    expect(enqueueAuditRun).toHaveBeenCalledWith("run-1", "shop-a.myshopify.com");
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/app/audit/run-1");
  });

  it("action does not perform the scan inline, so the request is never held open", async () => {
    authenticateAdmin.mockResolvedValue({ admin: { graphql: vi.fn() }, session: { shop: "shop-a.myshopify.com" } });
    createQueuedAuditRun.mockResolvedValue({ id: "run-1" });

    const { action } = await import("./app._index");
    const form = new FormData();
    form.set("intent", "scan");

    const started = Date.now();
    await action({ request: new Request("https://app.example/app", { method: "POST", body: form }) } as any);

    // enqueueAuditRun is fire-and-forget; the action must not await the scan.
    expect(enqueueAuditRun).toHaveBeenCalledOnce();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("action is a no-op for any other intent", async () => {
    authenticateAdmin.mockResolvedValue({ admin: { graphql: vi.fn() }, session: { shop: "shop-a.myshopify.com" } });
    const { action } = await import("./app._index");
    const form = new FormData();
    form.set("intent", "something-else");
    const result = await action({ request: new Request("https://app.example/app", { method: "POST", body: form }) } as any);

    expect(result).toBeNull();
    expect(createQueuedAuditRun).not.toHaveBeenCalled();
    expect(enqueueAuditRun).not.toHaveBeenCalled();
  });
});
