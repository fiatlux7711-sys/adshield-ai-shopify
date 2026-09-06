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
      // A 3xx is the library's normal way of driving the OAuth/token-exchange
      // flow — not a failure. A 401/403 is a real authentication failure and
      // must be logged as such, with enough non-secret context (never the
      // token/header values themselves) to diagnose why: whether the request
      // carried a bearer session token at all, and the reauthorize URL the
      // library computed, which is the concrete next step it expected.
      if (error.status >= 400) {
        logger.error("app.auth_failed", {
          path: url.pathname,
          status: error.status,
          hasAuthorizationHeader: request.headers.has("authorization"),
          secFetchDest: request.headers.get("sec-fetch-dest"),
          reauthorizeUrl: error.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url"),
        });
      } else {
        logger.info("app.auth_redirect", { path: url.pathname, status: error.status });
      }
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
