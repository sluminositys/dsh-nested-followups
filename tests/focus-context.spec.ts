import { describe, expect, it } from 'vitest'
import { deriveFocusState } from '../src/client/tree/navigation.ts'
import { nestedContextPreviewProjectionFixture } from './fixtures/context-preview.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

describe('focus context', () => {
  it('keeps only the exact ancestor chain and selected subtree active', () => {
    const focus = deriveFocusState(treeProjectionFixture(), 'nested-a')

    expect(focus.highlightedNodeIds).toEqual(new Set([
      'root-q1',
      'root-a1',
      'root-q2',
      'root-a2',
      'branch-1-q',
      'branch-1-a',
      'nested-q',
      'nested-a',
    ]))
    expect(focus.dimmedNodeIds).toEqual(new Set([
      'root-q3',
      'root-a3',
      'branch-2-q',
      'branch-2-a',
    ]))
    expect(focus.highlightedEdgeIds).toEqual(new Set([
      'sequence:root-q1:root-a1',
      'sequence:root-a1:root-q2',
      'sequence:root-q2:root-a2',
      'branch:root-a2:branch-1-q',
      'sequence:branch-1-q:branch-1-a',
      'branch:branch-1-a:nested-q',
      'sequence:nested-q:nested-a',
    ]))
    expect(focus.dimmedEdgeIds).toEqual(new Set([
      'sequence:root-a2:root-q3',
      'sequence:root-q3:root-a3',
      'sequence:branch-2-q:branch-2-a',
      'branch:root-a2:branch-2-q',
    ]))
    expect(focus.highlightedBranchIds).toEqual(new Set(['branch-1', 'branch-1-1']))
  })

  it('dims later turns of an ancestor branch that sit outside the focused context', () => {
    const focus = deriveFocusState(nestedContextPreviewProjectionFixture(), 'nested-a')

    expect(focus.highlightedNodeIds.has('branch-1-q')).toBe(true)
    expect(focus.highlightedNodeIds.has('branch-1-a')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-1-q2')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-1-a2')).toBe(true)
  })

  it('includes descendants of the selected node without restoring excluded ancestor tails', () => {
    const focus = deriveFocusState(nestedContextPreviewProjectionFixture(), 'nested-q')

    expect(focus.highlightedNodeIds.has('nested-a')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-1-q2')).toBe(true)
    expect(focus.dimmedNodeIds.has('branch-1-a2')).toBe(true)
  })

  it('keeps later turns highlighted when focusing inside their own branch', () => {
    const focus = deriveFocusState(nestedContextPreviewProjectionFixture(), 'branch-1-q')

    expect(focus.highlightedNodeIds.has('branch-1-a2')).toBe(true)
  })
})
