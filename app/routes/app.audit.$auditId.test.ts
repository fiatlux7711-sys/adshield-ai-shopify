import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { admin: (...args: unknown[]) => authenticateAdmin(...args) },
}));

const dbMock = { auditRun: { findFirst: vi.fn() } };
vi.mock("../db.server", () => ({ default: dbMock }));

describe("app/audit/$auditId loader — cross-shop isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the lookup by both auditId AND the authenticated session's shop", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-a.myshopify.com" } });
    dbMock.auditRun.findFirst.mockResolvedValue({ id: "run-1", items: [] });

    const { loader } = await import("./app.audit.$auditId");
    await loader({
      request: new Request("https://app.example/app/audit/run-1"),
      params: { auditId: "run-1" },
    } as any);

    expect(dbMock.auditRun.findFirst).toHaveBeenCalledWith({
      where: { id: "run-1", shop: "shop-a.myshopify.com" },
      include: expect.anything(),
    });
  });

  it("returns 404 rather than another shop's data when the audit belongs to a different shop", async () => {
    authenticateAdmin.mockResolvedValue({ session: { shop: "shop-b.myshopify.com" } });
    // A real Prisma query scoped by { id, shop } would return null for another shop's run id.
    dbMock.auditRun.findFirst.mockResolvedValue(null);

    const { loader } = await import("./app.audit.$auditId");
    const promise = loader({
      request: new Request("https://app.example/app/audit/run-owned-by-shop-a"),
      params: { auditId: "run-owned-by-shop-a" },
    } as any);

    await expect(promise).rejects.toMatchObject({ status: 404 });
  });

  it("propagates authentication failure rather than serving the report", async () => {
    authenticateAdmin.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    const { loader } = await import("./app.audit.$auditId");

    await expect(
      loader({ request: new Request("https://app.example/app/audit/run-1"), params: { auditId: "run-1" } } as any),
    ).rejects.toBeInstanceOf(Response);
    expect(dbMock.auditRun.findFirst).not.toHaveBeenCalled();
  });
});
