# Production Deployment Checklist

Use this checklist before promoting Sonder Book Club to a hosted environment.

## 1. Environment Variables

Confirm these variables are set in the target environment:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`

Recommended when running Prisma CLI commands against the same environment:

- `DIRECT_URL`

Only needed for local or CI `prisma migrate dev` workflows:

- `SHADOW_DATABASE_URL`

## 2. Hosted PostgreSQL Wiring

1. Use the hosted provider's runtime or pooled PostgreSQL connection string for `DATABASE_URL`.
2. Use the hosted provider's direct PostgreSQL connection string for `DIRECT_URL` if one is available.
3. Preserve provider-specific query parameters such as `sslmode=require`.
4. Do not replace a hosted hostname with `localhost` or `127.0.0.1`.

## 3. Database Readiness

1. Confirm the production database exists.
2. Confirm the app user has permission to connect and run application queries.
3. Apply committed migrations with:

   ```bash
   npx prisma migrate deploy
   ```

4. Seed demo data only if you explicitly want a populated hosted demo environment:

   ```bash
   npm run db:seed
   ```

## 4. Application Validation

Run these checks before deployment:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## 5. Post-Deploy Smoke Test

1. Open `/login`.
2. Sign in with a valid seeded or production account.
3. Load `/dashboard`, `/books`, `/reading-plan`, `/meetings`, `/voting`, `/announcements`, `/members`, and `/admin`.
4. Confirm the club profile loads from the hosted database.
5. Confirm one safe write action succeeds, such as publishing an announcement or updating a non-critical club field.
6. Log out and sign back in to confirm sessions behave correctly in the hosted environment.

## 6. Sign-Off

Mark the deployment ready only when:

- required environment variables are present
- migrations completed successfully
- build checks passed
- login works in the hosted environment
- read and write flows succeed against the hosted PostgreSQL database
