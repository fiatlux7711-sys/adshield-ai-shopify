#!/usr/bin/env node
/**
 * Non-interactive Codespace verification.
 *
 * Runs every check that does NOT require an interactive Shopify browser
 * login, in the order a fresh Codespace needs them: install, Prisma, tests,
 * config sanity, typecheck, build. On success it prints the exact line the
 * next step in the runbook (docs/DEV_STORE_MILESTONE.md) waits for, so the
 * live `npx shopify app dev` step is the only thing left that needs a human
 * at the keyboard.
 *
 * This intentionally does NOT run `shopify app config link`, `shopify app
 * dev`, or anything that touches Shopify's servers — those need the
 * interactive session this script cannot provide.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";

const steps = [
  ["npm install", "npm install"],
  ["npx prisma generate", "prisma generate"],
  ["npx prisma migrate deploy", "prisma migrate deploy (applies committed migrations only — never prompts, never invents one)"],
  ["npm test", "vitest suite, including the six-product acceptance fixtures and the real-SQLite isolation tests"],
  ["npm run typecheck", "typecheck"],
  ["npm run build", "production build"],
];

function run(label, command) {
  console.log(`\n▶ ${label}`);
  execSync(command, { stdio: "inherit" });
}

function checkShopifyConfig() {
  console.log("\n▶ Shopify config sanity check (no network call — local file only)");
  if (!existsSync("shopify.app.toml")) {
    throw new Error("shopify.app.toml is missing.");
  }
  const toml = readFileSync("shopify.app.toml", "utf8");
  const clientIdMatch = toml.match(/client_id\s*=\s*"([^"]*)"/);
  const clientId = clientIdMatch?.[1] ?? "";
  if (!clientId) {
    console.warn(
      "  ⚠ client_id is empty. `shopify app dev` will need `shopify app config link` " +
        "run interactively first (Organization: Omnipresent technologies, App: AdShield AI). " +
        "This is expected if you have not linked yet, and does not fail this check — " +
        "linking itself needs the interactive browser step this script cannot do.",
    );
  } else {
    console.log(`  client_id is set (${clientId.slice(0, 6)}…).`);
  }
  const scopesMatch = toml.match(/scopes\s*=\s*"([^"]*)"/);
  const scopes = scopesMatch?.[1] ?? "";
  if (scopes !== "read_products") {
    throw new Error(`Expected scopes = "read_products", found "${scopes}". Least-privilege scope has changed.`);
  }
  console.log(`  scopes: ${scopes} (least-privilege, as expected)`);
}

try {
  for (const [command, label] of steps) {
    run(label, command);
  }
  checkShopifyConfig();

  console.log("\nPASS: non-interactive Codespace verification completed.");
  console.log("Next step (requires an interactive terminal with browser access):");
  console.log("  npx shopify app config link   # only if client_id is empty above");
  console.log("  npx shopify app dev");
  process.exit(0);
} catch (error) {
  console.error("\nFAIL: non-interactive Codespace verification did not complete.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
