import { ArrowRight, CalendarClock, CircleDollarSign, Gauge } from "lucide-react";
import Link from "next/link";
import { formatDate, formatUsdc, shortAddress } from "@/lib/format";
import type { MilestoneEvent } from "@/lib/types";

export function EventList({
  events,
  empty,
}: {
  events: MilestoneEvent[];
  empty: string;
}) {
  if (events.length === 0) {
    return <div className="empty-state"><Gauge size={26} /><h3>No events</h3><p>{empty}</p></div>;
  }
  return (
    <div className="event-list">
      {events.map((event) => {
        const total = event.milestones.reduce((sum, item) => sum + item.amountUsdc, 0);
        const paid = event.milestones.filter((item) => item.reviewStatus === "paid").length;
        return (
          <Link href={`/events/${event.id}`} className="event-card" key={event.id}>
            <div className="event-card-index">#{event.id}</div>
            <div className="event-card-title">
              <strong>{event.title}</strong>
              <span>{shortAddress(event.assignee)}</span>
            </div>
            <div className="event-card-metric">
              <CircleDollarSign size={15} />
              <span>{formatUsdc(total)}</span>
            </div>
            <div className="event-card-metric">
              <Gauge size={15} />
              <span>{paid}/{event.milestones.length}</span>
            </div>
            <div className="event-card-metric">
              <CalendarClock size={15} />
              <span>{formatDate(event.deadline)}</span>
            </div>
            <ArrowRight size={18} />
          </Link>
        );
      })}
    </div>
  );
}
