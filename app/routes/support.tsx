import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireLegalIdentity } from "../legal.server";

export const loader = async (_args: LoaderFunctionArgs) => ({ identity: requireLegalIdentity() });

export default function Support() {
  const { identity } = useLoaderData<typeof loader>();
  return <main style={{ maxWidth: 760, margin: "40px auto", padding: 20, fontFamily: "system-ui" }}>
    <h1>AdShield AI Support</h1>
    <p>Email <a href={`mailto:${identity.email}`}>{identity.email}</a>. We aim to respond within one business day.</p>
    <h2>Before contacting support</h2>
    <ol><li>Confirm the app is still installed and has product read access.</li><li>Record the store domain, audit time, and error shown.</li><li>Do not email Shopify access tokens, API secrets, customer information, or passwords.</li></ol>
    <h2>Common questions</h2>
    <p><strong>Does a pass guarantee compliance?</strong> No. A pass only means the enabled checks did not identify a risk.</p>
    <p><strong>Does AdShield edit products?</strong> No. The free beta is read-only.</p>
    <p><strong>Is AI required?</strong> No. Deterministic screening works without an AI provider.</p>
    <p><strong>How do I delete data?</strong> Uninstall the app or email support for an earlier deletion request.</p>
  </main>;
}
