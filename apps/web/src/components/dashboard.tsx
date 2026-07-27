"use client";

import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  http,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
} from "viem";
import { useEffect, useMemo, useState } from "react";
import { reviewTypedData } from "@/lib/auth";
import { isContractConfigured, publicConfig } from "@/lib/config";
import { erc20Abi, escrowAbi } from "@/lib/contracts";
import type { Milestone, MilestoneEvent, ReviewRequest } from "@/lib/types";

type View = "overview" | "assigned" | "created" | "reviews";

const statusLabel = {
  not_submitted: "Evidence needed",
  queued: "Queued",
  submitted: "GenLayer review",
  finalized: "Reviewed",
  approval_queued: "Opening challenge",
  challenge_window: "Challenge window",
  appeal_resolution_queued: "Appeal review",
  payout_queued: "Payout queued",
  paid: "Paid",
  failed: "Action required",
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUsdc(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function relativeDeadline(value: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  return days > 0 ? `${days} days left` : "Deadline passed";
}

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [events, setEvents] = useState<MilestoneEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<{
    event: MilestoneEvent;
    milestone: Milestone;
  } | null>(null);
  const [appealTarget, setAppealTarget] = useState<{
    event: MilestoneEvent;
    milestone: Milestone;
  } | null>(null);
  const [notice, setNotice] = useState("");

  async function refreshEvents() {
    if (!isContractConfigured) {
      setNotice("Live Base Sepolia contracts are not configured.");
      return;
    }
    fetch("/api/events")
      .then((response) => response.json())
      .then((payload) => {
        if (Array.isArray(payload.events)) {
          setEvents(payload.events);
        }
      })
      .catch(() => setNotice("Unable to read the Base Sepolia and GenLayer contracts."));
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshEvents(), 0);
    const interval = window.setInterval(() => void refreshEvents(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  const totals = useMemo(() => {
    const milestones = events.flatMap((event) => event.milestones);
    return {
      locked: milestones
        .filter((item) => item.reviewStatus !== "paid")
        .reduce((sum, item) => sum + item.amountUsdc, 0),
      paid: milestones
        .filter((item) => item.reviewStatus === "paid")
        .reduce((sum, item) => sum + item.amountUsdc, 0),
      review: milestones.filter((item) =>
        [
          "queued",
          "submitted",
          "approval_queued",
          "challenge_window",
          "appeal_resolution_queued",
          "payout_queued",
        ].includes(item.reviewStatus),
      ).length,
      due: milestones.filter((item) => item.reviewStatus === "not_submitted").length,
    };
  }, [events]);

  const visibleEvents = events.filter((event) => {
    if (statusFilter !== "all" && event.status !== statusFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (
      query &&
      !event.title.toLowerCase().includes(query) &&
      !event.creator.toLowerCase().includes(query) &&
      !event.assignee.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (view === "assigned" && wallet) return event.assignee.toLowerCase() === wallet.toLowerCase();
    if (view === "created" && wallet) return event.creator.toLowerCase() === wallet.toLowerCase();
    if (view === "reviews") {
      return event.milestones.some((item) => item.reviewStatus !== "not_submitted");
    }
    return true;
  });

  async function connectWallet() {
    if (!window.ethereum) {
      setNotice("Install an EVM wallet to connect.");
      return;
    }
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as `0x${string}`[];
    setWallet(accounts[0]);
  }

  function eventCreated() {
    setCreateOpen(false);
    setNotice("Event funded on Base Sepolia.");
    void refreshEvents();
  }

  function updateMilestone(eventId: number, milestoneId: number, patch: Partial<Milestone>) {
    setEvents((current) =>
      current.map((event) =>
        event.id !== eventId
          ? event
          : {
              ...event,
              milestones: event.milestones.map((milestone) =>
                milestone.id === milestoneId ? { ...milestone, ...patch } : milestone,
              ),
            },
      ),
    );
  }

  async function settleMilestone(
    event: MilestoneEvent,
    milestone: Milestone,
    action: "proposal" | "payout" | "appeal-resolution",
  ) {
    if (!milestone.reviewId) {
      setNotice("The finalized GenLayer review is not available yet.");
      return;
    }
    const response = await fetch(`/api/reviews/${encodeURIComponent(milestone.reviewId)}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        eventId: event.id,
        milestoneId: milestone.id,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error || "Settlement request failed");
      return;
    }
    setNotice(`1Shot accepted the ${action.replace("-", " ")} request.`);
    window.setTimeout(() => void refreshEvents(), 4_000);
  }

  async function refundEvent(event: MilestoneEvent) {
    if (!wallet || !window.ethereum || wallet.toLowerCase() !== event.creator.toLowerCase()) {
      setNotice("Connect the event creator wallet to claim the refund.");
      return;
    }
    try {
      const walletClient = createWalletClient({
        chain: publicConfig.chain,
        transport: custom(window.ethereum),
      });
      const publicClient = createPublicClient({
        chain: publicConfig.chain,
        transport: http(publicConfig.baseRpcUrl),
      });
      const hash = await walletClient.writeContract({
        account: wallet,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "refundEvent",
        args: [BigInt(event.id)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setNotice("Unpaid USDC refunded to the event creator.");
      await refreshEvents();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Refund failed");
    }
  }

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><FileCheck2 size={20} /></div>
          <span>Milestone</span>
        </div>
        <nav>
          <NavButton icon={<LayoutDashboard />} active={view === "overview"} onClick={() => setView("overview")}>
            Overview
          </NavButton>
          <NavButton icon={<BriefcaseBusiness />} active={view === "assigned"} onClick={() => setView("assigned")}>
            Assigned to me
          </NavButton>
          <NavButton icon={<FileText />} active={view === "created"} onClick={() => setView("created")}>
            Created by me
          </NavButton>
          <NavButton icon={<Sparkles />} active={view === "reviews"} onClick={() => setView("reviews")}>
            Reviews
          </NavButton>
        </nav>
        <div className="network-panel">
          <div><span className="network-dot" />Base Sepolia</div>
          <div><span className="network-dot genlayer" />GenLayer StudioNet</div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
            <Menu />
          </button>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search events"
              placeholder="Search events or wallet"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button className="wallet-button" onClick={connectWallet}>
            <Wallet size={17} />
            {wallet ? shortAddress(wallet) : "Connect wallet"}
          </button>
        </header>

        <div className="content">
          {notice && (
            <div className="notice">
              <ShieldCheck size={17} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <p className="eyebrow">Settlement workspace</p>
              <h1>{view === "overview" ? "Milestone overview" : view === "assigned" ? "Assigned events" : view === "created" ? "Created events" : "Review activity"}</h1>
            </div>
            <button className="primary-button" onClick={() => setCreateOpen(true)}>
              <Plus size={18} /> New event
            </button>
          </div>

          <section className="stats-band">
            <Stat icon={<CircleDollarSign />} label="Locked in escrow" value={formatUsdc(totals.locked)} tone="dark" />
            <Stat icon={<CheckCircle2 />} label="Released" value={formatUsdc(totals.paid)} tone="green" />
            <Stat icon={<Activity />} label="Under review" value={String(totals.review)} tone="blue" />
            <Stat icon={<CalendarClock />} label="Evidence needed" value={String(totals.due)} tone="amber" />
          </section>

          <section className="workspace">
            <div className="section-toolbar">
              <div>
                <h2>Active events</h2>
                <p>{visibleEvents.length} funded workspaces</p>
              </div>
              <label className="select-wrap">
                <select
                  aria-label="Filter event status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | "active" | "completed")
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
                <ChevronDown size={15} />
              </label>
            </div>

            <div className="event-list">
              {visibleEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onEvidence={(milestone) => setEvidenceTarget({ event, milestone })}
                  onAppeal={(milestone) => setAppealTarget({ event, milestone })}
                  onSettle={(milestone, action) => void settleMilestone(event, milestone, action)}
                  onRefund={() => void refundEvent(event)}
                  connectedWallet={wallet}
                />
              ))}
              {visibleEvents.length === 0 && (
                <div className="empty-state">
                  <FileCheck2 size={30} />
                  <h3>No matching events</h3>
                  <p>Connect the relevant wallet or create a funded event.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {createOpen && (
        <CreateEventModal
          wallet={wallet}
          onClose={() => setCreateOpen(false)}
          onCreated={eventCreated}
          onNotice={setNotice}
        />
      )}
      {evidenceTarget && (
        <EvidenceModal
          wallet={wallet}
          target={evidenceTarget}
          onClose={() => setEvidenceTarget(null)}
          onQueued={(reviewId, transactionHash, statement, links) => {
            updateMilestone(evidenceTarget.event.id, evidenceTarget.milestone.id, {
              reviewStatus: "submitted",
              reviewId,
              genlayerTxHash: transactionHash,
              evidenceStatement: statement,
              evidenceLinks: links,
            });
            setEvidenceTarget(null);
            setNotice("Evidence signed and queued for GenLayer review.");
          }}
        />
      )}
      {appealTarget && (
        <AppealModal
          wallet={wallet}
          target={appealTarget}
          onClose={() => setAppealTarget(null)}
          onQueued={(reviewId, transactionHash) => {
            updateMilestone(appealTarget.event.id, appealTarget.milestone.id, {
              reviewStatus: "appeal_resolution_queued",
              reviewId,
              genlayerTxHash: transactionHash,
            });
            setAppealTarget(null);
            setNotice("Appeal bond submitted and GenLayer appeal review queued.");
          }}
        />
      )}
    </div>
  );
}

function NavButton({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{icon}{children}</button>;
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <div className="stat"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong></div></div>;
}

function EventRow({
  event,
  onEvidence,
  onAppeal,
  onSettle,
  onRefund,
  connectedWallet,
}: {
  event: MilestoneEvent;
  onEvidence: (milestone: Milestone) => void;
  onAppeal: (milestone: Milestone) => void;
  onSettle: (
    milestone: Milestone,
    action: "proposal" | "payout" | "appeal-resolution",
  ) => void;
  onRefund: () => void;
  connectedWallet: `0x${string}` | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = event.milestones.reduce((sum, item) => sum + item.amountUsdc, 0);
  const paid = event.milestones.filter((item) => item.reviewStatus === "paid").length;
  return (
    <article className="event-row">
      <button className="event-summary" onClick={() => setExpanded(!expanded)}>
        <div className="event-id">#{event.id}</div>
        <div className="event-title"><strong>{event.title}</strong><span>Assigned to {shortAddress(event.assignee)}</span></div>
        <div className="event-metric"><span>Escrow</span><strong>{formatUsdc(total)}</strong></div>
        <div className="event-metric"><span>Progress</span><strong>{paid}/{event.milestones.length}</strong></div>
        <div className="deadline"><Clock3 size={15} />{relativeDeadline(event.deadline)}</div>
        <ChevronDown className={expanded ? "rotated" : ""} size={18} />
      </button>
      {expanded && (
        <div className="milestone-table">
          {event.milestones.map((milestone) => (
            <div className="milestone-row" key={milestone.id}>
              <div className="milestone-index">{milestone.reviewStatus === "paid" ? <Check size={15} /> : milestone.id + 1}</div>
              <div className="milestone-copy"><strong>{milestone.criteria}</strong>{milestone.explanation && <p>{milestone.explanation}</p>}</div>
              <strong className="amount">{formatUsdc(milestone.amountUsdc)}</strong>
              <span className={`status ${milestone.reviewStatus}`}>{statusLabel[milestone.reviewStatus]}</span>
              {milestone.appealOpen && milestone.reviewStatus === "finalized" ? (
                <button className="action-button" onClick={() => onSettle(milestone, "appeal-resolution")}>
                  Resolve appeal <ArrowUpRight size={15} />
                </button>
              ) : milestone.reviewStatus === "challenge_window" && milestone.payoutReady ? (
                <button className="action-button" onClick={() => onSettle(milestone, "payout")}>
                  Release payout <ArrowUpRight size={15} />
                </button>
              ) : milestone.reviewStatus === "challenge_window" ? (
                <button className="action-button danger-action" onClick={() => onAppeal(milestone)}>
                  Open appeal <ArrowUpRight size={15} />
                </button>
              ) : milestone.reviewStatus === "finalized" && milestone.decision === "approved" ? (
                <button className="action-button" onClick={() => onSettle(milestone, "proposal")}>
                  Propose approval <ArrowUpRight size={15} />
                </button>
              ) : ["not_submitted", "finalized", "failed"].includes(milestone.reviewStatus) ? (
                <button className="action-button" onClick={() => onEvidence(milestone)}>Submit evidence <ArrowUpRight size={15} /></button>
              ) : (
                <button className="icon-button" title="Open review"><ArrowUpRight size={16} /></button>
              )}
            </div>
          ))}
          {event.refundReady &&
            connectedWallet?.toLowerCase() === event.creator.toLowerCase() && (
              <div className="milestone-row">
                <div className="milestone-index"><CircleDollarSign size={15} /></div>
                <div className="milestone-copy">
                  <strong>Refund unpaid escrow</strong>
                  <p>The event deadline has passed.</p>
                </div>
                <span />
                <span />
                <button className="action-button danger-action" onClick={onRefund}>
                  Claim refund <ArrowUpRight size={15} />
                </button>
              </div>
            )}
        </div>
      )}
    </article>
  );
}

function ModalFrame({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop"><section className="modal"><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>{children}</section></div>;
}

function CreateEventModal({ wallet, onClose, onCreated, onNotice }: { wallet: `0x${string}` | null; onClose: () => void; onCreated: () => void; onNotice: (notice: string) => void }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [termsCid, setTermsCid] = useState("");
  const [milestones, setMilestones] = useState([{ criteria: "", amount: "" }]);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isAddress(assignee) || !deadline || milestones.some((item) => !item.criteria || Number(item.amount) <= 0)) return;
    if (!isContractConfigured || !wallet || !window.ethereum) {
      onNotice("Connect a wallet and configure the live Base Sepolia contracts.");
      return;
    }
    setBusy(true);
    try {
      const walletClient = createWalletClient({ chain: publicConfig.chain, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: publicConfig.chain, transport: http(publicConfig.baseRpcUrl) });
      const createHash = await walletClient.writeContract({
        account: wallet,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "createEvent",
        args: [assignee as `0x${string}`, title, termsCid, BigInt(Math.floor(new Date(deadline).getTime() / 1000))],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
      let eventId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === "EventCreated") eventId = Number(decoded.args.eventId);
        } catch {}
      }
      if (!eventId) throw new Error("EventCreated log was not found");
      const milestoneHash = await walletClient.writeContract({
        account: wallet,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "addMilestones",
        args: [BigInt(eventId), milestones.map((item) => item.criteria), milestones.map((item) => parseUnits(item.amount, 6))],
      });
      await publicClient.waitForTransactionReceipt({ hash: milestoneHash });
      const total = milestones.reduce((sum, item) => sum + Number(item.amount), 0);
      const approvalHash = await walletClient.writeContract({
        account: wallet,
        address: publicConfig.usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [publicConfig.escrowAddress, parseUnits(String(total), 6)],
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      const activationHash = await walletClient.writeContract({
        account: wallet,
        address: publicConfig.escrowAddress,
        abi: escrowAbi,
        functionName: "fundAndActivate",
        args: [BigInt(eventId)],
      });
      await publicClient.waitForTransactionReceipt({ hash: activationHash });
      onCreated();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Event creation failed");
    } finally {
      setBusy(false);
    }
  }

  return <ModalFrame title="Create funded event" subtitle="Base Sepolia escrow" onClose={onClose}>
    <form className="modal-body" onSubmit={submit}>
      <label>Event title<input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Q3 growth program" /></label>
      <div className="field-grid">
        <label>Assigned wallet<input value={assignee} onChange={(e) => setAssignee(e.target.value)} required placeholder="0x..." /></label>
        <label>Completion deadline<input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required /></label>
      </div>
      <label>Terms CID<input value={termsCid} onChange={(e) => setTermsCid(e.target.value)} placeholder="ipfs://..." /></label>
      <div className="milestone-builder">
        <div className="builder-heading"><strong>Milestones</strong><button type="button" className="text-button" onClick={() => setMilestones([...milestones, { criteria: "", amount: "" }])}><Plus size={15} /> Add</button></div>
        {milestones.map((item, index) => <div className="milestone-input" key={index}><span>{index + 1}</span><textarea value={item.criteria} onChange={(e) => setMilestones(milestones.map((row, rowIndex) => rowIndex === index ? { ...row, criteria: e.target.value } : row))} placeholder="Describe the measurable completion criterion" required /><label className="amount-input">$<input type="number" min="1" step="0.01" value={item.amount} onChange={(e) => setMilestones(milestones.map((row, rowIndex) => rowIndex === index ? { ...row, amount: e.target.value } : row))} required /></label></div>)}
      </div>
      <footer><span>{formatUsdc(milestones.reduce((sum, item) => sum + Number(item.amount || 0), 0))} total escrow</span><button className="primary-button" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}Approve and fund</button></footer>
    </form>
  </ModalFrame>;
}

function EvidenceModal({ wallet, target, onClose, onQueued }: { wallet: `0x${string}` | null; target: { event: MilestoneEvent; milestone: Milestone }; onClose: () => void; onQueued: (reviewId: string, transactionHash: `0x${string}`, statement: string, links: string[]) => void }) {
  const [statement, setStatement] = useState(target.milestone.evidenceStatement || "");
  const [linksText, setLinksText] = useState(target.milestone.evidenceLinks?.join("\n") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const links = linksText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (!wallet || !window.ethereum) { setError("Connect the assigned wallet before submitting evidence."); return; }
    if (wallet.toLowerCase() !== target.event.assignee.toLowerCase()) { setError("The connected wallet is not the event assignee."); return; }
    setBusy(true);
    try {
      const unsigned = {
        kind: "initial" as const,
        eventId: target.event.id,
        milestoneId: target.milestone.id,
        attemptId: 1,
        requester: wallet,
        assignee: wallet,
        criterion: target.milestone.criteria,
        criterionHash: keccak256(stringToHex(target.milestone.criteria)),
        evidenceStatement: statement,
        evidenceLinks: links,
        appealContext: "",
        nonce: crypto.randomUUID(),
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      } satisfies Omit<ReviewRequest, "signature">;
      const client = createWalletClient({ chain: publicConfig.chain, transport: custom(window.ethereum) });
      const signature = await client.signTypedData({ account: wallet, ...reviewTypedData(unsigned) });
      const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...unsigned, signature }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Review request failed");
      onQueued(result.id, result.transactionHash, statement, links);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review request failed");
    } finally {
      setBusy(false);
    }
  }

  return <ModalFrame title="Submit milestone evidence" subtitle={`Event #${target.event.id} / Milestone ${target.milestone.id + 1}`} onClose={onClose}>
    <form className="modal-body" onSubmit={submit}>
      <div className="criterion-box"><FileCheck2 size={18} /><p>{target.milestone.criteria}</p><strong>{formatUsdc(target.milestone.amountUsdc)}</strong></div>
      <label>Evidence statement<textarea value={statement} onChange={(e) => setStatement(e.target.value)} minLength={20} required placeholder="Describe what was completed and how each source proves it." /></label>
      <label>Public evidence links<textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} required placeholder={"https://...\nipfs://..."} /><span className="field-hint"><Link2 size={13} /> One retrievable HTTPS or IPFS link per line</span></label>
      {error && <div className="form-error">{error}</div>}
      <footer><span>Signed by {wallet ? shortAddress(wallet) : "connected assignee"}</span><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}Request GenLayer review</button></footer>
    </form>
  </ModalFrame>;
}

function AppealModal({
  wallet,
  target,
  onClose,
  onQueued,
}: {
  wallet: `0x${string}` | null;
  target: { event: MilestoneEvent; milestone: Milestone };
  onClose: () => void;
  onQueued: (reviewId: string, transactionHash: `0x${string}`) => void;
}) {
  const [reason, setReason] = useState("");
  const [linksText, setLinksText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const links = linksText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (!wallet || !window.ethereum) {
      setError("Connect the event creator wallet before opening an appeal.");
      return;
    }
    if (wallet.toLowerCase() !== target.event.creator.toLowerCase()) {
      setError("Only the event creator can open this appeal.");
      return;
    }
    setBusy(true);
    try {
      const walletClient = createWalletClient({
        chain: publicConfig.chain,
        transport: custom(window.ethereum),
      });
      if (isContractConfigured) {
        const publicClient = createPublicClient({
          chain: publicConfig.chain,
          transport: http(publicConfig.baseRpcUrl),
        });
        const bond = await publicClient.readContract({
          address: publicConfig.escrowAddress,
          abi: escrowAbi,
          functionName: "appealBond",
          args: [BigInt(target.event.id), BigInt(target.milestone.id)],
        });
        const approvalHash = await walletClient.writeContract({
          account: wallet,
          address: publicConfig.usdcAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [publicConfig.escrowAddress, bond],
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        const appealHash = await walletClient.writeContract({
          account: wallet,
          address: publicConfig.escrowAddress,
          abi: escrowAbi,
          functionName: "openAppeal",
          args: [
            BigInt(target.event.id),
            BigInt(target.milestone.id),
            keccak256(stringToHex(reason)),
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash: appealHash });
      }

      const unsigned = {
        kind: "appeal" as const,
        eventId: target.event.id,
        milestoneId: target.milestone.id,
        attemptId: 2,
        requester: wallet,
        assignee: target.event.assignee,
        criterion: target.milestone.criteria,
        criterionHash: keccak256(stringToHex(target.milestone.criteria)),
        evidenceStatement: reason,
        evidenceLinks: links,
        appealContext: `Creator appeal against ${
          target.milestone.reviewId || "the proposed approval"
        }: ${reason}`,
        nonce: crypto.randomUUID(),
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      } satisfies Omit<ReviewRequest, "signature">;
      const signature = await walletClient.signTypedData({
        account: wallet,
        ...reviewTypedData(unsigned),
      });
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...unsigned, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Appeal review request failed");
      onQueued(result.id, result.transactionHash);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Appeal submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalFrame
      title="Challenge proposed approval"
      subtitle={`Event #${target.event.id} / Milestone ${target.milestone.id + 1}`}
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <div className="criterion-box">
          <ShieldCheck size={18} />
          <p>{target.milestone.criteria}</p>
          <strong>{formatUsdc(target.milestone.amountUsdc)}</strong>
        </div>
        <label>
          Appeal reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={20}
            required
            placeholder="Identify the unsupported finding or material evidence the initial review missed."
          />
        </label>
        <label>
          Additional public evidence
          <textarea
            value={linksText}
            onChange={(event) => setLinksText(event.target.value)}
            required
            placeholder={"https://...\nipfs://..."}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <footer>
          <span>1% bond, minimum 1 USDC</span>
          <button className="primary-button appeal-button" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
            Bond and request appeal
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}
