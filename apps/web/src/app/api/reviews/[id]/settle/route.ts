import { NextResponse } from "next/server";
import { z } from "zod";
import { settleReview } from "@/lib/settlement";
import { consumeRateLimit, requestClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  action: z.enum(["automatic-payout", "proposal", "payout", "appeal-resolution"]),
  eventId: z.number().int().positive(),
  milestoneId: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settlement request" }, { status: 400 });
  }
  const { id } = await context.params;
  const clientLimit = consumeRateLimit(`settle-client:${requestClientKey(request)}`, {
    limit: 6,
    windowMs: 60_000,
  });
  const reviewLimit = consumeRateLimit(`settle-review:${id}`, {
    limit: 2,
    windowMs: 60_000,
  });
  const rateLimit = !clientLimit.allowed ? clientLimit : reviewLimit;
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Settlement is already being processed. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  try {
    return NextResponse.json(
      await settleReview(
        id,
        parsed.data.action,
        parsed.data.eventId,
        parsed.data.milestoneId,
      ),
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Settlement failed" },
      { status: 409 },
    );
  }
}
