import {
  SessionForkError,
  type Session,
  type SessionEvent,
  type SessionForkSource,
  type SessionId,
  type SessionStore,
} from '@deepseek-ai/dsh-session'
import { hiddenBranchMetaRc7 } from './visibility.ts'

/**
 * rc.7 equivalent of SessionStore's private `_forkSeed` method. Keep this
 * adapter isolated so a later DSH release can replace it with a public API.
 */
export function selectForkSeedRc7(
  sessionId: SessionId,
  events: readonly SessionEvent[],
  requestedBoundary: number | undefined,
): SessionEvent[] {
  const lastEvent = events.at(-1)
  let boundary: number
  if (requestedBoundary !== undefined) {
    boundary = requestedBoundary
  } else {
    if (lastEvent === undefined) return []
    boundary = lastEvent.seq
  }

  if (!Number.isSafeInteger(boundary) || boundary < 0) {
    throw new SessionForkError(
      `fork boundary for session "${sessionId}" must be a non-negative safe integer, got ${String(boundary)}`,
      'INVALID_BOUNDARY',
    )
  }
  if (boundary >= events.length) {
    const lastSeq = events.at(-1)?.seq
    throw new SessionForkError(
      `fork boundary ${boundary} does not exist in session "${sessionId}" (last seq: ${lastSeq ?? 'none'})`,
      'INVALID_BOUNDARY',
    )
  }

  const boundaryEvent = events[boundary]
  if (boundaryEvent === undefined || boundaryEvent.seq !== boundary) {
    throw new SessionForkError(
      `fork boundary ${boundary} does not match a contiguous event seq in session "${sessionId}"`,
      'INVALID_BOUNDARY',
    )
  }
  const lastTurnBoundary = events.slice(0, boundary + 1)
    .findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
  if (lastTurnBoundary?.type === 'turn/start') {
    throw new SessionForkError(
      `fork boundary ${boundary} in session "${sessionId}" ends inside open turn ${lastTurnBoundary.data.turn}`,
      'OPEN_TURN',
    )
  }

  return events.slice(0, boundary + 1)
}

function resolveLiveSourceRc7(
  sessions: SessionStore,
  source: SessionForkSource,
): Session {
  if (typeof source === 'string') {
    const session = sessions.get(source)
    if (session === undefined) {
      throw new SessionForkError(`session "${source}" not found`, 'SESSION_NOT_FOUND')
    }
    return session
  }

  const live = sessions.get(source.id)
  if (live === undefined) {
    throw new SessionForkError(`session "${source.id}" not found`, 'SESSION_NOT_FOUND')
  }
  if (live !== source) {
    throw new SessionForkError(
      `session "${source.id}" is not the live store instance`,
      'SESSION_NOT_LIVE',
    )
  }
  return source
}

/**
 * Create a fork-equivalent child whose immutable header is classified as a
 * subagent. SessionStore.fork cannot carry `origin` in rc.7.
 */
export function createSubagentForkRc7(
  sessions: SessionStore,
  source: SessionForkSource,
  boundary?: number,
  childSessionId?: SessionId,
): Session {
  if (childSessionId !== undefined && sessions.get(childSessionId) !== undefined) {
    throw new SessionForkError(
      `session "${childSessionId}" already exists`,
      'SESSION_ALREADY_EXISTS',
    )
  }
  const liveSource = resolveLiveSourceRc7(sessions, source)
  const seed = selectForkSeedRc7(liveSource.id, liveSource.events, boundary)
  return sessions.create(childSessionId, {
    seed,
    meta: hiddenBranchMetaRc7(liveSource.header, seed.length),
  })
}
