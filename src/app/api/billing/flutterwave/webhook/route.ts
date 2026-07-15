import { processFlutterwaveWebhook } from "@/features/billing/online-payments";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;

function headersToRecord(headers: Headers) {
  const record: Record<string, string> = {};

  headers.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

export async function POST(request: Request) {
  const lengthHeader = request.headers.get("content-length");
  const contentLength = lengthHeader ? Number.parseInt(lengthHeader, 10) : null;

  if (
    lengthHeader &&
    (!Number.isSafeInteger(contentLength) || contentLength === null || contentLength < 0)
  ) {
    return Response.json(
      { ok: false, error: "malformed_webhook" },
      { status: 400 },
    );
  }

  if (contentLength !== null && contentLength > MAX_WEBHOOK_BYTES) {
    return Response.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 },
    );
  }

  let rawBody: string;

  try {
    const body = await request.arrayBuffer();

    if (body.byteLength > MAX_WEBHOOK_BYTES) {
      return Response.json(
        { ok: false, error: "payload_too_large" },
        { status: 413 },
      );
    }

    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return Response.json(
      { ok: false, error: "malformed_webhook" },
      { status: 400 },
    );
  }

  const result = await processFlutterwaveWebhook({
    rawBody,
    headers: headersToRecord(request.headers),
  });

  return Response.json(result.body, { status: result.status });
}
