import "@shopify/shopify-app-react-router/adapters/node";
import "./env.server";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { configureAuditQueue } from "./lib/audit-queue.server";
import { resolveShopifyEnv } from "./env.server";

const env = resolveShopifyEnv();

const shopify = shopifyApp({
  apiKey: env.apiKey,
  apiSecretKey: env.apiSecretKey,
  apiVersion: ApiVersion.July26,
  scopes: env.scopes,
  appUrl: env.appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(env.shopCustomDomain ? { customShopDomains: [env.shopCustomDomain] } : {}),
});

// Wire the background audit worker to Shopify's stored offline session, so a
// queued scan resolves its own Admin client rather than borrowing a
// request-scoped one that may outlive the request that created it.
configureAuditQueue(async (shop: string) => {
  const { admin } = await shopify.unauthenticated.admin(shop);
  return admin;
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
