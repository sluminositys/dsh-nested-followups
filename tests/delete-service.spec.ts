import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'

import {
  BranchDeletionError,
  CascadeDeleteCoordinator,
  planCascadeDeletion,
  type BranchSessionCleanupPort,
} from '../src/host/delete-service.ts'
import { TreeMetadataRepository } from '../src/host/storage.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'

class MemoryTable<V> implements KvTable<string, V> {
  readonly records = new Map<string, V>()
  get(key: string): V | undefined { return this.records.get(key) }
  entries(): IterableIterator<[string, V]> { return [...this.records.entries()][Symbol.iterator]() }
  keys(): IterableIterator<string> { return [...this.records.keys()][Symbol.iterator]() }
  get size(): number { return this.records.size }
  async put(key: string, value: V): Promise<void> { this.records.set(key, value) }
  async delete(key: string): Promise<boolean> { return this.records.delete(key) }
  async update(key: string, fn: (current: V) => V): Promise<V> {
    const current = this.records.get(key)
    if (current === undefined) throw new Error('missing key')
    const next = fn(current)
    this.records.set(key, next)
    return next
  }
}

const tree: TreeRecord = {
  treeId: 'tree', rootSessionId: 'root', version: 1, createdAt: 1, updatedAt: 1,
}

function branch(
  branchId: string,
  sessionId: string,
  parent: BranchRecord | null,
  createdAt: number,
  status: BranchRecord['status'] = 'ready',
): BranchRecord {
  return {
    branchId,
    clientRequestId: `request-${branchId}`,
    treeId: tree.treeId,
    sessionId,
    parentSessionId: parent?.sessionId ?? tree.rootSessionId,
    parentBranchId: parent?.branchId ?? null,
    anchorSessionId: parent?.sessionId ?? tree.rootSessionId,
    anchorMessageId: parent === null ? 'root-answer' : `${parent.branchId}-answer`,
    anchorSeq: 3,
    forkBoundarySeq: 5,
    seedLength: 6,
    siblingOrdinal: 1,
    createdAt,
    status,
  }
}

const b1 = branch('b1', 'session-b1', null, 2)
const b11 = branch('b1.1', 'session-b1.1', b1, 3, 'running')
const b111 = branch('b1.1.1', 'session-b1.1.1', b11, 4)
const b2 = { ...branch('b2', 'session-b2', null, 5), siblingOrdinal: 2 }

class CleanupPort implements BranchSessionCleanupPort {
  readonly mode = 'archive' as const
  readonly cancelled: string[] = []
  readonly cleaned: string[] = []

  constructor(
    private readonly failCancel?: string,
    private readonly failCleanup?: string,
  ) {}

  async cancel(sessionId: string): Promise<void> {
    this.cancelled.push(sessionId)
    if (sessionId === this.failCancel) throw new Error('cancel refused')
  }

  async cleanup(sessionId: string): Promise<void> {
    this.cleaned.push(sessionId)
    if (sessionId === this.failCleanup) throw new Error('archive failed')
  }
}

async function repositoryWith(records: readonly BranchRecord[]): Promise<TreeMetadataRepository> {
  const repository = new TreeMetadataRepository(
    new MemoryTable<TreeRecord>(),
    new MemoryTable<BranchRecord>(),
  )
  await repository.putTree(tree)
  for (const record of records) await repository.putBranch(record)
  return repository
}

describe('cascade branch deletion', () => {
  it('plans every descendant bottom-up and excludes siblings', () => {
    const plan = planCascadeDeletion(
      [b2, b111, b1, b11],
      tree.treeId,
      b1.branchId,
      new Map([[b1.branchId, 2], [b11.branchId, 3], [b111.branchId, 4], [b2.branchId, 7]]),
    )

    expect(plan.branches.map(record => record.branchId)).toEqual(['b1.1.1', 'b1.1', 'b1'])
    expect(plan.branchCount).toBe(3)
    expect(plan.visibleMessageCount).toBe(9)
  })

  it('marks the complete subtree before cleanup and then removes only those records', async () => {
    const repository = await repositoryWith([b1, b11, b111, b2])
    const sessions = new CleanupPort()
    const coordinator = new CascadeDeleteCoordinator(repository, sessions, () => 100)

    const result = await coordinator.delete(tree.treeId, b1.branchId)

    expect(result).toMatchObject({ status: 'deleted', branchCount: 3, cleanupMode: 'archive' })
    expect(sessions.cancelled).toEqual([b11.sessionId])
    expect(sessions.cleaned).toEqual([b111.sessionId, b11.sessionId, b1.sessionId])
    expect(repository.listBranches(tree.treeId).map(record => record.branchId)).toEqual([b2.branchId])
  })

  it('does not mark records when cancellation fails', async () => {
    const repository = await repositoryWith([b1, b11, b111, b2])
    const sessions = new CleanupPort(b11.sessionId)
    const coordinator = new CascadeDeleteCoordinator(repository, sessions, () => 100)

    await expect(coordinator.delete(tree.treeId, b1.branchId))
      .rejects.toThrow(expect.objectContaining<Partial<BranchDeletionError>>({ code: 'cancel-failed' }))
    expect(repository.getBranch(b1.branchId)?.status).toBe('ready')
    expect(repository.getBranch(b11.branchId)?.status).toBe('running')
    expect(sessions.cleaned).toEqual([])
  })

  it('keeps every record marked and hidden when second-phase cleanup fails', async () => {
    const repository = await repositoryWith([b1, b11, b111, b2])
    const sessions = new CleanupPort(undefined, b11.sessionId)
    const coordinator = new CascadeDeleteCoordinator(repository, sessions, () => 100)

    const result = await coordinator.delete(tree.treeId, b1.branchId)

    expect(result).toMatchObject({
      status: 'cleanup-pending',
      failedSessionId: b11.sessionId,
      branchCount: 3,
    })
    expect(repository.listBranches(tree.treeId)
      .filter(record => record.branchId !== b2.branchId)
      .every(record => record.status === 'deleted' && record.deletedAt === 100)).toBe(true)
    expect(repository.getBranch(b2.branchId)?.status).toBe('ready')
  })

  it('retries marked cleanup idempotently and treats a removed target as absent', async () => {
    const repository = await repositoryWith([b1, b11, b111, b2])
    const first = new CascadeDeleteCoordinator(
      repository,
      new CleanupPort(undefined, b11.sessionId),
      () => 100,
    )
    await first.delete(tree.treeId, b1.branchId)

    const retryPort = new CleanupPort()
    const retry = new CascadeDeleteCoordinator(repository, retryPort, () => 200)
    expect(await retry.delete(tree.treeId, b1.branchId)).toMatchObject({ status: 'deleted' })
    expect(await retry.delete(tree.treeId, b1.branchId)).toEqual({
      status: 'already-absent',
      branchCount: 0,
      visibleMessageCount: 0,
      cleanupMode: 'archive',
    })
    expect(repository.listBranches(tree.treeId).map(record => record.branchId)).toEqual([b2.branchId])
  })

  it('rejects a corrupt descendant cycle instead of deleting outside a proven subtree', () => {
    const cyclicA = { ...b1, parentBranchId: b11.branchId }
    expect(() => planCascadeDeletion([cyclicA, b11], tree.treeId, b1.branchId))
      .toThrow(expect.objectContaining<Partial<BranchDeletionError>>({ code: 'branch-cycle' }))
  })
})
