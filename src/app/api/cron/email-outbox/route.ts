import { authorizeCronRequest } from "@/features/email/cron-auth";
import { processEmailOutbox } from "@/features/email/outbox-processor";
import { getEmailProviderConfig } from "@/features/email/server-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};
const PROCESSING_BUDGET_MS = 50_000;

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);

  if (authorization === "misconfigured") {
    return json({ ok: false, error: "cron_not_configured" }, 503);
  }

  if (authorization === "unauthorized") {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const config = getEmailProviderConfig();
  const batchSize = config.enabled
    ? Math.max(
        1,
        Math.min(
          config.batchSize,
          Math.floor(PROCESSING_BUDGET_MS / config.requestTimeoutMs),
        ),
      )
    : config.batchSize;
  const summary = await processEmailOutbox(batchSize);

  return json(
    {
      ok: true,
      claimed: summary.claimed,
      accepted: summary.accepted,
      retryScheduled: summary.retryScheduled,
      permanentlyFailed: summary.permanentlyFailed,
      suppressed: summary.suppressed,
      reviewRequired: summary.reviewRequired,
      skipped: summary.skipped,
      disabled: summary.disabled,
    },
    200,
  );
}
