import type { Metadata } from "next";
import { EventsView } from "@/components/events-view";

export const metadata: Metadata = { title: "Assigned Events" };
export default function AssignedEventsPage() {
  return <EventsView role="assigned" />;
}
