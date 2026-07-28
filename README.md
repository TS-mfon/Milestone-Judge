# Milestone Verifier

Milestone Verifier is a USDC milestone escrow for Base Sepolia with subjective
evidence review finalized by GenLayer. Event creators lock the full milestone
budget, assignees submit evidence, and a narrowly authorized platform executor
relays exact milestone payouts after a finalized GenLayer approval whose score
meets the creator's on-chain threshold.

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
  `0x47F846c659B4DF565d2e8b1cd32F610E68d11B9A`
- GenLayer StudioNet verifier:
  `0x4006FA705a70BF9137e7B5d07555b6E547Cae5c5`
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
