"use client";

import { Activity, CircleDollarSign, FilePlus2, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { EventList } from "@/components/event-list";
import { useWallet } from "@/components/wallet-provider";
import { useEvents } from "@/lib/client-events";
import { formatUsdc } from "@/lib/format";

export default function OverviewPage() {
  const { address, connect } = useWallet();
  const { events, loading, error } = useEvents(address, "related");
  const milestones = events.flatMap((event) => event.milestones);
  const locked = milestones.filter((item) => item.reviewStatus !== "paid").reduce((sum, item) => sum + item.amountUsdc, 0);
  const paid = milestones.filter((item) => item.reviewStatus === "paid").reduce((sum, item) => sum + item.amountUsdc, 0);
  const review = milestones.filter((item) => ["submitted", "finalized", "challenge_window"].includes(item.reviewStatus)).length;

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Settlement workspace</p><h1>On-chain overview</h1><p>Events related to the connected wallet across Base Sepolia and GenLayer.</p></div>
        <Link href="/events/new" className="primary-button"><FilePlus2 size={17} />Create event</Link>
      </div>
      {!address ? (
        <div className="connect-state"><Wallet size={28} /><h2>Connect to load your workspace</h2><p>No public event directory is exposed. Your wallet controls the view.</p><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>
      ) : (
        <>
          <section className="stats-band">
            <div className="stat"><CircleDollarSign /><span><small>Locked</small><strong>{formatUsdc(locked)}</strong></span></div>
            <div className="stat"><ShieldCheck /><span><small>Released</small><strong>{formatUsdc(paid)}</strong></span></div>
            <div className="stat"><Activity /><span><small>In review</small><strong>{review}</strong></span></div>
          </section>
          <section className="workspace">
            <div className="section-toolbar"><div><h2>Related events</h2><p>{loading ? "Synchronizing chains" : `${events.length} accessible events`}</p></div></div>
            {error && <div className="form-error">{error}</div>}
            <EventList events={events} empty="No funded or assigned events were found for this wallet." />
          </section>
        </>
      )}
    </>
  );
}
