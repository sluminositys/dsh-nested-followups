import type { Context } from '@deepseek-ai/cordis'

import { NestedFollowupsBranchService } from './host/branch-service.ts'
import { NestedFollowupsMetadataService } from './host/metadata-service.ts'
import { NestedFollowupsService } from './host/tree-service.ts'

export const name = 'dsh-nested-followups'
export const inject = ['storageDomain']

export function apply(ctx: Context): void {
  ctx.plugin(NestedFollowupsMetadataService)
  ctx.plugin(NestedFollowupsBranchService)
  ctx.plugin(NestedFollowupsService)
}

export { NestedFollowupsBranchService } from './host/branch-service.ts'
export { NestedFollowupsMetadataService } from './host/metadata-service.ts'
export { NestedFollowupsService } from './host/tree-service.ts'
export {
  BranchDeletionError,
  CascadeDeleteCoordinator,
  planCascadeDeletion,
} from './host/delete-service.ts'
export { projectConversationTree, displayLabelOf } from './host/projection.ts'
export {
  BranchBoundaryError,
  resolveBranchBoundary,
} from './host/safe-boundary.ts'
export {
  applyChatOnlyScopeRc7,
  ChatOnlyCapabilityError,
  createChatOnlyForkAgentRc7,
  probeChatOnlyCapabilityRc7,
  resumeChatOnlyBranchAgentRc7,
  submitChatOnlyTurnRc7,
} from './host/adapter/chat-only.ts'
export {
  CHAT_ONLY_CONTINUATION_METHOD,
  probeNativeContinuationCapability,
} from './host/adapter/native-continuation.ts'
export {
  createSubagentForkRc7,
  selectForkSeedRc7,
} from './host/adapter/session-fork.ts'
export {
  HIDDEN_BRANCH_ORIGIN,
  hiddenBranchMetaRc7,
  probeBranchVisibilityRc7,
} from './host/adapter/visibility.ts'
export {
  SESSION_DELETE_METHOD,
  probeSessionDeletionCapability,
} from './host/adapter/session-delete.ts'
export { TreeMetadataRepository } from './host/storage.ts'
export { nestedFollowupsDomainSpec } from './shared/schema.ts'
export type * from './shared/remote.ts'
export type * from './shared/types.ts'
