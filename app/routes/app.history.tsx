import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const runs = await db.auditRun.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return { runs };
};

export default function AuditHistory() {
  const { runs } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Audit history">
      <s-section>
        {runs.length === 0 ? (
          <s-paragraph>No scans have been completed yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {runs.map((run) => (
              <s-box key={run.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" gap="base">
                  <s-stack direction="block" gap="small">
                    <s-heading>{run.overallScore}/100 readiness</s-heading>
                    <s-paragraph>
                      {run.totalItems} products scanned · {run.flaggedItems} flagged · {new Date(run.createdAt).toLocaleString()}
                    </s-paragraph>
                  </s-stack>
                  <s-link href={`/app/audit/${run.id}`}>View report</s-link>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
