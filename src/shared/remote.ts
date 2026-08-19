import { z } from 'zod'

import { anchorRangeSchema, branchRecordSchema, treeRecordSchema } from './schema.ts'
import type { ConversationTreeProjection, ProjectionDiagnostic } from './projection.ts'
import type { MessageNodeView } from './types.ts'

const identifier = z.string().min(1)
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const messageNodeViewSchema = z.object({
  nodeId: identifier,
  treeId: identifier,
  branchId: identifier.nullable(),
  sessionId: identifier,
  messageId: identifier,
  seq: nonNegativeSafeInteger,
  role: z.enum(['user', 'assistant']),
  turnId: identifier.optional(),
  branchPath: z.array(nonNegativeSafeInteger),
  localTurnIndex: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  time: nonNegativeSafeInteger,
  text: z.string(),
  summary: z.string(),
  state: z.enum(['queued', 'streaming', 'complete', 'error']),
  branchTargetMessageId: identifier.optional(),
  branchTargetSeq: nonNegativeSafeInteger.optional(),
}).strict() as z.ZodType<MessageNodeView>

export const treeEdgeViewSchema = z.object({
  edgeId: identifier,
  sourceNodeId: identifier,
  targetNodeId: identifier,
  kind: z.enum(['sequence', 'branch']),
}).strict()

export const branchProjectionViewSchema = z.object({
  record: branchRecordSchema,
  branchPath: z.array(nonNegativeSafeInteger),
  nodeIds: z.array(identifier),
  anchorNodeId: identifier.optional(),
  anchorStatus: z.enum(['message', 'range-valid', 'range-invalid', 'missing']),
}).strict()

export const projectionDiagnosticSchema = z.object({
  code: z.enum([
    'root-session-missing',
    'branch-session-missing',
    'branch-parent-missing',
    'branch-cycle',
    'anchor-missing',
    'anchor-range-invalid',
    'seed-length-mismatch',
    'branch-tool-event',
  ]),
  message: z.string(),
  branchId: identifier.optional(),
  sessionId: identifier.optional(),
}).strict() as z.ZodType<ProjectionDiagnostic>

export const conversationTreeProjectionSchema = z.object({
  tree: treeRecordSchema,
  nodes: z.array(messageNodeViewSchema),
  edges: z.array(treeEdgeViewSchema),
  branches: z.array(branchProjectionViewSchema),
  diagnostics: z.array(projectionDiagnosticSchema),
}).strict() as z.ZodType<ConversationTreeProjection>

export interface TreeSnapshot {
  readonly rootSessionId: string
  readonly revision: number
  readonly capabilities: TreeCapabilities
  readonly projection: ConversationTreeProjection
}

export interface TreeCapabilities {
  /** Host can create an isolated child branch from a safe assistant boundary. */
  readonly askFollowUp: boolean
  /** Host can append another read-only turn to an existing branch. */
  readonly continueBranch: boolean
  /** A future upstream API can make an Open Branch surface writable natively. */
  readonly nativeBranchContinuation: boolean
  /** Branch cleanup support for this Host composition. */
  readonly deletion: TreeDeletionCapability
  readonly reason?: string
}

export type TreeDeletionCapability =
  | { readonly supported: true; readonly mode: 'delete' | 'archive' }
  | { readonly supported: false; readonly reason: string }

export type TreeMutationCapabilities = Omit<TreeCapabilities, 'deletion'>

export interface TreeReadRequest {
  readonly sessionId: string
}

export interface TreeWatchRequest extends TreeReadRequest {
  readonly afterRevision: number
}

export interface TreeSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: string
}

export interface BranchAnchorRequest {
  readonly sessionId: string
  readonly messageId: string
  readonly seq: number
  readonly range?: {
    readonly start: number
    readonly end: number
    readonly text: string
  }
}

export interface CreateBranchRequest {
  readonly ownerSessionId: string
  readonly clientRequestId: string
  readonly anchor: BranchAnchorRequest
  readonly question: string
}

export interface ContinueBranchRequest {
  readonly ownerSessionId: string
  readonly clientRequestId: string
  readonly branchId: string
  readonly tail: {
    readonly sessionId: string
    readonly messageId: string
    readonly seq: number
  }
  readonly question: string
}

export interface DeleteBranchRequest {
  readonly ownerSessionId: string
  readonly branchId: string
}

export interface BranchCommandValue {
  readonly action: 'create-branch' | 'continue-branch'
  readonly branchId: string
  readonly sessionId: string
  readonly messageId: string
}

export type BranchCommandErrorCode =
  | 'compatibility'
  | 'session-not-found'
  | 'tree-mismatch'
  | 'anchor-invalid'
  | 'branch-not-found'
  | 'branch-not-tail'
  | 'branch-busy'
  | 'request-conflict'
  | 'fork-failed'
  | 'prompt-failed'

export interface BranchCommandFailure {
  readonly code: BranchCommandErrorCode
  readonly message: string
}

export type BranchCommandResult =
  | { readonly ok: true; readonly value: BranchCommandValue }
  | { readonly ok: false; readonly error: BranchCommandFailure }

