import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (...args: unknown[]) => authenticateWebhook(...args) },
}));

describe.each([
  ["customers/data_request", "./webhooks.customers.data_request"],
  ["customers/redact", "./webhooks.customers.redact"],
])("webhooks/%s", (_topic, modulePath) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates the webhook and acknowledges with 200", async () => {
    authenticateWebhook.mockResolvedValue({ shop: "shop-a.myshopify.com" });
    const { action } = await import(modulePath);
    const response = await action({ request: new Request("https://app.example/webhooks/x", { method: "POST" }) } as any);

    expect(authenticateWebhook).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it("rejects the request when webhook authentication fails (invalid HMAC)", async () => {
    authenticateWebhook.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    const { action } = await import(modulePath);

    await expect(
      action({ request: new Request("https://app.example/webhooks/x", { method: "POST" }) } as any),
    ).rejects.toBeInstanceOf(Response);
  });
});
