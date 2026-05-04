# Sonder Book Club MVP

Single-club reading hub built with Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL, and Auth.js.

## Release Pack

Use these docs when preparing or presenting the current demo build:

- [CHANGELOG.md](./CHANGELOG.md) - `v0.1.0` release notes
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) - page-by-page demo walkthrough
- [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) - manual pre-demo smoke test
- [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./PRODUCTION_DEPLOYMENT_CHECKLIST.md) - production deployment runbook

## Overview

This version of the app is intentionally scoped to one specific book club. The old multi-club flows have been removed in favor of a simpler architecture:

- one global club profile
- one membership record per user
- one shared dashboard and navigation model
- role-based access for `admin`, `moderator`, `member`, and `guest`

The app keeps the existing MVP feature set focused on a single club workspace:

- email/password authentication
- current book and library management
- reading plans and progress tracking
- meetings, RSVP, attendance, and notes
- nominations, polls, and voting
- announcements
- member directory and admin controls

## Stack

- Next.js `16.2.4`
- React `19`
- Tailwind CSS `4`
- shadcn/ui
- Prisma ORM `7`
- PostgreSQL
- Auth.js (`next-auth@5 beta`)

## Project Structure

```text
.
|-- prisma/
|   |-- schema.prisma
|   `-- seed.ts
|-- src/
|   |-- app/
|   |   |-- (app)/
|   |   |   |-- admin/
|   |   |   |-- announcements/
|   |   |   |-- books/
|   |   |   |-- dashboard/
|   |   |   |-- meetings/
|   |   |   |-- members/
|   |   |   |-- reading-plan/
|   |   |   `-- voting/
|   |   |-- (auth)/
|   |   `-- api/auth/[...nextauth]/
|   |-- components/
|   |   |-- app/
|   |   `-- ui/
|   |-- features/
|   |   |-- admin/
|   |   |-- announcements/
|   |   |-- auth/
|   |   |-- books/
|   |   |-- club/
|   |   |-- meetings/
|   |   |-- reading-plans/
|   |   `-- voting/
|   |-- lib/
|   `-- types/
|-- prisma.config.ts
`-- components.json
```

## Data Model

The Prisma schema is now centered around a single `ClubSettings` record and a simplified membership model:

- `ClubSettings`: club name, description, meeting frequency, location, contact details, logo, banner
- `User`: auth identity and club role
- `Membership`: one per user, with role, status, and joined date
- `Book`
- `ReadingPlan`, `ReadingTarget`, `ReadingProgress`
- `Meeting`, `MeetingRsvp`, `MeetingAttendance`, `MeetingNote`
- `Announcement`
- `BookNomination`, `Poll`, `PollOption`, `PollVote`
- `MembershipPayment`

Multi-club entities such as club creation, club listings, invites, and join requests have been removed.

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/bookclub?schema=public"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/bookclub?schema=public"
SHADOW_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/bookclub_shadow?schema=public"
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_TRUST_HOST="true"
```

- `DATABASE_URL` is the app/runtime connection string.
- `DIRECT_URL` is the direct PostgreSQL connection Prisma uses for schema and migration work. If your provider gives you both pooled and direct URLs, keep `DATABASE_URL` as the runtime value and use the direct connection for `DIRECT_URL`.
- `SHADOW_DATABASE_URL` must point to a separate empty database for `prisma migrate dev`.

## Production Environment

For a deployed app, keep the environment setup as lean as possible:

- Required at runtime:
  - `DATABASE_URL`
  - `AUTH_SECRET`
  - `AUTH_TRUST_HOST=true`
- Recommended when you also run Prisma CLI commands against production or preview databases:
  - `DIRECT_URL`
- Only needed for local or CI `prisma migrate dev` workflows:
  - `SHADOW_DATABASE_URL`

Notes:

- This app uses JWT-backed Auth.js sessions, so there is no extra session store secret beyond `AUTH_SECRET`.
- The current codebase reads `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_TRUST_HOST` at runtime. It does not depend on `NEXTAUTH_URL` in app code.
- `SHADOW_DATABASE_URL` is not needed for `prisma migrate deploy`, and Prisma does not use a shadow database for production-focused migration commands.
- Generate a strong `AUTH_SECRET` before deploying. One simple local option is:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local PostgreSQL databases in pgAdmin on Windows:

   1. Open pgAdmin and connect to your local PostgreSQL server.
   2. Right-click `Databases` and create a database named `bookclub`.
   3. Create a second database named `bookclub_shadow`.
   4. If your local password is not `postgres`, update all three connection strings in `.env`.
   5. Keep the host as `127.0.0.1` instead of `localhost` to match the Prisma config.

3. Generate the Prisma client:

   ```bash
   npm run db:generate
   ```

4. Apply the single-club schema to your database:

   ```bash
   npm run db:migrate -- --name single-club-refactor
   ```

   If you are moving from the old multi-club MVP and do not need existing local data, reset or recreate the database before seeding.

