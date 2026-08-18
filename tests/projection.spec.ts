import { describe, expect, it } from 'vitest'

import {
  displayLabelOf,
  projectConversationTree,
  validateAnchorRange,
} from '../src/host/projection.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'
import { pluginContext, textTurn } from './fixtures/session-events.ts'

function sessionEvent(value: unknown): import('@deepseek-ai/dsh-session/types').SessionEvent {
  return value as import('@deepseek-ai/dsh-session/types').SessionEvent
}

const tree: TreeRecord = {
  treeId: 'tree-1',
  rootSessionId: 'root',
  version: 1,
  createdAt: 1,
  updatedAt: 1,
}

const rootEvents = [
  ...textTurn(0, 1, 'root-q1', 'root-a1', 'Q1', 'A1'),
  ...textTurn(6, 2, 'root-q2', 'root-a2', 'Q2', 'A2 explanation'),
  ...textTurn(12, 3, 'root-q3', 'root-a3', 'Q3', 'A3'),
]

const branchOne: BranchRecord = {
  branchId: 'branch-1',
  clientRequestId: 'request-1',
  treeId: tree.treeId,
  sessionId: 'branch-session-1',
  parentSessionId: tree.rootSessionId,
  parentBranchId: null,
  anchorSessionId: tree.rootSessionId,
  anchorMessageId: 'root-a2',
  anchorSeq: 9,
  forkBoundarySeq: 11,
  seedLength: 12,
  siblingOrdinal: 1,
  createdAt: 2,
  status: 'ready',
}

const branchOneEvents = [
  ...rootEvents.slice(0, 12),
  ...textTurn(12, 3, 'branch-q1', 'branch-a1', 'Q2.1', 'A2.1'),
]

const nestedBranch: BranchRecord = {
  branchId: 'branch-1-1',
  clientRequestId: 'request-1-1',
  treeId: tree.treeId,
  sessionId: 'branch-session-1-1',
  parentSessionId: branchOne.sessionId,
  parentBranchId: branchOne.branchId,
  anchorSessionId: branchOne.sessionId,
  anchorMessageId: 'branch-a1',
  anchorSeq: 15,
  forkBoundarySeq: 17,
  seedLength: 18,
  siblingOrdinal: 1,
  createdAt: 3,
  status: 'ready',
}

const nestedEvents = [
  ...branchOneEvents,
  ...textTurn(18, 4, 'nested-q1', 'nested-a1', 'Q2.1.1', 'A2.1.1'),
]

function logs(entries?: {
  branchOneEvents?: typeof branchOneEvents
  nestedEvents?: typeof nestedEvents
}): Map<string, { sessionId: string; events: typeof rootEvents; seedLength?: number }> {
  return new Map([
    ['root', { sessionId: 'root', events: rootEvents }],
    ['branch-session-1', {
      sessionId: 'branch-session-1',
      events: entries?.branchOneEvents ?? branchOneEvents,
      seedLength: 12,
    }],
    ['branch-session-1-1', {
      sessionId: 'branch-session-1-1',
      events: entries?.nestedEvents ?? nestedEvents,
      seedLength: 18,
    }],
  ])
}

