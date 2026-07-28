import type { Metadata } from "next";
import { EventsView } from "@/components/events-view";

export const metadata: Metadata = { title: "Created Events" };
export default function CreatedEventsPage() {
  return <EventsView role="created" />;
}
