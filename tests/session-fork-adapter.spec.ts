import { Context } from '@deepseek-ai/cordis'
import SessionStore, {
  Session,
  SessionForkError,
  SessionId,
  type SessionEvent,
  type SessionForkErrorCode,
} from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

import {
  createSubagentFork,
  createSubagentForkRc7,
  selectForkSeedRc7,
  OpenTurnForkError,
} from '../src/host/adapter/session-fork.ts'
import { sessionSeedLength, snapshotSessionEvents } from '../src/host/adapter/session-compat.ts'
import { textTurn } from './fixtures/session-events.ts'

function openTurn(startSeq: number, turn: number): SessionEvent[] {
  return [
    {
      type: 'turn/start',
      seq: startSeq,
      time: 2_000,
      data: { turn },
    },
    {
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
    },
  ] as SessionEvent[]
}

async function setup(): Promise<{ ctx: Context; sessions: SessionStore }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return { ctx, sessions: ctx.sessions }
}

function inheritedSeed(session: Session): readonly SessionEvent[] {
  return snapshotSessionEvents(session).slice(0, sessionSeedLength(session) ?? 0)
}

function forkErrorCode(action: () => unknown): SessionForkErrorCode | 'OPEN_TURN' {
  try {
    action()
  } catch (error: unknown) {
    if (error instanceof SessionForkError || error instanceof OpenTurnForkError) return error.code
    throw error
  }
  throw new Error('expected SessionForkError')
}

describe('rc.7 subagent fork adapter', () => {
  it('creates the same explicit-boundary seed as SessionStore.fork and adds only subagent origin', async () => {
    const { ctx, sessions } = await setup()
    const source = ctx.sessions.create(SessionId('parent'), {
      seed: [
        ...textTurn(0, 1, 'q1', 'a1', 'first question', 'first answer'),
        ...textTurn(6, 2, 'q2', 'a2', 'later question', 'later answer'),
      ],
      meta: { cwd: 'D:\\workspace\\project' },
    })

    const official = sessions.fork(source, 5 as never, SessionId('official-child'))
    const adapted = createSubagentFork(sessions, source, 5, SessionId('adapted-child'))

    expect(inheritedSeed(adapted)).toEqual(inheritedSeed(official))
    expect(adapted.header).toMatchObject({
      cwd: 'D:\\workspace\\project',
      parentSession: source.id,
      origin: 'subagent',
    })
    expect(sessionSeedLength(adapted)).toBe(6)
    expect(official.header.origin).toBeUndefined()
  })

  it('matches the official default cut, including stable events outside a turn', async () => {
    const { ctx, sessions } = await setup()
    const source = ctx.sessions.create(SessionId('default-parent'), {
      seed: textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
    })

    const official = sessions.fork(source, undefined, SessionId('official-default'))
    const adapted = createSubagentForkRc7(
      sessions,
      source,
      undefined,
      SessionId('adapted-default'),
    )

    expect(inheritedSeed(adapted)).toEqual(inheritedSeed(official))
    expect(sessionSeedLength(adapted)).toBe(sessionSeedLength(official))
  })

  it('forks an earlier completed boundary while the source has a later open turn', async () => {
    const { ctx, sessions } = await setup()
    const source = ctx.sessions.create(SessionId('busy-parent'), {
      seed: [
        ...textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
        ...openTurn(6, 2),
      ],
    })

    const official = sessions.fork(source, 5 as never, SessionId('official-busy-child'))
    const adapted = createSubagentForkRc7(
      sessions,
      source,
      5,
      SessionId('adapted-busy-child'),
    )

    expect(inheritedSeed(adapted)).toEqual(inheritedSeed(official))
    expect(sessionSeedLength(adapted)).toBe(6)
    expect(snapshotSessionEvents(source)
      .some(event => event.type === 'turn/start' && event.data.turn === 2)).toBe(true)
  })

  it('matches official error classifications for invalid boundaries and rejects open turns', async () => {
    const { ctx, sessions } = await setup()
    const source = ctx.sessions.create(SessionId('error-parent'), {
      seed: [
        ...textTurn(0, 1, 'q1', 'a1', 'question', 'answer'),
        ...openTurn(6, 2),
      ],
    })
    const sourceEvents = snapshotSessionEvents(source)
    const boundaries = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, sourceEvents.length]

    for (const boundary of boundaries) {
      const officialCode = forkErrorCode(() => {
        sessions.fork(source, boundary as never, SessionId(`official-error-${String(boundary)}`))
      })
      const adaptedCode = forkErrorCode(() => {
        selectForkSeedRc7(source.id, sourceEvents, boundary)
      })
      expect(adaptedCode).toBe(officialCode)
    }
    for (const boundary of [6, 7]) {
      expect(forkErrorCode(() => selectForkSeedRc7(source.id, sourceEvents, boundary))).toBe('OPEN_TURN')
    }
  })

  it('matches source and duplicate-id error precedence', async () => {
    const { ctx, sessions } = await setup()
    const source = ctx.sessions.create(SessionId('open-parent'), {
      seed: openTurn(0, 1),
    })
    ctx.sessions.create(SessionId('taken'))

    expect(forkErrorCode(() => {
      sessions.fork(source, undefined, SessionId('taken'))
    })).toBe('SESSION_ALREADY_EXISTS')
    expect(forkErrorCode(() => {
      createSubagentForkRc7(sessions, source, undefined, SessionId('taken'))
    })).toBe('SESSION_ALREADY_EXISTS')
    expect(forkErrorCode(() => {
      sessions.fork(SessionId('missing'))
    })).toBe('SESSION_NOT_FOUND')
    expect(forkErrorCode(() => {
      createSubagentForkRc7(sessions, SessionId('missing'))
    })).toBe('SESSION_NOT_FOUND')
  })
})
