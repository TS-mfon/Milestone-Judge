import { createWalletClient, custom, type Address } from "viem";
import { publicConfig } from "./config";

const baseSepoliaHex = `0x${publicConfig.chain.id.toString(16)}`;

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

function provider() {
  if (!window.ethereum) throw new Error("Install an EVM wallet to continue.");
  return window.ethereum;
}

function errorDetails(error: unknown): { codes: number[]; messages: string[] } {
  const codes: number[] = [];
  const messages: string[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    if (typeof value === "string") {
      messages.push(value);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.code === "number") codes.push(record.code);
    if (typeof record.message === "string") messages.push(record.message);
    for (const key of ["cause", "data", "error", "originalError"]) visit(record[key]);
  };
  visit(error);
  return { codes, messages };
}

function isUnknownChain(error: unknown) {
  const details = errorDetails(error);
  if (details.codes.includes(4902)) return true;
  const message = details.messages.join(" ").toLowerCase();
  return [
    "unrecognized chain id",
    "unknown chain",
    "chain has not been added",
    "chain not added",
    "unsupported chain",
    "network is not available",
  ].some((pattern) => message.includes(pattern));
}

export async function switchToBaseSepolia(ethereum: Eip1193Provider) {
  const current = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (current.toLowerCase() === baseSepoliaHex) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseSepoliaHex }],
    });
  } catch (error) {
    if (!isUnknownChain(error)) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: baseSepoliaHex,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [publicConfig.baseRpcUrl],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        },
      ],
    });
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseSepoliaHex }],
    });
  }

  const switched = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (switched.toLowerCase() !== baseSepoliaHex) {
    throw new Error("Wallet did not switch to Base Sepolia.");
  }
}

export async function ensureBaseSepolia() {
  return switchToBaseSepolia(provider());
}

export function signatureWalletClient(account: Address) {
  return {
    account,
    client: createWalletClient({ transport: custom(provider()) }),
  };
}

export async function connectBaseWallet() {
  const ethereum = provider();
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[];
  if (!accounts[0]) throw new Error("No wallet account was returned.");
  await ensureBaseSepolia();
  return accounts[0];
}

export async function baseWalletClient(account?: Address) {
  await ensureBaseSepolia();
  const ethereum = provider();
  const accounts = account
    ? [account]
    : ((await ethereum.request({ method: "eth_accounts" })) as Address[]);
  if (!accounts[0]) throw new Error("Connect a wallet to continue.");
  return {
    account: accounts[0],
    client: createWalletClient({
      chain: publicConfig.chain,
      transport: custom(ethereum),
    }),
  };
}
