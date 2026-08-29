import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import type { ComplianceIssue } from "../lib/compliance-rules.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const status = data?.run.status;
  if (status === "QUEUED" || status === "RUNNING") return [{ title: "Audit in progress · AdShield AI" }];
  if (status === "FAILED") return [{ title: "Audit failed · AdShield AI" }];
  return [{ title: `Audit report ${data?.run.overallScore ?? ""}/100 · AdShield AI` }];
};

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
  const revalidator = useRevalidator();
  const inFlight = run.status === "QUEUED" || run.status === "RUNNING";

  // Poll while the background scan is still working. Stops as soon as the run
  // reaches a terminal state so a finished report does not keep refetching.
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 2000);
    return () => clearInterval(id);
  }, [inFlight, revalidator]);

  if (inFlight) {
    return (
      <s-page heading="Audit in progress">
        <s-link href="/app/history">Audit history</s-link>
        <s-section heading="Scanning your catalogue">
          <s-stack direction="block" gap="base">
            <s-spinner accessibilityLabel="Scan in progress" />
            {/*
              The page polls and swaps this text in place. Without a live
              region the update is silent to screen readers (WCAG 2.1 AA
              4.1.3 Status Messages), so progress is announced politely.
            */}
            <div role="status" aria-live="polite" aria-atomic="true">
              <s-paragraph>
                {run.status === "QUEUED"
                  ? "Your scan is queued and will start momentarily."
                  : run.totalItems > 0
                    ? `Scanned ${run.processedItems} of ${run.totalItems} products…`
                    : "Loading your product catalogue…"}
              </s-paragraph>
            </div>
            <s-paragraph>
              This page updates automatically. You can safely leave and come back to it
              from Audit history.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  if (run.status === "FAILED") {
    return (
      <s-page heading="Audit did not complete">
        <s-link href="/app/history">Audit history</s-link>
        <s-section heading="Something went wrong">
          <s-banner tone="critical">
            <s-paragraph>
              {run.errorMessage ||
                "The scan could not be completed. Please retry, and contact support if this persists."}
            </s-paragraph>
          </s-banner>
          {run.processedItems > 0 ? (
            <s-paragraph>
              {run.processedItems} products were scored before the scan stopped. Their
              findings are listed below and remain available.
            </s-paragraph>
          ) : null}
          <s-link href="/app">Back to dashboard to retry</s-link>
        </s-section>
        {run.items.length > 0 ? <Findings items={run.items} /> : null}
      </s-page>
    );
  }

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

      <Findings items={run.items} />

      <s-section slot="aside" heading="Important">
        <s-paragraph>
          A pass means AdShield did not identify a risk under the checks currently enabled. It does not mean the content is legally approved.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

type FindingItem = {
  id: string;
  resourceTitle: string;
  severity: string;
  issuesJson: string;
};

function Findings({ items }: { items: FindingItem[] }) {
  return (
    <s-section heading="Findings">
      <s-stack direction="block" gap="base">
        {items.map((item) => {
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
  );
}
