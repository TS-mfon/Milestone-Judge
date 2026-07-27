import {
  createCaveat,
  getSmartAccountsEnvironment,
  signDelegation,
} from "@metamask/smart-accounts-kit";
import {
  createExactExecutionTerms,
  ROOT_AUTHORITY,
} from "@metamask/delegation-core";
import {
  createPublicClient,
  encodeFunctionData,
  formatTransactionRequest,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, signAuthorization } from "viem/accounts";
import { escrowAbi } from "./contracts";
import { getServerConfig, publicConfig } from "./config";

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface Capability {
  feeCollector: Address;
  targetAddress: Address;
  tokens: Array<{ address: Address; symbol: string; decimals: string }>;
}

interface Execution {
  target: Address;
  value: "0x0";
  data: Hex;
}

interface EstimateResult {
  success: boolean;
  requiredPaymentAmount?: string;
  context?: string;
  error?: string;
}

function relayerUrl() {
  const base = getServerConfig().oneShotApiUrl.replace(/\/$/, "");
  return base.endsWith("/relayers") ? base : `${base}/relayers`;
}

function platformPrivateKey() {
  const value = getServerConfig().platformPrivateKey;
  if (!value) throw new Error("PLATFORM_PRIVATE_KEY is not configured");
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(relayerUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`1Shot HTTP ${response.status}`);
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) throw new Error(`1Shot ${payload.error.code}: ${payload.error.message}`);
  if (payload.result === undefined) throw new Error("1Shot returned no result");
  return payload.result;
}

async function baseSepoliaCapability() {
  const capabilities = await rpc<Record<string, Capability>>(
    "relayer_getCapabilities",
    [String(publicConfig.chain.id)],
  );
  const capability = capabilities[String(publicConfig.chain.id)];
  if (!capability?.targetAddress || !capability.feeCollector) {
    throw new Error("Hosted 1Shot does not advertise Base Sepolia execution");
  }
  const usdc = capability.tokens.find(
    (token) => token.symbol === "USDC" && token.address.toLowerCase() === publicConfig.usdcAddress.toLowerCase(),
  );
  if (!usdc) throw new Error("Hosted 1Shot does not advertise the configured Base Sepolia USDC");
  return { ...capability, usdc: usdc.address };
}

async function signedTransactions(
  executions: Execution[],
  relayerTarget: Address,
) {
  const privateKey = platformPrivateKey();
  const account = privateKeyToAccount(privateKey);
  const environment = getSmartAccountsEnvironment(publicConfig.chain.id);
  const transactions = await Promise.all(
    executions.map(async (execution) => {
      const exactExecution = createCaveat(
        environment.caveatEnforcers.ExactExecutionEnforcer,
        createExactExecutionTerms({
          execution: {
            target: execution.target,
            value: 0n,
            callData: execution.data,
          },
        }),
      );
      const unsigned = {
        delegate: relayerTarget,
        delegator: account.address,
        authority: ROOT_AUTHORITY,
        caveats: [exactExecution],
        salt: "0x00" as Hex,
        signature: "0x" as Hex,
      };
      const signature = await signDelegation({
        privateKey,
        delegation: {
          delegate: unsigned.delegate,
          delegator: unsigned.delegator,
          authority: unsigned.authority,
          caveats: unsigned.caveats,
          salt: unsigned.salt,
        },
        delegationManager: environment.DelegationManager,
        chainId: publicConfig.chain.id,
      });
      return {
        permissionContext: [{ ...unsigned, signature }],
        executions: [execution],
      };
    }),
  );

  const publicClient = createPublicClient({
    chain: publicConfig.chain,
    transport: http(publicConfig.baseRpcUrl),
  });
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const authorization = await signAuthorization({
    privateKey,
    address: environment.implementations.EIP7702StatelessDeleGatorImpl,
    chainId: publicConfig.chain.id,
    nonce,
  });
  return {
    transactions,
    authorizationList: formatTransactionRequest({
      authorizationList: [authorization],
    }).authorizationList,
  };
}

