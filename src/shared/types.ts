/** One persisted conversation tree owned by a root DSH session. */
export interface TreeRecord {
  treeId: string
  rootSessionId: string
  version: 1
  createdAt: number
  updatedAt: number
}

export type BranchStatus =
  | 'creating'
  | 'running'
  | 'ready'
  | 'failed'
  | 'missing'
  | 'deleted'

/** Optional source-text range within the anchored message. */
export interface AnchorRange {
  /** UTF-16 code-unit offset in the persisted Markdown source. */
  start: number
  /** Exclusive UTF-16 code-unit offset in the persisted Markdown source. */
  end: number
  text: string
}

/** Durable relationship between one logical branch and its DSH session. */
export interface BranchRecord {
  branchId: string
  /** Stable client-generated key used to collapse retries into one branch. */
  clientRequestId: string
  treeId: string
  sessionId: string
  parentSessionId: string
  parentBranchId: string | null
  anchorSessionId: string
  anchorMessageId: string
  /** Event sequence of the selected message in the anchor session. */
  anchorSeq: number
  /** Inclusive event sequence of the validated seed cut used to create the fork. */
  forkBoundarySeq: number
  /** Number of inherited events at the beginning of this branch session. */
  seedLength: number
  anchorRange?: AnchorRange
  siblingOrdinal: number
  createdAt: number
  status: BranchStatus
  deletedAt?: number
}

export type MessageNodeState = 'queued' | 'streaming' | 'complete' | 'error'

/** Read-only message projection used by Tree View. */
export interface MessageNodeView {
  nodeId: string
  treeId: string
  branchId: string | null
  sessionId: string
  messageId: string
  /** Sequence of the source `user/message` or `assistant/message` event. */
  seq: number
  role: 'user' | 'assistant'
  turnId?: string
  branchPath: readonly number[]
  localTurnIndex: number
  time: number
  /** Persisted Markdown text from text blocks. Not stored in plugin metadata. */
  text: string
  summary: string
  state: MessageNodeState
  /** Safe completed-turn assistant tail used when this card starts a branch. */
  branchTargetMessageId?: string
  branchTargetSeq?: number
}

export interface TreeViewState {
  treeId: string
  viewport: { x: number; y: number; zoom: number }
  collapsedBranchIds: string[]
  focusedNodeId?: string
  expandedNodeIds: string[]
}
