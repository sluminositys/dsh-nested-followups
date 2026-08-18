import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

function event(value: unknown): SessionEvent {
  return value as SessionEvent
}

/** Six-event text-only turn matching the rc.7 session log envelope. */
export function textTurn(
  startSeq: number,
  turn: number,
  userMessageId: string,
  assistantMessageId: string,
  question: string,
  answer: string,
): SessionEvent[] {
  const time = 1_000 + startSeq * 10
  return [
    event({
      type: 'turn/start',
      seq: startSeq,
      time,
      data: { turn },
    }),
    event({
      type: 'user/message',
      seq: startSeq + 1,
      time: time + 1,
      data: {
        id: userMessageId,
        role: 'user',
        content: [{ type: 'text', text: question }],
        source: { kind: 'user' },
      },
      surfaceOp: 'append',
    }),
    event({
      type: 'step/start',
      seq: startSeq + 2,
      time: time + 2,
      data: { turn, step: 1 },
    }),
    event({
      type: 'assistant/message',
      seq: startSeq + 3,
      time: time + 3,
      data: {
        turn,
        step: 1,
        message: {
          id: assistantMessageId,
          role: 'assistant',
          content: [{ type: 'text', text: answer }],
          source: { kind: 'model', provider: 'test', model: 'test-model' },
        },
      },
      surfaceOp: 'append',
    }),
    event({
      type: 'step/end',
      seq: startSeq + 4,
      time: time + 4,
      data: { turn, step: 1 },
    }),
    event({
      type: 'turn/end',
      seq: startSeq + 5,
      time: time + 5,
      data: { turn, reason: { kind: 'completed' } },
    }),
  ]
}

/** A completed two-step turn whose first assistant message invokes a tool. */
export function toolTurn(): SessionEvent[] {
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

export function pluginContext(seq: number, text: string): SessionEvent {
  return event({
    type: 'user/message',
    seq,
    time: 2_000 + seq,
    data: {
      id: `context-${seq}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'test' },
    },
    surfaceOp: 'append',
  })
}
