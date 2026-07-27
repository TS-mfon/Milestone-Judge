# Milestone Verifier Implementation Plan

## Product

Milestone Verifier lets an organization or individual create an event, assign
one recipient wallet, define any practical number of natural-language
milestones, and lock the complete milestone budget in USDC on Base Sepolia.

The recipient submits public evidence and signs the request. The platform wallet
submits that evidence to GenLayer. Approved results enter a challenge window and
are then paid through a 1Shot-relayed call to the Base escrow contract.

## Implemented Architecture

- `contracts/base/src/MilestoneEscrow.sol` is authoritative for USDC, milestone
  amounts, deadlines, proposed approvals, appeals, payouts, and refunds.
- `contracts/genlayer/milestone_verifier.py` is authoritative for subjective
  evidence decisions and stores normalized validator results.
- `apps/web` contains the operational dashboard, event creation, evidence
  submission, appeal flow, signed API requests, and stateless settlement actions.
- Base Sepolia and GenLayer StudioNet are the only canonical stores. The
  application uses no database, queue, webhook persistence, or demo records.
- 1Shot relays approval, appeal-resolution, payout, and platform refund calls
  with deterministic task identifiers.

## Settlement Lifecycle

1. Creator creates an event and adds milestones while it is a draft.
2. Creator approves USDC and activates the event, locking the exact total.
3. Assignee signs an EIP-712 request containing the funded criterion hash.
4. API verifies signer, event state, criterion, deadline, and signed request
   expiry; the deterministic review ID prevents duplicate storage.
5. The platform wallet submits the review directly to GenLayer and the
   intelligent contract indexes the latest review for the Base milestone.
6. Validators independently return `approved`, `rejected`, or `inconclusive`.
7. Rejected and inconclusive milestones may be resubmitted before the deadline.
8. Approved results are committed to Base with a 24-hour challenge deadline.
9. Creator may open an appeal by bonding 1% of the milestone, bounded from 1 to
   100 USDC.
10. GenLayer performs the appeal review and 1Shot relays the bond resolution.
11. An unchallenged or upheld approval releases the exact milestone amount once.
12. After the event deadline, unpaid USDC is refundable only to the creator.

## Security Invariants

- The platform executor cannot select payout recipients or amounts.
- Milestones cannot change after funding.
- A milestone cannot be paid twice.
- Payout review IDs and result hashes must match the proposed approval.
- Open appeals block payouts.
- Invalid, malformed, inaccessible, or disputed evidence cannot approve payment.
- Finalized GenLayer status is not treated as success unless execution succeeded.
- Wallet signatures include chain, escrow, nonce, evidence hash, and expiry.
- Platform owner and executor changes use separate two-step acceptance flows.
- The creator retains a direct deadline-refund fallback.

## Delivery

- GitHub Actions run web checks, Foundry tests, and GenVM linting.
- Vercel hosts the Next.js application and stateless API handlers.
- Base and GenLayer contracts are deployed separately through versioned scripts.
- Preview deployments use test configuration and never receive production keys.
- Deployment and incident procedures live in `docs/deployment.md` and
  `docs/runbook.md`.

## Live Deployment

- Base Sepolia escrow:
  `0xc437583f16E613b524F6607d81B628c5e5274f39`
- GenLayer StudioNet verifier:
  `0x90A4396b5b9524501181f4ce8d1fBf42C2836d87`
- Hosted 1Shot:
  `https://relayer.1shotapi.dev/relayers`
- Live approved review and Base proposal are recorded in
  `docs/deployment.md`.

## Acceptance Checks

- Create, fund, and render a multi-milestone event.
- Submit signed evidence from only the assigned wallet.
- Store a normalized GenLayer result with independent validator comparison.
- Resubmit rejected or inconclusive evidence.
- Open and resolve a bonded creator appeal.
- Prevent payout before the challenge deadline or while an appeal is open.
- Relay and reconcile an exact USDC payout through 1Shot.
- Refund only the unpaid event balance after expiry.
- Pass TypeScript, lint, web tests, Foundry tests, GenVM lint, and production build.
