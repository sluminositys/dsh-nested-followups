import type { Context } from '@deepseek-ai/cordis'

import { NestedFollowupsMetadataService } from './host/metadata-service.ts'

export const name = 'dsh-nested-followups'
export const inject = ['storageDomain']

export function apply(ctx: Context): void {
  ctx.plugin(NestedFollowupsMetadataService)
}

export { NestedFollowupsMetadataService } from './host/metadata-service.ts'
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
export { TreeMetadataRepository } from './host/storage.ts'
export { nestedFollowupsDomainSpec } from './shared/schema.ts'
export type * from './shared/types.ts'
