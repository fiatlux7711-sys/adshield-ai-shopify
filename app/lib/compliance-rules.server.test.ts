import { describe, expect, it } from "vitest";
import {
  auditText,
  mergeIssues,
  scoreIssues,
  stripHtml,
  type ComplianceIssue,
} from "./compliance-rules.server";

describe("stripHtml", () => {
  it("removes script and style blocks entirely, including their content", () => {
    const input = "<script>alert('x')</script>Hello<style>.a{color:red}</style>world";
    expect(stripHtml(input)).toBe("Hello world");
  });

  it("removes remaining tags and collapses whitespace", () => {
    const input = "<p>Hello   <b>world</b></p>\n\n<div>!</div>";
    expect(stripHtml(input)).toBe("Hello world !");
  });

  it("decodes the common entities used in Shopify rich text", () => {
    expect(stripHtml("Salt&nbsp;&amp;&nbsp;Pepper")).toBe("Salt & Pepper");
  });

  it("trims leading/trailing whitespace", () => {
    expect(stripHtml("   padded text   ")).toBe("padded text");
  });
});

describe("auditText — controlled acceptance-test claims", () => {
  it("flags a health/disease claim as CRITICAL", () => {
    const result = auditText("Our supplement helps treat arthritis pain naturally.");
    expect(result.severity).toBe("CRITICAL");
    expect(result.issues.some((i) => i.category === "health_claim")).toBe(true);
  });

  it("flags an absolute guarantee as HIGH", () => {
    const result = auditText("This product is 100% guaranteed to work.");
    expect(result.severity).toBe("HIGH");
    expect(result.issues.some((i) => i.category === "guarantee_claim")).toBe(true);
  });

  it("flags a broad environmental claim as HIGH", () => {
    const result = auditText("Our packaging is 100% eco-friendly.");
    expect(result.severity).toBe("HIGH");
    expect(result.issues.some((i) => i.category === "environmental_claim")).toBe(true);
  });

  it("flags a scarcity/urgency claim as MEDIUM", () => {
    const result = auditText("Hurry, today only — last chance to save!");
    expect(result.issues.some((i) => i.category === "scarcity_urgency")).toBe(true);
  });

  it("flags an earnings claim as CRITICAL", () => {
    const result = auditText("Earn guaranteed income working from home.");
    expect(result.severity).toBe("CRITICAL");
    expect(result.issues.some((i) => i.category === "earnings_claim")).toBe(true);
  });

  it("does not invent issues for a clean control product", () => {
    const result = auditText(
      "A durable stainless steel water bottle that keeps drinks cold for up to 24 hours.",
    );
    expect(result.issues).toEqual([]);
    expect(result.severity).toBe("PASS");
    expect(result.riskScore).toBe(0);
  });

  it("points evidence at the actual merchant text, not invented text", () => {
    const source = "This herbal tea may help treat migraine symptoms.";
    const result = auditText(source);
    const issue = result.issues.find((i) => i.category === "health_claim");
    expect(issue).toBeDefined();
    expect(source.toLowerCase()).toContain(issue!.evidence.toLowerCase());
  });
});

describe("scoreIssues / severity scoring", () => {
  const issue = (severity: ComplianceIssue["severity"], evidence = "x"): ComplianceIssue => ({
    category: "test",
    title: "t",
    severity,
    evidence,
    explanation: "e",
    suggestion: "s",
    source: "RULE",
  });

  it("weighs CRITICAL/HIGH/MEDIUM/LOW as documented", () => {
    expect(scoreIssues([issue("CRITICAL")]).riskScore).toBe(35);
    expect(scoreIssues([issue("HIGH")]).riskScore).toBe(22);
    expect(scoreIssues([issue("MEDIUM")]).riskScore).toBe(12);
    expect(scoreIssues([issue("LOW")]).riskScore).toBe(5);
  });

  it("caps the risk score at 100", () => {
    const many = Array.from({ length: 5 }, (_, i) => issue("CRITICAL", `evidence-${i}`));
    expect(scoreIssues(many).riskScore).toBe(100);
  });

  it("reports PASS severity when there are no issues", () => {
    expect(scoreIssues([]).severity).toBe("PASS");
  });

  it("surfaces the highest severity present", () => {
    expect(scoreIssues([issue("LOW"), issue("HIGH", "y"), issue("MEDIUM", "z")]).severity).toBe(
      "HIGH",
    );
  });
});

describe("mergeIssues — duplicate handling", () => {
  it("does not duplicate an issue with the same category and evidence (case-insensitive)", () => {
    const base: ComplianceIssue[] = [
      {
        category: "guarantee_claim",
        title: "Absolute guarantee",
        severity: "HIGH",
        evidence: "100% Guaranteed",
        explanation: "e",
        suggestion: "s",
        source: "RULE",
      },
    ];
    const extra: ComplianceIssue[] = [
      {
        category: "guarantee_claim",
        title: "AI-detected guarantee",
        severity: "HIGH",
        evidence: "100% guaranteed",
        explanation: "e2",
        suggestion: "s2",
        source: "AI",
      },
    ];
    const merged = mergeIssues(base, extra);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("RULE");
  });

  it("adds a genuinely new issue with different evidence", () => {
    const base: ComplianceIssue[] = [
      {
        category: "guarantee_claim",
        title: "Absolute guarantee",
        severity: "HIGH",
        evidence: "100% guaranteed",
        explanation: "e",
        suggestion: "s",
        source: "RULE",
      },
    ];
    const extra: ComplianceIssue[] = [
      {
        category: "earnings_claim",
        title: "AI-detected earnings claim",
        severity: "CRITICAL",
        evidence: "guaranteed income",
        explanation: "e2",
        suggestion: "s2",
        source: "AI",
      },
    ];
    const merged = mergeIssues(base, extra);
    expect(merged).toHaveLength(2);
  });
});
