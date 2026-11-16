import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, CreateAgentOptions, ResumeAgentOptions } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'

import { TreeMetadataRepository } from '../src/host/storage.ts'
import { NestedFollowupsService } from '../src/host/tree-service.ts'
import { resolveBranchHistory } from '../src/host/adapter/branch-history.ts'
import { NestedFollowupsBranchService } from '../src/host/branch-service.ts'
import { snapshotSessionEvents } from '../src/host/adapter/session-compat.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'
import { createLegacyHistoryFixture } from './fixtures/legacy-history.ts'
import { textTurn } from './fixtures/session-events.ts'

class MemoryTable<V> implements KvTable<string, V> {
  private readonly values = new Map<string, V>()
  get(key: string): V | undefined { return this.values.get(key) }
  entries(): IterableIterator<[string, V]> { return this.values.entries() }
  keys(): IterableIterator<string> { return this.values.keys() }
  get size(): number { return this.values.size }
  async put(key: string, value: V): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<boolean> { return this.values.delete(key) }
  async deleteMany(keys: Iterable<string>): Promise<number> {
    let count = 0
    for (const key of keys) if (this.values.delete(key)) count++
    return count
  }
  async update(key: string, fn: (current: V) => V): Promise<V> {
    const current = this.values.get(key)
    if (current === undefined) throw new Error('missing key')
    const next = fn(current)
    this.values.set(key, next)
    return next
  }
}

