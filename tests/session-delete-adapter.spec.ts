import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import {
  SESSION_DELETE_METHOD,
  probeSessionDeletionCapability,
} from '../src/host/adapter/session-delete.ts'

function contextWith(persistence: unknown): Context {
  return {
    get: vi.fn((name: string) => name === 'sessionPersistence' ? persistence : undefined),
  } as unknown as Context
}

describe('physical Session deletion probe', () => {
  it('reports unmodified rc.7 as unsupported and never substitutes archive', () => {
    expect(probeSessionDeletionCapability(contextWith({}))).toEqual({
      supported: false,
      method: SESSION_DELETE_METHOD,
      reason: 'This DSH build has no public physical Session deletion capability; archive is not used as a fallback.',
    })
  })

  it('does not enable an unadvertised method-shaped property', () => {
    expect(probeSessionDeletionCapability(contextWith({
      deleteSession: vi.fn(),
    })).supported).toBe(false)
  })

  it('requires an explicit v1 capability and a callable method', () => {
    expect(probeSessionDeletionCapability(contextWith({
      deleteSession: vi.fn(),
      capabilities: { sessionDeletion: { version: 1 } },
    }))).toEqual({
      supported: true,
      method: SESSION_DELETE_METHOD,
    })
  })
})
