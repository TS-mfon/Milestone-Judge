export type EventStatus = "draft" | "active" | "completed" | "refunded";
export type ReviewDecision = "approved" | "rejected" | "inconclusive";
export type ReviewStatus =
  | "not_submitted"
  | "queued"
  | "submitted"
  | "finalized"
  | "approval_queued"
  | "challenge_window"
  | "appeal_resolution_queued"
  | "payout_queued"
  | "paid"
  | "failed";

export interface Milestone {
  id: number;
  criteria: string;
  amountUsdc: number;
  minimumScore: number;
  approvedScore?: number;
  reviewStatus: ReviewStatus;
  decision?: ReviewDecision;
  evidenceStatement?: string;
  evidenceLinks?: string[];
  reviewId?: string;
  reviewKind?: "initial" | "appeal";
  score?: number;
  review?: string;
  explanation?: string;
  strengths?: string[];
  improvements?: string[];
  suggestions?: string[];
  citations?: string[];
  evidenceGaps?: string[];
  challengeDeadline?: string;
  resultHash?: `0x${string}`;
  genlayerTxHash?: `0x${string}`;
  approvalProposed?: boolean;
  appealOpen?: boolean;
  payoutReady?: boolean;
  paidAt?: string;
  paymentTransactionHash?: `0x${string}`;
}

export interface MilestoneEvent {
  id: number;
  title: string;
  creator: `0x${string}`;
  assignee: `0x${string}`;
  deadline: string;
  status: EventStatus;
  termsCid: string;
  challengePeriodSeconds: number;
  createdAt: string;
  createdBlockNumber?: string;
  refundReady?: boolean;
  milestones: Milestone[];
}

export interface ReviewRequest {
  kind: "initial" | "appeal";
  eventId: number;
  milestoneId: number;
  attemptId: number;
  requester: `0x${string}`;
  assignee: `0x${string}`;
  criterion: string;
  criterionHash: `0x${string}`;
  evidenceStatement: string;
  evidenceLinks: string[];
  appealContext: string;
  signature: `0x${string}`;
  nonce: string;
  expiresAt: number;
}

export interface StoredReview {
  review_id: string;
  review_kind: "initial" | "appeal";
  base_chain_id: string;
  escrow_address: string;
  event_id: string;
  milestone_id: string;
  attempt_id: string;
  assignee: string;
  criterion: string;
  criterion_hash: string;
  evidence_statement: string;
  evidence_links: string[];
  appeal_context: string;
  result: {
    decision: ReviewDecision;
    score: number;
    criterion_met: boolean;
    measurement_valid: boolean;
    material_exception: boolean;
    threshold_met: boolean;
    minimum_score: number;
    review: string;
    explanation: string;
    strengths: string[];
    improvements: string[];
    suggestions: string[];
    citations: string[];
    evidence_gaps: string[];
    retrieved_sources: string[];
  };
}
