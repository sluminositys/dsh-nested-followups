import { BlockAssembler, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

import type {
  BranchProjectionView,
  ConversationTreeProjection,
  ProjectionDiagnostic,
  TreeEdgeView,
} from '../shared/projection.ts'
import type { AnchorRange, BranchRecord, MessageNodeState, MessageNodeView, TreeRecord } from '../shared/types.ts'
import { extractAnchoredQuestion } from '../shared/anchored-question.ts'

export { displayLabelOf } from '../shared/labels.ts'
export type {
  BranchProjectionView,
  ConversationTreeProjection,
  ProjectionDiagnostic,
  ProjectionDiagnosticCode,
  TreeEdgeView,
} from '../shared/projection.ts'

const SUMMARY_LIMIT = 180

export interface SessionLogSnapshot {
  sessionId: string
  events: readonly SessionEvent[]
  /** Durable header value. Used to detect stale branch metadata. */
  seedLength?: number
}

interface VisibleMessage {
  role: 'user' | 'assistant'
  messageId: string
  turn: number | undefined
  seq: number
  time: number
  text: string
  state: MessageNodeState
  branchTargetMessageId?: string
  branchTargetSeq?: number
}

interface BranchTarget {
  readonly messageId: string
  readonly seq: number
}

function eventOrder(left: SessionEvent, right: SessionEvent): number {
  return left.seq - right.seq
}

function sourceText(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n\n')
}

export function summarizeMessage(text: string, role: 'user' | 'assistant'): string {
  const normalized = text.replace(/\s+/gu, ' ').trim()
  const fallback = role === 'user' ? '[Non-text question]' : '[Non-text response]'
  if (normalized.length === 0) return fallback
  if (normalized.length <= SUMMARY_LIMIT) return normalized
  return `${normalized.slice(0, SUMMARY_LIMIT - 1)}…`
}

export function validateAnchorRange(text: string, range: AnchorRange): boolean {
  return range.start <= range.end
    && range.end <= text.length
    && text.slice(range.start, range.end) === range.text
}

export function nodeIdFor(sessionId: string, messageId: string): string {
  return `${sessionId}:${messageId}`
}

function messageKey(sessionId: string, messageId: string): string {
  return `${sessionId}\u0000${messageId}`
}

function turnState(
  turn: number | undefined,
  endings: ReadonlyMap<number, SessionEvent<'turn/end'>>,
): MessageNodeState {
  if (turn === undefined) return 'streaming'
  const ending = endings.get(turn)
  if (ending === undefined) return 'streaming'
  const kind = ending.data.reason.kind
  return kind === 'completed' || kind === 'max-tokens' ? 'complete' : 'error'
}

function visibleMessages(events: readonly SessionEvent[], minimumSeq: number): VisibleMessage[] {
  const ordered = [...events].sort(eventOrder)
  const endings = new Map<number, SessionEvent<'turn/end'>>()
  const turnAtUserEvent = new Map<number, number>()
  const completedSteps = new Set<string>()
  const streamingSteps = new Map<string, {
    turn: number
    step: number
    seq: number
    time: number
    chunks: number
    assembler: BlockAssembler
  }>()
  let currentTurn: number | undefined

  for (const event of ordered) {
    if (event.type === 'turn/start') currentTurn = event.data.turn
    if (event.type === 'user/message' && currentTurn !== undefined) {
      turnAtUserEvent.set(event.seq, currentTurn)
    }
    if (event.type === 'turn/end') {
      endings.set(event.data.turn, event)
      if (currentTurn === event.data.turn) currentTurn = undefined
    }
    if (event.type === 'assistant/message') {
      completedSteps.add(`${event.data.turn}:${event.data.step}`)
    }
    if (event.type === 'step/start') {
      streamingSteps.set(`${event.data.turn}:${event.data.step}`, {
        turn: event.data.turn,
        step: event.data.step,
        seq: event.seq,
        time: event.time,
        chunks: 0,
        assembler: new BlockAssembler(),
      })
    }
    if (event.type === 'assistant/chunk') {
      const key = `${event.data.turn}:${event.data.step}`
      const current = streamingSteps.get(key) ?? {
        turn: event.data.turn,
        step: event.data.step,
        seq: event.seq,
        time: event.time,
        chunks: 0,
        assembler: new BlockAssembler(),
      }
      try {
        current.assembler.push(event.data.chunk)
      } catch {
        // A corrupted or future chunk kind must not make the entire tree
        // unreadable. The durable assistant/message remains authoritative.
      }
      current.chunks += 1
      streamingSteps.set(key, current)
    }
  }

  const finalSurfaceByTurn = new Map<number, SessionEvent>()
  for (const event of ordered) {
    if (event.type === 'assistant/message' || event.type === 'tool/result') {
      const ending = endings.get(event.data.turn)
      if (ending !== undefined && event.seq < ending.seq) {
        finalSurfaceByTurn.set(event.data.turn, event)
      }
      continue
    }
    if (event.type === 'user/message') {
      const turn = turnAtUserEvent.get(event.seq)
      const ending = turn === undefined ? undefined : endings.get(turn)
      if (turn !== undefined && ending !== undefined && event.seq < ending.seq) {
        finalSurfaceByTurn.set(turn, event)
      }
    }
  }
  const branchTargets = new Map<number, BranchTarget>()
  for (const [turn, event] of finalSurfaceByTurn) {
    if (event.type !== 'assistant/message') continue
    if (sourceText(event.data.message.content).trim().length === 0) continue
    branchTargets.set(turn, {
      messageId: String(event.data.message.id),
      seq: event.seq,
    })
  }

  const messages: VisibleMessage[] = []
  for (const event of ordered) {
    if (event.seq < minimumSeq) continue
    if (event.type === 'user/message') {
      if (event.data.source.kind !== 'user') continue
      messages.push({
        role: 'user',
        messageId: String(event.data.id),
        turn: turnAtUserEvent.get(event.seq),
        seq: event.seq,
        time: event.time,
        text: sourceText(event.data.content),
        state: 'complete',
      })
      continue
    }
    if (event.type === 'assistant/message') {
      const branchTarget = branchTargets.get(event.data.turn)
      messages.push({
        role: 'assistant',
        messageId: String(event.data.message.id),
        turn: event.data.turn,
        seq: event.seq,
        time: event.time,
        text: sourceText(event.data.message.content),
        state: turnState(event.data.turn, endings),
        ...(branchTarget === undefined ? {} : {
          branchTargetMessageId: branchTarget.messageId,
          branchTargetSeq: branchTarget.seq,
        }),
      })
    }
  }
  for (const [key, partial] of streamingSteps) {
    if (completedSteps.has(key) || partial.seq < minimumSeq) continue
    let text = ''
    try {
      text = sourceText(partial.assembler.blocks())
    } catch {
      // A malformed or future block kind remains an empty live placeholder;
      // the durable final assistant/message is still authoritative.
    }
    messages.push({
      role: 'assistant',
      messageId: `stream-${partial.turn}-${partial.step}`,
      turn: partial.turn,
      seq: partial.seq,
      time: partial.time,
      text,
      state: endings.has(partial.turn)
        ? 'error'
        : partial.chunks === 0
          ? 'queued'
          : 'streaming',
    })
  }
  messages.sort((left, right) => left.seq - right.seq)
  return messages
}

function nodesForSession(
  treeId: string,
  branchId: string | null,
  branchPath: readonly number[],
  log: SessionLogSnapshot,
  minimumSeq: number,
): MessageNodeView[] {
  const messages = visibleMessages(log.events, minimumSeq)
  const localTurns = new Map<number, number>()
  let nextLocalTurn = 1
  for (const message of messages) {
    if (message.turn !== undefined && !localTurns.has(message.turn)) {
      localTurns.set(message.turn, nextLocalTurn++)
    }
  }

  return messages.map((message, index) => {
    const localTurnIndex = message.turn === undefined
      ? Math.max(1, index + 1)
      : (localTurns.get(message.turn) ?? Math.max(1, index + 1))
    const path = branchId === null ? [localTurnIndex] : [...branchPath]
    return {
      nodeId: nodeIdFor(log.sessionId, message.messageId),
      treeId,
      branchId,
      sessionId: log.sessionId,
      messageId: message.messageId,
      seq: message.seq,
      role: message.role,
      ...(message.turn === undefined ? {} : { turnId: `${log.sessionId}:${message.turn}` }),
      branchPath: Object.freeze(path),
      localTurnIndex,
      time: message.time,
      text: message.text,
      summary: message.text.length === 0 ? '' : summarizeMessage(message.text, message.role),
      state: message.state,
      ...(message.branchTargetMessageId === undefined || message.branchTargetSeq === undefined ? {} : {
        branchTargetMessageId: message.branchTargetMessageId,
        branchTargetSeq: message.branchTargetSeq,
      }),
    }
  })
}

function sequenceEdges(nodes: readonly MessageNodeView[]): TreeEdgeView[] {
  const edges: TreeEdgeView[] = []
  for (let index = 1; index < nodes.length; index++) {
    const source = nodes[index - 1]
    const target = nodes[index]
    if (source === undefined || target === undefined) continue
    edges.push({
      edgeId: `sequence:${source.nodeId}:${target.nodeId}`,
      sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId,
      kind: 'sequence',
    })
  }
  return edges
}

function isDirectlyDeleted(branch: BranchRecord): boolean {
  return branch.status === 'deleted' || branch.deletedAt !== undefined
}

/** Build the de-duplicated message tree without changing any session log. */
export function projectConversationTree(
  tree: TreeRecord,
  branchRecords: readonly BranchRecord[],
  sessionLogs: ReadonlyMap<string, SessionLogSnapshot>,
): ConversationTreeProjection {
  const diagnostics: ProjectionDiagnostic[] = []
  const nodes: MessageNodeView[] = []
  const edges: TreeEdgeView[] = []
  const projections = new Map<string, BranchProjectionView>()
  const nodesByMessage = new Map<string, MessageNodeView>()
  const records = new Map(
    branchRecords
      .filter(branch => branch.treeId === tree.treeId)
      .map(branch => [branch.branchId, branch] as const),
  )

  const deletionMemo = new Map<string, boolean>()
  const deletedThroughAncestor = (branch: BranchRecord, visiting = new Set<string>()): boolean => {
    const memo = deletionMemo.get(branch.branchId)
    if (memo !== undefined) return memo
    if (isDirectlyDeleted(branch)) {
      deletionMemo.set(branch.branchId, true)
      return true
    }
    if (branch.parentBranchId === null) {
      deletionMemo.set(branch.branchId, false)
      return false
    }
    if (visiting.has(branch.branchId)) return false
    const parent = records.get(branch.parentBranchId)
    if (parent === undefined) return false
    visiting.add(branch.branchId)
    const result = deletedThroughAncestor(parent, visiting)
    visiting.delete(branch.branchId)
    deletionMemo.set(branch.branchId, result)
    return result
  }

  const rootLog = sessionLogs.get(tree.rootSessionId)
  if (rootLog === undefined) {
    diagnostics.push({
      code: 'root-session-missing',
      sessionId: tree.rootSessionId,
      message: `root session '${tree.rootSessionId}' is unavailable`,
    })
  } else {
    const rootNodes = nodesForSession(tree.treeId, null, [], rootLog, 0)
    nodes.push(...rootNodes)
    edges.push(...sequenceEdges(rootNodes))
    for (const node of rootNodes) nodesByMessage.set(messageKey(node.sessionId, node.messageId), node)
  }

  const building = new Set<string>()
  const buildBranch = (branch: BranchRecord): BranchProjectionView | undefined => {
    if (deletedThroughAncestor(branch)) return undefined
    const existing = projections.get(branch.branchId)
    if (existing !== undefined) return existing
    if (building.has(branch.branchId)) {
      diagnostics.push({
        code: 'branch-cycle',
        branchId: branch.branchId,
        sessionId: branch.sessionId,
        message: `branch '${branch.branchId}' participates in a parent cycle`,
      })
      return undefined
    }

    building.add(branch.branchId)
    let parentProjection: BranchProjectionView | undefined
    if (branch.parentBranchId !== null) {
      const parent = records.get(branch.parentBranchId)
      if (parent === undefined) {
        diagnostics.push({
          code: 'branch-parent-missing',
          branchId: branch.branchId,
          sessionId: branch.sessionId,
          message: `parent branch '${branch.parentBranchId}' is unavailable`,
        })
      } else {
        parentProjection = buildBranch(parent)
      }
    }

    const anchorNode = nodesByMessage.get(messageKey(branch.anchorSessionId, branch.anchorMessageId))
    if (anchorNode === undefined) {
      diagnostics.push({
        code: 'anchor-missing',
        branchId: branch.branchId,
        sessionId: branch.anchorSessionId,
        message: `anchor message '${branch.anchorMessageId}' is unavailable`,
      })
    }

    const pathPrefix = branch.parentBranchId === null
      ? [anchorNode?.localTurnIndex ?? 0]
      : [...(parentProjection?.branchPath ?? [0])]
    const branchPath = Object.freeze([...pathPrefix, branch.siblingOrdinal])
    const log = sessionLogs.get(branch.sessionId)
    let branchNodes: MessageNodeView[] = []
    if (log === undefined) {
      diagnostics.push({
        code: 'branch-session-missing',
        branchId: branch.branchId,
        sessionId: branch.sessionId,
        message: `branch session '${branch.sessionId}' is unavailable`,
      })
    } else {
      if (log.seedLength !== undefined && log.seedLength !== branch.seedLength) {
        diagnostics.push({
          code: 'seed-length-mismatch',
          branchId: branch.branchId,
          sessionId: branch.sessionId,
          message: `branch metadata seed length ${branch.seedLength} does not match session header ${log.seedLength}`,
        })
      }
      const unexpectedToolEvent = log.events.find(event =>
        event.seq >= branch.seedLength
        && (event.type === 'tool/call' || event.type === 'tool/result'))
      if (unexpectedToolEvent !== undefined) {
        diagnostics.push({
          code: 'branch-tool-event',
          branchId: branch.branchId,
          sessionId: branch.sessionId,
          message: `chat-only branch '${branch.branchId}' contains unexpected tool event '${unexpectedToolEvent.type}' at seq ${unexpectedToolEvent.seq}`,
        })
      }
      branchNodes = nodesForSession(tree.treeId, branch.branchId, branchPath, log, branch.seedLength)
      const firstQuestion = branchNodes[0]
      if (firstQuestion?.role === 'user' && branch.anchorRange !== undefined) {
        const visibleQuestion = extractAnchoredQuestion(firstQuestion.text, branch.anchorRange)
        if (visibleQuestion !== firstQuestion.text) {
          branchNodes[0] = {
            ...firstQuestion,
            text: visibleQuestion,
            summary: summarizeMessage(visibleQuestion, 'user'),
          }
        }
      }
      nodes.push(...branchNodes)
      edges.push(...sequenceEdges(branchNodes))
      for (const node of branchNodes) nodesByMessage.set(messageKey(node.sessionId, node.messageId), node)
      const first = branchNodes[0]
      if (anchorNode !== undefined && first !== undefined) {
        edges.push({
          edgeId: `branch:${anchorNode.nodeId}:${first.nodeId}`,
          sourceNodeId: anchorNode.nodeId,
          targetNodeId: first.nodeId,
          kind: 'branch',
        })
      }
    }

    let anchorStatus: BranchProjectionView['anchorStatus'] = anchorNode === undefined ? 'missing' : 'message'
    if (anchorNode !== undefined && branch.anchorRange !== undefined) {
      if (validateAnchorRange(anchorNode.text, branch.anchorRange)) {
        anchorStatus = 'range-valid'
      } else {
        anchorStatus = 'range-invalid'
        diagnostics.push({
          code: 'anchor-range-invalid',
          branchId: branch.branchId,
          sessionId: branch.anchorSessionId,
          message: `text range for branch '${branch.branchId}' no longer matches its anchor message`,
        })
      }
    }

    const projection: BranchProjectionView = {
      record: branch,
      branchPath,
      nodeIds: Object.freeze(branchNodes.map(node => node.nodeId)),
      ...(anchorNode === undefined ? {} : { anchorNodeId: anchorNode.nodeId }),
      anchorStatus,
    }
    projections.set(branch.branchId, projection)
    building.delete(branch.branchId)
    return projection
  }

  const orderedRecords = [...records.values()]
    .sort((left, right) => left.createdAt - right.createdAt || left.branchId.localeCompare(right.branchId))
  for (const branch of orderedRecords) buildBranch(branch)

  return Object.freeze({
    tree,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    branches: Object.freeze(
      orderedRecords
        .map(branch => projections.get(branch.branchId))
        .filter((branch): branch is BranchProjectionView => branch !== undefined),
    ),
    diagnostics: Object.freeze(diagnostics),
  })
}
