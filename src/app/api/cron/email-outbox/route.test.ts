import assert from "node:assert/strict";
import test from "node:test";

import { authorizeCronRequest } from "@/features/email/cron-auth";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("cron authorization fails closed when CRON_SECRET is missing", () => {
  const request = new Request("http://localhost/api/cron/email-outbox", {
    headers: { authorization: "Bearer anything" },
  });
  assert.equal(authorizeCronRequest(request, undefined), "misconfigured");
});

test("cron authorization rejects invalid credentials and accepts exact Bearer credentials", () => {
  const invalid = new Request("http://localhost/api/cron/email-outbox", {
    headers: { authorization: "Bearer wrong" },
  });
  const valid = new Request("http://localhost/api/cron/email-outbox", {
    headers: { authorization: "Bearer unit-test-cron-secret" },
  });

  assert.equal(
    authorizeCronRequest(invalid, "unit-test-cron-secret"),
    "unauthorized",
  );
  assert.equal(
    authorizeCronRequest(valid, "unit-test-cron-secret"),
    "authorized",
  );
});

async function getRoute(request: Request) {
  process.env.DATABASE_URL ??=
    "postgresql://user:pass@localhost:5432/bookclub_test";
  const route = await import("@/app/api/cron/email-outbox/route");
  return route.GET(request);
}

test("cron route returns no-store 503 when secret configuration is absent", async () => {
  delete process.env.CRON_SECRET;
  const response = await getRoute(
    new Request("http://localhost/api/cron/email-outbox"),
  );

  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "cron_not_configured",
  });
});

test("cron route returns no-store 401 for an invalid secret", async () => {
  process.env.CRON_SECRET = "unit-test-cron-secret";
  const response = await getRoute(
    new Request("http://localhost/api/cron/email-outbox", {
      headers: { authorization: "Bearer wrong" },
    }),
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "unauthorized",
  });
});
