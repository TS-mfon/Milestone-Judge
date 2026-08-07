import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.fn();

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual, createPublicClient: () => ({ readContract }), http: vi.fn() };
});

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
const criterionHash =
  "0xe1d6ae227993839db7bcf6fa8b3a400f6bd823c6433ac108534d52a39a93bbeb" as const;

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
      criteria: request.criterion,
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

  it("rejects substituted criterion text even when the funded hash is reused", async () => {
    mockBaseState({});

    await expect(
      validateOnchainReview({ ...request, criterion: `${request.criterion} substituted` }),
    ).rejects.toThrow("Criterion text does not match the funded milestone");
  });

  it("rejects a criterion hash that was not recomputed from the request text", async () => {
    mockBaseState({});

    await expect(
      validateOnchainReview({
        ...request,
        criterionHash: `0x${"11".repeat(32)}`,
      }),
    ).rejects.toThrow("Criterion hash does not match the submitted criterion text");
  });
});
