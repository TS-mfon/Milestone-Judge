# Architecture

## Settlement boundary

Base Sepolia is authoritative for USDC. `MilestoneEscrow` stores event terms,
locks the aggregate milestone amount, enforces its two-step settlement state,
prevents duplicate releases, and returns only unpaid funds after expiry.

GenLayer is authoritative for subjective evidence judgments. The intelligent
contract accepts requests only from the GenLayer platform signer, uses prompt-comparative
consensus over the same public evidence, and stores a normalized scored result
with review, strengths, improvements, suggestions, citations, and evidence gaps.

The Vercel service coordinates two separate signers. The GenLayer platform
signer only submits authorized review requests. The Base executor only signs
hosted 1Shot settlement authorizations. Neither signer selects payment amounts.

There is no application database, queue, cron job, or webhook store. Event and
settlement state is read from Base Sepolia and review state is read from
GenLayer StudioNet on every request.

## Review lifecycle

1. The assignee signs an EIP-712 review request.
2. The API validates expiry, signer, event state, assignee, criterion hash, and
   remaining deadline.
3. The GenLayer-only platform signer submits `request_review` directly to StudioNet.
4. The client polls the GenLayer transaction and stored review.
5. Rejected or inconclusive results remain on-chain and may be resubmitted with
   a new attempt.
6. For an approved review whose score meets the funded threshold, the verdict
   page automatically starts settlement.
7. Hosted 1Shot relays `proposeMilestoneApproval` with an exact-call delegation.
8. The coordinator waits for confirmation and the escrow's short required
   timestamp interval.
9. Hosted 1Shot automatically relays `releaseMilestone`.
10. The UI indexes `MilestoneReleased` logs for payment time and transaction
    history.

## Trust and recovery

- The Base executor cannot choose a recipient or amount.
- Every review ID and result hash is committed to the payout.
- 1Shot submissions use deterministic task IDs.
- 1Shot permissions restrict each relayed call to its exact target, value, and
  calldata.
- The contract owner can pause settlement and rotate the executor in two steps.
- The creator can call the deadline refund directly if the hosted service is
  unavailable.
