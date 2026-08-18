import { Context, type Fiber } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'

import {
  HIDDEN_BRANCH_ORIGIN,
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
    expect(hiddenBranchMetaRc7({
      version: 0,
      id: SessionId('parent'),
      createdAt: 1,
      cwd: 'D:\\workspace\\project',
    }, 12)).toEqual({
      cwd: 'D:\\workspace\\project',
      parentSession: 'parent',
      seedLength: 12,
      origin: 'subagent',
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
