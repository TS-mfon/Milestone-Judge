import { NextResponse } from "next/server";
import { readMilestoneEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const wallet = params.get("wallet") || undefined;
    const roleValue = params.get("role");
    const role =
      roleValue === "assigned" || roleValue === "created" || roleValue === "related"
        ? roleValue
        : undefined;
    const limit = Math.max(
      1,
      Math.min(100, Number(params.get("limit") || 50)),
    );
    const beforeBlockValue = params.get("beforeBlock");
    const beforeBlock =
      beforeBlockValue && /^\d+$/.test(beforeBlockValue)
        ? BigInt(beforeBlockValue)
        : undefined;
    if (!wallet) {
      return NextResponse.json({ events: [] });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: "Invalid wallet address", events: [] },
        { status: 400 },
      );
    }
    const events = await readMilestoneEvents({ wallet, role, limit, beforeBlock });
    return NextResponse.json({
      events,
      nextBeforeBlock:
        events.length === limit
          ? events[events.length - 1].createdBlockNumber
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read Base events",
        events: [],
      },
      { status: 503 },
    );
  }
}
