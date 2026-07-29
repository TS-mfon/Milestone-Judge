import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.fn();

vi.mock("viem", () => ({
  createPublicClient: () => ({ readContract }),
  http: vi.fn(),
}));

vi.mock("./config", () => ({
  isContractConfigured: true,
  publicConfig: {
    chain: { id: 84532 },
    baseRpcUrl: "https://sepolia.base.org",
    escrowAddress: "0x1111111111111111111111111111111111111111",
  },
}));

import { validateOnchainReview } from "./base";
import type { ReviewRequest } from "./types";

const assignee = "0x2222222222222222222222222222222222222222" as const;
const creator = "0x3333333333333333333333333333333333333333" as const;
const criterionHash = `0x${"44".repeat(32)}` as const;

const request: ReviewRequest = {
  kind: "initial",
  eventId: 1,
  milestoneId: 0,
  attemptId: 1,
  requester: assignee,
  assignee,
  criterion: "Ship the audited release",
  criterionHash,
  evidenceStatement: "Release and audit evidence",
  evidenceLinks: ["https://example.com/evidence"],
  appealContext: "",
  signature: `0x${"55".repeat(65)}`,
  nonce: "review-nonce",
  expiresAt: 2_000_000_000,
};

function mockBaseState({
  approvalProposed = false,
  appealOpen = false,
}: {
  approvalProposed?: boolean;
  appealOpen?: boolean;
}) {
  readContract.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === "getEvent") {
      return {
        creator,
        assignee,
        deadline: 2_000_000_000n,
        status: 2,
      };
    }
    return {
      paid: false,
      approvalProposed,
      appealOpen,
      criteriaHash: criterionHash,
    };
  });
}

describe("validateOnchainReview", () => {
  beforeEach(() => {
    readContract.mockReset();
  });

  it("rejects another initial review during the challenge window", async () => {
    mockBaseState({ approvalProposed: true });

    await expect(validateOnchainReview(request)).rejects.toThrow(
      "A review has already approved this milestone and is in its challenge window",
    );
  });

  it("rejects another initial review while an appeal is open", async () => {
    mockBaseState({ appealOpen: true });

    await expect(validateOnchainReview(request)).rejects.toThrow(
      "An appeal is already open for this milestone",
    );
  });

  it("accepts an initial review for an active untouched milestone", async () => {
    mockBaseState({});

    await expect(validateOnchainReview(request)).resolves.toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ assignee }),
        milestone: expect.objectContaining({ criteriaHash: request.criterionHash }),
      }),
    );
  });
});
