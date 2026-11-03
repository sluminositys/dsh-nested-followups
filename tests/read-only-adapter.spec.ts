import type { Context } from '@deepseek-ai/cordis'
import type {
  Agent,
  AgentHandle,
  AgentOptions,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'

import {
  applyReadOnlyScopeRc7,
  createReadOnlyBranchSetup,
  createReadOnlyForkAgent,
  probeReadOnlyCapabilityRc7,
  readOnlyBranchGuard,
  resolveBranchAgentOptionsRc7,
  resolveSourcePresetRc7,
  resumeReadOnlyBranchAgentRc7,
  submitBranchTurnRc7,
  type BranchAgentRegistry,
} from '../src/host/adapter/read-only.ts'
import {
  snapshotSessionEvents,
  usesInheritedEventCount,
} from '../src/host/adapter/session-compat.ts'

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

/** 0.2.2 splits the real native executor from the registry; older hosts include it. */
async function mountNativeExecutor(ctx: Context): Promise<() => Promise<void>> {
  if (typeof (ctx.tools as unknown as { setExecutor?: unknown }).setExecutor !== 'function') {
    return async () => {}
  }
  const specifier = '@deepseek-ai/dsh-tool-executor-native'
  const native = await import(specifier) as { name: string; inject: string[]; apply(ctx: Context): void }
  const fiber = ctx.plugin(native)
  await fiber
  return () => fiber.dispose()
}

/** Exercise the host's real execution path, not a fake guard or executor. */
async function executeTool(ctx: Context, agent: Agent, name: string): Promise<{ content: readonly unknown[] }> {
  type Outcome = { content: readonly unknown[] }
  const tools = ctx.tools as unknown as {
    setExecutor?: unknown
    execute(input: unknown): Promise<Outcome | { results: readonly { result: Outcome }[] }>
  }
  const signal = new AbortController().signal
  const callId = `${name}-call`
  const result = await tools.execute(typeof tools.setExecutor === 'function'
    ? { agent, signal, calls: [{ type: 'tool-call', id: callId, name, arguments: '{}' }] }
    : { agent, signal, callId, name, arguments: {} })
  if (!('results' in result)) return result
  const first = result.results[0]
  if (first === undefined) throw new Error('the native executor returned no tool result')
  return first.result
}

function compatibleHeader(
  id: string,
  fields: Record<string, unknown> = {},
): SessionHeader {
  const generation = Session.create(SessionId(`header-probe-${id}`)).header as unknown as {
    readonly isSeeded?: boolean
  }
  return {
    version: 1,
    id: SessionId(id),
    createdAt: 1,
    ...(typeof generation.isSeeded === 'boolean' ? { isSeeded: false } : {}),
    ...fields,
  } as unknown as SessionHeader
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
    const disposeExecutor = await mountNativeExecutor(ctx)
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
    await disposeExecutor()
    await toolsFiber.dispose()
    await systemPromptFiber.dispose()
  })

  it('executes a read tool and denies a mutating one on the real host runtime', async () => {
    const ctx = new (await import('@deepseek-ai/cordis')).Context()
    const systemPromptFiber = ctx.plugin(SystemPrompt, { toolOrder: ['<unlisted-tools>'] })
    await systemPromptFiber
    const toolsFiber = ctx.plugin(ToolRuntime)
    await toolsFiber
    const disposeExecutor = await mountNativeExecutor(ctx)
    ctx.tools.register(readTool('read'))
    const write = vi.fn(async () => 'write ran')
    ctx.tools.register({ ...readTool('write'), execute: write })

    const key = { id: SessionId('read-only-agent') } as Agent
    let scope!: ReturnType<typeof createScope>
    const minter = ctx.plugin(Object.assign((inner: Context) => {
      scope = createScope(inner, key)
    }, { inject: ['tools', 'systemPrompt'] }))
    await minter
    applyReadOnlyScopeRc7(scope.ctx)

    const allowed = await executeTool(ctx, key, 'read')
    expect(allowed.content).toEqual([
      expect.objectContaining({ type: 'text', text: 'read ran' }),
    ])

    const denied = await executeTool(ctx, key, 'write')
    expect(denied.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('read-only') }),
    ])
    expect(write).not.toHaveBeenCalled()

    await scope.dispose()
    await minter.dispose()
    await disposeExecutor()
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
    const header = compatibleHeader('root', {
      agentPreset: 'creation-preset',
    })
    expect(resolveSourcePresetRc7(header, [])).toBe('creation-preset')

    const switched = [{
      seq: 0,
      type: 'agent-preset/selected',
      data: { agentPreset: 'switched-preset' },
    }] as unknown as SessionEvent[]
    expect(resolveSourcePresetRc7(header, switched)).toBe('switched-preset')

    const noPreset = compatibleHeader('root')
    expect(resolveSourcePresetRc7(noPreset, [])).toBeUndefined()
  })

  it('applies the identical read-only composition to the first round and a cold Continue round', async () => {
    const branchHandle = handle()
    const create = vi.fn(async (_options: CreateAgentOptions) => branchHandle)
    const resume = vi.fn(async (_options: ResumeAgentOptions) => branchHandle)
    const agents = { get: vi.fn(), create, resume } as unknown as BranchAgentRegistry
    const hostCtx = { get: () => undefined } as unknown as Context
    const header = compatibleHeader('root', {
      cwd: 'D:\\workspace\\project',
      agentPreset: 'engineering',
    })
    const seed = [] as SessionEvent[]
    const fallbackAgentOptions = { provider: 'mock-provider', model: 'mock-model', maxTokens: 321 }

    await createReadOnlyForkAgent(hostCtx, agents, {
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
      origin: 'subagent',
      agentPreset: 'engineering',
    })
    if (usesInheritedEventCount(header)) {
      expect(createOptions?.meta).toMatchObject({ isSeeded: true })
      expect((createOptions as unknown as { inheritedEventCount?: number })?.inheritedEventCount)
        .toBe(0)
    } else {
      expect(createOptions?.meta).toMatchObject({ seedLength: 0 })
    }
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

    expect(resolveBranchAgentOptionsRc7(snapshotSessionEvents(session), {
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
    expect(resolveBranchAgentOptionsRc7(snapshotSessionEvents(session))).toEqual({
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

  it('preserves explicit reasoning effort from legacy-history agent options', () => {
    const options = { provider: 'p', model: 'm', reasoningEffort: 'high' } as AgentOptions
    expect(resolveBranchAgentOptionsRc7([], options)).toEqual(options)
  })

  it.each([false, true])('preserves reasoning effort without freezing adapter defaults: %s', (defaulted) => {
    const events = [{ seq: 0, time: 1, type: 'request/header', data: {
      reason: 'initial',
      header: {
        config: { provider: 'p', model: 'm', reasoningEffort: 'high' },
        ...(defaulted ? { adapterDefaults: { reasoningEffort: true } } : {}),
      },
    } }] as unknown as SessionEvent[]
    expect(resolveBranchAgentOptionsRc7(events)).toEqual({
      provider: 'p', model: 'm', ...(defaulted ? {} : { reasoningEffort: 'high' }),
    })
  })
})
