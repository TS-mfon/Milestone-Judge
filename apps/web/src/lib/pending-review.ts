export interface PendingReview {
  id: string;
  transactionHash: string;
  kind: "initial" | "appeal";
  eventId: number;
  milestoneId: number;
  createdAt: number;
}

function key(kind: "initial" | "appeal", eventId: number, milestoneId: number) {
  return `milestone-judge:pending:${kind}:${eventId}:${milestoneId}`;
}

export function readPendingReview(
  kind: "initial" | "appeal",
  eventId: number,
  milestoneId: number,
) {
  try {
    const stored = localStorage.getItem(key(kind, eventId, milestoneId));
    return stored ? JSON.parse(stored) as PendingReview : null;
  } catch {
    return null;
  }
}

export function savePendingReview(review: PendingReview) {
  localStorage.setItem(key(review.kind, review.eventId, review.milestoneId), JSON.stringify(review));
}

export function clearPendingReview(
  kind: "initial" | "appeal",
  eventId: number,
  milestoneId: number,
) {
  localStorage.removeItem(key(kind, eventId, milestoneId));
}
