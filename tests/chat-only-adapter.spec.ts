import type { Context } from '@deepseek-ai/cordis'
import type {
  Agent,
  AgentHandle,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'

import {
  applyChatOnlyScopeRc7,
  createChatOnlyForkAgentRc7,
  probeChatOnlyCapabilityRc7,
  resumeChatOnlyBranchAgentRc7,
  submitChatOnlyTurnRc7,
  type BranchAgentRegistry,
} from '../src/host/adapter/chat-only.ts'

function scopedContext() {
  const guard = vi.fn()
  const tools = {
    presentAs: vi.fn(() => () => {}),
    restrict: vi.fn(() => () => {}),
    guard: vi.fn((candidate: () => string) => {
      guard.mockImplementation(candidate)
      return () => {}
    }),
  }
  const ctx = {
    get: (name: string) => name === 'tools' ? tools : undefined,
    on: vi.fn(() => () => {}),
  } as unknown as Context
  return { ctx, tools, guard }
}

function handle(): AgentHandle {
  const session = Session.create(SessionId('branch'))
  const agent = {
    id: session.id,
    session,
    status: 'idle',
    followup: vi.fn(),
  } as unknown as Agent
  return { agent, dispose: vi.fn(async () => {}) }
}

describe('rc.7 chat-only Agent adapter', () => {
  it('rejects partial lookalike services instead of enabling unsafe mutations', () => {
    const ctx = {
      get: (name: string) => name === 'agents'
        ? { create: () => {}, resume: () => {} }
        : name === 'tools'
          ? { presentAs: () => {}, restrict: () => {} }
          : undefined,
    } as unknown as Context

    expect(probeChatOnlyCapabilityRc7(ctx)).toMatchObject({ supported: false })
  })

  it('removes every tool schema, removes Code Mode, and denies late scoped tools', () => {
    const { ctx, tools, guard } = scopedContext()
    applyChatOnlyScopeRc7(ctx)

    expect(tools.presentAs).toHaveBeenCalledWith('native')
    expect(tools.restrict).toHaveBeenCalledWith({ allow: [] })
    expect(tools.guard).toHaveBeenCalledTimes(1)
    expect(guard()).toContain('chat-only')
  })

  it('leaves a real rc.7 prompt assembly empty and monotonically denies a late local tool', async () => {
    const ctx = new (await import('@deepseek-ai/cordis')).Context()
    const systemPromptFiber = ctx.plugin(SystemPrompt, {
      toolOrder: ['global_read', '<unlisted-tools>'],
    })
    await systemPromptFiber
    const toolsFiber = ctx.plugin(ToolRuntime)
    await toolsFiber
    const definition: ToolDefinition = {
      name: 'global_read',
      description: 'read a file',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      execute: () => Promise.resolve('must not execute'),
    }
    ctx.tools.register(definition)

    const key = { id: SessionId('chat-only-agent') } as Agent
    let scope!: ReturnType<typeof createScope>
    const minter = ctx.plugin(Object.assign((inner: Context) => {
      scope = createScope(inner, key)
    }, { inject: ['tools', 'systemPrompt'] }))
    await minter
    applyChatOnlyScopeRc7(scope.ctx)
    scope.ctx.tools.register({ ...definition, name: 'late_local' })

    const assembly = await ctx.systemPrompt.assemble({ scope: key })
    expect(assembly.tools).toEqual([])
    const denied = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('late-call'),
      name: 'late_local',
      arguments: {},
      agent: key,
    })
    expect(denied.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('chat-only') }),
    ])

    await scope.dispose()
    await minter.dispose()
    await toolsFiber.dispose()
    await systemPromptFiber.dispose()
  })

  it('applies the identical chat-only setup to the first round and a cold Continue round', async () => {
    const branchHandle = handle()
    const create = vi.fn(async (_options: CreateAgentOptions) => branchHandle)
    const resume = vi.fn(async (_options: ResumeAgentOptions) => branchHandle)
    const agents = {
      get: vi.fn(),
      create,
      resume,
    } as unknown as BranchAgentRegistry
    const header: SessionHeader = {
      version: 1,
      id: SessionId('root'),
      createdAt: 1,
      cwd: 'D:\\workspace\\project',
    }
    const seed = [] as SessionEvent[]

    await createChatOnlyForkAgentRc7(agents, {
      sessionId: SessionId('branch'),
      sourceHeader: header,
      seed,
    })
    await resumeChatOnlyBranchAgentRc7(agents, SessionId('branch'))

    const createOptions = create.mock.calls[0]?.[0]
    const resumeOptions = resume.mock.calls[0]?.[0]
    expect(createOptions?.meta).toMatchObject({
      cwd: 'D:\\workspace\\project',
      parentSession: SessionId('root'),
      seedLength: 0,
      origin: 'subagent',
    })
    expect(createOptions?.setup).toBe(applyChatOnlyScopeRc7)
    expect(resumeOptions?.setup).toBe(applyChatOnlyScopeRc7)
  })

  it('uses a durable client request id for idempotent Host-side delivery', () => {
    const branchHandle = handle()
    const messageId = submitChatOnlyTurnRc7(
      branchHandle.agent,
      'Explain this without tools.',
      'request-continue-1',
    )

    expect(messageId).toBe('request-continue-1')
    expect(branchHandle.agent.followup).toHaveBeenCalledWith(expect.objectContaining({
      id: 'request-continue-1',
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Explain this without tools.' }],
    }))
  })
})
