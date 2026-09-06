import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { resolveShopifyEnv } from "../env.server";
import { logger } from "../lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  try {
    const { session } = await authenticate.admin(request);
    logger.info("app.auth_ok", { shop: session.shop });
    return { apiKey: resolveShopifyEnv().apiKey || "" };
  } catch (error) {
    if (error instanceof Response) {
      // The library redirects (e.g. to re-run token exchange) as part of its
      // normal flow — that is not an authentication failure.
      logger.info("app.auth_redirect", { path: url.pathname, status: error.status });
      throw error;
    }
    logger.error("app.auth_failed", { path: url.pathname, error });
    throw error;
  }
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">
          Dashboard
        </a>
        <a href="/app/history">Audit history</a>
        <a href="/app/settings">Settings</a>
        <a href="/support" target="_blank" rel="noopener noreferrer">Support</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
