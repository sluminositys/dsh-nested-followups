import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import { usesInheritedEventCount } from './session-compat.ts'

export const HIDDEN_BRANCH_ORIGIN = 'subagent' as const

export interface BranchVisibilityCapability {
  readonly supported: boolean
  readonly mechanism: typeof HIDDEN_BRANCH_ORIGIN
  readonly reason?: string
}

export interface HiddenBranchMeta {
  readonly cwd?: string
  readonly parentSession: SessionId
  readonly seedLength: number
  readonly origin: typeof HIDDEN_BRANCH_ORIGIN
  /** Preset the source ran under; recorded so a resumed branch rebuilds it. */
  readonly agentPreset?: string
}

export interface HiddenBranchMetaAlpha {
  readonly cwd?: string
  readonly parentSession: SessionId
  readonly isSeeded: true
  readonly origin: typeof HIDDEN_BRANCH_ORIGIN
  /** Preset the source ran under; recorded so a resumed branch rebuilds it. */
  readonly agentPreset?: string
}

export interface HiddenBranchCreation {
  readonly meta: HiddenBranchMeta | HiddenBranchMetaAlpha
  /** DSH 0.1.2 stores the fork cut outside the immutable SessionHeader. */
  readonly inheritedEventCount?: number
}

const cached = new WeakMap<Context, BranchVisibilityCapability>()

/** Build the immutable rc.7 header fields that keep a branch out of workspace lists. */
export function hiddenBranchMetaRc7(
  sourceHeader: SessionHeader,
  seedLength: number,
  agentPreset?: string,
): HiddenBranchMeta {
  return {
    ...(sourceHeader.cwd === undefined ? {} : { cwd: sourceHeader.cwd }),
    parentSession: sourceHeader.id,
    seedLength,
    origin: HIDDEN_BRANCH_ORIGIN,
    ...(agentPreset === undefined ? {} : { agentPreset }),
  }
}

/**
 * Map one plugin branch cut to the seeded-session contract supported by the
 * running DSH generation. rc keeps `seedLength` in the header; 0.1.2 requires
 * `isSeeded` plus a separately supplied `inheritedEventCount`.
 */
export function hiddenBranchCreation(
  sourceHeader: SessionHeader,
  seedLength: number,
  agentPreset?: string,
): HiddenBranchCreation {
  if (!Number.isSafeInteger(seedLength) || seedLength < 0) {
    throw new TypeError('branch seed length must be a non-negative safe integer')
  }
  if (!usesInheritedEventCount(sourceHeader)) {
    return { meta: hiddenBranchMetaRc7(sourceHeader, seedLength, agentPreset) }
  }
  return {
    meta: {
      ...(sourceHeader.cwd === undefined ? {} : { cwd: sourceHeader.cwd }),
      parentSession: sourceHeader.id,
      isSeeded: true,
      origin: HIDDEN_BRANCH_ORIGIN,
      ...(agentPreset === undefined ? {} : { agentPreset }),
    },
    inheritedEventCount: seedLength,
  }
}

/**
 * Probe origin retention with an unpublished Session. This validates the Host
 * half without creating, announcing, or persisting a probe session. The rc.7
 * Web workspace projection is separately pinned by its upstream tests.
 */
export function probeBranchVisibilityRc7(ctx: Context): BranchVisibilityCapability {
  const previous = cached.get(ctx)
  if (previous !== undefined) return previous
  const sessions = ctx.get('sessions')
  if (sessions === undefined || typeof sessions.prepare !== 'function') {
    const unsupported = {
      supported: false,
      mechanism: HIDDEN_BRANCH_ORIGIN,
      reason: 'The DSH Session store cannot prepare an origin-classified branch header.',
    } as const
    cached.set(ctx, unsupported)
    return unsupported
  }
  try {
    const probe = sessions.prepare(SessionId(`nested-followups-visibility-${randomUUID()}`), {
      meta: { origin: HIDDEN_BRANCH_ORIGIN },
    })
    const capability: BranchVisibilityCapability = probe.header.origin === HIDDEN_BRANCH_ORIGIN
      ? { supported: true, mechanism: HIDDEN_BRANCH_ORIGIN }
      : {
          supported: false,
          mechanism: HIDDEN_BRANCH_ORIGIN,
          reason: 'The DSH Session store discarded the required branch origin marker.',
        }
    cached.set(ctx, capability)
    return capability
  } catch (error: unknown) {
    const capability = {
      supported: false,
      mechanism: HIDDEN_BRANCH_ORIGIN,
      reason: `The DSH Session store rejected the branch origin marker: ${error instanceof Error ? error.message : String(error)}`,
    } as const
    cached.set(ctx, capability)
    return capability
  }
}
