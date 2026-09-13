import type {
  BranchProjectionView,
  ConversationTreeProjection,
} from '../../shared/projection.ts'
import type { MessageNodeView } from '../../shared/types.ts'
import {
  getProjectionGraphIndex,
  type ProjectionGraphIndex,
} from './projection-graph.ts'

/**
 * Why a message is visible in the conversation tree but excluded from the
 * request prefix represented by a Context Preview.
 */
export type ContextExclusionReason =
  | 'root-session-tail'
  | 'current-branch-tail'
  | 'sibling-branch'
  | 'descendant-branch'

const exclusionReasonOrder: readonly ContextExclusionReason[] = Object.freeze([
  'root-session-tail',
  'current-branch-tail',
  'sibling-branch',
  'descendant-branch',
])

/** One display group of messages excluded for the same semantic reason. */
export interface ContextExclusionGroup {
  readonly reason: ContextExclusionReason
  /** Stable MessageNodeView IDs in deterministic display order. */
  readonly nodeIds: readonly string[]
}

/** Why a visible message cannot identify a safe DSH branch boundary. */
export type ContextBoundaryIneligibilityReason =
  | 'user-message'
  | 'turn-open'
  | 'turn-tail-unavailable'

/** The safe completed-turn boundary represented by a selected message. */
export type ContextBoundaryEligibility =
  | {
    readonly eligible: true
    /** The projected assistant node at the actual completed-turn boundary. */
    readonly boundaryNodeId: string
    readonly snappedToTurnTail: boolean
  }
  | {
    readonly eligible: false
    readonly reason: ContextBoundaryIneligibilityReason
  }

/** Stable message totals used by compact Context Preview surfaces. */
export interface ContextPreviewSummary {
  readonly inheritedMessageCount: number
  readonly excludedMessageCount: number
}

/**
 * The exact model context represented by one eligible message boundary.
 *
 * The inherited path is ordered from the root message to the effective branch
 * boundary. That is `targetNodeId` for a turn-tail assistant, or the finalized
 * assistant tail when an earlier assistant message in the same turn is
 * selected. Ineligible nodes retain their visible prefix so callers can
 * explain why the preview action is unavailable.
 * Excluded messages never appear in the inherited path or in another
 * exclusion group. Aggregate counts are layered on by a dedicated derivation
 * step.
 */
export interface ContextPreview {
  readonly targetNodeId: string
  readonly boundary: ContextBoundaryEligibility
  readonly summary: ContextPreviewSummary
  readonly inheritedNodeIds: readonly string[]
  readonly inheritedEdgeIds: readonly string[]
  readonly excludedGroups: readonly ContextExclusionGroup[]
}

function isSettled(node: MessageNodeView): boolean {
  return node.state === 'complete' || node.state === 'error'
}

function deriveBoundaryEligibility(
  graph: ProjectionGraphIndex,
  selected: MessageNodeView,
): ContextBoundaryEligibility {
  if (selected.role === 'user') {
    return Object.freeze({ eligible: false, reason: 'user-message' as const })
  }
  if (!isSettled(selected)) {
    return Object.freeze({ eligible: false, reason: 'turn-open' as const })
  }

  const targetMessageId = selected.branchTargetMessageId
  const targetSeq = selected.branchTargetSeq
  if (targetMessageId === undefined || targetSeq === undefined) {
    return Object.freeze({ eligible: false, reason: 'turn-tail-unavailable' as const })
  }
  const boundary = graph.nodesBySessionId.get(selected.sessionId)?.find(node => (
    node.messageId === targetMessageId && node.seq === targetSeq
  ))
  if (
    boundary === undefined
    || boundary.role !== 'assistant'
    || boundary.seq < selected.seq
    || (selected.turnId !== undefined && boundary.turnId !== selected.turnId)
  ) {
    return Object.freeze({ eligible: false, reason: 'turn-tail-unavailable' as const })
  }
  if (!isSettled(boundary)) {
    return Object.freeze({ eligible: false, reason: 'turn-open' as const })
  }
  return Object.freeze({
    eligible: true,
    boundaryNodeId: boundary.nodeId,
    snappedToTurnTail: boundary.nodeId !== selected.nodeId,
  })
}

