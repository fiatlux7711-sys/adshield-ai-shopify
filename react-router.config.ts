import type { Config } from "@react-router/dev/config";

export default {
  // Embedded app forms are submitted by Shopify Admin. React Router 7.12+
  // rejects cross-origin actions by default, so permit only the known embedded
  // and application hosts instead of weakening CSRF protection globally.
  allowedActionOrigins: [
    "admin.shopify.com",
    "*.myshopify.com",
    "adshield-ai.onrender.com",
  ],
} satisfies Config;
