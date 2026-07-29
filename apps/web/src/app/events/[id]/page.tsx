"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { createPublicClient, http } from "viem";
import { useWallet } from "@/components/wallet-provider";
import { useEvents } from "@/lib/client-events";
import { publicConfig } from "@/lib/config";
import { escrowAbi } from "@/lib/contracts";
import { apiError, userError } from "@/lib/errors";
import { formatDate, formatUsdc, shortAddress } from "@/lib/format";
import { baseWalletClient } from "@/lib/wallet";
import type { Milestone } from "@/lib/types";

const statusLabel = {
  not_submitted: "Evidence needed",
  queued: "Queued",
  submitted: "Under GenLayer review",
  finalized: "Verdict finalized",
  approval_queued: "Approval queued",
  challenge_window: "Challenge window",
  appeal_resolution_queued: "Appeal queued",
  payout_queued: "Payout queued",
  paid: "Paid",
  failed: "Action required",
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const { address, connect } = useWallet();
  const { events, loading, error: loadError, refresh } = useEvents(address, "related");
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const event = events.find((item) => item.id === eventId);

  async function settle(
    milestone: Milestone,
    kind: "automatic-payout" | "proposal" | "payout" | "appeal-resolution",
  ) {
    if (!milestone.reviewId) return setError("The finalized GenLayer review is not available.");
    setAction(`${milestone.id}:${kind}`);
    setError("");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(milestone.reviewId)}/settle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: kind, eventId, milestoneId: milestone.id }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Settlement request failed."));
      window.setTimeout(() => void refresh(), 4_000);
    } catch (caught) {
      setError(userError(caught, "Settlement request failed."));
    } finally {
      setAction("");
    }
  }

  async function refund() {
    if (!address || !event || address.toLowerCase() !== event.creator.toLowerCase()) {
      return setError("Connect the event creator wallet to claim the refund.");
    }
    setAction("refund");
    try {
      const { client, account } = await baseWalletClient(address);
      const publicClient = createPublicClient({ chain: publicConfig.chain, transport: http(publicConfig.baseRpcUrl) });
      const hash = await client.writeContract({
        account,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "refundEvent",
        args: [BigInt(event.id)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (caught) {
      setError(userError(caught, "Refund failed."));
    } finally {
      setAction("");
    }
  }

  if (!address) {
    return <div className="connect-state"><Wallet size={28} /><h2>Connect to open this event</h2><p>Only its creator and assigned wallet can load the event details.</p><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>;
  }
  if (loading && !event) return <div className="loading-state"><LoaderCircle className="spin" />Reading event #{eventId}</div>;
  if (!event) return <div className="connect-state"><ShieldAlert size={28} /><h2>Event unavailable</h2><p>{loadError || "This event is not assigned to or created by the connected wallet."}</p><Link href="/app" className="secondary-button">Return to overview</Link></div>;

  const creator = address.toLowerCase() === event.creator.toLowerCase();
  const assignee = address.toLowerCase() === event.assignee.toLowerCase();
  const total = event.milestones.reduce((sum, item) => sum + item.amountUsdc, 0);
  return (
    <>
      <Link href="/app" className="back-link"><ArrowLeft size={16} />Overview</Link>
      <div className="event-header">
        <div><p className="eyebrow">Event #{event.id} · {event.status}</p><h1>{event.title}</h1></div>
        <button className="icon-button" onClick={() => void refresh()} aria-label="Refresh event"><RefreshCw size={17} /></button>
      </div>
      <section className="event-facts">
        <div><small>Escrow</small><strong>{formatUsdc(total)}</strong></div>
        <div><small>Assignee</small><strong>{shortAddress(event.assignee)}</strong></div>
        <div><small>Creator</small><strong>{shortAddress(event.creator)}</strong></div>
        <div><small>Deadline</small><strong>{formatDate(event.deadline)}</strong></div>
        <div><small>Settlement</small><strong>{event.challengePeriodSeconds === 0 ? "Instant" : `${event.challengePeriodSeconds / 3600}h challenge`}</strong></div>
        {event.termsCid && <a href={event.termsCid.startsWith("http") ? event.termsCid : undefined} target="_blank" rel="noreferrer"><small>Terms</small><strong>Document <ExternalLink size={14} /></strong></a>}
      </section>
      {error && <div className="form-error">{error}</div>}
      <section className="milestone-list">
        {event.milestones.map((milestone) => {
          const qualifies = milestone.decision === "approved" && (milestone.score || 0) >= milestone.minimumScore;
          const busy = action.startsWith(`${milestone.id}:`);
          return (
            <article className="milestone-card" key={milestone.id}>
              <div className="milestone-card-head">
                <span className="milestone-number">{milestone.id + 1}</span>
                <div><h2>{milestone.criteria}</h2><p>{statusLabel[milestone.reviewStatus]}</p></div>
                <strong>{formatUsdc(milestone.amountUsdc)}</strong>
              </div>
              <div className="score-row">
                <span>Required score <strong>{milestone.minimumScore}</strong></span>
                {milestone.score !== undefined && <span className={qualifies ? "score-pass" : "score-fail"}>GenLayer score <strong>{milestone.score}</strong></span>}
                {milestone.challengeDeadline && <span><CalendarClock size={14} />{new Date(milestone.challengeDeadline).toLocaleString()}</span>}
              </div>
              {milestone.explanation && <p className="verdict-summary">{milestone.explanation}</p>}
              <div className="milestone-actions">
                {milestone.reviewId && <Link className="secondary-button" href={`/reviews/${encodeURIComponent(milestone.reviewId)}`}>Open verdict <ArrowRight size={15} /></Link>}
                {assignee && ["not_submitted", "finalized", "failed"].includes(milestone.reviewStatus) && !milestone.paidAt && (
                  <Link className="primary-button" href={`/events/${event.id}/milestones/${milestone.id}/submit`}><Sparkles size={16} />Submit evidence</Link>
                )}
                {milestone.reviewStatus === "finalized" && qualifies && !milestone.appealOpen && (
                  <button className="primary-button" disabled={busy} onClick={() => void settle(milestone, "automatic-payout")}>{busy ? <LoaderCircle className="spin" size={16} /> : <CircleDollarSign size={16} />}Release verified payout</button>
                )}
                {milestone.reviewStatus === "challenge_window" && milestone.payoutReady && (
                  <button className="primary-button" disabled={busy} onClick={() => void settle(milestone, "payout")}><CircleDollarSign size={16} />Release payout</button>
                )}
                {milestone.appealOpen && milestone.reviewStatus === "finalized" && (
                  <button className="primary-button" disabled={busy} onClick={() => void settle(milestone, "appeal-resolution")}>Resolve appeal</button>
                )}
              </div>
            </article>
          );
        })}
      </section>
      {creator && event.refundReady && <section className="refund-band"><div><strong>Event deadline passed</strong><p>Return the unpaid USDC balance to the creator.</p></div><button className="danger-button" disabled={action === "refund"} onClick={() => void refund()}>{action === "refund" ? <LoaderCircle className="spin" size={16} /> : <CircleDollarSign size={16} />}Claim refund</button></section>}
    </>
  );
}
