import { describe, expect, it } from 'vitest'

import {
  mutationAcknowledged,
  projectOptimisticMutations,
  type OptimisticMutation,
} from '../src/client/optimistic-projection.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

function node(messageId: string) {
  const match = treeProjectionFixture().nodes.find(candidate => candidate.messageId === messageId)
  if (match === undefined) throw new Error(`fixture node '${messageId}' is missing`)
  return match
}

describe('optimistic tree projection', () => {
  it('adds an immediate quoted Q/A child to the right without changing the Host snapshot', () => {
    const base = treeProjectionFixture()
    const mutation: OptimisticMutation = {
      kind: 'branch',
      clientRequestId: 'pending-create',
      anchor: node('root-a2'),
      question: 'explain this passage',
      anchorRange: { start: 0, end: 6, text: 'second' },
      createdAt: 100,
    }
    const projected = projectOptimisticMutations(base, [mutation])
    const branch = projected.branches.find(
      candidate => candidate.record.clientRequestId === mutation.clientRequestId,
    )

    expect(base.nodes).toHaveLength(12)
    expect(projected.nodes).toHaveLength(14)
    expect(branch).toEqual(expect.objectContaining({
      branchPath: [2, 3],
      anchorNodeId: 'root-a2',
      anchorStatus: 'range-valid',
      record: expect.objectContaining({
        parentBranchId: null,
        siblingOrdinal: 3,
        anchorRange: mutation.anchorRange,
        status: 'creating',
      }),
    }))
    const pending = projected.nodes.slice(-2)
    expect(pending).toEqual([
      expect.objectContaining({
        messageId: mutation.clientRequestId,
        role: 'user',
        state: 'queued',
        branchPath: [2, 3],
      }),
      expect.objectContaining({ role: 'assistant', state: 'queued', branchPath: [2, 3] }),
    ])
    expect(projected.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: 'root-a2',
      targetNodeId: pending[0]?.nodeId,
      kind: 'branch',
    }))
    expect(mutationAcknowledged(base, mutation)).toBe(false)
  })

  it('adds Continue as one more turn below the same branch without creating a child branch', () => {
    const base = treeProjectionFixture()
    const mutation: OptimisticMutation = {
      kind: 'continue',
      clientRequestId: 'pending-continue',
      tail: node('branch-1-a'),
      question: 'continue linearly',
      createdAt: 200,
    }
    const projected = projectOptimisticMutations(base, [mutation])
    const branch = projected.branches.find(candidate => candidate.record.branchId === 'branch-1')
    const pending = projected.nodes.slice(-2)

    expect(projected.branches).toHaveLength(base.branches.length)
    expect(branch?.nodeIds).toHaveLength(4)
    expect(pending).toEqual([
      expect.objectContaining({
        branchId: 'branch-1',
        sessionId: 'branch-session-1',
        localTurnIndex: 2,
        branchPath: [2, 1],
        role: 'user',
      }),
      expect.objectContaining({
        branchId: 'branch-1',
        sessionId: 'branch-session-1',
        localTurnIndex: 2,
        branchPath: [2, 1],
        role: 'assistant',
      }),
    ])
    expect(projected.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: 'branch-1-a',
      targetNodeId: pending[0]?.nodeId,
      kind: 'sequence',
    }))
  })

  it('allocates deterministic temporary sibling ordinals and reconciles on the durable user id', () => {
    const base = treeProjectionFixture()
    const anchor = node('root-a2')
    const mutations: OptimisticMutation[] = [
      {
        kind: 'branch',
        clientRequestId: 'pending-one',
        anchor,
        question: 'one',
        createdAt: 300,
      },
      {
        kind: 'branch',
        clientRequestId: 'pending-two',
        anchor,
        question: 'two',
        createdAt: 301,
      },
    ]
    const projected = projectOptimisticMutations(base, mutations)
    expect(projected.branches.slice(-2).map(branch => branch.branchPath)).toEqual([
      [2, 3],
      [2, 4],
    ])
    expect(mutationAcknowledged(projected, mutations[0]!)).toBe(true)
  })
})
