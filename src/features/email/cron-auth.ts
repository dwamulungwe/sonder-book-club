import { timingSafeEqual } from "node:crypto";

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    const padded = Buffer.alloc(leftBuffer.length);
    rightBuffer.copy(padded, 0, 0, Math.min(rightBuffer.length, padded.length));
    timingSafeEqual(leftBuffer, padded);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeCronRequest(
  request: Request,
  cronSecret = process.env.CRON_SECRET?.trim(),
) {
  if (!cronSecret) {
    return "misconfigured" as const;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return constantTimeEqual(authorization, `Bearer ${cronSecret}`)
    ? ("authorized" as const)
    : ("unauthorized" as const);
}
