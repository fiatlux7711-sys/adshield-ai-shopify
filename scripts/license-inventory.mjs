/**
 * Regenerates the third-party dependency/license inventory.
 *
 *   node scripts/license-inventory.mjs            # summary to stdout
 *   node scripts/license-inventory.mjs --markdown # full table for THIRD_PARTY_LICENSES.md
 *
 * Run after any dependency change and before a release, so the inventory in
 * THIRD_PARTY_LICENSES.md reflects what actually ships.
 */
import fs from "fs";
import path from "path";

const FLAGGED = /GPL|AGPL|LGPL|SSPL|CDDL|EPL|MPL|UNKNOWN|CC-BY-NC|BUSL/i;

function readLicense(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(" OR ");
  return "UNKNOWN";
}

function scan(dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin" || entry.name === ".cache") continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      scan(full, out);
      continue;
    }
    const manifest = path.join(full, "package.json");
    if (!fs.existsSync(manifest)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (pkg.name && pkg.version) out.set(`${pkg.name}@${pkg.version}`, readLicense(pkg));
    } catch {
      // A malformed nested manifest should not abort the whole inventory.
    }
  }
  return out;
}

const packages = scan("node_modules");
const counts = new Map();
for (const license of packages.values()) counts.set(license, (counts.get(license) || 0) + 1);
const distribution = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const flagged = [...packages.entries()].filter(([, l]) => FLAGGED.test(l)).sort();

if (process.argv.includes("--markdown")) {
  console.log(`Total packages: **${packages.size}**\n`);
  console.log("| Count | License |\n| ---: | --- |");
  for (const [license, count] of distribution) console.log(`| ${count} | \`${license}\` |`);
  console.log("\n### Packages needing manual confirmation\n");
  if (flagged.length === 0) {
    console.log("None.");
  } else {
    console.log("| Package | Declared license |\n| --- | --- |");
    for (const [pkg, license] of flagged) console.log(`| \`${pkg}\` | \`${license}\` |`);
  }
} else {
  console.log(`Total packages: ${packages.size}`);
  for (const [license, count] of distribution) console.log(String(count).padStart(5), license);
  console.log("\nFlagged:");
  console.log(flagged.length ? flagged.map(([p, l]) => `  ${l} — ${p}`).join("\n") : "  none");
}

process.exit(0);
