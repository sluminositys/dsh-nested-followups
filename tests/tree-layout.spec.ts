import { describe, expect, it } from 'vitest'

import { layoutConversationTree } from '../src/client/tree/layout.ts'
import type { ConversationTreeProjection, TreeEdgeView } from '../src/shared/projection.ts'
import type { MessageNodeView } from '../src/shared/types.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

function nodeMap(layout: ReturnType<typeof layoutConversationTree>) {
  return new Map(layout.nodes.map(node => [node.nodeId, node] as const))
}

describe('conversation tree layout', () => {
  it('keeps the root vertical and assigns one rightward lane per branch depth', () => {
    const layout = layoutConversationTree(treeProjectionFixture())
    const nodes = nodeMap(layout)
    const root = layout.nodes.filter(node => node.branchId === null)
    const rootY = root.map(node => node.rect.y)

    expect(new Set(root.map(node => node.rect.x))).toEqual(new Set([80]))
    expect(rootY).toEqual([...rootY].sort((a, b) => a - b))
    expect(nodes.get('branch-1-q')?.rect.x).toBeGreaterThan(nodes.get('root-a2')!.rect.x)
    expect(nodes.get('nested-q')?.rect.x).toBeGreaterThan(nodes.get('branch-1-a')!.rect.x)
    expect(nodes.get('branch-1-q')?.rect.y).toBe(nodes.get('root-a2')?.rect.y)
    expect(nodes.get('nested-q')?.rect.y).toBe(nodes.get('branch-1-a')?.rect.y)
  })

  it('stacks sibling branches without overlapping and preserves creation order', () => {
    const layout = layoutConversationTree(treeProjectionFixture())
    const nodes = nodeMap(layout)
    const firstBottom = nodes.get('branch-1-a')!.rect.y + nodes.get('branch-1-a')!.rect.height
    const secondTop = nodes.get('branch-2-q')!.rect.y

    expect(secondTop).toBeGreaterThan(firstBottom)
    expect(nodes.get('branch-1-q')?.depth).toBe(1)
    expect(nodes.get('branch-2-q')?.depth).toBe(1)
  })

  it('produces the same node positions when projection arrays arrive in a different order', () => {
    const projection = treeProjectionFixture()
    const reordered = {
      ...projection,
      nodes: [...projection.nodes].reverse(),
      edges: [...projection.edges].reverse(),
      branches: [...projection.branches].reverse(),
    }
    const positions = (input: typeof projection) => Object.fromEntries(
      layoutConversationTree(input).nodes
        .map(node => [node.nodeId, node.rect] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    )

    expect(positions(reordered)).toEqual(positions(projection))
  })

  it('replaces a collapsed branch and all descendants with one anatomical capsule', () => {
    const projection = treeProjectionFixture()
    const expanded = layoutConversationTree(projection)
    const collapsed = layoutConversationTree(projection, {
      collapsedBranchIds: new Set(['branch-1', 'branch-1-1']),
    })
    const visibleIds = new Set(collapsed.nodes.map(node => node.nodeId))

    expect(visibleIds.has('branch-1-q')).toBe(false)
    expect(visibleIds.has('nested-q')).toBe(false)
    expect(visibleIds.has('branch-2-q')).toBe(true)
    expect(collapsed.branchCapsules).toEqual([
      expect.objectContaining({
        branchId: 'branch-1',
        anchorNodeId: 'root-a2',
        pathLabel: '2.1',
        firstQuestionSummary: 'branch question',
        childBranchCount: 1,
        messageCount: 4,
      }),
    ])
    const expandedRoot = expanded.nodes.filter(node => node.branchId === null)
    const collapsedRoot = collapsed.nodes.filter(node => node.branchId === null)
    expect(collapsedRoot).toEqual(expandedRoot)
  })

  it('uses one compact anchor control for a closed group and keeps cards hidden', () => {
    const layout = layoutConversationTree(treeProjectionFixture(), {
      anchorDotIds: new Set(['root-a2']),
    })
    const visibleIds = new Set(layout.nodes.map(node => node.nodeId))

    expect(visibleIds.has('branch-1-q')).toBe(false)
    expect(visibleIds.has('branch-2-q')).toBe(false)
    expect(layout.branchCapsules).toHaveLength(0)
    expect(layout.anchorControls).toEqual([
      expect.objectContaining({
        anchorDotId: 'root-a2',
        branchCount: 2,
        messageCount: 6,
        open: false,
        nested: false,
      }),
    ])
  })

  it('reserves one lane for a mixed card and capsule composition without overlap', () => {
    const layout = layoutConversationTree(treeProjectionFixture(), {
      collapsedBranchIds: new Set(['branch-2']),
      anchorDotIds: new Set(['branch-1-a']),
    })
    const cardBottom = Math.max(...layout.nodes
      .filter(node => node.branchId === 'branch-1')
      .map(node => node.rect.y + node.rect.height))
    const siblingCapsule = layout.branchCapsules.find(capsule => capsule.branchId === 'branch-2')!

    expect(siblingCapsule.rect.y).toBeGreaterThan(cardBottom)
    expect(layout.anchorControls.some(control => control.anchorDotId === 'branch-1-a'
      && !control.open && control.nested)).toBe(true)
  })

  it('connects branch edges from the anchor right port with a smooth path', () => {
    const layout = layoutConversationTree(treeProjectionFixture())
    const nodes = nodeMap(layout)
    const edge = layout.edges.find(candidate => candidate.edgeId === 'branch:root-a2:branch-1-q')
    const anchor = nodes.get('root-a2')!.rect

    expect(edge?.start).toEqual({
      x: anchor.x + anchor.width,
      y: anchor.y + anchor.height / 2,
    })
    expect(edge?.path).toMatch(/^M .+ C .+$/u)
  })

  it('keeps a 200-message mainline finite, ordered, and deterministic', () => {
    const fixture = treeProjectionFixture()
    const nodes: MessageNodeView[] = Array.from({ length: 200 }, (_, index) => {
      const role = index % 2 === 0 ? 'user' as const : 'assistant' as const
      const localTurnIndex = Math.floor(index / 2) + 1
      const nodeId = `large-root-${index}`
      return {
        nodeId,
        treeId: fixture.tree.treeId,
        branchId: null,
        sessionId: 'large-root',
        messageId: nodeId,
        seq: index,
        role,
        turnId: `large-root:${localTurnIndex}`,
        branchPath: [localTurnIndex],
        localTurnIndex,
        time: index,
        text: `message ${index}`,
        summary: `message ${index}`,
        state: 'complete',
        ...(role === 'assistant' ? {
          branchTargetMessageId: nodeId,
          branchTargetSeq: index,
        } : {}),
      }
    })
    const edges: TreeEdgeView[] = nodes.slice(1).map((target, index) => ({
      edgeId: `sequence:${nodes[index]!.nodeId}:${target.nodeId}`,
      sourceNodeId: nodes[index]!.nodeId,
      targetNodeId: target.nodeId,
      kind: 'sequence',
    }))
    const projection: ConversationTreeProjection = {
      tree: fixture.tree,
      nodes,
      edges,
      branches: [],
      diagnostics: [],
    }

    const first = layoutConversationTree(projection)
    const second = layoutConversationTree({
      ...projection,
      nodes: [...nodes].reverse(),
      edges: [...edges].reverse(),
    })

    expect(first.nodes).toHaveLength(200)
    expect(first.nodes.map(node => node.rect.y))
      .toEqual(first.nodes.map(node => node.rect.y).sort((left, right) => left - right))
    expect(Object.values(first.bounds).every(Number.isFinite)).toBe(true)
    expect(second.nodes).toEqual(first.nodes)
    expect(second.bounds).toEqual(first.bounds)
  })
})
