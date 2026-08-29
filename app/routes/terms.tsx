import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireLegalIdentity } from "../legal.server";

export const loader = async (_args: LoaderFunctionArgs) => ({ identity: requireLegalIdentity() });

export default function Terms() {
  const { identity } = useLoaderData<typeof loader>();
  return <main style={{ maxWidth: 760, margin: "40px auto", padding: 20, fontFamily: "system-ui" }}>
    <h1>AdShield AI Terms of Service</h1>
    <p>Effective August 29, 2026</p>
    <p>These terms govern use of AdShield AI, operated by {identity.owner}. By installing or using the app, the merchant agrees to these terms.</p>
    <h2>Free beta</h2>
    <p>The current service is a free beta. It does not create a paid subscription or authorize charges. Features, limits, and availability may change with notice. Paid service requires separate disclosure and merchant approval through Shopify.</p>
    <h2>Permitted use</h2>
    <p>The merchant may use the app to screen marketing copy they are authorized to manage. The merchant must not misuse the service, probe security, interfere with other stores, or submit unlawful content.</p>
    <h2>No legal advice or compliance guarantee</h2>
    <p>AdShield AI identifies possible advertising and marketing risks. It is not a law firm, does not provide legal advice, and does not certify that content is lawful, compliant, approved, or risk-free. The merchant remains responsible for claims, evidence, disclosures, professional review, and publication decisions.</p>
    <h2>Availability and liability</h2>
    <p>The beta is provided on an “as available” basis to the extent permitted by law. Automated checks can miss risks or produce false positives. Nothing in these terms excludes liability that cannot legally be excluded. Final liability language should be reviewed for the operator’s jurisdiction before public launch.</p>
    <h2>Termination and contact</h2>
    <p>The merchant may stop using the service by uninstalling it. We may suspend abusive or insecure use. Questions: <a href={`mailto:${identity.email}`}>{identity.email}</a>. Mail: {identity.address}</p>
  </main>;
}
