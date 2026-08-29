import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import type { ComplianceIssue } from "../lib/compliance-rules.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const run = await db.auditRun.findFirst({
    where: { id: params.auditId, shop: session.shop },
    include: { items: { orderBy: [{ riskScore: "desc" }, { resourceTitle: "asc" }] } },
  });
  if (!run) throw new Response("Audit not found", { status: 404 });
  return { run };
};

const badgeTone = (severity: string): "critical" | "warning" | "info" | "success" => {
  if (severity === "CRITICAL") return "critical";
  if (severity === "HIGH" || severity === "MEDIUM") return "warning";
  if (severity === "LOW") return "info";
  return "success";
};

export default function AuditReport() {
  const { run } = useLoaderData<typeof loader>();
  return (
    <s-page heading={`Audit report · ${run.overallScore}/100`}>
      <s-link href="/app/history">Audit history</s-link>

      <s-section heading="Summary">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-heading>{run.totalItems}</s-heading><s-paragraph>Products scanned</s-paragraph></s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-heading>{run.flaggedItems}</s-heading><s-paragraph>Flagged</s-paragraph></s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-heading>{run.critical}</s-heading><s-paragraph>Critical</s-paragraph></s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base"><s-heading>{run.high}</s-heading><s-paragraph>High</s-paragraph></s-box>
        </s-stack>
        <s-paragraph>{run.aiEnhanced ? "Rules + AI review were used." : "Deterministic rule screening was used."}</s-paragraph>
      </s-section>

      <s-section heading="Findings">
        <s-stack direction="block" gap="base">
          {run.items.map((item) => {
            const issues = JSON.parse(item.issuesJson) as ComplianceIssue[];
            return (
              <s-box key={item.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-heading>{item.resourceTitle}</s-heading>
                    <s-badge tone={badgeTone(item.severity)}>{item.severity}</s-badge>
                  </s-stack>
                  {issues.length === 0 ? (
                    <s-paragraph>No issues detected by the current checks.</s-paragraph>
                  ) : (
                    issues.map((issue, index) => (
                      <s-box key={`${issue.category}-${index}`} padding="base" background="subdued" borderRadius="base">
                        <s-stack direction="block" gap="small">
                          <s-heading>{issue.title}</s-heading>
                          <s-paragraph><strong>Evidence:</strong> “{issue.evidence}”</s-paragraph>
                          <s-paragraph>{issue.explanation}</s-paragraph>
                          <s-paragraph><strong>Recommended action:</strong> {issue.suggestion}</s-paragraph>
                          <s-paragraph>Source: {issue.source}</s-paragraph>
                        </s-stack>
                      </s-box>
                    ))
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Important">
        <s-paragraph>
          A pass means AdShield did not identify a risk under the checks currently enabled. It does not mean the content is legally approved.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
