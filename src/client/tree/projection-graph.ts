import type {
  BranchProjectionView,
  ConversationTreeProjection,
  TreeEdgeView,
} from '../../shared/projection.ts'
import type { MessageNodeView } from '../../shared/types.ts'

/** Shared identity lookups for algorithms that traverse one tree projection. */
export interface ProjectionGraphIndex {
  readonly projection: ConversationTreeProjection
  readonly nodesById: ReadonlyMap<string, MessageNodeView>
  readonly edgesById: ReadonlyMap<string, TreeEdgeView>
  readonly branchesById: ReadonlyMap<string, BranchProjectionView>
  readonly parentBranchesByBranchId: ReadonlyMap<string, BranchProjectionView>
  readonly childBranchesByParentBranchId: ReadonlyMap<string | null, readonly BranchProjectionView[]>
  readonly anchorNodesByBranchId: ReadonlyMap<string, MessageNodeView>
  readonly branchesByAnchorNodeId: ReadonlyMap<string, readonly BranchProjectionView[]>
  readonly nodesBySessionId: ReadonlyMap<string, readonly MessageNodeView[]>
  readonly sessionSequenceIndexByNodeId: ReadonlyMap<string, number>
  readonly incomingEdgesByNodeId: ReadonlyMap<string, readonly TreeEdgeView[]>
  readonly outgoingEdgesByNodeId: ReadonlyMap<string, readonly TreeEdgeView[]>
}

function indexManyByKey<Key, Value>(
  initialKeys: Iterable<Key>,
  values: readonly Value[],
  keyOf: (value: Value) => Key | undefined,
  compare?: (left: Value, right: Value) => number,
): ReadonlyMap<Key, readonly Value[]> {
  const grouped = new Map<Key, Value[]>()
  for (const key of initialKeys) grouped.set(key, [])
  for (const value of values) {
    const key = keyOf(value)
    if (key === undefined) continue
    const group = grouped.get(key)
    if (group === undefined) grouped.set(key, [value])
    else group.push(value)
  }
  return new Map(
    [...grouped].map(([key, group]) => [
      key,
      Object.freeze(compare === undefined ? group : group.sort(compare)),
    ] as const),
  )
}

function compareSessionNodes(left: MessageNodeView, right: MessageNodeView): number {
  return left.seq - right.seq || left.nodeId.localeCompare(right.nodeId)
}

/**
 * Build the dependency-free lookup shell used by navigation and Context
 * Preview derivation. Branch lineage and session order are layered on in
 * dedicated steps.
 */
export function buildProjectionGraphIndex(
  projection: ConversationTreeProjection,
): ProjectionGraphIndex {
  const nodesById = new Map(projection.nodes.map(node => [node.nodeId, node] as const))
  const branchesById = new Map(
    projection.branches.map(branch => [branch.record.branchId, branch] as const),
  )
  const nodesBySessionId = indexManyByKey(
    [projection.tree.rootSessionId, ...projection.branches.map(branch => branch.record.sessionId)],
    projection.nodes,
    node => node.sessionId,
    compareSessionNodes,
  )
  const sessionSequenceIndexByNodeId = new Map<string, number>()
  for (const sessionNodes of nodesBySessionId.values()) {
    sessionNodes.forEach((node, index) => sessionSequenceIndexByNodeId.set(node.nodeId, index))
  }
  return Object.freeze({
    projection,
    nodesById,
    edgesById: new Map(projection.edges.map(edge => [edge.edgeId, edge] as const)),
    branchesById,
    parentBranchesByBranchId: new Map(projection.branches.flatMap((branch) => {
      const parentId = branch.record.parentBranchId
      const parent = parentId === null ? undefined : branchesById.get(parentId)
      return parent === undefined ? [] : [[branch.record.branchId, parent] as const]
    })),
    childBranchesByParentBranchId: indexManyByKey(
      [null, ...branchesById.keys()],
      projection.branches,
      branch => branch.record.parentBranchId,
    ),
    anchorNodesByBranchId: new Map(projection.branches.flatMap((branch) => {
      const anchor = branch.anchorNodeId === undefined
        ? undefined
        : nodesById.get(branch.anchorNodeId)
      return anchor === undefined ? [] : [[branch.record.branchId, anchor] as const]
    })),
    branchesByAnchorNodeId: indexManyByKey(
      nodesById.keys(),
      projection.branches,
      branch => branch.anchorNodeId,
    ),
    nodesBySessionId,
    sessionSequenceIndexByNodeId,
    incomingEdgesByNodeId: indexManyByKey(
      nodesById.keys(),
      projection.edges,
      edge => edge.targetNodeId,
    ),
    outgoingEdgesByNodeId: indexManyByKey(
      nodesById.keys(),
      projection.edges,
      edge => edge.sourceNodeId,
    ),
  })
}
