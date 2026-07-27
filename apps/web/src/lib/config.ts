import { baseSepolia } from "viem/chains";

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

export const publicConfig = {
  chain: baseSepolia,
  baseRpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || baseSepolia.rpcUrls.default.http[0],
  escrowAddress:
    (process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}` | undefined) || zeroAddress,
  usdcAddress:
    (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined) || zeroAddress,
  genlayerContractAddress:
    (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS as `0x${string}` | undefined) ||
    zeroAddress,
};

export const isContractConfigured =
  publicConfig.escrowAddress !== zeroAddress &&
  publicConfig.usdcAddress !== zeroAddress &&
  publicConfig.genlayerContractAddress !== zeroAddress;

export function getServerConfig() {
  return {
    platformPrivateKey: process.env.PLATFORM_PRIVATE_KEY || "",
    genlayerNetwork: process.env.GENLAYER_NETWORK || "studionet",
    oneShotApiUrl:
      process.env.ONESHOT_API_URL || "https://relayer.1shotapi.dev/relayers",
  };
}
