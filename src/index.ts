import type { Context } from '@deepseek-ai/cordis'

import { NestedFollowupsBranchService } from './host/branch-service.ts'
import { NestedFollowupsDeleteService } from './host/delete-service.ts'
import { NestedFollowupsMetadataService } from './host/metadata-service.ts'
import { NestedFollowupsService } from './host/tree-service.ts'

export const name = 'dsh-nested-followups'
export const inject = ['storageDomain']

export function apply(ctx: Context): void {
  ctx.plugin(NestedFollowupsMetadataService)
  ctx.plugin(NestedFollowupsBranchService)
  ctx.plugin(NestedFollowupsDeleteService)
  ctx.plugin(NestedFollowupsService)
}

export { NestedFollowupsBranchService } from './host/branch-service.ts'
export { NestedFollowupsMetadataService } from './host/metadata-service.ts'
export { NestedFollowupsService } from './host/tree-service.ts'
export {
  BranchDeletionError,
  CascadeDeleteCoordinator,
  NestedFollowupsDeleteService,
  planCascadeDeletion,
} from './host/delete-service.ts'
export { projectConversationTree, displayLabelOf } from './host/projection.ts'
export {
  BranchBoundaryError,
  resolveBranchBoundary,
} from './host/safe-boundary.ts'
export {
  applyReadOnlyScopeRc7,
  createReadOnlyBranchSetup,
  createReadOnlyForkAgentRc7,
  probeReadOnlyCapabilityRc7,
  readOnlyBranchGuard,
  ReadOnlyCapabilityError,
  resolveBranchAgentOptionsRc7,
  resolveSourcePresetRc7,
  resumeReadOnlyBranchAgentRc7,
  submitBranchTurnRc7,
} from './host/adapter/read-only.ts'
export {
  isBranchExecutableTool,
  READ_ONLY_TOOL_NAMES,
  TRANSPORT_TOOL_NAMES,
} from './shared/tool-policy.ts'
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
  createSessionCleanupAdapter,
  SESSION_ARCHIVE_METHOD,
  SESSION_DELETE_METHOD,
  probeSessionDeletionCapability,
} from './host/adapter/session-delete.ts'
export { TreeMetadataRepository } from './host/storage.ts'
export { nestedFollowupsDomainSpec } from './host/domain.ts'
export type * from './shared/remote.ts'
export type * from './shared/types.ts'
