import { ArrowRight, BrainCircuit, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ObsidianFlow } from "@/components/obsidian-flow";

export default function Home() {
  return (
    <div className="landing">
      <ObsidianFlow />
      <header className="landing-nav">
        <Link href="/" className="brand"><span className="brand-mark">M</span><span>Milestone Judge</span></Link>
        <Link href="/app" className="primary-button">Open app <ArrowRight size={17} /></Link>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Base Sepolia + GenLayer StudioNet</p>
          <h1>Milestone Judge</h1>
          <p>Lock USDC against measurable work. Submit public evidence. Release each payout only after GenLayer reaches comparative consensus and the verdict clears the creator&apos;s required score.</p>
          <div className="hero-actions">
            <Link href="/events/new" className="primary-button">Create funded event <ArrowRight size={17} /></Link>
            <Link href="/events/assigned" className="secondary-button">View assigned work</Link>
          </div>
        </div>
        <div className="hero-signal"><span>LIVE SETTLEMENT PATH</span><strong>USDC → Evidence → Consensus → Payout</strong></div>
      </section>
      <section className="landing-band">
        <article><LockKeyhole /><strong>Funds locked on Base</strong><p>Each milestone has an exact USDC allocation and creator-defined score threshold.</p></article>
        <article><BrainCircuit /><strong>Comparative consensus</strong><p>GenLayer scores, reviews, cites evidence, and returns concrete improvements.</p></article>
        <article><ShieldCheck /><strong>Platform settlement</strong><p>The platform wallet alone submits reviews and hosted 1Shot relays Base settlement.</p></article>
      </section>
    </div>
  );
}
