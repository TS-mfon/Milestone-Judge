import { keccak256, stringToHex, verifyTypedData } from "viem";
import { publicConfig } from "./config";
import type { ReviewRequest } from "./types";

export const reviewTypes = {
  ReviewRequest: [
    { name: "eventId", type: "uint256" },
    { name: "milestoneId", type: "uint256" },
    { name: "attemptId", type: "uint256" },
    { name: "criterionTextHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export function reviewTypedData(request: Omit<ReviewRequest, "signature">) {
  const criterionTextHash = keccak256(stringToHex(request.criterion));
  const evidenceHash = keccak256(
    stringToHex(
      JSON.stringify({
        kind: request.kind,
        statement: request.evidenceStatement,
        links: request.evidenceLinks,
        appealContext: request.appealContext,
      }),
    ),
  );
  return {
    domain: {
      name: "Milestone Verifier",
      version: "3",
      chainId: publicConfig.chain.id,
      verifyingContract: publicConfig.escrowAddress,
    },
    types: reviewTypes,
    primaryType: "ReviewRequest" as const,
    message: {
      eventId: BigInt(request.eventId),
      milestoneId: BigInt(request.milestoneId),
      attemptId: BigInt(request.attemptId),
      criterionTextHash,
      evidenceHash,
      nonce: request.nonce,
      expiresAt: BigInt(request.expiresAt),
    },
  };
}

export async function verifyReviewSignature(request: ReviewRequest) {
  if (request.expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const recomputedCriterionHash = keccak256(stringToHex(request.criterion));
  if (recomputedCriterionHash.toLowerCase() !== request.criterionHash.toLowerCase()) {
    return false;
  }
  const { signature, ...unsigned } = request;
  return verifyTypedData({
    address: request.requester,
    ...reviewTypedData(unsigned),
    signature,
  });
}
