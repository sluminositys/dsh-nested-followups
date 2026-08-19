import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import type {
  Agent,
  AgentHandle,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, {
  SessionId,
  type Session,
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
import { describe, expect, it, vi } from 'vitest'

import { NestedFollowupsBranchService } from '../src/host/branch-service.ts'
import { projectConversationTree, type SessionLogSnapshot } from '../src/host/projection.ts'
import { TreeMetadataRepository } from '../src/host/storage.ts'
import type { BranchRecord, TreeRecord } from '../src/shared/types.ts'
import { textTurn } from './fixtures/session-events.ts'

class MemoryTable<V> implements KvTable<string, V> {
  readonly values = new Map<string, V>()
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

/** Expose ordinal-allocation races that an asynchronously durable table can hit. */
class YieldingMemoryTable<V> extends MemoryTable<V> {
  override async put(key: string, value: V): Promise<void> {
    await Promise.resolve()
    this.values.set(key, value)
  }
}

class MemoryPersistence extends SessionPersistence {
  readonly supportsRawArtifacts = false
  locate(_meta: SessionHeader): SessionLocation | undefined { return undefined }
  async create(_meta: SessionHeader): Promise<void> {}
  async append(_id: SessionId, _events: readonly SessionEvent[]): Promise<void> {}
  async load(_id: SessionId): Promise<SessionInspection> { throw new Error('not persisted') }
  async inspect(_id: SessionId, _signal?: AbortSignal): Promise<SessionInspection> {
    throw new Error('not persisted')
  }
  async readFrom(
    _id: SessionId,
    _fromSeq: number,
    _signal?: AbortSignal,
  ): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    throw new Error('not persisted')
  }
  async list(_signal?: AbortSignal): Promise<SessionHeader[]> { return [] }
  async listSnapshots(_signal?: AbortSignal): Promise<SessionPersistenceSnapshot[]> { return [] }
}

interface ReadOnlySetupRecord {
  readonly modes: string[]
  readonly restrictions: unknown[]
  readonly guards: Array<(execution: { name: string }) => string | undefined>
}

function setupContext(record: ReadOnlySetupRecord): Context {
  const tools = {
    presentAs: (mode: string) => {
      record.modes.push(mode)
      return () => {}
    },
    restrict: (restriction: unknown) => {
      record.restrictions.push(restriction)
      return () => {}
    },
    guard: (guard: (execution: { name: string }) => string | undefined) => {
      record.guards.push(guard)
      return () => {}
    },
  }
  return {
    get: (name: string) => name === 'tools' ? tools : undefined,
    on: () => () => {},
  } as unknown as Context
}

function appendTextTurn(session: Session, question: Parameters<Agent['followup']>[0]): void {
  const turn = (session.events.findLast(event => event.type === 'turn/start')?.data.turn ?? 0) + 1
  const step = 1
  session.append('turn/start', { turn })
  session.append('user/message', question, { surfaceOp: 'append' })
  session.append('step/start', { turn, step })
  session.append('assistant/message', {
    turn,
    step,
    message: createAssistantMessage({
      content: [{ type: 'text', text: `text-only answer ${turn}` }],
      source: { provider: 'test', model: 'test-model' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

class ToolsCapabilityStub extends Service {
  constructor(ctx: Context) { super(ctx, 'tools') }
  presentAs(): () => void { return () => {} }
  restrict(): () => void { return () => {} }
  guard(): () => void { return () => {} }
}

class AgentsStub extends Service {
  readonly setupRecords: ReadOnlySetupRecord[] = []
  readonly deliveredPrompts: string[] = []
  failNextCreate = false
  failNextFollowup = false
  private readonly values = new Map<SessionId, Agent>()

  constructor(ctx: Context) { super(ctx, 'agents') }

  get(id: SessionId): Agent | undefined { return this.values.get(id) }

  async create(options: CreateAgentOptions): Promise<AgentHandle> {
    if (this.failNextCreate) {
      this.failNextCreate = false
      throw new Error('injected branch session creation failure')
    }
    const session = this.ctx.sessions.create(options.sessionId, {
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    })
    return this.publish(session, options.setup)
  }

  async resume(options: ResumeAgentOptions): Promise<AgentHandle> {
    const session = this.ctx.sessions.get(options.resumeSessionId)
    if (session === undefined) throw new Error('test session is not live')
    return this.publish(session, options.setup)
  }

  private async publish(
    session: Session,
    setup: CreateAgentOptions['setup'] | ResumeAgentOptions['setup'],
  ): Promise<AgentHandle> {
    const record: ReadOnlySetupRecord = { modes: [], restrictions: [], guards: [] }
    this.setupRecords.push(record)
    await setup?.(setupContext(record))
    const state = { status: 'idle' as 'idle' | 'running' }
    const agent = {
      id: session.id,
      session,
      options: {},
      ctx: setupContext(record),
      inbox: {},
      get status() { return state.status },
      followup: (message: Parameters<Agent['followup']>[0]) => {
        if (this.failNextFollowup) {
          this.failNextFollowup = false
          throw new Error('injected prompt delivery failure')
        }
        state.status = 'running'
        this.deliveredPrompts.push(String(message.id))
        appendTextTurn(session, message)
        state.status = 'idle'
      },
      whenIdle: () => Promise.resolve(),
    } as unknown as Agent
    this.values.set(session.id, agent)
    return {
      agent,
      dispose: vi.fn(async () => { this.values.delete(session.id) }),
    }
  }
}

function latestAssistant(session: Session): SessionEvent<'assistant/message'> {
  const event = session.events.findLast(
    (candidate): candidate is SessionEvent<'assistant/message'> => candidate.type === 'assistant/message',
  )
  if (event === undefined) throw new Error('assistant message missing')
  return event
}

function appendOpenStreamingTurn(session: Session, turn: number, marker: string): void {
  session.append('turn/start', { turn })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: marker }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn, step: 1 })
  session.append('assistant/chunk', {
    turn,
    step: 1,
    chunk: { type: 'text-delta', index: 0, text: 'still streaming' },
  })
}

async function setup(branches: MemoryTable<BranchRecord> = new MemoryTable<BranchRecord>()) {
  const ctx = new Context()
  const fibers: Fiber[] = []
  const trees = new MemoryTable<TreeRecord>()
  const repository = new TreeMetadataRepository(trees, branches)

  for (const plugin of [SessionStore, MemoryPersistence, ToolsCapabilityStub, AgentsStub]) {
    const fiber = ctx.plugin(plugin)
    fibers.push(fiber)
    await fiber
  }
  class MetadataStub extends Service {
    readonly repository = repository
    constructor(owner: Context) { super(owner, 'nestedFollowupsMetadata') }
  }
  const metadata = ctx.plugin(MetadataStub)
  fibers.push(metadata)
  await metadata
  const serviceFiber = ctx.plugin(NestedFollowupsBranchService)
  fibers.push(serviceFiber)
  await serviceFiber

  const root = ctx.sessions.create(SessionId('root'), {
    seed: textTurn(0, 1, 'q1', 'a1', 'root question', 'root answer'),
    meta: { cwd: 'D:\\workspace\\project' },
  })
  return {
    ctx,
    root,
    repository,
    trees,
    branches,
    service: ctx.nestedFollowupsBranches,
    agents: ctx.agents as unknown as AgentsStub,
    dispose: async () => {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    },
  }
}

function projection(
  repository: TreeMetadataRepository,
  root: Session,
  ctx: Context,
) {
  const tree = repository.getTreeByRootSession(String(root.id))
  if (tree === undefined) throw new Error('tree missing')
  const records = repository.listBranches(tree.treeId)
  const logs = new Map<string, SessionLogSnapshot>()
  logs.set(String(root.id), { sessionId: String(root.id), events: root.events })
  for (const record of records) {
    const session = ctx.sessions.get(SessionId(record.sessionId))
    if (session !== undefined) {
      logs.set(record.sessionId, {
        sessionId: record.sessionId,
        events: session.events,
        ...(session.header.seedLength === undefined
          ? {}
          : { seedLength: session.header.seedLength }),
      })
    }
  }
  return projectConversationTree(tree, records, logs)
}

describe('Host branch commands', () => {
  it('persists a UTF-16 text anchor and sends its quote only to the branch', async () => {
    const runtime = await setup()
    try {
      const rootEventCount = runtime.root.events.length
      const request = {
        ownerSessionId: 'root',
        clientRequestId: 'request-text-anchor',
        anchor: {
          sessionId: 'root',
          messageId: 'a1',
          seq: 3,
          range: { start: 0, end: 4, text: 'root' },
        },
        question: 'What does this word mean?',
      } as const

      const created = await runtime.service.createBranch(request)
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const record = runtime.repository.getBranch(created.value.branchId)
      expect(record?.anchorRange).toEqual(request.anchor.range)

      const branchSession = runtime.ctx.sessions.get(SessionId(created.value.sessionId))
      if (branchSession === undefined) throw new Error('branch session missing')
      const delivered = branchSession.events.find((event): event is SessionEvent<'user/message'> =>
        event.type === 'user/message' && String(event.data.id) === request.clientRequestId)
      expect(delivered?.data.content).toEqual([
        { type: 'text', text: '> root\n\nWhat does this word mean?' },
      ])
      expect(runtime.root.events).toHaveLength(rootEventCount)

      const projected = projection(runtime.repository, runtime.root, runtime.ctx)
      expect(projected.branches[0]?.anchorStatus).toBe('range-valid')
      expect(projected.nodes.find(node => node.messageId === request.clientRequestId))
        .toEqual(expect.objectContaining({
          text: request.question,
          summary: request.question,
        }))

      const repeated = await runtime.service.createBranch(request)
      expect(repeated).toEqual(created)
      expect(branchSession.events.filter(event =>
        event.type === 'user/message' && String(event.data.id) === request.clientRequestId))
        .toHaveLength(1)
    } finally {
      await runtime.dispose()
    }
  })

  it('rejects an empty or stale text selection before creating a branch', async () => {
    const runtime = await setup()
    try {
      for (const range of [
        { start: 0, end: 0, text: '' },
        { start: 0, end: 4, text: 'stale' },
      ]) {
        const result = await runtime.service.createBranch({
          ownerSessionId: 'root',
          clientRequestId: `invalid-${range.text || 'empty'}`,
          anchor: { sessionId: 'root', messageId: 'a1', seq: 3, range },
          question: 'must not be sent',
        })
        expect(result).toMatchObject({ ok: false, error: { code: 'anchor-invalid' } })
      }
      expect(runtime.repository.listBranches('root')).toEqual([])
    } finally {
      await runtime.dispose()
    }
  })

  it('recovers a forked session whose first prompt failed without duplicating the branch', async () => {
    const runtime = await setup()
    try {
      runtime.agents.failNextFollowup = true
      const request = {
        ownerSessionId: 'root',
        clientRequestId: 'request-recover-create',
        anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'deliver exactly once after retry',
      } as const

      const failed = await runtime.service.createBranch(request)
      expect(failed).toMatchObject({ ok: false, error: { code: 'prompt-failed' } })
      const retained = runtime.repository.getBranchByClientRequest('root', request.clientRequestId)
      expect(retained).toMatchObject({ status: 'failed' })
      expect(runtime.repository.listBranches('root')).toHaveLength(1)

      const recovered = await runtime.service.createBranch(request)
      expect(recovered).toMatchObject({ ok: true, value: { action: 'create-branch' } })
      expect(runtime.repository.listBranches('root')).toHaveLength(1)
      expect(runtime.agents.deliveredPrompts).toEqual([request.clientRequestId])

      const repeated = await runtime.service.createBranch(request)
      expect(repeated).toEqual(recovered)
      expect(runtime.agents.deliveredPrompts).toEqual([request.clientRequestId])

      const conflict = await runtime.service.createBranch({ ...request, question: 'different content' })
      expect(conflict).toMatchObject({ ok: false, error: { code: 'request-conflict' } })
    } finally {
      await runtime.dispose()
    }
  })

  it('removes the reservation after fork creation fails and leaves the root untouched', async () => {
    const runtime = await setup()
    try {
      runtime.agents.failNextCreate = true
      const rootBefore = JSON.stringify(runtime.root.events)
      const result = await runtime.service.createBranch({
        ownerSessionId: 'root',
        clientRequestId: 'request-fork-failure',
        anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'this prompt must never be delivered',
      })

      expect(result).toMatchObject({ ok: false, error: { code: 'fork-failed' } })
      expect(runtime.repository.listBranches('root')).toEqual([])
      expect(runtime.agents.deliveredPrompts).toEqual([])
      expect(JSON.stringify(runtime.root.events)).toBe(rootBefore)
    } finally {
      await runtime.dispose()
    }
  })

  it('creates concurrent siblings from a completed turn while the root keeps streaming', async () => {
    const runtime = await setup(new YieldingMemoryTable<BranchRecord>())
    try {
      const completedPrefixLength = runtime.root.events.length
      appendOpenStreamingTurn(runtime.root, 2, 'ROOT_STILL_STREAMING')
      const rootBefore = JSON.stringify(runtime.root.events)
      const results = await Promise.all([
        runtime.service.createBranch({
          ownerSessionId: 'root',
          clientRequestId: 'concurrent-sibling-1',
          anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
          question: 'first concurrent clarification',
        }),
        runtime.service.createBranch({
          ownerSessionId: 'root',
          clientRequestId: 'concurrent-sibling-2',
          anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
          question: 'second concurrent clarification',
        }),
      ])

      expect(results.every(result => result.ok)).toBe(true)
      const records = runtime.repository.listBranches('root')
      expect(records).toHaveLength(2)
      expect(records.map(record => record.siblingOrdinal).sort((left, right) => left - right))
        .toEqual([1, 2])
      expect(new Set(records.map(record => record.sessionId)).size).toBe(2)
      expect(records.every(record => record.seedLength === completedPrefixLength)).toBe(true)
      for (const record of records) {
        const session = runtime.ctx.sessions.get(SessionId(record.sessionId))
        expect(session?.header.origin).toBe('subagent')
        expect(JSON.stringify(session?.events)).not.toContain('ROOT_STILL_STREAMING')
      }
      expect(runtime.agents.deliveredPrompts.sort()).toEqual([
        'concurrent-sibling-1',
        'concurrent-sibling-2',
      ])
      expect(JSON.stringify(runtime.root.events)).toBe(rootBefore)
    } finally {
      await runtime.dispose()
    }
  })

  it('keeps three Continue turns linear, keeps Ask follow-up branching, and restores the same tree', async () => {
    const runtime = await setup()
    try {
      const created = await runtime.service.createBranch({
        ownerSessionId: 'root',
        clientRequestId: 'request-create-1',
        anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'first branch turn',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const branchId = created.value.branchId
      const branchSession = runtime.ctx.sessions.get(SessionId(created.value.sessionId))
      if (branchSession === undefined) throw new Error('branch session missing')

      for (let index = 2; index <= 4; index++) {
        const tail = latestAssistant(branchSession)
        const continued = await runtime.service.continueBranch({
          ownerSessionId: 'root',
          clientRequestId: `request-continue-${index}`,
          branchId,
          tail: {
            sessionId: String(branchSession.id),
            messageId: String(tail.data.message.id),
            seq: tail.seq,
          },
          question: `linear turn ${index}`,
        })
        expect(continued.ok && continued.value.action).toBe('continue-branch')
      }

      const beforeChild = projection(runtime.repository, runtime.root, runtime.ctx)
      const branchAssistants = beforeChild.nodes.filter(node =>
        node.branchId === branchId && node.role === 'assistant')
      expect(branchAssistants.map(node => node.localTurnIndex)).toEqual([1, 2, 3, 4])
      expect(beforeChild.branches).toHaveLength(1)

      const firstBranchAnswer = branchAssistants[0]
      if (firstBranchAnswer === undefined) throw new Error('first branch answer missing')
      const nested = await runtime.service.createBranch({
        ownerSessionId: 'root',
        clientRequestId: 'request-nested',
        anchor: {
          sessionId: firstBranchAnswer.sessionId,
          messageId: firstBranchAnswer.messageId,
          seq: firstBranchAnswer.seq,
        },
        question: 'new child branch',
      })
      expect(nested.ok && nested.value.action).toBe('create-branch')

      const complete = projection(runtime.repository, runtime.root, runtime.ctx)
      expect(complete.branches).toHaveLength(2)
      expect(complete.branches.find(item => item.record.branchId === branchId)?.nodeIds)
        .toHaveLength(8)
      expect(complete.branches.find(item => item.record.parentBranchId === branchId)?.branchPath)
        .toEqual([1, 1, 1])

      const restartedRepository = new TreeMetadataRepository(runtime.trees, runtime.branches)
      const restored = projection(restartedRepository, runtime.root, runtime.ctx)
      expect(restored).toEqual(complete)

      expect(branchSession.events.some(event =>
        event.type === 'tool/call' || event.type === 'tool/result')).toBe(false)
      // Every completed branch round is detached so rc.7 classifies a
      // descriptorless child as a settled diagnostic instead of a perpetual
      // creation window. Three Continue rounds therefore resume through the
      // same read-only setup before the nested branch is created.
      expect(runtime.agents.setupRecords).toHaveLength(5)
      for (const record of runtime.agents.setupRecords) {
        // Nothing that would alter the request prefix: no presentation
        // override and no schema restriction, only the execution gate.
        expect(record.modes).toEqual([])
        expect(record.restrictions).toEqual([])
        expect(record.guards).toHaveLength(1)
        expect(record.guards[0]?.({ name: 'read' })).toBeUndefined()
        expect(record.guards[0]?.({ name: 'write' })).toContain('read-only')
      }
    } finally {
      await runtime.dispose()
    }
  })

  it('rejects Continue on the mainline and a non-tail node', async () => {
    const runtime = await setup()
    try {
      const mainline = await runtime.service.continueBranch({
        ownerSessionId: 'root',
        clientRequestId: 'mainline',
        branchId: 'missing',
        tail: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'must not run',
      })
      expect(mainline).toMatchObject({ ok: false, error: { code: 'branch-not-found' } })

      const created = await runtime.service.createBranch({
        ownerSessionId: 'root',
        clientRequestId: 'request-create-2',
        anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'first branch turn',
      })
      if (!created.ok) throw new Error('branch creation failed')
      const branchSession = runtime.ctx.sessions.get(SessionId(created.value.sessionId))
      if (branchSession === undefined) throw new Error('branch session missing')
      const firstQuestion = branchSession.events.find(
        (event): event is SessionEvent<'user/message'> =>
          event.type === 'user/message' && String(event.data.id) === 'request-create-2',
      )
      if (firstQuestion === undefined) throw new Error('question missing')
      const nonTail = await runtime.service.continueBranch({
        ownerSessionId: 'root',
        clientRequestId: 'bad-tail',
        branchId: created.value.branchId,
        tail: {
          sessionId: created.value.sessionId,
          messageId: String(firstQuestion.data.id),
          seq: firstQuestion.seq,
        },
        question: 'must not run',
      })
      expect(nonTail).toMatchObject({ ok: false, error: { code: 'branch-not-tail' } })
    } finally {
      await runtime.dispose()
    }
  })

  it('refuses to drive a branch Agent owned by the native session runtime', async () => {
    const runtime = await setup()
    try {
      const created = await runtime.service.createBranch({
        ownerSessionId: 'root',
        clientRequestId: 'request-native-owner',
        anchor: { sessionId: 'root', messageId: 'a1', seq: 3 },
        question: 'first branch turn',
      })
      if (!created.ok) throw new Error('branch creation failed')
      const branchSession = runtime.ctx.sessions.get(SessionId(created.value.sessionId))
      if (branchSession === undefined) throw new Error('branch session missing')

      const nativeHandle = await runtime.agents.resume({
        resumeSessionId: branchSession.id,
      })
      try {
        const tail = latestAssistant(branchSession)
        const result = await runtime.service.continueBranch({
          ownerSessionId: 'root',
          clientRequestId: 'native-owner-continue',
          branchId: created.value.branchId,
          tail: {
            sessionId: String(branchSession.id),
            messageId: String(tail.data.message.id),
            seq: tail.seq,
          },
          question: 'must remain fenced',
        })
        expect(result).toMatchObject({
          ok: false,
          error: {
            code: 'branch-busy',
            message: expect.stringContaining('native session runtime'),
          },
        })
      } finally {
        await nativeHandle.dispose()
      }
    } finally {
      await runtime.dispose()
    }
  })
})
