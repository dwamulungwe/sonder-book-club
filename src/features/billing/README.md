# Billing Provider Readiness

Sonder has selected Flutterwave as the intended future online payment provider.
Change Set 6 keeps online payments disabled and keeps the billing domain
provider-independent.

The local provider contract is intentionally generic. Flutterwave-specific API
calls, SDKs, credentials, webhook routes, checkout buttons, and provider status
changes are not implemented in this change set.

## Provider Contract

The `PaymentProvider` interface is ready for a later adapter to support:

- creating a hosted checkout session
- returning a checkout URL
- carrying Sonder's trusted transaction reference
- carrying the provider transaction ID
- verifying a transaction server-side
- returning asynchronous mobile-money states as pending or processing
- parsing signed webhook events from a raw request body and headers
- checking payment status after a webhook or user return
- processing refunds through an explicit future workflow
- reconciling provider transactions against Sonder invoices

## Reference Strategy

Sonder must generate and store a trusted `sonderTransactionReference` before
checkout is created. A future Flutterwave adapter should send that value as the
Flutterwave `tx_ref` or equivalent payment reference.

The provider response should keep Flutterwave identifiers separate from Sonder's
reference:

- `sonderTransactionReference`: Sonder-generated trusted transaction reference
- `providerTransactionId`: Flutterwave transaction ID, such as `transaction_id`
  or charge `data.id`
- `providerReference`: Flutterwave processor/reference value, such as `flw_ref`
- `providerTransactionToken`: optional hosted-checkout/session token if the
  provider returns one

Invoices and subscriptions must not depend on Flutterwave-specific columns or
types. If online payments are enabled later, any persistence changes should use
provider-neutral payment-attempt fields that can also support another gateway.

## Future Settlement Rules

A provider payment must not settle an invoice unless all of these checks pass:

- provider verification reports a successful payment status
- the provider result matches Sonder's stored transaction reference
- the provider result matches the expected invoice
- the amount matches the invoice amount being paid
- the currency matches the invoice currency
- the transaction has not previously been processed
- the payment has not already been allocated
- the result comes from trusted server-side verification, not browser-return
  parameters

Payment confirmation must happen inside a database transaction that locks or
conditionally updates the payment and invoice rows, records the provider outcome,
and allocates the payment exactly once.

## Webhook And Return Design

The browser return or success page is never sufficient proof of payment. A user
return can only trigger a server-side status check and show a pending or
verifying state.

Flutterwave webhooks may be delivered more than once. Webhook processing must be
idempotent, keyed by the provider event ID and Sonder transaction reference
where available.

Mobile-money and other off-session payment methods may complete asynchronously.
A webhook may report a pending payment later becoming successful or failed, and
Sonder must also be able to poll/check status after a webhook or return.

A future webhook endpoint must validate the signed event using the raw request
body and provider signature header before parsing the payload. Invalid
signatures must be rejected before any state changes. Valid webhook data should
still be re-verified server-side with the provider before value is given.

Provider errors and payloads must be sanitised before logging. Logs must not
contain card details, mobile-money PINs, access tokens, secret keys, or raw
sensitive provider payloads.

## Credential Rules

Flutterwave credentials must never be exposed to the browser. Sonder must not
store card details, mobile-money PINs, provider access tokens, provider secret
keys, or webhook secret hashes in billing records. Runtime credentials belong in
server-only environment configuration when a real integration is built later.

## Current Change Set 6 State

- the disabled payment provider remains the only implementation
- no Flutterwave SDK is installed
- no Flutterwave API is called
- no real Flutterwave credentials are present
- no public webhook endpoint exists
- no functional Pay Online button exists
- no provider payment is marked available
- no migration was added solely for provider credentials
- migrations are not applied by this change set

Reference docs for the future implementation:

- Flutterwave Standard hosted checkout: https://developer.flutterwave.com/v3.0/docs/flutterwave-standard-1
- Flutterwave webhooks and signed events: https://developer.flutterwave.com/docs/webhooks
- Flutterwave general payment flow and asynchronous verification: https://developer.flutterwave.com/docs/main-payment-flow
