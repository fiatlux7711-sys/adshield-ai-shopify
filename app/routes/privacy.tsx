import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireLegalIdentity } from "../legal.server";

export const loader = async (_args: LoaderFunctionArgs) => ({ identity: requireLegalIdentity() });

export default function PrivacyPolicy() {
  const { identity } = useLoaderData<typeof loader>();
  return <main style={{ maxWidth: 760, margin: "40px auto", padding: 20, fontFamily: "system-ui" }}>
    <h1>AdShield AI Privacy Policy</h1>
    <p>Effective August 29, 2026</p>
    <p>AdShield AI is operated by {identity.owner}. This policy explains how the Shopify app processes information.</p>
    <h2>Information processed</h2>
    <p>The app reads product titles, descriptions, tags, and SEO copy authorized by the merchant. It stores the merchant shop domain, Shopify authentication sessions, audit summaries, and findings. The free beta does not request customer or order scopes.</p>
    <h2>Purpose and service providers</h2>
    <p>Information is processed to authenticate the merchant, scan product marketing copy, show audit history, secure the service, and troubleshoot failures. Hosting and database providers process information only to operate the service. Optional AI review is disabled by default and must not be enabled without updating this policy and completing the applicable vendor review.</p>
    <h2>Retention and deletion</h2>
    <p>Audit and installation data is retained while the app is installed and is deleted after Shopify sends the authenticated shop-redaction request following uninstall, unless retention is legally required. Merchants may request access, export, correction, or earlier deletion by contacting us.</p>
    <h2>Security and rights</h2>
    <p>We use access controls, encrypted transport, least-privilege Shopify scopes, authenticated webhooks, and managed infrastructure. Depending on location, individuals may have rights to access, correct, delete, restrict, object to, or obtain a copy of personal information.</p>
    <h2>Contact</h2>
    <p>Email: <a href={`mailto:${identity.email}`}>{identity.email}</a><br />Mail: {identity.address}</p>
  </main>;
}
