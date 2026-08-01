import { readSettlementCandidates } from "./settlement-candidates";
import { settleReview, type SettlementAction } from "./settlement";

type AutomationResult = {
  eventId: number;
  milestoneId: number;
  reviewId: string;
  action: SettlementAction;
  status: "completed" | "failed";
  detail: unknown;
};

export async function runSettlementAutomation(): Promise<AutomationResult[]> {
  const candidates = await readSettlementCandidates({ eventLimit: 75 });
  const maximum = Math.max(
    1,
    Math.min(20, Number(process.env.AUTOMATION_MAX_ACTIONS || 6)),
  );
  const results: AutomationResult[] = [];

  for (const milestone of candidates) {
    if (results.length >= maximum) return results;
    if (!milestone.reviewId || milestone.paid || milestone.appealOpen) continue;

    let action: SettlementAction | undefined;
    if (
      milestone.reviewKind === "initial" &&
      milestone.decision === "approved" &&
      (milestone.score || 0) >= milestone.minimumScore
    ) {
      action = milestone.approvalProposed
        ? milestone.payoutReady
          ? "payout"
          : undefined
        : "automatic-payout";
    }
    if (!action) continue;

    try {
      const detail = await settleReview(
        milestone.reviewId,
        action,
        milestone.eventId,
        milestone.milestoneId,
      );
      results.push({
        eventId: milestone.eventId,
        milestoneId: milestone.milestoneId,
        reviewId: milestone.reviewId,
        action,
        status: "completed",
        detail,
      });
    } catch (error) {
      results.push({
        eventId: milestone.eventId,
        milestoneId: milestone.milestoneId,
        reviewId: milestone.reviewId,
        action,
        status: "failed",
        detail: error instanceof Error ? error.message : "Automation failed",
      });
    }
  }
  return results;
}
