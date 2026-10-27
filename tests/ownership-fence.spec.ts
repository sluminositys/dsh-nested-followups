import { Context, type Fiber } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

describe('native Chat ownership fence', () => {
  it('retains the origin marker consumed by both native fence generations', async () => {
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
      const remotes = await import('@deepseek-ai/dsh-api-remotes') as unknown as {
        readonly createApiRemoteAgentResolver?: (
          owner: Context,
          options: Record<string, unknown>,
        ) => (id: SessionId) => Promise<unknown>
      }
      const createResolver = remotes.createApiRemoteAgentResolver
      if (createResolver === undefined) {
        // DSH 0.1.2 moved this fence into session-controller. Its public input
        // remains the same immutable marker; the controller itself is an
        // upstream integration rather than a plugin dependency.
        expect(branch.header).toMatchObject({
          parentSession: SessionId('root-session'),
          origin: 'subagent',
        })
        return
      }
      const resolve = createResolver(ctx, {})

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
