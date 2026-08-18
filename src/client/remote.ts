import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

import { nestedFollowupsRemoteDescriptors } from '../remote-descriptors.ts'
import type {
  BranchCommandResult,
  ContinueBranchRequest,
  CreateBranchRequest,
  TreeReadRequest,
  TreeReadResult,
  TreeWatchRequest,
  TreeWatchResult,
} from '../shared/remote.ts'

export interface NestedFollowupsRemoteNamespace {
  readTree: (request: TreeReadRequest) => Promise<RemoteResult<TreeReadResult>>
  watchTree: (request: TreeWatchRequest) => Promise<RemoteResult<TreeWatchResult>>
  createBranch: (request: CreateBranchRequest) => Promise<RemoteResult<BranchCommandResult>>
  continueBranch: (request: ContinueBranchRequest) => Promise<RemoteResult<BranchCommandResult>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'nestedFollowups/readTree': NestedFollowupsRemoteNamespace['readTree']
    'nestedFollowups/watchTree': NestedFollowupsRemoteNamespace['watchTree']
    'nestedFollowups/createBranch': NestedFollowupsRemoteNamespace['createBranch']
    'nestedFollowups/continueBranch': NestedFollowupsRemoteNamespace['continueBranch']
  }

  interface TypertRemoteNamespaceMap {
    nestedFollowups: NestedFollowupsRemoteNamespace
  }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-nested-followups',
  descriptors: nestedFollowupsRemoteDescriptors,
}

export default TYPERT_REMOTE
