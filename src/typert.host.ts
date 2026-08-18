import { nestedFollowupsRemoteDescriptors } from './remote-descriptors.ts'

export const TYPERT = {
  package: 'dsh-nested-followups',
  face: 'host',
  schemas: [],
  invocations: nestedFollowupsRemoteDescriptors,
  model: {
    services: [{
      description: 'Reads and watches message-level conversation tree projections.',
      summary: 'Conversation tree projections.',
      tags: [],
      jsDoc: '/** Message-level conversation tree projection service. */',
      key: 'nestedFollowups',
      exportName: 'NestedFollowupsService',
      members: [
        {
          kind: 'method',
          name: 'createBranch',
          signature: 'createBranch(request: CreateBranchRequest): Promise<BranchCommandResult>',
          summary: 'Create a chat-only child branch.',
          jsDoc: '/** Create a chat-only child branch. */',
        },
        {
          kind: 'method',
          name: 'continueBranch',
          signature: 'continueBranch(request: ContinueBranchRequest): Promise<BranchCommandResult>',
          summary: 'Append one chat-only branch turn.',
          jsDoc: '/** Append one chat-only branch turn. */',
        },
        {
          kind: 'method',
          name: 'readTree',
          signature: 'async readTree(request: TreeReadRequest): Promise<TreeReadResult>',
          summary: 'Read one complete tree projection.',
          jsDoc: '/** Read one complete tree projection. */',
        },
        {
          kind: 'method',
          name: 'watchTree',
          signature: 'async watchTree(request: TreeWatchRequest): Promise<TreeWatchResult>',
          summary: 'Wait for one tree projection revision.',
          jsDoc: '/** Wait for one tree projection revision. */',
        },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
} as const

export default TYPERT
