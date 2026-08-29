import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (...args: unknown[]) => authenticateWebhook(...args) },
}));

const dbMock = { session: { deleteMany: vi.fn(async (args: unknown) => args) } };
vi.mock("../db.server", () => ({ default: dbMock }));

describe("webhooks/app/uninstalled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes sessions scoped to the uninstalling shop when a session exists", async () => {
    authenticateWebhook.mockResolvedValue({ shop: "shop-a.myshopify.com", session: { id: "s1" } });
    const { action } = await import("./webhooks.app.uninstalled");
    const response = await action({ request: new Request("https://app.example/webhooks/app/uninstalled", { method: "POST" }) } as any);

    expect(response.status).toBe(200);
    expect(dbMock.session.deleteMany).toHaveBeenCalledWith({ where: { shop: "shop-a.myshopify.com" } });
  });

  it("does not touch the database when there is no session on the payload", async () => {
    authenticateWebhook.mockResolvedValue({ shop: "shop-a.myshopify.com", session: undefined });
    const { action } = await import("./webhooks.app.uninstalled");
    await action({ request: new Request("https://app.example/webhooks/app/uninstalled", { method: "POST" }) } as any);

    expect(dbMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects the request when webhook authentication fails (invalid HMAC)", async () => {
    authenticateWebhook.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    const { action } = await import("./webhooks.app.uninstalled");

    await expect(
      action({ request: new Request("https://app.example/webhooks/app/uninstalled", { method: "POST" }) } as any),
    ).rejects.toBeInstanceOf(Response);
    expect(dbMock.session.deleteMany).not.toHaveBeenCalled();
  });
});
