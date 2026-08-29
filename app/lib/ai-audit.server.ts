import { generateText } from "ai";
import type { ComplianceIssue, Severity } from "./compliance-rules.server";
import { logger } from "./logger.server";

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

const MAX_CATEGORY_LENGTH = 60;
const MAX_TITLE_LENGTH = 120;
const MAX_EXPLANATION_LENGTH = 600;
const MAX_SUGGESTION_LENGTH = 400;

const validSeverity = (value: string | undefined): Severity => {
  const normalized = (value || "MEDIUM").toUpperCase();
  if (normalized === "CRITICAL" || normalized === "HIGH" || normalized === "MEDIUM" || normalized === "LOW") {
    return normalized;
  }
  return "MEDIUM";
};

/** Normalizes a model-supplied category to a bounded, snake_case-shaped string. */
function normalizeCategory(value: string | undefined): string {
  const cleaned = String(value || "ai_review")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (cleaned || "ai_review").slice(0, MAX_CATEGORY_LENGTH);
}

/**
 * Finds the model's claimed evidence inside the exact text the model was
 * given, and returns the real source substring rather than the model's own
 * transcription of it — the displayed evidence is always the merchant's
 * actual text, never a model paraphrase, even when the match is only
 * case/whitespace-insensitive.
 *
 * Returns null when the evidence cannot be found in the source text at all.
 * The instruction to the model is "exact short phrase from input", but
 * nothing about the model's output format is trustworthy on its own — a
 * hallucinated quote must be caught here, not displayed to a merchant as if
 * it were their own copy.
 */
function resolveEvidenceInSource(claimedEvidence: string, sourceText: string): string | null {
  const trimmed = claimedEvidence.trim();
  if (!trimmed) return null;

  const exactIndex = sourceText.indexOf(trimmed);
  if (exactIndex !== -1) return sourceText.slice(exactIndex, exactIndex + trimmed.length);

  // Fall back to a whitespace/case-insensitive match, still anchored to the
  // real source so the displayed text is never the model's own wording.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const normalizedSource = normalize(sourceText);
  const normalizedClaim = normalize(trimmed);
  if (!normalizedClaim) return null;

  const normalizedIndex = normalizedSource.indexOf(normalizedClaim);
  if (normalizedIndex === -1) return null;

  // Map the normalized-string match back to an approximate real-text slice.
  // Whitespace collapsing can shift offsets slightly, so scan the original
  // text for a matching-length window rather than trusting the index
  // directly, and verify it round-trips before returning it.
  const approxLength = trimmed.length;
  for (let start = 0; start <= sourceText.length - 1; start += 1) {
    const window = sourceText.slice(start, start + approxLength + 10);
    if (normalize(window).startsWith(normalizedClaim)) {
      // Trim the window down to the shortest prefix that still matches.
      for (let end = start + 1; end <= sourceText.length; end += 1) {
        const candidate = sourceText.slice(start, end);
        if (normalize(candidate) === normalizedClaim) return candidate;
      }
    }
  }
  return null;
}

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

    // Only accept rows for products that were actually sent — a model that
    // hallucinates or garbles a resourceId must not silently attach findings
    // to the wrong product, or to a product that was never in this batch.
    // Evidence is checked against `compact`'s truncated text, not the full
    // product text — that's the only text the model actually saw, so
    // evidence found only beyond the 7000-char cut is not genuine.
    const knownProducts = new Map(compact.map((p) => [p.resourceId, p]));

    for (const row of parsed as AIResponseRow[]) {
      if (!row?.resourceId || !Array.isArray(row.issues)) continue;
      const product = knownProducts.get(row.resourceId);
      if (!product) {
        logger.warn("ai_audit.unknown_resource_id", { resourceId: row.resourceId });
        continue;
      }

      const issues: ComplianceIssue[] = [];
      for (const i of row.issues) {
        if (!i || !i.title || !i.evidence) continue;
        if (issues.length >= 8) break;

        const resolvedEvidence = resolveEvidenceInSource(String(i.evidence), product.text);
        if (resolvedEvidence === null) {
          // The instruction to the model was "exact short phrase from
          // input" — evidence that cannot be found in what was actually
          // sent is either a hallucination or a paraphrase, and either way
          // must not be shown to a merchant as if it were their own text.
          logger.warn("ai_audit.evidence_not_found", { resourceId: row.resourceId });
          continue;
        }

        issues.push({
          category: normalizeCategory(i.category),
          title: String(i.title).slice(0, MAX_TITLE_LENGTH) || "AI review item",
          severity: validSeverity(i.severity),
          evidence: resolvedEvidence.slice(0, 220),
          explanation:
            String(i.explanation || "Potential marketing-compliance risk requires review.").slice(
              0,
              MAX_EXPLANATION_LENGTH,
            ),
          suggestion: String(i.suggestion || "Review and substantiate or qualify the claim.").slice(
            0,
            MAX_SUGGESTION_LENGTH,
          ),
          source: "AI" as const,
        });
      }
      out.set(row.resourceId, issues);
    }
  } catch (error) {
    // Provider errors can carry request/response detail; route through the
    // redacting structured logger rather than dumping the raw object.
    logger.error("ai_audit.failed", { error });
  }

  return out;
}
