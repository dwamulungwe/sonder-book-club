# Changelog

All notable changes to Sonder Book Club are documented in this file.

## Unreleased

### Changed

- Added the membership application and onboarding workflow with a public Join page, signed-in application status page, moderator/admin review queue, approval transactions, and idempotent community welcome posts.
- Redirected the legacy public signup path to Join so public account creation no longer grants active membership.
- Tightened member-facing navigation and member directory visibility so pending applicants are kept out of active member surfaces.
- Added the Community Feed foundation with protected posting, comments, one-level replies, reactions, bookmarks, reporting, moderator review, and a community feed preview on Home.
- Began the v0.2 community transition by renaming the dashboard navigation and metadata to Home, adding a Community home introduction, and linking members to updates, reading progress, voting, and meetings.
- Added the member profile foundation with a protected My Profile page, profile editing, and profile-aware member directory cards.
- Removed ISBN from book forms, validation, actions, the Prisma Book model, and seed data.

### Database

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
