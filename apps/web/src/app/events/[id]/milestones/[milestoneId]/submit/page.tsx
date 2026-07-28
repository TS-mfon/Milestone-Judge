"use client";

import { ArrowLeft, Link2, LoaderCircle, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { keccak256, stringToHex } from "viem";
import { useWallet } from "@/components/wallet-provider";
import { reviewTypedData } from "@/lib/auth";
import { useEvents } from "@/lib/client-events";
import { apiError, userError } from "@/lib/errors";
import { formatUsdc } from "@/lib/format";
import {
  readPendingReview,
  savePendingReview,
  type PendingReview,
} from "@/lib/pending-review";
import type { ReviewRequest } from "@/lib/types";
import { uniqueAttemptId, unixSeconds } from "@/lib/time";
import { signatureWalletClient } from "@/lib/wallet";

export default function SubmitEvidencePage() {
  const params = useParams<{ id: string; milestoneId: string }>();
  const router = useRouter();
  const eventId = Number(params.id);
  const milestoneId = Number(params.milestoneId);
  const { address, connect } = useWallet();
  const { events, loading } = useEvents(address, "assigned");
  const event = events.find((item) => item.id === eventId);
  const milestone = event?.milestones.find((item) => item.id === milestoneId);
  const [statement, setStatement] = useState("");
  const [linksText, setLinksText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const submissionLock = useRef(false);

  useEffect(() => {
    const initial = window.setTimeout(
      () => {
        setPending(readPendingReview("initial", eventId, milestoneId));
        setPendingLoaded(true);
      },
      0,
    );
    return () => window.clearTimeout(initial);
  }, [eventId, milestoneId]);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (submissionLock.current || pending) {
      return setError("A review is already in progress for this milestone.");
    }
    if (!address || !event || !milestone) return setError("Connect the assigned wallet.");
    const links = linksText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (links.length === 0 || links.length > 12) return setError("Provide between 1 and 12 public evidence links.");
    submissionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const unsigned = {
        kind: "initial" as const,
        eventId,
        milestoneId,
        attemptId: uniqueAttemptId(),
        requester: address,
        assignee: event.assignee,
        criterion: milestone.criteria,
        criterionHash: keccak256(stringToHex(milestone.criteria)),
        evidenceStatement: statement.trim(),
        evidenceLinks: links,
        appealContext: "",
        nonce: crypto.randomUUID(),
        expiresAt: unixSeconds() + 900,
      } satisfies Omit<ReviewRequest, "signature">;
      const { client, account } = signatureWalletClient(address);
      const signature = await client.signTypedData({
        account,
        ...reviewTypedData(unsigned),
      });
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...unsigned, signature }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Review request failed."));
      const result = (await response.json()) as {
        id: string;
        status: "submitted" | "finalized";
        transactionHash?: string;
      };
      if (result.status === "submitted" && result.transactionHash) {
        const nextPending: PendingReview = {
          id: result.id,
          transactionHash: result.transactionHash,
          kind: "initial",
          eventId,
          milestoneId,
          createdAt: uniqueAttemptId(),
        };
        savePendingReview(nextPending);
        setPending(nextPending);
      }
      const query = result.transactionHash
        ? `?transactionHash=${encodeURIComponent(result.transactionHash)}`
        : "";
      router.push(`/reviews/${encodeURIComponent(result.id)}${query}`);
    } catch (caught) {
      setError(userError(caught, "Review request failed."));
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  }

  if (!address) return <div className="connect-state"><Wallet size={28} /><h2>Connect the assigned wallet</h2><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>;
  if (loading && !event) return <div className="loading-state"><LoaderCircle className="spin" />Loading milestone</div>;
  if (!event || !milestone) return <div className="connect-state"><h2>Milestone unavailable</h2><p>This milestone is not delegated to the connected wallet.</p></div>;
  if (!pendingLoaded) return <div className="loading-state"><LoaderCircle className="spin" />Checking review status</div>;
  if (pending) {
    return (
      <div className="connect-state">
        <LoaderCircle className="spin" size={28} />
        <h2>Review already in progress</h2>
        <p>Wait for the current GenLayer comparative consensus result before submitting another review.</p>
        <Link className="primary-button" href={`/reviews/${encodeURIComponent(pending.id)}?transactionHash=${encodeURIComponent(pending.transactionHash)}`}>
          Open current review
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href={`/events/${eventId}`} className="back-link"><ArrowLeft size={16} />Event #{eventId}</Link>
      <div className="page-heading"><div><p className="eyebrow">Milestone {milestoneId + 1}</p><h1>Submit evidence</h1><p>Your wallet authorizes the evidence off-chain. The GenLayer-only platform signer submits the review transaction.</p></div></div>
      <form className="form-surface compact" onSubmit={submit}>
        <div className="criterion-panel"><div><small>Funded criterion</small><strong>{milestone.criteria}</strong></div><div><small>Payout</small><strong>{formatUsdc(milestone.amountUsdc)}</strong></div><div><small>Required score</small><strong>{milestone.minimumScore}/100</strong></div></div>
        <label>Evidence statement<textarea minLength={20} maxLength={10000} value={statement} onChange={(event) => setStatement(event.target.value)} required placeholder="Explain what was completed and map each claim to public evidence." /></label>
        <label>Public evidence links<textarea value={linksText} onChange={(event) => setLinksText(event.target.value)} required placeholder={"https://...\nipfs://..."} /><span className="field-hint"><Link2 size={13} />One retrievable HTTPS or IPFS source per line</span></label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-footer"><span>Your wallet signs evidence only. The platform signer sends the GenLayer transaction.</span><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? "Submitting review" : "Request review"}</button></div>
      </form>
    </>
  );
}
