import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'

import type {
  BranchCommandErrorCode,
  BranchCommandResult,
  BranchCommandValue,
  ContinueBranchRequest,
  CreateBranchRequest,
  TreeMutationCapabilities,
} from '../shared/remote.ts'
import type { AnchorRange, BranchRecord, TreeRecord } from '../shared/types.ts'
import { formatAnchoredQuestion } from '../shared/anchored-question.ts'
import {
  createReadOnlyForkAgentRc7,
  probeReadOnlyCapabilityRc7,
  ReadOnlyCapabilityError,
  resumeReadOnlyBranchAgentRc7,
  submitBranchTurnRc7,
} from './adapter/read-only.ts'
import { probeNativeContinuationCapability } from './adapter/native-continuation.ts'
import { probeBranchVisibilityRc7 } from './adapter/visibility.ts'
import type { NestedFollowupsMetadataService } from './metadata-service.ts'
import { resolveBranchBoundary } from './safe-boundary.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    nestedFollowupsBranches: NestedFollowupsBranchService
  }

  interface Events {
    'nested-followups/change'(rootSessionId: string): void
  }
}

interface SessionSnapshot {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
}

type BranchReservation =
  | { readonly kind: 'existing'; readonly branch: BranchRecord }
  | { readonly kind: 'created'; readonly branch: BranchRecord }

class BranchCommandError extends Error {
  constructor(
    readonly code: BranchCommandErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BranchCommandError'
  }
}

function commandSuccess(value: BranchCommandValue): BranchCommandResult {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function commandFailure(error: unknown, fallback: BranchCommandErrorCode): BranchCommandResult {
  if (error instanceof ReadOnlyCapabilityError) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: 'compatibility', message: error.message }),
    })
  }
  if (error instanceof BranchCommandError) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: error.code, message: error.message }),
    })
  }
  const message = error instanceof Error ? error.message : String(error)
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code: fallback, message }),
  })
}

function messageText(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n\n')
}

function userMessageById(events: readonly SessionEvent[], messageId: string): SessionEvent<'user/message'> | undefined {
  return events.find((event): event is SessionEvent<'user/message'> =>
    event.type === 'user/message' && String(event.data.id) === messageId)
}

function lastVisibleBranchMessage(
  events: readonly SessionEvent[],
  seedLength: number,
): SessionEvent<'user/message' | 'assistant/message'> | undefined {
  return events.findLast((event): event is SessionEvent<'user/message' | 'assistant/message'> => {
    if (event.seq < seedLength) return false
    if (event.type === 'assistant/message') return true
    return event.type === 'user/message' && event.data.source.kind === 'user'
  })
}

function settledStatus(events: readonly SessionEvent[]): BranchRecord['status'] {
  const ending = events.findLast((event): event is SessionEvent<'turn/end'> => event.type === 'turn/end')
  if (ending === undefined) return 'failed'
  return ending.data.reason.kind === 'completed' || ending.data.reason.kind === 'max-tokens'
    ? 'ready'
    : 'failed'
}

/** Host-owned branch mutation runtime. It never routes through apiproxy. */
export class NestedFollowupsBranchService extends Service {
  static inject = ['agents', 'sessions', 'sessionPersistence', 'nestedFollowupsMetadata']

