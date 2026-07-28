import { NextResponse } from "next/server";
import { readReview, readReviewTransaction } from "@/lib/genlayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const review = await readReview(id);
    if (review) return NextResponse.json({ status: "finalized", review });
    const transactionHash = new URL(request.url).searchParams.get("transactionHash");
    if (!transactionHash || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      return NextResponse.json({ status: "pending" });
    }
    const transaction = await readReviewTransaction(transactionHash as `0x${string}`);
    return NextResponse.json({ status: transaction.status, transaction });
  } catch (error) {
    return NextResponse.json(
      {
        status: "submitted",
        error: error instanceof Error ? error.message : "Unable to read GenLayer review",
      },
      { status: 202 },
    );
  }
}
