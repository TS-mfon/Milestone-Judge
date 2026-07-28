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
    if (!wallet) {
      return NextResponse.json({ events: [] });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: "Invalid wallet address", events: [] },
        { status: 400 },
      );
    }
    return NextResponse.json({
      events: await readMilestoneEvents({ wallet, role }),
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
