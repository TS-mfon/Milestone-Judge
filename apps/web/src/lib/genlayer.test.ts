import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeContract } = vi.hoisted(() => ({ writeContract: vi.fn() }));

vi.mock("genlayer-js", () => ({
  createAccount: vi.fn(() => ({ address: "0xplatform" })),
  createClient: vi.fn(() => ({ writeContract })),
}));
vi.mock("genlayer-js/chains", () => ({ studionet: {}, testnetBradbury: {} }));
vi.mock("./config", () => ({
  getServerConfig: () => ({
    genlayerNetwork: "studionet",
    genlayerPlatformPrivateKey: `0x${"11".repeat(32)}`,
  }),
  publicConfig: {
    chain: { id: 84532 },
    escrowAddress: "0x1111111111111111111111111111111111111111",
    genlayerContractAddress: "0x2222222222222222222222222222222222222222",
  },
}));

import { submitGenLayerReview } from "./genlayer";
import type { ReviewRequest } from "./types";

const request: ReviewRequest = {
  kind: "initial",
  eventId: 1,
  milestoneId: 0,
  attemptId: 1,
  requester: "0x3333333333333333333333333333333333333333",
  assignee: "0x3333333333333333333333333333333333333333",
  criterion: "Publish the production launch page",
  criterionHash:
    "0xdffdd6c47fabb1cc2f3bb8b2c3664debd3d4a0feec52c2cd1261858910fd845a",
  evidenceStatement: "The release is public and the evidence can be inspected.",
  evidenceLinks: ["https://example.com/release"],
  appealContext: "",
  signature: `0x${"55".repeat(65)}`,
  nonce: "review-route-nonce",
  expiresAt: 2_000_000_000,
};

describe("submitGenLayerReview", () => {
  beforeEach(() => {
    writeContract.mockReset().mockResolvedValue(`0x${"66".repeat(32)}`);
  });

  it("rejects substituted criterion text before a GenLayer transaction", async () => {
    await expect(
      submitGenLayerReview(
        "review-substituted",
        { ...request, criterion: `${request.criterion} substituted` },
        80,
      ),
    ).rejects.toThrow("Criterion hash does not match criterion text at GenLayer boundary");
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("submits the recomputed canonical hash", async () => {
    await submitGenLayerReview("review-canonical", request, 80);
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([request.criterion, request.criterionHash]),
      }),
    );
  });
});
