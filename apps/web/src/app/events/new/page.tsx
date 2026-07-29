"use client";

import { Check, LoaderCircle, Plus, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createPublicClient,
  decodeEventLog,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { useWallet } from "@/components/wallet-provider";
import { isContractConfigured, publicConfig } from "@/lib/config";
import { erc20Abi, escrowAbi } from "@/lib/contracts";
import { userError } from "@/lib/errors";
import { formatUsdc } from "@/lib/format";
import { unixSeconds } from "@/lib/time";
import { baseWalletClient, ensureBaseSepolia } from "@/lib/wallet";

type DraftMilestone = { criteria: string; amount: string; minimumScore: string };
const initialMilestone = (): DraftMilestone => ({
  criteria: "",
  amount: "",
  minimumScore: "80",
});

export default function NewEventPage() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [termsCid, setTermsCid] = useState("");
  const [challengePeriod, setChallengePeriod] = useState("0");
  const [milestones, setMilestones] = useState<DraftMilestone[]>([initialMilestone()]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const total = milestones.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  function update(index: number, patch: Partial<DraftMilestone>) {
    setMilestones((current) =>
      current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!isContractConfigured) return setError("The live contract addresses are not configured.");
    if (!address) return setError("Connect the creator wallet before funding an event.");
    if (!isAddress(assignee)) return setError("Enter a valid assigned wallet address.");
    const deadlineSeconds = Math.floor(new Date(deadline).getTime() / 1000);
    if (!deadlineSeconds || deadlineSeconds <= unixSeconds() + 600) {
      return setError("The deadline must leave at least 10 minutes for review and settlement.");
    }
    if (milestones.some((item) =>
      item.criteria.trim().length < 10 ||
      Number(item.amount) <= 0 ||
      Number(item.minimumScore) < 1 ||
      Number(item.minimumScore) > 100
    )) return setError("Every milestone needs measurable criteria, an amount, and a score from 1 to 100.");

    setBusy(true);
    try {
      const { client, account } = await baseWalletClient(address);
      const publicClient = createPublicClient({
        chain: publicConfig.chain,
        transport: http(publicConfig.baseRpcUrl),
      });
      const required = parseUnits(total.toFixed(6), 6);
      const balance = await publicClient.readContract({
        address: publicConfig.usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
      if (balance < required) throw new Error(`This wallet needs ${formatUsdc(total)} USDC to fund the event.`);

      setStage("Creating event on Base Sepolia");
      await ensureBaseSepolia();
      const createHash = await client.writeContract({
        account,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "createEvent",
        args: [
          assignee,
          title.trim(),
          termsCid.trim(),
          BigInt(deadlineSeconds),
          Number(challengePeriod),
        ],
      });
      const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
      let eventId = 0;
      for (const log of createReceipt.logs) {
        if (log.address.toLowerCase() !== publicConfig.escrowAddress.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === "EventCreated") eventId = Number(decoded.args.eventId);
        } catch {}
      }
      if (!eventId) throw new Error("The event transaction confirmed without an EventCreated record.");

      setStage("Writing milestone criteria and score thresholds");
      await ensureBaseSepolia();
      const milestoneHash = await client.writeContract({
        account,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "addMilestones",
        args: [
          BigInt(eventId),
          milestones.map((item) => item.criteria.trim()),
          milestones.map((item) => parseUnits(item.amount, 6)),
          milestones.map((item) => Number(item.minimumScore)),
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: milestoneHash });

      setStage("Approving USDC escrow");
      await ensureBaseSepolia();
      const approvalHash = await client.writeContract({
        account,
        address: publicConfig.usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [publicConfig.escrowAddress, required],
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });

      setStage("Locking funds and activating event");
      await ensureBaseSepolia();
      const activationHash = await client.writeContract({
        account,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "fundAndActivate",
        args: [BigInt(eventId)],
      });
      await publicClient.waitForTransactionReceipt({ hash: activationHash });
      router.push(`/events/${eventId}`);
    } catch (caught) {
      setError(userError(caught, "Event creation failed."));
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  if (!address) {
    return <div className="connect-state"><Wallet size={28} /><h2>Connect the creator wallet</h2><p>The wallet will create the event, approve USDC, and lock the full milestone budget.</p><button className="primary-button" onClick={() => void connect()}>Connect wallet</button></div>;
  }

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">New funded event</p><h1>Create and lock USDC</h1><p>Define measurable milestones and the minimum GenLayer score required for each payout.</p></div></div>
      <form className="form-surface" onSubmit={submit}>
        <section className="form-section">
          <div className="section-number">01</div>
          <div className="form-section-body">
            <h2>Event terms</h2>
            <div className="field-grid">
              <label>Event title<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} placeholder="Production launch delivery" /></label>
              <label>Assigned wallet<input value={assignee} onChange={(event) => setAssignee(event.target.value)} required placeholder="0x..." /></label>
              <label>Completion deadline<input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} required /></label>
              <label>Terms document URL<input value={termsCid} onChange={(event) => setTermsCid(event.target.value)} placeholder="Suggested: https://write.as/your-terms" /></label>
              <label>Settlement policy
                <select value={challengePeriod} onChange={(event) => setChallengePeriod(event.target.value)}>
                  <option value="0">Instant payout, no appeal</option>
                  <option value="3600">1 hour challenge window</option>
                  <option value="86400">24 hour challenge window</option>
                  <option value="259200">3 day challenge window</option>
                </select>
              </label>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="section-number">02</div>
          <div className="form-section-body">
            <div className="builder-heading"><div><h2>Milestones</h2><p>Each score is enforced by the Base escrow contract.</p></div><button type="button" className="secondary-button" onClick={() => setMilestones((items) => [...items, initialMilestone()])}><Plus size={16} />Add milestone</button></div>
            <div className="milestone-builder">
              {milestones.map((item, index) => (
                <div className="milestone-editor" key={index}>
                  <span className="milestone-number">{index + 1}</span>
                  <label>Natural-language completion criterion<textarea value={item.criteria} onChange={(event) => update(index, { criteria: event.target.value })} required placeholder="Describe the measurable outcome and acceptable public evidence." /></label>
                  <label>USDC amount<input type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => update(index, { amount: event.target.value })} required /></label>
                  <label>Minimum score<input type="number" min="1" max="100" value={item.minimumScore} onChange={(event) => update(index, { minimumScore: event.target.value })} required /></label>
                  {milestones.length > 1 && <button type="button" className="icon-button danger" onClick={() => setMilestones((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove milestone"><Trash2 size={17} /></button>}
                </div>
              ))}
            </div>
          </div>
        </section>
        {error && <div className="form-error">{error}</div>}
        <footer className="form-footer">
          <div><small>Total escrow</small><strong>{formatUsdc(total)}</strong></div>
          <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{stage || "Approve and fund"}</button>
        </footer>
      </form>
    </>
  );
}
