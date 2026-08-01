import { createPublicClient, fallback, http } from "viem";
import { publicConfig } from "./config";
import { escrowAbi } from "./contracts";
import { readLatestReview } from "./genlayer";

export type SettlementCandidate = {
  eventId: number;
  milestoneId: number;
  reviewId?: string;
  reviewKind?: "initial" | "appeal";
  decision?: "approved" | "rejected" | "inconclusive";
  score?: number;
  minimumScore: number;
  approvalProposed: boolean;
  appealOpen: boolean;
  paid: boolean;
  payoutReady: boolean;
};

function baseReadClient() {
  const urls = [
    publicConfig.baseRpcUrl,
    process.env.BASE_RPC_FALLBACK_URL ||
      "https://base-sepolia-rpc.publicnode.com",
  ].filter((url, index, all) => all.indexOf(url) === index);

  return createPublicClient({
    chain: publicConfig.chain,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          retryCount: 2,
          retryDelay: 500,
          timeout: 12_000,
        }),
      ),
    ),
  });
}

export async function readSettlementCandidates(options?: {
  eventLimit?: number;
}): Promise<SettlementCandidate[]> {
  const client = baseReadClient();
  const nextEventId = await client.readContract({
    address: publicConfig.escrowAddress,
    abi: escrowAbi,
    functionName: "nextEventId",
  });
  const eventLimit = Math.max(
    1,
    Math.min(250, options?.eventLimit || 75),
  );
  const firstEventId =
    nextEventId > BigInt(eventLimit) ? nextEventId - BigInt(eventLimit) : 1n;
  const eventIds = Array.from(
    { length: Number(nextEventId - firstEventId) },
    (_, index) => nextEventId - BigInt(index) - 1n,
  );
  if (eventIds.length === 0) return [];

  const eventRecords = await client.multicall({
    allowFailure: false,
    contracts: eventIds.map((eventId) => ({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getEvent" as const,
      args: [eventId],
    })),
  });
  const milestoneCalls = eventRecords.flatMap((event, eventIndex) =>
    event.status === 2
      ? Array.from({ length: Number(event.milestoneCount) }, (_, milestoneId) => ({
          eventId: eventIds[eventIndex],
          milestoneId,
        }))
      : [],
  );
  if (milestoneCalls.length === 0) return [];

  const milestones = await client.multicall({
    allowFailure: false,
    contracts: milestoneCalls.map(({ eventId, milestoneId }) => ({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getMilestone" as const,
      args: [eventId, BigInt(milestoneId)],
    })),
  });
  const now = BigInt(Math.floor(Date.now() / 1000));

  return Promise.all(
    milestones.map(async (milestone, index) => {
      const { eventId, milestoneId } = milestoneCalls[index];
      const latestReview = await readLatestReview(eventId, milestoneId).catch(
        () => undefined,
      );
      return {
        eventId: Number(eventId),
        milestoneId,
        reviewId: latestReview?.review_id,
        reviewKind: latestReview?.review_kind,
        decision: latestReview?.result.decision,
        score: latestReview?.result.score,
        minimumScore: Number(milestone.minimumScore),
        approvalProposed: milestone.approvalProposed,
        appealOpen: milestone.appealOpen,
        paid: milestone.paid,
        payoutReady:
          milestone.approvalProposed &&
          !milestone.appealOpen &&
          now >= milestone.challengeDeadline,
      };
    }),
  );
}
