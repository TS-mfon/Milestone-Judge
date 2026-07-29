# Architecture

## Settlement boundary

Base Sepolia is authoritative for USDC. `MilestoneEscrow` stores event terms,
locks the aggregate milestone amount, enforces its two-step settlement state,
prevents duplicate releases, and returns only unpaid funds after expiry.

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
on every request and every stateless cron run.

## Review lifecycle

1. The assignee signs an EIP-712 review request.
2. The API validates expiry, signer, event state, assignee, criterion hash, and
   remaining deadline.
3. The GenLayer-only platform signer submits `request_review` directly to StudioNet.
4. The client polls the GenLayer transaction and stored review.
5. Rejected or inconclusive results remain on-chain and may be resubmitted with
   a new attempt.
6. For an approved review whose score meets the funded threshold, the Vercel
   cron discovers the finalized on-chain review without browser state.
7. Hosted 1Shot relays `proposeMilestoneApproval` with an exact-call delegation.
8. Instant events become payable immediately. Challenge-enabled events remain
   locked for their creator-selected period and may be appealed.
9. A later cron run relays `releaseMilestone` when the milestone is eligible.
10. The UI indexes `MilestoneReleased` logs for payment time and transaction
    history.

## Trust and recovery

- The Base executor cannot choose a recipient or amount.
- Every review ID and result hash is committed to the payout.
- Existing approval proposals cannot be overwritten.
- 1Shot submissions use deterministic task IDs.
- 1Shot permissions restrict each relayed call to its exact target, value, and
  calldata.
- The contract owner can pause settlement and rotate the executor in two steps.
- The creator can call the deadline refund directly if the hosted service is
  unavailable.
- The automation keeps no cursor or queue. Each run derives pending work from
  Base logs, Base storage, and GenLayer review storage.
