import { NextResponse } from "next/server";
import { runSettlementAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Settlement automation is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actions = await runSettlementAutomation();
    return NextResponse.json({
      ok: true,
      scannedAt: new Date().toISOString(),
      actions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Automation failed",
      },
      { status: 503 },
    );
  }
}
