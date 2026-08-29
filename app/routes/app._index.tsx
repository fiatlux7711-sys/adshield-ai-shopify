import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createQueuedAuditRun } from "../lib/product-scan.server";
import { enqueueAuditRun } from "../lib/audit-queue.server";

export const meta: MetaFunction = () => [{ title: "Dashboard · AdShield AI" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await db.shopInstallation.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  const recent = await db.auditRun.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return { shop: session.shop, recent, aiEnabled: Boolean(process.env.AI_GATEWAY_API_KEY) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") !== "scan") return null;

  // Enqueue and redirect immediately — the scan itself runs in the background
  // so a large catalog never holds this request open (handoff §16).
  const run = await createQueuedAuditRun(session.shop);
  enqueueAuditRun(run.id, session.shop);
  return redirect(`/app/audit/${run.id}`);
};

function toneFor(score: number): "success" | "warning" | "critical" | "info" {
  if (score >= 90) return "success";
  if (score >= 70) return "info";
  if (score >= 50) return "warning";
  return "critical";
}

export default function Dashboard() {
  const { recent, shop, aiEnabled } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const scanning = nav.state === "submitting" || nav.state === "loading";
  const latest = recent[0];

  return (
    <s-page heading="AdShield AI">
      <s-section>
        <s-stack direction="inline" gap="base">
          <img src="/adshield-ai-logo.jpg" alt="AdShield AI" width="72" height="72" style={{ borderRadius: 16 }} />
          <s-stack direction="block" gap="small">
            <s-heading>Marketing compliance risk screening for {shop}</s-heading>
            <s-paragraph>
              Scan product titles, descriptions and SEO copy for claims that may need substantiation, qualification or review before you advertise them.
            </s-paragraph>
            <s-paragraph>
              AdShield AI is a risk-screening tool, not a law firm and not a substitute for legal advice.
            </s-paragraph>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Scan your store">
        <Form method="post">
          <input type="hidden" name="intent" value="scan" />
          <s-button type="submit" {...(scanning ? { loading: true } : {})}>
            {scanning ? "Scanning products…" : "Run compliance scan"}
          </s-button>
        </Form>
      </s-section>

      <s-section heading="Current protection status">
        {latest ? (
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{latest.overallScore}/100</s-heading>
                <s-paragraph>Compliance readiness score</s-paragraph>
                <s-badge tone={toneFor(latest.overallScore)}>{latest.status}</s-badge>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{latest.flaggedItems}</s-heading>
                <s-paragraph>Products flagged</s-paragraph>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{latest.critical + latest.high}</s-heading>
                <s-paragraph>Critical + high risk</s-paragraph>
              </s-box>
            </s-stack>
            <s-link href={`/app/audit/${latest.id}`}>Open latest audit</s-link>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-heading>No audit yet</s-heading>
            <s-paragraph>Run the first scan to create your baseline risk report.</s-paragraph>
          </s-stack>
        )}
      </s-section>

      <s-section heading="What the MVP checks">
        <s-unordered-list>
          <s-list-item>Health, disease and treatment claims</s-list-item>
          <s-list-item>Guarantees, absolute claims and superiority claims</s-list-item>
          <s-list-item>Scarcity, urgency and free-offer disclosures</s-list-item>
          <s-list-item>Environmental and country-of-origin claims</s-list-item>
          <s-list-item>Earnings, testimonial and atypical-results claims</s-list-item>
        </s-unordered-list>
        <s-paragraph>{aiEnabled ? "AI enhancement is enabled." : "Rule-based scanning is active. Add AI_GATEWAY_API_KEY to enable AI review."}</s-paragraph>
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
