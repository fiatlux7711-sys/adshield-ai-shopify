import { generateText } from "ai";
import type { ComplianceIssue, Severity } from "./compliance-rules.server";

type AIProduct = {
  resourceId: string;
  title: string;
  text: string;
};

type AIResponseRow = {
  resourceId: string;
  issues?: Array<{
    category?: string;
    title?: string;
    severity?: string;
    evidence?: string;
    explanation?: string;
    suggestion?: string;
  }>;
};

const validSeverity = (value: string | undefined): Severity => {
  const normalized = (value || "MEDIUM").toUpperCase();
  if (normalized === "CRITICAL" || normalized === "HIGH" || normalized === "MEDIUM" || normalized === "LOW") {
    return normalized;
  }
  return "MEDIUM";
};

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

export async function aiAuditProducts(products: AIProduct[]): Promise<Map<string, ComplianceIssue[]>> {
  const out = new Map<string, ComplianceIssue[]>();
  if (!process.env.AI_GATEWAY_API_KEY || process.env.ADSHIELD_AI_ENABLED === "false" || products.length === 0) {
    return out;
  }

  const model = process.env.ADSHIELD_AI_MODEL || "spacexai/grok-4.6";
  const compact = products.map((p) => ({
    resourceId: p.resourceId,
    title: p.title,
    text: p.text.slice(0, 7000),
  }));

  try {
    const result = await generateText({
      model,
      maxOutputTokens: 3000,
      system:
        "You are AdShield AI, a conservative advertising-risk screening assistant for ecommerce merchants. You are not a lawyer and must not state that content is legally approved or illegal. Flag plausible marketing/compliance risk that a merchant should substantiate or review. Focus on misleading claims, health/disease claims, earnings claims, endorsements/testimonials, scarcity/urgency, free offers, environmental claims, origin claims, guarantees, and material disclosure problems. Return JSON only.",
      prompt: `Audit these Shopify product marketing texts. Return a JSON array. Each row must be: {"resourceId":"...","issues":[{"category":"snake_case","title":"short title","severity":"CRITICAL|HIGH|MEDIUM|LOW","evidence":"exact short phrase from input","explanation":"why this may create risk","suggestion":"safer action without giving legal advice"}]}. If no meaningful issue exists, return an empty issues array. Do not invent claims not present in the text.\n\n${JSON.stringify(compact)}`,
    });

    const parsed = parseJson(result.text);
    if (!Array.isArray(parsed)) return out;

    for (const row of parsed as AIResponseRow[]) {
      if (!row?.resourceId || !Array.isArray(row.issues)) continue;
      const issues: ComplianceIssue[] = row.issues
        .filter((i) => i && i.title && i.evidence)
        .slice(0, 8)
        .map((i) => ({
          category: String(i.category || "ai_review"),
          title: String(i.title || "AI review item"),
          severity: validSeverity(i.severity),
          evidence: String(i.evidence || "").slice(0, 220),
          explanation: String(i.explanation || "Potential marketing-compliance risk requires review."),
          suggestion: String(i.suggestion || "Review and substantiate or qualify the claim."),
          source: "AI" as const,
        }));
      out.set(row.resourceId, issues);
    }
  } catch (error) {
    console.error("AdShield AI enhancement failed; rule audit remains available.", error);
  }

  return out;
}
