import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'

import type { BranchRecord } from '../../shared/types.ts'
import { resolveBranchBoundary } from '../safe-boundary.ts'

export interface BranchSessionHistory {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly seedLength?: number
}

/** Stable conversation identities survive format migrations; numeric seq does not. */
function surfaceIdentities(events: readonly SessionEvent[]): readonly string[] {
  return events.flatMap(event => {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      return [`user:${String(event.data.id)}`]
    }
    if (event.type === 'assistant/message') return [`assistant:${String(event.data.message.id)}`]
    if (event.type === 'tool/result') return [`tool:${String(event.data.message.id)}`]
    return []
  })
}

/**
 * Reconcile old plugin coordinates against DSH's current, authoritative log.
 * The returned record is a read model only: never persist these coordinates
 * over the source record, which must remain usable with the original host.
 */
export function resolveBranchHistory(
  branch: BranchRecord,
  child: BranchSessionHistory,
  parent?: BranchSessionHistory,
): BranchRecord {
  if (String(child.header.id) !== branch.sessionId
    || child.header.origin !== 'subagent'
    || String(child.header.parentSession) !== branch.parentSessionId) {
    throw new Error(`session '${branch.sessionId}' does not match its immutable branch lineage`)
  }
  const cut = child.seedLength
  if (!Number.isSafeInteger(cut) || cut === undefined || cut < 0 || cut > child.events.length) {
    throw new Error(`session '${branch.sessionId}' has no valid inherited history boundary`)
  }
  const anchor = parent?.events.find(event =>
    event.type === 'assistant/message' && String(event.data.message.id) === branch.anchorMessageId)
  const unchanged = cut === branch.seedLength && anchor?.seq === branch.anchorSeq
  if (parent === undefined && cut === branch.seedLength) return branch

  if (!unchanged && (Number(child.header.version) === 0 || Number(parent?.header.version) === 0)) {
    throw new Error('a legacy format boundary mismatch cannot be treated as a format migration')
  }
  if (parent === undefined || String(parent.header.id) !== branch.parentSessionId
    || branch.anchorSessionId !== branch.parentSessionId) {
    throw new Error(`parent history for branch '${branch.branchId}' is unavailable`)
  }
  const boundary = resolveBranchBoundary(parent.events, branch.anchorMessageId)
  if (boundary.anchorMessageId !== branch.anchorMessageId) {
    throw new Error(`branch '${branch.branchId}' no longer names a completed assistant tail`)
  }
  const expected = surfaceIdentities(parent.events.slice(0, boundary.turnEndSeq + 1))
  const inherited = surfaceIdentities(child.events.slice(0, cut))
  if (expected.length !== inherited.length || expected.some((identity, index) => identity !== inherited[index])) {
    throw new Error(`branch '${branch.branchId}' inherited prefix does not match its recorded anchor`)
  }
  if (unchanged) return branch
  return Object.freeze({
    ...branch,
    anchorSeq: boundary.anchorSeq,
    forkBoundarySeq: boundary.forkBoundarySeq,
    seedLength: cut,
  })
}
