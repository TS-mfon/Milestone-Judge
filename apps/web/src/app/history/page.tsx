"use client";

import {
  ArrowUpRight,
  CircleDollarSign,
  History,
  LoaderCircle,
  ReceiptText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useWallet } from "@/components/wallet-provider";
import { useEvents } from "@/lib/client-events";
import { formatDate, formatUsdc, shortAddress } from "@/lib/format";

export default function HistoryPage() {
  const { address, connect } = useWallet();
  const { events, loading, error } = useEvents(address, "related");
  const payments = events.flatMap((event) =>
    event.milestones
      .filter((milestone) => milestone.reviewStatus === "paid")
      .map((milestone) => ({ event, milestone })),
  );
  const completedEvents = events.filter((event) => event.status === "completed").length;
  const totalPaid = payments.reduce((total, item) => total + item.milestone.amountUsdc, 0);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Base Sepolia records</p>
          <h1>History</h1>
          <p>Completed milestones and confirmed USDC payment transactions for this wallet.</p>
        </div>
      </div>

      {!address ? (
        <div className="connect-state">
          <Wallet size={28} />
          <h2>Connect the relevant wallet</h2>
          <p>History includes events where the connected wallet is the creator or assignee.</p>
          <button className="primary-button" onClick={() => void connect()}>
            Connect wallet
          </button>
        </div>
      ) : loading && events.length === 0 ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Reading payment history
        </div>
      ) : (
        <>
          <section className="stats-band">
            <div className="stat">
              <ReceiptText />
              <span><small>Paid milestones</small><strong>{payments.length}</strong></span>
            </div>
            <div className="stat">
              <History />
              <span><small>Completed events</small><strong>{completedEvents}</strong></span>
            </div>
            <div className="stat">
              <CircleDollarSign />
              <span><small>Total released</small><strong>{formatUsdc(totalPaid)}</strong></span>
            </div>
          </section>

          <section className="workspace">
            <div className="section-toolbar">
              <div>
                <h2>Confirmed payouts</h2>
                <p>Derived from MilestoneReleased events emitted by the escrow contract.</p>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            {payments.length === 0 ? (
              <div className="empty-state">
                <ReceiptText size={26} />
                <h3>No payout transactions</h3>
                <p>Passing milestones appear here after hosted 1Shot confirms the automatic Base Sepolia payout.</p>
              </div>
            ) : (
              <div className="history-list">
                {payments.map(({ event, milestone }) => (
                  <article className="history-row" key={`${event.id}:${milestone.id}`}>
                    <div className="history-status">
                      <span className="network-dot" />
                      Paid
                    </div>
                    <div className="history-primary">
                      <Link href={`/events/${event.id}`}>Event #{event.id}: {event.title}</Link>
                      <span>Milestone {milestone.id + 1}: {milestone.criteria}</span>
                    </div>
                    <div className="history-detail">
                      <small>Recipient</small>
                      <strong>{shortAddress(event.assignee)}</strong>
                    </div>
                    <div className="history-detail">
                      <small>Released</small>
                      <strong>{milestone.paidAt ? formatDate(milestone.paidAt) : "Confirmed"}</strong>
                    </div>
                    <strong className="history-amount">{formatUsdc(milestone.amountUsdc)}</strong>
                    {milestone.paymentTransactionHash ? (
                      <a
                        className="icon-button"
                        href={`https://sepolia.basescan.org/tx/${milestone.paymentTransactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open payment transaction on BaseScan"
                        title="Open payment transaction on BaseScan"
                      >
                        <ArrowUpRight size={18} />
                      </a>
                    ) : (
                      <span className="history-missing">Hash unavailable</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
