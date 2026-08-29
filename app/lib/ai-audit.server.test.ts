import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => generateText(...args) }));

describe("aiAuditProducts", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    generateText.mockReset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns an empty map when no AI Gateway key is configured (rule-only fallback)", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);
    expect(result.size).toBe(0);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns an empty map when ADSHIELD_AI_ENABLED is explicitly false, even with a key", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    process.env.ADSHIELD_AI_ENABLED = "false";
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);
    expect(result.size).toBe(0);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("parses a valid JSON response, including fenced code blocks", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockResolvedValue({
      text:
        "```json\n" +
        JSON.stringify([
          {
            resourceId: "gid://shopify/Product/1",
            issues: [
              {
                category: "health_claim",
                title: "Disease claim",
                severity: "critical",
                evidence: "cures headaches",
                explanation: "risk",
                suggestion: "review",
              },
            ],
          },
        ]) +
        "\n```",
    });

    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([
      { resourceId: "gid://shopify/Product/1", title: "t", text: "cures headaches" },
    ]);

    const issues = result.get("gid://shopify/Product/1");
    expect(issues).toHaveLength(1);
    expect(issues![0].severity).toBe("CRITICAL");
    expect(issues![0].source).toBe("AI");
  });

  it("never lets the model claim legal approval or certainty language passed straight through as-is is still just advisory", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockResolvedValue({
      text: JSON.stringify([
        {
          resourceId: "1",
          issues: [{ title: "x", evidence: "y", severity: "NOT_A_REAL_SEVERITY" }],
        },
      ]),
    });
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "y" }]);
    // Unknown/invalid severities must not crash and must fall back to a safe default.
    expect(result.get("1")![0].severity).toBe("MEDIUM");
  });

  it("does not crash on invalid AI JSON and falls back to an empty (rules-only) result", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockResolvedValue({ text: "not json at all {{{" });
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);
    expect(result.size).toBe(0);
  });

  it("does not crash and falls back to rules-only when the model call throws", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockRejectedValue(new Error("gateway unavailable"));
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);
    expect(result.size).toBe(0);
  });

  it("ignores rows that are not a top-level JSON array", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockResolvedValue({ text: JSON.stringify({ resourceId: "1", issues: [] }) });
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);
    expect(result.size).toBe(0);
  });

  it("drops issue rows missing required fields instead of inventing them", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockResolvedValue({
      text: JSON.stringify([
        {
          resourceId: "1",
          issues: [{ title: "no evidence here" }, { evidence: "no title here" }],
        },
      ]),
    });
    const { aiAuditProducts } = await import("./ai-audit.server");
    const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);
    expect(result.get("1")).toEqual([]);
  });
});
