import { displayLabelOf } from '../../shared/labels.ts'
import type { BranchProjectionView, ConversationTreeProjection } from '../../shared/projection.ts'
import type { MessageNodeView } from '../../shared/types.ts'

export type FoldActivityState = 'running' | 'error' | 'complete'

export interface AnchorGroupSummary {
  readonly anchorDotId: string
  readonly anchorNodeId: string
  readonly branchIds: readonly string[]
  readonly branchCount: number
  readonly messageCount: number
  readonly depth: number
  readonly open: boolean
  readonly activity: FoldActivityState
}

export interface CollapsedBranchSummary {
  readonly branchId: string
  readonly anchorDotId: string
  readonly anchorNodeId: string
  readonly pathLabel: string
  readonly firstQuestionSummary: string
  readonly childBranchCount: number
  readonly branchCount: number
  readonly messageCount: number
  /** Compatibility name retained until every old +N badge consumer is migrated. */
  readonly hiddenNodeCount: number
  readonly depth: number
  readonly activity: FoldActivityState
}

export interface CollapseState {
  readonly hiddenNodeIds: ReadonlySet<string>
  readonly hiddenBranchIds: ReadonlySet<string>
  readonly visibleBranchIds: ReadonlySet<string>
  readonly anchorGroups: readonly AnchorGroupSummary[]
  readonly summaries: readonly CollapsedBranchSummary[]
}

