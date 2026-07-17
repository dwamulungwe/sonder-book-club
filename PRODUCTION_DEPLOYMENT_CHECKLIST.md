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

## 7. Email Delivery Readiness (Not Yet Active)

Do not enable Production email delivery until Preview has passed a controlled
end-to-end test.

1. Create the Resend account and choose a dedicated sending subdomain where
   appropriate.
2. Add and verify the required SPF and DKIM DNS records. Add DMARC only according
   to the deployment policy after SPF/DKIM are behaving as expected.
3. Create a sending-only API key with the minimum available scope.
4. Configure the sender identity and the verified HTTPS webhook endpoint for
   sent, delivered, delivery-delayed, failed, bounced, complained, and suppressed
   events.
5. Configure Preview-scoped server variables: `SONDER_EMAIL_PROVIDER`,
   `SONDER_EMAIL_FROM`, optional `SONDER_EMAIL_REPLY_TO`, `SONDER_APP_BASE_URL`,
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SIGNING_SECRET`, and `CRON_SECRET`.
6. Apply the committed Change Set 8 migration chain with the deployment-safe
   migration workflow before exercising delivery. Do not use `prisma db push`.
7. Perform one controlled Preview delivery and inspect accepted, delivered,
   bounced, complaint, duplicate-webhook, and suppression behaviour.
8. Confirm the Vercel account plan and desired latency before adding a
   `vercel.json` cron schedule. Vercel Cron runs only on Production deployments.
9. Add monitoring for queue age, retry volume, uncertain/review-required jobs,
   permanent failures, webhook failures, complaints, and suppression growth.
10. Enable Production variables only after Preview passes. Domain verification,
    webhook registration, scheduling, and Production enablement are not part of
    Change Set 8 implementation.
