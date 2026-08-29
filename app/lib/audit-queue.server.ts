import db from "../db.server";
import { logger, merchantSafeError } from "./logger.server";
import { processAuditRun } from "./product-scan.server";

/**
 * Background execution for audit runs.
 *
 * The web request only enqueues; scanning happens here, so a large catalog
 * never holds an HTTP request open (handoff §16).
 *
 * SCOPE AND LIMITS — read before deploying to more than one instance:
 * this is an in-process worker. It is correct for a single app instance and
 * removes the request-timeout failure mode, but it is NOT a distributed
 * queue: jobs live in this process's memory, so they do not survive a
 * restart and are not shared across instances. Multi-instance production
 * needs a real broker (Redis/BullMQ, SQS, pg-boss). The seam for that is
 * deliberately narrow — replace `enqueueAuditRun` and the `drain` loop; the
 * persisted AuditRun row is already the source of truth for job state, and
 * `recoverInterruptedRuns` already reconciles rows orphaned by a restart.
 */

const MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.ADSHIELD_MAX_CONCURRENT_SCANS || 2) || 2,
);
const MAX_ATTEMPTS = Math.max(1, Number(process.env.ADSHIELD_SCAN_MAX_ATTEMPTS || 3) || 3);

type QueuedJob = { runId: string; shop: string; attempt: number };

/** Resolves an Admin GraphQL client for a shop from stored offline session. */
export type AdminResolver = (shop: string) => Promise<{
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<any>;
}>;

const pending: QueuedJob[] = [];
let active = 0;
let resolveAdmin: AdminResolver | null = null;

/** Wired once at server startup so this module has no import cycle with shopify.server. */
export function configureAuditQueue(resolver: AdminResolver) {
  resolveAdmin = resolver;
}

function backoffMs(attempt: number) {
  // 1s, 2s, 4s … capped. Gives Shopify throttling room to clear.
  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

/** Transient failures are worth retrying; a logic error is not. */
function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /throttl|rate limit|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|502|503|504/i.test(message);
}

export function enqueueAuditRun(runId: string, shop: string) {
  pending.push({ runId, shop, attempt: 1 });
  logger.info("queue.enqueued", { runId, shop, depth: pending.length });
  void drain();
}

async function drain() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift()!;
    active += 1;
    void runJob(job).finally(() => {
      active -= 1;
      void drain();
    });
  }
}

async function runJob(job: QueuedJob): Promise<void> {
  if (!resolveAdmin) {
    logger.error("queue.not_configured", { runId: job.runId });
    await failRun(job.runId, "The scan worker is not available. Please retry.");
    return;
  }

  try {
    const admin = await resolveAdmin(job.shop);
    await processAuditRun(admin, job.shop, job.runId);
  } catch (error) {
    if (job.attempt < MAX_ATTEMPTS && isRetryable(error)) {
      const delay = backoffMs(job.attempt);
      logger.warn("queue.retrying", {
        runId: job.runId,
        shop: job.shop,
        attempt: job.attempt,
        delayMs: delay,
        error,
      });
      // Re-open the row so the UI shows it as still in flight, not failed.
      await db.auditRun
        .update({ where: { id: job.runId }, data: { status: "QUEUED", errorMessage: null } })
        .catch(() => undefined);
      setTimeout(() => {
        pending.push({ ...job, attempt: job.attempt + 1 });
        void drain();
      }, delay).unref?.();
      return;
    }
    // processAuditRun already persisted FAILED with a safe message.
    logger.error("queue.exhausted", { runId: job.runId, shop: job.shop, attempt: job.attempt, error });
  }
}

async function failRun(runId: string, message: string) {
  await db.auditRun
    .update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    })
    .catch(() => undefined);
}

/**
 * Reconciles rows left mid-flight by a process restart. Because jobs are held
 * in memory, a QUEUED/RUNNING row with no worker behind it would otherwise
 * spin in the UI forever. Marking them failed is honest and lets the merchant
 * retry; it never silently discards persisted findings.
 */
export async function recoverInterruptedRuns(): Promise<number> {
  const stale = await db.auditRun.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  await db.auditRun.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: {
      status: "FAILED",
      errorMessage: merchantSafeError(new Error("interrupted")),
      completedAt: new Date(),
    },
  });
  logger.warn("queue.recovered_interrupted", { count: stale.length });
  return stale.length;
}

/** Test/observability helper. */
export function queueDepth() {
  return { pending: pending.length, active };
}
