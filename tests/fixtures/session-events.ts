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
