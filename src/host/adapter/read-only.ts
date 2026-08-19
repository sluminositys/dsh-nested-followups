import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions, AgentRegistry } from '@deepseek-ai/dsh-agent'
import { createUserMessage, freezeMessage, MessageId } from '@deepseek-ai/dsh-llm'
import {
  foldRequestHeader,
  type SessionEvent,
  type SessionHeader,
  type SessionId,
} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { isBranchExecutableTool } from '../../shared/tool-policy.ts'
import { hiddenBranchMetaRc7 } from './visibility.ts'

/** Stable compatibility failure used when rc.7 cannot gate branch tool execution. */
export class ReadOnlyCapabilityError extends Error {
  constructor(message = 'DSH does not expose the Agent-scoped tool guard required for read-only branches') {
    super(message)
    this.name = 'ReadOnlyCapabilityError'
  }
}

export interface ReadOnlyCapability {
  readonly supported: boolean
  readonly reason?: string
}

export interface ReadOnlyForkInput {
  readonly sessionId: SessionId
  readonly sourceHeader: SessionHeader
  readonly seed: readonly SessionEvent[]
  readonly fallbackAgentOptions?: AgentOptions
}

export interface ReadOnlyResumeInput {
  readonly sessionId: SessionId
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly fallbackAgentOptions?: AgentOptions
}

export type BranchAgentRegistry = Pick<AgentRegistry, 'get' | 'create' | 'resume'>

const DENIAL = 'Nested follow-up branches are read-only: this tool would change state outside the branch. '
  + 'Answer from the conversation and any files you have read instead.'

/** Monotonic denial of every non-read tool, evaluated per call at execution time. */
export function readOnlyBranchGuard(execution: Readonly<ToolExecution>): string | undefined {
  return isBranchExecutableTool(execution.name) ? undefined : DENIAL
}

/**
 * Recover the route that was actually in force at a fork/resume boundary.
 *
 * The Web surface can change its model without mutating `Agent.options`, so the
 * latest durable request header is authoritative. Adapter-derived output caps
 * remain defaults instead of becoming explicit child settings. A live Agent's
 * options are only a fallback for a valid completed history predating request
 * header snapshots.
 */
export function resolveBranchAgentOptionsRc7(
  events: readonly SessionEvent[],
  fallback: AgentOptions = {},
): AgentOptions {
  const header = foldRequestHeader(events)
  if (header === undefined) {
    return {
      ...fallback.provider === undefined ? {} : { provider: fallback.provider },
      ...fallback.model === undefined ? {} : { model: fallback.model },
      ...fallback.maxTokens === undefined ? {} : { maxTokens: fallback.maxTokens },
    }
  }
  return {
    provider: header.config.provider,
    model: header.config.model,
    ...header.config.maxTokens === undefined || header.adapterDefaults?.maxTokens === true
      ? {}
      : { maxTokens: header.config.maxTokens },
  }
}

/**
 * Resolve the preset composition a session's history was produced under.
 *
 * Mirrors the official `resolveSessionPreset`: a blank session that switched
 * preset logs the change, so the log outranks the creation header. Read
 * structurally rather than through a hard dependency, because a deployment
 * composing no presets never loads that package.
 */
export function resolveSourcePresetRc7(
  header: SessionHeader,
  events: readonly SessionEvent[],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined) continue
    if ((event as { type: string }).type !== 'agent-preset/selected') continue
    const data = (event as { data?: { agentPreset?: unknown } }).data
    if (typeof data?.agentPreset === 'string') return data.agentPreset
  }
  return header.agentPreset
}

/**
 * Probe only the public rc.7 surfaces the plugin relies on. Absence blocks
 * mutations while leaving the read-only tree projection usable.
 */
export function probeReadOnlyCapabilityRc7(ctx: Context): ReadOnlyCapability {
  const agents = ctx.get('agents')
  if (agents === undefined
    || typeof agents.get !== 'function'
    || typeof agents.create !== 'function'
    || typeof agents.resume !== 'function') {
    return { supported: false, reason: 'The DSH Agent registry is unavailable.' }
  }
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools.guard !== 'function') {
    return { supported: false, reason: 'Agent-scoped tool guards are unavailable.' }
  }
  return { supported: true }
}

/**
 * Install the branch's execution gate.
 *
 * Only a guard is installed. Restricting the visible tool set, overriding the
 * presentation transport, or editing the assembled prompt would all change the
 * request prefix and forfeit the provider's cache of the mainline prefix the
 * branch was forked from — so every limitation lives at execution time
 * instead, where it costs nothing before the first token.
 */
export function applyReadOnlyScopeRc7(agentCtx: Context): void {
  const tools = agentCtx.get('tools')
  if (tools === undefined) throw new ReadOnlyCapabilityError()
  tools.guard(readOnlyBranchGuard)
}

/**
 * Compose a branch scope that matches the mainline byte for byte, then gate it.
 *
 * Joining the source session's preset is what keeps the assembled prefix
 * identical; the guard added afterwards is invisible to prompt assembly.
 */
export function createReadOnlyBranchSetup(
  ctx: Context,
  presetId: string | undefined,
): (agentCtx: Context) => Promise<void> {
  return async (agentCtx: Context): Promise<void> => {
    const presets = ctx.get('agentPresets')
    if (presets !== undefined) await presets.mount(agentCtx, presetId)
    applyReadOnlyScopeRc7(agentCtx)
  }
}

/** Create one fork-seeded, origin-classified Agent without using apiproxy. */
export function createReadOnlyForkAgentRc7(
  ctx: Context,
  agents: BranchAgentRegistry,
  input: ReadOnlyForkInput,
): Promise<AgentHandle> {
  const presetId = resolveSourcePresetRc7(input.sourceHeader, input.seed)
  return agents.create({
    sessionId: input.sessionId,
    seed: input.seed,
    meta: hiddenBranchMetaRc7(input.sourceHeader, input.seed.length, presetId),
    agentOptions: resolveBranchAgentOptionsRc7(input.seed, input.fallbackAgentOptions),
    setup: createReadOnlyBranchSetup(ctx, presetId),
  })
}

/** Resume a cold branch through the same composition it was born under. */
export function resumeReadOnlyBranchAgentRc7(
  ctx: Context,
  agents: BranchAgentRegistry,
  input: ReadOnlyResumeInput,
): Promise<AgentHandle> {
  const presetId = resolveSourcePresetRc7(input.header, input.events)
  return agents.resume({
    resumeSessionId: input.sessionId,
    agentOptions: resolveBranchAgentOptionsRc7(input.events, input.fallbackAgentOptions),
    setup: createReadOnlyBranchSetup(ctx, presetId),
  })
}

/** Submit an ordinary user-authored turn directly to the live branch Agent. */
export function submitBranchTurnRc7(
  agent: Agent,
  question: string,
  durableMessageId?: string,
): string {
  if (question.trim().length === 0) throw new TypeError('branch question must not be empty')
  const message = durableMessageId === undefined
    ? createUserMessage({
      content: [{ type: 'text', text: question }],
      source: { kind: 'user' },
    })
    : freezeMessage({
      id: MessageId(durableMessageId),
      role: 'user' as const,
      content: [{ type: 'text' as const, text: question }],
      source: { kind: 'user' as const },
    })
  agent.followup(message)
  return String(message.id)
}
