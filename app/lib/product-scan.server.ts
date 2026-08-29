import db from "../db.server";
import { aiAuditProducts } from "./ai-audit.server";
import { auditText, mergeIssues, scoreIssues, stripHtml } from "./compliance-rules.server";
import { logger, merchantSafeError } from "./logger.server";

type ProductNode = {
  id: string;
  title: string;
  description: string;
  status: string;
  tags: string[];
  seo?: { title?: string | null; description?: string | null } | null;
};

type ProductConnection = {
  nodes: ProductNode[];
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
};

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<any>;
};

async function fetchProducts(admin: AdminClient, limit: number): Promise<ProductNode[]> {
  const products: ProductNode[] = [];
  let after: string | null = null;

  while (products.length < limit) {
    const first = Math.min(50, limit - products.length);
    const response = await admin.graphql(
      `#graphql
        query AdShieldProducts($first: Int!, $after: String) {
          products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
            nodes {
              id
              title
              description
              status
              tags
              seo {
                title
                description
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
      { variables: { first, after } },
    );

    const json = await response.json();
    if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    const connection = json.data?.products as ProductConnection | undefined;
    if (!connection) break;

    products.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return products;
}

function productText(product: ProductNode): string {
  return [
    `Product title: ${product.title}`,
    `SEO title: ${product.seo?.title || ""}`,
    `SEO description: ${product.seo?.description || ""}`,
    `Tags: ${(product.tags || []).join(", ")}`,
    `Description: ${stripHtml(product.description || "")}`,
  ].join("\n");
}

export function resolveScanLimit(): number {
  const requested = Number(process.env.ADSHIELD_SCAN_LIMIT || 250);
  return Number.isFinite(requested) ? Math.max(1, Math.min(requested, 1000)) : 250;
}

/**
 * Creates the audit run in QUEUED state and returns immediately so the web
 * request is never held open for a catalog scan (handoff §16). The actual
 * work is performed later by processAuditRun, driven by the queue.
 */
export async function createQueuedAuditRun(shop: string) {
  const run = await db.auditRun.create({ data: { shop, status: "QUEUED" } });
  logger.info("audit.queued", { runId: run.id, shop });
  return run;
}

/**
 * Executes a queued audit run. Safe to call only for a run whose id and shop
 * are already known-good; the caller is responsible for shop scoping.
 */
export async function processAuditRun(admin: AdminClient, shop: string, runId: string) {
  const limit = resolveScanLimit();
  const startedAt = Date.now();

  await db.auditRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  logger.info("audit.started", { runId, shop, limit });

  const run = { id: runId };

  try {
    const products = await fetchProducts(admin, limit);
    const preliminary = products.map((product) => {
      const text = productText(product);
      const base = auditText(text);
      return { product, text, ...base };
    });

    const aiCandidates = preliminary
      .filter((p) => p.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20)
      .map((p) => ({ resourceId: p.product.id, title: p.product.title, text: p.text }));

    // Record the denominator as soon as it is known so the in-progress UI can
    // show "n of N" rather than an unbounded spinner.
    await db.auditRun.update({
      where: { id: run.id },
      data: { totalItems: products.length },
    });

    const aiMap = await aiAuditProducts(aiCandidates);

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let flaggedItems = 0;
    let totalRisk = 0;
    let processed = 0;

    for (const entry of preliminary) {
      const aiIssues = aiMap.get(entry.product.id) || [];
      const issues = mergeIssues(entry.issues, aiIssues);
      const scored = scoreIssues(issues);

      if (scored.severity !== "PASS") flaggedItems += 1;
      if (scored.severity === "CRITICAL") critical += 1;
      if (scored.severity === "HIGH") high += 1;
      if (scored.severity === "MEDIUM") medium += 1;
      if (scored.severity === "LOW") low += 1;
      totalRisk += scored.riskScore;

      await db.auditItem.create({
        data: {
          auditRunId: run.id,
          shop,
          resourceType: "PRODUCT",
          resourceId: entry.product.id,
          resourceTitle: entry.product.title,
          riskScore: scored.riskScore,
          severity: scored.severity,
          issueCount: issues.length,
          issuesJson: JSON.stringify(issues),
        },
      });

      // Results are persisted incrementally, so a partially complete run still
      // shows real findings and a crash never discards everything scored so far.
      processed += 1;
      if (processed % 25 === 0 || processed === preliminary.length) {
        await db.auditRun.update({
          where: { id: run.id },
          data: { processedItems: processed },
        });
      }
    }

    const avgRisk = products.length ? Math.round(totalRisk / products.length) : 0;
    const overallScore = Math.max(0, 100 - avgRisk);

    const completed = await db.auditRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETE",
        totalItems: products.length,
        processedItems: processed,
        flaggedItems,
        critical,
        high,
        medium,
        low,
        overallScore,
        aiEnhanced: aiMap.size > 0,
        completedAt: new Date(),
      },
    });

    logger.info("audit.completed", {
      runId: run.id,
      shop,
      totalItems: products.length,
      flaggedItems,
      overallScore,
      aiEnhanced: aiMap.size > 0,
      durationMs: Date.now() - startedAt,
    });

    return completed;
  } catch (error) {
    // The raw error may carry GraphQL internals; persist only a safe summary.
    logger.error("audit.failed", { runId: run.id, shop, error, durationMs: Date.now() - startedAt });
    await db.auditRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: merchantSafeError(error),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
