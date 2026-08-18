import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'

import { BranchBoundaryError, resolveBranchBoundary } from '../src/host/safe-boundary.ts'
import { pluginContext, textTurn, toolTurn } from './fixtures/session-events.ts'

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

describe('safe branch boundary', () => {
  it('copies a completed turn and trailing out-of-band events up to the next turn', () => {
    const events = [
      ...textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
      pluginContext(6, 'context appended after the turn'),
      ...textTurn(7, 2, 'q2', 'a2', 'later question', 'later answer'),
    ]
    const boundary = resolveBranchBoundary(events, 'a1')

    expect(boundary.turnEndSeq).toBe(5)
    expect(boundary.forkBoundarySeq).toBe(6)
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
      turnEndSeq: 10,
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
