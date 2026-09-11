import { describe, expect, it } from 'vitest'
import { deriveContextPreview } from '../src/client/tree/context-preview.ts'
import { nestedContextPreviewProjectionFixture } from './fixtures/context-preview.ts'

describe('context preview', () => {
  it('derives a root-session prefix through the selected node', () => {
    const preview = deriveContextPreview(nestedContextPreviewProjectionFixture(), 'root-a2')

    expect(preview?.boundary).toEqual({
      eligible: true,
      boundaryNodeId: 'root-a2',
      snappedToTurnTail: false,
    })
    expect(preview?.summary).toEqual({
      inheritedMessageCount: 4,
      excludedMessageCount: 10,
    })
    expect(preview?.inheritedNodeIds).toEqual([
      'root-q1',
      'root-a1',
      'root-q2',
      'root-a2',
    ])
    expect(preview?.inheritedEdgeIds).toEqual([
      'sequence:root-q1:root-a1',
      'sequence:root-a1:root-q2',
      'sequence:root-q2:root-a2',
    ])
    expect(preview?.excludedGroups).toEqual([
      {
        reason: 'root-session-tail',
        nodeIds: ['root-q3', 'root-a3'],
      },
      {
        reason: 'descendant-branch',
        nodeIds: [
          'branch-1-q',
          'branch-1-a',
          'branch-1-q2',
          'branch-1-a2',
          'nested-q',
          'nested-a',
          'branch-2-q',
          'branch-2-a',
        ],
      },
    ])
  })

  it('keeps only the exact ancestor chain for a nested branch', () => {
    const preview = deriveContextPreview(nestedContextPreviewProjectionFixture(), 'nested-a')

    expect(preview?.inheritedNodeIds).toEqual([
      'root-q1',
      'root-a1',
      'root-q2',
      'root-a2',
      'branch-1-q',
      'branch-1-a',
      'nested-q',
      'nested-a',
    ])
    expect(preview?.inheritedEdgeIds).toEqual([
      'sequence:root-q1:root-a1',
      'sequence:root-a1:root-q2',
      'sequence:root-q2:root-a2',
      'branch:root-a2:branch-1-q',
      'sequence:branch-1-q:branch-1-a',
      'branch:branch-1-a:nested-q',
      'sequence:nested-q:nested-a',
    ])
    expect(preview?.inheritedNodeIds).not.toContain('root-q3')
    expect(preview?.inheritedNodeIds).not.toContain('branch-1-q2')
    expect(preview?.inheritedNodeIds).not.toContain('branch-2-q')
    expect(preview?.summary).toEqual({
      inheritedMessageCount: 8,
      excludedMessageCount: 6,
    })
    expect(preview?.excludedGroups).toEqual([
      {
        reason: 'root-session-tail',
        nodeIds: ['root-q3', 'root-a3'],
      },
      {
        reason: 'current-branch-tail',
        nodeIds: ['branch-1-q2', 'branch-1-a2'],
      },
      {
        reason: 'sibling-branch',
        nodeIds: ['branch-2-q', 'branch-2-a'],
      },
    ])
  })

  it('includes earlier turns when the target is later in the current branch', () => {
    const preview = deriveContextPreview(
      nestedContextPreviewProjectionFixture(),
      'branch-1-a2',
    )

    expect(preview?.inheritedNodeIds).toEqual([
      'root-q1',
      'root-a1',
      'root-q2',
      'root-a2',
      'branch-1-q',
      'branch-1-a',
      'branch-1-q2',
      'branch-1-a2',
    ])
    expect(Object.isFrozen(preview)).toBe(true)
    expect(Object.isFrozen(preview?.boundary)).toBe(true)
    expect(Object.isFrozen(preview?.summary)).toBe(true)
    expect(Object.isFrozen(preview?.inheritedNodeIds)).toBe(true)
    expect(Object.isFrozen(preview?.inheritedEdgeIds)).toBe(true)
    expect(preview?.excludedGroups).toEqual([
      {
        reason: 'root-session-tail',
        nodeIds: ['root-q3', 'root-a3'],
      },
      {
        reason: 'sibling-branch',
        nodeIds: ['branch-2-q', 'branch-2-a'],
      },
      {
        reason: 'descendant-branch',
        nodeIds: ['nested-q', 'nested-a'],
      },
    ])
  })

  it('classifies later turns in the selected branch as branch tail', () => {
    const preview = deriveContextPreview(
      nestedContextPreviewProjectionFixture(),
      'branch-1-a',
    )

    expect(preview?.excludedGroups).toEqual([
      {
        reason: 'root-session-tail',
        nodeIds: ['root-q3', 'root-a3'],
      },
      {
        reason: 'current-branch-tail',
        nodeIds: ['branch-1-q2', 'branch-1-a2'],
      },
      {
        reason: 'sibling-branch',
        nodeIds: ['branch-2-q', 'branch-2-a'],
      },
      {
        reason: 'descendant-branch',
        nodeIds: ['nested-q', 'nested-a'],
      },
    ])
  })

  it('classifies every direct sibling branch outside the inherited path', () => {
    const preview = deriveContextPreview(
      nestedContextPreviewProjectionFixture(),
      'nested-a',
    )

    expect(preview?.excludedGroups.find(group => group.reason === 'sibling-branch'))
      .toEqual({
        reason: 'sibling-branch',
        nodeIds: ['branch-2-q', 'branch-2-a'],
      })
  })

  it('classifies child branch messages outside the selected branch context', () => {
    const preview = deriveContextPreview(
      nestedContextPreviewProjectionFixture(),
      'branch-1-a2',
    )

    expect(preview?.excludedGroups.find(group => group.reason === 'descendant-branch'))
      .toEqual({
        reason: 'descendant-branch',
        nodeIds: ['nested-q', 'nested-a'],
      })
  })

  it('keeps exclusion groups stable when projection arrays are reordered', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const expected = deriveContextPreview(fixture, 'branch-1-a')
    const reordered = deriveContextPreview({
      ...fixture,
      nodes: [...fixture.nodes].reverse(),
      branches: [...fixture.branches].reverse(),
    }, 'branch-1-a')

    expect(reordered?.excludedGroups).toEqual(expected?.excludedGroups)
  })

  it('deduplicates exclusion candidates within and across reason groups', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const siblingNodes = fixture.nodes.filter(node => node.branchId === 'branch-2')
    const preview = deriveContextPreview({
      ...fixture,
      nodes: [...fixture.nodes, ...siblingNodes],
    }, 'branch-1-a')
    const excludedNodeIds = preview?.excludedGroups.flatMap(group => group.nodeIds) ?? []

    expect(excludedNodeIds).toEqual([...new Set(excludedNodeIds)])
    expect(preview?.summary).toEqual({
      inheritedMessageCount: 6,
      excludedMessageCount: 8,
    })
    expect(preview?.excludedGroups).toEqual([
      {
        reason: 'root-session-tail',
        nodeIds: ['root-q3', 'root-a3'],
      },
      {
        reason: 'current-branch-tail',
        nodeIds: ['branch-1-q2', 'branch-1-a2'],
      },
      {
        reason: 'sibling-branch',
        nodeIds: ['branch-2-q', 'branch-2-a'],
      },
      {
        reason: 'descendant-branch',
        nodeIds: ['nested-q', 'nested-a'],
      },
    ])
  })

  it('omits the root-tail group when the selected path reaches the root tip', () => {
    const preview = deriveContextPreview(nestedContextPreviewProjectionFixture(), 'root-a3')

    expect(preview?.excludedGroups).toEqual([{
      reason: 'descendant-branch',
      nodeIds: [
        'branch-1-q',
        'branch-1-a',
        'branch-1-q2',
        'branch-1-a2',
        'nested-q',
        'nested-a',
        'branch-2-q',
        'branch-2-a',
      ],
    }])
  })

  it('reports user messages as unsupported branch boundaries', () => {
    const preview = deriveContextPreview(nestedContextPreviewProjectionFixture(), 'root-q2')

    expect(preview?.boundary).toEqual({
      eligible: false,
      reason: 'user-message',
    })
  })

  it('reports an assistant in an open turn without disabling older completed turns', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const projection = {
      ...fixture,
      nodes: fixture.nodes.map((node) => {
        if (node.nodeId !== 'root-a3') return node
        const {
          branchTargetMessageId: _branchTargetMessageId,
          branchTargetSeq: _branchTargetSeq,
          ...openNode
        } = node
        return { ...openNode, state: 'streaming' as const }
      }),
    }

    expect(deriveContextPreview(projection, 'root-a3')?.boundary).toEqual({
      eligible: false,
      reason: 'turn-open',
    })
    expect(deriveContextPreview(projection, 'root-a2')?.boundary).toEqual({
      eligible: true,
      boundaryNodeId: 'root-a2',
      snappedToTurnTail: false,
    })
  })

  it('reports a completed turn without a safe assistant tail', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const projection = {
      ...fixture,
      nodes: fixture.nodes.map((node) => {
        if (node.nodeId !== 'root-a2') return node
        const {
          branchTargetMessageId: _branchTargetMessageId,
          branchTargetSeq: _branchTargetSeq,
          ...unavailableNode
        } = node
        return unavailableNode
      }),
    }

    expect(deriveContextPreview(projection, 'root-a2')?.boundary).toEqual({
      eligible: false,
      reason: 'turn-tail-unavailable',
    })
  })

  it('snaps an earlier same-turn assistant to the finalized assistant boundary', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const selected = fixture.nodes.find(node => node.nodeId === 'root-a2')!
    const tail = {
      ...selected,
      nodeId: 'root-a2-tail',
      messageId: 'root-a2-tail',
      seq: 4,
      text: 'final answer after tools',
      summary: 'final answer after tools',
      branchTargetMessageId: 'root-a2-tail',
      branchTargetSeq: 4,
    }
    const projection = {
      ...fixture,
      nodes: fixture.nodes.map(node => node.nodeId === 'root-a2'
        ? { ...node, branchTargetMessageId: tail.messageId, branchTargetSeq: tail.seq }
        : node.sessionId === 'root' && node.seq >= tail.seq
          ? { ...node, seq: node.seq + 1 }
          : node).concat(tail),
      edges: fixture.edges.flatMap((edge) => {
        if (edge.edgeId !== 'sequence:root-a2:root-q3') return [edge]
        return [
          {
            edgeId: 'sequence:root-a2:root-a2-tail',
            sourceNodeId: 'root-a2',
            targetNodeId: 'root-a2-tail',
            kind: 'sequence' as const,
          },
          {
            ...edge,
            edgeId: 'sequence:root-a2-tail:root-q3',
            sourceNodeId: 'root-a2-tail',
          },
        ]
      }),
    }
    const preview = deriveContextPreview(projection, 'root-a2')

    expect(preview?.boundary).toEqual({
      eligible: true,
      boundaryNodeId: 'root-a2-tail',
      snappedToTurnTail: true,
    })
    expect(preview?.inheritedNodeIds).toEqual([
      'root-q1',
      'root-a1',
      'root-q2',
      'root-a2',
      'root-a2-tail',
    ])
    expect(preview?.inheritedEdgeIds).toContain('sequence:root-a2:root-a2-tail')
  })

  it('rejects a stale or malformed projected boundary target', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const projection = {
      ...fixture,
      nodes: fixture.nodes.map(node => node.nodeId === 'root-a2'
        ? { ...node, branchTargetMessageId: 'missing-tail', branchTargetSeq: 999 }
        : node),
    }

    expect(deriveContextPreview(projection, 'root-a2')?.boundary).toEqual({
      eligible: false,
      reason: 'turn-tail-unavailable',
    })
  })

  it('does not invent a preview for an unknown node', () => {
    expect(deriveContextPreview(nestedContextPreviewProjectionFixture(), 'missing')).toBeUndefined()
  })

  it('rejects a malformed cycle in the target ancestor chain', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const projection = {
      ...fixture,
      branches: fixture.branches.map((branch) => {
        if (branch.record.branchId !== 'branch-1') return branch
        return {
          ...branch,
          anchorNodeId: 'nested-a',
          record: {
            ...branch.record,
            parentBranchId: 'branch-1-1',
            parentSessionId: 'nested-session',
            anchorSessionId: 'nested-session',
            anchorMessageId: 'nested-a',
          },
        }
      }),
    }

    expect(deriveContextPreview(projection, 'nested-a')).toBeUndefined()
  })
})
