# Sonder Email Delivery

Change Set 8 extends the existing notification/email-outbox foundation. It does
not create a second email system and does not activate live delivery.

## Current State

- Business workflows render deterministic templates and enqueue `EmailOutbox`
  rows in the same transaction as their existing notification/business mutation.
- Provider processing occurs later. No provider request is made inside an
  interactive Prisma transaction and user-facing actions do not wait for Resend.
- `SONDER_EMAIL_PROVIDER=disabled` is the safe default. Missing, malformed, or
  unsupported configuration fails closed while the rest of Sonder remains usable.
- No Resend account, verified domain, real key, real webhook, Vercel schedule, or
  Production delivery is configured by this change set.

## Architecture

`EmailProvider` normalizes provider availability, accepted results, retryable
failures, permanent failures, unknown-delivery outcomes, verified webhook input,
and delivery events. Implementations are:

- disabled provider: performs no network work
- Resend provider: direct HTTPS `POST /emails` with a bounded timeout and no
  automatic transport retry
- fake provider: deterministic, network-free automated testing

Outbox records retain the recipient, rendered text and HTML, template key and
version, subject, business dedupe key, delivery class, provider IDs, deterministic
provider idempotency key, attempts, scheduling, lease state, sanitized failures,
and lifecycle timestamps. Bodies are not duplicated into attempt or webhook rows.

`EmailDeliveryAttempt` audits each provider call. `EmailProviderWebhookEvent`
stores the stable provider event identity, message correlation, event timestamp,
SHA-256 raw-payload hash, and processing outcome without storing the raw payload.
`EmailSuppression` retains the active/resolved state, reason, source, and first/last
occurrence without silently deleting complaint or bounce history. The existing
payment `ProviderWebhookEvent` model is not reused because it is typed to online
payment providers and transactions.

## Classification and Suppression Policy

Essential transactional emails include application receipt/decisions, invoices,
payment records and confirmations/failures, and operational membership billing
notices. Marketing preferences do not suppress these at enqueue time.

Community comment/reply, announcement, and meeting emails are preference-controlled
and are checked at enqueue time. Preference changes never rewrite sent audit rows.
Marketing campaigns and weekly digests are deferred.

Every automated delivery class is blocked when the normalized recipient has an
active hard-bounce, complaint, provider-suppression, administrative, or invalid-
address record. Suppression is checked at enqueue, before claim, and again after
claim. Deleted users are not sent automated email; a queued row for a deleted user
is cancelled with a sanitized audit reason. Complaint suppression has the highest
reason precedence and there is intentionally no casual clear action in the admin UI.

## Claim, Lease, Retry, and Uncertainty

The processor atomically claims only due `PENDING` or `RETRY_SCHEDULED` rows (plus
expired `PROCESSING` leases) with PostgreSQL `FOR UPDATE SKIP LOCKED`. Claiming is
bounded, assigns a unique worker ID, creates a short lease, increments the attempt,
and commits before any provider call. Results are recorded in a second short
transaction; one failed row cannot block the batch.

Stale leases are recoverable. An incomplete prior attempt is marked uncertain and
the same outbox/provider idempotency key is retained. Separate outbox rows use
separate keys of the form `sonder-email/<trusted outbox id>`; the browser never
supplies a key.

Retryable send responses are limited to verified temporary categories: HTTP 429,
provider 5xx, an in-progress idempotency conflict, and disabled/unavailable provider
state. Exponential delay starts at 60 seconds, doubles per attempt, adds deterministic
bounded jitter of up to 20%, respects a safe `Retry-After`, caps at six hours, and
never exceeds the row's maximum attempts. Authentication, validation, sender/domain,
malformed request, incompatible idempotency, and verified recipient failures are
permanent. Provider response bodies are reduced to sanitized codes.

Resend retains idempotency keys for 24 hours. A timeout, connection failure, or 2xx
response without the documented message ID is an unknown-delivery outcome. Sonder
retries with the same key only when the next bounded retry fits inside that 24-hour
window with a one-minute safety margin. Once the window or attempts are exhausted,
the row moves to `REVIEW_REQUIRED`; it is not blindly resent with a new key.

## Outbox States

Legacy `PENDING`, `PROCESSING`, `SENT`, `FAILED`, and `CANCELLED` values remain so
existing rows retain their meaning. New processing uses `RETRY_SCHEDULED`,
`PERMANENTLY_FAILED`, and `REVIEW_REQUIRED`; delivery webhooks add `DELIVERED`,
`DELIVERY_DELAYED`, `BOUNCED`, `COMPLAINED`, and `SUPPRESSED`. `SENT` means Resend
accepted the request, not that the recipient's mail server accepted it.

## Resend Adapter and Webhooks

The adapter sends only configured sender, optional reply-to, one trusted outbox
recipient, subject, rendered HTML/text, safe tags, and the deterministic
`Idempotency-Key`. The request timeout defaults to 10 seconds and is bounded to
1–30 seconds. Native `fetch` is used without uncontrolled SDK retries.

