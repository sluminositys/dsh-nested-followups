import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'

import type { BranchRecord, TreeRecord } from '../../src/shared/types.ts'

interface LegacyEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: Readonly<Record<string, unknown>>
  readonly surfaceOp?: 'append'
  readonly sourceEventSeqs?: readonly number[]
}

export interface LegacySessionFixture {
  readonly header: Readonly<Record<string, unknown>>
  readonly events: readonly LegacyEvent[]
}

export interface MigratedHistoryFixture {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly seedLength?: number
}

/** Synthetic released-v0 rows: no captured user text, IDs, paths or credentials. */
function streamedTurn(start: number, turn: number, questionId: string, answerId: string): LegacyEvent[] {
  const rows: LegacyEvent[] = []
  const emit = (type: string, data: Readonly<Record<string, unknown>>, surface = false, sources?: readonly number[]): void => {
    const seq = start + rows.length
    rows.push({
      type, seq, time: 1_000 + seq, data,
      ...(surface ? { surfaceOp: 'append' as const } : {}),
      ...(sources === undefined ? {} : { sourceEventSeqs: sources }),
    })
  }
  const text = `Synthetic answer ${answerId}.`
  emit('turn/start', { turn })
  emit('step/start', { turn, step: 1 })
  emit('user/message', {
    id: questionId, role: 'user', content: [{ type: 'text', text: `Synthetic question ${questionId}.` }],
    source: { kind: 'user' },
  }, true)
  emit('assistant/chunk', { turn, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } })
  // More physical events than the entire migrated log: using an old cut as a
  // new offset must reproduce empty branches, not merely lose one early node.
  for (const character of text) {
    emit('assistant/chunk', { turn, step: 1, chunk: { type: 'text-delta', index: 0, text: character } })
  }
  emit('assistant/chunk', { turn, step: 1, chunk: { type: 'block-end', index: 0, block: { type: 'text', text } } })
  emit('assistant/message', {
    turn, step: 1,
    message: {
      id: answerId, role: 'assistant', content: [{ type: 'text', text }],
      source: { kind: 'model', provider: 'fixture', model: 'fixture-model' },
    },
  }, true, rows.filter(event => event.type === 'assistant/chunk').map(event => event.seq))
  emit('step/end', { turn, step: 1 })
  emit('turn/end', { turn, reason: { kind: 'completed' } })
  return rows
}

function physicalHeader(id: string, parentSession?: string, seedLength?: number): Readonly<Record<string, unknown>> {
  return {
    type: 'session', version: 0, id, createdAt: 1, delegationDepth: 0,
    cwd: 'D:\\synthetic-project',
    ...(parentSession === undefined ? {} : { parentSession, seedLength, origin: 'subagent' }),
  }
}

/** Run the official complete adjacent migration chain entirely in memory. */
export async function migrateLegacySession(source: LegacySessionFixture): Promise<MigratedHistoryFixture> {
  // The catalog did not exist on rc.7. Keep this fixture lazy so the ordinary
  // lineage tests still load and run against the legacy compatibility matrix.
  const packageName = '@deepseek-ai/dsh-session-format-catalog'
  const { createSessionFormatCatalogWithChildren } = await import(packageName)
  const catalog = createSessionFormatCatalogWithChildren([])
  const restore = catalog.createRestore(source.header, { recovery: 'strict', validation: 'current' })
  for (const event of source.events) restore.decodeRow(event)
  const migrated = restore.finish()
  return {
    header: migrated.header as unknown as SessionHeader,
    events: migrated.events as unknown as readonly SessionEvent[],
    ...(migrated.header.isSeeded ? { seedLength: migrated.inheritedEventCount } : {}),
  }
}

export async function createLegacyHistoryFixture() {
  const rootOne = streamedTurn(0, 1, 'root-q1', 'root-a1')
  const rootTwo = streamedTurn(rootOne.length, 2, 'root-q2', 'root-a2')
  const rootThree = streamedTurn(rootOne.length + rootTwo.length, 3, 'root-q3', 'root-a3')
  const branchOne = streamedTurn(rootOne.length, 2, 'branch-request', 'branch-a1')
  const branchTwo = streamedTurn(rootOne.length + branchOne.length, 3, 'branch-q2', 'branch-a2')
  const nestedOne = streamedTurn(rootOne.length + branchOne.length, 3, 'nested-request', 'nested-a1')
  const deepOne = streamedTurn(rootOne.length + branchOne.length + nestedOne.length, 4, 'deep-request', 'deep-a1')
  const siblingOne = streamedTurn(rootOne.length, 2, 'sibling-request', 'sibling-a1')
  const tree: TreeRecord = {
    treeId: 'legacy-tree', rootSessionId: 'legacy-root', version: 1, createdAt: 1, updatedAt: 1,
  }
  const sources = new Map<string, LegacySessionFixture>([
    ['legacy-root', { header: physicalHeader('legacy-root'), events: [...rootOne, ...rootTwo, ...rootThree] }],
    ['legacy-branch', {
      header: physicalHeader('legacy-branch', 'legacy-root', rootOne.length),
      events: [...rootOne, ...branchOne, ...branchTwo],
    }],
    ['legacy-nested', {
      header: physicalHeader('legacy-nested', 'legacy-branch', rootOne.length + branchOne.length),
      events: [...rootOne, ...branchOne, ...nestedOne],
    }],
    ['legacy-deep', {
      header: physicalHeader('legacy-deep', 'legacy-nested', rootOne.length + branchOne.length + nestedOne.length),
      events: [...rootOne, ...branchOne, ...nestedOne, ...deepOne],
    }],
    ['legacy-sibling', {
      header: physicalHeader('legacy-sibling', 'legacy-root', rootOne.length),
      events: [...rootOne, ...siblingOne],
    }],
  ])
  const record = (
    branchId: string, sessionId: string, parentSessionId: string, parentBranchId: string | null,
    anchorMessageId: string, anchorTurn: readonly LegacyEvent[], seedLength: number, ordinal = 1,
  ): BranchRecord => ({
    branchId, sessionId, treeId: tree.treeId, clientRequestId: `${branchId}-request`,
    parentSessionId, parentBranchId, anchorSessionId: parentSessionId, anchorMessageId,
    anchorSeq: anchorTurn.find(event => event.type === 'assistant/message')!.seq,
    forkBoundarySeq: seedLength - 1, seedLength, siblingOrdinal: ordinal,
    createdAt: sources.size + seedLength + ordinal, status: 'ready',
  })
  const branches = [
    record('branch', 'legacy-branch', 'legacy-root', null, 'root-a1', rootOne, rootOne.length),
    record('nested', 'legacy-nested', 'legacy-branch', 'branch', 'branch-a1', branchOne, rootOne.length + branchOne.length),
    record('deep', 'legacy-deep', 'legacy-nested', 'nested', 'nested-a1', nestedOne, rootOne.length + branchOne.length + nestedOne.length),
    record('sibling', 'legacy-sibling', 'legacy-root', null, 'root-a1', rootOne, rootOne.length, 2),
  ]
  const logs = new Map(await Promise.all([...sources].map(async ([id, source]) => [id, await migrateLegacySession(source)] as const)))
  return { tree, branches, sources, logs }
}