function sessionPrefixThrough(
  graph: ProjectionGraphIndex,
  node: MessageNodeView,
): readonly MessageNodeView[] | undefined {
  const sessionNodes = graph.nodesBySessionId.get(node.sessionId)
  const sequenceIndex = graph.sessionSequenceIndexByNodeId.get(node.nodeId)
  if (sessionNodes === undefined || sequenceIndex === undefined) return undefined
  return sessionNodes.slice(0, sequenceIndex + 1)
}

function inheritedEdges(
  graph: ProjectionGraphIndex,
  nodes: readonly MessageNodeView[],
): readonly string[] {
  const edgeIds: string[] = []
  for (let index = 1; index < nodes.length; index += 1) {
    const source = nodes[index - 1]
    const target = nodes[index]
    if (source === undefined || target === undefined) continue
    const expectedKind = source.sessionId === target.sessionId ? 'sequence' : 'branch'
    const edge = graph.outgoingEdgesByNodeId.get(source.nodeId)?.find(candidate => (
      candidate.targetNodeId === target.nodeId && candidate.kind === expectedKind
    ))
    if (edge !== undefined) edgeIds.push(edge.edgeId)
  }
  return Object.freeze(edgeIds)
}

function rootSessionTailGroup(
  graph: ProjectionGraphIndex,
  inheritedRootSegment: readonly MessageNodeView[],
): ContextExclusionGroup | undefined {
  const rootNodes = graph.nodesBySessionId.get(graph.projection.tree.rootSessionId) ?? []
  const nodeIds = rootNodes
    .slice(inheritedRootSegment.length)
    .map(node => node.nodeId)
  if (nodeIds.length === 0) return undefined
  return Object.freeze({
    reason: 'root-session-tail' as const,
    nodeIds: Object.freeze(nodeIds),
  })
}

function branchSessionTailGroup(
  graph: ProjectionGraphIndex,
  inheritedBranchSegments: readonly (readonly MessageNodeView[])[],
): ContextExclusionGroup | undefined {
  const nodeIds = inheritedBranchSegments.flatMap((segment) => {
    const sessionId = segment[0]?.sessionId
    if (sessionId === undefined) return []
    return (graph.nodesBySessionId.get(sessionId) ?? [])
      .slice(segment.length)
      .map(node => node.nodeId)
  })
  if (nodeIds.length === 0) return undefined
  return Object.freeze({
    reason: 'current-branch-tail' as const,
    nodeIds: Object.freeze(nodeIds),
  })
}

function siblingBranchGroup(
  graph: ProjectionGraphIndex,
  inheritedBranches: readonly BranchProjectionView[],
): ContextExclusionGroup | undefined {
  const inheritedBranchIds = new Set(
    inheritedBranches.map(branch => branch.record.branchId),
  )
  const siblingBranchIds = new Set<string>()
  const nodeIds = inheritedBranches.flatMap((branch) => (
    graph.childBranchesByParentBranchId
      .get(branch.record.parentBranchId)
      ?.flatMap((candidate) => {
        const candidateBranchId = candidate.record.branchId
        if (
          inheritedBranchIds.has(candidateBranchId)
          || siblingBranchIds.has(candidateBranchId)
        ) return []
        siblingBranchIds.add(candidateBranchId)
        return (graph.nodesBySessionId.get(candidate.record.sessionId) ?? [])
          .map(node => node.nodeId)
      }) ?? []
  ))
  if (nodeIds.length === 0) return undefined
  return Object.freeze({
    reason: 'sibling-branch' as const,
    nodeIds: Object.freeze(nodeIds),
  })
}

function descendantBranchGroup(
  graph: ProjectionGraphIndex,
): ContextExclusionGroup | undefined {
  const nodeIds = graph.projection.nodes
    .filter(node => node.branchId !== null)
    .map(node => node.nodeId)
  if (nodeIds.length === 0) return undefined
  return Object.freeze({
    reason: 'descendant-branch' as const,
    nodeIds: Object.freeze(nodeIds),
  })
}

