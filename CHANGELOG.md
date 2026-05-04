# Changelog

All notable changes to Sonder Book Club are documented in this file.

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
