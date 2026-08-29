import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const meta: MetaFunction = () => [{ title: "Settings · AdShield AI" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    aiEnabled: Boolean(process.env.AI_GATEWAY_API_KEY) && process.env.ADSHIELD_AI_ENABLED !== "false",
    model: process.env.ADSHIELD_AI_MODEL || "spacexai/grok-4.6",
    scanLimit: process.env.ADSHIELD_SCAN_LIMIT || "250",
    scopes: process.env.SCOPES || "read_products",
  };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  return (
    <s-page heading="Settings">
      <s-section heading="Shopify connection">
        <s-paragraph><strong>Store:</strong> {data.shop}</s-paragraph>
        <s-paragraph><strong>Scopes:</strong> {data.scopes}</s-paragraph>
      </s-section>
      <s-section heading="AI review">
        <s-paragraph><strong>Status:</strong> {data.aiEnabled ? "Enabled" : "Disabled"}</s-paragraph>
        <s-paragraph><strong>Model:</strong> {data.model}</s-paragraph>
        <s-paragraph>AI review is optional. The deterministic risk engine remains functional without an AI key.</s-paragraph>
      </s-section>
      <s-section heading="Scan limits">
        <s-paragraph>Manual scan cap: {data.scanLimit} products per run.</s-paragraph>
      </s-section>
      <s-section heading="Safety posture">
        <s-unordered-list>
          <s-list-item>Read-only product scope in the MVP.</s-list-item>
          <s-list-item>No customer-order data requested.</s-list-item>
          <s-list-item>No automatic edits to merchant content.</s-list-item>
          <s-list-item>Compliance webhooks included for App Store distribution.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
