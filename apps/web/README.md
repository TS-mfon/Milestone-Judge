# Milestone Judge Web

This workspace contains the Next.js dashboard and stateless API for Milestone
Judge.

The application reads event and escrow state from Base Sepolia and evidence
review state from GenLayer StudioNet. It has no database or demo mode. Hosted
1Shot relay requests are created server-side with exact-call MetaMask
delegations.

Run from the repository root:

```bash
npm install
npm run dev
```

Production is deployed at:

`https://ma-milestone-verifier.vercel.app`
