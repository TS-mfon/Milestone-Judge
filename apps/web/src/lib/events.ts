import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { isContractConfigured, publicConfig } from "./config";
import { escrowAbi } from "./contracts";
import { readLatestReview } from "./genlayer";
import type { EventStatus, MilestoneEvent, ReviewStatus } from "./types";

const createdEvent = parseAbiItem(
  "event EventCreated(uint256 indexed eventId, address indexed creator, address indexed assignee, uint64 deadline, uint32 challengePeriod, string title, string termsCid)",
);
const milestoneReleased = parseAbiItem(
  "event MilestoneReleased(uint256 indexed eventId, uint256 indexed milestoneId, bytes32 indexed reviewId, bytes32 resultHash, address assignee, uint256 amount)",
);

const eventStatuses: EventStatus[] = ["draft", "draft", "active", "completed", "refunded"];
const zeroHash = `0x${"0".repeat(64)}`;

export async function readMilestoneEvents(options?: {
  wallet?: string;
  role?: "assigned" | "created" | "related";
  limit?: number;
  beforeBlock?: bigint;
}): Promise<MilestoneEvent[]> {
  if (!isContractConfigured) throw new Error("Base Sepolia escrow is not configured");
  const client = createPublicClient({
    chain: publicConfig.chain,
    transport: http(publicConfig.baseRpcUrl),
  });
  const fromBlock = BigInt(process.env.BASE_INDEX_START_BLOCK || 0);
  const latestBlock = await client.getBlockNumber();
  const limit = Math.max(1, Math.min(100, options?.limit || 50));
  const wallet = options?.wallet as Address | undefined;
  const logs: Awaited<ReturnType<typeof client.getLogs<typeof createdEvent>>> = [];
  let toBlock =
    options?.beforeBlock && options.beforeBlock < latestBlock
      ? options.beforeBlock
      : latestBlock;
  while (toBlock >= fromBlock && logs.length < limit) {
    const chunkFrom = toBlock - fromBlock > 1_999n ? toBlock - 1_999n : fromBlock;
    const baseQuery = {
      address: publicConfig.escrowAddress,
      event: createdEvent,
      fromBlock: chunkFrom,
      toBlock,
    } as const;
    if (wallet && options?.role === "assigned") {
      logs.push(...await client.getLogs({ ...baseQuery, args: { assignee: wallet } }));
    } else if (wallet && options?.role === "created") {
      logs.push(...await client.getLogs({ ...baseQuery, args: { creator: wallet } }));
    } else if (wallet) {
      const [created, assigned] = await Promise.all([
        client.getLogs({ ...baseQuery, args: { creator: wallet } }),
        client.getLogs({ ...baseQuery, args: { assignee: wallet } }),
      ]);
      const unique = new Map(
        [...created, ...assigned].map((log) => [
          `${log.transactionHash}:${log.logIndex}`,
          log,
        ]),
      );
      logs.push(...unique.values());
    } else {
      logs.push(...await client.getLogs(baseQuery));
    }
    if (chunkFrom === fromBlock) break;
    toBlock = chunkFrom - 1n;
  }
  logs.sort((left, right) =>
    left.blockNumber === right.blockNumber
      ? Number((right.logIndex || 0) - (left.logIndex || 0))
      : left.blockNumber > right.blockNumber
        ? -1
        : 1,
  );
  const selectedLogs = logs.slice(0, limit);

  const releaseLogs: Array<{
    args: { eventId?: bigint; milestoneId?: bigint };
    blockNumber: bigint | null;
    transactionHash: Hex | null;
  }> = [];
  let releaseToBlock = latestBlock;
  while (releaseToBlock >= fromBlock && releaseLogs.length < 500) {
    const chunkFrom =
      releaseToBlock - fromBlock > 1_999n ? releaseToBlock - 1_999n : fromBlock;
    const chunk = await client.getLogs({
      address: publicConfig.escrowAddress,
      event: milestoneReleased,
      fromBlock: chunkFrom,
      toBlock: releaseToBlock,
    });
    releaseLogs.push(...[...chunk].reverse());
    if (chunkFrom === fromBlock) break;
    releaseToBlock = chunkFrom - 1n;
  }
  const releaseByMilestone = new Map(
    releaseLogs
      .filter(
        (log) =>
          log.args.eventId !== undefined && log.args.milestoneId !== undefined,
      )
      .map((log) => [
        `${log.args.eventId}:${log.args.milestoneId}`,
        {
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash || undefined,
        },
      ]),
  );
  const blockTimestamps = new Map<bigint, string>();

  const eventRecords = await client.multicall({
    allowFailure: false,
    contracts: selectedLogs.map((log) => ({
      address: publicConfig.escrowAddress,
      abi: escrowAbi,
      functionName: "getEvent" as const,
      args: [log.args.eventId!],
    })),
  });
  const milestoneCalls = eventRecords.flatMap((record, eventIndex) =>
    Array.from({ length: Number(record.milestoneCount) }, (_, milestoneId) => ({
      eventIndex,
      milestoneId,
      call: {
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "getMilestone" as const,
        args: [selectedLogs[eventIndex].args.eventId!, BigInt(milestoneId)],
      },
    })),
  );
  const milestoneRecords = await client.multicall({
    allowFailure: false,
    contracts: milestoneCalls.map((item) => item.call),
  });
  const milestonesByEvent = new Map<number, Array<{
    id: number;
    record: (typeof milestoneRecords)[number];
  }>>();
  milestoneRecords.forEach((record, index) => {
    const call = milestoneCalls[index];
    const current = milestonesByEvent.get(call.eventIndex) || [];
    current.push({ id: call.milestoneId, record });
    milestonesByEvent.set(call.eventIndex, current);
  });

  const relevantBlocks = new Set<bigint>();
  for (const log of selectedLogs) relevantBlocks.add(log.blockNumber);
  for (const release of releaseLogs) {
    if (release.blockNumber !== null) relevantBlocks.add(release.blockNumber);
  }
  await Promise.all(
    [...relevantBlocks].map(async (blockNumber) => {
      const block = await client.getBlock({ blockNumber });
      blockTimestamps.set(
        blockNumber,
        new Date(Number(block.timestamp) * 1000).toISOString(),
      );
    }),
  );

  const output: MilestoneEvent[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (let eventIndex = 0; eventIndex < selectedLogs.length; eventIndex += 1) {
    const log = selectedLogs[eventIndex];
    if (log.args.eventId === undefined) continue;
    const eventId = log.args.eventId;
    const record = eventRecords[eventIndex];
    const milestones = [];
    for (const item of milestonesByEvent.get(eventIndex) || []) {
      const milestoneId = item.id;
      const milestone = item.record;
      const release = releaseByMilestone.get(`${eventId}:${milestoneId}`);
      const paidAt =
        release?.blockNumber !== null && release?.blockNumber !== undefined
          ? blockTimestamps.get(release.blockNumber)
          : undefined;
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
        minimumScore: Number(milestone.minimumScore),
        approvedScore:
          milestone.approvedScore === 0 ? undefined : Number(milestone.approvedScore),
        reviewStatus,
        reviewId:
          latestReview?.review_id ||
          (milestone.reviewId === zeroHash ? undefined : milestone.reviewId),
        reviewKind: latestReview?.review_kind,
        decision: latestReview?.result.decision,
        score: latestReview?.result.score,
        review: latestReview?.result.review,
        explanation: latestReview?.result.explanation,
        strengths: latestReview?.result.strengths,
        improvements: latestReview?.result.improvements,
        suggestions: latestReview?.result.suggestions,
        citations: latestReview?.result.citations,
        evidenceGaps: latestReview?.result.evidence_gaps,
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
        paidAt,
        paymentTransactionHash: release?.transactionHash,
      });
    }
    const normalizedWallet = options?.wallet?.toLowerCase();
    const include =
      !normalizedWallet ||
      (options?.role === "assigned" &&
        record.assignee.toLowerCase() === normalizedWallet) ||
      (options?.role === "created" &&
        record.creator.toLowerCase() === normalizedWallet) ||
      (options?.role !== "assigned" &&
        options?.role !== "created" &&
        (record.creator.toLowerCase() === normalizedWallet ||
          record.assignee.toLowerCase() === normalizedWallet));
    if (!include) continue;
    output.push({
      id: Number(eventId),
      title: record.title,
      creator: record.creator,
      assignee: record.assignee,
      deadline: new Date(Number(record.deadline) * 1000).toISOString(),
      status: eventStatuses[record.status] || "draft",
      termsCid: record.termsCid,
      challengePeriodSeconds: Number(record.challengePeriod),
      createdAt: blockTimestamps.get(log.blockNumber) || new Date().toISOString(),
      createdBlockNumber: log.blockNumber.toString(),
      refundReady: record.status === 2 && now > Number(record.deadline),
      milestones,
    });
  }
  return output;
}
