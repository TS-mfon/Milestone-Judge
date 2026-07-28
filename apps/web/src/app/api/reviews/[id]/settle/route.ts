import { NextResponse } from "next/server";
import { z } from "zod";
import { settleReview } from "@/lib/settlement";

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
