"use client";

import { FilePlus2, LoaderCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { EventList } from "./event-list";
import { useWallet } from "./wallet-provider";
import { useEvents } from "@/lib/client-events";

export function EventsView({ role }: { role: "assigned" | "created" }) {
  const { address, connect } = useWallet();
  const { events, loading, error } = useEvents(address, role);
  const assigned = role === "assigned";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{assigned ? "Delivery workspace" : "Funding workspace"}</p>
          <h1>{assigned ? "Assigned to me" : "Created by me"}</h1>
          <p>{assigned ? "Only events delegated to the connected wallet are shown." : "Manage events funded by the connected creator wallet."}</p>
        </div>
        {!assigned && <Link href="/events/new" className="primary-button"><FilePlus2 size={17} />Create event</Link>}
      </div>
      {!address ? (
        <div className="connect-state">
          <Wallet size={28} />
          <h2>Connect the relevant wallet</h2>
          <p>Event access is scoped to the connected address.</p>
          <button className="primary-button" onClick={() => void connect()}>Connect wallet</button>
        </div>
      ) : loading && events.length === 0 ? (
        <div className="loading-state"><LoaderCircle className="spin" />Reading on-chain events</div>
      ) : (
        <section className="workspace">
          <div className="section-toolbar">
            <div><h2>{assigned ? "Delegated events" : "Funded events"}</h2><p>{events.length} on-chain event{events.length === 1 ? "" : "s"}</p></div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <EventList events={events} empty={assigned ? "No events are assigned to this wallet." : "This wallet has not created an event."} />
        </section>
      )}
    </>
  );
}