function compareBranchPaths(left: readonly number[], right: readonly number[]): number {
  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

function compareExcludedNodes(left: MessageNodeView, right: MessageNodeView): number {
  return compareBranchPaths(left.branchPath, right.branchPath)
    || left.seq - right.seq
    || left.sessionId.localeCompare(right.sessionId)
    || left.nodeId.localeCompare(right.nodeId)
}

function stabilizeExclusionGroups(
  graph: ProjectionGraphIndex,
  inheritedNodes: readonly MessageNodeView[],
  candidateGroups: readonly (ContextExclusionGroup | undefined)[],
): readonly ContextExclusionGroup[] {
  const candidatesByReason = new Map<ContextExclusionReason, string[]>()
  for (const group of candidateGroups) {
    if (group === undefined) continue
    const nodeIds = candidatesByReason.get(group.reason) ?? []
    nodeIds.push(...group.nodeIds)
    candidatesByReason.set(group.reason, nodeIds)
  }

  const claimedNodeIds = new Set(inheritedNodes.map(node => node.nodeId))
  const groups: ContextExclusionGroup[] = []
  for (const reason of exclusionReasonOrder) {
    const candidates = new Map<string, MessageNodeView>()
    for (const nodeId of candidatesByReason.get(reason) ?? []) {
      if (claimedNodeIds.has(nodeId)) continue
      const node = graph.nodesById.get(nodeId)
      if (node !== undefined) candidates.set(nodeId, node)
    }
    const nodeIds = [...candidates.values()]
      .sort(compareExcludedNodes)
      .map(node => node.nodeId)
    if (nodeIds.length === 0) continue
    for (const nodeId of nodeIds) claimedNodeIds.add(nodeId)
    groups.push(Object.freeze({ reason, nodeIds: Object.freeze(nodeIds) }))
  }
  return Object.freeze(groups)
}

/**
 * Derive the exact ancestor-only request prefix represented by a tree node.
 *
 * Each branch contributes only its session-local prefix through the selected
 * node (or through the child branch's anchor). Parent-session tails, sibling
 * branches, and descendant branches are therefore never pulled into the
 * inherited path. Boundary eligibility and aggregate message totals describe
 * the same immutable projection result for downstream UI surfaces.
 */
export function deriveContextPreview(
  projection: ConversationTreeProjection,
  targetNodeId: string,
): ContextPreview | undefined {
  const graph = getProjectionGraphIndex(projection)
  const selected = graph.nodesById.get(targetNodeId)
  if (selected === undefined) return undefined
  const boundary = deriveBoundaryEligibility(graph, selected)
  let cursor = boundary.eligible
    ? graph.nodesById.get(boundary.boundaryNodeId)
    : selected
  if (cursor === undefined) return undefined

  const segments: (readonly MessageNodeView[])[] = []
  const inheritedBranches: BranchProjectionView[] = []
  const visitedBranchIds = new Set<string>()
  while (true) {
    const segment = sessionPrefixThrough(graph, cursor)
    if (segment === undefined) return undefined
    segments.unshift(segment)

    if (cursor.branchId === null) {
      if (cursor.sessionId !== projection.tree.rootSessionId) return undefined
      break
    }

    if (visitedBranchIds.has(cursor.branchId)) return undefined
    visitedBranchIds.add(cursor.branchId)

    const branch = graph.branchesById.get(cursor.branchId)
    const anchor = graph.anchorNodesByBranchId.get(cursor.branchId)
    if (
      branch === undefined
      || branch.record.sessionId !== cursor.sessionId
      || anchor === undefined
      || anchor.sessionId !== branch.record.parentSessionId
    ) return undefined
    inheritedBranches.unshift(branch)
    cursor = anchor
  }

  const inheritedNodes = segments.flat()
  const rootTail = rootSessionTailGroup(graph, segments[0] ?? [])
  const branchTail = branchSessionTailGroup(graph, segments.slice(1))
  const siblingBranches = siblingBranchGroup(graph, inheritedBranches)
  const descendantBranches = descendantBranchGroup(graph)
  const excludedGroups = stabilizeExclusionGroups(graph, inheritedNodes, [
    rootTail,
    branchTail,
    siblingBranches,
    descendantBranches,
  ])
  return Object.freeze({
    targetNodeId,
    boundary,
    summary: Object.freeze({
      inheritedMessageCount: inheritedNodes.length,
      excludedMessageCount: excludedGroups.reduce(
        (count, group) => count + group.nodeIds.length,
        0,
      ),
    }),
    inheritedNodeIds: Object.freeze(inheritedNodes.map(node => node.nodeId)),
    inheritedEdgeIds: inheritedEdges(graph, inheritedNodes),
    excludedGroups,
  })
}
