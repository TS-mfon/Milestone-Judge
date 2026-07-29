import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMilestoneEvents, settleReview } = vi.hoisted(() => ({
  readMilestoneEvents: vi.fn(),
  settleReview: vi.fn(),
}));

vi.mock("./events", () => ({ readMilestoneEvents }));
vi.mock("./settlement", () => ({ settleReview }));

import { runSettlementAutomation } from "./automation";

const approvedMilestone = {
  id: 0,
  criteria: "Publish the release",
  amountUsdc: 10,
  minimumScore: 80,
  approvedScore: 95,
  reviewStatus: "finalized",
  reviewId: "review_approved",
  reviewKind: "initial",
  decision: "approved",
  score: 95,
  approvalProposed: false,
  appealOpen: false,
  payoutReady: false,
};

const activeEvent = {
  id: 7,
  title: "Release",
  creator: "0x1111111111111111111111111111111111111111",
  assignee: "0x2222222222222222222222222222222222222222",
  deadline: "2030-01-01T00:00:00.000Z",
  status: "active",
  termsCid: "https://write.as/release-terms",
  challengePeriodSeconds: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  milestones: [approvedMilestone],
};

describe("runSettlementAutomation", () => {
  beforeEach(() => {
    readMilestoneEvents.mockReset();
    settleReview.mockReset();
    process.env.AUTOMATION_MAX_ACTIONS = "6";
  });

  it("settles a passing review without any browser state", async () => {
    readMilestoneEvents.mockResolvedValue([activeEvent]);
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
    readMilestoneEvents.mockResolvedValue([
      {
        ...activeEvent,
        milestones: [
          {
            ...approvedMilestone,
            approvalProposed: true,
            payoutReady: true,
            reviewStatus: "challenge_window",
          },
        ],
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
    readMilestoneEvents.mockResolvedValue([
      {
        ...activeEvent,
        milestones: [
          { ...approvedMilestone, decision: "rejected" },
          { ...approvedMilestone, id: 1, score: 79 },
          { ...approvedMilestone, id: 2, appealOpen: true },
          { ...approvedMilestone, id: 3, paidAt: "2026-01-02T00:00:00.000Z" },
        ],
      },
    ]);

    await expect(runSettlementAutomation()).resolves.toEqual([]);
    expect(settleReview).not.toHaveBeenCalled();
  });
});
