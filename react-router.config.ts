import type { Config } from "@react-router/dev/config";

export default {
  // Embedded app forms are submitted by Shopify Admin. React Router 7.12+
  // rejects cross-origin actions by default, so permit only Shopify\'s admin
  // host instead of weakening CSRF protection for every origin.
  allowedActionOrigins: ["admin.shopify.com"],
} satisfies Config;