function appendAnswer(session: Session, message: Parameters<Agent['followup']>[0]): void {
  const previous = snapshotSessionEvents(session).findLast(
    (event): event is SessionEvent<'turn/start'> => event.type === 'turn/start',
  )
  const turn = (previous?.data.turn ?? 0) + 1
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('user/message', message, { surfaceOp: 'append' })
  session.append('assistant/message', {
    turn, step: 1, stream: [],
    message: createAssistantMessage({
      content: [{ type: 'text', text: 'Synthetic response after migration.' }],
      source: { provider: 'fixture', model: 'fixture-model' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

function agentContext(): Context {
  const tools = { guard: () => () => {}, restrict: () => () => {}, presentAs: () => () => {} }
  return { get: (name: string) => name === 'tools' ? tools : undefined, on: () => () => {} } as unknown as Context
}

async function setup() {
  const fixture = await createLegacyHistoryFixture()
  const ctx = new Context()
  const fibers: Fiber[] = []
  const repository = new TreeMetadataRepository(new MemoryTable<TreeRecord>(), new MemoryTable<BranchRecord>())
  await repository.putTree(fixture.tree)
  for (const branch of fixture.branches) await repository.putBranch(branch)

  class Persistence extends Service {
    constructor(owner: Context) { super(owner, 'sessionPersistence') }
    async list() {
      return [...fixture.logs.values()].map(log => ({ header: log.header, revision: 'fixture' }))
    }
    async open(id: string, access: string) {
      if (access !== 'read') throw new Error('Tree reads must not claim persistence write ownership')
      const log = fixture.logs.get(id)
      if (log === undefined) throw new Error('missing fixture session')
      return {
        header: log.header,
        inheritedEventCount: log.seedLength ?? 0,
        read: async (fromSeq: number) => ({ events: log.events.filter(event => event.seq >= fromSeq) }),
        close: async () => {},
      }
    }
  }
  class Metadata extends Service {
    readonly repository = repository
    constructor(owner: Context) { super(owner, 'nestedFollowupsMetadata') }
  }
  class Tools extends Service {
    constructor(owner: Context) { super(owner, 'tools') }
    guard(): () => void { return () => {} }
  }
  class Agents extends Service {
    static inject = ['sessions']
    private readonly values = new Map<string, Agent>()
    constructor(owner: Context) { super(owner, 'agents') }
    get(id: string): Agent | undefined { return this.values.get(id) }
    async create(options: CreateAgentOptions): Promise<AgentHandle> {
      const compatible = options as unknown as { readonly inheritedEventCount?: number }
      const session = (this.ctx.sessions as unknown as {
        create(id: SessionId, options: Record<string, unknown>): Session
      }).create(options.sessionId, {
        seed: options.seed, meta: options.meta,
        ...(compatible.inheritedEventCount === undefined ? {} : { inheritedEventCount: compatible.inheritedEventCount }),
      })
      return this.publish(session, options.setup)
    }
    async resume(options: ResumeAgentOptions): Promise<AgentHandle> {
      const log = fixture.logs.get(String(options.resumeSessionId))
      if (log === undefined) throw new Error('missing cold history')
      const session = Session.fromRestore(
        options.resumeSessionId, log.events, log.header, (log.seedLength ?? 0) as never, 'detached',
      )
      this.ctx.sessions.enter(session)
      this.ctx.sessions.announce(session)
      return this.publish(session, options.setup)
    }
    private async publish(session: Session, setup: CreateAgentOptions['setup'] | ResumeAgentOptions['setup']): Promise<AgentHandle> {
      const agent = {
        id: session.id, session, options: {}, status: 'idle', ctx: agentContext(), inbox: {},
        followup: (message: Parameters<Agent['followup']>[0]) => appendAnswer(session, message),
        whenIdle: () => Promise.resolve(),
      } as unknown as Agent
      await (setup as unknown as ((ctx: Context) => Promise<void>) | undefined)?.(agentContext())
      this.values.set(String(session.id), agent)
      return { agent, dispose: async () => { this.values.delete(String(session.id)) } }
    }
  }
  for (const plugin of [SessionStore, Persistence, Metadata, Tools, Agents, NestedFollowupsBranchService, NestedFollowupsService]) {
    const fiber = ctx.plugin(plugin)
    fibers.push(fiber)
    await fiber
  }
  return {
    ctx, fixture, repository,
    service: ctx.nestedFollowups,
    commands: ctx.nestedFollowupsBranches,
    dispose: async () => { for (const fiber of fibers.reverse()) await fiber.dispose() },
  }
}

describe.skipIf(Session.create(SessionId('legacy-migration-capability')).header.version < 4)('released history migration', () => {
  it('reads every nested branch after official migration renumbers streamed events', async () => {
    const runtime = await setup()
    try {
      const branchLog = runtime.fixture.logs.get('legacy-branch')!
      expect(runtime.fixture.branches[0]!.seedLength).toBeGreaterThan(branchLog.events.length)
      expect(branchLog.seedLength).toBeLessThan(runtime.fixture.branches[0]!.seedLength)
      const result = await runtime.service.readTree({ sessionId: String(SessionId('legacy-root')) })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.projection.nodes.map(node => node.messageId)).toEqual([
        'root-q1', 'root-a1', 'root-q2', 'root-a2', 'root-q3', 'root-a3',
        'branch-request', 'branch-a1', 'branch-q2', 'branch-a2',
        'sibling-request', 'sibling-a1', 'nested-request', 'nested-a1', 'deep-request', 'deep-a1',
      ])
      expect(result.value.projection.branches.every(branch => branch.nodeIds.length > 0)).toBe(true)
      expect(result.value.projection.branches.find(branch => branch.record.branchId === 'nested')?.branchPath).toEqual([1, 1, 1])
      expect(result.value.projection.branches.find(branch => branch.record.branchId === 'deep')?.branchPath).toEqual([1, 1, 1, 1])
      expect(result.value.projection.diagnostics).toEqual([])
    } finally {
      await runtime.dispose()
    }
  })

  it('does not rewrite the original rows, plugin metadata or migrated session events when reading', async () => {
    const runtime = await setup()
    try {
      const beforeRows = JSON.stringify([...runtime.fixture.sources])
      const beforeEvents = JSON.stringify([...runtime.fixture.logs])
      const beforeMetadata = runtime.repository.listBranches(runtime.fixture.tree.treeId)
      const beforeSerializedMetadata = JSON.stringify(beforeMetadata)
      for (const sessionId of ['legacy-root', 'legacy-nested']) {
        const result = await runtime.service.readTree({ sessionId })
        expect(result.ok && result.value.projection.nodes.some(node => node.messageId === 'deep-a1')).toBe(true)
      }
      expect(JSON.stringify([...runtime.fixture.sources])).toBe(beforeRows)
      expect(JSON.stringify([...runtime.fixture.logs])).toBe(beforeEvents)
      expect(JSON.stringify(runtime.repository.listBranches(runtime.fixture.tree.treeId))).toBe(beforeSerializedMetadata)
      for (const branch of beforeMetadata) expect(runtime.repository.getBranch(branch.branchId)).toBe(branch)
    } finally {
      await runtime.dispose()
    }
  })

  it('continues a migrated branch without changing its old coordinates or other sessions', async () => {
    const runtime = await setup()
    try {
      const beforeParent = JSON.stringify(runtime.fixture.logs.get('legacy-root'))
      const beforeSibling = JSON.stringify(runtime.fixture.logs.get('legacy-sibling'))
      const originalRecord = runtime.repository.getBranch('branch')!
      const history = runtime.fixture.logs.get('legacy-branch')!
      const tail = history.events.findLast((event): event is SessionEvent<'assistant/message'> => event.type === 'assistant/message')!
      const request = {
        ownerSessionId: 'legacy-root', branchId: 'branch', clientRequestId: 'continued-request',
        tail: { sessionId: 'legacy-branch', messageId: String(tail.data.message.id), seq: tail.seq },
        question: 'Continue this branch after upgrading DSH.',
      }
      const continued = await runtime.commands.continueBranch(request)
      expect(continued).toMatchObject({ ok: true, value: { action: 'continue-branch', sessionId: 'legacy-branch' } })
      expect(await runtime.commands.continueBranch(request)).toEqual(continued)
      await expect.poll(() => runtime.repository.getBranch('branch')?.status).toBe('ready')
      const result = await runtime.service.readTree({ sessionId: 'legacy-root' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const branchNodes = result.value.projection.nodes.filter(node => node.branchId === 'branch')
      expect(branchNodes.filter(node => node.messageId === request.clientRequestId)).toHaveLength(1)
      expect(branchNodes.at(-1)?.localTurnIndex).toBe(3)
      expect(result.value.projection.diagnostics).toEqual([])
      expect(runtime.repository.getBranch('branch')).toMatchObject({
        seedLength: originalRecord.seedLength, anchorSeq: originalRecord.anchorSeq,
        forkBoundarySeq: originalRecord.forkBoundarySeq,
      })
      expect(JSON.stringify(runtime.fixture.logs.get('legacy-root'))).toBe(beforeParent)
      expect(JSON.stringify(runtime.fixture.logs.get('legacy-sibling'))).toBe(beforeSibling)
    } finally {
      await runtime.dispose()
    }
  })

  it('creates another nested branch from a migrated answer without inheriting later or sibling discussion', async () => {
    const runtime = await setup()
    try {
      const beforeSources = JSON.stringify([...runtime.fixture.sources])
      const beforeMetadata = JSON.stringify(runtime.repository.listBranches('legacy-tree'))
      const source = runtime.fixture.logs.get('legacy-branch')!
      const anchor = source.events.find((event): event is SessionEvent<'assistant/message'> =>
        event.type === 'assistant/message' && String(event.data.message.id) === 'branch-a1')!
      const request = {
        ownerSessionId: 'legacy-root', clientRequestId: 'new-nested-request',
        anchor: { sessionId: 'legacy-branch', messageId: 'branch-a1', seq: anchor.seq },
        question: 'Explore this earlier branch answer in another child.',
      }
      const created = await runtime.commands.createBranch(request)
      expect(created.ok).toBe(true)
      if (!created.ok) return
      expect(await runtime.commands.createBranch(request)).toEqual(created)
      const session = runtime.ctx.sessions.get(SessionId(created.value.sessionId))!
      const messageIds = snapshotSessionEvents(session).flatMap(event => {
        if (event.type === 'user/message') return [String(event.data.id)]
        if (event.type === 'assistant/message') return [String(event.data.message.id)]
        return []
      })
      expect(messageIds).toEqual(expect.arrayContaining([
        'root-q1', 'root-a1', 'branch-request', 'branch-a1', request.clientRequestId,
      ]))
      for (const excluded of ['root-q2', 'root-a2', 'root-q3', 'branch-q2', 'branch-a2', 'sibling-request', 'nested-request', 'deep-request']) {
        expect(messageIds).not.toContain(excluded)
      }
      expect(messageIds.filter(id => id === request.clientRequestId)).toHaveLength(1)
      const result = await runtime.service.readTree({ sessionId: 'legacy-root' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.projection.branches.find(branch => branch.record.branchId === created.value.branchId)?.branchPath).toEqual([1, 1, 2])
      expect(result.value.projection.diagnostics).toEqual([])
      expect(JSON.stringify([...runtime.fixture.sources])).toBe(beforeSources)
      expect(JSON.stringify(runtime.repository.listBranches('legacy-tree').filter(branch => branch.branchId !== created.value.branchId))).toBe(beforeMetadata)
    } finally {
      await runtime.dispose()
    }
  })

  it('recognizes an already accepted legacy create request after its anchor coordinates changed', async () => {
    const runtime = await setup()
    try {
      const originalMetadata = JSON.stringify(runtime.repository.listBranches('legacy-tree'))
      const originalRows = JSON.stringify([...runtime.fixture.sources])
      const anchor = runtime.fixture.logs.get('legacy-root')!.events.find(
        (event): event is SessionEvent<'assistant/message'> =>
          event.type === 'assistant/message' && String(event.data.message.id) === 'root-a1',
      )!
      const request = {
        ownerSessionId: 'legacy-root', clientRequestId: 'branch-request',
        anchor: { sessionId: 'legacy-root', messageId: 'root-a1', seq: anchor.seq },
        question: 'Synthetic question branch-request.',
      }
      const repeated = await runtime.commands.createBranch(request)
      expect(repeated).toMatchObject({
        ok: true,
        value: { action: 'create-branch', branchId: 'branch', sessionId: 'legacy-branch', messageId: 'branch-request' },
      })
      expect(await runtime.commands.createBranch(request)).toEqual(repeated)
      expect(JSON.stringify(runtime.repository.listBranches('legacy-tree'))).toBe(originalMetadata)
      expect(JSON.stringify([...runtime.fixture.sources])).toBe(originalRows)
      expect(runtime.ctx.sessions.get(SessionId('legacy-branch'))).toBeUndefined()
    } finally {
      await runtime.dispose()
    }
  })
})

describe('unchanged legacy branch lineage', () => {
  const record: BranchRecord = {
    treeId: 'tree', branchId: 'branch', sessionId: 'child', clientRequestId: 'request',
    parentSessionId: 'parent', parentBranchId: null, anchorSessionId: 'parent',
    anchorMessageId: 'a1', anchorSeq: 3, forkBoundarySeq: 5, seedLength: 6,
    siblingOrdinal: 1, createdAt: 1, status: 'ready',
  }
  const header = {
    version: 0, id: SessionId('child'), createdAt: 1, parentSession: SessionId('parent'), origin: 'subagent',
    seedLength: 6,
  } as unknown as SessionHeader

  it('preserves original rc coordinates without requiring a newer catalog', () => {
    expect(resolveBranchHistory(record, {
      header, events: textTurn(0, 1, 'q1', 'a1', 'synthetic q', 'synthetic a'), seedLength: 6,
    })).toBe(record)
  })

  it('still rejects a session that is no longer the recorded subagent child', () => {
    expect(() => resolveBranchHistory(record, {
      header: { ...header, parentSession: SessionId('unrelated') },
      events: textTurn(0, 1, 'q1', 'a1', 'synthetic q', 'synthetic a'), seedLength: 6,
    })).toThrow('immutable branch lineage')
  })
})
