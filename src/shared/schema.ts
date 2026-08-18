import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

import type { AnchorRange, BranchRecord, BranchStatus, TreeRecord } from './types.ts'

const identifier = z.string().min(1)
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const branchStatusSchema = z.enum([
  'creating',
  'running',
  'ready',
  'failed',
  'missing',
  'deleted',
] satisfies readonly BranchStatus[])

export const anchorRangeSchema = z.object({
  start: nonNegativeSafeInteger,
  end: nonNegativeSafeInteger,
  text: z.string(),
}).strict().refine(range => range.end > range.start, {
  path: ['end'],
  message: 'anchor range must contain at least one UTF-16 code unit',
}) as z.ZodType<AnchorRange>

export const treeRecordSchema = z.object({
  treeId: identifier,
  rootSessionId: identifier,
  version: z.literal(1),
  createdAt: nonNegativeSafeInteger,
  updatedAt: nonNegativeSafeInteger,
}).strict().refine(tree => tree.updatedAt >= tree.createdAt, {
  path: ['updatedAt'],
  message: 'tree updatedAt must not precede createdAt',
}) as z.ZodType<TreeRecord>

export const branchRecordSchema = z.object({
  branchId: identifier,
  clientRequestId: identifier,
  treeId: identifier,
  sessionId: identifier,
  parentSessionId: identifier,
  parentBranchId: identifier.nullable(),
  anchorSessionId: identifier,
  anchorMessageId: identifier,
  anchorSeq: nonNegativeSafeInteger,
  forkBoundarySeq: nonNegativeSafeInteger,
  seedLength: nonNegativeSafeInteger,
  anchorRange: anchorRangeSchema.optional(),
  siblingOrdinal: positiveSafeInteger,
  createdAt: nonNegativeSafeInteger,
  status: branchStatusSchema,
  deletedAt: nonNegativeSafeInteger.optional(),
}).strict().superRefine((branch, ctx) => {
  if (branch.anchorSessionId !== branch.parentSessionId) {
    ctx.addIssue({
      code: 'custom',
      path: ['anchorSessionId'],
      message: 'anchor session must equal the source parent session',
    })
  }
  if (branch.forkBoundarySeq < branch.anchorSeq) {
    ctx.addIssue({
      code: 'custom',
      path: ['forkBoundarySeq'],
      message: 'fork boundary must not precede the anchor message',
    })
  }
  if (branch.status === 'deleted' && branch.deletedAt === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['deletedAt'],
      message: 'deleted branches require deletedAt',
    })
  }
  if (branch.status !== 'deleted' && branch.deletedAt !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['deletedAt'],
      message: 'deletedAt is only valid for deleted branches',
    })
  }
}) as z.ZodType<BranchRecord>

/** Plugin-owned sidecar data. Session logs remain unchanged. */
export const nestedFollowupsDomainSpec = defineDomain({
  name: 'nested_followups',
  version: 0,
  tables: {
    trees: domainTable<string, TreeRecord>(treeRecordSchema),
    branches: domainTable<string, BranchRecord>(branchRecordSchema),
  },
})
