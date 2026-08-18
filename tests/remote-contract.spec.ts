import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { describe, expect, it } from 'vitest'

import { nestedFollowupsRemoteDescriptors } from '../src/remote-descriptors.ts'
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
} from '../src/shared/remote.ts'
import { TYPERT } from '../src/typert.host.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

describe('tree Remote contract', () => {
  it('strictly validates reads and revision watches', () => {
    expect(treeReadRequestSchema.parse({ sessionId: 'root' })).toEqual({ sessionId: 'root' })
    expect(() => treeReadRequestSchema.parse({ sessionId: 'root', extra: true })).toThrow()
    expect(treeWatchRequestSchema.parse({ sessionId: 'root', afterRevision: 0 })).toEqual({
      sessionId: 'root',
      afterRevision: 0,
    })
    expect(() => treeWatchRequestSchema.parse({ sessionId: 'root', afterRevision: -1 })).toThrow()
  })

  it('round-trips a complete projection and both watch outcomes', () => {
    const snapshot = {
      rootSessionId: 'root',
      revision: 2,
      capabilities: {
        askFollowUp: true,
        continueBranch: true,
        nativeBranchContinuation: false,
        deletion: { supported: true, mode: 'archive' },
      },
      projection: treeProjectionFixture(),
    }
    expect(treeReadResultSchema.parse({ ok: true, value: snapshot })).toEqual({ ok: true, value: snapshot })
    expect(treeWatchResultSchema.parse({
      ok: true,
      value: { changed: true, snapshot },
    })).toEqual({ ok: true, value: { changed: true, snapshot } })
    expect(treeWatchResultSchema.parse({
      ok: true,
      value: { changed: false, revision: 2 },
    })).toEqual({ ok: true, value: { changed: false, revision: 2 } })
  })

  it('strictly separates create-child and continue-current commands', () => {
    expect(createBranchRequestSchema.parse({
      ownerSessionId: 'root',
      clientRequestId: 'request-create',
      anchor: {
        sessionId: 'root',
        messageId: 'a2',
        seq: 3,
        range: { start: 0, end: 2, text: '😀' },
      },
      question: 'why?',
    }).anchor.range).toEqual({ start: 0, end: 2, text: '😀' })
    expect(() => createBranchRequestSchema.parse({
      ownerSessionId: 'root',
      clientRequestId: 'request-empty-range',
      anchor: {
        sessionId: 'root',
        messageId: 'a2',
        seq: 3,
        range: { start: 1, end: 1, text: '' },
      },
      question: 'why?',
    })).toThrow()
    expect(continueBranchRequestSchema.parse({
      ownerSessionId: 'root',
      clientRequestId: 'request-continue',
      branchId: 'branch-1',
      tail: { sessionId: 'branch-session', messageId: 'a2.1', seq: 9 },
      question: 'go deeper',
    }).branchId).toBe('branch-1')
    expect(() => continueBranchRequestSchema.parse({
      ownerSessionId: 'root',
      clientRequestId: 'request-continue',
      branchId: 'branch-1',
      tail: { sessionId: 'branch-session', messageId: 'a2.1', seq: 9 },
      question: '   ',
    })).toThrow()
    expect(branchCommandResultSchema.parse({
      ok: true,
      value: {
        action: 'continue-branch',
        branchId: 'branch-1',
        sessionId: 'branch-session',
        messageId: 'request-continue',
      },
    }).ok).toBe(true)
    expect(deleteBranchRequestSchema.parse({
      ownerSessionId: 'root',
      branchId: 'branch-1',
    })).toEqual({ ownerSessionId: 'root', branchId: 'branch-1' })
    expect(deleteBranchResultSchema.parse({
      ok: true,
      value: {
        status: 'deleted',
        branchCount: 3,
        visibleMessageCount: 9,
        cleanupMode: 'archive',
      },
    }).ok).toBe(true)
  })

  it('publishes stable direct-method descriptors for the Typert loader', () => {
    expect(validateTypertManifest('dsh-nested-followups', TYPERT)).toBe(TYPERT)
    expect(nestedFollowupsRemoteDescriptors.map(descriptor => ({
      service: descriptor.service,
      namespace: descriptor.namespace,
      method: descriptor.method,
      invocation: descriptor.invocation.kind,
    }))).toEqual([
      {
        service: 'nestedFollowups',
        namespace: 'nestedFollowups',
        method: 'readTree',
        invocation: 'direct',
      },
      {
        service: 'nestedFollowups',
        namespace: 'nestedFollowups',
        method: 'watchTree',
        invocation: 'direct',
      },
      {
        service: 'nestedFollowups',
        namespace: 'nestedFollowups',
        method: 'createBranch',
        invocation: 'direct',
      },
      {
        service: 'nestedFollowups',
        namespace: 'nestedFollowups',
        method: 'continueBranch',
        invocation: 'direct',
      },
      {
        service: 'nestedFollowups',
        namespace: 'nestedFollowups',
        method: 'deleteBranch',
        invocation: 'direct',
      },
    ])
  })
})