`POST /api/email/resend/webhook` reads a bounded 256 KiB body once, decodes UTF-8
strictly, rejects malformed JSON, and verifies the untouched string with the Svix
implementation and exactly `svix-id`, `svix-timestamp`, and `svix-signature` plus
`RESEND_WEBHOOK_SIGNING_SECRET`. Invalid or missing signatures create no record.
Only verified events are persisted; raw payloads and signing secrets are not.

Resend webhooks are at-least-once and unordered. The unique `(provider, svix-id)`
identity makes duplicates no-ops. A repeated identity with a different payload hash
is retained for review. Unknown provider message IDs are also retained for review.
Database failures return a retryable 503 so Resend can redeliver.

State precedence is conservative:

- accepted never downgrades delayed, delivered, bounce, complaint, or suppression
- delayed never downgrades delivered or an adverse terminal outcome and never
  causes a second send
- delivered can advance sent/delayed but cannot erase a later complaint, bounce,
  or provider suppression
- complaint outranks bounce and suppression; bounce outranks provider suppression
- older low-precedence events do not overwrite newer terminal state
- `email.failed` after provider acceptance is terminal and does not cause a new
  email; `email.delivery_delayed` records temporary provider delivery state only

Hard bounce, complaint, and provider-suppressed events upsert one audit-safe
suppression record. No webhook sends email or changes an application, payment,
invoice, subscription, membership, or other business transaction.

## Cron Security and Scheduling

`GET /api/cron/email-outbox` requires the exact `Authorization: Bearer <CRON_SECRET>`
header. Missing configuration returns 503; invalid credentials return 401 using a
constant-time comparison. The route has no session or query-string secret, is
uncached, has a 60-second function limit, derives a batch that fits a 50-second
provider-time budget, and returns counts only—never recipients, subjects, bodies,
provider errors, or secrets.

No `vercel.json` schedule is included. Examples after plan/latency approval:

- Hobby-compatible daily fallback: `0 3 * * *` (daily; invocation may occur
  anywhere in the specified hour)
- Pro/Enterprise near-real-time option: `*/2 * * * *`

Vercel Cron uses GET against the Production deployment only. It can miss, overlap,
or duplicate an invocation and does not retry a failed invocation, so leases,
`SKIP LOCKED`, internal deduplication, and provider idempotency remain authoritative.
Hobby supports only daily cadence; Pro and Enterprise support per-minute cadence.
Function duration and usage remain account/plan dependent.

## Server-Only Environment Names

- `SONDER_EMAIL_PROVIDER`
- `SONDER_EMAIL_FROM`
- `SONDER_EMAIL_REPLY_TO`
- `SONDER_APP_BASE_URL`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `CRON_SECRET`
- optional `SONDER_EMAIL_BATCH_SIZE`
- optional `SONDER_EMAIL_LEASE_SECONDS`
- optional `SONDER_EMAIL_REQUEST_TIMEOUT_MS`

None uses `NEXT_PUBLIC_`. Provider configuration is isolated behind `server-only`
and cannot be imported by client components.

## Account and Domain Readiness

Future enablement order:

1. Create a Resend account.
2. Choose a dedicated sending subdomain where appropriate.
3. Add and verify Resend's SPF and DKIM DNS records; add DMARC according to the
   deployment policy after authenticated sending is understood.
4. Create a sending-only API key with minimum available scope.
5. Configure a sender at the verified domain and a reply-capable reply-to when used.
6. Create the HTTPS webhook for sent, delivered, delivery-delayed, failed, bounced,
   complained, and suppressed events; capture its signing secret securely.
7. Configure Vercel Preview variables first and apply the migration through the
   approved deployment workflow.
8. Perform controlled Preview deliveries and inspect accepted, delivered, bounced,
   complaint, duplicate, out-of-order, and suppression behaviour.
9. Confirm plan/latency, add a deliberate schedule, monitoring, and alerts.
10. Enable Production only after Preview sign-off.

The domain is not claimed to be verified and live delivery is not claimed active.

## Monitoring and Deferred Scope

Monitor queue age, oldest due row, claimed/stale leases, retry volume, permanent
failures, uncertain/review-required rows, webhook 4xx/5xx, unmatched events, bounce
and complaint rates, and suppression growth. Alerting destinations remain a
deployment decision.

Deferred: marketing campaigns, weekly digests, inbound email, attachments, open/
click tracking, and a dedicated high-frequency durable queue if Vercel Cron cannot
meet the required latency or reliability.

## Official Documentation Reviewed

Retrieved 2026-07-17. Only official Resend and Vercel documentation was used.
Resend's REST API currently has no version header/system, so this implementation
targets the documented current `POST /emails` contract.

Resend:

- https://resend.com/docs/api-reference/introduction
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/api-reference/errors
- https://resend.com/docs/api-reference/rate-limit
- https://resend.com/docs/webhooks/introduction
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/event-types
- https://resend.com/docs/webhooks/retries-and-replays
- https://resend.com/docs/api-reference/webhooks/create-webhook
- https://resend.com/docs/dashboard/domains/introduction
- https://resend.com/docs/dashboard/domains/dmarc
- https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend

Vercel:

- https://vercel.com/docs/cron-jobs
- https://vercel.com/docs/cron-jobs/quickstart
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/functions/configuring-functions/duration
