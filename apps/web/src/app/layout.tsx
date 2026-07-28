import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });

export const metadata: Metadata = {
  title: { default: "Milestone Judge", template: "%s | Milestone Judge" },
  description: "USDC milestone escrow with GenLayer comparative consensus verification.",
  icons: { icon: "/icon" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable}>
      <body><WalletProvider>{children}</WalletProvider></body>
    </html>
  );
}
