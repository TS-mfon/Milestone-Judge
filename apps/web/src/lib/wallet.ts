import { createWalletClient, custom, type Address } from "viem";
import { publicConfig } from "./config";

const baseSepoliaHex = `0x${publicConfig.chain.id.toString(16)}`;

function provider() {
  if (!window.ethereum) throw new Error("Install an EVM wallet to continue.");
  return window.ethereum;
}

export async function ensureBaseSepolia() {
  const ethereum = provider();
  const current = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (current.toLowerCase() === baseSepoliaHex) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: baseSepoliaHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
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
