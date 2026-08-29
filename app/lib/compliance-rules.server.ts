export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ComplianceIssue = {
  category: string;
  title: string;
  severity: Severity;
  evidence: string;
  explanation: string;
  suggestion: string;
  source: "RULE" | "AI";
};

type Rule = {
  category: string;
  title: string;
  severity: Severity;
  patterns: RegExp[];
  explanation: string;
  suggestion: string;
};

const RULES: Rule[] = [
  {
    category: "health_claim",
    title: "Disease or treatment claim",
    severity: "CRITICAL",
    patterns: [
      /\b(cure|cures|cured|treat|treats|treatment for|diagnose|diagnoses|prevent|prevents)\b.{0,45}\b(cancer|diabetes|arthritis|depression|anxiety|disease|infection|migraine|eczema|pain)\b/gi,
      /\bclinically proven to (cure|treat|prevent)\b/gi,
    ],
    explanation:
      "Health and disease claims can create significant advertising and regulatory exposure unless the product category and evidence support the claim.",
    suggestion:
      "Remove disease-treatment language or replace it with narrowly supported, evidence-backed wording reviewed for the applicable product category.",
  },
  {
    category: "guarantee_claim",
    title: "Absolute guarantee or certainty claim",
    severity: "HIGH",
    patterns: [/\b100% (guaranteed|effective|safe|proven)\b/gi, /\bguaranteed results?\b/gi, /\brisk[- ]free\b/gi, /\bworks every time\b/gi],
    explanation:
      "Absolute promises can be misleading when material conditions, exclusions, or substantiation are not clear.",
    suggestion:
      "Use qualified language and disclose material conditions next to the claim.",
  },
  {
    category: "superlative_claim",
    title: "Unqualified superiority claim",
    severity: "MEDIUM",
    patterns: [/\b#?1\b.{0,25}\b(best|rated|choice)\b/gi, /\b(best|safest|fastest|strongest) (in the world|on the market|available|ever)\b/gi, /\bthe best\b/gi],
    explanation:
      "Superiority claims generally need a clear basis, comparison set, and current substantiation.",
    suggestion:
      "State the basis for the comparison or use a non-comparative product benefit that can be substantiated.",
  },
  {
    category: "scarcity_urgency",
    title: "Scarcity or urgency claim",
    severity: "MEDIUM",
    patterns: [/\bonly \d+ left\b/gi, /\btoday only\b/gi, /\blast chance\b/gi, /\blimited time only\b/gi, /\bhurry\b/gi, /\bends (today|tonight|soon)\b/gi],
    explanation:
      "Urgency and scarcity language can be deceptive if the stated limit is not genuine and consistently enforced.",
    suggestion:
      "Use urgency only when the inventory or deadline is real, measurable, and automatically kept accurate.",
  },
  {
    category: "free_claim",
    title: "Free or zero-cost claim",
    severity: "MEDIUM",
    patterns: [/\bfree\b/gi, /\bno cost\b/gi, /\b\$0\b/g],
    explanation:
      "Free offers can be misleading when mandatory charges, subscriptions, minimum purchases, or shipping conditions are not disclosed prominently.",
    suggestion:
      "Place all material conditions immediately next to the free claim and ensure the offer is truly available as described.",
  },
  {
    category: "environmental_claim",
    title: "Broad environmental benefit claim",
    severity: "HIGH",
    patterns: [/\beco[- ]?friendly\b/gi, /\benvironmentally friendly\b/gi, /\bcarbon neutral\b/gi, /\bzero emissions\b/gi, /\b100% sustainable\b/gi],
    explanation:
      "Broad environmental claims often require precise qualification and reliable substantiation.",
    suggestion:
      "Describe the specific environmental attribute, scope, methodology, and limitations instead of making a broad unqualified claim.",
  },
  {
    category: "origin_claim",
    title: "U.S. origin claim",
    severity: "HIGH",
    patterns: [/\bmade in (the )?usa\b/gi, /\bamerican[- ]made\b/gi, /\bmade in america\b/gi],
    explanation:
      "Origin claims can carry strict qualification requirements depending on where components and manufacturing steps occur.",
    suggestion:
      "Verify the claim against sourcing and manufacturing records and qualify it where necessary.",
  },
  {
    category: "earnings_claim",
    title: "Earnings or financial outcome claim",
    severity: "CRITICAL",
    patterns: [/\bguaranteed (income|returns?|profit|earnings)\b/gi, /\bget rich\b/gi, /\bpassive income\b/gi, /\bearn \$?\d+[\d,]*(?:\.\d+)?\b/gi],
    explanation:
      "Earnings and financial-outcome claims can be high risk when typical results, assumptions, and substantiation are unclear.",
    suggestion:
      "Remove guarantees, document the substantiation, and disclose material assumptions and typical-result information where applicable.",
  },
  {
    category: "testimonial_results",
    title: "Results-based testimonial claim",
    severity: "HIGH",
    patterns: [/\blost \d+ (lbs?|pounds?|kg)\b/gi, /\bmade \$?\d+[\d,]* in \d+ (days?|weeks?|months?)\b/gi, /\bbefore and after\b/gi],
    explanation:
      "Testimonials that communicate atypical performance can imply that consumers should expect the same result.",
    suggestion:
      "Verify the testimonial, disclose material connections, and make typical-result context clear when required.",
  },
];

const WEIGHT: Record<Severity, number> = {
  CRITICAL: 35,
  HIGH: 22,
  MEDIUM: 12,
  LOW: 5,
};

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function auditText(input: string): { issues: ComplianceIssue[]; riskScore: number; severity: string } {
  const text = stripHtml(input);
  const issues: ComplianceIssue[] = [];

  for (const rule of RULES) {
    let evidence = "";
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        evidence = match[0].slice(0, 180);
        break;
      }
    }
    if (!evidence) continue;

    issues.push({
      category: rule.category,
      title: rule.title,
      severity: rule.severity,
      evidence,
      explanation: rule.explanation,
      suggestion: rule.suggestion,
      source: "RULE",
    });
  }

  const riskScore = Math.min(
    100,
    issues.reduce((sum, issue) => sum + WEIGHT[issue.severity], 0),
  );

  const severity =
    issues.some((i) => i.severity === "CRITICAL") ? "CRITICAL" :
    issues.some((i) => i.severity === "HIGH") ? "HIGH" :
    issues.some((i) => i.severity === "MEDIUM") ? "MEDIUM" :
    issues.some((i) => i.severity === "LOW") ? "LOW" : "PASS";

  return { issues, riskScore, severity };
}

export function mergeIssues(base: ComplianceIssue[], extra: ComplianceIssue[]): ComplianceIssue[] {
  const seen = new Set(base.map((i) => `${i.category}:${i.evidence.toLowerCase()}`));
  const merged = [...base];
  for (const issue of extra) {
    const key = `${issue.category}:${issue.evidence.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }
  return merged;
}

export function scoreIssues(issues: ComplianceIssue[]): { riskScore: number; severity: string } {
  const riskScore = Math.min(100, issues.reduce((sum, issue) => sum + WEIGHT[issue.severity], 0));
  const severity =
    issues.some((i) => i.severity === "CRITICAL") ? "CRITICAL" :
    issues.some((i) => i.severity === "HIGH") ? "HIGH" :
    issues.some((i) => i.severity === "MEDIUM") ? "MEDIUM" :
    issues.some((i) => i.severity === "LOW") ? "LOW" : "PASS";
  return { riskScore, severity };
}
