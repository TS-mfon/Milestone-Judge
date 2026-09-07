# Architecture

## Settlement boundary

Base Sepolia is authoritative for USDC. `MilestoneEscrow` stores event terms,
locks the aggregate milestone amount, enforces its two-step settlement state,
prevents duplicate releases, and returns only unpaid funds after expiry.

The escrow also exposes stable read models for automation and indexing:
`getEventMilestoneCount`, `getSettlementState`, and `getConfig`. These are
projections of existing storage, not a second source of truth.

GenLayer is authoritative for subjective evidence judgments. The intelligent
contract accepts requests only from the GenLayer platform signer, retrieves and
bounds every evidence source, uses prompt-comparative consensus over the same
public evidence, and stores a normalized scored result
with review, strengths, improvements, suggestions, citations, and evidence gaps.

The Vercel service coordinates two separate signers. The GenLayer platform
signer only submits authorized review requests. The Base executor only signs
hosted 1Shot settlement authorizations. Neither signer selects payment amounts.

There is no application database, queue, or webhook store. Event and settlement
state is read from Base Sepolia and review state is read from GenLayer StudioNet
on every request and every stateless keeper run.

## Review lifecycle

1. The assignee signs an EIP-712 v3 review request scoped to Base Sepolia chain
   ID `84532` and the deployed escrow.
2. The API recomputes `keccak256(criterion)`, validates expiry and signer, and
   requires exact criterion text, recomputed hash, submitted hash, and the funded
   Base milestone hash to match.
3. The API replaces client criterion fields with the canonical values read from
   Base, and the GenLayer-only platform signer submits `request_review` directly
   to StudioNet.
4. The client polls the GenLayer transaction and stored review.
5. Rejected or inconclusive results remain on-chain and may be resubmitted with
   a new attempt.
6. For an approved review whose score meets the funded threshold, the GitHub
   Actions keeper discovers the finalized on-chain review without browser state.
7. Hosted 1Shot relays `proposeMilestoneApproval` with an exact-call delegation.
8. Instant events become payable immediately. Challenge-enabled events remain
   locked for their creator-selected period and may be appealed.
9. A later keeper run relays `releaseMilestone` when the milestone is eligible.
10. The UI indexes `MilestoneReleased` logs for payment time and transaction
    history.

## Trust and recovery

- The Base executor cannot choose a recipient or amount.
- Every review ID and result hash is committed to the payout.
- GenLayer independently recomputes the criterion hash and stores an evidence
  snapshot commitment over fetched URL, status, retrieval state, and bounded
  content.
- Settlement revalidates the exact GenLayer criterion text and both hashes
  against Base before any 1Shot proposal or payout.
- Existing approval proposals cannot be overwritten.
- 1Shot submissions use deterministic task IDs.
- 1Shot permissions restrict each relayed call to its exact target, value, and
  calldata.
- The contract owner can pause settlement and rotate the executor in two steps.
- The creator can call the deadline refund directly if the hosted service is
  unavailable.
- The automation keeps no cursor or queue. Each run derives pending work from
  Base logs, Base storage, and GenLayer review storage.
- Public review and settlement routes use bounded per-client throttles, while
  settlement also rejects duplicate operations already in flight.
