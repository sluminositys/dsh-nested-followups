import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import SessionStore, {
  Session,
  SessionId,
  type SessionEvent,
  type SessionHeader,
} from '@deepseek-ai/dsh-session'
import {
  type SessionInspection,
  type SessionPersistenceSnapshot,
} from '@deepseek-ai/dsh-session-persistence'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'

import { TreeMetadataRepository } from '../src/host/storage.ts'
import { NestedFollowupsService } from '../src/host/tree-service.ts'
import { sessionSeedLength, snapshotSessionEvents } from '../src/host/adapter/session-compat.ts'
import { hiddenBranchCreation } from '../src/host/adapter/visibility.ts'
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

class MemoryPersistence extends Service {
  constructor(ctx: Context) { super(ctx, 'sessionPersistence') }
  private readonly records = new Map<SessionId, SessionInspection & {
    readonly inheritedEventCount: number
  }>()
  readonly readFromIds: SessionId[] = []
  readonly supportsRawArtifacts = false

  store(session: Session): void {
    this.records.set(session.id, {
      meta: session.header,
      events: snapshotSessionEvents(session),
      inheritedEventCount: sessionSeedLength(session) ?? 0,
    } as SessionInspection & { readonly inheritedEventCount: number })
  }

  async create(_meta: SessionHeader): Promise<void> {}
  async append(_id: SessionId, _events: readonly SessionEvent[]): Promise<void> {}
  async load(id: SessionId): Promise<SessionInspection & { readonly inheritedEventCount: number }> {
    const stored = this.records.get(id)
    if (stored === undefined) throw new Error('not persisted')
    return stored
  }
  async inspect(
    id: SessionId,
    _signal?: AbortSignal,
  ): Promise<SessionInspection & { readonly inheritedEventCount: number }> {
    return this.load(id)
  }
  async borrowSession(_id: SessionId, _signal?: AbortSignal): Promise<never> {
    throw new Error('borrow is not used by the tree read model')
  }
  async readFrom(
    id: SessionId,
    fromSeq: number,
    _signal?: AbortSignal,
  ) {
    this.readFromIds.push(id)
    const stored = await this.load(id)
    return {
      meta: stored.meta,
      inheritedEventCount: stored.inheritedEventCount,
      fromSeq: fromSeq as never,
      events: stored.events.filter(event => event.seq >= fromSeq),
    }
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

interface CompatibleSessionStatic {
  create(
    id: SessionId,
    seed: readonly SessionEvent[],
    header: Record<string, unknown>,
    inheritedEventCount?: number,
  ): Session
}

function constructorSeed(events: readonly SessionEvent[], version: number, cut?: number): readonly SessionEvent[] {
  if (version < 4 || cut === undefined || events.length <= cut) return events
  return [
    ...events.slice(0, cut),
    { type: 'session/end-seed', seq: cut, time: events[cut]?.time ?? 1, data: { inherited: true } } as unknown as SessionEvent,
    ...events.slice(cut).map(event => ({ ...event, seq: event.seq + 1 } as SessionEvent)),
  ]
}

function detachedSession(
  id: SessionId,
  events: readonly SessionEvent[],
  createdAt: number,
  lineage?: { readonly parentSession: SessionId; readonly seedLength: number },
): Session {
  const generation = Session.create(SessionId(`generation-probe-${id}`)).header as unknown as {
    readonly version: number
    readonly isSeeded?: boolean
  }
  const alpha = typeof generation.isSeeded === 'boolean'
  return (Session as unknown as CompatibleSessionStatic).create(id, constructorSeed(events, generation.version, lineage?.seedLength), {
    version: generation.version,
    id,
    createdAt,
    ...(lineage === undefined ? {} : { parentSession: lineage.parentSession, origin: 'subagent' }),
    ...(alpha
      ? { isSeeded: lineage !== undefined }
      : lineage === undefined ? {} : { seedLength: lineage.seedLength }),
  }, alpha ? lineage?.seedLength ?? 0 : undefined)
}

function liveBranchSession(
  ctx: Context,
  id: SessionId,
  events: readonly SessionEvent[],
  source: Session,
  seedLength: number,
): Session {
  const creation = hiddenBranchCreation(source.header, seedLength)
  return (ctx.sessions as unknown as {
    create(id: SessionId, options: Record<string, unknown>): Session
  }).create(id, {
    seed: constructorSeed(events, source.header.version, seedLength),
    meta: creation.meta,
    ...(creation.inheritedEventCount === undefined
      ? {}
      : { inheritedEventCount: creation.inheritedEventCount }),
  })
}

async function setup(options: { branches?: boolean; cold?: boolean; deletion?: boolean } = {}): Promise<{
  dispose: () => Promise<void>
  ctx: Context
  service: NestedFollowupsService
  root: ReturnType<SessionStore['create']>
  repository: TreeMetadataRepository
  persistence: MemoryPersistence
  deletionCalls: Array<{ request: { ownerSessionId: string; branchId: string }; counts: Map<string, number> }>
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
  const deletionCalls: Array<{
    request: { ownerSessionId: string; branchId: string }
    counts: Map<string, number>
  }> = []
  class DeletionStub extends Service {
    constructor(owner: Context) { super(owner, 'nestedFollowupsDeletion') }
    capabilities() { return { supported: true as const, mode: 'archive' as const } }
    async deleteBranch(
      request: { ownerSessionId: string; branchId: string },
      counts: ReadonlyMap<string, number>,
    ) {
      deletionCalls.push({ request, counts: new Map(counts) })
      return {
        ok: true as const,
        value: {
          status: 'deleted' as const,
          branchCount: 1,
          visibleMessageCount: counts.get(request.branchId) ?? 0,
          cleanupMode: 'archive' as const,
        },
      }
    }
  }
  if (options.deletion === true) {
    const deletionFiber = ctx.plugin(DeletionStub)
    fibers.push(deletionFiber)
    await deletionFiber
  }

  const rootEvents = textTurn(0, 1, 'q1', 'a1', 'root question', 'root answer')
  const branchEvents = [
    ...rootEvents,
    ...textTurn(6, 2, 'branch-q1', 'branch-a1', 'follow-up', 'isolated answer'),
  ]
  const root = options.cold === true
    ? detachedSession(SessionId('root'), rootEvents, 1)
    : ctx.sessions.create(SessionId('root'), { seed: rootEvents })
  const branchSession = options.cold === true
    ? detachedSession(SessionId('branch-session'), branchEvents, 2, {
      parentSession: root.id,
      seedLength: 6,
    })
    : liveBranchSession(ctx, SessionId('branch-session'), branchEvents, root, 6)
  if (options.cold === true) {
    const persistence = ctx.sessionPersistence as unknown as MemoryPersistence
    persistence.store(root)
    persistence.store(branchSession)
  }
  const serviceFiber = ctx.plugin(NestedFollowupsService)
  fibers.push(serviceFiber)
  await serviceFiber
  return {
    ctx,
    dispose: async () => {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    },
    service: ctx.nestedFollowups,
    root,
    repository,
    persistence: ctx.sessionPersistence as unknown as MemoryPersistence,
    deletionCalls,
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
        deletion: {
          supported: false,
          reason: 'The branch deletion service is unavailable.',
        },
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

  it('does not read the log of a branch already marked deleted', async () => {
    const { dispose, service, repository, persistence } = await setup({ cold: true })
    try {
      const branch = repository.getBranch('branch-1')
      expect(branch).toBeDefined()
      if (branch === undefined) return
      await repository.putBranch({ ...branch, status: 'deleted', deletedAt: 10 })
      persistence.readFromIds.length = 0

      const result = await service.readTree({ sessionId: 'root' })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // The projection drops the branch, so fetching its log would only cost a
      // persistence round trip while its session is being cleaned up.
      expect(persistence.readFromIds.map(String)).toEqual(['root'])
      expect(result.value.projection.nodes.map(node => node.messageId)).toEqual(['q1', 'a1'])
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
    const { dispose, service, root, ctx } = await setup()
    try {
      const initial = await service.readTree({ sessionId: 'root' })
      if (!initial.ok) throw new Error('root projection missing')

      for (const text of ['one', ' two', ' three']) {
        // Legacy rc hosts publish durable chunks through session/event.
        ctx.emit('session/event', root, {
          type: 'assistant/chunk', seq: 6, time: 100,
          data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text } },
        } as unknown as SessionEvent)
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

  it('projects 0.2 live frames and replaces them with the committed answer without writing chunks', async () => {
    const { dispose, service, root, ctx } = await setup()
    try {
      root.append('turn/start', { turn: 2 })
      root.append('step/start', { turn: 2, step: 1 })
      const before = snapshotSessionEvents(root)
      const emit = ctx as unknown as { emit(name: string, payload: unknown): void }
      emit.emit('agent/assistant-stream', { agent: { id: root.id }, frame: {
        type: 'start', revision: 1, attemptId: 'live', turn: 2, step: 1,
      } })
      emit.emit('agent/assistant-stream', { agent: { id: root.id }, frame: {
        type: 'chunk', revision: 2, attemptId: 'live', index: 0, time: 100,
        chunk: { type: 'text-delta', index: 0, text: 'Live answer' },
      } })
      const live = await service.readTree({ sessionId: 'root' })
      expect(live.ok && live.value.projection.nodes.find(node => node.messageId === 'stream-2-1'))
        .toMatchObject({ text: 'Live answer', state: 'streaming' })
      expect(snapshotSessionEvents(root)).toEqual(before)
      const settled = textTurn(before.length - 3, 2, 'unused', 'a-live', 'unused', 'Final answer')[3]
      if (settled?.type !== 'assistant/message') throw new Error('missing fixture')
      root.append('assistant/message', settled.data, { surfaceOp: 'append' })
      emit.emit('agent/assistant-stream', { agent: { id: root.id }, frame: {
        type: 'end', revision: 3, attemptId: 'live', index: 1,
      } })
      root.append('step/end', { turn: 2, step: 1 })
      root.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      const final = await service.readTree({ sessionId: 'root' })
      expect(final.ok && final.value.projection.nodes.find(node => node.messageId === 'a-live'))
        .toMatchObject({ text: 'Final answer', state: 'complete' })
      expect(final.ok && final.value.projection.nodes.some(node => node.messageId === 'stream-2-1')).toBe(false)
    } finally { await dispose() }
  })

  it('routes deletion through the Host service with projection-derived message counts', async () => {
    const { dispose, service, deletionCalls } = await setup({ deletion: true })
    try {
      const read = await service.readTree({ sessionId: 'root' })
      expect(read.ok && read.value.capabilities.deletion).toEqual({
        supported: true,
        mode: 'archive',
      })
      await expect(service.deleteBranch({
        ownerSessionId: 'root',
        branchId: 'branch-1',
      })).resolves.toEqual({
        ok: true,
        value: {
          status: 'deleted',
          branchCount: 1,
          visibleMessageCount: 2,
          cleanupMode: 'archive',
        },
      })
      expect(deletionCalls).toEqual([{
        request: { ownerSessionId: 'root', branchId: 'branch-1' },
        counts: new Map([['branch-1', 2]]),
      }])
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
        deletion: {
          supported: false,
          reason: 'The branch deletion service is unavailable.',
        },
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
