import { NextResponse } from "next/server";
import { keccak256, stringToHex } from "viem";
import { verifyReviewSignature } from "@/lib/auth";
import { validateOnchainReview } from "@/lib/base";
import { submitGenLayerReview } from "@/lib/genlayer";
import { reviewRequestSchema } from "@/lib/review-schema";
import type { ReviewRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = reviewRequestSchema.safeParse(await request.json());
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
    await validateOnchainReview(review);
    const digest = keccak256(
      stringToHex(
        JSON.stringify({
          kind: review.kind,
          eventId: review.eventId,
          milestoneId: review.milestoneId,
          attemptId: review.attemptId,
          requester: review.requester.toLowerCase(),
          criterionHash: review.criterionHash,
          evidenceStatement: review.evidenceStatement,
          evidenceLinks: review.evidenceLinks,
          appealContext: review.appealContext,
          nonce: review.nonce,
        }),
      ),
    );
    const reviewId = `review_${digest.slice(2)}`;
    const transactionHash = await submitGenLayerReview(reviewId, review);
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