describe('conversation tree projection', () => {
  it('projects a message-level main thread and removes inherited event prefixes', () => {
    const projection = projectConversationTree(tree, [nestedBranch, branchOne], logs())

    expect(projection.nodes.map(node => node.messageId)).toEqual([
      'root-q1', 'root-a1', 'root-q2', 'root-a2', 'root-q3', 'root-a3',
      'branch-q1', 'branch-a1', 'nested-q1', 'nested-a1',
    ])
    expect(new Set(projection.nodes.map(node => node.messageId)).size).toBe(projection.nodes.length)
    expect(projection.branches.map(branch => branch.branchPath)).toEqual([[2, 1], [2, 1, 1]])
    expect(projection.diagnostics).toEqual([])
  })

  it('connects each branch to the exact persisted anchor message', () => {
    const projection = projectConversationTree(tree, [branchOne, nestedBranch], logs())
    const branchEdges = projection.edges.filter(edge => edge.kind === 'branch')

    expect(branchEdges).toEqual([
      expect.objectContaining({
        sourceNodeId: 'root:root-a2',
        targetNodeId: 'branch-session-1:branch-q1',
      }),
      expect.objectContaining({
        sourceNodeId: 'branch-session-1:branch-a1',
        targetNodeId: 'branch-session-1-1:nested-q1',
      }),
    ])
  })

  it('uses the branch path for the first turn and a local turn suffix afterwards', () => {
    const extendedBranchEvents = [
      ...branchOneEvents,
      ...textTurn(18, 4, 'branch-q2', 'branch-a2', 'another question', 'another answer'),
    ]
    const projection = projectConversationTree(
      tree,
      [branchOne],
      logs({ branchOneEvents: extendedBranchEvents }),
    )
    const labels = projection.nodes
      .filter(node => node.branchId === branchOne.branchId)
      .map(displayLabelOf)

    expect(labels).toEqual(['Q2.1', 'A2.1', 'Q2.1 #2', 'A2.1 #2'])
  })

  it('treats seedLength as an event count rather than a message count', () => {
    const projection = projectConversationTree(tree, [branchOne], logs())
    const branchMessages = projection.nodes
      .filter(node => node.branchId === branchOne.branchId)
      .map(node => node.messageId)

    expect(branchMessages).toEqual(['branch-q1', 'branch-a1'])
    expect(branchOne.seedLength).toBeGreaterThan(4)
  })

  it('hides deleted branches and every descendant without hiding siblings', () => {
    const deleted: BranchRecord = {
      ...branchOne,
      status: 'deleted',
      deletedAt: 10,
    }
    const sibling: BranchRecord = {
      ...branchOne,
      branchId: 'branch-2',
      clientRequestId: 'request-2',
      sessionId: 'branch-session-2',
      siblingOrdinal: 2,
      createdAt: 4,
    }
    const siblingEvents = [
      ...rootEvents.slice(0, 12),
      ...textTurn(12, 3, 'sibling-q1', 'sibling-a1', 'sibling question', 'sibling answer'),
    ]
    const sessionLogs = logs()
    sessionLogs.set('branch-session-2', {
      sessionId: 'branch-session-2',
      events: siblingEvents,
      seedLength: 12,
    })

    const projection = projectConversationTree(tree, [deleted, nestedBranch, sibling], sessionLogs)

    expect(projection.branches.map(branch => branch.record.branchId)).toEqual(['branch-2'])
    expect(projection.nodes.filter(node => node.branchId !== null).map(node => node.messageId))
      .toEqual(['sibling-q1', 'sibling-a1'])
  })

  it('reports missing sessions without inventing message relationships', () => {
    const projection = projectConversationTree(
      tree,
      [branchOne],
      new Map([['root', { sessionId: 'root', events: rootEvents }]]),
    )

    expect(projection.branches[0]?.nodeIds).toEqual([])
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: 'branch-session-missing',
      branchId: branchOne.branchId,
    }))
  })

  it('preserves a child branch when its logical parent record is missing', () => {
    const orphan: BranchRecord = {
      ...nestedBranch,
      parentBranchId: 'missing-branch',
    }
    const projection = projectConversationTree(tree, [orphan], logs())

    expect(projection.branches[0]?.record.branchId).toBe(orphan.branchId)
    expect(projection.branches[0]?.nodeIds).toEqual([
      'branch-session-1-1:nested-q1',
      'branch-session-1-1:nested-a1',
    ])
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: 'branch-parent-missing',
      branchId: orphan.branchId,
    }))
  })

  it('reports stale seed metadata while retaining the stored record as the de-duplication boundary', () => {
    const sessionLogs = logs()
    sessionLogs.set(branchOne.sessionId, {
      sessionId: branchOne.sessionId,
      events: branchOneEvents,
      seedLength: 6,
    })
    const projection = projectConversationTree(tree, [branchOne], sessionLogs)

    expect(projection.nodes.filter(node => node.branchId === branchOne.branchId).map(node => node.messageId))
      .toEqual(['branch-q1', 'branch-a1'])
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: 'seed-length-mismatch',
      branchId: branchOne.branchId,
    }))
  })

  it('validates a text anchor against persisted Markdown offsets', () => {
    const start = 'A2 explanation'.indexOf('explanation')
    const ranged: BranchRecord = {
      ...branchOne,
      anchorRange: { start, end: start + 11, text: 'explanation' },
    }
    const valid = projectConversationTree(tree, [ranged], logs())
    expect(valid.branches[0]?.anchorStatus).toBe('range-valid')

    const stale = projectConversationTree(
      tree,
      [{ ...ranged, anchorRange: { ...ranged.anchorRange!, text: 'different' } }],
      logs(),
    )
    expect(stale.branches[0]?.anchorStatus).toBe('range-invalid')
    expect(stale.diagnostics).toContainEqual(expect.objectContaining({ code: 'anchor-range-invalid' }))
    expect(validateAnchorRange('😀 markdown', { start: 0, end: 2, text: '😀' })).toBe(true)
  })

  it('does not turn plugin context injection into a user card', () => {
    const events = [
      rootEvents[0]!,
      pluginContext(1, 'workspace instructions'),
      ...rootEvents.slice(1).map((event, index) => ({ ...event, seq: index + 2 })),
    ]
    const projection = projectConversationTree(
      tree,
      [],
      new Map([['root', { sessionId: 'root', events }]]),
    )

    expect(projection.nodes.some(node => node.messageId === 'context-1')).toBe(false)
  })

  it('projects a stable queued and streaming assistant node until the durable message commits', () => {
    const prefix = rootEvents.slice(0, branchOne.seedLength)
    const turnStart = sessionEvent({
      type: 'turn/start',
      seq: 12,
      time: 2_000,
      data: { turn: 3 },
    })
    const user = sessionEvent({
      type: 'user/message',
      seq: 13,
      time: 2_001,
      data: {
        id: 'branch-stream-q1',
        role: 'user',
        content: [{ type: 'text', text: 'Explain this' }],
        source: { kind: 'user' },
      },
      surfaceOp: 'append',
    })
    const stepStart = sessionEvent({
      type: 'step/start',
      seq: 14,
      time: 2_002,
      data: { turn: 3, step: 1 },
    })
    const queuedEvents = [...prefix, turnStart, user, stepStart]
    const queuedLogs = logs({ branchOneEvents: queuedEvents as typeof branchOneEvents })
    const queued = projectConversationTree(tree, [branchOne], queuedLogs)
    const queuedBranch = queued.nodes.filter(node => node.branchId === branchOne.branchId)

    expect(queuedBranch).toEqual([
      expect.objectContaining({ messageId: 'branch-stream-q1', state: 'complete' }),
      expect.objectContaining({ messageId: 'stream-3-1', state: 'queued', text: '' }),
    ])

    const streamingEvents = [
      ...queuedEvents,
      sessionEvent({
        type: 'assistant/chunk',
        seq: 15,
        time: 2_003,
        data: { turn: 3, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
      }),
      sessionEvent({
        type: 'assistant/chunk',
        seq: 16,
        time: 2_004,
        data: { turn: 3, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Partial answer' } },
      }),
    ]
    const streamingLogs = logs({ branchOneEvents: streamingEvents as typeof branchOneEvents })
    const streaming = projectConversationTree(tree, [branchOne], streamingLogs)
    const streamingAnswer = streaming.nodes.find(node => node.messageId === 'stream-3-1')

    expect(streamingAnswer).toEqual(expect.objectContaining({
      state: 'streaming',
      text: 'Partial answer',
    }))

    const completeEvents = [
      ...streamingEvents,
      sessionEvent({
        type: 'assistant/message',
        seq: 17,
        time: 2_005,
        data: {
          turn: 3,
          step: 1,
          message: {
            id: 'branch-stream-a1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Partial answer, completed.' }],
            source: { kind: 'model', provider: 'test', model: 'test-model' },
          },
        },
        surfaceOp: 'append',
      }),
      sessionEvent({
        type: 'step/end',
        seq: 18,
        time: 2_006,
        data: { turn: 3, step: 1 },
      }),
      sessionEvent({
        type: 'turn/end',
        seq: 19,
        time: 2_007,
        data: { turn: 3, reason: { kind: 'completed' } },
      }),
    ]
    const completeLogs = logs({ branchOneEvents: completeEvents as typeof branchOneEvents })
    const complete = projectConversationTree(tree, [branchOne], completeLogs)

    expect(complete.nodes.some(node => node.messageId === 'stream-3-1')).toBe(false)
    expect(complete.nodes.find(node => node.messageId === 'branch-stream-a1')).toEqual(
      expect.objectContaining({ state: 'complete', text: 'Partial answer, completed.' }),
    )
  })

  it('diagnoses tool events in a chat-only branch without rendering tool cards', () => {
    const withToolEvent = [
      ...branchOneEvents,
      sessionEvent({
        type: 'tool/call',
        seq: 18,
        time: 3_000,
        data: { turn: 3, step: 1, callId: 'call-1', name: 'shell', arguments: '{}' },
      }),
    ]
    const projection = projectConversationTree(
      tree,
      [branchOne],
      logs({ branchOneEvents: withToolEvent as typeof branchOneEvents }),
    )

    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: 'branch-tool-event',
      branchId: branchOne.branchId,
    }))
    expect(projection.nodes.every(node => node.role === 'user' || node.role === 'assistant')).toBe(true)
  })
})
