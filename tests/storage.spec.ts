import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'

import { TreeMetadataRepository } from '../src/host/storage.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'

class MemoryTable<V> implements KvTable<string, V> {
  readonly records = new Map<string, V>()

  get(key: string): V | undefined {
    return this.records.get(key)
  }

  entries(): IterableIterator<[string, V]> {
    return [...this.records.entries()][Symbol.iterator]()
  }

  keys(): IterableIterator<string> {
    return [...this.records.keys()][Symbol.iterator]()
  }

  get size(): number {
    return this.records.size
  }

  async put(key: string, value: V): Promise<void> {
    this.records.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key)
  }

  async update(key: string, fn: (current: V) => V): Promise<V> {
    const current = this.records.get(key)
    if (current === undefined) throw new Error('missing key')
    const next = fn(current)
    this.records.set(key, next)
    return next
  }
}

const tree: TreeRecord = {
  treeId: 'tree-1',
  rootSessionId: 'root-session',
  version: 1,
  createdAt: 1,
  updatedAt: 1,
}

const branch: BranchRecord = {
  branchId: 'branch-1',
  clientRequestId: 'request-1',
  treeId: tree.treeId,
  sessionId: 'branch-session-1',
  parentSessionId: tree.rootSessionId,
  parentBranchId: null,
  anchorSessionId: tree.rootSessionId,
  anchorMessageId: 'answer-2',
  anchorSeq: 9,
  forkBoundarySeq: 11,
  seedLength: 12,
  siblingOrdinal: 1,
  createdAt: 2,
  status: 'ready',
}

describe('tree metadata repository', () => {
  it('restores tree and branch records from the same durable tables', async () => {
    const trees = new MemoryTable<TreeRecord>()
    const branches = new MemoryTable<BranchRecord>()
    const writer = new TreeMetadataRepository(trees, branches)

    await writer.putTree(tree)
    await writer.putBranch(branch)

    const readerAfterRestart = new TreeMetadataRepository(trees, branches)
    expect(readerAfterRestart.getTreeByRootSession(tree.rootSessionId)).toEqual(tree)
    expect(readerAfterRestart.listBranches(tree.treeId)).toEqual([branch])
  })

  it('keeps one tree per root session and one branch per session', async () => {
    const repository = new TreeMetadataRepository(
      new MemoryTable<TreeRecord>(),
      new MemoryTable<BranchRecord>(),
    )
    await repository.putTree(tree)
    await repository.putBranch(branch)

    await expect(repository.putTree({ ...tree, treeId: 'other-tree' }))
      .rejects.toThrow(/already owns/)
    await expect(repository.putBranch({ ...branch, branchId: 'other-branch' }))
      .rejects.toThrow(/already belongs/)
    await expect(repository.putBranch({
      ...branch,
      branchId: 'request-collision',
      sessionId: 'other-session',
    })).rejects.toThrow(/client request/)
  })

  it('requires a nested branch to reference its stored logical parent', async () => {
    const repository = new TreeMetadataRepository(
      new MemoryTable<TreeRecord>(),
      new MemoryTable<BranchRecord>(),
    )
    await repository.putTree(tree)

    await expect(repository.putBranch({
      ...branch,
      branchId: 'nested',
      sessionId: 'nested-session',
      parentBranchId: 'missing-parent',
    })).rejects.toThrow(/parent branch/)

    await repository.putBranch(branch)
    await expect(repository.putBranch({
      ...branch,
      branchId: 'nested',
      sessionId: 'nested-session',
      parentSessionId: 'wrong-session',
      anchorSessionId: 'wrong-session',
      parentBranchId: branch.branchId,
    })).rejects.toThrow(/source session/)
  })

  it('does not reuse sibling ordinals after a branch is marked deleted', async () => {
    const repository = new TreeMetadataRepository(
      new MemoryTable<TreeRecord>(),
      new MemoryTable<BranchRecord>(),
    )
    await repository.putTree(tree)
    await repository.putBranch({ ...branch, status: 'deleted', deletedAt: 5 })

    expect(repository.nextSiblingOrdinal(
      tree.treeId,
      null,
      tree.rootSessionId,
      branch.anchorMessageId,
    )).toBe(2)
  })

  it('rejects inconsistent deletion markers at the storage boundary', async () => {
    const repository = new TreeMetadataRepository(
      new MemoryTable<TreeRecord>(),
      new MemoryTable<BranchRecord>(),
    )
    await repository.putTree(tree)

    await expect(repository.putBranch({ ...branch, status: 'deleted' }))
      .rejects.toThrow(/deletedAt/)
    await expect(repository.putBranch({ ...branch, deletedAt: 5 }))
      .rejects.toThrow(/deletedAt/)
  })
})
