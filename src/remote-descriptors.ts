import {
  branchCommandResultSchema,
  continueBranchRequestSchema,
  createBranchRequestSchema,
  deleteBranchRequestSchema,
  deleteBranchResultSchema,
  treeReadRequestSchema,
  treeReadResultSchema,
  treeWatchRequestSchema,
  treeWatchResultSchema,
} from './shared/remote.ts'

export const createBranchDescriptor = {
  id: 'dsh-nested-followups#nestedFollowups/createBranch',
  service: 'nestedFollowups',
  namespace: 'nestedFollowups',
  method: 'createBranch',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: 'dsh-nested-followups#CreateBranchRequest',
      schema: createBranchRequestSchema,
      create: () => createBranchRequestSchema,
    },
  }],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-nested-followups#BranchCommandResult',
    schema: branchCommandResultSchema,
    create: () => branchCommandResultSchema,
  },
  sourceLocation: { file: 'src/host/tree-service.ts', line: 179, column: 3 },
} as const

export const continueBranchDescriptor = {
  id: 'dsh-nested-followups#nestedFollowups/continueBranch',
  service: 'nestedFollowups',
  namespace: 'nestedFollowups',
  method: 'continueBranch',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: 'dsh-nested-followups#ContinueBranchRequest',
      schema: continueBranchRequestSchema,
      create: () => continueBranchRequestSchema,
    },
  }],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-nested-followups#BranchCommandResult',
    schema: branchCommandResultSchema,
    create: () => branchCommandResultSchema,
  },
  sourceLocation: { file: 'src/host/tree-service.ts', line: 185, column: 3 },
} as const

export const deleteBranchDescriptor = {
  id: 'dsh-nested-followups#nestedFollowups/deleteBranch',
  service: 'nestedFollowups',
  namespace: 'nestedFollowups',
  method: 'deleteBranch',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: 'dsh-nested-followups#DeleteBranchRequest',
      schema: deleteBranchRequestSchema,
      create: () => deleteBranchRequestSchema,
    },
  }],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-nested-followups#DeleteBranchResult',
    schema: deleteBranchResultSchema,
    create: () => deleteBranchResultSchema,
  },
  sourceLocation: { file: 'src/host/tree-service.ts', line: 220, column: 3 },
} as const

export const readTreeDescriptor = {
  id: 'dsh-nested-followups#nestedFollowups/readTree',
  service: 'nestedFollowups',
  namespace: 'nestedFollowups',
  method: 'readTree',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: 'dsh-nested-followups#TreeReadRequest',
      schema: treeReadRequestSchema,
      create: () => treeReadRequestSchema,
    },
  }],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-nested-followups#TreeReadResult',
    schema: treeReadResultSchema,
    create: () => treeReadResultSchema,
  },
  sourceLocation: { file: 'src/host/tree-service.ts', line: 150, column: 3 },
} as const

export const watchTreeDescriptor = {
  id: 'dsh-nested-followups#nestedFollowups/watchTree',
  service: 'nestedFollowups',
  namespace: 'nestedFollowups',
  method: 'watchTree',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: 'dsh-nested-followups#TreeWatchRequest',
      schema: treeWatchRequestSchema,
      create: () => treeWatchRequestSchema,
    },
  }],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-nested-followups#TreeWatchResult',
    schema: treeWatchResultSchema,
    create: () => treeWatchResultSchema,
  },
  sourceLocation: { file: 'src/host/tree-service.ts', line: 164, column: 3 },
} as const

export const nestedFollowupsRemoteDescriptors = Object.freeze([
  readTreeDescriptor,
  watchTreeDescriptor,
  createBranchDescriptor,
  continueBranchDescriptor,
  deleteBranchDescriptor,
])
