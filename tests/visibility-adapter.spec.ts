import { Context, type Fiber } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'

import {
  HIDDEN_BRANCH_ORIGIN,
  hiddenBranchCreation,
  hiddenBranchMetaRc7,
  probeBranchVisibilityRc7,
} from '../src/host/adapter/visibility.ts'

describe('rc.7 branch visibility adapter', () => {
  it('probes origin retention without publishing or persisting a Session', async () => {
    const ctx = new Context()
    const fibers: Fiber[] = []
    try {
      const sessions = ctx.plugin(SessionStore)
      fibers.push(sessions)
      await sessions
      const created = vi.fn()
      ctx.on('session/created', created)

      expect(probeBranchVisibilityRc7(ctx)).toEqual({
        supported: true,
        mechanism: HIDDEN_BRANCH_ORIGIN,
      })
      expect(probeBranchVisibilityRc7(ctx)).toEqual({
        supported: true,
        mechanism: HIDDEN_BRANCH_ORIGIN,
      })
      expect(created).not.toHaveBeenCalled()
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
  })

  it('constructs the exact immutable lineage and visibility fields', () => {
    const rcHeader = {
      version: 0,
      id: SessionId('parent'),
      createdAt: 1,
      cwd: 'D:\\workspace\\project',
    } as unknown as SessionHeader
    expect(hiddenBranchMetaRc7(rcHeader, 12)).toEqual({
      cwd: 'D:\\workspace\\project',
      parentSession: 'parent',
      seedLength: 12,
      origin: 'subagent',
    })
    expect(hiddenBranchCreation(rcHeader, 12)).toEqual({
      meta: {
        cwd: 'D:\\workspace\\project',
        parentSession: 'parent',
        seedLength: 12,
        origin: 'subagent',
      },
    })
  })

  it('constructs the 0.1.2 seeded-session representation', () => {
    const alphaHeader = {
      version: 1,
      id: SessionId('parent'),
      createdAt: 1,
      cwd: 'D:\\workspace\\project',
      isSeeded: false,
    } as unknown as SessionHeader

    expect(hiddenBranchCreation(alphaHeader, 12, 'engineering')).toEqual({
      meta: {
        cwd: 'D:\\workspace\\project',
        parentSession: 'parent',
        isSeeded: true,
        origin: 'subagent',
        agentPreset: 'engineering',
      },
      inheritedEventCount: 12,
    })
  })

  it('fails closed when the unpublished prepare contract is absent', () => {
    const ctx = { get: vi.fn(() => undefined) } as unknown as Context
    expect(probeBranchVisibilityRc7(ctx)).toEqual(expect.objectContaining({
      supported: false,
      mechanism: HIDDEN_BRANCH_ORIGIN,
    }))
  })
})
