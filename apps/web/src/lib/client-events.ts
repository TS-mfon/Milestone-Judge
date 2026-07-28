"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import type { MilestoneEvent } from "./types";

export function useEvents(
  wallet: Address | null,
  role: "assigned" | "created" | "related",
) {
  const [events, setEvents] = useState<MilestoneEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!wallet) {
      setEvents([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/events?wallet=${wallet}&role=${role}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        events?: MilestoneEvent[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to load events.");
      setEvents(payload.events || []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load events.");
    } finally {
      setLoading(false);
    }
  }, [wallet, role]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { events, loading, error, refresh };
}
