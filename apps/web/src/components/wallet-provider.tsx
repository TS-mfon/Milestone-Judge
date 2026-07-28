"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { userError } from "@/lib/errors";
import { connectBaseWallet } from "@/lib/wallet";

type WalletContextValue = {
  address: Address | null;
  chainId: number | null;
  error: string;
  connect: () => Promise<Address | null>;
  clearError: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const sync = useCallback(async () => {
    if (!window.ethereum) return;
    const [accounts, chain] = await Promise.all([
      window.ethereum.request({ method: "eth_accounts" }) as Promise<Address[]>,
      window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setAddress(accounts[0] || null);
    setChainId(Number.parseInt(chain, 16));
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void sync(), 0);
    if (!window.ethereum?.on) return;
    const accountsChanged = (accounts: unknown) =>
      setAddress(((accounts as Address[])[0] || null));
    const chainChanged = (chain: unknown) =>
      setChainId(Number.parseInt(String(chain), 16));
    window.ethereum.on("accountsChanged", accountsChanged);
    window.ethereum.on("chainChanged", chainChanged);
    return () => {
      window.clearTimeout(initial);
      window.ethereum?.removeListener?.("accountsChanged", accountsChanged);
      window.ethereum?.removeListener?.("chainChanged", chainChanged);
    };
  }, [sync]);

  const connect = useCallback(async () => {
    try {
      setError("");
      const next = await connectBaseWallet();
      setAddress(next);
      setChainId(84532);
      return next;
    } catch (caught) {
      setError(userError(caught, "Wallet connection failed."));
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      address,
      chainId,
      error,
      connect,
      clearError: () => setError(""),
    }),
    [address, chainId, error, connect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
