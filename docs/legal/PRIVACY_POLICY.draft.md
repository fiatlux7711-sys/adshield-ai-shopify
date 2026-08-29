# Privacy Policy — AdShield AI

> **DRAFT — NOT FOR PUBLICATION.** This draft describes what the AdShield AI
> codebase actually does as of this commit. It has **not** been reviewed by a
> qualified lawyer. It must be reviewed by counsel, and every `[BRACKETED]`
> placeholder must be filled in, before it is published or linked from a
> Shopify App Store listing.

**Effective date:** `[DATE]`
**Provider:** `[LEGAL ENTITY NAME]` ("we", "us")
**Contact:** `[SUPPORT EMAIL]`

## 1. Scope

This policy covers the AdShield AI Shopify application ("the App"). It does not
cover Shopify itself, your store's own privacy practices, or any third-party
service you connect independently.

## 2. What the App accesses

The App requests a single Shopify access scope: **`read_products`**. It is
read-only and never modifies your store's content.

Using that scope, the App reads the following product fields in order to screen
marketing copy for advertising-compliance risk:

- Product title
- Product description
- SEO title and SEO description
- Product tags
- Product status

The App does **not** request, read, or store customer records, order data,
payment data, or storefront visitor data.

## 3. What the App stores

| Data | Purpose | Retention |
| --- | --- | --- |
| Shop domain | Identify your installation and isolate your data | Until uninstall |
| Shopify session / access token | Authenticate API calls on your behalf | Until uninstall or token expiry |
| Audit runs (counts, scores, timestamps) | Show audit history and trends | Until uninstall or deletion request |
| Audit items (product id, title, matched evidence phrase, severity, guidance) | Show you which copy was flagged and why | Until uninstall or deletion request |

Audit items store the **specific phrase from your own product copy** that
triggered a check, so the report can show you the evidence. No other product
content is retained.

## 4. Data isolation

All stored records are keyed to your shop domain, and every query the App makes
is scoped to the authenticated session's shop. One merchant cannot access
another merchant's audit data.

## 5. Optional AI processing

If AI-assisted review is enabled for your installation, a **truncated excerpt of
the product marketing text described in section 2** is sent to an AI provider
via `[AI PROVIDER / GATEWAY NAME]` to produce additional advisory findings.

- Only product marketing text is sent. No customer data, order data, secrets, or
  credentials are included.
- Only higher-risk candidate products are sent, up to a bounded number per scan.
- AI output is advisory only and is validated before display.
- If AI review is unavailable or fails, the App falls back to its deterministic
  rule engine and continues to function.
- `[Confirm and state the AI provider's data-retention and training-use terms
  here — this must match the provider's actual contractual terms.]`

## 6. Subprocessors

`[List each subprocessor actually used in production — hosting provider,
database provider, AI gateway/provider, error-monitoring provider — with the
processing purpose and region. This list must match production reality.]`

## 7. Data deletion

- **Uninstall:** when you uninstall the App, Shopify sends an `app/uninstalled`
  webhook and the App deletes the stored session for your shop.
- **Shop redaction:** on Shopify's `shop/redact` webhook, the App deletes your
  audit runs, audit items, installation record, and sessions.
- **Customer data:** the App stores no customer personal data as part of its
  audit workflow, so Shopify's `customers/data_request` and `customers/redact`
  webhooks are acknowledged with no customer records to return or erase. If the
  App's data model ever changes to store customer data, this section and those
  handlers must be updated together.
- **On request:** contact `[SUPPORT EMAIL]` to request deletion at any time.

## 8. Security

`[Describe production security controls once the production host is live —
encryption in transit and at rest, access controls, secret management, logging
practices, incident response. Do not publish claims that are not yet true.]`

## 9. What this App is not

AdShield AI is a **risk-screening and workflow tool**. It is not a law firm, does
not provide legal advice, and does not determine legal compliance. A clean scan
means only that the checks enabled at that time did not identify a risk. It is
not a guarantee of compliance and is not a substitute for professional legal
review.

## 10. Changes

We will update this policy when the App's data practices change, and update the
effective date above.

## 11. Contact

`[SUPPORT EMAIL]` · `[SUPPORT URL]`
