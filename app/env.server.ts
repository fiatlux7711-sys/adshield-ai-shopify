const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
] as const;

export function assertProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const missing = REQUIRED_PRODUCTION_ENV.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  const appUrl = new URL(env.SHOPIFY_APP_URL!.trim());
  if (appUrl.protocol !== "https:") throw new Error("SHOPIFY_APP_URL must use HTTPS in production");
}

assertProductionEnvironment();

/**
 * Trims a Shopify credential/URL env var before use.
 *
 * A session token is a JWT signed with the app's client secret; verification
 * is a byte-exact HMAC comparison. A secret pasted into a host's dashboard
 * with an incidental trailing newline or leading space passes any
 * non-empty/"is it set" check (env.server.ts's own presence check included)
 * but produces a signature mismatch on every single request — exactly the
 * symptom of "session-token exchange succeeds, the next authenticated
 * request 401s". This has nothing to do with whether the secret is
 * *correct*; it fails identically for a correct secret with one stray
 * whitespace character copy-pasted in.
 */
function trimmedEnv(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function resolveShopifyEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    apiKey: trimmedEnv(env.SHOPIFY_API_KEY),
    apiSecretKey: trimmedEnv(env.SHOPIFY_API_SECRET) ?? "",
    appUrl: trimmedEnv(env.SHOPIFY_APP_URL) ?? "",
    scopes: trimmedEnv(env.SCOPES)?.split(",").map((s) => s.trim()),
    shopCustomDomain: trimmedEnv(env.SHOP_CUSTOM_DOMAIN),
  };
}
