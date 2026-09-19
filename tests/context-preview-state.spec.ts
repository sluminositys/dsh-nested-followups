import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  createTreeInteractionState,
  loadTreeViewState,
  saveTreeViewState,
  toTreeViewState,
  treeInteractionReducer,
  type TreeInteractionState,
  type TreeViewStateStorage,
} from '../src/client/view/state.ts'
import { nestedContextPreviewProjectionFixture } from './fixtures/context-preview.ts'

function previewState(): TreeInteractionState {
  return {
    ...createTreeInteractionState(undefined, 'tree-layout'),
    contextPreviewNodeId: 'nested-a',
  }
}

describe('ephemeral context preview selection', () => {
  it('starts closed and never restores a preview from durable input', () => {
    const initial = createTreeInteractionState(undefined, 'tree-layout')
    const stored = {
      ...toTreeViewState(initial, { x: 0, y: 0, zoom: 1 }),
      contextPreviewNodeId: 'nested-a',
    }

    expectTypeOf<TreeInteractionState['contextPreviewNodeId']>()
      .toEqualTypeOf<string | undefined>()
    expect(initial).toHaveProperty('contextPreviewNodeId', undefined)
    expect(createTreeInteractionState(stored))
      .toHaveProperty('contextPreviewNodeId', undefined)
  })

  it('keeps the preview independent of focus, details, composer, search and folds', () => {
    const initial = previewState()
    let state = treeInteractionReducer(initial, { type: 'focus/set', nodeId: 'root-a2' })
    state = treeInteractionReducer(state, {
      type: 'composer/open', nodeId: 'branch-1-a2', mode: 'continue',
    })
    state = treeInteractionReducer(state, { type: 'selection/set', nodeId: 'root-a1' })
    state = treeInteractionReducer(state, { type: 'search/set', query: 'question' })
    state = treeInteractionReducer(state, { type: 'branch/toggle', branchId: 'branch-1' })
    state = treeInteractionReducer(state, {
      type: 'anchors/collapse-all', anchorDotIds: ['root-a2'],
    })

    expect(state.contextPreviewNodeId).toBe('nested-a')
    expect(state.focusedNodeId).toBe('root-a2')
    expect(state.selectedNodeId).toBe('root-a1')
    expect(state.composerNodeId).toBe('branch-1-a2')
    expect(state.composerMode).toBe('continue')
    expect(state.searchQuery).toBe('question')
    expect(state.collapsedBranchIds).toEqual(new Set(['branch-1']))
    expect(state.anchorDotIds).toEqual(new Set(['root-a2']))
    expect(initial).toEqual(previewState())
  })

  it('opens, retargets and closes a preview without changing the surrounding interaction', () => {
    const initial: TreeInteractionState = {
      ...createTreeInteractionState(undefined, 'tree-layout'),
      focusedNodeId: 'root-a2',
      selectedNodeId: 'root-a1',
      composerNodeId: 'branch-1-a2',
      composerMode: 'continue',
      searchQuery: 'question',
      collapsedBranchIds: new Set(['branch-2']),
      anchorDotIds: new Set(['root-a2']),
    }
    const opened = treeInteractionReducer(initial, { type: 'preview/open', nodeId: 'nested-a' })
    const retargeted = treeInteractionReducer(opened, {
      type: 'preview/open', nodeId: 'branch-1-a',
    })
    const closed = treeInteractionReducer(retargeted, { type: 'preview/close' })

    expect(opened).toEqual({ ...initial, contextPreviewNodeId: 'nested-a' })
    expect(retargeted).toEqual({ ...initial, contextPreviewNodeId: 'branch-1-a' })
    expect(closed).toEqual(initial)
    expect(treeInteractionReducer(closed, { type: 'preview/close' })).toEqual(initial)
    expect(initial.contextPreviewNodeId).toBeUndefined()
  })

  it('reveals a folded context row without changing the preview target or other folds', () => {
    const initial: TreeInteractionState = {
      ...previewState(),
      focusedNodeId: 'root-a2',
      selectedNodeId: 'root-a1',
      composerNodeId: 'branch-1-a2',
      composerMode: 'continue',
      searchQuery: 'nested',
      collapsedBranchIds: new Set(['branch-1', 'branch-1-1', 'branch-2']),
      anchorDotIds: new Set(['root-a2', 'branch-1-a', 'root-a3']),
    }
    const revealed = treeInteractionReducer(initial, {
      type: 'preview/reveal',
      nodeId: 'nested-a',
      branchesToExpand: ['branch-1', 'branch-1-1'],
      anchorDotsToExpand: ['root-a2', 'branch-1-a'],
    })

    expect(revealed).toEqual({
      ...initial,
      selectedNodeId: 'nested-a',
      collapsedBranchIds: new Set(['branch-2']),
      anchorDotIds: new Set(['root-a3']),
    })
    expect(initial.collapsedBranchIds).toEqual(new Set(['branch-1', 'branch-1-1', 'branch-2']))
    expect(initial.anchorDotIds).toEqual(new Set(['root-a2', 'branch-1-a', 'root-a3']))
  })

  it('can reveal a different context row while keeping the original preview open', () => {
    const revealed = treeInteractionReducer(previewState(), {
      type: 'preview/reveal',
      nodeId: 'root-a1',
      branchesToExpand: [],
      anchorDotsToExpand: [],
    })

    expect(revealed.contextPreviewNodeId).toBe('nested-a')
    expect(revealed.selectedNodeId).toBe('root-a1')
    expect(revealed.expandedNodeIds.size).toBe(0)
  })

  it('omits the preview from serialization while preserving durable preferences', () => {
    const values = new Map<string, string>()
    const storage: TreeViewStateStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
      removeItem: key => { values.delete(key) },
    }
    const state: TreeInteractionState = {
      ...previewState(),
      collapsedBranchIds: new Set(['branch-1']),
      anchorDotIds: new Set(['branch-1-a']),
      expandedNodeIds: new Set(['root-a1']),
      focusedNodeId: 'root-a2',
    }
    const durable = toTreeViewState(state, { x: 12, y: -4, zoom: 0.8 })

    expect(durable).not.toHaveProperty('contextPreviewNodeId')
    saveTreeViewState(durable, storage)
    expect(values.size).toBe(1)
    expect([...values.values()][0]).not.toContain('contextPreviewNodeId')
    const loaded = loadTreeViewState(state.treeId, storage)
    expect(loaded).toEqual(durable)
    expect(createTreeInteractionState(loaded)).toEqual({
      ...state,
      contextPreviewNodeId: undefined,
    })
    expect(state.contextPreviewNodeId).toBe('nested-a')
  })

  it.each(['tree-layout', 'another-tree'])('closes the preview on view restore to %s', treeId => {
    const state = previewState()
    const viewState = {
      ...toTreeViewState(state, { x: 0, y: 0, zoom: 1 }),
      treeId,
    }
    const restored = treeInteractionReducer(state, { type: 'view/restore', treeId, viewState })

    expect(restored.treeId).toBe(treeId)
    expect(restored.contextPreviewNodeId).toBeUndefined()
    expect(state.contextPreviewNodeId).toBe('nested-a')
  })

  it('keeps a live preview target when its ancestor branch has later turns', () => {
    const state = previewState()
    const projection = nestedContextPreviewProjectionFixture()
    const before = structuredClone(projection)
    const reconciled = treeInteractionReducer(state, { type: 'projection/reconcile', projection })

    expect(reconciled.contextPreviewNodeId).toBe('nested-a')
    expect(reconciled).toEqual(state)
    expect(projection).toEqual(before)
  })

  it('clears the preview after its branch disappears without disturbing other selections', () => {
    const state: TreeInteractionState = {
      ...previewState(), focusedNodeId: 'root-a2', selectedNodeId: 'branch-2-a',
    }
    const projection = nestedContextPreviewProjectionFixture()
    const nodes = projection.nodes.filter(node => node.branchId !== 'branch-1-1')
    const remainingIds = new Set(nodes.map(node => node.nodeId))
    const reconciled = treeInteractionReducer(state, {
      type: 'projection/reconcile',
      projection: {
        ...projection,
        nodes,
        branches: projection.branches.filter(branch => branch.record.branchId !== 'branch-1-1'),
        edges: projection.edges.filter(edge => remainingIds.has(edge.sourceNodeId)
          && remainingIds.has(edge.targetNodeId)),
      },
    })

    expect(reconciled.contextPreviewNodeId).toBeUndefined()
    expect(reconciled.focusedNodeId).toBe('root-a2')
    expect(reconciled.selectedNodeId).toBe('branch-2-a')
    expect(state.contextPreviewNodeId).toBe('nested-a')
  })

  it('does not carry the preview into another tree with overlapping node IDs', () => {
    const state = previewState()
    const projection = nestedContextPreviewProjectionFixture()
    const treeId = 'another-tree'
    const reconciled = treeInteractionReducer(state, {
      type: 'projection/reconcile',
      projection: {
        ...projection,
        tree: { ...projection.tree, treeId },
        nodes: projection.nodes.map(node => ({ ...node, treeId })),
        branches: projection.branches.map(branch => ({
          ...branch, record: { ...branch.record, treeId },
        })),
      },
    })

    expect(reconciled.contextPreviewNodeId).toBeUndefined()
    expect(state.contextPreviewNodeId).toBe('nested-a')
  })
})