export type DeleteBranchErrorCode =
  | 'compatibility'
  | 'tree-mismatch'
  | 'cancel-failed'
  | 'cleanup-pending'

export type DeleteBranchResult =
  | {
    readonly ok: true
    readonly value: {
      readonly status: 'deleted' | 'already-absent'
      readonly branchCount: number
      readonly visibleMessageCount: number
      readonly cleanupMode: 'delete' | 'archive'
    }
  }
  | {
    readonly ok: false
    readonly error: {
      readonly code: DeleteBranchErrorCode
      readonly message: string
    }
  }

export type TreeReadResult =
  | { readonly ok: true; readonly value: TreeSnapshot }
  | { readonly ok: false; readonly error: TreeSessionNotFound }

export type TreeWatchValue =
  | { readonly changed: false; readonly revision: number }
  | { readonly changed: true; readonly snapshot: TreeSnapshot }

export type TreeWatchResult =
  | { readonly ok: true; readonly value: TreeWatchValue }
  | { readonly ok: false; readonly error: TreeSessionNotFound }

export const treeSnapshotSchema = z.object({
  rootSessionId: identifier,
  revision: nonNegativeSafeInteger,
  capabilities: z.object({
    askFollowUp: z.boolean(),
    continueBranch: z.boolean(),
    nativeBranchContinuation: z.boolean(),
    deletion: z.discriminatedUnion('supported', [
      z.object({ supported: z.literal(true), mode: z.enum(['delete', 'archive']) }).strict(),
      z.object({ supported: z.literal(false), reason: z.string().min(1) }).strict(),
    ]),
    reason: z.string().min(1).optional(),
  }).strict(),
  projection: conversationTreeProjectionSchema,
}).strict() as z.ZodType<TreeSnapshot>

export const treeReadRequestSchema = z.object({
  sessionId: identifier,
}).strict() as z.ZodType<TreeReadRequest>

export const treeWatchRequestSchema = z.object({
  sessionId: identifier,
  afterRevision: nonNegativeSafeInteger,
}).strict() as z.ZodType<TreeWatchRequest>

const requestText = z.string().refine(value => value.trim().length > 0, 'must not be blank')

export const branchAnchorRequestSchema = z.object({
  sessionId: identifier,
  messageId: identifier,
  seq: nonNegativeSafeInteger,
  range: anchorRangeSchema.optional(),
}).strict() as z.ZodType<BranchAnchorRequest>

export const createBranchRequestSchema = z.object({
  ownerSessionId: identifier,
  clientRequestId: identifier,
  anchor: branchAnchorRequestSchema,
  question: requestText,
}).strict() as z.ZodType<CreateBranchRequest>

export const continueBranchRequestSchema = z.object({
  ownerSessionId: identifier,
  clientRequestId: identifier,
  branchId: identifier,
  tail: z.object({
    sessionId: identifier,
    messageId: identifier,
    seq: nonNegativeSafeInteger,
  }).strict(),
  question: requestText,
}).strict() as z.ZodType<ContinueBranchRequest>

export const deleteBranchRequestSchema = z.object({
  ownerSessionId: identifier,
  branchId: identifier,
}).strict() as z.ZodType<DeleteBranchRequest>

const branchCommandErrorCodeSchema = z.enum([
  'compatibility',
  'session-not-found',
  'tree-mismatch',
  'anchor-invalid',
  'branch-not-found',
  'branch-not-tail',
  'branch-busy',
  'request-conflict',
  'fork-failed',
  'prompt-failed',
])

export const branchCommandResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    value: z.object({
      action: z.enum(['create-branch', 'continue-branch']),
      branchId: identifier,
      sessionId: identifier,
      messageId: identifier,
    }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: branchCommandErrorCodeSchema,
      message: z.string().min(1),
    }).strict(),
  }).strict(),
]) as z.ZodType<BranchCommandResult>

export const deleteBranchResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    value: z.object({
      status: z.enum(['deleted', 'already-absent']),
      branchCount: nonNegativeSafeInteger,
      visibleMessageCount: nonNegativeSafeInteger,
      cleanupMode: z.enum(['delete', 'archive']),
    }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(['compatibility', 'tree-mismatch', 'cancel-failed', 'cleanup-pending']),
      message: z.string().min(1),
    }).strict(),
  }).strict(),
]) as z.ZodType<DeleteBranchResult>

const sessionNotFoundSchema = z.object({
  code: z.literal('session-not-found'),
  sessionId: identifier,
}).strict()

export const treeReadResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: treeSnapshotSchema }).strict(),
  z.object({ ok: z.literal(false), error: sessionNotFoundSchema }).strict(),
]) as z.ZodType<TreeReadResult>

export const treeWatchResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    value: z.discriminatedUnion('changed', [
      z.object({ changed: z.literal(false), revision: nonNegativeSafeInteger }).strict(),
      z.object({ changed: z.literal(true), snapshot: treeSnapshotSchema }).strict(),
    ]),
  }).strict(),
  z.object({ ok: z.literal(false), error: sessionNotFoundSchema }).strict(),
]) as z.ZodType<TreeWatchResult>
