import { NextResponse } from "next/server";
import { readMilestoneEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ events: await readMilestoneEvents() });
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
