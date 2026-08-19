import type { ConversationTreeProjection } from '../../shared/projection.ts'

export interface TreeInteractionState {
  readonly collapsedBranchIds: ReadonlySet<string>
  readonly anchorDotIds: ReadonlySet<string>
  readonly expandedNodeIds: ReadonlySet<string>
  readonly focusedNodeId: string | undefined
  readonly composerNodeId: string | undefined
  readonly composerMode: 'ask' | 'continue' | undefined
  readonly selectedNodeId: string | undefined
  readonly searchQuery: string
}

export type TreeInteractionAction =
  | { type: 'branch/toggle'; branchId: string; childAnchorDotIds?: readonly string[] }
  | {
      type: 'branch/deep-expand'
      branchIds: readonly string[]
      anchorDotIds: readonly string[]
    }
  | { type: 'anchor/toggle'; anchorDotId: string }
  | {
      type: 'anchor/deep-expand'
      anchorDotIds: readonly string[]
      branchIds: readonly string[]
    }
  | { type: 'anchors/collapse-all'; anchorDotIds: readonly string[] }
  | { type: 'node/toggle-expanded'; nodeId: string }
  | { type: 'focus/set'; nodeId: string | undefined }
  | { type: 'composer/open'; nodeId: string; mode: 'ask' | 'continue' }
  | { type: 'composer/close' }
  | { type: 'selection/set'; nodeId: string | undefined }
  | { type: 'search/set'; query: string }
  | {
      type: 'search/select'
      nodeId: string
      branchesToExpand: readonly string[]
      anchorDotsToExpand: readonly string[]
    }
  | { type: 'projection/reconcile'; projection: ConversationTreeProjection }

export function createTreeInteractionState(): TreeInteractionState {
  return {
    collapsedBranchIds: new Set(),
    anchorDotIds: new Set(),
    expandedNodeIds: new Set(),
    focusedNodeId: undefined,
    composerNodeId: undefined,
    composerMode: undefined,
    selectedNodeId: undefined,
    searchQuery: '',
  }
}

function toggled(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(values)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function treeInteractionReducer(
  state: TreeInteractionState,
  action: TreeInteractionAction,
): TreeInteractionState {
  switch (action.type) {
    case 'branch/toggle': {
      const collapsedBranchIds = toggled(state.collapsedBranchIds, action.branchId)
      if (collapsedBranchIds.has(action.branchId)) return { ...state, collapsedBranchIds }
      const anchorDotIds = new Set(state.anchorDotIds)
      for (const anchorDotId of action.childAnchorDotIds ?? []) anchorDotIds.add(anchorDotId)
      return { ...state, collapsedBranchIds, anchorDotIds }
    }
    case 'branch/deep-expand': {
      const collapsedBranchIds = new Set(state.collapsedBranchIds)
      for (const branchId of action.branchIds) collapsedBranchIds.delete(branchId)
      const anchorDotIds = new Set(state.anchorDotIds)
      for (const anchorDotId of action.anchorDotIds) anchorDotIds.delete(anchorDotId)
      return { ...state, collapsedBranchIds, anchorDotIds }
    }
    case 'anchor/toggle':
      return { ...state, anchorDotIds: toggled(state.anchorDotIds, action.anchorDotId) }
    case 'anchor/deep-expand': {
      const anchorDotIds = new Set(state.anchorDotIds)
      for (const anchorDotId of action.anchorDotIds) anchorDotIds.delete(anchorDotId)
      const collapsedBranchIds = new Set(state.collapsedBranchIds)
      for (const branchId of action.branchIds) collapsedBranchIds.delete(branchId)
      return { ...state, anchorDotIds, collapsedBranchIds }
    }
    case 'anchors/collapse-all':
      return { ...state, anchorDotIds: new Set(action.anchorDotIds) }
    case 'node/toggle-expanded':
      return { ...state, expandedNodeIds: toggled(state.expandedNodeIds, action.nodeId) }
    case 'focus/set':
      return { ...state, focusedNodeId: action.nodeId }
    case 'composer/open':
      return {
        ...state,
        composerNodeId: action.nodeId,
        composerMode: action.mode,
        selectedNodeId: action.nodeId,
      }
    case 'composer/close':
      return { ...state, composerNodeId: undefined, composerMode: undefined }
    case 'selection/set':
      return { ...state, selectedNodeId: action.nodeId }
    case 'search/set':
      return { ...state, searchQuery: action.query }
    case 'search/select': {
      const collapsedBranchIds = new Set(state.collapsedBranchIds)
      for (const branchId of action.branchesToExpand) collapsedBranchIds.delete(branchId)
      const anchorDotIds = new Set(state.anchorDotIds)
      for (const anchorDotId of action.anchorDotsToExpand) anchorDotIds.delete(anchorDotId)
      return {
        ...state,
        collapsedBranchIds,
        anchorDotIds,
        selectedNodeId: action.nodeId,
        searchQuery: '',
      }
    }
    case 'projection/reconcile':
      return reconcileTreeInteractionState(state, action.projection)
  }
}

/** Remove UI references that no longer exist after a projection refresh. */
export function reconcileTreeInteractionState(
  state: TreeInteractionState,
  projection: ConversationTreeProjection,
): TreeInteractionState {
  const nodeIds = new Set(projection.nodes.map(node => node.nodeId))
  const branchIds = new Set(projection.branches.map(branch => branch.record.branchId))
  const anchorDotIds = new Set(
    projection.branches.map(branch => branch.record.anchorMessageId),
  )
  return {
    ...state,
    collapsedBranchIds: new Set(
      [...state.collapsedBranchIds].filter(branchId => branchIds.has(branchId)),
    ),
    anchorDotIds: new Set(
      [...state.anchorDotIds].filter(anchorDotId => anchorDotIds.has(anchorDotId)),
    ),
    expandedNodeIds: new Set(
      [...state.expandedNodeIds].filter(nodeId => nodeIds.has(nodeId)),
    ),
    focusedNodeId: state.focusedNodeId !== undefined && nodeIds.has(state.focusedNodeId)
      ? state.focusedNodeId
      : undefined,
    composerNodeId: state.composerNodeId !== undefined && nodeIds.has(state.composerNodeId)
      ? state.composerNodeId
      : undefined,
    composerMode: state.composerNodeId !== undefined && nodeIds.has(state.composerNodeId)
      ? state.composerMode
      : undefined,
    selectedNodeId: state.selectedNodeId !== undefined && nodeIds.has(state.selectedNodeId)
      ? state.selectedNodeId
      : undefined,
  }
}

export interface BranchDeleteImpact {
  readonly branchCount: number
  readonly messageCount: number
}

/** Count one branch and every nested branch that its deletion removes. */
export function branchDeleteImpact(
  projection: ConversationTreeProjection,
  branchId: string,
): BranchDeleteImpact {
  const children = new Map<string, string[]>()
  for (const branch of projection.branches) {
    const parentId = branch.record.parentBranchId
    if (parentId === null) continue
    const list = children.get(parentId) ?? []
    list.push(branch.record.branchId)
    children.set(parentId, list)
  }
  const branches = new Map(
    projection.branches.map(branch => [branch.record.branchId, branch] as const),
  )
  const queue = [branchId]
  const visited = new Set<string>()
  let messageCount = 0
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visited.has(current)) continue
    visited.add(current)
    messageCount += branches.get(current)?.nodeIds.length ?? 0
    for (const childId of children.get(current) ?? []) queue.push(childId)
  }
  return { branchCount: visited.size, messageCount }
}
