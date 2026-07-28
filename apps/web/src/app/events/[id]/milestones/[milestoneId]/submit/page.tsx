"use client";

import { ArrowLeft, Link2, LoaderCircle, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { keccak256, stringToHex } from "viem";
import { useWallet } from "@/components/wallet-provider";
import { reviewTypedData } from "@/lib/auth";
import { useEvents } from "@/lib/client-events";
import { apiError, userError } from "@/lib/errors";
import { formatUsdc } from "@/lib/format";
import type { ReviewRequest } from "@/lib/types";
import { uniqueAttemptId, unixSeconds } from "@/lib/time";
import { baseWalletClient } from "@/lib/wallet";

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

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!address || !event || !milestone) return setError("Connect the assigned wallet.");
    const links = linksText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (links.length === 0 || links.length > 12) return setError("Provide between 1 and 12 public evidence links.");
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
      const { client, account } = await baseWalletClient(address);
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
      const result = (await response.json()) as { id: string; transactionHash: string };
      router.push(`/reviews/${encodeURIComponent(result.id)}?transactionHash=${result.transactionHash}`);
    } catch (caught) {
      setError(userError(caught, "Review request failed."));
    } finally {
      setBusy(false);
    }
  }

  if (!address) return <div className="connect-state"><Wallet size={28} /><h2>Connect the assigned wallet</h2><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>;
  if (loading && !event) return <div className="loading-state"><LoaderCircle className="spin" />Loading milestone</div>;
  if (!event || !milestone) return <div className="connect-state"><h2>Milestone unavailable</h2><p>This milestone is not delegated to the connected wallet.</p></div>;

  return (
    <>
      <Link href={`/events/${eventId}`} className="back-link"><ArrowLeft size={16} />Event #{eventId}</Link>
      <div className="page-heading"><div><p className="eyebrow">Milestone {milestoneId + 1}</p><h1>Submit evidence</h1><p>Your wallet signature authorizes the platform wallet to trigger GenLayer comparative review.</p></div></div>
      <form className="form-surface compact" onSubmit={submit}>
        <div className="criterion-panel"><div><small>Funded criterion</small><strong>{milestone.criteria}</strong></div><div><small>Payout</small><strong>{formatUsdc(milestone.amountUsdc)}</strong></div><div><small>Required score</small><strong>{milestone.minimumScore}/100</strong></div></div>
        <label>Evidence statement<textarea minLength={20} maxLength={10000} value={statement} onChange={(event) => setStatement(event.target.value)} required placeholder="Explain what was completed and map each claim to public evidence." /></label>
        <label>Public evidence links<textarea value={linksText} onChange={(event) => setLinksText(event.target.value)} required placeholder={"https://...\nipfs://..."} /><span className="field-hint"><Link2 size={13} />One retrievable HTTPS or IPFS source per line</span></label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-footer"><span>GenLayer will score, review, cite, and suggest improvements.</span><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}Request review</button></div>
      </form>
    </>
  );
}
