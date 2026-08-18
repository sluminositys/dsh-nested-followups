import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import {
  CHAT_ONLY_CONTINUATION_METHOD,
  probeNativeContinuationCapability,
} from '../src/host/adapter/native-continuation.ts'

function contextWith(service: unknown): Context {
  return {
    get: vi.fn((name: string) => name === 'subagents' ? service : undefined),
  } as unknown as Context
}

describe('future native continuation probe', () => {
  it('reports unmodified rc.7 as unsupported without inspecting private fields', () => {
    expect(probeNativeContinuationCapability(contextWith({}))).toEqual({
      supported: false,
      method: CHAT_ONLY_CONTINUATION_METHOD,
      reason: 'This DSH build has no chat-only continuable subagent boundary API.',
    })
  })

  it('does not mistake creation-only support for complete native continuation', () => {
    const method = vi.fn()
    expect(probeNativeContinuationCapability(contextWith({
      [CHAT_ONLY_CONTINUATION_METHOD]: method,
    }))).toEqual({
      supported: false,
      method: CHAT_ONLY_CONTINUATION_METHOD,
      reason: 'This DSH build cannot deliver native user turns to chat-only boundary branches.',
    })
  })

  it('recognizes the proposed method only with native user delivery v1', () => {
    const method = vi.fn()
    expect(probeNativeContinuationCapability(contextWith({
      [CHAT_ONLY_CONTINUATION_METHOD]: method,
      capabilities: {
        chatOnlyBoundaryContinuation: { version: 1, nativeUserDelivery: true },
      },
    }))).toEqual({
      supported: true,
      method: CHAT_ONLY_CONTINUATION_METHOD,
    })
  })
})
