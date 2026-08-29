import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("../db.server", () => ({ default: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));

describe("healthz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok with a 200 when the database responds", async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }]);
    const { loader } = await import("./healthz");
    const response = await loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("reports degraded with a 503 when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));
    const { loader } = await import("./healthz");
    const response = await loader();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "degraded", database: "unavailable" });
  });

  it("does not leak the underlying error detail to the caller", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed for user 'adshield'"));
    const { loader } = await import("./healthz");
    const body = await (await loader()).text();

    expect(body).not.toContain("password");
    expect(body).not.toContain("adshield");
  });

  it("is not cacheable", async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }]);
    const { loader } = await import("./healthz");
    expect((await loader()).headers.get("Cache-Control")).toBe("no-store");
  });
});
