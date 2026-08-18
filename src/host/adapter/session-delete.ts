import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'

export const SESSION_DELETE_METHOD = 'deleteSession' as const
export const SESSION_ARCHIVE_METHOD = 'archiveSession' as const

export type SessionCleanupMode = 'delete' | 'archive'

export type SessionDeletionCapability =
  | {
    readonly supported: true
    readonly mode: SessionCleanupMode
    readonly method: typeof SESSION_DELETE_METHOD | typeof SESSION_ARCHIVE_METHOD
  }
  | {
    readonly supported: false
    readonly reason: string
  }

export interface SessionCleanupAdapter {
  readonly mode: SessionCleanupMode
  cleanup(sessionId: string): Promise<void>
}

interface FutureSessionPersistence {
  [SESSION_DELETE_METHOD]?: (sessionId: string) => Promise<void>
  readonly capabilities?: {
    readonly sessionDeletion?: {
      readonly version?: number
    }
  }
}

interface Rc7WorkspaceRegistry {
  [SESSION_ARCHIVE_METHOD]?: (sessionId: SessionId) => Promise<void>
}

/**
 * Prefer an explicitly advertised physical-delete contract. Unmodified rc.7
 * falls back to its public, durable WorkspaceRegistry archive operation, as
 * required by the product specification.
 */
export function probeSessionDeletionCapability(ctx: Context): SessionDeletionCapability {
  const persistence = ctx.get('sessionPersistence') as FutureSessionPersistence | undefined
  if (typeof persistence?.[SESSION_DELETE_METHOD] === 'function'
    && persistence.capabilities?.sessionDeletion?.version === 1) {
    return { supported: true, mode: 'delete', method: SESSION_DELETE_METHOD }
  }
  const registry = ctx.get('workspaceRegistry') as Rc7WorkspaceRegistry | undefined
  if (typeof registry?.[SESSION_ARCHIVE_METHOD] === 'function') {
    return { supported: true, mode: 'archive', method: SESSION_ARCHIVE_METHOD }
  }
  return {
    supported: false,
    reason: 'This DSH build exposes neither physical Session deletion nor the official archive operation.',
  }
}

export function createSessionCleanupAdapter(ctx: Context): SessionCleanupAdapter | undefined {
  const capability = probeSessionDeletionCapability(ctx)
  if (!capability.supported) return undefined
  if (capability.mode === 'delete') {
    const persistence = ctx.get('sessionPersistence') as FutureSessionPersistence
    return {
      mode: 'delete',
      cleanup: async (sessionId) => {
        await persistence[SESSION_DELETE_METHOD]!(sessionId)
      },
    }
  }
  const registry = ctx.get('workspaceRegistry') as Rc7WorkspaceRegistry
  return {
    mode: 'archive',
    cleanup: async (sessionId) => {
      await registry[SESSION_ARCHIVE_METHOD]!(SessionId(sessionId))
    },
  }
}
