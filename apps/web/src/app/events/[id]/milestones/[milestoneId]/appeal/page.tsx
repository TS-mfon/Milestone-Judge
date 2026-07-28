"use client";

import { ArrowLeft, LoaderCircle, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { useWallet } from "@/components/wallet-provider";
import { reviewTypedData } from "@/lib/auth";
import { useEvents } from "@/lib/client-events";
import { publicConfig } from "@/lib/config";
import { erc20Abi, escrowAbi } from "@/lib/contracts";
import { apiError, userError } from "@/lib/errors";
import {
  readPendingReview,
  savePendingReview,
  type PendingReview,
} from "@/lib/pending-review";
import type { ReviewRequest } from "@/lib/types";
import { uniqueAttemptId, unixSeconds } from "@/lib/time";
import {
  baseWalletClient,
  ensureBaseSepolia,
  signatureWalletClient,
} from "@/lib/wallet";

export default function AppealPage() {
  const params = useParams<{ id: string; milestoneId: string }>();
  const router = useRouter();
  const eventId = Number(params.id);
  const milestoneId = Number(params.milestoneId);
  const { address, connect } = useWallet();
  const { events, loading } = useEvents(address, "created");
  const event = events.find((item) => item.id === eventId);
  const milestone = event?.milestones.find((item) => item.id === milestoneId);
  const [reason, setReason] = useState("");
  const [linksText, setLinksText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const submissionLock = useRef(false);

  useEffect(() => {
    const initial = window.setTimeout(
      () => {
        setPending(readPendingReview("appeal", eventId, milestoneId));
        setPendingLoaded(true);
      },
      0,
    );
    return () => window.clearTimeout(initial);
  }, [eventId, milestoneId]);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (submissionLock.current || pending) {
      return setError("An appeal review is already in progress.");
    }
    if (!address || !event || !milestone) return;
    const links = linksText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (links.length === 0) return setError("Provide public evidence supporting the appeal.");
    submissionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const { client, account } = await baseWalletClient(address);
      const publicClient = createPublicClient({ chain: publicConfig.chain, transport: http(publicConfig.baseRpcUrl) });
      const bond = await publicClient.readContract({
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "appealBond",
        args: [BigInt(eventId), BigInt(milestoneId)],
      });
      setStage("Approving appeal bond");
      const approvalHash = await client.writeContract({
        account,
        address: publicConfig.usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [publicConfig.escrowAddress, bond],
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      setStage("Opening appeal on Base");
      await ensureBaseSepolia();
      const appealHash = await client.writeContract({
        account,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "openAppeal",
        args: [BigInt(eventId), BigInt(milestoneId), keccak256(stringToHex(reason))],
      });
      await publicClient.waitForTransactionReceipt({ hash: appealHash });

      setStage("Authorizing comparative review");
      const unsigned = {
        kind: "appeal" as const,
        eventId,
        milestoneId,
        attemptId: uniqueAttemptId(),
        requester: address,
        assignee: event.assignee,
        criterion: milestone.criteria,
        criterionHash: keccak256(stringToHex(milestone.criteria)),
        evidenceStatement: reason.trim(),
        evidenceLinks: links,
        appealContext: `Creator challenges review ${milestone.reviewId || "unknown"}: ${reason.trim()}`,
        nonce: crypto.randomUUID(),
        expiresAt: unixSeconds() + 900,
      } satisfies Omit<ReviewRequest, "signature">;
      const signatureClient = signatureWalletClient(account);
      const signature = await signatureClient.client.signTypedData({
        account,
        ...reviewTypedData(unsigned),
      });
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...unsigned, signature }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Appeal review failed."));
      const result = (await response.json()) as {
        id: string;
        status: "submitted" | "finalized";
        transactionHash?: string;
      };
      if (result.status === "submitted" && result.transactionHash) {
        const nextPending: PendingReview = {
          id: result.id,
          transactionHash: result.transactionHash,
          kind: "appeal",
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
      setError(userError(caught, "Appeal submission failed."));
    } finally {
      submissionLock.current = false;
      setBusy(false);
      setStage("");
    }
  }

  if (!address) return <div className="connect-state"><Wallet size={28} /><h2>Connect the creator wallet</h2><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>;
  if (loading && !event) return <div className="loading-state"><LoaderCircle className="spin" />Loading appeal state</div>;
  if (!event || !milestone) return <div className="connect-state"><h2>Appeal unavailable</h2><p>Only the event creator can access this workflow.</p></div>;
  if (!pendingLoaded) return <div className="loading-state"><LoaderCircle className="spin" />Checking appeal status</div>;
  if (pending) {
    return (
      <div className="connect-state">
        <LoaderCircle className="spin" size={28} />
        <h2>Appeal review in progress</h2>
        <p>Wait for the active GenLayer result before requesting another appeal review.</p>
        <Link className="primary-button" href={`/reviews/${encodeURIComponent(pending.id)}?transactionHash=${encodeURIComponent(pending.transactionHash)}`}>Open current review</Link>
      </div>
    );
  }

  return (
    <>
      <Link href={`/events/${eventId}`} className="back-link"><ArrowLeft size={16} />Event #{eventId}</Link>
      <div className="page-heading"><div><p className="eyebrow">Creator challenge</p><h1>Open milestone appeal</h1><p>The bond is held on Base while GenLayer independently reviews the dispute.</p></div></div>
      <form className="form-surface compact" onSubmit={submit}>
        <div className="criterion-panel"><div><small>Criterion</small><strong>{milestone.criteria}</strong></div><div><small>Initial score</small><strong>{milestone.score ?? "Pending"}</strong></div><div><small>Required</small><strong>{milestone.minimumScore}</strong></div></div>
        <label>Appeal reason<textarea minLength={20} value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="Identify the unsupported finding, missed evidence, or material exception." /></label>
        <label>Additional public evidence<textarea value={linksText} onChange={(event) => setLinksText(event.target.value)} required placeholder={"https://...\nipfs://..."} /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-footer"><span>Bond: 1% of payout, minimum 1 USDC.</span><button className="danger-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldAlert size={17} />}{stage || "Bond and request appeal"}</button></div>
      </form>
    </>
  );
}
