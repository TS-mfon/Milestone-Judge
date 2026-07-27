import { describe, expect, it } from "vitest";
import { reviewRequestSchema } from "./review-schema";

const validRequest = {
  kind: "initial",
  eventId: 1,
  milestoneId: 0,
  attemptId: 1,
  requester: "0x4b619c19fc8b3a3cae96309b97e58c32b96ba79d",
  assignee: "0x4b619c19fc8b3a3cae96309b97e58c32b96ba79d",
  criterion: "Publish the complete production documentation.",
  criterionHash: `0x${"1".repeat(64)}`,
  evidenceStatement: "The production documentation is public and includes each required section.",
  evidenceLinks: ["https://example.com/docs"],
  appealContext: "",
  signature: "0x1234",
  nonce: "nonce-123456",
  expiresAt: Math.floor(Date.now() / 1000) + 900,
};

describe("reviewRequestSchema", () => {
  it("accepts a bounded evidence request", () => {
    expect(reviewRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects private or malformed evidence references", () => {
    const parsed = reviewRequestSchema.safeParse({
      ...validRequest,
      evidenceLinks: ["not-a-public-link"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unbounded criterion", () => {
    const parsed = reviewRequestSchema.safeParse({
      ...validRequest,
      criterion: "x".repeat(2_001),
    });
    expect(parsed.success).toBe(false);
  });
});
