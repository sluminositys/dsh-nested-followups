import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import SessionStore, {
  Session,
  SessionId,
  type SessionEvent,
  type SessionHeader,
} from '@deepseek-ai/dsh-session'
import {
  SessionPersistence,
  type SessionInspection,
  type SessionLocation,
  type SessionPersistenceSnapshot,
} from '@deepseek-ai/dsh-session-persistence'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'

import { TreeMetadataRepository } from '../src/host/storage.ts'
import { NestedFollowupsService } from '../src/host/tree-service.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'
import { textTurn } from './fixtures/session-events.ts'

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

class MemoryPersistence extends SessionPersistence {
  private readonly records = new Map<SessionId, SessionInspection>()
  readonly supportsRawArtifacts = false

  store(session: Session): void {
    this.records.set(session.id, { meta: session.header, events: session.events })
  }

  locate(_meta: SessionHeader): SessionLocation | undefined { return undefined }
  async create(_meta: SessionHeader): Promise<void> {}
  async append(_id: SessionId, _events: readonly SessionEvent[]): Promise<void> {}
  async load(id: SessionId): Promise<SessionInspection> {
    const stored = this.records.get(id)
    if (stored === undefined) throw new Error('not persisted')
    return stored
  }
  async inspect(id: SessionId, _signal?: AbortSignal): Promise<SessionInspection> {
    return this.load(id)
  }
  async readFrom(
    id: SessionId,
    fromSeq: number,
    _signal?: AbortSignal,
  ): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    const stored = await this.load(id)
    return { meta: stored.meta, events: stored.events.filter(event => event.seq >= fromSeq) }
  }
  async list(_signal?: AbortSignal): Promise<SessionHeader[]> {
    return [...this.records.values()].map(record => record.meta)
  }
  async listSnapshots(_signal?: AbortSignal): Promise<SessionPersistenceSnapshot[]> {
    return [...this.records.values()].map((record, index) => ({
      header: record.meta,
      revision: `memory-${index}` as SessionPersistenceSnapshot['revision'],
    }))
  }
}

async function setup(options: { branches?: boolean; cold?: boolean } = {}): Promise<{
  dispose: () => Promise<void>
  service: NestedFollowupsService
  root: ReturnType<SessionStore['create']>
}> {
  const ctx = new Context()
  const fibers: Fiber[] = []
  const sessionFiber = ctx.plugin(SessionStore)
  fibers.push(sessionFiber)
  await sessionFiber
  const persistenceFiber = ctx.plugin(MemoryPersistence)
  fibers.push(persistenceFiber)
  await persistenceFiber

  const repository = new TreeMetadataRepository(
    new MemoryTable<TreeRecord>(),
    new MemoryTable<BranchRecord>(),
  )
  const tree: TreeRecord = {
    treeId: 'tree-root',
    rootSessionId: 'root',
    version: 1,
    createdAt: 1,
    updatedAt: 2,
  }
  const branch: BranchRecord = {
    branchId: 'branch-1',
    clientRequestId: 'request-1',
    treeId: tree.treeId,
    sessionId: 'branch-session',
    parentSessionId: tree.rootSessionId,
    parentBranchId: null,
    anchorSessionId: tree.rootSessionId,
    anchorMessageId: 'a1',
    anchorSeq: 3,
    forkBoundarySeq: 5,
    seedLength: 6,
    siblingOrdinal: 1,
    createdAt: 2,
    status: 'ready',
  }
  await repository.putTree(tree)
  await repository.putBranch(branch)

  class MetadataStub extends Service {
    readonly repository = repository
    constructor(owner: Context) { super(owner, 'nestedFollowupsMetadata') }
  }
  const metadataFiber = ctx.plugin(MetadataStub)
  fibers.push(metadataFiber)
  await metadataFiber

  class BranchesStub extends Service {
    constructor(owner: Context) { super(owner, 'nestedFollowupsBranches') }
    capabilities() {
      return {
        askFollowUp: true,
        continueBranch: true,
        nativeBranchContinuation: false,
      }
    }
  }
  if (options.branches !== false) {
    const branchesFiber = ctx.plugin(BranchesStub)
    fibers.push(branchesFiber)
    await branchesFiber
  }

  const rootEvents = textTurn(0, 1, 'q1', 'a1', 'root question', 'root answer')
  const branchEvents = [
    ...rootEvents,
    ...textTurn(6, 2, 'branch-q1', 'branch-a1', 'follow-up', 'isolated answer'),
  ]
  const root = options.cold === true
    ? Session.create(SessionId('root'), rootEvents, {
      version: 0,
      id: SessionId('root'),
      createdAt: 1,
    })
    : ctx.sessions.create(SessionId('root'), { seed: rootEvents })
  const branchSession = options.cold === true
    ? Session.create(SessionId('branch-session'), branchEvents, {
      version: 0,
      id: SessionId('branch-session'),
      createdAt: 2,
      parentSession: root.id,
      seedLength: 6,
      origin: 'subagent',
    })
    : ctx.sessions.create(SessionId('branch-session'), {
      seed: branchEvents,
      meta: {
        parentSession: root.id,
        seedLength: 6,
        origin: 'subagent',
      },
    })
  if (options.cold === true) {
    const persistence = ctx.sessionPersistence as MemoryPersistence
    persistence.store(root)
    persistence.store(branchSession)
  }
  const serviceFiber = ctx.plugin(NestedFollowupsService)
  fibers.push(serviceFiber)
  await serviceFiber
  return {
    dispose: async () => {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    },
    service: ctx.nestedFollowups,
    root,
  }
}

