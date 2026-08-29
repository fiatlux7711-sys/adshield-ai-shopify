# Live webhook verification — evidence log

Gate: **real Shopify-delivered webhooks**, not just synthetic CLI triggers.
`shopify app webhook trigger` sends a payload directly to the local endpoint
and proves the handler + HMAC verification work, but it does not prove
Shopify's own infrastructure will register and deliver the subscription. Both
are required; this log records both, explicitly labeled.

Fill in one row per event. Do not paste full payload bodies or secrets —
topic, shop, status, and outcome are enough evidence.

## Legend

- **Source**: `synthetic` (CLI trigger) or `real` (fired by Shopify — an
  actual uninstall, actual scope change, actual customer request)
- **HMAC**: `valid` / `invalid` / `n/a` (CLI trigger without `--invalid-hmac`)
- **Result**: HTTP status returned + one line on what the handler did

## Synthetic delivery (`shopify app webhook trigger`)

| # | Timestamp | Topic | Source | HMAC | Result | Notes |
| - | --- | --- | --- | --- | --- | --- |
| 1 | | `app/uninstalled` | synthetic | valid | | |
| 2 | | `app/scopes_update` | synthetic | valid | | |
| 3 | | `customers/data_request` | synthetic | valid | | |
| 4 | | `customers/redact` | synthetic | valid | | |
| 5 | | `shop/redact` | synthetic | valid | | **destroys this shop's audit history** — confirm you want that before running |

## Invalid HMAC (already verified in this session, recorded here for the same log)

| # | Timestamp | Topic | Source | HMAC | Result |
| - | --- | --- | --- | --- | --- |
| 6 | 2026-08-29 | `app/uninstalled` | synthetic (curl, bogus signature) | invalid | **401 rejected** — verified against a running server this session |

## Duplicate delivery

| # | Timestamp | Topic | Deliveries | Result | State after |
| - | --- | --- | --- | --- | --- |
| 7 | | | fired twice | | confirm second delivery is a no-op, not an error or a double-effect |

## Real Shopify-delivered events

| # | Timestamp | Topic | Shop | Webhook ID | HTTP status | Handler result | DB state after |
| - | --- | --- | --- | --- | --- | --- | --- |
| 8 | | `app/uninstalled` | | | | | sessions for this shop only — confirm no other shop's rows changed |
| 9 | | `app/uninstalled` (reinstall) | | n/a | | fresh session established, dashboard loads, scan re-run | six-product results still match the milestone table |

`customers/data_request`, `customers/redact` fire only on a real merchant or
Shopify-initiated request in production — there is no self-service way to
trigger the real event from a dev store, so synthetic delivery (rows 3–4
above) is the practical ceiling for those two outside of App Store review.

`shop/redact` fires ~48 hours after a real uninstall in production; it will
not arrive during this same session's uninstall/reinstall test. Do not wait
for it here — the synthetic trigger (row 5) is the coverage for this gate.

## Pass criteria (from the gate definition)

| Requirement | Evidence row(s) | Status |
| --- | --- | --- |
| Synthetic webhook, valid HMAC accepted | 1–5 | ⬜ |
| Invalid HMAC rejected | 6 | ✅ (verified this session) |
| Duplicate delivery does not corrupt state | 7 | ⬜ |
| Real Shopify-delivered `app/uninstalled` received | 8 | ⬜ |
| Handler returns a successful response | 8 | ⬜ |
| Only the uninstalled shop is affected | 8 | ⬜ |
| Reinstall restores authentication/session | 9 | ⬜ |
| Six-product audit still matches after reinstall | 9 | ⬜ |

## Code-level facts already established (not requiring a live run to know)

Verified by reading `app/routes/webhooks.app.uninstalled.tsx` and
`webhooks.shop.redact.tsx`:

- Neither handler assumes a session exists. `app/uninstalled` guards its
  delete on `session` being present; `shop/redact` doesn't need to guard at
  all because `deleteMany` is a no-op on zero matching rows in either case.
  Firing either webhook when the session is already gone, or firing the same
  one twice, cannot throw for that reason.
- All deletes are scoped by `shop`, so a webhook for shop A cannot touch shop
  B's rows — this is a code guarantee, not something the live test discovers,
  though row 8 above is still where you confirm it against real data.

What the live run adds beyond this: proof that Shopify's infrastructure
actually delivers the event with a signature this app's `SHOPIFY_API_SECRET`
verifies, and that the CLI's tunnel/routing doesn't swallow it — neither of
which is knowable from source alone.
