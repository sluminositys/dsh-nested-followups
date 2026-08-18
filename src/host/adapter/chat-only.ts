import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentRegistry } from '@deepseek-ai/dsh-agent'
import { createUserMessage, freezeMessage, MessageId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'

/** Stable compatibility failure used when rc.7 cannot enforce an empty tool surface. */
export class ChatOnlyCapabilityError extends Error {
  constructor(message = 'DSH does not expose the Agent-scoped tool controls required for chat-only branches') {
    super(message)
    this.name = 'ChatOnlyCapabilityError'
  }
}

export interface ChatOnlyCapability {
  readonly supported: boolean
  readonly reason?: string
}

export interface ChatOnlyForkInput {
  readonly sessionId: SessionId
  readonly sourceHeader: SessionHeader
  readonly seed: readonly SessionEvent[]
}

export type BranchAgentRegistry = Pick<AgentRegistry, 'get' | 'create' | 'resume'>

const TOOL_DENIAL = 'Nested follow-up branches are chat-only; tool execution is disabled.'

/**
 * Probe only the public rc.7 surfaces the plugin relies on. Absence blocks
 * mutations while leaving the read-only tree projection usable.
 */
export function probeChatOnlyCapabilityRc7(ctx: Context): ChatOnlyCapability {
  const agents = ctx.get('agents')
  if (agents === undefined
    || typeof agents.get !== 'function'
    || typeof agents.create !== 'function'
    || typeof agents.resume !== 'function') {
    return { supported: false, reason: 'The DSH Agent registry is unavailable.' }
  }
  const tools = ctx.get('tools')
  if (tools === undefined
    || typeof tools.presentAs !== 'function'
    || typeof tools.restrict !== 'function'
    || typeof tools.guard !== 'function') {
    return { supported: false, reason: 'Agent-scoped tool restrictions are unavailable.' }
  }
  return { supported: true }
}

/**
 * Install a defence-in-depth chat-only scope before an Agent is published.
 *
 * - native presentation removes the reserved Code Mode transport;
 * - an empty allowlist removes every global tool schema;
 * - the guard rejects any scope-local tool registered by another plugin.
 * - the final prompt-assembly hook strips any schema that escaped those
 *   registration-time controls.
 *
 * The plugin deliberately does not call the subagent continuation runtime, so
 * rc.7's report tool and descriptor are never installed.
 */
export function applyChatOnlyScopeRc7(agentCtx: Context): void {
  const tools = agentCtx.get('tools')
  if (tools === undefined) throw new ChatOnlyCapabilityError()
  tools.presentAs('native')
  tools.restrict({ allow: [] })
  tools.guard(() => TOOL_DENIAL)
  agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    return { ...assembled, tools: [] }
  })
}

/** Create one fork-seeded, origin-classified Agent without using apiproxy. */
export function createChatOnlyForkAgentRc7(
  agents: BranchAgentRegistry,
  input: ChatOnlyForkInput,
): Promise<AgentHandle> {
  return agents.create({
    sessionId: input.sessionId,
    seed: input.seed,
    meta: {
      ...(input.sourceHeader.cwd === undefined ? {} : { cwd: input.sourceHeader.cwd }),
      parentSession: input.sourceHeader.id,
      seedLength: input.seed.length,
      origin: 'subagent',
    },
    setup: applyChatOnlyScopeRc7,
  })
}

/** Resume a cold branch through the same chat-only composition used at birth. */
export function resumeChatOnlyBranchAgentRc7(
  agents: BranchAgentRegistry,
  sessionId: SessionId,
): Promise<AgentHandle> {
  return agents.resume({
    resumeSessionId: sessionId,
    setup: applyChatOnlyScopeRc7,
  })
}

/** Submit an ordinary user-authored turn directly to the live branch Agent. */
export function submitChatOnlyTurnRc7(
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