describe('tree projection Remote service', () => {
  it('reads root and branch suffixes as one de-duplicated message tree', async () => {
    const { dispose, service } = await setup()
    try {
      const result = await service.readTree({ sessionId: 'root' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.rootSessionId).toBe('root')
      expect(result.value.capabilities).toEqual({
        askFollowUp: true,
        continueBranch: true,
        nativeBranchContinuation: false,
      })
      expect(result.value.projection.nodes.map(node => node.messageId)).toEqual([
        'q1',
        'a1',
        'branch-q1',
        'branch-a1',
      ])
      expect(result.value.projection.edges.filter(edge => edge.kind === 'branch')).toHaveLength(1)
      expect(result.value.projection.branches[0]?.branchPath).toEqual([1, 1])
      expect(result.value.projection.diagnostics).toEqual([])
    } finally {
      await dispose()
    }
  })

  it('resolves a branch request back to its root-owned tree', async () => {
    const { dispose, service } = await setup()
    try {
      const result = await service.readTree({ sessionId: 'branch-session' })
      expect(result.ok && result.value.rootSessionId).toBe('root')
    } finally {
      await dispose()
    }
  })

  it('recovers the same de-duplicated tree exclusively from cold persisted logs', async () => {
    const { dispose, service } = await setup({ cold: true })
    try {
      const result = await service.readTree({ sessionId: 'branch-session' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.rootSessionId).toBe('root')
      expect(result.value.projection.nodes.map(node => node.messageId)).toEqual([
        'q1',
        'a1',
        'branch-q1',
        'branch-a1',
      ])
      expect(result.value.projection.diagnostics).toEqual([])
    } finally {
      await dispose()
    }
  })

  it('wakes an outstanding revision watch when the root log changes', async () => {
    const { dispose, service, root } = await setup()
    try {
      const initial = await service.readTree({ sessionId: 'root' })
      if (!initial.ok) throw new Error('root projection missing')
      const pending = service.watchTree({
        sessionId: 'root',
        afterRevision: initial.value.revision,
      })
      await Promise.resolve()
      root.append('turn/start', { turn: 2 })

      const changed = await pending
      expect(changed.ok).toBe(true)
      if (!changed.ok) return
      expect(changed.value.changed).toBe(true)
      if (!changed.value.changed) return
      expect(changed.value.snapshot.revision).toBe(initial.value.revision + 1)
    } finally {
      await dispose()
    }
  })

  it('coalesces high-frequency assistant chunks into one bounded revision', async () => {
    const { dispose, service, root } = await setup()
    try {
      const initial = await service.readTree({ sessionId: 'root' })
      if (!initial.ok) throw new Error('root projection missing')

      for (const text of ['one', ' two', ' three']) {
        root.append('assistant/chunk', {
          turn: 2,
          step: 1,
          chunk: { type: 'text-delta', index: 0, text },
        })
      }
      const immediate = await service.readTree({ sessionId: 'root' })
      expect(immediate.ok && immediate.value.revision).toBe(initial.value.revision)

      await new Promise(resolve => setTimeout(resolve, 75))
      const coalesced = await service.readTree({ sessionId: 'root' })
      expect(coalesced.ok && coalesced.value.revision).toBe(initial.value.revision + 1)
    } finally {
      await dispose()
    }
  })

  it('returns a stable business failure for an unknown session', async () => {
    const { dispose, service } = await setup()
    try {
      await expect(service.readTree({ sessionId: 'missing' })).resolves.toEqual({
        ok: false,
        error: { code: 'session-not-found', sessionId: 'missing' },
      })
    } finally {
      await dispose()
    }
  })

  it('keeps projection reads available when branch mutation services are absent', async () => {
    const { dispose, service } = await setup({ branches: false })
    try {
      const read = await service.readTree({ sessionId: 'root' })
      expect(read.ok && read.value.capabilities).toEqual({
        askFollowUp: false,
        continueBranch: false,
        nativeBranchContinuation: false,
        reason: 'The branch mutation service is unavailable.',
      })
      await expect(service.createBranch({
        ownerSessionId: 'root',
        clientRequestId: 'request-unavailable',
        anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'why?',
      })).resolves.toEqual({
        ok: false,
        error: {
          code: 'compatibility',
          message: 'Branch creation is unavailable in this DSH composition.',
        },
      })
    } finally {
      await dispose()
    }
  })
})
