import type { Context } from '@deepseek-ai/cordis'

export const SESSION_DELETE_METHOD = 'deleteSession' as const

export interface SessionDeletionCapability {
  readonly supported: boolean
  readonly method: typeof SESSION_DELETE_METHOD
  readonly reason?: string
}

interface FutureSessionPersistence {
  [SESSION_DELETE_METHOD]?: (sessionId: string) => Promise<void>
  readonly capabilities?: {
    readonly sessionDeletion?: {
      readonly version?: number
    }
  }
}

/**
 * rc.7 has no public physical Session deletion API. Archive is deliberately
 * not considered a substitute. A future API must advertise an explicit v1
 * capability as well as the deletion method before the plugin enables it.
 */
export function probeSessionDeletionCapability(ctx: Context): SessionDeletionCapability {
  const persistence = ctx.get('sessionPersistence') as FutureSessionPersistence | undefined
  if (typeof persistence?.[SESSION_DELETE_METHOD] === 'function'
    && persistence.capabilities?.sessionDeletion?.version === 1) {
    return { supported: true, method: SESSION_DELETE_METHOD }
  }
  return {
    supported: false,
    method: SESSION_DELETE_METHOD,
    reason: 'This DSH build has no public physical Session deletion capability; archive is not used as a fallback.',
  }
}
