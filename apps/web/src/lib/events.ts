import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem,
} from "viem";
import { isContractConfigured, publicConfig } from "./config";
import { escrowAbi } from "./contracts";
import { readLatestReview } from "./genlayer";
import type { EventStatus, MilestoneEvent, ReviewStatus } from "./types";

const createdEvent = parseAbiItem(
  "event EventCreated(uint256 indexed eventId, address indexed creator, address indexed assignee, uint64 deadline, string title, string termsCid)",
);

const eventStatuses: EventStatus[] = ["draft", "draft", "active", "completed", "refunded"];
const zeroHash = `0x${"0".repeat(64)}`;

export async function readMilestoneEvents(): Promise<MilestoneEvent[]> {
  if (!isContractConfigured) throw new Error("Base Sepolia escrow is not configured");
  const client = createPublicClient({
    chain: publicConfig.chain,
    transport: http(publicConfig.baseRpcUrl),
  });
  const fromBlock = BigInt(process.env.BASE_INDEX_START_BLOCK || 0);
  const logs = [];
  let toBlock = await client.getBlockNumber();
  while (toBlock >= fromBlock && logs.length < 100) {
    const chunkFrom = toBlock - fromBlock > 1_999n ? toBlock - 1_999n : fromBlock;
    const chunk = await client.getLogs({
      address: publicConfig.escrowAddress,
      event: createdEvent,
      fromBlock: chunkFrom,
      toBlock,
    });
    logs.push(...[...chunk].reverse());
    if (chunkFrom === fromBlock) break;
    toBlock = chunkFrom - 1n;
  }

  const output: MilestoneEvent[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (const log of logs.slice(0, 100)) {
    if (log.args.eventId === undefined) continue;
    const eventId = log.args.eventId;
    const record = await client.readContract({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getEvent",
      args: [eventId],
    });
    const milestones = [];
    for (let milestoneId = 0; milestoneId < record.milestoneCount; milestoneId += 1) {
      const milestone = await client.readContract({
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "getMilestone",
        args: [eventId, BigInt(milestoneId)],
      });
      const latestReview = await readLatestReview(eventId, milestoneId).catch(() => undefined);
      let reviewStatus: ReviewStatus = "not_submitted";
      if (milestone.paid) reviewStatus = "paid";
      else if (milestone.appealOpen) {
        reviewStatus =
          latestReview?.review_kind === "appeal"
            ? "finalized"
            : "appeal_resolution_queued";
      } else if (milestone.approvalProposed) reviewStatus = "challenge_window";
      else if (latestReview) reviewStatus = "finalized";

      milestones.push({
        id: milestoneId,
        criteria: milestone.criteria,
        amountUsdc: Number(formatUnits(milestone.amount, 6)),
        reviewStatus,
        reviewId:
          latestReview?.review_id ||
          (milestone.reviewId === zeroHash ? undefined : milestone.reviewId),
        decision: latestReview?.result.decision,
        explanation: latestReview?.result.explanation,
        citations: latestReview?.result.citations,
        resultHash:
          milestone.resultHash === zeroHash ? undefined : milestone.resultHash,
        challengeDeadline:
          milestone.challengeDeadline === 0n
            ? undefined
            : new Date(Number(milestone.challengeDeadline) * 1000).toISOString(),
        approvalProposed: milestone.approvalProposed,
        appealOpen: milestone.appealOpen,
        payoutReady:
          milestone.approvalProposed &&
          !milestone.appealOpen &&
          now >= Number(milestone.challengeDeadline),
      });
    }
    const block = log.blockNumber
      ? await client.getBlock({ blockNumber: log.blockNumber })
      : undefined;
    output.push({
      id: Number(eventId),
      title: record.title,
      creator: record.creator,
      assignee: record.assignee,
      deadline: new Date(Number(record.deadline) * 1000).toISOString(),
      status: eventStatuses[record.status] || "draft",
      termsCid: record.termsCid,
      createdAt: block
        ? new Date(Number(block.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      refundReady: record.status === 2 && now > Number(record.deadline),
      milestones,
    });
  }
  return output;
}
