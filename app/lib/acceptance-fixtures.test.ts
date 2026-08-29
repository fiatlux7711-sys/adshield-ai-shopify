import { describe, expect, it } from "vitest";
import { auditText } from "./compliance-rules.server";

/**
 * The six controlled products from the dev-store acceptance test
 * (handoff §13). These run the exact merchant copy the acceptance test
 * calls for through the deterministic engine, so the expected detection
 * behavior is pinned here before the app is installed on a real store.
 *
 * These assertions describe what the RULES DETECT. They deliberately do not
 * assert anything about actual legal compliance — regex detection is a
 * screening signal, not a legal determination.
 */
const FIXTURES = [
  {
    label: "health/disease claim",
    copy: "Cures back pain",
    expectCategory: "health_claim",
    expectSeverity: "CRITICAL",
  },
  {
    label: "guarantee",
    copy: "Guaranteed results",
    expectCategory: "guarantee_claim",
    expectSeverity: "HIGH",
  },
  {
    label: "environmental claim",
    copy: "100% eco-friendly",
    expectCategory: "environmental_claim",
    expectSeverity: "HIGH",
  },
  {
    label: "urgency claim",
    copy: "Only 2 left",
    expectCategory: "scarcity_urgency",
    expectSeverity: "MEDIUM",
  },
  {
    label: "earnings claim",
    copy: "Make $5,000/month",
    expectCategory: "earnings_claim",
    expectSeverity: "CRITICAL",
  },
] as const;

describe("dev-store acceptance fixtures — risky claims", () => {
  it.each(FIXTURES)("detects the $label in $copy", ({ copy, expectCategory, expectSeverity }) => {
    const result = auditText(copy);
    const categories = result.issues.map((i) => i.category);

    expect(categories).toContain(expectCategory);
    expect(result.severity).toBe(expectSeverity);
  });

  it.each(FIXTURES)("anchors evidence in the merchant's own text for $copy", ({ copy }) => {
    const result = auditText(copy);
    for (const issue of result.issues) {
      expect(copy.toLowerCase()).toContain(issue.evidence.toLowerCase());
    }
  });
});

describe("dev-store acceptance fixtures — clean control", () => {
  const CLEAN = "Stainless steel water bottle with a 24 hour vacuum seal and a lifetime warranty.";

  it("does not invent any issue on the clean control product", () => {
    const result = auditText(CLEAN);
    expect(result.issues).toEqual([]);
    expect(result.severity).toBe("PASS");
    expect(result.riskScore).toBe(0);
  });
});

describe("earnings rule — ordinary product copy must not be flagged", () => {
  // The earnings patterns accept "make $N" but must not fire on ordinary
  // quantity copy, which is extremely common in real product descriptions.
  const BENIGN = [
    "Makes 2 servings per pod.",
    "This recipe kit makes 4 portions.",
    "Making 12 cupcakes has never been easier.",
    "Blender makes 3 cups of smoothie at a time.",
    "Priced at $5,000 for the complete set.",
  ];

  it.each(BENIGN)("does not flag an earnings claim in %s", (copy) => {
    const categories = auditText(copy).issues.map((i) => i.category);
    expect(categories).not.toContain("earnings_claim");
  });
});

describe("earnings rule — earnings phrasings that must be caught", () => {
  const EARNINGS = [
    "Make $5,000/month",
    "Make $5,000 per month",
    "Earn $300 a day from home",
    "Earn 5000 dollars monthly",
    "Making up to $10k with this system",
    "$2,500/week income potential",
  ];

  it.each(EARNINGS)("flags an earnings claim in %s", (copy) => {
    const categories = auditText(copy).issues.map((i) => i.category);
    expect(categories).toContain("earnings_claim");
  });
});