async function relay(kind: string, reviewId: string, data: Hex) {
  const capability = await baseSepoliaCapability();
  const work: Execution = {
    target: publicConfig.escrowAddress,
    value: "0x0",
    data,
  };
  const feeTransfer = (amount: bigint): Execution => ({
    target: capability.usdc,
    value: "0x0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [capability.feeCollector, amount],
    }),
  });

  const initialExecutions = [feeTransfer(1_000_000n), work];
  const initialPermission = await signedTransactions(
    initialExecutions,
    capability.targetAddress,
  );
  const initialEstimate = await rpc<EstimateResult>(
    "relayer_estimate7710Transaction",
    {
      chainId: String(publicConfig.chain.id),
      transactions: initialPermission.transactions,
      authorizationList: initialPermission.authorizationList,
    },
  );
  if (!initialEstimate.success) {
    throw new Error(`1Shot estimate failed: ${initialEstimate.error || "unknown error"}`);
  }
  if (!initialEstimate.requiredPaymentAmount) {
    throw new Error("1Shot estimate did not return a required payment amount");
  }

  const executions = [feeTransfer(BigInt(initialEstimate.requiredPaymentAmount)), work];
  const permission = await signedTransactions(executions, capability.targetAddress);
  const payload = {
    chainId: String(publicConfig.chain.id),
    transactions: permission.transactions,
    authorizationList: permission.authorizationList,
  };
  const estimate = await rpc<EstimateResult>(
    "relayer_estimate7710Transaction",
    payload,
  );
  if (!estimate.success) {
    throw new Error(`1Shot final estimate failed: ${estimate.error || "unknown error"}`);
  }
  if (!estimate.context) throw new Error("1Shot final estimate did not return context");

  const taskId = keccak256(stringToHex(`${kind}:${reviewId}`));
  const result = await rpc<string | { taskId?: string; id?: string }>(
    "relayer_send7710Transaction",
    {
      ...payload,
      context: estimate.context,
      taskId,
      memo: `milestone-judge:${kind}:${reviewId}`,
    },
  );
  return {
    taskId:
      typeof result === "string" ? result : result.taskId || result.id || taskId,
    feeAmount: initialEstimate.requiredPaymentAmount,
  };
}

export function relayApprovalProposal(
  reviewId: string,
  eventId: number,
  milestoneId: number,
  resultHash: `0x${string}`,
  challengeDeadline: number,
) {
  return relay(
    "milestone-approval",
    reviewId,
    encodeFunctionData({
      abi: escrowAbi,
      functionName: "proposeMilestoneApproval",
      args: [
        BigInt(eventId),
        BigInt(milestoneId),
        keccak256(stringToHex(reviewId)),
        resultHash,
        BigInt(challengeDeadline),
      ],
    }),
  );
}

export function relayMilestonePayout(
  reviewId: string,
  eventId: number,
  milestoneId: number,
  resultHash: `0x${string}`,
) {
  return relay(
    "milestone-payout",
    reviewId,
    encodeFunctionData({
      abi: escrowAbi,
      functionName: "releaseMilestone",
      args: [
        BigInt(eventId),
        BigInt(milestoneId),
        keccak256(stringToHex(reviewId)),
        resultHash,
      ],
    }),
  );
}

export function relayAppealResolution(
  reviewId: string,
  eventId: number,
  milestoneId: number,
  approvalUpheld: boolean,
  resultHash: `0x${string}`,
) {
  return relay(
    "appeal-resolution",
    reviewId,
    encodeFunctionData({
      abi: escrowAbi,
      functionName: "resolveAppeal",
      args: [
        BigInt(eventId),
        BigInt(milestoneId),
        approvalUpheld,
        keccak256(stringToHex(reviewId)),
        resultHash,
      ],
    }),
  );
}

export function getRelayStatus(taskId: string) {
  return rpc<{
    status: 100 | 110 | 200 | 400 | 500;
    hash?: string;
    message?: string;
    receipt?: unknown;
  }>("relayer_getStatus", { id: taskId, logs: true });
}
