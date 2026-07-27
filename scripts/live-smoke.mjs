import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const escrowAbi = [
  {
    type: "function",
    name: "getEvent",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "assignee", type: "address" },
          { name: "deadline", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "milestoneCount", type: "uint32" },
          { name: "paidCount", type: "uint32" },
          { name: "totalAmount", type: "uint256" },
          { name: "paidAmount", type: "uint256" },
          { name: "title", type: "string" },
          { name: "termsCid", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getMilestone",
    stateMutability: "view",
    inputs: [
      { name: "eventId", type: "uint256" },
      { name: "milestoneId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "criteriaHash", type: "bytes32" },
          { name: "reviewId", type: "bytes32" },
          { name: "resultHash", type: "bytes32" },
          { name: "challengeDeadline", type: "uint64" },
          { name: "approvalProposed", type: "bool" },
          { name: "appealOpen", type: "bool" },
          { name: "paid", type: "bool" },
          { name: "criteria", type: "string" },
        ],
      },
    ],
  },
];

const reviewTypes = {
  ReviewRequest: [
    { name: "eventId", type: "uint256" },
    { name: "milestoneId", type: "uint256" },
    { name: "attemptId", type: "uint256" },
    { name: "criterionHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error || JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const apiUrl = (process.env.SMOKE_API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const eventId = Number(process.env.SMOKE_EVENT_ID || "1");
  const milestoneId = Number(process.env.SMOKE_MILESTONE_ID || "0");
  const settle = process.argv.includes("--settle");
  const privateKey = required("PLATFORM_PRIVATE_KEY");
  const escrowAddress = required("NEXT_PUBLIC_ESCROW_ADDRESS");
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://sepolia.base.org";
  const account = privateKeyToAccount(
    (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`),
  );
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const [event, milestone] = await Promise.all([
    client.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "getEvent",
      args: [BigInt(eventId)],
    }),
    client.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "getMilestone",
      args: [BigInt(eventId), BigInt(milestoneId)],
    }),
  ]);
  if (event.assignee.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("The smoke signer is not the event assignee");
  }

  const unsigned = {
    kind: "initial",
    eventId,
    milestoneId,
    attemptId: Date.now(),
    requester: account.address,
    assignee: event.assignee,
    criterion: milestone.criteria,
    criterionHash: milestone.criteriaHash,
    evidenceStatement:
      "Circle's public USDC contract registry lists 0x036CbD53842c5426634e7929541eC2318f3dCF7e as the USDC contract on Base Sepolia.",
    evidenceLinks: [
      "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    ],
    appealContext: "",
    nonce: randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + 15 * 60,
  };
  const evidenceHash = keccak256(
    stringToHex(
      JSON.stringify({
        kind: unsigned.kind,
        statement: unsigned.evidenceStatement,
        links: unsigned.evidenceLinks,
        appealContext: unsigned.appealContext,
      }),
    ),
  );
  const signature = await account.signTypedData({
    domain: {
      name: "Milestone Verifier",
      version: "1",
      chainId: baseSepolia.id,
      verifyingContract: escrowAddress,
    },
    types: reviewTypes,
    primaryType: "ReviewRequest",
    message: {
      eventId: BigInt(eventId),
      milestoneId: BigInt(milestoneId),
      attemptId: BigInt(unsigned.attemptId),
      criterionHash: milestone.criteriaHash,
      evidenceHash,
      nonce: unsigned.nonce,
      expiresAt: BigInt(unsigned.expiresAt),
    },
  });

  const submitted = await jsonRequest(`${apiUrl}/api/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...unsigned, signature }),
  });
  console.log(JSON.stringify({ stage: "submitted", ...submitted }));

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const status = await jsonRequest(
      `${apiUrl}/api/reviews/${submitted.id}?transactionHash=${submitted.transactionHash}`,
    );
    console.log(
      JSON.stringify({
        stage: "review",
        status: status.status,
        decision: status.review?.result?.decision,
      }),
    );
    if (status.status !== "finalized") continue;
    if (!settle) return;
    if (status.review.result.decision !== "approved") {
      throw new Error(`Review finalized as ${status.review.result.decision}`);
    }
    const settlement = await jsonRequest(`${apiUrl}/api/reviews/${submitted.id}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "proposal", eventId, milestoneId }),
    });
    console.log(JSON.stringify({ stage: "proposal", ...settlement }));
    return;
  }
  throw new Error("GenLayer review did not finalize within 10 minutes");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
