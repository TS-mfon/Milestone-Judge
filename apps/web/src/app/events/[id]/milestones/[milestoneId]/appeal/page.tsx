"use client";

import { ArrowLeft, LoaderCircle, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { useWallet } from "@/components/wallet-provider";
import { reviewTypedData } from "@/lib/auth";
import { useEvents } from "@/lib/client-events";
import { publicConfig } from "@/lib/config";
import { erc20Abi, escrowAbi } from "@/lib/contracts";
import { apiError, userError } from "@/lib/errors";
import type { ReviewRequest } from "@/lib/types";
import { uniqueAttemptId, unixSeconds } from "@/lib/time";
import { baseWalletClient, ensureBaseSepolia } from "@/lib/wallet";

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

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!address || !event || !milestone) return;
    const links = linksText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (links.length === 0) return setError("Provide public evidence supporting the appeal.");
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
      const signature = await client.signTypedData({ account, ...reviewTypedData(unsigned) });
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...unsigned, signature }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Appeal review failed."));
      const result = (await response.json()) as { id: string; transactionHash: string };
      router.push(`/reviews/${encodeURIComponent(result.id)}?transactionHash=${result.transactionHash}`);
    } catch (caught) {
      setError(userError(caught, "Appeal submission failed."));
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  if (!address) return <div className="connect-state"><Wallet size={28} /><h2>Connect the creator wallet</h2><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>;
  if (loading && !event) return <div className="loading-state"><LoaderCircle className="spin" />Loading appeal state</div>;
  if (!event || !milestone) return <div className="connect-state"><h2>Appeal unavailable</h2><p>Only the event creator can access this workflow.</p></div>;

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
