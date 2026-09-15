import type {
  BranchProjectionView,
  ConversationTreeProjection,
  TreeEdgeView,
} from '../../src/shared/projection.ts'
import type { MessageNodeView } from '../../src/shared/types.ts'

/**
 * A nested chain with four sibling branches at every level. Each branch has
 * three turns, and the next level forks from its first answer, leaving a
 * two-turn tail outside the child's inherited context. Only new branch
 * messages are projected; inherited prefixes are not duplicated.
 */
export function largeContextPreviewProjectionFixture(
  rootTurns: number,
  depth: number,
): ConversationTreeProjection {
  const tree = {
    treeId: 'large-context-preview',
    rootSessionId: 'root',
    version: 1 as const,
    createdAt: 1,
    updatedAt: 1,
  }
  const nodes: MessageNodeView[] = []
  const edges: TreeEdgeView[] = []
  const branches: BranchProjectionView[] = []

  function addSession(
    branchId: string | null,
    path: readonly number[],
    turns: number,
    anchor?: MessageNodeView,
  ): MessageNodeView {
    const sessionId = branchId ?? tree.rootSessionId
    // Model turn/start, user/message, assistant/message, turn/end. The seed
    // includes the parent's turn/end, not just the anchor's message event.
    const seedLength = anchor === undefined ? 0 : anchor.seq + 2
    const sessionNodes: MessageNodeView[] = []
    let previous = anchor
    for (let turn = 1; turn <= turns; turn += 1) {
      for (const role of ['user', 'assistant'] as const) {
        const nodeId = `${sessionId}:${role}:${turn}`
        const seq = seedLength + (turn - 1) * 4 + (role === 'user' ? 1 : 2)
        const node: MessageNodeView = {
          nodeId,
          treeId: tree.treeId,
          branchId,
          sessionId,
          messageId: nodeId,
          seq,
          role,
          turnId: `${sessionId}:${turn}`,
          branchPath: branchId === null ? [turn] : path,
          localTurnIndex: turn,
          time: nodes.length + 1,
          text: `${role} in ${sessionId}, turn ${turn}`,
          summary: `${role} in ${sessionId}, turn ${turn}`,
          state: 'complete',
          ...(role === 'assistant' ? {
            branchTargetMessageId: nodeId,
            branchTargetSeq: seq,
          } : {}),
        }
        if (previous !== undefined) {
          const kind = previous.sessionId === sessionId ? 'sequence' : 'branch'
          edges.push({
            edgeId: `${kind}:${previous.nodeId}:${nodeId}`,
            sourceNodeId: previous.nodeId,
            targetNodeId: nodeId,
            kind,
          })
        }
        nodes.push(node)
        sessionNodes.push(node)
        previous = node
      }
    }
    const firstAnswer = sessionNodes[1]
    if (firstAnswer === undefined) throw new Error('fixture requires at least one turn')
    if (branchId !== null && anchor !== undefined) {
      branches.push({
        record: {
          branchId,
          clientRequestId: `request:${branchId}`,
          treeId: tree.treeId,
          sessionId,
          parentSessionId: anchor.sessionId,
          parentBranchId: anchor.branchId,
          anchorSessionId: anchor.sessionId,
          anchorMessageId: anchor.messageId,
          anchorSeq: anchor.seq,
          forkBoundarySeq: anchor.seq + 1,
          seedLength,
          siblingOrdinal: path.at(-1) ?? 1,
          createdAt: branches.length + 1,
          status: 'ready',
        },
        branchPath: path,
        nodeIds: sessionNodes.map(node => node.nodeId),
        anchorNodeId: anchor.nodeId,
        anchorStatus: 'message',
      })
    }
    return firstAnswer
  }

  let anchor = addSession(null, [], rootTurns)
  for (let level = 1; level <= depth; level += 1) {
    const parent = anchor
    for (let sibling = 1; sibling <= 5; sibling += 1) {
      const answer = addSession(
        `branch-${level}-${sibling}`,
        [...parent.branchPath, sibling],
        3,
        parent,
      )
      if (sibling === 1) anchor = answer
    }
  }
  return { tree, nodes, edges, branches, diagnostics: [] }
}
