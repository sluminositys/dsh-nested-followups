import { describe, expect, it } from 'vitest'

import {
  anchorDotsToExpandForNode,
  branchesToExpandForNode,
  childAnchorDotIdsForBranch,
  deepExpansionTargetsForAnchor,
  deriveCollapseState,
  deriveFocusState,
  searchTreeNodes,
} from '../src/client/tree/navigation.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

describe('tree navigation state', () => {
  it('focuses the exact ancestor path and descendants without including siblings', () => {
    const focus = deriveFocusState(treeProjectionFixture(), 'branch-1-a')

    expect(focus.active).toBe(true)
    expect(focus.highlightedNodeIds).toEqual(new Set([
      'branch-1-a', 'branch-1-q',
      'root-a2', 'root-q2', 'root-a1', 'root-q1',
      'nested-q', 'nested-a',
    ]))
    expect(focus.dimmedNodeIds.has('root-q3')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-2-q')).toBe(true)
    expect(focus.highlightedBranchIds).toEqual(new Set(['branch-1', 'branch-1-1']))
  })

  it('returns an unfiltered state when focus is clear or stale', () => {
    const projection = treeProjectionFixture()
    const clear = deriveFocusState(projection, undefined)
    const stale = deriveFocusState(projection, 'missing')

    expect(clear.active).toBe(false)
    expect(clear.dimmedNodeIds.size).toBe(0)
    expect(stale.active).toBe(false)
    expect(stale.highlightedNodeIds.size).toBe(projection.nodes.length)
  })

  it('counts every nested visible message under a collapsed branch', () => {
    const collapsed = deriveCollapseState(
      treeProjectionFixture(),
      new Set(['branch-1', 'branch-1-1']),
    )

    expect(collapsed.hiddenBranchIds).toEqual(new Set(['branch-1', 'branch-1-1']))
    expect(collapsed.hiddenNodeIds).toEqual(new Set([
      'branch-1-q', 'branch-1-a', 'nested-q', 'nested-a',
    ]))
    expect(collapsed.summaries).toEqual([
      expect.objectContaining({
        branchId: 'branch-1',
        anchorNodeId: 'root-a2',
        pathLabel: '2.1',
        firstQuestionSummary: 'branch question',
        childBranchCount: 1,
        branchCount: 2,
        messageCount: 4,
      }),
    ])
    expect(collapsed.visibleBranchIds).toEqual(new Set(['branch-2']))
  })

  it('replaces a whole anchor group with one activity-aware dot', () => {
    const collapsed = deriveCollapseState(
      treeProjectionFixture(),
      new Set(),
      new Set(['root-a2']),
    )

    expect(collapsed.hiddenBranchIds).toEqual(new Set([
      'branch-1', 'branch-1-1', 'branch-2',
    ]))
    expect(collapsed.anchorGroups).toEqual([
      expect.objectContaining({
        anchorDotId: 'root-a2',
        branchCount: 2,
        messageCount: 6,
        open: false,
        activity: 'complete',
      }),
    ])
    expect(collapsed.summaries).toHaveLength(0)
  })

  it('finds text and display labels and supplies the complete expansion path', () => {
    const projection = treeProjectionFixture()
    const byLabel = searchTreeNodes(projection, 'A2.1.1')
    const byText = searchTreeNodes(projection, 'sibling answer')

    expect(byLabel[0]).toMatchObject({
      nodeId: 'nested-a',
      label: 'A2.1.1',
      branchesToExpand: ['branch-1', 'branch-1-1'],
      anchorDotsToExpand: ['root-a2', 'branch-1-a'],
    })
    expect(byText[0]).toMatchObject({ nodeId: 'branch-2-a', label: 'A2.2' })
    expect(branchesToExpandForNode(projection, 'root-a2')).toEqual([])
    expect(anchorDotsToExpandForNode(projection, 'root-a2')).toEqual([])
  })

  it('derives progressive and deep expansion targets from projection ancestry', () => {
    const projection = treeProjectionFixture()
    expect(childAnchorDotIdsForBranch(projection, 'branch-1')).toEqual(['branch-1-a'])
    expect(deepExpansionTargetsForAnchor(projection, 'root-a2')).toEqual({
      branchIds: ['branch-1', 'branch-1-1', 'branch-2'],
      anchorDotIds: ['root-a2', 'branch-1-a'],
    })
  })
})
