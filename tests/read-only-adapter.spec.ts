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
import ToolRuntime, { type ToolDefinition, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'

import {
  applyReadOnlyScopeRc7,
  createReadOnlyBranchSetup,
  createReadOnlyForkAgentRc7,
  probeReadOnlyCapabilityRc7,
  readOnlyBranchGuard,
  resolveBranchAgentOptionsRc7,
  resolveSourcePresetRc7,
  resumeReadOnlyBranchAgentRc7,
  submitBranchTurnRc7,
  type BranchAgentRegistry,
} from '../src/host/adapter/read-only.ts'

function execution(name: string): Readonly<ToolExecution> {
  return { name } as unknown as Readonly<ToolExecution>
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

function readTool(name: string): ToolDefinition {
  return {
    name,
    description: `read via ${name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: () => Promise.resolve(`${name} ran`),
  }
}

describe('rc.7 read-only branch adapter', () => {
  it('allows read and transport tools while denying every mutating or unknown tool', () => {
    for (const allowed of ['read', 'read_image', 'glob', 'grep', 'lsp', 'session_search', 'job_list', 'run_code']) {
      expect(readOnlyBranchGuard(execution(allowed))).toBeUndefined()
    }
    for (const denied of ['write', 'edit', 'bash', 'pwsh', 'str_replace_editor', 'job_kill', 'terminal_send', 'todo_write', 'subagent', 'a_future_tool']) {
      expect(readOnlyBranchGuard(execution(denied))).toContain('read-only')
    }
  })

  it('rejects a Host without the tool guard instead of enabling ungated branches', () => {
    const ctx = {
      get: (name: string) => name === 'agents'
        ? { get: () => {}, create: () => {}, resume: () => {} }
        : name === 'tools'
          ? { presentAs: () => {}, restrict: () => {} }
          : undefined,
    } as unknown as Context

    expect(probeReadOnlyCapabilityRc7(ctx)).toMatchObject({ supported: false })
  })

  it('leaves the assembled prefix byte-identical to an ungated scope', async () => {
    const ctx = new (await import('@deepseek-ai/cordis')).Context()
    const systemPromptFiber = ctx.plugin(SystemPrompt, {
      toolOrder: ['read', 'write', '<unlisted-tools>'],
    })
    await systemPromptFiber
    const toolsFiber = ctx.plugin(ToolRuntime)
    await toolsFiber
    ctx.tools.register(readTool('read'))
    ctx.tools.register(readTool('write'))
    ctx.systemPrompt.section({ name: 'tool:read', order: 100, text: 'Use the read tool.' })

    const mainlineKey = { id: SessionId('mainline-agent') } as Agent
    const branchKey = { id: SessionId('branch-agent') } as Agent
    let mainlineScope!: ReturnType<typeof createScope>
    let branchScope!: ReturnType<typeof createScope>
    const minter = ctx.plugin(Object.assign((inner: Context) => {
      mainlineScope = createScope(inner, mainlineKey)
      branchScope = createScope(inner, branchKey)
    }, { inject: ['tools', 'systemPrompt'] }))
    await minter

    // Only the branch is gated; the mainline scope stands in for an ordinary agent.
    applyReadOnlyScopeRc7(branchScope.ctx)

    const mainline = await ctx.systemPrompt.assemble({ scope: mainlineKey })
    const branch = await ctx.systemPrompt.assemble({ scope: branchKey })

    expect(JSON.stringify(branch)).toBe(JSON.stringify(mainline))
    expect(branch.tools.map(tool => tool.name)).toEqual(['read', 'write'])

    await branchScope.dispose()
    await mainlineScope.dispose()
    await minter.dispose()
    await toolsFiber.dispose()
    await systemPromptFiber.dispose()
  })

  it('executes a read tool and denies a mutating one on a real rc.7 runtime', async () => {
    const ctx = new (await import('@deepseek-ai/cordis')).Context()
    const systemPromptFiber = ctx.plugin(SystemPrompt, { toolOrder: ['<unlisted-tools>'] })
    await systemPromptFiber
    const toolsFiber = ctx.plugin(ToolRuntime)
    await toolsFiber
    ctx.tools.register(readTool('read'))
    ctx.tools.register(readTool('write'))

    const key = { id: SessionId('read-only-agent') } as Agent
    let scope!: ReturnType<typeof createScope>
    const minter = ctx.plugin(Object.assign((inner: Context) => {
      scope = createScope(inner, key)
    }, { inject: ['tools', 'systemPrompt'] }))
    await minter
    applyReadOnlyScopeRc7(scope.ctx)

    const allowed = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('read-call'),
      name: 'read',
      arguments: {},
      agent: key,
    })
    expect(allowed.content).toEqual([
      expect.objectContaining({ type: 'text', text: 'read ran' }),
    ])

    const denied = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('write-call'),
      name: 'write',
      arguments: {},
      agent: key,
    })
    expect(denied.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('read-only') }),
    ])

    await scope.dispose()
    await minter.dispose()
    await toolsFiber.dispose()
    await systemPromptFiber.dispose()
  })

  it('joins the source preset so the branch composition matches the mainline', async () => {
    const mount = vi.fn(async () => ({ id: 'engineering' }))
    const guard = vi.fn(() => () => {})
    const agentCtx = {
      get: (name: string) => name === 'tools' ? { guard } : undefined,
    } as unknown as Context
    const hostCtx = {
      get: (name: string) => name === 'agentPresets' ? { mount } : undefined,
    } as unknown as Context

    await createReadOnlyBranchSetup(hostCtx, 'engineering')(agentCtx)

    expect(mount).toHaveBeenCalledWith(agentCtx, 'engineering')
    expect(guard).toHaveBeenCalledTimes(1)
  })

  it('reads the preset the source history actually ran under', () => {
    const header: SessionHeader = {
      version: 1,
      id: SessionId('root'),
      createdAt: 1,
      agentPreset: 'creation-preset',
    }
    expect(resolveSourcePresetRc7(header, [])).toBe('creation-preset')

    const switched = [{
      seq: 0,
      type: 'agent-preset/selected',
      data: { agentPreset: 'switched-preset' },
    }] as unknown as SessionEvent[]
    expect(resolveSourcePresetRc7(header, switched)).toBe('switched-preset')

    const noPreset: SessionHeader = { version: 1, id: SessionId('root'), createdAt: 1 }
    expect(resolveSourcePresetRc7(noPreset, [])).toBeUndefined()
  })

  it('applies the identical read-only composition to the first round and a cold Continue round', async () => {
    const branchHandle = handle()
    const create = vi.fn(async (_options: CreateAgentOptions) => branchHandle)
    const resume = vi.fn(async (_options: ResumeAgentOptions) => branchHandle)
    const agents = { get: vi.fn(), create, resume } as unknown as BranchAgentRegistry
    const hostCtx = { get: () => undefined } as unknown as Context
    const header: SessionHeader = {
      version: 1,
      id: SessionId('root'),
      createdAt: 1,
      cwd: 'D:\\workspace\\project',
      agentPreset: 'engineering',
    }
    const seed = [] as SessionEvent[]
    const fallbackAgentOptions = { provider: 'mock-provider', model: 'mock-model', maxTokens: 321 }

    await createReadOnlyForkAgentRc7(hostCtx, agents, {
      sessionId: SessionId('branch'),
      sourceHeader: header,
      seed,
      fallbackAgentOptions,
    })
    await resumeReadOnlyBranchAgentRc7(hostCtx, agents, {
      sessionId: SessionId('branch'),
      header,
      events: seed,
      fallbackAgentOptions,
    })

    const createOptions = create.mock.calls[0]?.[0]
    const resumeOptions = resume.mock.calls[0]?.[0]
    expect(createOptions?.meta).toMatchObject({
      cwd: 'D:\\workspace\\project',
      parentSession: SessionId('root'),
      seedLength: 0,
      origin: 'subagent',
      agentPreset: 'engineering',
    })
    expect(createOptions?.agentOptions).toEqual(fallbackAgentOptions)
    expect(resumeOptions?.agentOptions).toEqual(fallbackAgentOptions)
    expect(typeof createOptions?.setup).toBe('function')
    expect(typeof resumeOptions?.setup).toBe('function')
  })

  it('inherits the durable fork-boundary route and does not freeze adapter defaults', () => {
    const session = Session.create(SessionId('source'))
    session.append('request/header', {
      header: {
        config: {
          provider: 'logged-provider',
          model: 'logged-model',
          maxTokens: 777,
        },
        adapterDefaults: { maxTokens: true },
      },
      reason: 'initial',
    })

    expect(resolveBranchAgentOptionsRc7(session.events, {
      provider: 'stale-provider',
      model: 'stale-model',
      maxTokens: 123,
    })).toEqual({
      provider: 'logged-provider',
      model: 'logged-model',
    })

    session.append('request/header', {
      header: {
        config: {
          provider: 'selected-provider',
          model: 'selected-model',
          maxTokens: 456,
        },
      },
      reason: 'change',
    })
    expect(resolveBranchAgentOptionsRc7(session.events)).toEqual({
      provider: 'selected-provider',
      model: 'selected-model',
      maxTokens: 456,
    })
  })

  it('uses a durable client request id for idempotent Host-side delivery', () => {
    const branchHandle = handle()
    const messageId = submitBranchTurnRc7(
      branchHandle.agent,
      'Explain this part of the answer.',
      'request-continue-1',
    )

    expect(messageId).toBe('request-continue-1')
    expect(branchHandle.agent.followup).toHaveBeenCalledWith(expect.objectContaining({
      id: 'request-continue-1',
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Explain this part of the answer.' }],
    }))
  })
})
