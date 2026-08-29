import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";

/**
 * Guards against the dev (SQLite) and production (PostgreSQL) schemas
 * silently drifting apart — a divergence that would only surface as a
 * production migration failure long after the change that caused it.
 */
describe("prisma schema sync", () => {
  it("prisma/schema.postgresql.prisma is regenerable from prisma/schema.prisma", () => {
    expect(() =>
      execFileSync("node", ["scripts/gen-pg-schema.mjs", "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
