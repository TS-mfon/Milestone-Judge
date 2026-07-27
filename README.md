# Milestone Verifier

Milestone Verifier is a USDC milestone escrow for Base Sepolia with subjective
evidence review finalized by GenLayer. Event creators lock the full milestone
budget, assignees submit evidence, and a narrowly authorized platform executor
relays exact milestone payouts after a finalized GenLayer approval.

## Repository

- `apps/web`: Next.js application and stateless on-chain API routes.
- `contracts/base`: Solidity USDC escrow and Foundry tests.
- `contracts/genlayer`: GenLayer intelligent contract and direct tests.
- `docs`: architecture, deployment, and operational runbooks.

## Local setup

```bash
cp .env.example apps/web/.env.local
npm install
npm run dev
```

The application has no demo or database mode. It requires the live Base Sepolia
and GenLayer StudioNet addresses described in `docs/deployment.md`.

## Live contracts

- Base Sepolia escrow:
  `0xc437583f16E613b524F6607d81B628c5e5274f39`
- GenLayer StudioNet verifier:
  `0x90A4396b5b9524501181f4ce8d1fBf42C2836d87`
- Hosted 1Shot endpoint:
  `https://relayer.1shotapi.dev/relayers`
- Production application:
  `https://ma-milestone-verifier.vercel.app`

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run contracts:build
npm run contracts:test
npm run contracts:lint
```

The live smoke utility submits a signed review through the application API:

```bash
npm run smoke:live -- --settle
```
