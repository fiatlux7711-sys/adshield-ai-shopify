import type { MetaFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

// Default document title for every route. Without this no page emitted a
// <title> at all, which fails WCAG 2.1 AA (2.4.2 Page Titled). Individual
// routes override it with their own meta export.
export const meta: MetaFunction = () => [
  { title: "AdShield AI — marketing compliance risk screening" },
  {
    name: "description",
    content:
      "Screen Shopify product marketing copy for potential advertising-compliance risk, with evidence and recommended next actions.",
  },
];

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
