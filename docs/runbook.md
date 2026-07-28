# Operations Runbook

## Stalled GenLayer review

Check the transaction receipt and execution result. A finalized transaction with
an execution error did not update contract state. Correct the evidence or
contract issue and create a new attempt ID; never reuse a failed review ID.

## Stalled 1Shot task

Call `relayer_getStatus` with the task ID returned to the triggering user.
Status `100` is pending, `110` is submitted, `200` is confirmed, `400` is
rejected, and `500` is reverted.

Before retrying, read the Base milestone. If the expected state transition is
already present, treat the operation as complete. Otherwise correct the
authorization, payment, or simulation problem and retry the same action. Its
deterministic task ID prevents an ordinary duplicate submission.

## Hosted relayer validation failures

- `InvalidERC1271Signature`: confirm the delegation fields sent to 1Shot are
  byte-for-byte identical to the fields that were signed.
- `CaveatEnforcer:invalid-call-type`: use one exact single-execution delegation
  per entry in the 1Shot `transactions` array.
- Missing fee amount: inspect `success` and `error` from
  `relayer_estimate7710Transaction`.
- Insufficient payment: fund the Base settlement executor with Base Sepolia USDC. No
  native ETH or 1Shot API key is required by the hosted flow.

## Compromised GenLayer platform signer

1. Call `set_platform_wallet` from the GenLayer contract owner.
2. Replace `GENLAYER_PLATFORM_PRIVATE_KEY` in Vercel.
3. Inspect the finalized rotation receipt and confirm contract execution
   succeeded.
4. Confirm unauthorized accounts cannot submit reviews.
5. Confirm the new signer can submit a review before deleting the retired key.

## Compromised Base settlement executor

1. Pause `MilestoneEscrow`.
2. Start a platform executor transfer from the owner account.
3. Accept from a newly generated platform account.
4. Replace `BASE_EXECUTOR_PRIVATE_KEY` in Vercel.
5. Resume only after checking recent GenLayer reviews and 1Shot task IDs against
   Base milestone state.

## Refund recovery

After an event deadline, the creator can call `refundEvent` directly. The
contract sends only the unpaid balance to the original creator, regardless of
who submits the transaction.
