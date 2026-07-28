import {
  createPublicClient,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { publicConfig } from "./config";
import { escrowAbi } from "./contracts";
import { requireFinalizedReview } from "./genlayer";
import {
  relayAppealResolution,
  relayApprovalProposal,
  relayMilestonePayout,
  getRelayStatus,
} from "./oneshot";

export type SettlementAction =
  | "automatic-payout"
  | "proposal"
  | "payout"
  | "appeal-resolution";

const automaticSettlementDelay = 30;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRelay(taskId: string) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const status = await getRelayStatus(taskId);
    if (status.status === 200) return status;
    if (status.status === 400 || status.status === 500) {
      throw new Error(status.message || "Hosted 1Shot settlement failed");
    }
    await sleep(2_000);
  }
  throw new Error("Hosted 1Shot settlement did not confirm in time");
}

export async function settleReview(
  reviewId: string,
  action: SettlementAction,
  eventId: number,
  milestoneId: number,
) {
  const review = await requireFinalizedReview(reviewId);
  if (
    review.base_chain_id !== String(publicConfig.chain.id) ||
    review.escrow_address.toLowerCase() !== publicConfig.escrowAddress.toLowerCase() ||
    review.event_id !== String(eventId) ||
    review.milestone_id !== String(milestoneId)
  ) {
    throw new Error("GenLayer review does not match this Base milestone");
  }

  const client = createPublicClient({
    chain: publicConfig.chain,
    transport: http(publicConfig.baseRpcUrl),
  });
  const [event, milestone] = await Promise.all([
    client.readContract({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getEvent",
      args: [BigInt(eventId)],
    }),
    client.readContract({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getMilestone",
      args: [BigInt(eventId), BigInt(milestoneId)],
    }),
  ]);
  if (milestone.paid && action === "automatic-payout") {
    return { action, status: "paid" };
  }
  if (event.status !== 2) throw new Error("Base event is not active");
  if (milestone.paid) throw new Error("Milestone is already paid");

  const resultHash = keccak256(stringToHex(JSON.stringify(review.result)));
  if (action === "automatic-payout") {
    if (review.review_kind !== "initial" || review.result.decision !== "approved") {
      throw new Error("Only an approved initial review can release payment");
    }
    if (review.result.score < Number(milestone.minimumScore)) {
      throw new Error(
        `GenLayer score ${review.result.score} is below the required ${milestone.minimumScore}`,
      );
    }
    if (milestone.appealOpen) throw new Error("An appeal is open for this milestone");

    let proposal:
      | Awaited<ReturnType<typeof relayApprovalProposal>>
      | undefined;
    let currentMilestone = milestone;
    if (!currentMilestone.approvalProposed) {
      const challengeDeadline =
        Math.floor(Date.now() / 1000) + automaticSettlementDelay;
      if (BigInt(challengeDeadline) > event.deadline) {
        throw new Error("Event deadline is too close for automatic payout");
      }
      proposal = await relayApprovalProposal(
        reviewId,
        eventId,
        milestoneId,
        resultHash,
        review.result.score,
        challengeDeadline,
      );
      await waitForRelay(proposal.taskId);
      currentMilestone = await client.readContract({
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "getMilestone",
        args: [BigInt(eventId), BigInt(milestoneId)],
      });
    }

    if (currentMilestone.paid) {
      return { action, status: "paid", proposal };
    }
    if (!currentMilestone.approvalProposed || currentMilestone.appealOpen) {
      throw new Error("Milestone did not enter an eligible payout state");
    }

    const waitMilliseconds =
      Number(currentMilestone.challengeDeadline) * 1000 - Date.now() + 3_000;
    if (waitMilliseconds > 0) await sleep(waitMilliseconds);

    const payout = await relayMilestonePayout(
      reviewId,
      eventId,
      milestoneId,
      currentMilestone.resultHash,
    );
    const confirmed = await waitForRelay(payout.taskId);
    return {
      action,
      status: "paid",
      proposal,
      payout,
      transactionHash: confirmed.hash,
    };
  }

  if (action === "proposal") {
    if (review.review_kind !== "initial" || review.result.decision !== "approved") {
      throw new Error("Only an approved initial review can propose payment");
    }
    if (review.result.score < Number(milestone.minimumScore)) {
      throw new Error(
        `GenLayer score ${review.result.score} is below the required ${milestone.minimumScore}`,
      );
    }
    if (milestone.approvalProposed || milestone.appealOpen) {
      throw new Error("A Base approval or appeal is already active");
    }
    const challengeDeadline = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    if (BigInt(challengeDeadline) > event.deadline) {
      throw new Error("Event deadline is too close for the challenge window");
    }
    return {
      action,
      resultHash,
      ...(await relayApprovalProposal(
        reviewId,
        eventId,
        milestoneId,
        resultHash,
        review.result.score,
        challengeDeadline,
      )),
    };
  }

  if (action === "appeal-resolution") {
    if (review.review_kind !== "appeal" || !milestone.appealOpen) {
      throw new Error("No matching Base appeal is open");
    }
    return {
      action,
      resultHash,
      ...(await relayAppealResolution(
        reviewId,
        eventId,
        milestoneId,
        review.result.decision === "approved" &&
          review.result.score >= Number(milestone.minimumScore),
        review.result.score,
        resultHash,
      )),
    };
  }

  if (!milestone.approvalProposed || milestone.appealOpen) {
    throw new Error("Milestone is not eligible for payout");
  }
  if (BigInt(Math.floor(Date.now() / 1000)) < milestone.challengeDeadline) {
    throw new Error("Challenge window is still open");
  }
  return {
    action,
    resultHash,
    ...(await relayMilestonePayout(
      reviewId,
      eventId,
      milestoneId,
      milestone.resultHash,
    )),
  };
}
