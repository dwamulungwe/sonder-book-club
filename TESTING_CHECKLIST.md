# Testing Checklist

Use this manual checklist before a demo, handoff, or release candidate sign-off.

## Environment Check

1. Confirm `.env` contains `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL`, `AUTH_SECRET`, and `AUTH_TRUST_HOST`.
2. Confirm PostgreSQL is running and reachable on the configured host.
3. Confirm the database has been migrated and seeded if you want the standard demo state.

## Required Validation Commands

Run these from the project root:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Optional setup or refresh commands:

```bash
npm run db:generate
npm run db:seed
```

## Auth Smoke Test

1. Open `/login`.
2. Sign in as `admin@bookclub.dev` with `Password123!`.
3. Confirm the dashboard loads successfully.
4. Log out.
5. Sign in as `guest@bookclub.dev`.
6. Confirm the guest account can access the app shell and dashboard.

## Route Smoke Test

Load each main route and confirm it renders without visible errors:

- `/dashboard`
- `/books`
- `/reading-plan`
- `/meetings`
- `/voting`
- `/announcements`
- `/members`
- `/admin`

## Admin Workflow Check

1. Sign in as `admin@bookclub.dev`.
2. On `/books`, create a book.
3. On `/reading-plan`, create a reading plan.
4. On `/meetings`, schedule a meeting.
5. On `/announcements`, publish an announcement.
6. On `/admin`, update one safe club setting and refresh to confirm it persists.

## Member Workflow Check

1. Sign in as `member@bookclub.dev`.
2. Open `/reading-plan` and log progress on a target.
3. Open `/meetings` and submit an RSVP.
4. Open `/voting` and cast a vote if an open poll exists.

## Guest Restriction Check

1. Sign in as `guest@bookclub.dev`.
2. Confirm the guest can browse the main pages.
3. Confirm restricted actions are hidden or rejected where elevated access is required.

## UI and Demo Readiness Check

1. Re-test the app at these widths:
   - `360px`
   - `390px`
   - `430px`
   - `768px`
   - `1024px`
   - desktop
2. Check `/login`, `/signup`, and `/forgot-password` at mobile widths.
3. Revisit `/dashboard`, `/books`, `/reading-plan`, `/meetings`, `/voting`, `/announcements`, `/members`, and `/admin`.
4. Confirm there is no horizontal scrolling on any audited page.
5. Confirm navigation opens and closes correctly on mobile and that page links remain reachable.
6. Confirm forms fit narrow screens and that inputs, textareas, and submit buttons are easy to tap.
7. Confirm tables and dense lists remain usable on mobile, using stacked card layouts where provided.
8. Confirm cards, badges, long text, and banners wrap cleanly without clipping.
9. Confirm no placeholder copy or outdated brand text appears.

## Sign-Off

Mark the build demo-ready only when:

- the validation commands pass
- seeded demo accounts work
- main routes load without visible issues
- core admin and member workflows complete
- guest restrictions behave as expected
