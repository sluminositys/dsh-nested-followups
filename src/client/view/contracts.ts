import type { ConversationTreeProjection } from '../../shared/projection.ts'
import type { AnchorRange, MessageNodeView } from '../../shared/types.ts'

export interface AskFollowUpRequest {
  readonly clientRequestId: string
  readonly anchor: MessageNodeView
  readonly question: string
  readonly anchorRange?: AnchorRange
}

export interface ContinueBranchRequest {
  readonly clientRequestId: string
  readonly tail: MessageNodeView
  readonly question: string
}

export interface DeleteBranchRequest {
  readonly branchId: string
  readonly branchCount: number
  readonly messageCount: number
}

export interface ConversationTreeCanvasProps {
  readonly projection: ConversationTreeProjection
  readonly labels?: TreeViewLabels
  readonly readOnlyReason?: string
  readonly onAskFollowUp?: (request: AskFollowUpRequest) => Promise<void>
  readonly onContinueBranch?: (request: ContinueBranchRequest) => Promise<void>
  readonly onDeleteBranch?: (request: DeleteBranchRequest) => Promise<void>
  readonly deletionMode?: 'delete' | 'archive'
}

export interface TreeViewLabels {
  readonly canvas: string
  readonly search: string
  readonly searchPlaceholder: string
  readonly noSearchResults: string
  readonly independentContext: string
  readonly you: string
  readonly assistant: string
  readonly queued: string
  readonly streaming: string
  readonly complete: string
  readonly error: string
  readonly askFollowUp: string
  readonly askWaitForCompletion: string
  readonly askUnavailable: string
  readonly continueBranch: string
  readonly focus: string
  readonly clearFocus: string
  readonly collapse: string
  readonly expand: string
  readonly collapseAll: string
  readonly deleteBranch: string
  readonly details: string
  readonly close: string
  readonly zoomIn: string
  readonly zoomOut: string
  readonly fit: string
  readonly minimap: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly followUpPlaceholder: string
  readonly continuePlaceholder: string
  readonly quoteSelected: string
  readonly quoteInvalid: string
  readonly quoteHint: string
  readonly savedQuotes: string
  readonly saveQuote: string
  readonly removeQuote: string
  readonly quoteNotePlaceholder: string
  readonly snapToTurnTail: (label: string) => string
  readonly send: string
  readonly cancel: string
  readonly deleteTitle: string
  readonly deleteConfirm: string
  readonly deletePending: string
  readonly deleteArchiveNotice: string
  readonly askPending: string
  readonly continuePending: string
  readonly readonly: string
  readonly nodeCount: (count: number) => string
  readonly collapsedCount: (count: number) => string
  readonly expandAnchorGroup: (branches: number, messages: number) => string
  readonly collapseAnchorGroup: (branches: number, messages: number) => string
  readonly expandBranchPath: (path: string) => string
  readonly collapseBranchPath: (path: string) => string
  readonly childBranchCount: (count: number) => string
  readonly deleteDescription: (branches: number, messages: number) => string
}

export const DEFAULT_TREE_VIEW_LABELS: TreeViewLabels = Object.freeze({
  canvas: 'Conversation tree',
  search: 'Search messages',
  searchPlaceholder: 'Search messages or node labels',
  noSearchResults: 'No matching messages',
  independentContext: 'Independent context',
  you: 'You',
  assistant: 'Assistant',
  queued: 'Queued',
  streaming: 'Streaming',
  complete: 'Complete',
  error: 'Failed',
  askFollowUp: 'Ask follow-up',
  askWaitForCompletion: 'Wait for this turn to finish before branching.',
  askUnavailable: 'This turn has no finalized assistant answer to branch from.',
  continueBranch: 'Continue this branch',
  focus: 'Focus',
  clearFocus: 'Clear focus',
  collapse: 'Collapse branch',
  expand: 'Expand branch',
  collapseAll: 'Collapse all',
  deleteBranch: 'Delete branch',
  details: 'Message details',
  close: 'Close',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  minimap: 'Conversation tree minimap',
  emptyTitle: 'No messages yet',
  emptyDescription: 'Messages appear here after the conversation begins.',
  followUpPlaceholder: 'Ask a follow-up about this message…',
  continuePlaceholder: 'Add the next turn to this branch…',
  quoteSelected: 'Quoted source',
  quoteInvalid: 'The quoted source changed; this branch now anchors to the whole message.',
  quoteHint: 'To quote the answer, open the message and select the passage.',
  savedQuotes: 'Saved quotes',
  saveQuote: 'Save quote',
  removeQuote: 'Remove quote',
  quoteNotePlaceholder: 'Add an optional comment, Enter saves the quote',
  snapToTurnTail: (label: string) => `Context will include the completed turn through ${label}.`,
  send: 'Send',
  cancel: 'Cancel',
  deleteTitle: 'Delete branch',
  deleteConfirm: 'Delete',
  deletePending: 'Deleting…',
  deleteArchiveNotice: 'The underlying branch sessions will be archived rather than physically deleted.',
  askPending: 'Sending…',
  continuePending: 'Continuing…',
  readonly: 'Tree View is read-only',
  nodeCount: (count: number) => `${count} messages`,
  collapsedCount: (count: number) => `+${count} nodes`,
  expandAnchorGroup: (branches: number, messages: number) =>
    `Expand ${branches} branches · +${messages} messages`,
  collapseAnchorGroup: (branches: number, messages: number) =>
    `Collapse whole group: ${branches} branches · +${messages} messages`,
  expandBranchPath: (path: string) => `Expand branch ${path}`,
  collapseBranchPath: (path: string) => `Collapse branch ${path}`,
  childBranchCount: (count: number) => `⑂×${count}`,
  deleteDescription: (branches: number, messages: number) =>
    `This removes ${branches} branch${branches === 1 ? '' : 'es'} and ${messages} message${messages === 1 ? '' : 's'}. The root conversation and sibling branches are not changed.`,
})