  private readonly pending = new Map<string, Promise<BranchCommandResult>>()
  private readonly reservationTails = new Map<string, Promise<void>>()
  private readonly handles = new Map<string, AgentHandle>()
  private readonly activityEpochs = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'nestedFollowupsBranches')
  }

  capabilities(): TreeMutationCapabilities {
    const readOnly = probeReadOnlyCapabilityRc7(this.ctx)
    const visibility = probeBranchVisibilityRc7(this.ctx)
    const native = probeNativeContinuationCapability(this.ctx)
    return Object.freeze({
      askFollowUp: readOnly.supported && visibility.supported,
      continueBranch: readOnly.supported && visibility.supported,
      nativeBranchContinuation: native.supported,
      ...readOnly.reason !== undefined
        ? { reason: readOnly.reason }
        : visibility.reason === undefined
          ? {}
          : { reason: visibility.reason },
    })
  }

  createBranch(request: CreateBranchRequest): Promise<BranchCommandResult> {
    return this.runOnce(`create:${request.ownerSessionId}:${request.clientRequestId}`, async () => {
      try {
        this.requireMutationCapability()
        return await this.createBranchChecked(request)
      } catch (error: unknown) {
        return commandFailure(error, 'fork-failed')
      }
    })
  }

  continueBranch(request: ContinueBranchRequest): Promise<BranchCommandResult> {
    return this.runOnce(`continue:${request.branchId}:${request.clientRequestId}`, async () => {
      try {
        this.requireMutationCapability()
        return await this.continueBranchChecked(request)
      } catch (error: unknown) {
        return commandFailure(error, 'prompt-failed')
      }
    })
  }

  private get metadata(): NestedFollowupsMetadataService {
    return this.ctx.nestedFollowupsMetadata
  }

  private requireMutationCapability(): void {
    const capability = probeReadOnlyCapabilityRc7(this.ctx)
    if (!capability.supported) {
      throw new BranchCommandError('compatibility', capability.reason ?? 'Read-only branches are unavailable.')
    }
    const visibility = probeBranchVisibilityRc7(this.ctx)
    if (!visibility.supported) {
      throw new BranchCommandError('compatibility', visibility.reason ?? 'Hidden branches are unavailable.')
    }
  }

  private runOnce(
    key: string,
    operation: () => Promise<BranchCommandResult>,
  ): Promise<BranchCommandResult> {
    const current = this.pending.get(key)
    if (current !== undefined) return current
    const pending = operation().finally(() => {
      if (this.pending.get(key) === pending) this.pending.delete(key)
    })
    this.pending.set(key, pending)
    return pending
  }

  private async createBranchChecked(request: CreateBranchRequest): Promise<BranchCommandResult> {
    const source = await this.readSession(request.anchor.sessionId)
    const { tree, parentBranch } = await this.resolveTree(
      request.ownerSessionId,
      request.anchor.sessionId,
      source.header,
    )
    let boundary
    try {
      boundary = resolveBranchBoundary(source.events, request.anchor.messageId)
    } catch (error: unknown) {
      throw new BranchCommandError(
        'anchor-invalid',
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )
    }
    if (boundary.selectedSeq !== request.anchor.seq) {
      throw new BranchCommandError(
        'anchor-invalid',
        `anchor seq ${request.anchor.seq} does not identify message '${request.anchor.messageId}'`,
      )
    }
    const anchorRange = this.validateRange(request.anchor.range, source.events, boundary)
    const prompt = formatAnchoredQuestion(request.question, anchorRange)
    const reservation = await this.withReservationLock(
      [
        tree.treeId,
        parentBranch?.branchId ?? '',
        String(source.header.id),
        boundary.anchorMessageId,
      ].join('\u0000'),
      async (): Promise<BranchReservation> => {
        const existing = this.metadata.repository.getBranchByClientRequest(
          tree.treeId,
          request.clientRequestId,
        )
        if (existing !== undefined) return { kind: 'existing', branch: existing }

        const now = Date.now()
        const record: BranchRecord = {
          branchId: `branch-${randomUUID()}`,
          clientRequestId: request.clientRequestId,
          treeId: tree.treeId,
          sessionId: String(SessionId(randomUUID())),
          parentSessionId: String(source.header.id),
          parentBranchId: parentBranch?.branchId ?? null,
          anchorSessionId: String(source.header.id),
          anchorMessageId: boundary.anchorMessageId,
          anchorSeq: boundary.anchorSeq,
          forkBoundarySeq: boundary.forkBoundarySeq,
          seedLength: boundary.seedLength,
          ...(anchorRange === undefined ? {} : { anchorRange }),
          siblingOrdinal: this.metadata.repository.nextSiblingOrdinal(
            tree.treeId,
            parentBranch?.branchId ?? null,
            String(source.header.id),
            boundary.anchorMessageId,
          ),
          createdAt: now,
          status: 'creating',
        }
        await this.metadata.repository.putBranch(record)
        return { kind: 'created', branch: record }
      },
    )
    if (reservation.kind === 'existing') {
      this.assertMatchingCreateRetry(reservation.branch, request, boundary, anchorRange)
      return this.recoverExistingCreate(
        reservation.branch,
        source.header,
        boundary.seed,
        prompt,
        tree.rootSessionId,
      )
    }

    const record = reservation.branch
    const branchId = record.branchId
    const childSessionId = SessionId(record.sessionId)
    this.notify(tree.rootSessionId)
    let handle: AgentHandle | undefined
    try {
      const sourceAgentOptions = this.ctx.agents.get(source.header.id)?.options
      handle = await createReadOnlyForkAgentRc7(this.ctx, this.ctx.agents, {
        sessionId: childSessionId,
        sourceHeader: source.header,
        seed: boundary.seed,
        ...sourceAgentOptions === undefined ? {} : { fallbackAgentOptions: sourceAgentOptions },
      })
      this.rememberHandle(handle)
    } catch (error: unknown) {
      await this.metadata.repository.deleteBranchRecord(branchId)
      this.notify(tree.rootSessionId)
      throw new BranchCommandError(
        'fork-failed',
        `could not create branch session: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }

    await this.metadata.repository.putBranch({ ...record, status: 'running' })
    this.notify(tree.rootSessionId)
    try {
      const activityEpoch = this.beginActivity(handle)
      const messageId = submitBranchTurnRc7(
        handle.agent,
        prompt,
        request.clientRequestId,
      )
      void this.observeSettlement(handle, branchId, tree.rootSessionId, activityEpoch)
      return commandSuccess({
        action: 'create-branch',
        branchId,
        sessionId: String(childSessionId),
        messageId,
      })
    } catch (error: unknown) {
      await this.metadata.repository.putBranch({ ...record, status: 'failed' })
      this.notify(tree.rootSessionId)
      await this.releaseHandle(handle)
      throw new BranchCommandError(
        'prompt-failed',
        `branch was created but the first prompt was not accepted: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  private async continueBranchChecked(request: ContinueBranchRequest): Promise<BranchCommandResult> {
    const branch = this.metadata.repository.getBranch(request.branchId)
    if (branch === undefined || branch.status === 'deleted' || branch.deletedAt !== undefined) {
      throw new BranchCommandError('branch-not-found', `branch '${request.branchId}' does not exist`)
    }
    const tree = this.metadata.repository.getTree(branch.treeId)
    if (tree === undefined || !this.ownerBelongsToTree(request.ownerSessionId, tree)) {
      throw new BranchCommandError('tree-mismatch', 'the requested branch is not owned by this conversation tree')
    }
    if (request.tail.sessionId !== branch.sessionId) {
      throw new BranchCommandError('branch-not-tail', 'Continue must target the current branch session')
    }

    const snapshot = await this.readSession(branch.sessionId)
    this.assertBranchHeader(branch, snapshot.header)
    const duplicate = userMessageById(snapshot.events, request.clientRequestId)
    if (duplicate !== undefined) {
      if (messageText(duplicate.data.content) !== request.question) {
        throw new BranchCommandError(
          'request-conflict',
          `client request '${request.clientRequestId}' was already used with different content`,
        )
      }
      return commandSuccess({
        action: 'continue-branch',
        branchId: branch.branchId,
        sessionId: branch.sessionId,
        messageId: request.clientRequestId,
      })
    }

    const tail = lastVisibleBranchMessage(snapshot.events, branch.seedLength)
    if (tail?.type !== 'assistant/message'
      || String(tail.data.message.id) !== request.tail.messageId
      || tail.seq !== request.tail.seq) {
      throw new BranchCommandError(
        'branch-not-tail',
        'Continue is only available on the latest completed assistant message in a branch',
      )
    }
    try {
      const boundary = resolveBranchBoundary(snapshot.events, request.tail.messageId)
      if (boundary.selectedSeq !== request.tail.seq || boundary.anchorMessageId !== request.tail.messageId) {
        throw new Error('the selected message is not the completed turn tail')
      }
    } catch (error: unknown) {
      throw new BranchCommandError(
        'branch-not-tail',
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )
    }

    const liveAgent = this.ctx.agents.get(SessionId(branch.sessionId))
    let handle: AgentHandle
    if (liveAgent === undefined) {
      handle = await resumeReadOnlyBranchAgentRc7(this.ctx, this.ctx.agents, {
        sessionId: SessionId(branch.sessionId),
        header: snapshot.header,
        events: snapshot.events,
      })
      this.rememberHandle(handle)
    } else {
      this.assertBranchHeader(branch, liveAgent.session.header)
      handle = this.requireOwnedHandle(liveAgent)
    }
    const agent = handle.agent
    this.assertBranchHeader(branch, agent.session.header)
    if (agent.status !== 'idle') {
      throw new BranchCommandError('branch-busy', 'wait for the current branch turn to finish before continuing')
    }

    await this.metadata.repository.putBranch({ ...branch, status: 'running' })
    this.notify(tree.rootSessionId)
    try {
      const activityEpoch = this.beginActivity(handle)
      const messageId = submitBranchTurnRc7(agent, request.question, request.clientRequestId)
      void this.observeSettlement(handle, branch.branchId, tree.rootSessionId, activityEpoch)
      return commandSuccess({
        action: 'continue-branch',
        branchId: branch.branchId,
        sessionId: branch.sessionId,
        messageId,
      })
    } catch (error: unknown) {
      await this.metadata.repository.putBranch({ ...branch, status: 'failed' })
      this.notify(tree.rootSessionId)
      await this.releaseHandle(handle)
      throw new BranchCommandError(
        'prompt-failed',
        `the continuation prompt was not accepted: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  private async readSession(sessionId: string): Promise<SessionSnapshot> {
    const live = this.ctx.sessions.get(SessionId(sessionId))
    if (live !== undefined) return { header: live.header, events: live.events }
    try {
      const stored = await this.ctx.sessionPersistence.inspect(SessionId(sessionId))
      return { header: stored.meta, events: stored.events }
    } catch (error: unknown) {
      throw new BranchCommandError(
        'session-not-found',
        `session '${sessionId}' could not be loaded`,
        { cause: error },
      )
    }
  }

  /**
   * Serialize only the durable ordinal reservation for one anchor. Agent
   * creation and generation happen after this critical section, so sibling
   * branches still stream independently.
   */
  private async withReservationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.reservationTails.get(key) ?? Promise.resolve()
    let release: (() => void) | undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    this.reservationTails.set(key, current)
    await previous
    try {
      return await operation()
    } finally {
      release?.()
      if (this.reservationTails.get(key) === current) this.reservationTails.delete(key)
    }
  }

  private assertMatchingCreateRetry(
    existing: BranchRecord,
    request: CreateBranchRequest,
    boundary: ReturnType<typeof resolveBranchBoundary>,
    anchorRange: AnchorRange | undefined,
  ): void {
    const storedRange = existing.anchorRange
    const rangeMatches = storedRange === undefined
      ? anchorRange === undefined
      : anchorRange !== undefined
        && storedRange.start === anchorRange.start
        && storedRange.end === anchorRange.end
        && storedRange.text === anchorRange.text
    if (existing.status === 'deleted'
      || existing.deletedAt !== undefined
      || existing.parentSessionId !== request.anchor.sessionId
      || existing.anchorSessionId !== request.anchor.sessionId
      || existing.anchorMessageId !== boundary.anchorMessageId
      || existing.anchorSeq !== boundary.anchorSeq
      || existing.forkBoundarySeq !== boundary.forkBoundarySeq
      || existing.seedLength !== boundary.seedLength
      || !rangeMatches) {
      throw new BranchCommandError(
        'request-conflict',
        `client request '${request.clientRequestId}' was already used for a different branch operation`,
      )
    }
  }

  private async recoverExistingCreate(
    branch: BranchRecord,
    sourceHeader: SessionHeader,
    seed: readonly SessionEvent[],
    prompt: string,
    rootSessionId: string,
  ): Promise<BranchCommandResult> {
    let snapshot: SessionSnapshot | undefined
    try {
      snapshot = await this.readSession(branch.sessionId)
    } catch (error: unknown) {
      if (!(error instanceof BranchCommandError) || error.code !== 'session-not-found') throw error
    }

    if (snapshot !== undefined) {
      this.assertBranchHeader(branch, snapshot.header)
      const duplicate = userMessageById(snapshot.events, branch.clientRequestId)
      if (duplicate !== undefined) {
        if (messageText(duplicate.data.content) !== prompt) {
          throw new BranchCommandError(
            'request-conflict',
            `client request '${branch.clientRequestId}' was already used with different content`,
          )
        }
        return commandSuccess({
          action: 'create-branch',
          branchId: branch.branchId,
          sessionId: branch.sessionId,
          messageId: branch.clientRequestId,
        })
      }
      const otherLocalPrompt = snapshot.events.find(event =>
        event.seq >= branch.seedLength
        && event.type === 'user/message'
        && event.data.source.kind === 'user')
      if (otherLocalPrompt !== undefined) {
        throw new BranchCommandError(
          'request-conflict',
          `branch '${branch.branchId}' already contains another first prompt`,
        )
      }
    }

    const liveAgent = this.ctx.agents.get(SessionId(branch.sessionId))
    let handle: AgentHandle
    if (liveAgent === undefined) {
      const sourceAgentOptions = this.ctx.agents.get(sourceHeader.id)?.options
      handle = snapshot === undefined
        ? await createReadOnlyForkAgentRc7(this.ctx, this.ctx.agents, {
          sessionId: SessionId(branch.sessionId),
          sourceHeader,
          seed,
          ...sourceAgentOptions === undefined ? {} : { fallbackAgentOptions: sourceAgentOptions },
        })
        : await resumeReadOnlyBranchAgentRc7(this.ctx, this.ctx.agents, {
          sessionId: SessionId(branch.sessionId),
          header: snapshot.header,
          events: snapshot.events,
        })
      this.rememberHandle(handle)
    } else {
      handle = this.requireOwnedHandle(liveAgent)
    }
    const agent = handle.agent
    this.assertBranchHeader(branch, agent.session.header)
    if (agent.status !== 'idle') {
      throw new BranchCommandError('branch-busy', 'wait for the current branch turn to finish before retrying')
    }

    await this.metadata.repository.putBranch({ ...branch, status: 'running' })
    this.notify(rootSessionId)
    try {
      const activityEpoch = this.beginActivity(handle)
      const messageId = submitBranchTurnRc7(agent, prompt, branch.clientRequestId)
      void this.observeSettlement(handle, branch.branchId, rootSessionId, activityEpoch)
      return commandSuccess({
        action: 'create-branch',
        branchId: branch.branchId,
        sessionId: branch.sessionId,
        messageId,
      })
    } catch (error: unknown) {
      await this.metadata.repository.putBranch({ ...branch, status: 'failed' })
      this.notify(rootSessionId)
      await this.releaseHandle(handle)
      throw new BranchCommandError(
        'prompt-failed',
        `the recovered branch did not accept its first prompt: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  private assertBranchHeader(branch: BranchRecord, header: SessionHeader): void {
    if (String(header.id) !== branch.sessionId
      || header.origin !== 'subagent'
      || String(header.parentSession) !== branch.parentSessionId
      || header.seedLength !== branch.seedLength) {
      throw new BranchCommandError(
        'tree-mismatch',
        `session '${branch.sessionId}' no longer matches its immutable branch lineage`,
      )
    }
  }

  private async resolveTree(
    ownerSessionId: string,
    anchorSessionId: string,
    anchorHeader: SessionHeader,
  ): Promise<{ tree: TreeRecord; parentBranch: BranchRecord | undefined }> {
    const repository = this.metadata.repository
    const ownerBranch = repository.getBranchBySession(ownerSessionId)
    let tree = ownerBranch === undefined
      ? repository.getTreeByRootSession(ownerSessionId)
      : repository.getTree(ownerBranch.treeId)
    const parentBranch = repository.getBranchBySession(anchorSessionId)

    if (tree === undefined) {
      if (ownerSessionId !== anchorSessionId || anchorHeader.origin === 'subagent') {
        throw new BranchCommandError('tree-mismatch', 'the anchor is not owned by the requested root conversation')
      }
      tree = await repository.putTree({
        treeId: ownerSessionId,
        rootSessionId: ownerSessionId,
        version: 1,
        createdAt: anchorHeader.createdAt,
        updatedAt: Date.now(),
      })
    }

    const anchorBelongs = parentBranch === undefined
      ? anchorSessionId === tree.rootSessionId
      : parentBranch.treeId === tree.treeId
    if (!anchorBelongs) {
      throw new BranchCommandError('tree-mismatch', 'the anchor belongs to another conversation tree')
    }
    return { tree, parentBranch }
  }

  private ownerBelongsToTree(ownerSessionId: string, tree: TreeRecord): boolean {
    if (ownerSessionId === tree.rootSessionId) return true
    return this.metadata.repository.getBranchBySession(ownerSessionId)?.treeId === tree.treeId
  }

  private validateRange(
    range: CreateBranchRequest['anchor']['range'],
    events: readonly SessionEvent[],
    boundary: ReturnType<typeof resolveBranchBoundary>,
  ): AnchorRange | undefined {
    if (range === undefined) return undefined
    if (boundary.snappedToTurnTail) {
      throw new BranchCommandError('anchor-invalid', 'a text range cannot be retained when the anchor snaps to the turn tail')
    }
    const selected = events.find((event): event is SessionEvent<'assistant/message'> =>
      event.type === 'assistant/message' && String(event.data.message.id) === boundary.anchorMessageId)
    const text = selected === undefined ? undefined : messageText(selected.data.message.content)
    if (text === undefined
      || range.start >= range.end
      || range.end > text.length
      || text.slice(range.start, range.end) !== range.text) {
      throw new BranchCommandError('anchor-invalid', 'the selected text range no longer matches the persisted Markdown source')
    }
    return { start: range.start, end: range.end, text: range.text }
  }

  private rememberHandle(handle: AgentHandle): void {
    const sessionId = String(handle.agent.id)
    const current = this.handles.get(sessionId)
    if (current !== undefined && current !== handle) {
      throw new BranchCommandError('branch-busy', `branch session '${sessionId}' already has an owned runtime`)
    }
    this.handles.set(sessionId, handle)
  }

  private requireOwnedHandle(agent: Agent): AgentHandle {
    const handle = this.handles.get(String(agent.id))
    if (handle === undefined || handle.agent !== agent) {
      throw new BranchCommandError(
        'branch-busy',
        'this branch is open in the native session runtime; close it before continuing in Tree View',
      )
    }
    return handle
  }

  private beginActivity(handle: AgentHandle): number {
    this.rememberHandle(handle)
    const sessionId = String(handle.agent.id)
    const epoch = (this.activityEpochs.get(sessionId) ?? 0) + 1
    this.activityEpochs.set(sessionId, epoch)
    return epoch
  }

  private async releaseHandle(handle: AgentHandle): Promise<void> {
    const sessionId = String(handle.agent.id)
    if (this.handles.get(sessionId) !== handle) return
    try {
      await handle.dispose()
      this.handles.delete(sessionId)
      this.activityEpochs.delete(sessionId)
    } catch (error: unknown) {
      this.ctx.logger.warn(`branch session '${sessionId}' could not be detached: ${String(error)}`)
    }
  }

  private async observeSettlement(
    handle: AgentHandle,
    branchId: string,
    rootSessionId: string,
    activityEpoch: number,
  ): Promise<void> {
    const agent = handle.agent
    const sessionId = String(agent.id)
    try {
      await agent.whenIdle()
      if (this.activityEpochs.get(sessionId) !== activityEpoch) return
      const current = this.metadata.repository.getBranch(branchId)
      if (current === undefined || current.status === 'deleted' || current.deletedAt !== undefined) return
      await this.metadata.repository.putBranch({
        ...current,
        status: settledStatus(agent.session.events),
      })
      this.notify(rootSessionId)
    } catch (error: unknown) {
      this.ctx.logger.warn(`branch '${branchId}' settlement could not be recorded: ${String(error)}`)
    } finally {
      if (this.activityEpochs.get(sessionId) === activityEpoch && agent.status === 'idle') {
        await this.releaseHandle(handle)
      }
    }
  }

  private notify(rootSessionId: string): void {
    this.ctx.emit('nested-followups/change', rootSessionId)
  }
}
