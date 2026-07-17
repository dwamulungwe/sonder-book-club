import { getEmailProvider } from "@/features/email/provider";
import { processVerifiedEmailDeliveryEvent } from "@/features/email/webhook-processor";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

async function readBoundedBody(request: Request) {
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function POST(request: Request) {
  const lengthHeader = request.headers.get("content-length");
  const contentLength =
    lengthHeader && /^\d+$/.test(lengthHeader)
      ? Number.parseInt(lengthHeader, 10)
      : null;

  if (
    lengthHeader &&
    (!/^\d+$/.test(lengthHeader) ||
      !Number.isSafeInteger(contentLength) ||
      contentLength === null)
  ) {
    return json({ ok: false, error: "malformed_webhook" }, 400);
  }

  if (contentLength !== null && contentLength > MAX_WEBHOOK_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  let rawBody: string;
  try {
    const body = await readBoundedBody(request);

    if (!body) {
      return json({ ok: false, error: "payload_too_large" }, 413);
    }

    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(body);
    JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "malformed_webhook" }, 400);
  }

  const provider = await getEmailProvider();
  if (!provider.isConfigured || provider.name !== "resend") {
    return json({ ok: false, error: "provider_disabled" }, 503);
  }

  const parsed = await provider.parseWebhook({
    rawBody,
    headers: request.headers,
  });

  if (parsed.status === "disabled") {
    return json({ ok: false, error: "provider_disabled" }, 503);
  }

  if (parsed.status === "failed") {
    return json(
      { ok: false, error: parsed.error },
      parsed.error === "malformed_webhook" ? 400 : 401,
    );
  }

  try {
    const result = await processVerifiedEmailDeliveryEvent(parsed.event);
    return json(
      {
        ok: true,
        duplicate: result.duplicate,
        reviewRequired: result.reviewRequired,
      },
      200,
    );
  } catch {
    return json({ ok: false, error: "temporary_processing_failure" }, 503);
  }
}
