/**
 * Why a message is visible in the conversation tree but excluded from the
 * request prefix represented by a Context Preview.
 */
export type ContextExclusionReason =
  | 'root-session-tail'
  | 'current-branch-tail'
  | 'sibling-branch'
  | 'descendant-branch'

/** One display group of messages excluded for the same semantic reason. */
export interface ContextExclusionGroup {
  readonly reason: ContextExclusionReason
  /** Stable MessageNodeView IDs in deterministic display order. */
  readonly nodeIds: readonly string[]
}

/**
 * The exact model context represented by one eligible message boundary.
 *
 * The inherited path is ordered from the root message to `targetNodeId`.
 * Excluded messages never appear in the inherited path or in another
 * exclusion group. Eligibility and aggregate counts are layered on by their
 * dedicated derivation steps.
 */
export interface ContextPreview {
  readonly targetNodeId: string
  readonly inheritedNodeIds: readonly string[]
  readonly inheritedEdgeIds: readonly string[]
  readonly excludedGroups: readonly ContextExclusionGroup[]
}
