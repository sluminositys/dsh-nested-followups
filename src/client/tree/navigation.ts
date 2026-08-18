import { displayLabelOf } from '../../shared/labels.ts'
import type { BranchProjectionView, ConversationTreeProjection } from '../../shared/projection.ts'
import type { MessageNodeView } from '../../shared/types.ts'

export interface CollapsedBranchSummary {
  branchId: string
  anchorNodeId?: string
  hiddenNodeCount: number
}

export interface CollapseState {
  hiddenNodeIds: ReadonlySet<string>
  hiddenBranchIds: ReadonlySet<string>
  summaries: readonly CollapsedBranchSummary[]
}

export interface FocusState {
  active: boolean
  highlightedNodeIds: ReadonlySet<string>
  dimmedNodeIds: ReadonlySet<string>
  highlightedEdgeIds: ReadonlySet<string>
  dimmedEdgeIds: ReadonlySet<string>
  highlightedBranchIds: ReadonlySet<string>
}

export interface TreeSearchResult {
  nodeId: string
  label: string
  role: MessageNodeView['role']
  summary: string
  time: number
  branchPath: readonly number[]
  branchesToExpand: readonly string[]
}

function branchMap(projection: ConversationTreeProjection): Map<string, BranchProjectionView> {
  return new Map(projection.branches.map(branch => [branch.record.branchId, branch] as const))
}

function childBranchMap(
  projection: ConversationTreeProjection,
): Map<string, BranchProjectionView[]> {
  const children = new Map<string, BranchProjectionView[]>()
  for (const branch of projection.branches) {
    const parentId = branch.record.parentBranchId
    if (parentId === null) continue
    const siblings = children.get(parentId) ?? []
    siblings.push(branch)
    children.set(parentId, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort(compareBranches)
  }
  return children
}

function compareBranches(left: BranchProjectionView, right: BranchProjectionView): number {
  return left.record.siblingOrdinal - right.record.siblingOrdinal
    || left.record.createdAt - right.record.createdAt
    || left.record.branchId.localeCompare(right.record.branchId)
}

function branchDepth(
  branch: BranchProjectionView,
  branches: ReadonlyMap<string, BranchProjectionView>,
): number {
  let depth = 1
  let parentId = branch.record.parentBranchId
  const visited = new Set([branch.record.branchId])
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = branches.get(parentId)
    if (parent === undefined) break
    depth += 1
    parentId = parent.record.parentBranchId
  }
  return depth
}

function subtreeBranchIds(
  rootBranchId: string,
  children: ReadonlyMap<string, readonly BranchProjectionView[]>,
): string[] {
  const result: string[] = []
  const queue = [rootBranchId]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const branchId = queue.shift()
    if (branchId === undefined || visited.has(branchId)) continue
    visited.add(branchId)
    result.push(branchId)
    for (const child of children.get(branchId) ?? []) queue.push(child.record.branchId)
  }
  return result
}

/**
 * Collapse is branch-scoped: one badge replaces the branch session and every
 * nested branch beneath it. Redundant collapsed descendants do not add badges.
 */
export function deriveCollapseState(
  projection: ConversationTreeProjection,
  collapsedBranchIds: ReadonlySet<string>,
): CollapseState {
  const branches = branchMap(projection)
  const children = childBranchMap(projection)
  const ordered = projection.branches
    .filter(branch => collapsedBranchIds.has(branch.record.branchId))
    .sort((left, right) => branchDepth(left, branches) - branchDepth(right, branches)
      || compareBranches(left, right))
  const hiddenNodeIds = new Set<string>()
  const hiddenBranchIds = new Set<string>()
  const summaries: CollapsedBranchSummary[] = []

  for (const branch of ordered) {
    let parentId = branch.record.parentBranchId
    let hiddenByAncestor = false
    const visited = new Set<string>()
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId)
      if (collapsedBranchIds.has(parentId)) {
        hiddenByAncestor = true
        break
      }
      parentId = branches.get(parentId)?.record.parentBranchId ?? null
    }
    if (hiddenByAncestor) continue

    const subtreeIds = subtreeBranchIds(branch.record.branchId, children)
    let hiddenNodeCount = 0
    for (const branchId of subtreeIds) {
      hiddenBranchIds.add(branchId)
      const descendant = branches.get(branchId)
      if (descendant === undefined) continue
      hiddenNodeCount += descendant.nodeIds.length
      for (const nodeId of descendant.nodeIds) hiddenNodeIds.add(nodeId)
    }
    summaries.push({
      branchId: branch.record.branchId,
      ...(branch.anchorNodeId === undefined ? {} : { anchorNodeId: branch.anchorNodeId }),
      hiddenNodeCount,
    })
  }

  return {
    hiddenNodeIds,
    hiddenBranchIds,
    summaries: Object.freeze(summaries),
  }
}

