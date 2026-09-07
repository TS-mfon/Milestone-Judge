# Milestone Judge Protocol v1

## Purpose

Milestone Judge coordinates conditional USDC payments for measurable work. Base
Sepolia is the financial authority. GenLayer StudioNet is the consensus authority
for subjective evidence review. The application and settlement keeper are
stateless coordinators and must reconstruct their decisions from chain state.

This protocol is a testnet settlement mechanism, not a legal court or legal
determination. Users should not fund an event unless they accept the configured
review and appeal rules.

## Authorities And Identifiers

- `eventId`: Base escrow event identifier.
- `milestoneId`: zero-based milestone identifier within an event.
- `attemptId`: assignee-selected monotonic review attempt identifier.
- `reviewId`: deterministic GenLayer review identifier derived from the signed
  request payload.
- `criteriaHash`: Ethereum Keccak-256 of the exact Base milestone criterion text.
- `resultHash`: hash of the normalized GenLayer result committed to settlement.
- `evidenceCommitment`: hash of the bounded evidence snapshots retrieved during
  the GenLayer review.

Base is authoritative for creator, assignee, deadline, milestone text, amount,
minimum score, challenge state, paid state, and refunds. GenLayer is authoritative
for the stored review result and evidence commitment. Vercel, GitHub Actions, and
1Shot are replaceable execution infrastructure.

## Lifecycle

1. A creator calls `createEvent` on Base Sepolia.
2. The creator calls `addMilestones`, which stores exact criteria and Keccak hashes.
3. The creator approves USDC and calls `fundAndActivate`.
4. The assignee signs an EIP-712 v3 review authorization scoped to Base Sepolia,
   the escrow contract, the exact criterion text hash, evidence, nonce, and expiry.
5. The API recomputes the criterion hash, reads Base, and rejects any mismatch.
6. The platform GenLayer signer submits the canonical request to GenLayer.
7. GenLayer retrieves bounded public evidence and reaches comparative consensus.
8. An approved result must satisfy GenLayer quality checks and the funded Base
   minimum score before it can be proposed for settlement.
9. Hosted 1Shot relays the executor-gated Base proposal and payout calls.
10. The escrow transfers only the funded milestone amount to the original assignee.
11. A challenge period may pause payout while the creator can open an appeal.
12. After the deadline, the creator or executor may refund only the unpaid balance.

## Review Contract

`request_review` is callable only by the configured platform wallet. It rejects
empty input, unsupported review kinds, duplicate review IDs, invalid evidence-link
JSON, invalid links, invalid score thresholds, and a criterion hash that does not
equal `Keccak256(criterion)`.

The stored review includes the protocol version, exact criterion text, recomputed
criterion hash, minimum score, normalized verdict, and evidence snapshot commitment.
The verdict includes decision, score, criterion status, measurement validity,
material exception, threshold crossing, review, explanation, strengths,
improvements, suggestions, citations, evidence gaps, and retrieved sources.

Validators must independently compare substantive findings. Formatting-only
validation is insufficient. Scores must remain within the configured tolerance
and may not cross opposite sides of the funded threshold.

## Limits And Recovery

- Maximum 50 milestones per event.
- Maximum 12 evidence links per review.
- Maximum 12,000 characters per source and 48,000 total source characters.
- Public evidence must use HTTPS or IPFS gateway resolution.
- 5xx source failures are transient; 4xx and empty sources are evidence gaps.
- Duplicate review IDs and already-settled milestones are terminal conflicts.
- Keeper retries are safe only after rereading Base state, GenLayer state, and
  hosted relay status.

## Security Invariants

- The Base executor cannot select a recipient or payment amount.
- A payout requires the funded review ID and result hash.
- A payout cannot occur twice.
- A substituted criterion cannot pass signature, API, GenLayer, or settlement
  validation.
- Closing the browser cannot prevent a finalized eligible payout from being found
  by the stateless keeper.
