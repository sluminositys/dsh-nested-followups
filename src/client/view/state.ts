import type { ConversationTreeProjection } from '../../shared/projection.ts'

export interface TreeInteractionState {
  readonly collapsedBranchIds: ReadonlySet<string>
  readonly expandedNodeIds: ReadonlySet<string>
  readonly focusedNodeId: string | undefined
  readonly composerNodeId: string | undefined
  readonly selectedNodeId: string | undefined
  readonly searchQuery: string
}

export type TreeInteractionAction =
  | { type: 'branch/toggle'; branchId: string }
  | { type: 'node/toggle-expanded'; nodeId: string }
  | { type: 'focus/set'; nodeId: string | undefined }
  | { type: 'composer/open'; nodeId: string }
  | { type: 'composer/close' }
  | { type: 'selection/set'; nodeId: string | undefined }
  | { type: 'search/set'; query: string }
  | { type: 'search/select'; nodeId: string; branchesToExpand: readonly string[] }
  | { type: 'projection/reconcile'; projection: ConversationTreeProjection }

export function createTreeInteractionState(): TreeInteractionState {
  return {
    collapsedBranchIds: new Set(),
    expandedNodeIds: new Set(),
    focusedNodeId: undefined,
    composerNodeId: undefined,
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
    case 'branch/toggle':
      return { ...state, collapsedBranchIds: toggled(state.collapsedBranchIds, action.branchId) }
    case 'node/toggle-expanded':
      return { ...state, expandedNodeIds: toggled(state.expandedNodeIds, action.nodeId) }
    case 'focus/set':
      return { ...state, focusedNodeId: action.nodeId }
    case 'composer/open':
      return { ...state, composerNodeId: action.nodeId, selectedNodeId: action.nodeId }
    case 'composer/close':
      return { ...state, composerNodeId: undefined }
    case 'selection/set':
      return { ...state, selectedNodeId: action.nodeId }
    case 'search/set':
      return { ...state, searchQuery: action.query }
    case 'search/select': {
      const collapsedBranchIds = new Set(state.collapsedBranchIds)
      for (const branchId of action.branchesToExpand) collapsedBranchIds.delete(branchId)
      return {
        ...state,
        collapsedBranchIds,
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
  return {
    ...state,
    collapsedBranchIds: new Set(
      [...state.collapsedBranchIds].filter(branchId => branchIds.has(branchId)),
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
