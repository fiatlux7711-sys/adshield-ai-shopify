import db from "../db.server";

/**
 * Unauthenticated liveness/readiness probe for the production host and
 * uptime monitoring. Deliberately returns no merchant data and no error
 * detail — a failing dependency is reported only as a status string so the
 * endpoint cannot be used to fingerprint the deployment.
 */
export const loader = async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { status: "ok", database: "ok" },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
};
