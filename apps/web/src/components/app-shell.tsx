"use client";

import {
  BriefcaseBusiness,
  FilePlus2,
  Files,
  Gauge,
  History,
  Menu,
  Network,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { shortAddress } from "@/lib/format";
import { useWallet } from "./wallet-provider";

const nav = [
  { href: "/app", label: "Overview", icon: Gauge },
  { href: "/events/assigned", label: "Assigned to me", icon: BriefcaseBusiness },
  { href: "/events/created", label: "Created by me", icon: Files },
  { href: "/history", label: "History", icon: History },
  { href: "/events/new", label: "Create event", icon: FilePlus2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { address, chainId, connect, error, clearError } = useWallet();

  return (
    <div className="app-shell">
      <aside className={open ? "sidebar sidebar-open" : "sidebar"}>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">M</span>
          <span>Milestone Judge</span>
        </Link>
        <p className="nav-label">Navigator</p>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={
                pathname === href ||
                (href !== "/app" && pathname.startsWith(`${href}/`))
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="network-panel">
          <div><span className="network-dot" />Base Sepolia</div>
          <div><span className="network-dot cyan" />GenLayer StudioNet</div>
          <div className={chainId === 84532 ? "chain-state ready" : "chain-state"}>
            <Network size={14} />
            {chainId === 84532 ? "Wallet network ready" : "Network switch required"}
          </div>
        </div>
      </aside>
      {open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(!open)} aria-label="Open navigation">
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
          <div className="topbar-status">
            <ShieldCheck size={16} />
            On-chain escrow and comparative consensus
          </div>
          <button className="wallet-button" onClick={() => void connect()}>
            <Wallet size={17} />
            {address ? shortAddress(address) : "Connect wallet"}
          </button>
        </header>
        {error && (
          <div className="global-error">
            <span>{error}</span>
            <button onClick={clearError} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
