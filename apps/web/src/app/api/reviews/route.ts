import { NextResponse } from "next/server";
import { keccak256, stringToHex } from "viem";
import { verifyReviewSignature } from "@/lib/auth";
import { validateOnchainReview } from "@/lib/base";
import { readReview, submitGenLayerReview } from "@/lib/genlayer";
import { reviewRequestSchema } from "@/lib/review-schema";
import { consumeRateLimit, requestClientKey } from "@/lib/rate-limit";
import type { ReviewRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const rateLimit = consumeRateLimit(`review:${requestClientKey(request)}`, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many review requests. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const review = parsed.data as ReviewRequest;
  if (!(await verifyReviewSignature(review))) {
    return NextResponse.json({ error: "Invalid or expired wallet signature" }, { status: 401 });
  }
  try {
    const { milestone, canonical } = await validateOnchainReview(review);
    const canonicalReview: ReviewRequest = {
      ...review,
      criterion: canonical.criterion,
      criterionHash: canonical.criterionHash as `0x${string}`,
    };
    const digest = keccak256(
      stringToHex(
        JSON.stringify({
          kind: review.kind,
          eventId: review.eventId,
          milestoneId: review.milestoneId,
          requester: review.requester.toLowerCase(),
          criterionHash: canonical.criterionHash,
          evidenceStatement: review.evidenceStatement,
          evidenceLinks: review.evidenceLinks,
          appealContext: review.appealContext,
        }),
      ),
    );
    const reviewId = `review_${digest.slice(2)}`;
    const existing = await readReview(reviewId);
    if (existing) {
      return NextResponse.json({ id: reviewId, status: "finalized", review: existing });
    }
    const transactionHash = await submitGenLayerReview(
      reviewId,
      canonicalReview,
      Number(milestone.minimumScore),
    );
    return NextResponse.json(
      { id: reviewId, status: "submitted", transactionHash },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review submission failed" },
      { status: 409 },
    );
  }
}
