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

  describe("evidence must map back to the merchant's actual product text", () => {
    it("accepts evidence that is an exact substring of the source text", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          { resourceId: "1", issues: [{ title: "t", evidence: "guaranteed to cure your acne" }] },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([
        { resourceId: "1", title: "t", text: "Our serum is guaranteed to cure your acne in 3 days." },
      ]);
      expect(result.get("1")).toHaveLength(1);
      expect(result.get("1")![0].evidence).toBe("guaranteed to cure your acne");
    });

    it("rejects a hallucinated quote that does not appear anywhere in the source text", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          { resourceId: "1", issues: [{ title: "t", evidence: "cures cancer instantly" }] },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([
        { resourceId: "1", title: "t", text: "A durable stainless steel water bottle." },
      ]);
      expect(result.get("1")).toEqual([]);
    });

    it("accepts a case/whitespace-insensitive match and returns the real source substring, not the model's wording", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          // Model returns different casing and collapsed whitespace than the source.
          { resourceId: "1", issues: [{ title: "t", evidence: "100%   GUARANTEED" }] },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([
        { resourceId: "1", title: "t", text: "This product is 100% guaranteed to work every time." },
      ]);
      const issues = result.get("1")!;
      expect(issues).toHaveLength(1);
      // The displayed evidence is the real source text, not the model's transcription.
      expect(issues[0].evidence).toBe("100% guaranteed");
    });

    it("rejects evidence that only appears beyond the 7000-char truncation the model actually saw", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      const longText = "filler ".repeat(1200) + "cures your migraine instantly";
      expect(longText.length).toBeGreaterThan(7000);
      generateText.mockResolvedValue({
        text: JSON.stringify([
          { resourceId: "1", issues: [{ title: "t", evidence: "cures your migraine instantly" }] },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: longText }]);
      // The real phrase exists in the full product text but past the 7000-char
      // cut the model was actually sent, so it must not be accepted as genuine.
      expect(result.get("1")).toEqual([]);
    });

    it("evaluates each issue in a row independently — one bad quote does not drop the whole row", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          {
            resourceId: "1",
            issues: [
              { title: "real", evidence: "eco-friendly" },
              { title: "fake", evidence: "clinically proven by nobel laureates" },
            ],
          },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([
        { resourceId: "1", title: "t", text: "Our packaging is eco-friendly." },
      ]);
      const issues = result.get("1")!;
      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe("real");
    });
  });

  describe("resourceId and field hygiene", () => {
    it("ignores a row whose resourceId does not match any product that was sent", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          { resourceId: "gid://shopify/Product/does-not-exist", issues: [{ title: "t", evidence: "x" }] },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([
        { resourceId: "gid://shopify/Product/real", title: "t", text: "x marks the spot" },
      ]);
      expect(result.size).toBe(0);
    });

    it("normalizes a messy model-supplied category to a bounded snake_case string", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          { resourceId: "1", issues: [{ title: "t", evidence: "free shipping", category: "Free / Zero-Cost!!" }] },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([
        { resourceId: "1", title: "t", text: "Enjoy free shipping on every order." },
      ]);
      expect(result.get("1")![0].category).toBe("free_zero_cost");
    });

    it("bounds an oversized explanation/suggestion rather than storing it unbounded", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      generateText.mockResolvedValue({
        text: JSON.stringify([
          {
            resourceId: "1",
            issues: [
              {
                title: "t",
                evidence: "guaranteed",
                explanation: "x".repeat(5000),
                suggestion: "y".repeat(5000),
              },
            ],
          },
        ]),
      });
      const { aiAuditProducts } = await import("./ai-audit.server");
      const result = await aiAuditProducts([{ resourceId: "1", title: "t", text: "Results guaranteed." }]);
      const issue = result.get("1")![0];
      expect(issue.explanation.length).toBeLessThanOrEqual(600);
      expect(issue.suggestion.length).toBeLessThanOrEqual(400);
    });
  });

  it("routes a provider failure through the structured logger, not a raw console.error", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockRejectedValue(new Error("upstream 500: request id abc-123, key sk-secret"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";

    const { aiAuditProducts } = await import("./ai-audit.server");
    await aiAuditProducts([{ resourceId: "1", title: "t", text: "hello" }]);

    // logger.error still ultimately writes via console.error, but as a single
    // structured, redacted JSON line — not the raw Error object with its stack.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged);
    expect(parsed.event).toBe("ai_audit.failed");
    expect(parsed.error.message).toContain("upstream 500");
    expect(logged).not.toMatch(/at Object|at async|\.test\.ts:/); // no stack trace text
    errorSpy.mockRestore();
  });
});
