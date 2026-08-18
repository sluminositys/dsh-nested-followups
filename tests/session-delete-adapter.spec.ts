import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import {
  createSessionCleanupAdapter,
  SESSION_ARCHIVE_METHOD,
  SESSION_DELETE_METHOD,
  probeSessionDeletionCapability,
} from '../src/host/adapter/session-delete.ts'

function contextWith(persistence: unknown, workspaceRegistry?: unknown): Context {
  return {
    get: vi.fn((name: string) => name === 'sessionPersistence'
      ? persistence
      : name === 'workspaceRegistry'
        ? workspaceRegistry
        : undefined),
  } as unknown as Context
}

describe('branch Session cleanup probe', () => {
  it('uses the public rc.7 archive operation when physical deletion is unavailable', async () => {
    const archiveSession = vi.fn(async () => {})
    const ctx = contextWith({}, { archiveSession })
    expect(probeSessionDeletionCapability(ctx)).toEqual({
      supported: true,
      mode: 'archive',
      method: SESSION_ARCHIVE_METHOD,
    })
    await createSessionCleanupAdapter(ctx)!.cleanup('branch-session')
    expect(archiveSession).toHaveBeenCalledWith('branch-session')
  })

  it('reports a composition without either official cleanup operation as unsupported', () => {
    expect(probeSessionDeletionCapability(contextWith({}))).toEqual({
      supported: false,
      reason: 'This DSH build exposes neither physical Session deletion nor the official archive operation.',
    })
  })

  it('does not enable an unadvertised physical-delete-shaped property', () => {
    expect(probeSessionDeletionCapability(contextWith({
      deleteSession: vi.fn(),
    })).supported).toBe(false)
  })

  it('prefers an explicit v1 physical deletion contract over archive', () => {
    expect(probeSessionDeletionCapability(contextWith({
      deleteSession: vi.fn(),
      capabilities: { sessionDeletion: { version: 1 } },
    }, { archiveSession: vi.fn() }))).toEqual({
      supported: true,
      mode: 'delete',
      method: SESSION_DELETE_METHOD,
    })
  })
})
