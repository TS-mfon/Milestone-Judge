import { NextResponse } from "next/server";
import { isContractConfigured } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "milestone-verifier",
    contractsConfigured: isContractConfigured,
    storage: "base-sepolia-and-genlayer-studionet",
    oneShotEndpoint:
      process.env.ONESHOT_API_URL || "https://relayer.1shotapi.dev/relayers",
    oneShotAuthentication: "public-hosted",
    genlayerSignerConfigured: Boolean(process.env.GENLAYER_PLATFORM_PRIVATE_KEY),
    baseExecutorConfigured: Boolean(process.env.BASE_EXECUTOR_PRIVATE_KEY),
    timestamp: new Date().toISOString(),
  });
}
