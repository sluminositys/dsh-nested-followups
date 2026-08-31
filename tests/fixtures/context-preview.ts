import type { ConversationTreeProjection, TreeEdgeView } from '../../src/shared/projection.ts'
import type { MessageNodeView } from '../../src/shared/types.ts'
import { treeProjectionFixture } from './tree-projection.ts'

/**
 * A nested branch whose parent branch continued after the child fork point.
 *
 * The later parent turns are intentionally outside the nested branch's
 * inherited context. Context Preview and Focus tests reuse this topology to
 * distinguish the exact ancestor path from visually nearby session tails.
 */
export function nestedContextPreviewProjectionFixture(): ConversationTreeProjection {
  const base = treeProjectionFixture()
  const firstQuestion = base.nodes.find(node => node.nodeId === 'branch-1-q')
  const firstAnswer = base.nodes.find(node => node.nodeId === 'branch-1-a')
  if (firstQuestion === undefined || firstAnswer === undefined) {
    throw new Error('tree projection fixture is missing branch-1 turn nodes')
  }

  const laterParentTurn: MessageNodeView[] = [
    {
      ...firstQuestion,
      nodeId: 'branch-1-q2',
      messageId: 'branch-1-q2',
      seq: 8,
      localTurnIndex: 2,
      turnId: 'branch-session-1:2',
      time: 9,
      summary: 'turn two q',
      text: 'turn two q',
    },
    {
      ...firstAnswer,
      nodeId: 'branch-1-a2',
      messageId: 'branch-1-a2',
      seq: 9,
      localTurnIndex: 2,
      turnId: 'branch-session-1:2',
      time: 10,
      summary: 'turn two a',
      text: 'turn two a',
      branchTargetMessageId: 'branch-1-a2',
      branchTargetSeq: 9,
    },
  ]
  const laterParentEdges: TreeEdgeView[] = [
    {
      edgeId: 'sequence:branch-1-a:branch-1-q2',
      sourceNodeId: 'branch-1-a',
      targetNodeId: 'branch-1-q2',
      kind: 'sequence',
    },
    {
      edgeId: 'sequence:branch-1-q2:branch-1-a2',
      sourceNodeId: 'branch-1-q2',
      targetNodeId: 'branch-1-a2',
      kind: 'sequence',
    },
  ]

  return {
    ...base,
    nodes: [...base.nodes, ...laterParentTurn],
    edges: [...base.edges, ...laterParentEdges],
    branches: base.branches.map(branch => branch.record.branchId === 'branch-1'
      ? { ...branch, nodeIds: [...branch.nodeIds, ...laterParentTurn.map(node => node.nodeId)] }
      : branch),
  }
}
