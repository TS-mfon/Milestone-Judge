import { isAddress } from "viem";
import { z } from "zod";

export const reviewRequestSchema = z.object({
  kind: z.enum(["initial", "appeal"]),
  eventId: z.number().int().positive(),
  milestoneId: z.number().int().nonnegative(),
  attemptId: z.number().int().positive(),
  requester: z.string().refine(isAddress, "Invalid requester"),
  assignee: z.string().refine(isAddress, "Invalid assignee"),
  criterion: z.string().min(10).max(2_000),
  criterionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  evidenceStatement: z.string().min(20).max(10_000),
  evidenceLinks: z
    .array(z.string().url().or(z.string().regex(/^ipfs:\/\//)))
    .min(1)
    .max(12),
  appealContext: z.string().max(5_000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  nonce: z.string().min(8).max(128),
  expiresAt: z.number().int(),
});
