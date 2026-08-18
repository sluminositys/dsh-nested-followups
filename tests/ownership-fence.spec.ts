import { Context, type Fiber } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createApiRemoteAgentResolver } from '@deepseek-ai/dsh-api-remotes'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

describe('rc.7 native Chat ownership fence', () => {
  it('returns the visible agent-busy error for an origin-classified branch', async () => {
    const ctx = new Context()
    const fibers: Fiber[] = []
    try {
      const sessions = ctx.plugin(SessionStore)
      fibers.push(sessions)
      await sessions
      const agents = ctx.plugin(AgentRegistry)
      fibers.push(agents)
      await agents
      const branch = ctx.sessions.create(SessionId('branch-session'), {
        meta: {
          parentSession: SessionId('root-session'),
          origin: 'subagent',
        },
      })
      const resolve = createApiRemoteAgentResolver(ctx, {})

      await expect(resolve(branch.id)).resolves.toEqual({
        error: {
          code: 'agent-busy',
          message: 'session "branch-session" is owned by subagent routing',
          details: { reason: 'use subagent delivery for this child session' },
        },
      })
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
  })
})

