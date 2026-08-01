import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSettlementCandidates, settleReview } = vi.hoisted(() => ({
  readSettlementCandidates: vi.fn(),
  settleReview: vi.fn(),
}));

vi.mock("./settlement-candidates", () => ({ readSettlementCandidates }));
vi.mock("./settlement", () => ({ settleReview }));

import { runSettlementAutomation } from "./automation";

const approvedMilestone = {
  eventId: 7,
  milestoneId: 0,
  minimumScore: 80,
  reviewId: "review_approved",
  reviewKind: "initial",
  decision: "approved",
  score: 95,
  approvalProposed: false,
  appealOpen: false,
  paid: false,
  payoutReady: false,
};

describe("runSettlementAutomation", () => {
  beforeEach(() => {
    readSettlementCandidates.mockReset();
    settleReview.mockReset();
    process.env.AUTOMATION_MAX_ACTIONS = "6";
  });

  it("settles a passing review without any browser state", async () => {
    readSettlementCandidates.mockResolvedValue([approvedMilestone]);
    settleReview.mockResolvedValue({ status: "paid" });

    await expect(runSettlementAutomation()).resolves.toEqual([
      expect.objectContaining({
        eventId: 7,
        milestoneId: 0,
        reviewId: "review_approved",
        action: "automatic-payout",
        status: "completed",
      }),
    ]);
    expect(settleReview).toHaveBeenCalledWith(
      "review_approved",
      "automatic-payout",
      7,
      0,
    );
  });

  it("releases a proposal whose challenge period has elapsed", async () => {
    readSettlementCandidates.mockResolvedValue([
      {
        ...approvedMilestone,
        approvalProposed: true,
        payoutReady: true,
      },
    ]);
    settleReview.mockResolvedValue({ taskId: "payout-task" });

    await runSettlementAutomation();
    expect(settleReview).toHaveBeenCalledWith(
      "review_approved",
      "payout",
      7,
      0,
    );
  });

  it("does not settle rejected, below-threshold, appealed, or paid milestones", async () => {
    readSettlementCandidates.mockResolvedValue([
      { ...approvedMilestone, decision: "rejected" },
      { ...approvedMilestone, milestoneId: 1, score: 79 },
      { ...approvedMilestone, milestoneId: 2, appealOpen: true },
      { ...approvedMilestone, milestoneId: 3, paid: true },
    ]);

    await expect(runSettlementAutomation()).resolves.toEqual([]);
    expect(settleReview).not.toHaveBeenCalled();
  });
});
