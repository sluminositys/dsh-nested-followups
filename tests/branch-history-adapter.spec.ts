import { describe, expect, it } from 'vitest'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'

import { resolveBranchHistory, type BranchSessionHistory } from '../src/host/adapter/branch-history.ts'
import type { BranchRecord } from '../src/shared/types.ts'
import { textTurn } from './fixtures/session-events.ts'

function fixture() {
  const inherited = textTurn(0, 1, 'q1', 'a1', 'question', 'answer')
  const parent: BranchSessionHistory = {
    header: { version: 3, id: SessionId('root'), createdAt: 1, isSeeded: false } as unknown as SessionHeader,
    events: [...inherited, ...textTurn(6, 2, 'q2', 'a2', 'later', 'not inherited')],
  }
  const child: BranchSessionHistory = {
    header: {
      version: 3, id: SessionId('child'), createdAt: 2,
      parentSession: SessionId('root'), origin: 'subagent', isSeeded: true,
    } as unknown as SessionHeader,
    events: [...inherited, ...textTurn(6, 2, 'cq', 'ca', 'follow-up', 'isolated')],
    seedLength: 6,
  }
  const branch: BranchRecord = {
    branchId: 'branch', clientRequestId: 'cq', treeId: 'root', sessionId: 'child',
    parentSessionId: 'root', parentBranchId: null, anchorSessionId: 'root', anchorMessageId: 'a1',
    anchorSeq: 600, forkBoundarySeq: 605, seedLength: 606, siblingOrdinal: 1, createdAt: 2, status: 'ready',
  }
  return { parent, child, branch }
}

describe('migrated branch coordinates', () => {
  it('reconciles the authoritative cut and stable anchor without modifying stored inputs', () => {
    const { parent, child, branch } = fixture()
    const before = JSON.stringify({ parent, child, branch })
    expect(resolveBranchHistory(branch, child, parent)).toMatchObject({
      anchorSeq: 3, forkBoundarySeq: 5, seedLength: 6,
    })
    expect(JSON.stringify({ parent, child, branch })).toBe(before)
  })

  it('keeps unchanged legacy coordinates and object identity', () => {
    const { parent, child, branch } = fixture()
    const current = { ...branch, anchorSeq: 3, forkBoundarySeq: 5, seedLength: 6 }
    expect(resolveBranchHistory(current, child, parent)).toBe(current)
  })

  it('does not disguise changed ownership, an absent anchor or a later inherited turn as migration', () => {
    const { parent, child, branch } = fixture()
    expect(() => resolveBranchHistory(branch, {
      ...child, header: { ...child.header, parentSession: SessionId('unrelated') },
    }, parent)).toThrow(/lineage/u)
    expect(() => resolveBranchHistory({ ...branch, anchorMessageId: 'missing' }, child, parent)).toThrow()
    expect(() => resolveBranchHistory(branch, {
      ...child, events: parent.events, seedLength: 12,
    }, parent)).toThrow(/prefix/u)
  })

  it('validates anchor identity and inherited messages even when numeric coordinates have not changed', () => {
    const { parent, child, branch } = fixture()
    const current = { ...branch, anchorSeq: 3, forkBoundarySeq: 5, seedLength: 6 }
    expect(() => resolveBranchHistory({ ...current, anchorMessageId: 'missing' }, child, parent)).toThrow()
    const unrelated = textTurn(0, 1, 'other-q', 'other-a', 'different', 'different')
    expect(() => resolveBranchHistory(current, {
      ...child, events: [...unrelated, ...child.events.slice(6)],
    }, parent)).toThrow(/prefix/u)
  })

  it('refuses unknown cuts and same-format legacy corruption instead of guessing', () => {
    const { parent, child, branch } = fixture()
    const { seedLength: _cut, ...unknownCut } = child
    expect(() => resolveBranchHistory(branch, unknownCut, parent)).toThrow()
    expect(() => resolveBranchHistory(branch, { ...child, seedLength: 999 }, parent)).toThrow()
    expect(() => resolveBranchHistory(branch, {
      ...child, header: { ...child.header, version: 0 } as unknown as SessionHeader,
    }, parent)).toThrow(/format/u)
    expect(() => resolveBranchHistory(branch, child)).toThrow(/parent/u)
  })
})
