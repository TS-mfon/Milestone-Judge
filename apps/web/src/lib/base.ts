import { createPublicClient, http } from "viem";
import { publicConfig, isContractConfigured } from "./config";
import { escrowAbi } from "./contracts";
import type { ReviewRequest } from "./types";

export async function validateOnchainReview(request: ReviewRequest) {
  if (!isContractConfigured) return;
  const client = createPublicClient({
    chain: publicConfig.chain,
    transport: http(publicConfig.baseRpcUrl),
  });
  const [event, milestone] = await Promise.all([
    client.readContract({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getEvent",
      args: [BigInt(request.eventId)],
    }),
    client.readContract({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getMilestone",
      args: [BigInt(request.eventId), BigInt(request.milestoneId)],
    }),
  ]);

  if (event.assignee.toLowerCase() !== request.assignee.toLowerCase()) {
    throw new Error("Request assignee does not match the funded event");
  }
  if (event.status !== 2) throw new Error("Event is not active");
  if (milestone.paid) throw new Error("Milestone is already paid");
  if (request.kind === "initial" && event.assignee.toLowerCase() !== request.requester.toLowerCase()) {
    throw new Error("Only the event assignee may request an initial review");
  }
  if (request.kind === "initial" && milestone.approvalProposed) {
    throw new Error("A review has already approved this milestone and is in its challenge window");
  }
  if (request.kind === "initial" && milestone.appealOpen) {
    throw new Error("An appeal is already open for this milestone");
  }
  if (request.kind === "appeal" && event.creator.toLowerCase() !== request.requester.toLowerCase()) {
    throw new Error("Only the event creator may request an appeal review");
  }
  if (request.kind === "appeal" && !milestone.appealOpen) {
    throw new Error("The on-chain appeal is not open");
  }
  if (milestone.criteriaHash.toLowerCase() !== request.criterionHash.toLowerCase()) {
    throw new Error("Criterion does not match the funded milestone");
  }
  if (
    request.kind === "initial" &&
    event.deadline <= BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  ) {
    throw new Error("Not enough time remains to verify and settle this milestone");
  }
}
