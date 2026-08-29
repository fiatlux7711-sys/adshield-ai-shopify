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
  const appUrl = new URL(env.SHOPIFY_APP_URL!);
  if (appUrl.protocol !== "https:") throw new Error("SHOPIFY_APP_URL must use HTTPS in production");
}

assertProductionEnvironment();
