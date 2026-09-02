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
  readonly incomingEdgesByNodeId: ReadonlyMap<string, readonly TreeEdgeView[]>
  readonly outgoingEdgesByNodeId: ReadonlyMap<string, readonly TreeEdgeView[]>
}

function indexEdgesByEndpoint(
  nodeIds: Iterable<string>,
  edges: readonly TreeEdgeView[],
  endpointOf: (edge: TreeEdgeView) => string,
): ReadonlyMap<string, readonly TreeEdgeView[]> {
  const grouped = new Map<string, TreeEdgeView[]>()
  for (const nodeId of nodeIds) grouped.set(nodeId, [])
  for (const edge of edges) {
    const endpoint = endpointOf(edge)
    const group = grouped.get(endpoint)
    if (group === undefined) grouped.set(endpoint, [edge])
    else group.push(edge)
  }
  return new Map(
    [...grouped].map(([nodeId, group]) => [nodeId, Object.freeze(group)] as const),
  )
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
  return Object.freeze({
    projection,
    nodesById,
    edgesById: new Map(projection.edges.map(edge => [edge.edgeId, edge] as const)),
    branchesById: new Map(
      projection.branches.map(branch => [branch.record.branchId, branch] as const),
    ),
    incomingEdgesByNodeId: indexEdgesByEndpoint(
      nodesById.keys(),
      projection.edges,
      edge => edge.targetNodeId,
    ),
    outgoingEdgesByNodeId: indexEdgesByEndpoint(
      nodesById.keys(),
      projection.edges,
      edge => edge.sourceNodeId,
    ),
  })
}
