import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { logger } from "../lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  logger.info("auth.request_start", { path: url.pathname, shop });
  try {
    await authenticate.admin(request);
    logger.info("auth.request_ok", { path: url.pathname, shop });
    return null;
  } catch (error) {
    // A redirect Response is the library's normal way of driving the OAuth
    // flow (e.g. sending the merchant to Shopify's consent screen) — it is
    // not a failure and must not be logged as one.
    if (error instanceof Response) {
      logger.info("auth.request_redirect", { path: url.pathname, shop, status: error.status });
      throw error;
    }
    logger.error("auth.request_failed", { path: url.pathname, shop, error });
    throw error;
  }
};

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
