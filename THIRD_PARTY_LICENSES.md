# Third-party dependency & license inventory

Generated with `node scripts/license-inventory.mjs --markdown`. Regenerate
after any dependency change and before a release — this file is only accurate
as of the dependency tree that produced it.

Scope: every package present in `node_modules` (runtime **and** build/dev
tooling). Dev-only tooling is not distributed to merchants, but is listed
here so the review covers the full supply chain.

**Status: no copyleft (GPL/AGPL/LGPL/SSPL/BUSL) licenses are present.** The
tree is permissive (MIT/ISC/Apache-2.0/BSD) and compatible with proprietary
commercial distribution of AdShield AI, subject to the attribution
requirements those licenses carry.

## Distribution


| Count | License |
| ---: | --- |
| 433 | `MIT` |
| 21 | `ISC` |
| 19 | `Apache-2.0` |
| 7 | `BSD-3-Clause` |
| 1 | `UNKNOWN` |
| 1 | `Python-2.0` |
| 1 | `CC-BY-4.0` |
| 1 | `BSD-2-Clause` |
| 1 | `Unlicense` |
| 1 | `(AFL-2.1 OR BSD-3-Clause)` |
| 1 | `(MIT OR Apache-2.0)` |
| 1 | `0BSD` |
| 1 | `(MIT OR CC0-1.0)` |

### Packages needing manual confirmation

| Package | Declared license |
| --- | --- |
| `@shopify/polaris-types@1.0.1` | `UNKNOWN` |

## Notes

- `@shopify/polaris-types` declares no `license` field in its manifest. It is
  a Shopify first-party package used as a **dev-only** type dependency
  (`devDependencies`), is not shipped to merchants, and its use falls under
  Shopify's applicable developer terms. Confirm before release if Shopify
  publishes explicit license terms for it.
- `CC-BY-4.0` and `Python-2.0` entries are documentation/data packages pulled
  in transitively by build tooling, not shipped runtime code.
- Attribution obligations under MIT/BSD/Apache-2.0 are satisfied by retaining
  the license texts distributed inside `node_modules` in any build artifact
  that embeds those packages.
- Shopify trademarks, APIs, and SDKs remain subject to Shopify's terms.
  Vercel AI Gateway and the selected AI provider remain subject to their own
  terms — see `LICENSE.md`.
