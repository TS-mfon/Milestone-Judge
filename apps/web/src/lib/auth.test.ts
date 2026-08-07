import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

vi.mock("./config", () => ({
  publicConfig: {
    chain: { id: 84532 },
    escrowAddress: "0x1111111111111111111111111111111111111111",
  },
}));

import { reviewTypedData, verifyReviewSignature } from "./auth";
import type { ReviewRequest } from "./types";

const account = privateKeyToAccount(
  "0x0123456789012345678901234567890123456789012345678901234567890123",
);

const unsigned = {
  kind: "initial" as const,
  eventId: 1,
  milestoneId: 0,
  attemptId: 1,
  requester: account.address,
  assignee: account.address,
  criterion: "Publish the production launch page",
  criterionHash:
    "0xdffdd6c47fabb1cc2f3bb8b2c3664debd3d4a0feec52c2cd1261858910fd845a" as `0x${string}`,
  evidenceStatement: "The launch page is public and verifiable.",
  evidenceLinks: ["https://example.com/release"],
  appealContext: "",
  nonce: "review-nonce",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe("review authorization", () => {
  it("includes chain scope and recomputed criterion text hash in EIP-712", async () => {
    const typed = reviewTypedData(unsigned);
    expect(typed.domain).toEqual(
      expect.objectContaining({ version: "3", chainId: 84532 }),
    );
    expect(typed.message).toEqual(
      expect.objectContaining({ criterionTextHash: unsigned.criterionHash }),
    );
    expect(typed.message).not.toHaveProperty("criterionHash");
  });

  it("rejects substituted criterion text before signature verification", async () => {
    const signature = await account.signTypedData(reviewTypedData(unsigned));
    const request: ReviewRequest = { ...unsigned, signature };
    await expect(verifyReviewSignature(request)).resolves.toBe(true);
    await expect(
      verifyReviewSignature({ ...request, criterion: `${request.criterion} substituted` }),
    ).resolves.toBe(false);
  });
});