5. Seed sample data:

   ```bash
   npm run db:seed
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000)

## Deployment Notes

### Vercel + Hosted PostgreSQL

This app is ready to deploy to Vercel with any hosted PostgreSQL provider that gives standard Postgres connection strings.

1. Create a hosted PostgreSQL database.

   Vercel no longer provisions new "Vercel Postgres" databases directly. Current Vercel guidance is to install a Postgres integration from the Vercel Marketplace, such as Neon, Supabase, AWS Aurora Postgres, or Prisma Postgres.

2. Collect your connection strings.

   Most providers will give you:

   - a runtime or pooled connection string
   - a direct connection string for migrations and admin tooling

   Map them like this:

   - `DATABASE_URL` = runtime or pooled connection string used by the app
   - `DIRECT_URL` = direct connection string used for Prisma CLI commands

   The runtime app uses `@prisma/adapter-pg` with `DATABASE_URL`, while `prisma.config.ts` points Prisma CLI work at `DIRECT_URL`. Hosted PostgreSQL hostnames and parameters such as `sslmode=require` are preserved by the current setup.

3. Add environment variables in Vercel for `production`, `preview`, and `development` as needed.

   Minimum production set:

   ```text
   DATABASE_URL=...
   AUTH_SECRET=...
   AUTH_TRUST_HOST=true
   ```

   Recommended full set:

   ```text
   DATABASE_URL=...
   DIRECT_URL=...
   AUTH_SECRET=...
   AUTH_TRUST_HOST=true
   ```

4. Link the repo to Vercel and confirm the default build command stays `npm run build`.

5. Apply migrations separately from the request path.

   Use production-safe migration commands such as:

   ```bash
   npx prisma migrate deploy
   ```

   Run that from a trusted local machine or CI job with the same production environment variables. Do not use `prisma migrate dev` against production.

6. Seed only when you want demo data in the deployed environment.

   ```bash
   npm run db:seed
   ```

   Seeding is useful for preview environments, review apps, or an initial hosted demo database. It is not a required step for every production deploy.

7. Redeploy after changing environment variables.

   Vercel applies new environment variables to new deployments, not old ones.

8. Follow the production runbook.

   Use [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./PRODUCTION_DEPLOYMENT_CHECKLIST.md) as the final pre-launch and post-launch checklist.

### Vercel CLI Tips

If you prefer the CLI workflow:

```bash
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
vercel env add AUTH_SECRET production
vercel env add AUTH_TRUST_HOST production
vercel pull --environment=production
```

Repeat the same pattern for `preview` and `development` if you want those environments configured separately.

## Verified Local Run Order

This is the exact order used in the final MVP validation pass:

1. `npm install`
2. `npm run db:generate`
3. `npm run db:migrate`
4. `npm run db:seed`
5. `npm run dev`
6. Sign in with one of the demo accounts below

The validation pass also re-ran:

- `npm run db:generate`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Sample Accounts

All seeded accounts use:

```text
Password123!
```

- `admin@bookclub.dev` - admin access
- `moderator@bookclub.dev` - moderator access
- `member@bookclub.dev` - active member access
- `chipo@bookclub.dev` - active member access
- `guest@bookclub.dev` - guest access

## Scripts

- `npm run dev` - start the local development server
- `npm run build` - production build
- `npm run lint` - lint the project
- `npm run db:generate` - generate Prisma Client
- `npm run db:migrate -- --name single-club-refactor` - create and apply a migration
- `npm run db:seed` - load sample data

## Final Routes

- `/` - redirects into the app flow
- `/login`
- `/signup`
- `/forgot-password`
- `/dashboard`
- `/books`
- `/reading-plan`
- `/meetings`
- `/voting`
- `/announcements`
- `/members`
- `/admin`

## Smoke-Test Checklist

Use this quick pass before a demo or production handoff:

1. Open `/login` and sign in with `admin@bookclub.dev` / `Password123!`.
2. Load each main route once:
   - `/dashboard`
   - `/books`
   - `/reading-plan`
   - `/meetings`
   - `/voting`
   - `/announcements`
   - `/members`
   - `/admin`
3. Create a book from `/books`.
4. Create a reading plan from `/reading-plan`.
5. Schedule a meeting and confirm it appears on `/dashboard` and `/meetings`.
6. RSVP to a meeting as a member account.
7. Submit a nomination, create a poll, and cast a vote.
8. Publish an announcement and confirm it appears on `/dashboard` and `/announcements`.
9. Update club settings from `/admin` and refresh to confirm they persist.
10. Log out and sign back in with `guest@bookclub.dev` to confirm restricted actions stay protected.

## Notes

- Auth uses the Prisma adapter with a credentials provider for email/password sign-in and JWT-backed sessions.
- Signup creates a `guest` membership by default, and admins can promote members from the Admin page.
- The protected app now routes through a single shared dashboard and section pages instead of per-club pages.
- Old multi-club routes such as `/clubs/[clubId]` and invite/join flows are not part of the final single-club app.
- Prisma 7 is configured through `prisma.config.ts`, with `DIRECT_URL` and `SHADOW_DATABASE_URL` normalized to `127.0.0.1` for local migration work.
- The final MVP pass verified signup, login, add book, create reading plan, schedule meeting, RSVP, create poll, vote, post announcement, and update club settings.
- Helpful references:
  - [Vercel environment variables](https://vercel.com/docs/environment-variables)
  - [Vercel Postgres and Marketplace storage guidance](https://vercel.com/docs/postgres)
  - [Prisma shadow database behavior](https://docs.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)