export interface FoldExpansionTargets {
  readonly branchIds: readonly string[]
  readonly anchorDotIds: readonly string[]
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
  anchorDotsToExpand: readonly string[]
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
  for (const siblings of children.values()) siblings.sort(compareBranches)
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

function uniqueSubtreeBranchIds(
  rootBranches: readonly BranchProjectionView[],
  children: ReadonlyMap<string, readonly BranchProjectionView[]>,
): string[] {
  const ids = new Set<string>()
  for (const branch of rootBranches) {
    for (const branchId of subtreeBranchIds(branch.record.branchId, children)) ids.add(branchId)
  }
  return [...ids]
}

function activityForBranches(
  ids: readonly string[],
  branches: ReadonlyMap<string, BranchProjectionView>,
  nodes: ReadonlyMap<string, MessageNodeView>,
): FoldActivityState {
  let running = false
  for (const branchId of ids) {
    const branch = branches.get(branchId)
    if (branch === undefined) continue
    if (branch.record.status === 'failed' || branch.record.status === 'missing') return 'error'
    if (branch.record.status === 'creating' || branch.record.status === 'running') running = true
    for (const nodeId of branch.nodeIds) {
      const state = nodes.get(nodeId)?.state
      if (state === 'error') return 'error'
      if (state === 'queued' || state === 'streaming') running = true
    }
  }
  return running ? 'running' : 'complete'
}

function truncateSummary(value: string, maximum = 18): string {
  const compact = value.trim().replace(/\s+/gu, ' ')
  const characters = [...compact]
  return characters.length <= maximum ? compact : `${characters.slice(0, maximum).join('')}…`
}

function branchSummary(
  branch: BranchProjectionView,
  depth: number,
  branches: ReadonlyMap<string, BranchProjectionView>,
  children: ReadonlyMap<string, readonly BranchProjectionView[]>,
  nodes: ReadonlyMap<string, MessageNodeView>,
): CollapsedBranchSummary | undefined {
  if (branch.anchorNodeId === undefined) return undefined
  const subtreeIds = subtreeBranchIds(branch.record.branchId, children)
  const subtreeNodes = subtreeIds.flatMap(branchId => branches.get(branchId)?.nodeIds ?? [])
  const firstQuestion = branch.nodeIds
    .map(nodeId => nodes.get(nodeId))
    .find(node => node?.role === 'user')
  return {
    branchId: branch.record.branchId,
    anchorDotId: branch.record.anchorMessageId,
    anchorNodeId: branch.anchorNodeId,
    pathLabel: branch.branchPath.join('.'),
    firstQuestionSummary: truncateSummary(firstQuestion?.summary ?? firstQuestion?.text ?? ''),
    childBranchCount: children.get(branch.record.branchId)?.length ?? 0,
    branchCount: subtreeIds.length,
    messageCount: subtreeNodes.length,
    hiddenNodeCount: subtreeNodes.length,
    depth,
    activity: activityForBranches(subtreeIds, branches, nodes),
  }
}

/** Immediate nested anchor groups that become dots when one capsule is expanded. */
export function childAnchorDotIdsForBranch(
  projection: ConversationTreeProjection,
  branchId: string,
): readonly string[] {
  const result = new Set<string>()
  for (const branch of projection.branches) {
    if (branch.record.parentBranchId === branchId) result.add(branch.record.anchorMessageId)
  }
  return Object.freeze([...result])
}

/** Every fold record under a branch, used by Alt+click deep expansion. */
export function deepExpansionTargetsForBranch(
  projection: ConversationTreeProjection,
  branchId: string,
): FoldExpansionTargets {
  const children = childBranchMap(projection)
  const branches = branchMap(projection)
  const branchIds = subtreeBranchIds(branchId, children)
  const anchorDotIds = new Set<string>()
  for (const descendantId of branchIds) {
    const descendant = branches.get(descendantId)
    if (descendant !== undefined && descendantId !== branchId) {
      anchorDotIds.add(descendant.record.anchorMessageId)
    }
  }
  return {
    branchIds: Object.freeze(branchIds),
    anchorDotIds: Object.freeze([...anchorDotIds]),
  }
}

/** Every fold record under an anchor group, used by Alt+click on ⊕. */
export function deepExpansionTargetsForAnchor(
  projection: ConversationTreeProjection,
  anchorDotId: string,
): FoldExpansionTargets {
  const children = childBranchMap(projection)
  const branches = branchMap(projection)
  const roots = projection.branches
    .filter(branch => branch.record.anchorMessageId === anchorDotId)
    .sort(compareBranches)
  const branchIds = uniqueSubtreeBranchIds(roots, children)
  const anchorDotIds = new Set([anchorDotId])
  for (const branchId of branchIds) {
    const branch = branches.get(branchId)
    if (branch !== undefined) anchorDotIds.add(branch.record.anchorMessageId)
  }
  return {
    branchIds: Object.freeze(branchIds),
    anchorDotIds: Object.freeze([...anchorDotIds]),
  }
}

/** Anchor groups directly attached to the root session; toolbar Collapse all targets these. */
export function topLevelAnchorDotIds(
  projection: ConversationTreeProjection,
): readonly string[] {
  return Object.freeze([...new Set(
    projection.branches
      .filter(branch => branch.record.parentBranchId === null)
      .sort(compareBranches)
      .map(branch => branch.record.anchorMessageId),
  )])
}

/**
 * Three-level fold projection. A closed anchor group hides every immediate
 * branch behind one dot; an open group exposes a capsule per collapsed branch;
 * expanded branches expose message cards and recursively reveal nested groups.
 */
export function deriveCollapseState(
  projection: ConversationTreeProjection,
  collapsedBranchIds: ReadonlySet<string>,
  anchorDotIds: ReadonlySet<string> = new Set<string>(),
): CollapseState {
  const branches = branchMap(projection)
  const children = childBranchMap(projection)
  const nodes = new Map(projection.nodes.map(node => [node.nodeId, node] as const))
  const groupsByAnchorNodeId = new Map<string, BranchProjectionView[]>()
  for (const branch of projection.branches) {
    if (branch.anchorNodeId === undefined) continue
    const group = groupsByAnchorNodeId.get(branch.anchorNodeId) ?? []
    group.push(branch)
    groupsByAnchorNodeId.set(branch.anchorNodeId, group)
  }
  for (const group of groupsByAnchorNodeId.values()) group.sort(compareBranches)

  const visibleNodeIds = new Set(
    projection.nodes.filter(node => node.branchId === null).map(node => node.nodeId),
  )
  const visibleBranchIds = new Set<string>()
  const hiddenNodeIds = new Set<string>()
  const hiddenBranchIds = new Set<string>()
  const anchorGroups: AnchorGroupSummary[] = []
  const summaries: CollapsedBranchSummary[] = []
  const visitedAnchors = new Set<string>()

  const hideSubtree = (root: BranchProjectionView): void => {
    for (const branchId of subtreeBranchIds(root.record.branchId, children)) {
      hiddenBranchIds.add(branchId)
      for (const nodeId of branches.get(branchId)?.nodeIds ?? []) hiddenNodeIds.add(nodeId)
    }
  }

  const visitAnchor = (anchorNodeId: string): void => {
    if (visitedAnchors.has(anchorNodeId) || !visibleNodeIds.has(anchorNodeId)) return
    const group = groupsByAnchorNodeId.get(anchorNodeId)
    if (group === undefined || group.length === 0) return
    visitedAnchors.add(anchorNodeId)
    const anchorDotId = group[0]!.record.anchorMessageId
    const open = !anchorDotIds.has(anchorDotId)
    const subtreeIds = uniqueSubtreeBranchIds(group, children)
    anchorGroups.push({
      anchorDotId,
      anchorNodeId,
      branchIds: Object.freeze(group.map(branch => branch.record.branchId)),
      branchCount: group.length,
      messageCount: subtreeIds.reduce(
        (count, branchId) => count + (branches.get(branchId)?.nodeIds.length ?? 0),
        0,
      ),
      depth: Math.min(...group.map(branch => branchDepth(branch, branches))),
      open,
      activity: activityForBranches(subtreeIds, branches, nodes),
    })

    for (const branch of group) {
      if (!open) {
        hideSubtree(branch)
        continue
      }
      if (collapsedBranchIds.has(branch.record.branchId)) {
        hideSubtree(branch)
        const summary = branchSummary(
          branch,
          branchDepth(branch, branches),
          branches,
          children,
          nodes,
        )
        if (summary !== undefined) summaries.push(summary)
        continue
      }
      visibleBranchIds.add(branch.record.branchId)
      const branchNodes = branch.nodeIds
        .map(nodeId => nodes.get(nodeId))
        .filter((node): node is MessageNodeView => node !== undefined)
        .sort((left, right) => left.seq - right.seq || left.nodeId.localeCompare(right.nodeId))
      for (const node of branchNodes) visibleNodeIds.add(node.nodeId)
      for (const node of branchNodes) visitAnchor(node.nodeId)
    }
  }

  const rootNodes = projection.nodes
    .filter(node => node.branchId === null)
    .sort((left, right) => left.seq - right.seq || left.nodeId.localeCompare(right.nodeId))
  for (const node of rootNodes) visitAnchor(node.nodeId)

  for (const branch of projection.branches) {
    if (visibleBranchIds.has(branch.record.branchId) || hiddenBranchIds.has(branch.record.branchId)) continue
    hiddenBranchIds.add(branch.record.branchId)
    for (const nodeId of branch.nodeIds) hiddenNodeIds.add(nodeId)
  }

  return {
    hiddenNodeIds,
    hiddenBranchIds,
    visibleBranchIds,
    anchorGroups: Object.freeze(anchorGroups),
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

/** Return outermost-to-innermost anchor dots that must open to reveal a node. */
export function anchorDotsToExpandForNode(
  projection: ConversationTreeProjection,
  nodeId: string,
): readonly string[] {
  const branches = branchMap(projection)
  return Object.freeze(branchesToExpandForNode(projection, nodeId).flatMap((branchId) => {
    const branch = branches.get(branchId)
    return branch === undefined ? [] : [branch.record.anchorMessageId]
  }))
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
        anchorDotsToExpand: anchorDotsToExpandForNode(projection, node.nodeId),
      })),
  )
}
