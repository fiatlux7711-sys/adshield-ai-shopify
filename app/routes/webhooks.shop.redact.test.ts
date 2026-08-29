import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (...args: unknown[]) => authenticateWebhook(...args) },
}));

const dbMock = {
  $transaction: vi.fn(async (ops: unknown[]) => ops),
  auditRun: { deleteMany: vi.fn(async (args: unknown) => args) },
  shopInstallation: { deleteMany: vi.fn(async (args: unknown) => args) },
  session: { deleteMany: vi.fn(async (args: unknown) => args) },
};
vi.mock("../db.server", () => ({ default: dbMock }));

describe("webhooks/shop/redact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only the requesting shop's audit runs, installation, and sessions", async () => {
    authenticateWebhook.mockResolvedValue({ shop: "victim-shop.myshopify.com" });
    dbMock.$transaction.mockImplementation(async (ops: unknown[]) => ops);

    const { action } = await import("./webhooks.shop.redact");
    const response = await action({ request: new Request("https://app.example/webhooks/shop/redact", { method: "POST" }) } as any);

    expect(response.status).toBe(200);
    expect(dbMock.auditRun.deleteMany).toHaveBeenCalledWith({ where: { shop: "victim-shop.myshopify.com" } });
    expect(dbMock.shopInstallation.deleteMany).toHaveBeenCalledWith({ where: { shop: "victim-shop.myshopify.com" } });
    expect(dbMock.session.deleteMany).toHaveBeenCalledWith({ where: { shop: "victim-shop.myshopify.com" } });
  });

  it("never reaches the database when webhook authentication fails (invalid HMAC)", async () => {
    authenticateWebhook.mockRejectedValue(new Response("Unauthorized", { status: 401 }));

    const { action } = await import("./webhooks.shop.redact");
    await expect(
      action({ request: new Request("https://app.example/webhooks/shop/redact", { method: "POST" }) } as any),
    ).rejects.toBeInstanceOf(Response);

    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });
});
