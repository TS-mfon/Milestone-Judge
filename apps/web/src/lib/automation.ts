import { readMilestoneEvents } from "./events";
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
  const events = await readMilestoneEvents({ limit: 75 });
  const maximum = Math.max(
    1,
    Math.min(20, Number(process.env.AUTOMATION_MAX_ACTIONS || 6)),
  );
  const results: AutomationResult[] = [];

  for (const event of events) {
    if (event.status !== "active") continue;
    for (const milestone of event.milestones) {
      if (results.length >= maximum) return results;
      if (!milestone.reviewId || milestone.paidAt || milestone.appealOpen) continue;

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
          event.id,
          milestone.id,
        );
        results.push({
          eventId: event.id,
          milestoneId: milestone.id,
          reviewId: milestone.reviewId,
          action,
          status: "completed",
          detail,
        });
      } catch (error) {
        results.push({
          eventId: event.id,
          milestoneId: milestone.id,
          reviewId: milestone.reviewId,
          action,
          status: "failed",
          detail: error instanceof Error ? error.message : "Automation failed",
        });
      }
    }
  }
  return results;
}
