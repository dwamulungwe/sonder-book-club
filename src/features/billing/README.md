# Billing Provider Readiness

Sonder now has a sandbox-only Flutterwave Standard checkout foundation. Online
payments remain disabled unless the server-only Flutterwave test configuration
is complete, and live mode is intentionally not supported in Change Set 7.

This build preserves the Change Set 6 financial model: invoices represent money
owed, `MembershipPayment` represents settled or manually recorded value, and
online provider activity is stored separately in `OnlinePaymentAttempt` plus
`ProviderWebhookEvent`.

## Official Flutterwave Docs Reviewed

Retrieved on 2026-07-15:

- Flutterwave Standard hosted checkout, API version `v3.0.0`:
  https://developer.flutterwave.com/v3.0/docs/flutterwave-standard-1
- Webhooks, `verif-hash` secret-hash validation, retries, idempotency, and
  mandatory re-verification:
  https://developer.flutterwave.com/v3.0/docs/webhooks
- Transaction verification endpoint:
  https://developer.flutterwave.com/v3.0/reference/verify-transaction
- Payment methods and `payment_options` values:
  https://developer.flutterwave.com/v3.0/docs/payment-methods
- Test mode behavior:
  https://developer.flutterwave.com/v3.0/docs/testing

Implemented API decisions:

- Checkout creation endpoint: `POST https://api.flutterwave.com/v3/payments`
- Verification endpoint: `GET https://api.flutterwave.com/v3/transactions/{id}/verify`
- Authentication: `Authorization: Bearer <server-only secret key>`
- Trusted reference field: Flutterwave `tx_ref`, generated only by Sonder
- Checkout host allowlist: `https://checkout.flutterwave.com/v3/hosted/pay/...`
- Webhook signature scheme: constant-time comparison of the `verif-hash` header
  to `FLUTTERWAVE_WEBHOOK_SECRET_HASH`
- Raw webhook body handling: the route reads the raw body once for size limiting,
  JSON parsing, event payload hashing, and idempotency. Current official docs do
  not specify an HMAC raw-body signature scheme for Standard webhooks.

## Environment Configuration

Server-only variables:

- `SONDER_PAYMENT_PROVIDER`: must be `flutterwave` to enable online checkout;
  otherwise the provider stays disabled
- `SONDER_APP_BASE_URL`: public app origin used to build the return URL
- `FLUTTERWAVE_MODE`: must be `test`
- `FLUTTERWAVE_SECRET_KEY`: test secret key only
- `FLUTTERWAVE_WEBHOOK_SECRET_HASH`: dashboard webhook secret hash
- `FLUTTERWAVE_PAYMENT_OPTIONS`: optional comma-separated allowlisted methods;
  supported values in this build are `card` and `mobilemoneyzambia`

No Flutterwave variable may use `NEXT_PUBLIC_`. The app returns sanitized
configuration errors and never logs or sends provider credentials to the browser.
Live-mode keys intentionally fail closed in Change Set 7.

If `FLUTTERWAVE_PAYMENT_OPTIONS` is omitted or empty, Sonder omits
`payment_options` from the checkout request and lets Flutterwave dashboard and
account preferences decide what appears. If set, every method must be in the
allowlist; `mobilemoneyzambia` is included only when deliberately configured.
Actual card and mobile-money availability depends on Flutterwave merchant
account, country, currency, dashboard settings, and provider enablement.

## Checkout Flow

1. An authenticated active member submits `Pay online` for one of their payable
   invoices.
2. The server re-reads membership and invoice ownership, derives amount and
   currency from the database, and creates or reuses one active
   `OnlinePaymentAttempt`. The rendered form nonce is hashed into
   `checkoutIdempotencyKey` so the same submitted form reuses the same attempt.
3. The Flutterwave checkout call happens outside the Prisma financial
   transaction and uses a bounded request timeout.
4. A second short transaction stores the validated checkout URL and checkout
   metadata only if the attempt is still in `PROCESSING`.
5. The member is redirected only to an allowlisted Flutterwave checkout URL.

The browser never submits authoritative membership, amount, currency, or
provider reference data. Repeat clicks reuse a ready active attempt or return a
processing message while checkout creation is in flight. A stale in-flight
attempt is terminalized before a new trusted reference can be created.

## Return And Webhooks

The member return page treats all query parameters as untrusted. It may use
`tx_ref` and `transaction_id` as hints to locate the stored attempt, verify
membership ownership, and request a bounded server-side status check.

The webhook route is `POST /api/billing/flutterwave/webhook`. It rejects missing
or invalid `verif-hash`, malformed UTF-8/JSON, invalid `Content-Length`, and
payloads above 256 KB. A signed webhook is still never enough to give value:
successful webhook events trigger the transaction verification endpoint with a
bounded timeout, and only the verified response can settle an invoice.

`ProviderWebhookEvent` stores the provider event identity when present, otherwise
a deterministic event key derived from event type, provider transaction ID,
Sonder reference, and a SHA-256 payload hash. Duplicate webhook delivery returns
success without repeating settlement, notifications, or email-outbox jobs.

## Settlement Rules

Successful provider verification must match exactly:

- Flutterwave status `successful`
- provider transaction ID
- Sonder `tx_ref`
- attempt provider
- membership and invoice through the stored attempt
- amount in minor units
- currency
- not already settled to another payment

Settlement runs inside the existing serializable billing transaction retry
helper. It creates or reuses one confirmed `MembershipPayment`, allocates the
invoice exactly once, updates invoice status and `paidAt`, links the attempt to
the payment, and creates member notification/email-outbox records in the same
transaction.

Pending or processing provider statuses remain processing. Failed, cancelled,
reversed, incomplete, unknown, or mismatched statuses do not settle value.

## Review And Reconciliation

If a manual payment changes the invoice after checkout starts, settlement checks
the current balance. If the verified provider amount no longer equals the
current payable balance, the attempt moves to `REVIEW_REQUIRED`; Sonder preserves
the verified provider transaction and notifies admins without allocating or
discarding funds.

The admin billing page includes an online-payment reconciliation section with
safe actions to recheck provider status or flag an attempt for review. Moderators
cannot access these actions, and admins cannot manually mark an unverified
online attempt as paid.

The reconciliation foundation can find stale processing attempts and re-run the
same provider verification and settlement path. A future scheduled job should
invoke that service from a server-only authenticated/cron-protected route or job
runner, with bounded batches and the existing provider cooldown. No Vercel Cron
or scheduler is added in Change Set 7.

## Account-Specific Dashboard Items

Confirm in Flutterwave before any real sandbox checkout:

- Test mode is active and the secret key is a test key.
- Webhook URL points to `/api/billing/flutterwave/webhook`.
- Webhook secret hash exactly matches `FLUTTERWAVE_WEBHOOK_SECRET_HASH`.
- Webhook retries are enabled.
- `payment_options` behavior is compatible with dashboard preferences.
- Card and `mobilemoneyzambia` are enabled for the Sonder merchant account and
  ZMW checkout before either method is placed in `FLUTTERWAVE_PAYMENT_OPTIONS`.

## Local Testing

Run:

```bash
npm.cmd run db:generate
npm.cmd run test:billing
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npx.cmd prisma migrate status
```

Automated tests use local fake payloads and fake environment values only. They
must not require real Flutterwave credentials or network access.

## Deferred

- Applying the new migration
- Live mode enablement
- Automatic refunds
- Scheduled reconciliation execution
- Production webhook promotion
