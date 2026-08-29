# Data Retention & Deletion Policy — AdShield AI

> **DRAFT — NOT FOR PUBLICATION.** Reflects what the code does as of this
> commit. Requires review by counsel and completion of every `[BRACKETED]`
> placeholder before publication.

**Effective date:** `[DATE]` · **Provider:** `[LEGAL ENTITY NAME]`

## 1. What is retained

| Record | Contains | Retention trigger |
| --- | --- | --- |
| `Session` | Shop domain, Shopify access token, scope, expiry | Deleted on `app/uninstalled` and `shop/redact` |
| `ShopInstallation` | Shop domain, onboarding flag, plan | Deleted on `shop/redact` |
| `AuditRun` | Shop domain, counts, severity totals, score, timestamps | Deleted on `shop/redact` |
| `AuditItem` | Product id/title, matched evidence phrase, severity, guidance | Cascade-deleted with its `AuditRun` |

No customer personal data, order data, or payment data is stored.

## 2. Retention period

- **Active installations:** audit history is retained so merchants can compare
  scans over time.
- **On uninstall:** the Shopify session for the shop is deleted immediately on
  receipt of the `app/uninstalled` webhook.
- **On shop redaction:** all four record types above are deleted in a single
  transaction on receipt of Shopify's `shop/redact` webhook.
- **`[DECISION REQUIRED]`** Define a maximum retention period for audit history
  on still-installed shops (e.g. rolling 12 or 24 months) and implement a
  scheduled purge. The current code retains audit history indefinitely while
  the app remains installed — **this policy must not claim a purge window until
  that job exists.**

## 3. Deletion on request

Merchants may request deletion at any time via `[SUPPORT EMAIL]`. Requests will
be actioned within `[N]` days.

## 4. Backups

`[Describe production backup retention and how deletion requests propagate to
backups once managed PostgreSQL and a backup schedule are in place. Do not
publish a backup claim before backups actually exist and have been restore-
tested.]`

## 5. Verification status

As of this commit the deletion paths above are implemented in code and covered
by automated tests, but have **not** been verified against live Shopify webhook
deliveries on a development store. That verification is required before
publication.
