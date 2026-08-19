import { describe, expect, it } from 'vitest'
import {
  branchDeleteImpact,
  clearTreeViewState,
  createTreeInteractionState,
  loadTreeViewState,
  reconcileTreeInteractionState,
  saveTreeViewState,
  toTreeViewState,
  treeInteractionReducer,
} from '../src/client/view/state.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('tree interaction state', () => {
  it('toggles branches, expanded cards, focus, and the local composer independently', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1' })
    state = treeInteractionReducer(state, { type: 'node/toggle-expanded', nodeId: 'root-a2' })
    state = treeInteractionReducer(state, { type: 'focus/set', nodeId: 'root-a2' })
    state = treeInteractionReducer(state, {
      type: 'composer/open', nodeId: 'root-a2', mode: 'ask',
    })

    expect([...state.collapsedBranchIds]).toEqual(['branch-1'])
    expect([...state.expandedNodeIds]).toEqual(['root-a2'])
    expect(state.focusedNodeId).toBe('root-a2')
    expect(state.composerNodeId).toBe('root-a2')
    expect(state.composerMode).toBe('ask')
    expect(state.selectedNodeId).toBe('root-a2')

    state = treeInteractionReducer(state, { type: 'composer/close' })
    expect(state.composerNodeId).toBeUndefined()
    expect(state.composerMode).toBeUndefined()
    expect(state.focusedNodeId).toBe('root-a2')
  })

  it('expands every collapsed ancestor when selecting a search result', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1' })
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1-1' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'root-a2' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'branch-1-a' })
    state = treeInteractionReducer(state, { type: 'search/set', query: 'nested' })
    state = treeInteractionReducer(state, {
      type: 'search/select',
      nodeId: 'nested-a',
      branchesToExpand: ['branch-1', 'branch-1-1'],
      anchorDotsToExpand: ['root-a2', 'branch-1-a'],
    })

    expect(state.collapsedBranchIds.size).toBe(0)
    expect(state.anchorDotIds.size).toBe(0)
    expect(state.selectedNodeId).toBe('nested-a')
    expect(state.searchQuery).toBe('')
  })

  it('drops stale identities after a projection refresh', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'missing-branch' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'missing-anchor' })
    state = treeInteractionReducer(state, { type: 'node/toggle-expanded', nodeId: 'missing-node' })
    state = treeInteractionReducer(state, { type: 'focus/set', nodeId: 'missing-node' })
    state = treeInteractionReducer(state, {
      type: 'composer/open', nodeId: 'missing-node', mode: 'continue',
    })

    const reconciled = reconcileTreeInteractionState(state, treeProjectionFixture())
    expect(reconciled.collapsedBranchIds.size).toBe(0)
    expect(reconciled.anchorDotIds.size).toBe(0)
    expect(reconciled.expandedNodeIds.size).toBe(0)
    expect(reconciled.focusedNodeId).toBeUndefined()
    expect(reconciled.composerNodeId).toBeUndefined()
    expect(reconciled.composerMode).toBeUndefined()
    expect(reconciled.selectedNodeId).toBeUndefined()
  })

  it('counts one complete nested branch subtree without including siblings', () => {
    const projection = treeProjectionFixture()
    expect(branchDeleteImpact(projection, 'branch-1')).toEqual({
      branchCount: 2,
      messageCount: 4,
    })
    expect(branchDeleteImpact(projection, 'branch-2')).toEqual({
      branchCount: 1,
      messageCount: 2,
    })
  })

  it('keeps descendant capsule choices sticky when a whole anchor group closes and reopens', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'root-a2' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'root-a2' })

    expect(state.anchorDotIds.size).toBe(0)
    expect(state.collapsedBranchIds).toEqual(new Set(['branch-1']))
  })

  it('defaults child anchors to dots on progressive expansion and supports Alt deep expansion', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1' })
    state = treeInteractionReducer(state, {
      type: 'branch/toggle',
      branchId: 'branch-1',
      childAnchorDotIds: ['branch-1-a'],
    })
    expect(state.anchorDotIds).toEqual(new Set(['branch-1-a']))

    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1' })
    state = treeInteractionReducer(state, {
      type: 'branch/deep-expand',
      branchIds: ['branch-1', 'branch-1-1'],
      anchorDotIds: ['branch-1-a'],
    })
    expect(state.collapsedBranchIds.size).toBe(0)
    expect(state.anchorDotIds.size).toBe(0)
  })

  it('deep-expands an anchor group without changing unrelated fold records', () => {
    let state = createTreeInteractionState()
    for (const branchId of ['branch-1', 'branch-1-1', 'branch-2', 'unrelated']) {
      state = treeInteractionReducer(state, { type: 'branch/toggle', branchId })
    }
    for (const anchorDotId of ['root-a2', 'branch-1-a', 'unrelated-anchor']) {
      state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId })
    }
    state = treeInteractionReducer(state, {
      type: 'anchor/deep-expand',
      branchIds: ['branch-1', 'branch-1-1', 'branch-2'],
      anchorDotIds: ['root-a2', 'branch-1-a'],
    })

    expect(state.collapsedBranchIds).toEqual(new Set(['unrelated']))
    expect(state.anchorDotIds).toEqual(new Set(['unrelated-anchor']))
  })

  it('collapses every supplied root anchor without erasing branch-level records', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-2' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'branch-1-a' })
    state = treeInteractionReducer(state, {
      type: 'anchors/collapse-all',
      anchorDotIds: ['root-a2', 'root-a3'],
    })

    expect(state.anchorDotIds).toEqual(new Set(['branch-1-a', 'root-a2', 'root-a3']))
    expect(state.collapsedBranchIds).toEqual(new Set(['branch-2']))
  })

  it('round-trips collapse state per tree and falls back to fully expanded when cleared', () => {
    const storage = new MemoryStorage()
    let state = createTreeInteractionState(undefined, 'tree-layout')
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-2' })
    state = treeInteractionReducer(state, { type: 'anchor/toggle', anchorDotId: 'branch-1-a' })
    state = treeInteractionReducer(state, { type: 'focus/set', nodeId: 'root-a2' })
    const viewState = toTreeViewState(state, { x: 12, y: -4, zoom: 0.8 })

    saveTreeViewState(viewState, storage)
    expect(loadTreeViewState('tree-layout', storage)).toEqual(viewState)
    expect(loadTreeViewState('another-tree', storage)).toBeUndefined()

    clearTreeViewState('tree-layout', storage)
    const restored = createTreeInteractionState(loadTreeViewState('tree-layout', storage), 'tree-layout')
    expect(restored.collapsedBranchIds.size).toBe(0)
    expect(restored.anchorDotIds.size).toBe(0)
  })

  it('ignores corrupt or incomplete stored ViewState', () => {
    const storage = new MemoryStorage()
    storage.setItem('dsh-nested-followups:tree-view:v1:tree-layout', '{"treeId":"tree-layout"}')
    expect(loadTreeViewState('tree-layout', storage)).toBeUndefined()
  })
})
