import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import { getServerConfig, publicConfig } from "./config";
import type { ReviewRequest, StoredReview } from "./types";

function chain() {
  return getServerConfig().genlayerNetwork === "testnet-bradbury"
    ? testnetBradbury
    : studionet;
}

function readClient() {
  return createClient({ chain: chain() });
}

function writeClient() {
  const privateKey = getServerConfig().platformPrivateKey;
  if (!privateKey) throw new Error("PLATFORM_PRIVATE_KEY is not configured");
  return createClient({
    chain: chain(),
    account: createAccount(privateKey as `0x${string}`),
  });
}

export async function submitGenLayerReview(reviewId: string, request: ReviewRequest) {
  return writeClient().writeContract({
    address: publicConfig.genlayerContractAddress,
    functionName: "request_review",
    args: [
      reviewId,
      request.kind,
      String(publicConfig.chain.id),
      publicConfig.escrowAddress,
      String(request.eventId),
      String(request.milestoneId),
      String(request.attemptId),
      request.assignee,
      request.criterion,
      request.criterionHash,
      request.evidenceStatement,
      JSON.stringify(request.evidenceLinks),
      request.appealContext,
    ],
    value: 0n,
  }) as Promise<`0x${string}`>;
}

export async function readReview(reviewId: string): Promise<StoredReview | undefined> {
  const stored = await readClient().readContract({
    address: publicConfig.genlayerContractAddress,
    functionName: "get_review",
    args: [reviewId],
  });
  if (typeof stored !== "string" || !stored) return undefined;
  return JSON.parse(stored) as StoredReview;
}

export async function readLatestReview(
  eventId: bigint,
  milestoneId: number,
): Promise<StoredReview | undefined> {
  const client = readClient();
  const reviewId = await client.readContract({
    address: publicConfig.genlayerContractAddress,
    functionName: "get_latest_review_id",
    args: [
      String(publicConfig.chain.id),
      publicConfig.escrowAddress,
      String(eventId),
      String(milestoneId),
    ],
  });
  if (typeof reviewId !== "string" || !reviewId) return undefined;
  return readReview(reviewId);
}

export async function readReviewTransaction(hash: `0x${string}`) {
  const transaction = await readClient().getTransaction({
    hash: hash as `0x${string}` & { length: 66 },
  });
  return {
    status: transaction.statusName || TransactionStatus.PENDING,
    executionResult: transaction.txExecutionResultName || ExecutionResult.NOT_VOTED,
  };
}

export async function requireFinalizedReview(reviewId: string) {
  const review = await readReview(reviewId);
  if (!review) throw new Error("GenLayer review is not finalized yet");
  return review;
}
