# Changelog

All notable changes to Sonder Book Club are documented in this file.

## Unreleased

### Changed

- Added the Change Set 8 provider-independent durable email delivery layer with a disabled provider, Resend adapter, leased concurrent outbox processing, deterministic provider idempotency, audited delivery attempts, bounded retry/backoff, uncertain-delivery review, recipient suppression, verified delivery webhooks, a secured cron route, and expanded ADMIN-only inspection and bounded processing controls. No live provider, domain, webhook, or cron schedule is configured.
- Kept application, billing, membership, notification, and preference workflows on the existing enqueue-first path so provider latency or downtime cannot roll back core business transactions.
- Added the v0.3 Flutterwave sandbox checkout foundation with server-only test-mode configuration, trusted Sonder transaction references, member checkout initiation, safe return handling, verified webhooks, provider transaction verification, atomic settlement, mismatch review handling, admin reconciliation, and local provider/security tests. Live mode, refunds, production webhooks, and scheduled reconciliation remain deferred.
- Hardened the Change Set 7 pre-commit audit path with tracked `.env.example` placeholders, explicit Flutterwave payment-method allowlisting, checkout nonce idempotency, bounded provider requests, stricter checkout URL validation, webhook payload limits, settled-attempt immutability guards, and rollback-only migration rehearsal notes.
- Added the v0.3 membership billing and subscription foundation with integer minor-unit money storage, membership plans, member subscriptions, invoices, evolved membership payments, ADMIN-only billing operations, member billing history, transactional billing notifications, and a disabled payment-provider abstraction prepared for a future provider adapter.
- Documented Flutterwave as Sonder's selected future online payment provider while preserving provider-independent billing boundaries and keeping manual/offline payment recording as the only operational workflow in this slice; live online payments, provider webhooks, scheduled invoice generation, PDF receipts, and full accounting remain deferred.
- Added the v0.2 in-app notifications and provider-independent email outbox foundation with notification preferences, transactional application-status email jobs, community/announcement/meeting integrations, protected notification settings, and an ADMIN-only outbox review page.
- Documented that no live email provider or scheduled delivery processor is configured yet; outbox records are not considered sent without provider confirmation.
- Added the membership application and onboarding workflow with a public Join page, signed-in application status page, moderator/admin review queue, approval transactions, and idempotent community welcome posts.
- Redirected the legacy public signup path to Join so public account creation no longer grants active membership.
- Tightened member-facing navigation and member directory visibility so pending applicants are kept out of active member surfaces.
- Added the Community Feed foundation with protected posting, comments, one-level replies, reactions, bookmarks, reporting, moderator review, and a community feed preview on Home.
- Began the v0.2 community transition by renaming the dashboard navigation and metadata to Home, adding a Community home introduction, and linking members to updates, reading progress, voting, and meetings.
- Added the member profile foundation with a protected My Profile page, profile editing, and profile-aware member directory cards.
- Removed ISBN from book forms, validation, actions, the Prisma Book model, and seed data.

### Database

- Added the pending two-phase Change Set 8 migration chain: `20260717120000_email_outbox_status_values` commits new outbox enum values first, and `20260717120100_email_delivery_foundation` then backfills rendered bodies/classification and adds durable lease, attempt, webhook-event, provider-idempotency, delivery-state, and suppression integrity controls without deleting existing outbox rows.
- Added `20260715_flutterwave_payment_attempts_reconciliation` to create provider-neutral online payment attempts, webhook event idempotency records, Flutterwave attempt states, provider transaction uniqueness, active-attempt protection, timestamp/review constraints, and audit-preserving billing relations. This migration is intentionally pending and unapplied in Change Set 7.
- Added `20260714_membership_billing_subscription_foundation` to create billing interval, subscription status, and invoice status enums; add membership plans, subscriptions, and invoices; backfill `membership_payments.amountMinor` from the legacy decimal amount; add payment confirmation/idempotency fields; enforce key billing indexes and check constraints; and extend billing notifications/preferences.
- Added `20260714_notifications_email_outbox` to create notification and email outbox enums, notification records, user notification preferences, unique dedupe keys, audit-preserving relations, and indexes for unread/recent notification and outbox processing queries.
- Added `20260714_membership_applications_onboarding` to create membership application statuses and records, add pending memberships, add new-member welcome posts, and protect unresolved application emails with a partial unique index.
- Added `20260713_community_feed_foundation` to create community posts, comments, reactions, bookmarks, and content reports.
- Added `20260713_member_profile_foundation` to create the one-to-one member profile table.
- Added `20260713_remove_book_isbn` to drop the obsolete `books.isbn` column without resetting or reseeding data.

## v0.1.0 - 2026-04-30

First demo-ready release of the single-club Sonder Book Club MVP.

### Release Summary

- Finalized the rebrand to Sonder Book Club across the app shell, auth flow, seeded club profile, and supporting docs.
- Shipped the full single-club workspace for books, reading plans, meetings, voting, announcements, members, and admin settings.
- Simplified the product story by removing multi-club assumptions and centering the app on one shared club workspace.
- Prepared a seeded demo environment with role-based accounts for `admin`, `moderator`, `member`, and `guest`.

### Included Features

- Email and password sign-in with Auth.js credentials and JWT-backed sessions.
- Shared dashboard with current reading, meeting, voting, and announcement visibility.
- Book tracking for current, backlog, nominated, and archived titles.
- Reading plans with targets and progress logging.
- Meeting scheduling, RSVP tracking, attendance, and notes.
- Book nominations, polls, and voting workflows.
- Announcement publishing and member directory views.
- Admin controls for club settings and membership management.

### Demo Readiness

- Seed data now reflects the Sonder Book Club brand and a realistic MVP walkthrough state.
- Demo accounts are available for admin, moderator, member, and guest role verification.
- Release support docs are included in `README.md`, `DEMO_SCRIPT.md`, and `TESTING_CHECKLIST.md`.

### Quality Checks

- Verified local setup, Prisma generation, and seed workflow.
- Re-ran `npm run lint`.
- Re-ran `npx tsc --noEmit`.
- Re-ran `npm run build`.
