import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readContract,
  requireFinalizedReview,
  relayApprovalProposal,
  relayMilestonePayout,
  relayAppealResolution,
} = vi.hoisted(() => ({
  readContract: vi.fn(),
  requireFinalizedReview: vi.fn(),
  relayApprovalProposal: vi.fn(),
  relayMilestonePayout: vi.fn(),
  relayAppealResolution: vi.fn(),
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual, createPublicClient: () => ({ readContract }), http: vi.fn() };
});
vi.mock("./config", () => ({
  publicConfig: {
    chain: { id: 84532 },
    baseRpcUrl: "https://sepolia.base.org",
    escrowAddress: "0x1111111111111111111111111111111111111111",
  },
}));
vi.mock("./genlayer", () => ({ requireFinalizedReview }));
vi.mock("./oneshot", () => ({
  relayApprovalProposal,
  relayMilestonePayout,
  relayAppealResolution,
  getRelayStatus: vi.fn(),
}));

import { settleReview } from "./settlement";

const criterion = "Publish the production launch page";
const criterionHash =
  "0xdffdd6c47fabb1cc2f3bb8b2c3664debd3d4a0feec52c2cd1261858910fd845a";

describe("settlement criterion binding", () => {
  beforeEach(() => {
    readContract.mockReset();
    requireFinalizedReview.mockReset();
    relayApprovalProposal.mockReset();
    relayMilestonePayout.mockReset();
    relayAppealResolution.mockReset();
    readContract.mockImplementation(({ functionName }: { functionName: string }) =>
      functionName === "getEvent"
        ? { status: 2 }
        : {
            paid: false,
            criteria: criterion,
            criteriaHash: criterionHash,
            minimumScore: 80n,
            appealOpen: false,
            approvalProposed: false,
          },
    );
  });

  it("rejects a GenLayer review with substituted criterion before any relay call", async () => {
    requireFinalizedReview.mockResolvedValue({
      base_chain_id: "84532",
      escrow_address: "0x1111111111111111111111111111111111111111",
      event_id: "1",
      milestone_id: "0",
      criterion: `${criterion} substituted`,
      criterion_hash: criterionHash,
      review_kind: "initial",
      result: { decision: "approved", score: 95 },
    });

    await expect(settleReview("review-1", "automatic-payout", 1, 0)).rejects.toThrow(
      "GenLayer criterion does not match the funded Base milestone",
    );
    expect(relayApprovalProposal).not.toHaveBeenCalled();
    expect(relayMilestonePayout).not.toHaveBeenCalled();
  });
});
