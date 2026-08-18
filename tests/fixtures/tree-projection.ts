import type { BranchProjectionView, ConversationTreeProjection, TreeEdgeView } from '../../src/shared/projection.ts'
import type { BranchRecord, MessageNodeView, TreeRecord } from '../../src/shared/types.ts'

const tree: TreeRecord = {
  treeId: 'tree-layout',
  rootSessionId: 'root',
  version: 1,
  createdAt: 1,
  updatedAt: 1,
}

function message(
  nodeId: string,
  branchId: string | null,
  sessionId: string,
  role: 'user' | 'assistant',
  branchPath: readonly number[],
  localTurnIndex: number,
  seq: number,
  text: string,
): MessageNodeView {
  return {
    nodeId,
    treeId: tree.treeId,
    branchId,
    sessionId,
    messageId: nodeId,
    seq,
    role,
    turnId: `${sessionId}:${localTurnIndex}`,
    branchPath,
    localTurnIndex,
    time: seq + 1,
    text,
    summary: text,
    state: 'complete',
    ...(role === 'assistant' ? {
      branchTargetMessageId: nodeId,
      branchTargetSeq: seq,
    } : {}),
  }
}

const rootNodes = [
  message('root-q1', null, 'root', 'user', [1], 1, 0, 'first question'),
  message('root-a1', null, 'root', 'assistant', [1], 1, 1, 'first answer'),
  message('root-q2', null, 'root', 'user', [2], 2, 2, 'second question'),
  message('root-a2', null, 'root', 'assistant', [2], 2, 3, 'second answer'),
  message('root-q3', null, 'root', 'user', [3], 3, 4, 'third question'),
  message('root-a3', null, 'root', 'assistant', [3], 3, 5, 'third answer'),
]

const branchOneNodes = [
  message('branch-1-q', 'branch-1', 'branch-session-1', 'user', [2, 1], 1, 6, 'branch question'),
  message('branch-1-a', 'branch-1', 'branch-session-1', 'assistant', [2, 1], 1, 7, 'branch answer'),
]

const branchTwoNodes = [
  message('branch-2-q', 'branch-2', 'branch-session-2', 'user', [2, 2], 1, 8, 'sibling question'),
  message('branch-2-a', 'branch-2', 'branch-session-2', 'assistant', [2, 2], 1, 9, 'sibling answer'),
]

const nestedNodes = [
  message('nested-q', 'branch-1-1', 'nested-session', 'user', [2, 1, 1], 1, 10, 'nested question'),
  message('nested-a', 'branch-1-1', 'nested-session', 'assistant', [2, 1, 1], 1, 11, 'nested answer'),
]

function branchRecord(
  branchId: string,
  sessionId: string,
  parentBranchId: string | null,
  parentSessionId: string,
  anchorSessionId: string,
  anchorMessageId: string,
  siblingOrdinal: number,
  createdAt: number,
): BranchRecord {
  return {
    branchId,
    clientRequestId: `request-${branchId}`,
    treeId: tree.treeId,
    sessionId,
    parentSessionId,
    parentBranchId,
    anchorSessionId,
    anchorMessageId,
    anchorSeq: 3,
    forkBoundarySeq: 5,
    seedLength: 6,
    siblingOrdinal,
    createdAt,
    status: 'ready',
  }
}

const branchOneRecord = branchRecord(
  'branch-1', 'branch-session-1', null, 'root', 'root', 'root-a2', 1, 10,
)
const branchTwoRecord = branchRecord(
  'branch-2', 'branch-session-2', null, 'root', 'root', 'root-a2', 2, 11,
)
const nestedRecord = branchRecord(
  'branch-1-1', 'nested-session', 'branch-1', 'branch-session-1',
  'branch-session-1', 'branch-1-a', 1, 12,
)

function branch(
  record: BranchRecord,
  branchPath: readonly number[],
  nodeIds: readonly string[],
  anchorNodeId: string,
): BranchProjectionView {
  return { record, branchPath, nodeIds, anchorNodeId, anchorStatus: 'message' }
}

function sequenceEdges(nodes: readonly MessageNodeView[]): TreeEdgeView[] {
  return nodes.slice(1).map((target, index) => {
    const source = nodes[index] as MessageNodeView
    return {
      edgeId: `sequence:${source.nodeId}:${target.nodeId}`,
      sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId,
      kind: 'sequence',
    }
  })
}

export function treeProjectionFixture(): ConversationTreeProjection {
  const branches = [
    branch(nestedRecord, [2, 1, 1], nestedNodes.map(node => node.nodeId), 'branch-1-a'),
    branch(branchTwoRecord, [2, 2], branchTwoNodes.map(node => node.nodeId), 'root-a2'),
    branch(branchOneRecord, [2, 1], branchOneNodes.map(node => node.nodeId), 'root-a2'),
  ]
  const edges: TreeEdgeView[] = [
    ...sequenceEdges(rootNodes),
    ...sequenceEdges(branchOneNodes),
    ...sequenceEdges(branchTwoNodes),
    ...sequenceEdges(nestedNodes),
    {
      edgeId: 'branch:root-a2:branch-1-q',
      sourceNodeId: 'root-a2',
      targetNodeId: 'branch-1-q',
      kind: 'branch',
    },
    {
      edgeId: 'branch:root-a2:branch-2-q',
      sourceNodeId: 'root-a2',
      targetNodeId: 'branch-2-q',
      kind: 'branch',
    },
    {
      edgeId: 'branch:branch-1-a:nested-q',
      sourceNodeId: 'branch-1-a',
      targetNodeId: 'nested-q',
      kind: 'branch',
    },
  ]
  return {
    tree,
    nodes: [...rootNodes, ...branchOneNodes, ...branchTwoNodes, ...nestedNodes],
    edges,
    branches,
    diagnostics: [],
  }
}
