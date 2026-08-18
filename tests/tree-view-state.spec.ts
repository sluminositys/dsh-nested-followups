import { describe, expect, it } from 'vitest'
import {
  branchDeleteImpact,
  createTreeInteractionState,
  reconcileTreeInteractionState,
  treeInteractionReducer,
} from '../src/client/view/state.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

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
    state = treeInteractionReducer(state, { type: 'search/set', query: 'nested' })
    state = treeInteractionReducer(state, {
      type: 'search/select',
      nodeId: 'nested-a',
      branchesToExpand: ['branch-1', 'branch-1-1'],
    })

    expect(state.collapsedBranchIds.size).toBe(0)
    expect(state.selectedNodeId).toBe('nested-a')
    expect(state.searchQuery).toBe('')
  })

  it('drops stale identities after a projection refresh', () => {
    let state = createTreeInteractionState()
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'missing-branch' })
    state = treeInteractionReducer(state, { type: 'node/toggle-expanded', nodeId: 'missing-node' })
    state = treeInteractionReducer(state, { type: 'focus/set', nodeId: 'missing-node' })
    state = treeInteractionReducer(state, {
      type: 'composer/open', nodeId: 'missing-node', mode: 'continue',
    })

    const reconciled = reconcileTreeInteractionState(state, treeProjectionFixture())
    expect(reconciled.collapsedBranchIds.size).toBe(0)
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
})
