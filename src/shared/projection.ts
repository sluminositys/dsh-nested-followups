import type { BranchRecord, MessageNodeView, TreeRecord } from './types.ts'

export type ProjectionDiagnosticCode =
  | 'root-session-missing'
  | 'branch-session-missing'
  | 'branch-parent-missing'
  | 'branch-cycle'
  | 'anchor-missing'
  | 'anchor-range-invalid'
  | 'seed-length-mismatch'

export interface ProjectionDiagnostic {
  code: ProjectionDiagnosticCode
  message: string
  branchId?: string
  sessionId?: string
}

export interface TreeEdgeView {
  edgeId: string
  sourceNodeId: string
  targetNodeId: string
  kind: 'sequence' | 'branch'
}

export interface BranchProjectionView {
  record: BranchRecord
  branchPath: readonly number[]
  nodeIds: readonly string[]
  anchorNodeId?: string
  anchorStatus: 'message' | 'range-valid' | 'range-invalid' | 'missing'
}

export interface ConversationTreeProjection {
  tree: TreeRecord
  nodes: readonly MessageNodeView[]
  edges: readonly TreeEdgeView[]
  branches: readonly BranchProjectionView[]
  diagnostics: readonly ProjectionDiagnostic[]
}
