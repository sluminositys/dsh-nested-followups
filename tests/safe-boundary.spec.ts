import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'

import { BranchBoundaryError, resolveBranchBoundary } from '../src/host/safe-boundary.ts'
import { pluginContext, textTurn } from './fixtures/session-events.ts'

function event(value: unknown): SessionEvent {
  return value as SessionEvent
}

function openTurn(startSeq: number, turn: number): SessionEvent[] {
  return [
    event({ type: 'turn/start', seq: startSeq, time: 2_000, data: { turn } }),
    event({
      type: 'user/message',
      seq: startSeq + 1,
      time: 2_001,
      data: {
        id: `open-q-${turn}`,
        role: 'user',
        content: [{ type: 'text', text: 'still running' }],
        source: { kind: 'user' },
      },
      surfaceOp: 'append',
    }),
    event({ type: 'step/start', seq: startSeq + 2, time: 2_002, data: { turn, step: 1 } }),
    event({
      type: 'assistant/chunk',
      seq: startSeq + 3,
      time: 2_003,
      data: { turn, step: 1, chunk: { type: 'text-delta', text: 'partial' } },
    }),
  ]
}

function toolTurn(): SessionEvent[] {
  return [
    event({ type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }),
    event({
      type: 'user/message', seq: 1, time: 2, surfaceOp: 'append',
      data: {
        id: 'q1', role: 'user', content: [{ type: 'text', text: 'question' }], source: { kind: 'user' },
      },
    }),
    event({ type: 'step/start', seq: 2, time: 3, data: { turn: 1, step: 1 } }),
    event({
      type: 'assistant/message', seq: 3, time: 4, surfaceOp: 'append',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'a-prelude',
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will check.' },
            { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' },
          ],
          source: { kind: 'model', provider: 'test', model: 'test' },
        },
      },
    }),
    event({
      type: 'tool/call', seq: 4, time: 5,
      data: { turn: 1, step: 1, callId: 'call-1', name: 'read', arguments: '{}' },
    }),
    event({
      type: 'tool/result', seq: 5, time: 6, surfaceOp: 'append',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'tool-result-1',
          role: 'user',
          content: [{ type: 'tool-result', callId: 'call-1', content: 'result' }],
          source: { kind: 'tool', callId: 'call-1' },
        },
      },
    }),
    event({ type: 'step/end', seq: 6, time: 7, data: { turn: 1, step: 1 } }),
    event({ type: 'step/start', seq: 7, time: 8, data: { turn: 1, step: 2 } }),
    event({
      type: 'assistant/message', seq: 8, time: 9, surfaceOp: 'append',
      data: {
        turn: 1,
        step: 2,
        message: {
          id: 'a-final',
          role: 'assistant',
          content: [{ type: 'text', text: 'Final explanation.' }],
          source: { kind: 'model', provider: 'test', model: 'test' },
        },
      },
    }),
    event({ type: 'step/end', seq: 9, time: 10, data: { turn: 1, step: 2 } }),
    event({ type: 'turn/end', seq: 10, time: 11, data: { turn: 1, reason: { kind: 'completed' } } }),
  ]
}

describe('safe branch boundary', () => {
  it('copies a completed turn and trailing out-of-band events up to the next turn', () => {
    const events = [
      ...textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
      pluginContext(6, 'context appended after the turn'),
      ...textTurn(7, 2, 'q2', 'a2', 'later question', 'later answer'),
    ]
    const boundary = resolveBranchBoundary(events, 'a1')

    expect(boundary.forkBoundarySeq).toBe(5)
    expect(boundary.seedLength).toBe(7)
    expect(boundary.seed.map(item => item.seq)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('allows an earlier completed turn while a later turn is still open', () => {
    const events = [
      ...textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
      ...openTurn(6, 2),
    ]

    expect(resolveBranchBoundary(events, 'a1')).toMatchObject({
      anchorMessageId: 'a1',
      seedLength: 6,
      snappedToTurnTail: false,
    })
  })

  it('rejects an anchor whose own turn is still open', () => {
    const events = [
      ...textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
      ...openTurn(6, 2),
      event({
        type: 'assistant/message', seq: 10, time: 2_004, surfaceOp: 'append',
        data: {
          turn: 2,
          step: 1,
          message: {
            id: 'open-a2', role: 'assistant', content: [{ type: 'text', text: 'partial final' }],
            source: { kind: 'model', provider: 'test', model: 'test' },
          },
        },
      }),
    ]

    expect(() => resolveBranchBoundary(events, 'open-a2'))
      .toThrow(expect.objectContaining<Partial<BranchBoundaryError>>({ code: 'turn-open' }))
  })

  it('snaps an earlier assistant message to the final assistant text at the completed turn tail', () => {
    const boundary = resolveBranchBoundary(toolTurn(), 'a-prelude')

    expect(boundary).toMatchObject({
      selectedMessageId: 'a-prelude',
      selectedSeq: 3,
      anchorMessageId: 'a-final',
      anchorSeq: 8,
      forkBoundarySeq: 10,
      snappedToTurnTail: true,
    })
  })

  it('rejects a turn ending after a tool result without a final assistant text', () => {
    const events = toolTurn().filter(event => event.seq < 7 || event.seq === 10)
      .map((item, index) => ({ ...item, seq: index })) as SessionEvent[]

    expect(() => resolveBranchBoundary(events, 'a-prelude'))
      .toThrow(expect.objectContaining<Partial<BranchBoundaryError>>({ code: 'turn-tail-unavailable' }))
  })

  it('rejects a non-contiguous or unknown anchor log before attempting a fork', () => {
    expect(() => resolveBranchBoundary([{ ...textTurn(0, 1, 'q1', 'a1', 'q', 'a')[0]!, seq: 1 }], 'a1'))
      .toThrow(expect.objectContaining<Partial<BranchBoundaryError>>({ code: 'invalid-log' }))
    expect(() => resolveBranchBoundary(textTurn(0, 1, 'q1', 'a1', 'q', 'a'), 'missing'))
      .toThrow(expect.objectContaining<Partial<BranchBoundaryError>>({ code: 'anchor-not-found' }))
  })
})
