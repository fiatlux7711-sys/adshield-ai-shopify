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

/** Shopify's leaky-bucket state, returned on every Admin GraphQL response. */
type ThrottleStatus = {
  maximumAvailable?: number;
  currentlyAvailable?: number;
  restoreRate?: number;
};
type QueryCost = { requestedQueryCost?: number; throttleStatus?: ThrottleStatus };

const PRODUCTS_QUERY = `#graphql
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
  }`;

/** Attempts for a single page before the whole scan gives up. */
const MAX_PAGE_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isThrottleError(errors: unknown): boolean {
  if (!Array.isArray(errors)) return false;
  return errors.some((e: any) => {
    const code = e?.extensions?.code;
    return code === "THROTTLED" || /throttl/i.test(String(e?.message ?? ""));
  });
}

/**
 * How long to wait before retrying a throttled request.
 *
 * Shopify tells us exactly how much budget we need and how fast it refills,
 * so use that rather than guessing: wait for the deficit to restore. Falls
 * back to exponential backoff only when the cost extension is absent.
 */
function throttleWaitMs(cost: QueryCost | undefined, attempt: number): number {
  const status = cost?.throttleStatus;
  const restoreRate = status?.restoreRate ?? 0;
  const available = status?.currentlyAvailable ?? 0;
  const requested = cost?.requestedQueryCost ?? 0;

  if (restoreRate > 0 && requested > available) {
    const seconds = (requested - available) / restoreRate;
    return Math.min(Math.ceil(seconds * 1000) + 250, MAX_BACKOFF_MS);
  }
  return Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/**
 * Slows down *before* hitting the limit. Without this the pager drains the
 * bucket and then thrashes against the throttle for every remaining page.
 */
async function pace(cost: QueryCost | undefined): Promise<void> {
  const status = cost?.throttleStatus;
  const restoreRate = status?.restoreRate ?? 0;
  const available = status?.currentlyAvailable ?? 0;
  const nextCost = cost?.requestedQueryCost ?? 0;
  if (restoreRate <= 0 || nextCost <= 0) return;

  // Keep a little headroom so the next page does not land exactly at empty.
  const target = nextCost * 1.5;
  if (available >= target) return;

  const waitMs = Math.min(Math.ceil(((target - available) / restoreRate) * 1000), MAX_BACKOFF_MS);
  if (waitMs > 0) await sleep(waitMs);
}

/**
 * Runs one page, absorbing throttling internally so a rate limit costs a
 * short wait rather than the whole scan. Non-throttle GraphQL errors are
 * still fatal — they are not transient and retrying would just repeat them.
 */
async function fetchPage(
  admin: AdminClient,
  variables: { first: number; after: string | null },
  shop: string,
): Promise<{ connection: ProductConnection | undefined; cost: QueryCost | undefined }> {
  for (let attempt = 1; ; attempt += 1) {
    let json: any;
    try {
      const response = await admin.graphql(PRODUCTS_QUERY, { variables });
      json = await response.json();
    } catch (error) {
      // Some client versions throw on throttling instead of returning errors.
      if (attempt < MAX_PAGE_ATTEMPTS && /throttl/i.test(String((error as Error)?.message))) {
        const waitMs = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        logger.warn("scan.throttled", { shop, attempt, waitMs, source: "exception" });
        await sleep(waitMs);
        continue;
      }
      throw error;
    }

    const cost = json.extensions?.cost as QueryCost | undefined;

    if (json.errors?.length) {
      if (isThrottleError(json.errors) && attempt < MAX_PAGE_ATTEMPTS) {
        const waitMs = throttleWaitMs(cost, attempt);
        logger.warn("scan.throttled", {
          shop,
          attempt,
          waitMs,
          available: cost?.throttleStatus?.currentlyAvailable,
          requested: cost?.requestedQueryCost,
        });
        await sleep(waitMs);
        continue;
      }
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    return { connection: json.data?.products as ProductConnection | undefined, cost };
  }
}

async function fetchProducts(admin: AdminClient, limit: number, shop: string): Promise<ProductNode[]> {
  const products: ProductNode[] = [];
  let after: string | null = null;

  while (products.length < limit) {
    const first = Math.min(50, limit - products.length);
    const { connection, cost } = await fetchPage(admin, { first, after }, shop);
    if (!connection) break;

    products.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;

    // Only pace when there is another page to fetch.
    await pace(cost);
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
/**
 * Returns this shop's currently in-flight audit run, if any.
 *
 * Scoped by shop, so one merchant's running scan can never suppress or
 * surface another merchant's.
 */
export async function findInFlightAuditRun(shop: string) {
  return db.auditRun.findFirst({
    where: { shop, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Creates a queued run for a shop, unless one is already in flight.
 *
 * Without this guard, every submit of the scan form created and enqueued
 * another run: a double-click, an F5 on the POST, or an impatient merchant
 * would spawn concurrent full-catalogue scans for the same shop, each
 * paging the Admin GraphQL API against a shared rate-limit bucket and each
 * writing a full set of AuditItem rows. That is how a throttle storm and a
 * bloated free-tier database both start.
 *
 * Returns the existing run when one is in flight, so the caller can send
 * the merchant to the scan already running rather than starting a second.
 */
export async function createQueuedAuditRun(shop: string) {
  const existing = await findInFlightAuditRun(shop);
  if (existing) {
    logger.info("audit.duplicate_suppressed", { runId: existing.id, shop, status: existing.status });
    return { run: existing, created: false as const };
  }

  const run = await db.auditRun.create({ data: { shop, status: "QUEUED" } });
  logger.info("audit.queued", { runId: run.id, shop });
  return { run, created: true as const };
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
    const products = await fetchProducts(admin, limit, shop);
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
