import type { ConversationTreeProjection, TreeEdgeView } from '../shared/projection.ts'
import type { AnchorRange, BranchRecord, MessageNodeView } from '../shared/types.ts'

export interface OptimisticBranchMutation {
  readonly kind: 'branch'
  readonly clientRequestId: string
  readonly anchor: MessageNodeView
  readonly question: string
  readonly anchorRange?: AnchorRange
  readonly createdAt: number
}

export interface OptimisticContinueMutation {
  readonly kind: 'continue'
  readonly clientRequestId: string
  readonly tail: MessageNodeView
  readonly question: string
  readonly createdAt: number
}

export type OptimisticMutation = OptimisticBranchMutation | OptimisticContinueMutation

const SUMMARY_LIMIT = 180

function summary(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= SUMMARY_LIMIT) return normalized
  return `${normalized.slice(0, SUMMARY_LIMIT - 1)}…`
}

function optimisticNodes(
  mutation: OptimisticMutation,
  branchId: string,
  sessionId: string,
  branchPath: readonly number[],
  localTurnIndex: number,
): readonly [MessageNodeView, MessageNodeView] {
  const questionId = mutation.clientRequestId
  const answerId = `pending-answer-${mutation.clientRequestId}`
  return [
    {
      nodeId: `${sessionId}:${questionId}`,
      treeId: mutation.kind === 'branch' ? mutation.anchor.treeId : mutation.tail.treeId,
      branchId,
      sessionId,
      messageId: questionId,
      seq: Number.MAX_SAFE_INTEGER - 1,
      role: 'user',
      turnId: `${sessionId}:pending-${localTurnIndex}`,
      branchPath,
      localTurnIndex,
      time: mutation.createdAt,
      text: mutation.question,
      summary: summary(mutation.question),
      state: 'queued',
    },
    {
      nodeId: `${sessionId}:${answerId}`,
      treeId: mutation.kind === 'branch' ? mutation.anchor.treeId : mutation.tail.treeId,
      branchId,
      sessionId,
      messageId: answerId,
      seq: Number.MAX_SAFE_INTEGER,
      role: 'assistant',
      turnId: `${sessionId}:pending-${localTurnIndex}`,
      branchPath,
      localTurnIndex,
      time: mutation.createdAt + 1,
      text: '',
      summary: '',
      state: 'queued',
    },
  ]
}

function addBranch(
  projection: ConversationTreeProjection,
  mutation: OptimisticBranchMutation,
): ConversationTreeProjection {
  const parentBranch = mutation.anchor.branchId === null
    ? undefined
    : projection.branches.find(branch => branch.record.branchId === mutation.anchor.branchId)
  const siblings = projection.branches.filter(branch =>
    branch.record.parentBranchId === mutation.anchor.branchId
    && branch.record.anchorSessionId === mutation.anchor.sessionId
    && branch.record.anchorMessageId === mutation.anchor.messageId)
  const siblingOrdinal = Math.max(0, ...siblings.map(branch => branch.record.siblingOrdinal)) + 1
  const parentPath = parentBranch?.branchPath ?? [mutation.anchor.localTurnIndex]
  const branchPath = Object.freeze([...parentPath, siblingOrdinal])
  const branchId = `pending-branch-${mutation.clientRequestId}`
  const sessionId = `pending-session-${mutation.clientRequestId}`
  const [question, answer] = optimisticNodes(mutation, branchId, sessionId, branchPath, 1)
  const record: BranchRecord = {
    branchId,
    clientRequestId: mutation.clientRequestId,
    treeId: projection.tree.treeId,
    sessionId,
    parentSessionId: mutation.anchor.sessionId,
    parentBranchId: mutation.anchor.branchId,
    anchorSessionId: mutation.anchor.sessionId,
    anchorMessageId: mutation.anchor.messageId,
    anchorSeq: mutation.anchor.seq,
    forkBoundarySeq: mutation.anchor.seq,
    seedLength: 0,
    ...(mutation.anchorRange === undefined ? {} : { anchorRange: mutation.anchorRange }),
    siblingOrdinal,
    createdAt: mutation.createdAt,
    status: 'creating',
  }
  const edges: TreeEdgeView[] = [
    {
      edgeId: `pending-branch:${mutation.anchor.nodeId}:${question.nodeId}`,
      sourceNodeId: mutation.anchor.nodeId,
      targetNodeId: question.nodeId,
      kind: 'branch',
    },
    {
      edgeId: `pending-sequence:${question.nodeId}:${answer.nodeId}`,
      sourceNodeId: question.nodeId,
      targetNodeId: answer.nodeId,
      kind: 'sequence',
    },
  ]
  return {
    ...projection,
    nodes: [...projection.nodes, question, answer],
    edges: [...projection.edges, ...edges],
    branches: [...projection.branches, {
      record,
      branchPath,
      nodeIds: [question.nodeId, answer.nodeId],
      anchorNodeId: mutation.anchor.nodeId,
      anchorStatus: mutation.anchorRange === undefined ? 'message' : 'range-valid',
    }],
  }
}

function addContinuation(
  projection: ConversationTreeProjection,
  mutation: OptimisticContinueMutation,
): ConversationTreeProjection {
  const branchIndex = projection.branches.findIndex(
    branch => branch.record.branchId === mutation.tail.branchId,
  )
  const branch = projection.branches[branchIndex]
  if (branch === undefined || mutation.tail.branchId === null) return projection
  const localTurnIndex = Math.max(0, ...projection.nodes
    .filter(node => node.branchId === mutation.tail.branchId)
    .map(node => node.localTurnIndex)) + 1
  const [question, answer] = optimisticNodes(
    mutation,
    mutation.tail.branchId,
    mutation.tail.sessionId,
    branch.branchPath,
    localTurnIndex,
  )
  const branches = [...projection.branches]
  branches[branchIndex] = {
    ...branch,
    nodeIds: [...branch.nodeIds, question.nodeId, answer.nodeId],
  }
  return {
    ...projection,
    nodes: [...projection.nodes, question, answer],
    edges: [...projection.edges,
      {
        edgeId: `pending-sequence:${mutation.tail.nodeId}:${question.nodeId}`,
        sourceNodeId: mutation.tail.nodeId,
        targetNodeId: question.nodeId,
        kind: 'sequence',
      },
      {
        edgeId: `pending-sequence:${question.nodeId}:${answer.nodeId}`,
        sourceNodeId: question.nodeId,
        targetNodeId: answer.nodeId,
        kind: 'sequence',
      }],
    branches,
  }
}

/** Add unsent/awaiting-acknowledgement Q/A nodes without mutating the Host snapshot. */
export function projectOptimisticMutations(
  projection: ConversationTreeProjection,
  mutations: readonly OptimisticMutation[],
): ConversationTreeProjection {
  return mutations.reduce(
    (current, mutation) => mutation.kind === 'branch'
      ? addBranch(current, mutation)
      : addContinuation(current, mutation),
    projection,
  )
}

export function mutationAcknowledged(
  projection: ConversationTreeProjection,
  mutation: OptimisticMutation,
): boolean {
  return projection.nodes.some(node => node.messageId === mutation.clientRequestId)
}
