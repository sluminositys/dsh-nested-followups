import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it, vi } from 'vitest'

import { NestedFollowupsDeleteService } from '../src/host/delete-service.ts'
import { TreeMetadataRepository } from '../src/host/storage.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'

class MemoryTable<V> implements KvTable<string, V> {
  private readonly values = new Map<string, V>()
  get(key: string): V | undefined { return this.values.get(key) }
  entries(): IterableIterator<[string, V]> { return this.values.entries() }
  keys(): IterableIterator<string> { return this.values.keys() }
  get size(): number { return this.values.size }
  async put(key: string, value: V): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<boolean> { return this.values.delete(key) }
  async update(key: string, fn: (current: V) => V): Promise<V> {
    const current = this.values.get(key)
    if (current === undefined) throw new Error('missing key')
    const next = fn(current)
    this.values.set(key, next)
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
    anchorMessageId: parent === null ? 'root-a1' : `${parent.branchId}-a1`,
    anchorSeq: 3,
    forkBoundarySeq: 5,
    seedLength: 6,
    siblingOrdinal: 1,
    createdAt: parent === null ? 2 : 3,
    status,
  }
}

describe('Host branch deletion runtime', () => {
  it('cancels active descendants, archives bottom-up, and retains root and siblings', async () => {
    const ctx = new Context()
    const fibers: Fiber[] = []
    const repository = new TreeMetadataRepository(
      new MemoryTable<TreeRecord>(),
      new MemoryTable<BranchRecord>(),
    )
    const b1 = branch('b1', 'session-b1', null)
    const b11 = branch('b1.1', 'session-b1.1', b1, 'running')
    const b2 = { ...branch('b2', 'session-b2', null), siblingOrdinal: 2, createdAt: 4 }
    await repository.putTree(tree)
    for (const record of [b1, b11, b2]) await repository.putBranch(record)

    class MetadataStub extends Service {
      readonly repository = repository
      constructor(owner: Context) { super(owner, 'nestedFollowupsMetadata') }
    }
    let agentStatus: Agent['status'] = 'running'
    const cancel = vi.fn(() => { agentStatus = 'idle' })
    const whenIdle = vi.fn(async () => {})
    const agent = {
      id: SessionId(b11.sessionId),
      get status() { return agentStatus },
      cancel,
      whenIdle,
    } as unknown as Agent
    class AgentsStub extends Service {
      constructor(owner: Context) { super(owner, 'agents') }
      get(id: ReturnType<typeof SessionId>): Agent | undefined {
        return id === agent.id ? agent : undefined
      }
    }
    const archived: string[] = []
    class WorkspaceRegistryStub extends Service {
      constructor(owner: Context) { super(owner, 'workspaceRegistry') }
      async archiveSession(sessionId: ReturnType<typeof SessionId>): Promise<void> {
        archived.push(String(sessionId))
      }
    }

    for (const Plugin of [MetadataStub, AgentsStub, WorkspaceRegistryStub, NestedFollowupsDeleteService]) {
      const fiber = ctx.plugin(Plugin)
      fibers.push(fiber)
      await fiber
    }
    const changes: string[] = []
    ctx.on('nested-followups/change', rootSessionId => { changes.push(rootSessionId) })
    try {
      expect(ctx.nestedFollowupsDeletion.capabilities()).toEqual({
        supported: true,
        mode: 'archive',
      })
      const result = await ctx.nestedFollowupsDeletion.deleteBranch(
        { ownerSessionId: tree.rootSessionId, branchId: b1.branchId },
        new Map([[b1.branchId, 2], [b11.branchId, 3], [b2.branchId, 4]]),
      )

      expect(result).toEqual({
        ok: true,
        value: {
          status: 'deleted',
          branchCount: 2,
          visibleMessageCount: 5,
          cleanupMode: 'archive',
        },
      })
      expect(cancel).toHaveBeenCalledWith({ kind: 'user' })
      expect(whenIdle).toHaveBeenCalledOnce()
      expect(archived).toEqual([b11.sessionId, b1.sessionId])
      expect(repository.listBranches(tree.treeId).map(record => record.branchId)).toEqual([b2.branchId])
      expect(changes).toEqual([tree.rootSessionId, tree.rootSessionId])
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
  })
})
