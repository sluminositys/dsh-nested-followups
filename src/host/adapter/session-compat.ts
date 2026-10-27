import type {
  Session,
  SessionEvent,
  SessionHeader,
  SessionId,
} from '@deepseek-ai/dsh-session'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'

/**
 * DSH 0.1.1 exposes a cached `events` snapshot and stores the inherited fork
 * length in `SessionHeader.seedLength`. DSH 0.1.2 moves both capabilities onto
 * Session itself (`snapshotEvents()` and `inheritedEventCount`). Keep that
 * transition at this boundary so the rest of the plugin can retain one tree
 * and BranchRecord vocabulary.
 */

interface SnapshotSessionShape {
  readonly snapshotEvents?: () => readonly SessionEvent[]
  readonly events?: readonly SessionEvent[]
  readonly inheritedEventCount?: number
}

interface VersionedHeaderShape {
  readonly isSeeded?: boolean
  readonly seedLength?: number
}

export interface PersistedSessionShape {
  readonly meta: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly inheritedEventCount?: number
}

interface PersistenceReadShape {
  readFrom?: (sessionId: SessionId, fromSeq: number) => Promise<PersistedSessionShape>
  open?: (sessionId: SessionId, access: 'read') => Promise<{
    readonly header: SessionHeader
    readonly inheritedEventCount: number
    read(fromSeq: number): Promise<{ readonly events: readonly SessionEvent[] }>
    close(): Promise<void>
  }>
  listSnapshots?: () => Promise<readonly SessionPersistenceSnapshot[]>
  list?: () => Promise<readonly SessionPersistenceSnapshot[]>
}

function safeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`)
  }
  return value as number
}

/** Return a detached event snapshot on either supported Session API. */
export function snapshotSessionEvents(session: Session): readonly SessionEvent[] {
  const compatible = session as unknown as SnapshotSessionShape
  if (typeof compatible.snapshotEvents === 'function') {
    return compatible.snapshotEvents()
  }
  if (Array.isArray(compatible.events)) return compatible.events
  throw new TypeError('The DSH Session does not expose a readable event snapshot API.')
}

/** Whether this header belongs to the 0.1.2 seeded-session contract. */
export function usesInheritedEventCount(header: SessionHeader): boolean {
  return typeof (header as unknown as VersionedHeaderShape).isSeeded === 'boolean'
}

/** Resolve the branch cut represented by a live Session, if it is seeded. */
export function sessionSeedLength(session: Session): number | undefined {
  const header = session.header as unknown as VersionedHeaderShape
  if (typeof header.seedLength === 'number') {
    return safeCount(header.seedLength, 'SessionHeader.seedLength')
  }
  if (header.isSeeded !== true) return undefined
  return safeCount(
    (session as unknown as SnapshotSessionShape).inheritedEventCount,
    'Session.inheritedEventCount',
  )
}

/** Resolve the branch cut represented by a persistence inspection/read. */
export function persistedSeedLength(stored: PersistedSessionShape): number | undefined {
  const header = stored.meta as unknown as VersionedHeaderShape
  if (typeof header.seedLength === 'number') {
    return safeCount(header.seedLength, 'SessionHeader.seedLength')
  }
  if (header.isSeeded !== true) return undefined
  return safeCount(stored.inheritedEventCount, 'SessionInspection.inheritedEventCount')
}

/**
 * Invoke SessionPersistence.readFrom without importing either generation's
 * offset type. The 0.1.2 brand is runtime-compatible with the rc numeric seq.
 */
export async function readPersistedSessionFrom(
  persistence: unknown,
  sessionId: SessionId,
  fromSeq: number,
): Promise<PersistedSessionShape> {
  safeCount(fromSeq, 'session log offset')
  const compatible = persistence as PersistenceReadShape
  if (typeof compatible.open === 'function') {
    const handle = await compatible.open(sessionId, 'read')
    try {
      const slice = await handle.read(fromSeq)
      return {
        meta: handle.header,
        inheritedEventCount: handle.inheritedEventCount,
        events: slice.events,
      }
    } finally {
      await handle.close()
    }
  }
  if (typeof compatible.readFrom === 'function') return compatible.readFrom(sessionId, fromSeq)
  throw new TypeError('The DSH Session persistence service cannot read a log suffix.')
}

/** Read headers without claiming write ownership or loading cold agents. */
export function listPersistedSessions(persistence: unknown): Promise<readonly SessionPersistenceSnapshot[]> {
  const compatible = persistence as PersistenceReadShape
  if (typeof compatible.listSnapshots === 'function') return compatible.listSnapshots()
  if (typeof compatible.list === 'function') return compatible.list()
  throw new TypeError('The DSH Session persistence service cannot list session headers.')
}