/** Return outermost-to-innermost branch IDs that reveal a node. */
export function branchesToExpandForNode(
  projection: ConversationTreeProjection,
  nodeId: string,
): readonly string[] {
  const node = projection.nodes.find(candidate => candidate.nodeId === nodeId)
  if (node?.branchId === null || node === undefined) return Object.freeze([])
  const branches = branchMap(projection)
  const result: string[] = []
  const visited = new Set<string>()
  let branchId: string | null = node.branchId
  while (branchId !== null && !visited.has(branchId)) {
    visited.add(branchId)
    result.unshift(branchId)
    branchId = branches.get(branchId)?.record.parentBranchId ?? null
  }
  return Object.freeze(result)
}

/**
 * Focus follows graph direction from the selected card. It keeps the exact
 * ancestor path and all descendants, while sibling branches are dimmed.
 */
export function deriveFocusState(
  projection: ConversationTreeProjection,
  focusedNodeId: string | undefined,
): FocusState {
  const allNodeIds = new Set(projection.nodes.map(node => node.nodeId))
  const allEdgeIds = new Set(projection.edges.map(edge => edge.edgeId))
  if (focusedNodeId === undefined || !allNodeIds.has(focusedNodeId)) {
    return {
      active: false,
      highlightedNodeIds: allNodeIds,
      dimmedNodeIds: new Set(),
      highlightedEdgeIds: allEdgeIds,
      dimmedEdgeIds: new Set(),
      highlightedBranchIds: new Set(projection.branches.map(branch => branch.record.branchId)),
    }
  }

  const incoming = new Map<string, typeof projection.edges[number][]>()
  const outgoing = new Map<string, typeof projection.edges[number][]>()
  for (const edge of projection.edges) {
    const targetEdges = incoming.get(edge.targetNodeId) ?? []
    targetEdges.push(edge)
    incoming.set(edge.targetNodeId, targetEdges)
    const sourceEdges = outgoing.get(edge.sourceNodeId) ?? []
    sourceEdges.push(edge)
    outgoing.set(edge.sourceNodeId, sourceEdges)
  }

  const highlightedNodeIds = new Set([focusedNodeId])
  const highlightedEdgeIds = new Set<string>()
  const visit = (
    initialNodeId: string,
    edgeMap: ReadonlyMap<string, readonly typeof projection.edges[number][]>,
    adjacentNode: (edge: typeof projection.edges[number]) => string,
  ): void => {
    const queue = [initialNodeId]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const nodeId = queue.shift()
      if (nodeId === undefined || visited.has(nodeId)) continue
      visited.add(nodeId)
      for (const edge of edgeMap.get(nodeId) ?? []) {
        highlightedEdgeIds.add(edge.edgeId)
        const nextNodeId = adjacentNode(edge)
        highlightedNodeIds.add(nextNodeId)
        queue.push(nextNodeId)
      }
    }
  }
  visit(focusedNodeId, incoming, edge => edge.sourceNodeId)
  visit(focusedNodeId, outgoing, edge => edge.targetNodeId)

  const dimmedNodeIds = new Set(
    projection.nodes
      .map(node => node.nodeId)
      .filter(nodeId => !highlightedNodeIds.has(nodeId)),
  )
  const dimmedEdgeIds = new Set(
    projection.edges
      .map(edge => edge.edgeId)
      .filter(edgeId => !highlightedEdgeIds.has(edgeId)),
  )
  const highlightedBranchIds = new Set(
    projection.nodes
      .filter(node => highlightedNodeIds.has(node.nodeId) && node.branchId !== null)
      .map(node => node.branchId as string),
  )
  return {
    active: true,
    highlightedNodeIds,
    dimmedNodeIds,
    highlightedEdgeIds,
    dimmedEdgeIds,
    highlightedBranchIds,
  }
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

function matchScore(node: MessageNodeView, query: string): number | undefined {
  const label = normalized(displayLabelOf(node))
  const text = normalized(node.text)
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  if (text.startsWith(query)) return 2
  const index = text.indexOf(query)
  if (index < 0) return undefined
  if (index === 0 || /[\s\p{P}\p{S}]/u.test(text[index - 1] ?? '')) return 3
  return 4
}

export function searchTreeNodes(
  projection: ConversationTreeProjection,
  input: string,
  limit = 50,
): readonly TreeSearchResult[] {
  const query = normalized(input.trim())
  if (query.length === 0 || limit <= 0) return Object.freeze([])

  return Object.freeze(
    projection.nodes
      .map(node => ({ node, score: matchScore(node, query) }))
      .filter((entry): entry is { node: MessageNodeView; score: number } => entry.score !== undefined)
      .sort((left, right) => left.score - right.score
        || left.node.time - right.node.time
        || left.node.nodeId.localeCompare(right.node.nodeId))
      .slice(0, limit)
      .map(({ node }) => ({
        nodeId: node.nodeId,
        label: displayLabelOf(node),
        role: node.role,
        summary: node.summary,
        time: node.time,
        branchPath: node.branchPath,
        branchesToExpand: branchesToExpandForNode(projection, node.nodeId),
      })),
  )
}
