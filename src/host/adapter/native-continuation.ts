import type { Context } from '@deepseek-ai/cordis'

/** Proposed upstream method name; see the repository-external proposal draft. */
export const CHAT_ONLY_CONTINUATION_METHOD = 'startChatOnlyContinuableAtBoundary' as const

export interface NativeContinuationCapability {
  readonly supported: boolean
  readonly method: typeof CHAT_ONLY_CONTINUATION_METHOD
  readonly reason?: string
}

interface FutureSubagentRuntime {
  [CHAT_ONLY_CONTINUATION_METHOD]?: (...args: unknown[]) => unknown
  readonly capabilities?: {
    readonly chatOnlyBoundaryContinuation?: {
      readonly version?: number
      readonly nativeUserDelivery?: boolean
    }
  }
}

/**
 * One isolated feature probe for a future DSH upstream capability. rc.7
 * intentionally returns unsupported. Business code must not inspect private
 * subagent fields or guess from the release string.
 */
export function probeNativeContinuationCapability(
  ctx: Context,
): NativeContinuationCapability {
  const get = (ctx as unknown as { get(name: string): unknown }).get.bind(ctx)
  const runtime = get('subagents') as FutureSubagentRuntime | undefined
  const capability = runtime?.capabilities?.chatOnlyBoundaryContinuation
  if (typeof runtime?.[CHAT_ONLY_CONTINUATION_METHOD] === 'function'
    && capability?.version === 1
    && capability.nativeUserDelivery === true) {
    return { supported: true, method: CHAT_ONLY_CONTINUATION_METHOD }
  }
  return {
    supported: false,
    method: CHAT_ONLY_CONTINUATION_METHOD,
    reason: typeof runtime?.[CHAT_ONLY_CONTINUATION_METHOD] === 'function'
      ? 'This DSH build cannot deliver native user turns to chat-only boundary branches.'
      : 'This DSH build has no chat-only continuable subagent boundary API.',
  }
}
