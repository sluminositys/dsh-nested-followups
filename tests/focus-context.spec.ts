import { describe, expect, it } from 'vitest'
import { deriveFocusState } from '../src/client/tree/navigation.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'
import type { MessageNodeView } from '../src/shared/types.ts'
import type { TreeEdgeView } from '../src/shared/projection.ts'

/**
 * The user's report: branch 1.1.1 carries two turns, and a child branch is
 * anchored on the first turn's answer. Focusing inside the child must dim the
 * ancestor branch's later turns — they are not part of the focused context.
 */
function twoTurnFixture() {
  const base = treeProjectionFixture()
  const q = base.nodes.find(node => node.nodeId === 'branch-1-q')!
  const a = base.nodes.find(node => node.nodeId === 'branch-1-a')!
  const extra: MessageNodeView[] = [
    { ...q, nodeId: 'branch-1-q2', messageId: 'branch-1-q2', seq: 8, localTurnIndex: 2, summary: 'turn two q', text: 'turn two q' },
    { ...a, nodeId: 'branch-1-a2', messageId: 'branch-1-a2', seq: 9, localTurnIndex: 2, summary: 'turn two a', text: 'turn two a' },
  ]
  const extraEdges: TreeEdgeView[] = [
    { edgeId: 'sequence:branch-1-a:branch-1-q2', sourceNodeId: 'branch-1-a', targetNodeId: 'branch-1-q2', kind: 'sequence' },
    { edgeId: 'sequence:branch-1-q2:branch-1-a2', sourceNodeId: 'branch-1-q2', targetNodeId: 'branch-1-a2', kind: 'sequence' },
  ]
  return {
    ...base,
    nodes: [...base.nodes, ...extra],
    edges: [...base.edges, ...extraEdges],
    branches: base.branches.map(branch => branch.record.branchId === 'branch-1'
      ? { ...branch, nodeIds: [...branch.nodeIds, 'branch-1-q2', 'branch-1-a2'] }
      : branch),
  }
}

describe('focus context', () => {
  it('dims later turns of an ancestor branch that sit outside the focused context', () => {
    const focus = deriveFocusState(twoTurnFixture(), 'nested-a')

    expect(focus.highlightedNodeIds.has('branch-1-q')).toBe(true)
    expect(focus.highlightedNodeIds.has('branch-1-a')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-1-q2')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-1-a2')).toBe(true)
  })

  it('keeps later turns highlighted when focusing inside their own branch', () => {
    const focus = deriveFocusState(twoTurnFixture(), 'branch-1-q')

    expect(focus.highlightedNodeIds.has('branch-1-a2')).toBe(true)
  })
})
