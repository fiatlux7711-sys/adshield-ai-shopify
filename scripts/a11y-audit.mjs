/**
 * Runs axe-core (WCAG 2.1 A/AA) against the pages that can be rendered
 * without a Shopify session, at desktop and small-mobile widths.
 *
 *   node scripts/a11y-audit.mjs [baseUrl]
 *
 * The embedded admin pages (/app/*) require an authenticated Shopify session
 * and Polaris web components served from Shopify's CDN, so they cannot be
 * audited here — they must be checked in a real embedded session on the dev
 * store. This script covers what is genuinely verifiable offline.
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const baseUrl = process.argv[2] || "http://localhost:3111";
const PAGES = [
  { name: "landing (/)", path: "/" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
  { name: "support", path: "/support" },
];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile-360", width: 360, height: 740 },
];

// The preinstalled browser build may not match this Playwright version's
// expected revision, so point at the binary that is actually present rather
// than triggering a download.
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME });
let failures = 0;

for (const page of PAGES) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    const tab = await context.newPage();
    await tab.goto(`${baseUrl}${page.path}`, { waitUntil: "networkidle" });

    const results = await new AxeBuilder({ page: tab })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const label = `${page.name} @ ${viewport.name}`;
    if (results.violations.length === 0) {
      console.log(`PASS  ${label} — no WCAG 2.1 A/AA violations`);
    } else {
      failures += results.violations.length;
      console.log(`FAIL  ${label} — ${results.violations.length} violation(s)`);
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`      ${node.target.join(" ")}`);
          if (node.failureSummary) {
            console.log(`      ${node.failureSummary.replace(/\n/g, "\n      ")}`);
          }
        }
      }
    }

    // Horizontal-overflow check: the audit table/cards must not break the
    // layout at small widths (handoff §13 mobile acceptance).
    const overflow = await tab.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    if (overflow) {
      failures += 1;
      console.log(`FAIL  ${label} — page scrolls horizontally at ${viewport.width}px`);
    } else {
      console.log(`PASS  ${label} — no horizontal overflow`);
    }

    await context.close();
  }
}

await browser.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} issue(s) found.`);
process.exit(failures === 0 ? 0 : 1);
