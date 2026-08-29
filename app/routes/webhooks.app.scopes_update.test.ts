import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (...args: unknown[]) => authenticateWebhook(...args) },
}));

const dbMock = { session: { update: vi.fn(async (args: unknown) => args) } };
vi.mock("../db.server", () => ({ default: dbMock }));

describe("webhooks/app/scopes_update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates only the session tied to this webhook delivery with the new scopes", async () => {
    authenticateWebhook.mockResolvedValue({
      payload: { current: ["read_products", "read_orders"] },
      session: { id: "session-123" },
    });
    const { action } = await import("./webhooks.app.scopes_update");
    await action({ request: new Request("https://app.example/webhooks/app/scopes_update", { method: "POST" }) } as any);

    expect(dbMock.session.update).toHaveBeenCalledWith({
      where: { id: "session-123" },
      data: { scope: "read_products,read_orders" },
    });
  });

  it("rejects the request when webhook authentication fails (invalid HMAC)", async () => {
    authenticateWebhook.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    const { action } = await import("./webhooks.app.scopes_update");

    await expect(
      action({ request: new Request("https://app.example/webhooks/app/scopes_update", { method: "POST" }) } as any),
    ).rejects.toBeInstanceOf(Response);
    expect(dbMock.session.update).not.toHaveBeenCalled();
  });
});
