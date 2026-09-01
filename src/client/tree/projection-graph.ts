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
}

/**
 * Build the dependency-free lookup shell used by navigation and Context
 * Preview derivation. Relationship indexes are layered on in dedicated steps.
 */
export function buildProjectionGraphIndex(
  projection: ConversationTreeProjection,
): ProjectionGraphIndex {
  return Object.freeze({
    projection,
    nodesById: new Map(projection.nodes.map(node => [node.nodeId, node] as const)),
    edgesById: new Map(projection.edges.map(edge => [edge.edgeId, edge] as const)),
    branchesById: new Map(
      projection.branches.map(branch => [branch.record.branchId, branch] as const),
    ),
  })
}
